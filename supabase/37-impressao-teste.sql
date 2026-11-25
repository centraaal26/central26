-- Central 26 · 37 · Etiqueta de teste para a estação de impressão
-- Permite testar a impressão automática de qualquer aparelho sem criar um envio na Nacex.

alter table public.log_impressoes alter column encomenda_id drop not null;
alter table public.log_impressoes add column if not exists tipo text not null default 'nacex';
do $$ begin
  alter table public.log_impressoes add constraint log_impressoes_tipo check (tipo in ('nacex', 'teste'));
exception when duplicate_object then null; end $$;

create or replace function public.imp_teste() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.pode_encomendas() then raise exception 'Sem permissão.'; end if;
  if public.imp_estacao_ativa() is null then raise exception 'Nenhum computador está a imprimir as etiquetas neste momento.'; end if;
  insert into public.log_impressoes (tipo, pedido_por) values ('teste', auth.uid());
  return true;
end $$;

create or replace function public.imp_reclamar(p_nome text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.log_impressoes; v_num int; v_por text;
begin
  if not public.pode_encomendas() then raise exception 'Sem permissão.'; end if;
  update public.log_impressoes set estado = 'pendente', estacao = null, reclamado_em = null
   where estado = 'a_imprimir' and impressa_em is null and reclamado_em < now() - interval '5 minutes'
     and pedido_em > now() - interval '2 hours';
  select * into v from public.log_impressoes
   where estado = 'pendente' and pedido_em > now() - interval '2 hours'
   order by pedido_em limit 1 for update skip locked;
  if v.id is null then return null; end if;
  update public.log_impressoes set estado = 'a_imprimir', estacao = left(trim(p_nome), 60), reclamado_em = now() where id = v.id;
  select numero into v_num from public.log_encomendas where id = v.encomenda_id;
  select nome into v_por from public.perfis where id = v.pedido_por;
  return jsonb_build_object('id', v.id, 'tipo', v.tipo, 'encomenda_id', v.encomenda_id, 'numero', v_num, 'por', v_por, 'pedido_em', v.pedido_em);
end $$;

revoke execute on function public.imp_teste() from public, anon;
grant execute on function public.imp_teste() to authenticated;
