-- =====================================================================
-- Central 26 — 26 Academy: formandos, formações e estatística regional
-- Corre depois do 18-fiabilidade.sql. Pode ser corrido mais do que uma vez.
--
-- • Formações (ações), formandos e inscrições de cada formando em cada formação.
-- • A residência de cada formando (país, código postal, localidade, concelho, distrito) e a região NUTS II
--   calculada a partir do concelho. A divisão Norte / Centro / Sul define-se nas Definições da Academy.
-- • Os dados entram pela app (importação da Secretaria Online ou registo à mão). Só a direção e o
--   Administrativo e Operacional veem estes dados.
-- • Guarda-se só o necessário para a estatística: não há documentos de identificação, NIF, datas de nascimento nem contactos.
-- =====================================================================

create or replace function public.pode_academy() returns boolean
language sql stable security definer set search_path = public as $$
  select public.e_gestor() or coalesce(public.meu_departamento() = 'administrativo', false)
$$;

-- ---------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.aca_formacoes (
  id             uuid primary key default gen_random_uuid(),
  externo_id     text unique,                         -- n.º da ação na Secretaria Online
  nome           text not null check (char_length(trim(nome)) between 1 and 200),
  curso          text not null default '',
  ano            text not null default '',
  local          text not null default '',
  inicio         date,
  fim            date,
  estado         text not null default '',
  estado_em      date,
  notas          text not null default '',
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references public.perfis(id) on delete set null
);

create table if not exists public.aca_formandos (
  id              uuid primary key default gen_random_uuid(),
  externo_id      text unique,                        -- n.º do utilizador na Secretaria Online
  nome            text not null check (char_length(trim(nome)) between 1 and 200),
  pais            text not null default 'Portugal',
  cp4             text not null default '' check (cp4 = '' or cp4 ~ '^\d{4}$'),
  localidade      text not null default '',
  concelho        text not null default '',
  distrito        text not null default '',
  concelho_codigo text not null default '',           -- código DICO (CAOP)
  regiao          text not null default '',           -- NUTS II 2024, ou «Estrangeiro»
  regiao_aprox    boolean not null default false,     -- região deduzida só pelo distrito
  notas           text not null default '',
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid references public.perfis(id) on delete set null
);
create index if not exists aca_formandos_regiao on public.aca_formandos (regiao);

create table if not exists public.aca_inscricoes (
  formacao_id  uuid not null references public.aca_formacoes(id) on delete cascade,
  formando_id  uuid not null references public.aca_formandos(id) on delete cascade,
  desistente   boolean not null default false,
  criado_em    timestamptz not null default now(),
  primary key (formacao_id, formando_id)
);
create index if not exists aca_inscricoes_formando on public.aca_inscricoes (formando_id);

create table if not exists public.aca_config (
  id              int primary key default 1 check (id = 1),
  zonas           jsonb not null default '{"Norte":"Norte","Centro":"Centro","Oeste e Vale do Tejo":"Centro","Grande Lisboa":"Sul","Península de Setúbal":"Sul","Alentejo":"Sul","Algarve":"Sul","Açores":"Açores","Madeira":"Madeira","Estrangeiro":"Estrangeiro"}',
  ultima_importacao timestamptz,
  ultima_fonte    text not null default ''
);
insert into public.aca_config (id) values (1) on conflict do nothing;

create or replace function public.aca_carimbo() returns trigger
language plpgsql as $$
begin new.atualizado_em := now(); new.atualizado_por := coalesce(auth.uid(), new.atualizado_por); return new; end $$;
drop trigger if exists aca_formacoes_carimbo on public.aca_formacoes;
create trigger aca_formacoes_carimbo before update on public.aca_formacoes for each row execute function public.aca_carimbo();
drop trigger if exists aca_formandos_carimbo on public.aca_formandos;
create trigger aca_formandos_carimbo before update on public.aca_formandos for each row execute function public.aca_carimbo();

-- ---------------------------------------------------------------------
-- 2. Importação (da Secretaria Online): junta pelo n.º externo, sem duplicar
-- p = { fonte, formacoes: [{externo_id, nome, curso, ano, local, inicio, estado, estado_em}],
--       formandos: [{externo_id, nome, pais, cp4, localidade, concelho, distrito, concelho_codigo, regiao, regiao_aprox}],
--       inscricoes: [{formacao, formando, desistente}] }   (formacao/formando = n.º externo)
-- ---------------------------------------------------------------------
create or replace function public.aca_importar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare x jsonb; nf_novas int := 0; nf_atual int := 0; nt_novos int := 0; nt_atual int := 0; ni int := 0; novo boolean;
  v_f uuid; v_t uuid;
