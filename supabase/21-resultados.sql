-- Central 26 — 21: resultados por área e por barbeiro (pedido do contabilista)
-- Corre no SQL Editor do Supabase depois do 20. Pode ser corrido mais de uma vez.
--
-- O que acrescenta ao Financeiro (só a direção vê):
--   fin_barbeiros     serviços, faturação, comissão, extras e total pago a cada barbeiro, por mês e loja (folha Faturação)
--   fin_responsaveis  quanto recebe o responsável de cada loja (folha Faturação)
--   fin_pessoal       outro pessoal (folha RH): total do mês e divisão pelas áreas
--   fin_ajustes       valores escritos na app: receita da Academia e produtos gastos nas barbearias (a preço de custo)
--   fin_config        regra para dividir os custos gerais pelas áreas
--   fin_rubricas.imputacao  para onde vai cada rubrica (dividir por todas, uma área, não é custo, IRC)
--   fin_vendas_mes()  vendas sem IVA da faturação do Multixop (SAF-T) por mês e linha de negócio
-- Depois de correr, volta a importar as folhas mensais no Financeiro para entrarem os barbeiros e o pessoal.

create table if not exists public.fin_barbeiros (
  mes          text not null references public.fin_meses(mes) on delete cascade,
  loja         text not null,
  barbeiro     text not null,
  dias         text not null default '',
  cabelos      numeric(10,2) not null default 0,
  barbas       numeric(10,2) not null default 0,
  combos       numeric(10,2) not null default 0,
  outro        numeric(12,2) not null default 0,
  valor_total  numeric(12,2) not null default 0,   -- faturado pelo barbeiro
  liquido      numeric(12,2) not null default 0,   -- depois do desconto de 0,50 € por serviço (ajuda ao IVA)
  comissao     numeric(6,4)  not null default 0,   -- percentagem que o barbeiro recebe (0,45 = 45%)
  a_receber    numeric(12,2) not null default 0,   -- comissão em euros
  extras       numeric(12,2) not null default 0,   -- gestão, formação, produtos…
  nota         text not null default '',
  total        numeric(12,2) not null default 0,   -- total pago ao barbeiro
  primary key (mes, loja, barbeiro)
);

create table if not exists public.fin_responsaveis (
  mes    text not null references public.fin_meses(mes) on delete cascade,
  loja   text not null,
  valor  numeric(12,2) not null default 0,
  primary key (mes, loja)
);

create table if not exists public.fin_pessoal (
  mes     text not null references public.fin_meses(mes) on delete cascade,
  pessoa  text not null,
  valor   numeric(12,2) not null default 0,
  pesos   jsonb not null default '{}'::jsonb,   -- {"barbearias":0.4,"academia":0.4,"produtos":0.2,"tech":0}
  primary key (mes, pessoa)
);

create table if not exists public.fin_ajustes (
  mes    text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  tipo   text not null check (tipo in ('receita_academia','autoconsumo')),
  valor  numeric(12,2) not null default 0 check (valor >= 0),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references public.perfis(id) on delete set null default auth.uid(),
  primary key (mes, tipo)
);

create table if not exists public.fin_config (
  id          int primary key default 1 check (id = 1),
  reparticao  jsonb not null default '{"metodo":"faturacao","pesos":{"barbearias":60,"produtos":25,"academia":10,"tech":5}}'::jsonb,
  atualizado_em timestamptz not null default now()
);
insert into public.fin_config (id) values (1) on conflict do nothing;

alter table public.fin_rubricas add column if not exists imputacao text;
alter table public.fin_rubricas alter column categoria drop not null;
do $$ begin
  alter table public.fin_rubricas add constraint fin_rubricas_imputacao check (imputacao is null or imputacao in ('geral','barbearias','produtos','academia','tech','fora','irc'));
exception when duplicate_object then null; end $$;

-- Importação: igual à do 09, mais barbeiros, responsáveis e pessoal
create or replace function public.fin_importar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m jsonb; v_meses int := 0; v_linhas int := 0;
begin
  if not public.pode_financeiro() then raise exception 'Só a direção importa os dados financeiros.'; end if;
  for m in select * from jsonb_array_elements(coalesce(p->'meses','[]')) loop
    delete from public.fin_meses where mes = m->>'mes';
    insert into public.fin_meses (mes, ficheiro, assinatura, assinatura_custos, avisos)
    values (m->>'mes', coalesce(m->>'ficheiro',''), coalesce(m->>'assinatura',''), coalesce(m->>'assinatura_custos',''), coalesce(m->'avisos','[]'));
    insert into public.fin_linhas (mes, area, grupo, rubrica, base, iva, sem)
    select m->>'mes', l->>'area', coalesce(l->>'grupo',''), l->>'rubrica', coalesce((l->>'base')::numeric,0), coalesce((l->>'iva')::numeric,0), coalesce((l->>'sem')::numeric,0)
      from jsonb_array_elements(coalesce(m->'linhas','[]')) l;
    get diagnostics v_linhas = row_count;
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
    v_meses := v_meses + 1;
  end loop;
  return jsonb_build_object('meses', v_meses);
end $$;
revoke all on function public.fin_importar(jsonb) from public, anon;
grant execute on function public.fin_importar(jsonb) to authenticated;

-- Vendas da faturação (SAF-T do Multixop) por mês e linha de negócio, sem IVA (as notas de crédito já vêm negativas)
create or replace function public.fin_vendas_mes() returns table (mes text, linha text, valor numeric)
language sql stable security definer set search_path = public as $$
  select to_char(v.data, 'YYYY-MM'), coalesce(p.linha, 'produtos'), round(sum(v.valor), 2)
    from public.crm_vendas v left join public.crm_produtos p on p.codigo = v.produto_codigo
   where public.pode_financeiro()
   group by 1, 2
$$;
revoke all on function public.fin_vendas_mes() from public, anon;
grant execute on function public.fin_vendas_mes() to authenticated;

alter table public.fin_barbeiros    enable row level security;
alter table public.fin_responsaveis enable row level security;
alter table public.fin_pessoal      enable row level security;
alter table public.fin_ajustes      enable row level security;
alter table public.fin_config       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['fin_barbeiros','fin_responsaveis','fin_pessoal','fin_ajustes','fin_config'] loop
    execute format('drop policy if exists %I on public.%I', t || '_direcao', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.pode_financeiro()) with check (public.pode_financeiro())', t || '_direcao', t);
  end loop;
end $$;

revoke all on public.fin_barbeiros, public.fin_responsaveis, public.fin_pessoal, public.fin_ajustes, public.fin_config from anon;
grant select, insert, update, delete on public.fin_barbeiros, public.fin_responsaveis, public.fin_pessoal, public.fin_ajustes, public.fin_config to authenticated;
