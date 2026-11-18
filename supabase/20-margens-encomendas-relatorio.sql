-- =====================================================================
-- Central 26 — Margens, encomendas ao laboratório e relatório mensal
-- Corre depois do 19-academy.sql. Pode ser corrido mais do que uma vez.
--
-- • Custo de cada produto do catálogo do Multixop (sem IVA, por unidade): só a direção o muda;
--   quem vê o Comercial vê as margens.
-- • Stocks: cada produto pode ficar ligado ao seu código no Multixop e ter o prazo de fabrico. A Central calcula
--   quantos dias de stock faltam (pelas vendas dos últimos 90 dias) e quando é preciso encomendar ao laboratório.
-- • Relatório mensal para a direção: os números do mês num só sítio, na app e por email no dia 1.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Custo de cada produto
-- ---------------------------------------------------------------------
create table if not exists public.crm_custos (
  produto_codigo text primary key references public.crm_produtos(codigo) on delete cascade,
  custo          numeric(10,4) not null check (custo >= 0 and custo < 100000),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references public.perfis(id) on delete set null
);
create or replace function public.crm_custos_carimbo() returns trigger
language plpgsql as $$
begin new.atualizado_em := now(); new.atualizado_por := coalesce(auth.uid(), new.atualizado_por); return new; end $$;
drop trigger if exists crm_custos_carimbo on public.crm_custos;
create trigger crm_custos_carimbo before insert or update on public.crm_custos for each row execute function public.crm_custos_carimbo();

alter table public.crm_custos enable row level security;
drop policy if exists crm_custos_ler on public.crm_custos;
create policy crm_custos_ler on public.crm_custos for select to authenticated using (public.pode_crm());
drop policy if exists crm_custos_mudar on public.crm_custos;
create policy crm_custos_mudar on public.crm_custos for all to authenticated using (public.e_gestor()) with check (public.e_gestor());
revoke all on public.crm_custos from anon;
grant select, insert, update, delete on public.crm_custos to authenticated;
revoke all on function public.crm_custos_carimbo() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Encomendas ao laboratório
-- ---------------------------------------------------------------------
alter table public.stk_produtos add column if not exists codigo_multixop text;
alter table public.stk_produtos add column if not exists prazo_fabrico_dias int;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'stk_produtos_prazo_ck') then
    alter table public.stk_produtos add constraint stk_produtos_prazo_ck check (prazo_fabrico_dias is null or prazo_fabrico_dias between 0 and 365);
  end if;
end $$;
alter table public.stk_config add column if not exists prazo_fabrico int not null default 30;
alter table public.stk_config add column if not exists cobertura int not null default 60;

-- Procura de cada produto nos últimos p_dias: vendas no Multixop (pelo código ligado) e retiradas no Stocks.
-- As vendas contam até à data da última venda importada, para um atraso na importação não parecer falta de procura.
create or replace function public.stk_procura(p_dias int default 90)
returns table (produto_id uuid, vendido numeric, saidas numeric, dias int)
language sql stable security definer set search_path = public as $$
  with ref as (select coalesce(max(data), current_date) as d from public.crm_vendas)
  select p.id,
         coalesce((select sum(case when v.tipo = 'NC' then -abs(v.qtd) else v.qtd end) from public.crm_vendas v, ref
                   where p.codigo_multixop is not null and v.produto_codigo = p.codigo_multixop and v.data > ref.d - p_dias and v.data <= ref.d), 0),
         coalesce((select sum(m.quantidade) from public.stk_movimentos m
                   where m.produto_id = p.id and m.tipo = 'saida' and m.criado_em > now() - make_interval(days => p_dias)), 0),
         p_dias
  from public.stk_produtos p
  where public.pode_stocks()
$$;

-- Produtos do catálogo do Multixop, para ligar a cada produto do Stocks (só nome e código)
create or replace function public.stk_catalogo_multixop()
returns table (codigo text, descricao text, vendido_ano numeric)
language sql stable security definer set search_path = public as $$
  select p.codigo, p.descricao,
         coalesce((select sum(v.qtd) from public.crm_vendas v where v.produto_codigo = p.codigo and v.tipo <> 'NC' and v.data > current_date - 365), 0)
  from public.crm_produtos p
  where public.pode_stocks() and p.linha = 'produtos'
  order by 3 desc, 2
$$;

revoke all on function public.stk_procura(int) from public, anon;
grant execute on function public.stk_procura(int) to authenticated, service_role;
revoke all on function public.stk_catalogo_multixop() from public, anon;
grant execute on function public.stk_catalogo_multixop() to authenticated;

