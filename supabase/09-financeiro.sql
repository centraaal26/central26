-- =====================================================================
-- Central 26 · 09 · Financeiro: faturação e custos por mês (folhas mensais da Ondina & Maia)
-- Correr uma vez no Supabase: SQL Editor → New query → colar tudo → Run
-- Pode voltar a ser corrido sem apagar dados.
--
-- Só a direção (CEO e administração) vê e importa.
-- Os valores entram só pela importação na app: nada fica no GitHub.
-- Não inclui vencimentos individuais (folha RH).
-- =====================================================================

create or replace function public.pode_financeiro() returns boolean
language sql stable security definer set search_path = public as $$
  select public.e_gestor()
$$;

create table if not exists public.fin_meses (
  mes            text primary key check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  ficheiro       text not null default '',
  assinatura     text not null default '',      -- impressão digital dos valores (para detetar cópias)
  assinatura_custos text not null default '',
  avisos         jsonb not null default '[]'::jsonb,
  importado_por  uuid references public.perfis(id) on delete set null default auth.uid(),
  importado_em   timestamptz not null default now()
);

create table if not exists public.fin_linhas (
  id       bigint generated always as identity primary key,
  mes      text not null references public.fin_meses(mes) on delete cascade,
  area     text not null check (area in ('barbearias','partilhadas','impostos','hairshopping','tech','formacao')),
  grupo    text not null default '',            -- espaço (barbearias) ou bloco da folha
  rubrica  text not null,
  base     numeric(12,2) not null default 0,
  iva      numeric(12,2) not null default 0,
  sem      numeric(12,2) not null default 0     -- documentos sem IVA
);
create index if not exists fin_linhas_mes on public.fin_linhas (mes);

create table if not exists public.fin_faturacao (
  mes          text not null references public.fin_meses(mes) on delete cascade,
  espaco       text not null,
  total        numeric(12,2) not null default 0,
  numerario    numeric(12,2) not null default 0,
  mb           numeric(12,2) not null default 0,
  ft           numeric(12,2) not null default 0,
  vencimentos  numeric(12,2) not null default 0,  -- total pago aos barbeiros do espaço (sem nomes)
  primary key (mes, espaco)
);

-- Categoria de cada rubrica das despesas (editável na app)
create table if not exists public.fin_rubricas (
  chave      text primary key,
  categoria  text not null,
  atualizado_em timestamptz not null default now()
);

-- Importação: cada mês enviado substitui por completo o que existia desse mês
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
    v_meses := v_meses + 1;
  end loop;
  return jsonb_build_object('meses', v_meses);
end $$;
revoke all on function public.fin_importar(jsonb) from public, anon;
grant execute on function public.fin_importar(jsonb) to authenticated;

alter table public.fin_meses     enable row level security;
alter table public.fin_linhas    enable row level security;
alter table public.fin_faturacao enable row level security;
alter table public.fin_rubricas  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['fin_meses','fin_linhas','fin_faturacao','fin_rubricas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_direcao', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.pode_financeiro()) with check (public.pode_financeiro())', t || '_direcao', t);
  end loop;
end $$;

revoke all on public.fin_meses, public.fin_linhas, public.fin_faturacao, public.fin_rubricas from anon;
grant select, insert, update, delete on public.fin_meses, public.fin_linhas, public.fin_faturacao, public.fin_rubricas to authenticated;
