-- =====================================================================
-- Central 26 · 14 · Assistente (IA) para cada departamento
-- Correr uma vez no Supabase: SQL Editor → New query → colar tudo → Run
-- Pode voltar a ser corrido sem apagar dados. Corre-se depois do 13.
--
-- As conversas são privadas: cada pessoa só vê as suas (nem a direção as lê).
-- O assistente só consulta o que a própria pessoa já pode ver na app.
-- A direção define se está ligado e o limite mensal de utilização por pessoa.
-- =====================================================================

create table if not exists public.ia_conversas (
  id            uuid primary key default gen_random_uuid(),
  perfil_id     uuid not null references public.perfis(id) on delete cascade default auth.uid(),
  titulo        text not null default 'Nova conversa',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists ia_conversas_perfil on public.ia_conversas (perfil_id, atualizado_em desc);

create table if not exists public.ia_mensagens (
  id           bigint generated always as identity primary key,
  conversa_id  uuid not null references public.ia_conversas(id) on delete cascade,
  papel        text not null check (papel in ('user','assistant')),
  texto        text not null default '',
  ferramentas  text[] not null default '{}',     -- o que o assistente consultou para responder
  tokens_in    int not null default 0,
  tokens_out   int not null default 0,
  criado_em    timestamptz not null default now()
);
create index if not exists ia_mensagens_conversa on public.ia_mensagens (conversa_id, id);

create table if not exists public.ia_uso (
  perfil_id   uuid not null references public.perfis(id) on delete cascade,
  mes         text not null,                      -- AAAA-MM
  pedidos     int not null default 0,
  tokens_in   bigint not null default 0,
  tokens_out  bigint not null default 0,
  primary key (perfil_id, mes)
);

create table if not exists public.ia_config (
  id              int primary key default 1 check (id = 1),
  ativo           boolean not null default true,
  limite_mensal   int not null default 400 check (limite_mensal between 0 and 100000),  -- pedidos por pessoa e por mês
  atualizado_em   timestamptz not null default now()
);
insert into public.ia_config (id) values (1) on conflict do nothing;

alter table public.ia_conversas enable row level security;
alter table public.ia_mensagens enable row level security;
alter table public.ia_uso       enable row level security;
alter table public.ia_config    enable row level security;

drop policy if exists ia_conversas_proprias on public.ia_conversas;
create policy ia_conversas_proprias on public.ia_conversas for select to authenticated using (perfil_id = auth.uid());
drop policy if exists ia_conversas_mudar on public.ia_conversas;
create policy ia_conversas_mudar on public.ia_conversas for update to authenticated using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());
drop policy if exists ia_conversas_apagar on public.ia_conversas;
create policy ia_conversas_apagar on public.ia_conversas for delete to authenticated using (perfil_id = auth.uid());
drop policy if exists ia_mensagens_proprias on public.ia_mensagens;
create policy ia_mensagens_proprias on public.ia_mensagens for select to authenticated
  using (exists (select 1 from public.ia_conversas c where c.id = conversa_id and c.perfil_id = auth.uid()));
drop policy if exists ia_uso_ver on public.ia_uso;
create policy ia_uso_ver on public.ia_uso for select to authenticated using (perfil_id = auth.uid() or public.e_gestor());
drop policy if exists ia_config_ver on public.ia_config;
create policy ia_config_ver on public.ia_config for select to authenticated using (public.e_membro());
drop policy if exists ia_config_mudar on public.ia_config;
create policy ia_config_mudar on public.ia_config for update to authenticated using (public.e_gestor()) with check (public.e_gestor());

revoke all on public.ia_conversas, public.ia_mensagens, public.ia_uso, public.ia_config from anon;
grant select, update, delete on public.ia_conversas to authenticated;
grant select on public.ia_mensagens, public.ia_uso to authenticated;
grant select, update on public.ia_config to authenticated;
-- as mensagens e a utilização são escritas pela função «assistente» (no servidor)

-- Soma a utilização do mês (chamada só pela função «assistente», no servidor)
create or replace function public.ia_registar_uso(p_perfil uuid, p_mes text, p_in int, p_out int) returns void
language sql security definer set search_path = public as $$
  insert into public.ia_uso (perfil_id, mes, pedidos, tokens_in, tokens_out) values (p_perfil, p_mes, 1, p_in, p_out)
  on conflict (perfil_id, mes) do update set pedidos = ia_uso.pedidos + 1, tokens_in = ia_uso.tokens_in + excluded.tokens_in, tokens_out = ia_uso.tokens_out + excluded.tokens_out
$$;

-- Permissões das funções (só com sessão iniciada; as internas ficam fechadas)
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as assinatura from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke execute on function %s from public, anon', f.assinatura);
    execute format('grant execute on function %s to authenticated, service_role', f.assinatura);
  end loop;
end $$;
revoke execute on function public.chat_notificar(uuid, uuid, text, text) from authenticated;
revoke execute on function public.agenda_lembretes() from authenticated;
revoke execute on function public.gerar_password_temporaria() from authenticated;
revoke execute on function public.stk_lembretes() from authenticated;
revoke execute on function public.stk_avisar(uuid) from authenticated;
revoke execute on function public.stk_ajustar(uuid, int, text) from authenticated;
revoke execute on function public.lembrar_copia() from authenticated;
revoke execute on function public.ia_registar_uso(uuid, text, int, int) from authenticated;
