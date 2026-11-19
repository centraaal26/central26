-- Central 26 — 22: preço de cada formação e receita da Academia (só a direção)
-- Corre no SQL Editor do Supabase depois do 21. Pode ser corrido mais de uma vez.
--
-- A formação não é faturada pela Secretaria Online, por isso a direção escreve na Academy o preço de cada formação
-- (por formando). A receita de cada formando é o preço da formação; os desistentes não contam.
-- A receita de uma formação divide-se em partes iguais pelos meses em que decorre (do início ao fim);
-- sem data de fim, fica toda no mês de início. O Financeiro usa-a nos Resultados quando não há um valor escrito à mão.

create table if not exists public.aca_precos (
  formacao_id    uuid primary key references public.aca_formacoes(id) on delete cascade,
  preco          numeric(10,2) not null check (preco >= 0),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references public.perfis(id) on delete set null default auth.uid()
);

alter table public.aca_precos enable row level security;
drop policy if exists aca_precos_direcao on public.aca_precos;
create policy aca_precos_direcao on public.aca_precos for all to authenticated using (public.e_gestor()) with check (public.e_gestor());
revoke all on public.aca_precos from anon;
grant select, insert, update, delete on public.aca_precos to authenticated;

create or replace function public.fin_receita_academia() returns table (mes text, valor numeric, formandos int, formacoes int)
language sql stable security definer set search_path = public as $$
  with f as (
    select a.id, p.preco, a.inicio, greatest(coalesce(a.fim, a.inicio), a.inicio) as fim,
           (select count(*) from public.aca_inscricoes i where i.formacao_id = a.id and not i.desistente)::int as ativos
      from public.aca_formacoes a join public.aca_precos p on p.formacao_id = a.id
     where a.inicio is not null and coalesce(a.estado, '') !~* 'cancel'
  ), m as (
    select f.*, gs::date as mes_ini,
           (extract(year from age(date_trunc('month', f.fim), date_trunc('month', f.inicio))) * 12
            + extract(month from age(date_trunc('month', f.fim), date_trunc('month', f.inicio))) + 1)::int as n_meses
      from f, generate_series(date_trunc('month', f.inicio), date_trunc('month', f.fim), interval '1 month') gs
  )
  select to_char(mes_ini, 'YYYY-MM'), round(sum(preco * ativos / n_meses), 2), sum(ativos)::int, count(*)::int
    from m
   where public.pode_financeiro()
   group by 1
$$;
revoke all on function public.fin_receita_academia() from public, anon;
grant execute on function public.fin_receita_academia() to authenticated;