begin
  if not public.pode_academy() then raise exception 'Sem acesso à Academy.'; end if;
  for x in select * from jsonb_array_elements(coalesce(p->'formacoes', '[]')) loop
    insert into public.aca_formacoes (externo_id, nome, curso, ano, local, inicio, estado, estado_em)
    values (x->>'externo_id', left(coalesce(nullif(trim(x->>'nome'), ''), 'Ação'), 200), coalesce(x->>'curso', ''), coalesce(x->>'ano', ''),
            coalesce(x->>'local', ''), nullif(x->>'inicio', '')::date, coalesce(x->>'estado', ''), nullif(x->>'estado_em', '')::date)
    on conflict (externo_id) do update set nome = excluded.nome, curso = excluded.curso, ano = excluded.ano, local = excluded.local,
      inicio = excluded.inicio, estado = excluded.estado, estado_em = excluded.estado_em
    returning (xmax = 0) into novo;
    if novo then nf_novas := nf_novas + 1; else nf_atual := nf_atual + 1; end if;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p->'formandos', '[]')) loop
    insert into public.aca_formandos (externo_id, nome, pais, cp4, localidade, concelho, distrito, concelho_codigo, regiao, regiao_aprox)
    values (x->>'externo_id', left(trim(x->>'nome'), 200), coalesce(nullif(x->>'pais', ''), 'Portugal'),
            case when coalesce(x->>'cp4', '') ~ '^\d{4}$' then x->>'cp4' else '' end,
            left(coalesce(x->>'localidade', ''), 120), left(coalesce(x->>'concelho', ''), 120), left(coalesce(x->>'distrito', ''), 120),
            coalesce(x->>'concelho_codigo', ''), coalesce(x->>'regiao', ''), coalesce((x->>'regiao_aprox')::boolean, false))
    on conflict (externo_id) do update set nome = excluded.nome, pais = excluded.pais, cp4 = excluded.cp4, localidade = excluded.localidade,
      concelho = excluded.concelho, distrito = excluded.distrito, concelho_codigo = excluded.concelho_codigo, regiao = excluded.regiao,
      regiao_aprox = excluded.regiao_aprox
    returning (xmax = 0) into novo;
    if novo then nt_novos := nt_novos + 1; else nt_atual := nt_atual + 1; end if;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p->'inscricoes', '[]')) loop
    select id into v_f from public.aca_formacoes where externo_id = x->>'formacao';
    select id into v_t from public.aca_formandos where externo_id = x->>'formando';
    if v_f is null or v_t is null then continue; end if;
    insert into public.aca_inscricoes (formacao_id, formando_id, desistente)
    values (v_f, v_t, coalesce((x->>'desistente')::boolean, false))
    on conflict (formacao_id, formando_id) do update set desistente = excluded.desistente;
    ni := ni + 1;
  end loop;
  update public.aca_config set ultima_importacao = now(), ultima_fonte = left(coalesce(p->>'fonte', ''), 200) where id = 1;
  return jsonb_build_object('formacoes_novas', nf_novas, 'formacoes_atualizadas', nf_atual, 'formandos_novos', nt_novos,
                            'formandos_atualizados', nt_atual, 'inscricoes', ni);
end $$;

-- ---------------------------------------------------------------------
-- 3. Permissões
-- ---------------------------------------------------------------------
alter table public.aca_formacoes enable row level security;
alter table public.aca_formandos enable row level security;
alter table public.aca_inscricoes enable row level security;
alter table public.aca_config enable row level security;
do $$
declare t text;
begin
  foreach t in array array['aca_formacoes', 'aca_formandos', 'aca_inscricoes'] loop
    execute format('drop policy if exists %I on public.%I', t || '_tudo', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.pode_academy()) with check (public.pode_academy())', t || '_tudo', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
drop policy if exists aca_config_ler on public.aca_config;
create policy aca_config_ler on public.aca_config for select to authenticated using (public.pode_academy());
drop policy if exists aca_config_mudar on public.aca_config;
create policy aca_config_mudar on public.aca_config for update to authenticated using (public.e_gestor()) with check (public.e_gestor());
revoke all on public.aca_config from anon;
grant select, update on public.aca_config to authenticated;

revoke all on function public.pode_academy() from public, anon;
grant execute on function public.pode_academy() to authenticated, service_role;
revoke all on function public.aca_importar(jsonb) from public, anon;
grant execute on function public.aca_importar(jsonb) to authenticated, service_role;
revoke all on function public.aca_carimbo() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['aca_formacoes', 'aca_formandos', 'aca_inscricoes', 'aca_config'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null; end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Reciclagem e histórico (script 18): também para formações e formandos
-- ---------------------------------------------------------------------
create or replace function public.tabelas_registo() returns text[]
language sql immutable as $$
  select array['tarefas','crm_clientes','crm_contactos','agenda_eventos','log_encomendas','log_rotas','op_fornecedores','op_pedidos',
               'mk_publicacoes','stk_produtos','prz_prazos','prz_viaturas','aca_formacoes','aca_formandos']
$$;
do $$
declare t text;
begin
  if to_regprocedure('public.historico_registar()') is null then return; end if;
  foreach t in array array['aca_formacoes', 'aca_formandos'] loop
    execute format('drop trigger if exists historico_registar on public.%I', t);
    execute format('create trigger historico_registar after update or delete on public.%I for each row execute function public.historico_registar()', t);
  end loop;
end $$;