-- ---------------------------------------------------------------------
-- 3. Relatório mensal
-- ---------------------------------------------------------------------
create or replace function public.relatorio_dados(p_mes text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  i date; f date; r jsonb := jsonb_build_object('mes', p_mes, 'gerado_em', now());
  v_prazo int; v_cob int;
begin
  if p_mes is null or p_mes !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Mês inválido.'; end if;
  if not (public.e_gestor() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Só a direção vê o relatório mensal.'; end if;
  i := (p_mes || '-01')::date; f := (i + interval '1 month')::date;

  -- TwentySix: vendas sem IVA (as notas de crédito já vêm a negativo)
  r := r || jsonb_build_object('vendas', (
    select jsonb_build_object(
      'mes',          coalesce(sum(valor) filter (where data >= i and data < f), 0),
      'anterior',     coalesce(sum(valor) filter (where data >= (i - interval '1 month')::date and data < i), 0),
      'ano_passado',  coalesce(sum(valor) filter (where data >= (i - interval '1 year')::date and data < (f - interval '1 year')::date), 0),
      'clientes',     count(distinct cliente_codigo) filter (where data >= i and data < f and tipo <> 'NC'),
      'faturas',      count(distinct documento) filter (where data >= i and data < f and tipo <> 'NC'),
      'notas_credito', coalesce(-sum(valor) filter (where data >= i and data < f and tipo = 'NC'), 0),
      'ofertas',      coalesce(sum(qtd) filter (where data >= i and data < f and tipo <> 'NC' and preco = 0 and qtd > 0), 0))
    from public.crm_vendas where data >= (i - interval '1 year')::date and data < f));
  r := r || jsonb_build_object('ultima_venda', (select max(data) from public.crm_vendas));

  r := r || jsonb_build_object('produtos', coalesce((select jsonb_agg(t) from (
    select coalesce(nullif(max(p.descricao), ''), max(v.descricao)) as nome,
           coalesce(sum(v.qtd) filter (where v.tipo <> 'NC'), 0) as qtd, sum(v.valor) as valor
    from public.crm_vendas v left join public.crm_produtos p on p.codigo = v.produto_codigo
    where v.data >= i and v.data < f
    group by v.produto_codigo order by sum(v.valor) desc limit 6) t), '[]'));

  r := r || jsonb_build_object('margem', (
    select jsonb_build_object(
      'vendas', coalesce(sum(v.valor), 0),
      'vendas_com_custo', coalesce(sum(v.valor) filter (where c.custo is not null), 0),
      'custo', coalesce(sum((case when v.tipo = 'NC' then -abs(v.qtd) else v.qtd end) * c.custo) filter (where c.custo is not null), 0))
    from public.crm_vendas v left join public.crm_custos c on c.produto_codigo = v.produto_codigo
    where v.data >= i and v.data < f));

  -- clientes novos (primeira compra no mês) e clientes que pararam (compravam e já não compram há 90 a 180 dias)
  r := r || jsonb_build_object('clientes_novos', coalesce((select jsonb_agg(t) from (
    select coalesce(c.nome, x.cliente_codigo) as nome, x.valor
    from (select cliente_codigo, min(data) as primeira, sum(valor) filter (where data >= i and data < f) as valor
          from public.crm_vendas where tipo <> 'NC' and data < f group by cliente_codigo) x
    left join public.crm_clientes c on c.codigo_multixop = x.cliente_codigo
    where x.primeira >= i order by x.valor desc nulls last limit 10) t), '[]'));
  r := r || jsonb_build_object('clientes_parados', coalesce((select jsonb_agg(t) from (
    select coalesce(c.nome, x.cliente_codigo) as nome, x.ultima, x.valor_ano
    from (select cliente_codigo, max(data) as ultima, sum(valor) as valor_ano
          from public.crm_vendas where data >= (f - interval '1 year')::date and data < f group by cliente_codigo) x
    left join public.crm_clientes c on c.codigo_multixop = x.cliente_codigo
    where x.ultima < f - 90 and x.ultima >= f - 180 and x.valor_ano >= 100
    order by x.valor_ano desc limit 8) t), '[]'));

  -- barbearias (folha do Financeiro)
  r := r || jsonb_build_object('barbearias', coalesce((select jsonb_agg(t order by t.total desc) from (
    select a.espaco, a.total, a.vencimentos, b.total as anterior
    from public.fin_faturacao a
    left join public.fin_faturacao b on b.espaco = a.espaco and b.mes = to_char(i - interval '1 month', 'YYYY-MM')
    where a.mes = p_mes) t), '[]'));
  r := r || jsonb_build_object('financeiro_avisos', coalesce((select avisos from public.fin_meses where mes = p_mes), '[]'::jsonb),
                               'financeiro_importado', exists (select 1 from public.fin_meses where mes = p_mes));

  -- stock: abaixo do mínimo e a encomendar ao laboratório
  select coalesce(prazo_fabrico, 30), coalesce(cobertura, 60) into v_prazo, v_cob from public.stk_config where id = 1;
  v_prazo := coalesce(v_prazo, 30); v_cob := coalesce(v_cob, 60);
  r := r || jsonb_build_object('stock_minimo', coalesce((select jsonb_agg(jsonb_build_object('nome', nome, 'quantidade', quantidade, 'minimo', minimo) order by quantidade)
    from public.stk_produtos where ativo and alerta <> 'ok'), '[]'));
  r := r || jsonb_build_object('encomendar', coalesce((select jsonb_agg(t order by t.dias_restantes) from (
    select p.nome, p.quantidade, round(d.diaria * 30, 1) as por_mes, floor(p.quantidade / d.diaria)::int as dias_restantes,
           coalesce(p.prazo_fabrico_dias, v_prazo) as prazo,
           greatest(0, ceil(d.diaria * (coalesce(p.prazo_fabrico_dias, v_prazo) + v_cob) - p.quantidade))::int as sugerido
    from public.stk_produtos p
    join lateral (select (case when p.codigo_multixop is not null then
                   coalesce((select sum(case when v.tipo = 'NC' then -abs(v.qtd) else v.qtd end) from public.crm_vendas v
                             where v.produto_codigo = p.codigo_multixop and v.data > (select max(data) from public.crm_vendas) - 90), 0)
                 else coalesce((select sum(m.quantidade) from public.stk_movimentos m where m.produto_id = p.id and m.tipo = 'saida' and m.criado_em > now() - interval '90 days'), 0)
                 end) / 90.0 as diaria) d on true
    where p.ativo and p.quantidade is not null and d.diaria > 0
      and p.quantidade / d.diaria <= coalesce(p.prazo_fabrico_dias, v_prazo) + 14) t), '[]'));

  -- 26 Academy
  r := r || jsonb_build_object('academy', (select jsonb_build_object(
    'a_decorrer', (select count(*) from public.aca_formacoes where estado ~* 'decorr|avalia'),
    'formandos_novos', (select count(*) from public.aca_formandos where criado_em >= i and criado_em < f),
    'formacoes_novas', (select count(*) from public.aca_formacoes where inicio >= i and inicio < f),
    'assiduidade', (select round(avg(assiduidade), 1) from public.aca_formacoes where assiduidade is not null and inicio >= i - 365))));

  -- seguros e viaturas, tarefas
  r := r || jsonb_build_object('prazos', coalesce((select jsonb_agg(jsonb_build_object('titulo', titulo, 'data', data) order by data)
    from public.prz_prazos where estado = 'ativo' and data <= current_date + 30), '[]'));
  r := r || jsonb_build_object('tarefas', jsonb_build_object(
    'em_atraso', (select count(*) from public.tarefas where estado <> 'concluido' and prazo < current_date),
    'concluidas', (select count(*) from public.tarefas where concluido_em >= i and concluido_em < f)));
  return r;
end $$;
revoke all on function public.relatorio_dados(text) from public, anon;
grant execute on function public.relatorio_dados(text) to authenticated, service_role;

-- Email no dia 1 de cada mês, com o mês anterior (função relatorio-mensal)
create or replace function public.relatorio_tique() returns boolean
language plpgsql security definer set search_path = public as $$
declare v_url text; v_seg text;
begin
  select valor into v_url from public.configuracao where chave = 'url_funcoes';
  select valor into v_seg from public.configuracao_privada where chave = 'segredo_webhook';
  if v_url is null then return false; end if;
  perform net.http_post(url := v_url || '/relatorio-mensal',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-segredo', v_seg),
    body := jsonb_build_object('acao', 'tique'), timeout_milliseconds := 60000);
  return true;
exception when others then
  raise warning 'Falha ao pedir o relatório mensal: %', sqlerrm;
  return false;
end $$;
revoke all on function public.relatorio_tique() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'central26-relatorio';
  perform cron.schedule('central26-relatorio', '40 7 1 * *', 'select public.relatorio_tique()');
exception when others then
  raise notice 'pg_cron indisponível: o relatório mensal não segue por email sozinho (%).', sqlerrm;
end $$;

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.crm_custos'; exception when others then null; end;
end $$;
