-- =====================================================================
-- Central 26 · 13 · Encomendas ligadas aos Stocks e cópias de segurança
-- Correr uma vez no Supabase: SQL Editor → New query → colar tudo → Run
-- Pode voltar a ser corrido sem apagar dados. Corre-se depois do 12.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Encomendas → Stocks
-- Cada artigo de uma encomenda pode estar ligado a um produto dos Stocks (itens[].produto_id).
-- Quando a encomenda fica «Pronta» (sai da prateleira), o stock desses produtos desce.
-- Se voltar atrás (nova ou em preparação) ou for cancelada, o stock volta a entrar.
-- Se os artigos mudarem depois disso, só a diferença é acertada.
-- stock_movido guarda o que já saiu: { "<produto_id>": quantidade }
-- ---------------------------------------------------------------------
alter table public.log_encomendas add column if not exists stock_movido jsonb;

-- Acerta um produto em p_delta unidades (negativo = sai). Devolve o que foi mesmo acertado.
create or replace function public.stk_ajustar(p_produto uuid, p_delta int, p_nota text) returns int
language plpgsql security definer set search_path = public as $$
declare pr public.stk_produtos; v_novo int; v_feito int; v_nota text := p_nota;
begin
  if p_delta = 0 then return 0; end if;
  select * into pr from public.stk_produtos where id = p_produto for update;
  if pr.id is null or pr.quantidade is null then return 0; end if;   -- produto por contar: não mexe
  v_novo := greatest(0, pr.quantidade + p_delta);
  v_feito := v_novo - pr.quantidade;
  if v_feito = 0 then return 0; end if;
  if p_delta < 0 and -p_delta > pr.quantidade then v_nota := v_nota || ' · faltavam ' || (-p_delta - pr.quantidade); end if;
  perform set_config('central26.movimento', '1', true);
  insert into public.stk_movimentos (produto_id, tipo, quantidade, antes, depois, nota)
  values (pr.id, case when v_feito < 0 then 'saida' else 'entrada' end, abs(v_feito), pr.quantidade, v_novo, left(v_nota, 200));
  update public.stk_produtos set quantidade = v_novo where id = pr.id returning * into pr;
  if pr.alerta = 'alerta' and pr.ultimo_aviso is null then perform public.stk_avisar(pr.id); end if;
  if pr.alerta = 'ok' then delete from public.notificacoes where link = '#stock-' || pr.id and not lida; end if;
  return v_feito;
end $$;

create or replace function public.log_encomendas_stock() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_alvo jsonb := '{}'::jsonb;
  v_atual jsonb := coalesce(case when tg_op = 'UPDATE' then old.stock_movido end, '{}'::jsonb);
  v_novo jsonb := '{}'::jsonb;
  v_ref text := 'E-' || lpad(new.numero::text, 4, '0');
  k text; v_quer int; v_tem int; v_feito int;
begin
  if to_regclass('public.stk_produtos') is null then return new; end if;
  -- o que deve ter saído do stock neste estado
  if new.estado in ('pronta','em_rota','entregue') then
    select coalesce(jsonb_object_agg(pid, q), '{}'::jsonb) into v_alvo from (
      select i->>'produto_id' as pid, sum(greatest(coalesce(nullif(i->>'qtd','')::numeric, 1), 0))::int as q
        from jsonb_array_elements(coalesce(new.itens, '[]'::jsonb)) i
       where coalesce(i->>'produto_id', '') ~ '^[0-9a-f-]{36}$'
       group by 1) x;
  end if;
  if v_alvo = v_atual then new.stock_movido := nullif(v_atual, '{}'::jsonb); return new; end if;
  for k in select jsonb_object_keys(v_alvo) union select jsonb_object_keys(v_atual) loop
    v_quer := coalesce((v_alvo->>k)::int, 0);
    v_tem := coalesce((v_atual->>k)::int, 0);
    v_feito := 0;
    if v_quer <> v_tem then
      v_feito := -public.stk_ajustar(k::uuid, -(v_quer - v_tem),
        case when v_quer > v_tem then 'Encomenda ' || v_ref || ' · ' || new.cliente_nome
             when new.estado = 'cancelada' then 'Encomenda ' || v_ref || ' cancelada'
             else 'Encomenda ' || v_ref || ' alterada' end);
    end if;
    if v_tem + v_feito <> 0 then v_novo := v_novo || jsonb_build_object(k, v_tem + v_feito); end if;
  end loop;
  new.stock_movido := nullif(v_novo, '{}'::jsonb);
  return new;
end $$;
-- corre depois de log_encomendas_antes (os triggers correm por ordem alfabética)
drop trigger if exists log_encomendas_zstock on public.log_encomendas;
create trigger log_encomendas_zstock before insert or update of estado, itens on public.log_encomendas
  for each row execute function public.log_encomendas_stock();

-- ---------------------------------------------------------------------
-- 2. Cópias de segurança
-- A direção descarrega a cópia na app (Mais → Cópia de segurança).
-- Fica registado quando foi feita a última; se passar uma semana sem cópia,
-- a direção recebe um lembrete à segunda-feira de manhã.
-- ---------------------------------------------------------------------
create or replace function public.registar_copia() returns timestamptz
language plpgsql security definer set search_path = public as $$
begin
  if not public.e_gestor() then raise exception 'Só a direção faz cópias de segurança.'; end if;
  insert into public.configuracao (chave, valor) values ('ultima_copia', now()::text)
  on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
  return now();
end $$;

create or replace function public.lembrar_copia() returns int
language plpgsql security definer set search_path = public as $$
declare v_ultima timestamptz; p uuid; n int := 0;
begin
  select nullif(valor, '')::timestamptz into v_ultima from public.configuracao where chave = 'ultima_copia';
  if v_ultima is not null and v_ultima > now() - interval '7 days' then return 0; end if;
  for p in select id from public.perfis where ativo and papel in ('ceo','admin') loop
    delete from public.notificacoes where destinatario_id = p and link = '#copia' and not lida;
    insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
    values (p, 'copia', 'Faz a cópia de segurança',
            case when v_ultima is null then 'Ainda não foi feita nenhuma cópia dos dados da Central.'
                 else 'A última cópia foi a ' || to_char(v_ultima at time zone 'Europe/Lisbon', 'DD/MM') || '. Demora menos de um minuto.' end,
            '#copia');
    n := n + 1;
  end loop;
  return n;
end $$;

do $$ begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'central26-copia';
  perform cron.schedule('central26-copia', '0 9 * * 1', 'select public.lembrar_copia()');
exception when others then
  raise notice 'pg_cron indisponível: o lembrete semanal da cópia fica desligado (%).', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 3. Permissões das funções (só com sessão iniciada; as internas ficam fechadas)
-- ---------------------------------------------------------------------
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
