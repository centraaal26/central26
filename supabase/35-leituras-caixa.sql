-- =====================================================================
-- Central 26 · 35 · Leitura de caixa das barbearias e «Os meus números» dos barbeiros
-- Corre depois do 34. Pode ser corrido mais do que uma vez.
--
-- • Todos os dias o responsável da loja tira uma foto da leitura de caixa do Multixop; a Central lê-a
--   (função «leitura-caixa») e, depois de confirmada, guarda os serviços e valores por barbeiro (secção «Entradas»).
-- • O total faturado e os meios de pagamento ficam à parte: só a direção e o responsável da loja os veem.
-- • Cada barbeiro vê só os seus números (e a média da loja, sem nomes), pela função bar_meus_numeros.
-- • bar_alias diz a que conta da Central corresponde cada nome da leitura (ex.: «JOAO» na Madalena).
-- =====================================================================

create table if not exists public.bar_leituras (
  id              uuid primary key default gen_random_uuid(),
  loja_id         text not null references public.loj_lojas(id) on delete cascade,
  dia             date not null,
  entradas        jsonb not null default '[]'::jsonb,   -- [{ barbeiro, servico, qtd, valor }]
  total_entradas  numeric(12,2) not null default 0,
  total_faturado  numeric(12,2),
  pagamentos      jsonb not null default '{}'::jsonb,   -- { "MULTIBANCO": 136, "NUMERARIO": 0 }
  notas           text not null default '',
  criado_por      uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em       timestamptz not null default now(),
  atualizado_por  uuid references public.perfis(id) on delete set null,
  atualizado_em   timestamptz not null default now(),
  unique (loja_id, dia)
);
create index if not exists bar_leituras_dia on public.bar_leituras (dia);

create table if not exists public.bar_alias (
  loja_id    text not null references public.loj_lojas(id) on delete cascade,
  nome       text not null,                                   -- como aparece na leitura, em maiúsculas
  perfil_id  uuid not null references public.perfis(id) on delete cascade,
  criado_em  timestamptz not null default now(),
  primary key (loja_id, nome)
);

-- direção ou responsável da loja
create or replace function public.e_resp_loja(p_loja text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.e_gestor() or exists (select 1 from public.loj_lojas where id = p_loja and responsavel_id = auth.uid())
$$;

create or replace function public.bar_leituras_carimbo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if auth.uid() is not null then new.atualizado_por := auth.uid(); end if;
  if tg_op = 'UPDATE' then new.criado_por := old.criado_por; new.criado_em := old.criado_em; end if;
  -- total das entradas sempre calculado a partir das linhas
  select coalesce(sum(coalesce(nullif(e->>'valor','')::numeric, 0)), 0) into new.total_entradas from jsonb_array_elements(coalesce(new.entradas, '[]'::jsonb)) e;
  return new;
end $$;
drop trigger if exists bar_leituras_carimbo on public.bar_leituras;
create trigger bar_leituras_carimbo before insert or update on public.bar_leituras for each row execute function public.bar_leituras_carimbo();

alter table public.bar_leituras enable row level security;
alter table public.bar_alias enable row level security;
drop policy if exists bar_leituras_tudo on public.bar_leituras;
create policy bar_leituras_tudo on public.bar_leituras for all to authenticated using (public.e_resp_loja(loja_id)) with check (public.e_resp_loja(loja_id));
drop policy if exists bar_alias_tudo on public.bar_alias;
create policy bar_alias_tudo on public.bar_alias for all to authenticated using (public.e_resp_loja(loja_id)) with check (public.e_resp_loja(loja_id));
revoke all on public.bar_leituras, public.bar_alias from anon;
grant select, insert, update, delete on public.bar_leituras, public.bar_alias to authenticated;
revoke all on function public.bar_leituras_carimbo() from public, anon, authenticated;

-- Os números de quem está a ver (só os seus) e a média da loja, sem nomes
create or replace function public.bar_meus_numeros(p_de date, p_ate date) returns jsonb
language sql stable security definer set search_path = public as $$
  with a as (select loja_id, upper(trim(nome)) as nome from public.bar_alias where perfil_id = auth.uid()),
  linhas as (
    select l.loja_id, l.dia, upper(trim(e->>'barbeiro')) as b, upper(trim(coalesce(e->>'servico', ''))) as s,
           coalesce(nullif(e->>'qtd','')::numeric, 0) as q, coalesce(nullif(e->>'valor','')::numeric, 0) as v
      from public.bar_leituras l cross join lateral jsonb_array_elements(l.entradas) e
     where l.dia between p_de and p_ate and l.loja_id in (select loja_id from a)
  ),
  minhas as (select x.* from linhas x join a on a.loja_id = x.loja_id and a.nome = x.b)
  select jsonb_build_object(
    'ligado', exists (select 1 from a),
    'linhas', coalesce((select jsonb_agg(jsonb_build_object('loja_id', loja_id, 'dia', dia, 'servico', s, 'qtd', q, 'valor', v) order by dia, s) from minhas), '[]'::jsonb),
    'lojas', coalesce((select jsonb_agg(jsonb_build_object('loja_id', loja_id, 'barbeiros', n, 'dias', d, 'media_valor', round(tv / nullif(n, 0), 2), 'media_servicos', round(tq / nullif(n, 0), 1)))
                         from (select loja_id, count(distinct b) n, count(distinct dia) d, sum(v) tv, sum(q) tq from linhas group by loja_id) z), '[]'::jsonb)
  )
$$;
revoke all on function public.bar_meus_numeros(date, date) from public, anon;
grant execute on function public.bar_meus_numeros(date, date) to authenticated;

do $$ begin
  begin execute 'alter publication supabase_realtime add table public.bar_leituras'; exception when others then null; end;
end $$;
