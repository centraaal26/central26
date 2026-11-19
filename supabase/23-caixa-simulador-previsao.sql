-- Central 26 — 23: faltas de caixa, preços dos serviços e previsão de tesouraria (Financeiro, só a direção)
-- Corre no SQL Editor do Supabase depois do 22. Pode ser corrido mais de uma vez.
-- Depois de correr, volta a importar as folhas mensais no Financeiro para entrarem as faltas de caixa e os preços.

-- faltas e sobras de caixa escritas na folha Faturação ao lado de cada dia
create table if not exists public.fin_caixa (
  id     bigint generated always as identity primary key,
  mes    text not null references public.fin_meses(mes) on delete cascade,
  loja   text not null default '',
  dia    text not null default '',                                  -- «dd/mm», como na folha
  tipo   text not null check (tipo in ('falta','sobra','nota')),
  valor  numeric(10,2),                                             -- sem valor quando a folha só diz «FALTA» ou «A MAIS»
  texto  text not null default ''
);
create index if not exists fin_caixa_mes on public.fin_caixa (mes);

-- preços de cabelo, barba e combo da folha Faturação, e o desconto por serviço (ajuda ao IVA)
alter table public.fin_meses add column if not exists precos jsonb not null default '{}'::jsonb;

-- previsão de tesouraria (saldo de partida, mínimo de segurança, ajuste) e limite de faltas por loja e mês
alter table public.fin_config add column if not exists tesouraria jsonb not null default '{}'::jsonb;
alter table public.fin_config add column if not exists caixa_limite numeric(10,2) not null default 50;

-- Importação: igual à do 21, mais as faltas de caixa e os preços
create or replace function public.fin_importar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m jsonb; v_meses int := 0;
begin
  if not public.pode_financeiro() then raise exception 'Só a direção importa os dados financeiros.'; end if;
  for m in select * from jsonb_array_elements(coalesce(p->'meses','[]')) loop
    delete from public.fin_meses where mes = m->>'mes';
    insert into public.fin_meses (mes, ficheiro, assinatura, assinatura_custos, avisos, precos)
    values (m->>'mes', coalesce(m->>'ficheiro',''), coalesce(m->>'assinatura',''), coalesce(m->>'assinatura_custos',''), coalesce(m->'avisos','[]'), coalesce(m->'precos','{}'));
    insert into public.fin_linhas (mes, area, grupo, rubrica, base, iva, sem)
    select m->>'mes', l->>'area', coalesce(l->>'grupo',''), l->>'rubrica', coalesce((l->>'base')::numeric,0), coalesce((l->>'iva')::numeric,0), coalesce((l->>'sem')::numeric,0)
      from jsonb_array_elements(coalesce(m->'linhas','[]')) l;
    insert into public.fin_faturacao (mes, espaco, total, numerario, mb, ft, vencimentos)
    select m->>'mes', f->>'espaco', coalesce((f->>'total')::numeric,0), coalesce((f->>'numerario')::numeric,0), coalesce((f->>'mb')::numeric,0),
           coalesce((f->>'ft')::numeric,0), coalesce((f->>'vencimentos')::numeric,0)
      from jsonb_array_elements(coalesce(m->'faturacao','[]')) f
    on conflict (mes, espaco) do update set total = excluded.total, numerario = excluded.numerario, mb = excluded.mb, ft = excluded.ft, vencimentos = excluded.vencimentos;
    insert into public.fin_barbeiros (mes, loja, barbeiro, dias, cabelos, barbas, combos, outro, valor_total, liquido, comissao, a_receber, extras, nota, total)
    select m->>'mes', b->>'loja', b->>'barbeiro', coalesce(b->>'dias',''), coalesce((b->>'cabelos')::numeric,0), coalesce((b->>'barbas')::numeric,0), coalesce((b->>'combos')::numeric,0),
           coalesce((b->>'outro')::numeric,0), coalesce((b->>'valor_total')::numeric,0), coalesce((b->>'liquido')::numeric,0), least(9.9999, coalesce((b->>'comissao')::numeric,0)),
           coalesce((b->>'a_receber')::numeric,0), coalesce((b->>'extras')::numeric,0), left(coalesce(b->>'nota',''), 300), coalesce((b->>'total')::numeric,0)
      from jsonb_array_elements(coalesce(m->'barbeiros','[]')) b
    on conflict (mes, loja, barbeiro) do nothing;
    insert into public.fin_responsaveis (mes, loja, valor)
    select m->>'mes', r->>'loja', coalesce((r->>'valor')::numeric,0) from jsonb_array_elements(coalesce(m->'responsaveis','[]')) r
    on conflict (mes, loja) do nothing;
    insert into public.fin_pessoal (mes, pessoa, valor, pesos)
    select m->>'mes', x->>'pessoa', coalesce((x->>'valor')::numeric,0), coalesce(x->'pesos','{}') from jsonb_array_elements(coalesce(m->'pessoal','[]')) x
    on conflict (mes, pessoa) do update set valor = public.fin_pessoal.valor + excluded.valor;
    insert into public.fin_caixa (mes, loja, dia, tipo, valor, texto)
    select m->>'mes', coalesce(c->>'loja',''), coalesce(c->>'dia',''), c->>'tipo', nullif(c->>'valor','')::numeric, left(coalesce(c->>'texto',''), 200)
      from jsonb_array_elements(coalesce(m->'caixa','[]')) c
     where c->>'tipo' in ('falta','sobra','nota');
    v_meses := v_meses + 1;
  end loop;
  return jsonb_build_object('meses', v_meses);
end $$;
revoke all on function public.fin_importar(jsonb) from public, anon;
grant execute on function public.fin_importar(jsonb) to authenticated;

alter table public.fin_caixa enable row level security;
drop policy if exists fin_caixa_direcao on public.fin_caixa;
create policy fin_caixa_direcao on public.fin_caixa for all to authenticated using (public.pode_financeiro()) with check (public.pode_financeiro());
revoke all on public.fin_caixa from anon;
grant select, insert, update, delete on public.fin_caixa to authenticated;
