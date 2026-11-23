-- =====================================================================
-- Central 26 · 26 · Estatísticas das barbearias (marcações do Booknetic)
-- Correr no Supabase: SQL Editor → New query → colar tudo → Run. Pode ser corrido mais do que uma vez.
--
-- A direção importa na app (Lojas → Marcações) o ficheiro de exportação do Booknetic. O ficheiro é lido no
-- computador de quem importa e só chegam aqui números agregados por mês, loja, barbeiro e serviço.
-- Não ficam guardados nomes, contactos nem notas de clientes.
-- =====================================================================

create table if not exists public.bar_stats (
  nivel      text not null check (nivel in ('total','loja','barbeiro','servico')),
  mes        text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  loja       text not null default '',
  chave      text not null default '',     -- barbeiro ou serviço
  marcacoes  int  not null default 0,      -- marcações feitas (aprovadas, já passadas)
  canceladas int  not null default 0,
  clientes   int  not null default 0,      -- clientes diferentes
  novos      int  not null default 0,      -- clientes cuja primeira visita foi neste mês
  primary key (nivel, mes, loja, chave)
);

create table if not exists public.bar_horas (       -- últimas 12 semanas
  loja text not null,
  dow  int  not null check (dow between 0 and 6),     -- 0 = segunda-feira
  hora int  not null check (hora between 0 and 23),
  n    int  not null default 0,
  primary key (loja, dow, hora)
);

create table if not exists public.bar_importacao (
  id            int primary key default 1 check (id = 1),
  resumo        jsonb not null default '{}'::jsonb,
  ficheiro      text not null default '',
  importado_em  timestamptz not null default now(),
  importado_por uuid references public.perfis(id) on delete set null
);

create or replace function public.pode_estatisticas_bar() returns boolean
language sql stable security definer set search_path = public as $$
  select public.e_gestor() or coalesce(public.pode_financeiro(), false)
$$;

-- Substitui tudo pelos números da exportação nova (a exportação traz sempre o histórico completo)
create or replace function public.bar_importar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_linhas int; n_horas int;
begin
  if not public.pode_estatisticas_bar() then raise exception 'Só a direção importa as estatísticas das barbearias.'; end if;
  if jsonb_typeof(p->'linhas') <> 'array' or jsonb_array_length(p->'linhas') = 0 then raise exception 'O ficheiro não trouxe marcações.'; end if;
  delete from public.bar_stats where true;
  insert into public.bar_stats (nivel, mes, loja, chave, marcacoes, canceladas, clientes, novos)
  select x.nivel, x.mes, coalesce(left(x.loja, 80), ''), coalesce(left(x.chave, 120), ''), greatest(x.marcacoes, 0), greatest(x.canceladas, 0), greatest(x.clientes, 0), greatest(x.novos, 0)
    from jsonb_to_recordset(p->'linhas') as x(nivel text, mes text, loja text, chave text, marcacoes int, canceladas int, clientes int, novos int);
  get diagnostics n_linhas = row_count;
  delete from public.bar_horas where true;
  insert into public.bar_horas (loja, dow, hora, n)
  select left(x.loja, 80), x.dow, x.hora, greatest(x.n, 0)
    from jsonb_to_recordset(coalesce(p->'horas', '[]'::jsonb)) as x(loja text, dow int, hora int, n int);
  get diagnostics n_horas = row_count;
  insert into public.bar_importacao (id, resumo, ficheiro, importado_em, importado_por)
  values (1, coalesce(p->'resumo', '{}'::jsonb), left(coalesce(p->>'ficheiro', ''), 200), now(), auth.uid())
  on conflict (id) do update set resumo = excluded.resumo, ficheiro = excluded.ficheiro, importado_em = now(), importado_por = auth.uid();
  return jsonb_build_object('linhas', n_linhas, 'horas', n_horas);
end $$;

alter table public.bar_stats enable row level security;
alter table public.bar_horas enable row level security;
alter table public.bar_importacao enable row level security;
drop policy if exists bar_stats_ler on public.bar_stats;
create policy bar_stats_ler on public.bar_stats for select to authenticated using (public.pode_estatisticas_bar());
drop policy if exists bar_horas_ler on public.bar_horas;
create policy bar_horas_ler on public.bar_horas for select to authenticated using (public.pode_estatisticas_bar());
drop policy if exists bar_importacao_ler on public.bar_importacao;
create policy bar_importacao_ler on public.bar_importacao for select to authenticated using (public.pode_estatisticas_bar());

revoke all on public.bar_stats, public.bar_horas, public.bar_importacao from anon, authenticated;
grant select on public.bar_stats, public.bar_horas, public.bar_importacao to authenticated;
revoke all on function public.bar_importar(jsonb), public.pode_estatisticas_bar() from public, anon;
grant execute on function public.bar_importar(jsonb), public.pode_estatisticas_bar() to authenticated;
