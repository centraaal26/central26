-- Central 26 · 36 · Impressão automática das etiquetas da Nacex
-- Um computador ao lado da impressora fica como «estação de impressão» (Logística → Encomendas → Impressão automática).
-- Quando alguém cria um envio na Nacex, em qualquer aparelho, a base de dados põe a etiqueta na fila e a estação imprime-a.
-- Só entra na fila se houver uma estação ligada nos últimos 3 minutos; pedidos com mais de 2 horas são ignorados.

create table if not exists public.log_estacoes (
  nome text primary key,
  perfil_id uuid references auth.users(id) on delete set null,
  visto_em timestamptz not null default now()
);

create table if not exists public.log_impressoes (
  id bigint generated always as identity primary key,
  encomenda_id uuid not null references public.log_encomendas(id) on delete cascade,
  estado text not null default 'pendente' check (estado in ('pendente', 'a_imprimir', 'impressa', 'erro')),
  pedido_por uuid references auth.users(id) on delete set null,
  pedido_em timestamptz not null default now(),
  estacao text,
  reclamado_em timestamptz,
  impressa_em timestamptz,
  erro text
);
create index if not exists log_impressoes_fila on public.log_impressoes (estado, pedido_em);

alter table public.log_estacoes enable row level security;
alter table public.log_impressoes enable row level security;
drop policy if exists log_estacoes_ver on public.log_estacoes;
create policy log_estacoes_ver on public.log_estacoes for select to authenticated using (public.pode_encomendas());
drop policy if exists log_impressoes_ver on public.log_impressoes;
create policy log_impressoes_ver on public.log_impressoes for select to authenticated using (public.pode_encomendas());
-- ler: quem trata de encomendas; escrever: só pelas funções abaixo
grant select on public.log_estacoes, public.log_impressoes to authenticated;
revoke insert, update, delete on public.log_estacoes, public.log_impressoes from anon, authenticated;
revoke all on public.log_estacoes, public.log_impressoes from anon;

create or replace function public.imp_estacao_ativa() returns text
language sql stable security definer set search_path = public as $$
  select nome from public.log_estacoes where visto_em > now() - interval '3 minutes' order by visto_em desc limit 1
$$;

-- Estado para o ecrã: que estação está ligada (ou nenhuma)
create or replace function public.imp_estado() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pode_encomendas() then raise exception 'Sem permissão.'; end if;
  return jsonb_build_object('estacao', public.imp_estacao_ativa());
end $$;

-- A estação avisa que está ligada (de minuto a minuto)
create or replace function public.imp_batimento(p_nome text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.pode_encomendas() then raise exception 'Sem permissão.'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Falta o nome da estação.'; end if;
  insert into public.log_estacoes (nome, perfil_id, visto_em) values (left(trim(p_nome), 60), auth.uid(), now())
  on conflict (nome) do update set perfil_id = excluded.perfil_id, visto_em = now();
end $$;

create or replace function public.imp_desligar(p_nome text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.pode_encomendas() then raise exception 'Sem permissão.'; end if;
  delete from public.log_estacoes where nome = left(trim(p_nome), 60);
end $$;

-- Mandar uma etiqueta para a estação (por exemplo, a partir do telemóvel)
create or replace function public.imp_pedir(p_encomenda uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.pode_encomendas() then raise exception 'Sem permissão.'; end if;
  if public.imp_estacao_ativa() is null then raise exception 'Nenhum computador está a imprimir as etiquetas neste momento.'; end if;
  if not exists (select 1 from public.log_encomendas where id = p_encomenda and coalesce(nacex->>'expe_codigo', '') <> '') then
    raise exception 'Esta encomenda ainda não tem envio criado na Nacex.';
  end if;
  insert into public.log_impressoes (encomenda_id, pedido_por) values (p_encomenda, auth.uid());
  return true;
end $$;

-- A estação fica com o próximo pedido (um de cada vez; duas estações nunca imprimem o mesmo)
create or replace function public.imp_reclamar(p_nome text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.log_impressoes; v_num int;
begin
  if not public.pode_encomendas() then raise exception 'Sem permissão.'; end if;
  -- pedidos presos (a estação fechou a meio) voltam à fila
  update public.log_impressoes set estado = 'pendente', estacao = null, reclamado_em = null
   where estado = 'a_imprimir' and impressa_em is null and reclamado_em < now() - interval '5 minutes'
     and pedido_em > now() - interval '2 hours';
  select * into v from public.log_impressoes
   where estado = 'pendente' and pedido_em > now() - interval '2 hours'
   order by pedido_em limit 1 for update skip locked;
  if v.id is null then return null; end if;
  update public.log_impressoes set estado = 'a_imprimir', estacao = left(trim(p_nome), 60), reclamado_em = now() where id = v.id;
  select numero into v_num from public.log_encomendas where id = v.encomenda_id;
  return jsonb_build_object('id', v.id, 'encomenda_id', v.encomenda_id, 'numero', v_num);
end $$;

create or replace function public.imp_concluir(p_id bigint, p_erro text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.pode_encomendas() then raise exception 'Sem permissão.'; end if;
  update public.log_impressoes
     set estado = case when coalesce(p_erro, '') = '' then 'impressa' else 'erro' end,
         impressa_em = now(), erro = nullif(left(coalesce(p_erro, ''), 300), '')
   where id = p_id;
end $$;

-- Envio novo na Nacex → etiqueta na fila, se houver estação ligada
create or replace function public.log_imp_auto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.nacex->>'expe_codigo', '') <> ''
     and coalesce(new.nacex->>'expe_codigo', '') is distinct from coalesce(old.nacex->>'expe_codigo', '')
     and public.imp_estacao_ativa() is not null then
    insert into public.log_impressoes (encomenda_id, pedido_por) values (new.id, auth.uid());
  end if;
  return new;
exception when others then
  raise warning 'Falha ao pôr a etiqueta na fila: %', sqlerrm;
  return new;
end $$;

drop trigger if exists log_imp_auto on public.log_encomendas;
create trigger log_imp_auto after update of nacex on public.log_encomendas
  for each row execute function public.log_imp_auto();

revoke all on function public.log_imp_auto() from public, anon, authenticated;
revoke all on function public.imp_estacao_ativa() from public, anon;
grant execute on function public.imp_estado(), public.imp_batimento(text), public.imp_desligar(text), public.imp_pedir(uuid),
  public.imp_reclamar(text), public.imp_concluir(bigint, text) to authenticated;
revoke execute on function public.imp_estado(), public.imp_batimento(text), public.imp_desligar(text), public.imp_pedir(uuid),
  public.imp_reclamar(text), public.imp_concluir(bigint, text) from public, anon;

do $$ begin
  begin execute 'alter publication supabase_realtime add table public.log_impressoes'; exception when others then null; end;
end $$;
