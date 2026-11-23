-- =====================================================================
-- Central 26 · 24 · Proformas, escalões de preço e envios pela Nacex
-- Correr no Supabase: SQL Editor → New query → colar tudo → Run.
-- Pode ser corrido mais do que uma vez. Corre-se depois do 20.
--
-- Caminho de uma venda TwentySix:
--   1. O Comercial faz a proforma na ficha do cliente (produtos, quantidades, escalão de preço).
--   2. O cliente aceita → a Central cria uma tarefa para quem fatura (Samuel), com tudo o que é preciso.
--   3. Quem fatura cria a fatura no Multixop e escreve o número na Central →
--      a proforma passa a encomenda para a Logística (Rui), com os artigos ligados ao stock.
--   4. Envio pela Nacex: a encomenda mostra a ficha de envio para copiar para o portal;
--      quando o tracking é escrito, quem fatura recebe o aviso para imprimir a etiqueta.
--
-- Os preços e escalões ficam na base de dados (a direção edita-os na app); não há preços no código.
-- As credenciais do portal da Nacex NÃO entram na Central.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Escalão de cada cliente
-- base · pro6 · pro12 (barbeiros) · pvd30 · pvd40 · pvd50 (distribuidores)
-- ---------------------------------------------------------------------
alter table public.crm_clientes add column if not exists escalao text not null default 'base';
alter table public.crm_clientes add column if not exists embaixador boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crm_clientes_escalao_ck') then
    alter table public.crm_clientes add constraint crm_clientes_escalao_ck check (escalao in ('base','pro6','pro12','pvd30','pvd40','pvd50'));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Tabela de preços (sem IVA, por unidade) e definições
-- ---------------------------------------------------------------------
create table if not exists public.com_precos (
  produto_codigo text primary key references public.crm_produtos(codigo) on delete cascade,
  base   numeric(10,2) check (base  is null or base  >= 0),
  pro6   numeric(10,2) check (pro6  is null or pro6  >= 0),
  pro12  numeric(10,2) check (pro12 is null or pro12 >= 0),
  pvd30  numeric(10,2) check (pvd30 is null or pvd30 >= 0),
  pvd40  numeric(10,2) check (pvd40 is null or pvd40 >= 0),
  pvd50  numeric(10,2) check (pvd50 is null or pvd50 >= 0),
  prvp   numeric(10,2) check (prvp  is null or prvp  >= 0),   -- preço recomendado de venda ao público
  ordem  int not null default 0,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references public.perfis(id) on delete set null
);

create table if not exists public.com_config (
  id                  int primary key default 1 check (id = 1),
  empresa             jsonb not null default '{}'::jsonb,       -- nome, nif, morada, cp, localidade, telefone, email, iban
  iva                 numeric(5,2) not null default 23 check (iva between 0 and 100),
  validade_dias       int not null default 15 check (validade_dias between 1 and 365),
  desconto_embaixador numeric(5,2) not null default 5 check (desconto_embaixador between 0 and 100),
  faturador           uuid references public.perfis(id) on delete set null,
  patamares           jsonb not null default '{"pro6":6000,"pro12":12000,"pvd40":3000,"pvd50":5000}'::jsonb,
  patamar_por         text not null default 'encomenda' check (patamar_por in ('encomenda','ano')),
  nacex_servico       text not null default '27',
  atualizado_em       timestamptz not null default now()
);
insert into public.com_config (id) values (1) on conflict do nothing;

create or replace function public.com_carimbo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if tg_table_name = 'com_precos' then new.atualizado_por := coalesce(auth.uid(), new.atualizado_por); end if;
  return new;
end $$;
drop trigger if exists com_precos_carimbo on public.com_precos;
create trigger com_precos_carimbo before insert or update on public.com_precos for each row execute function public.com_carimbo();
drop trigger if exists com_config_carimbo on public.com_config;
create trigger com_config_carimbo before update on public.com_config for each row execute function public.com_carimbo();

-- quem fatura as proformas
create or replace function public.e_faturador() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select faturador = auth.uid() from public.com_config where id = 1), false)
$$;

-- ---------------------------------------------------------------------
-- 3. Proformas
-- estado: rascunho → enviada → aceite → faturada · cancelada
-- itens: [{ codigo, descricao, qtd, preco }]  (preço unitário sem IVA, já no escalão)
-- cliente: fotografia dos dados do cliente na altura (nome, nif, morada, cp, localidade, telefone, email)
-- ---------------------------------------------------------------------
create table if not exists public.com_proformas (
  id               uuid primary key default gen_random_uuid(),
  numero           bigint generated always as identity,
  cliente_id       uuid references public.crm_clientes(id) on delete set null,
  cliente          jsonb not null default '{}'::jsonb,
  escalao          text not null default 'base' check (escalao in ('base','pro6','pro12','pvd30','pvd40','pvd50')),
  embaixador       boolean not null default false,
  desc_embaixador  numeric(5,2) not null default 0 check (desc_embaixador between 0 and 100),
  desconto         numeric(5,2) not null default 0 check (desconto between 0 and 100),
  itens            jsonb not null default '[]'::jsonb,
  iva              numeric(5,2) not null default 23 check (iva between 0 and 100),
  envio            text not null default 'nacex' check (envio in ('nacex','entrega','levanta')),
  notas            text not null default '',
  estado           text not null default 'rascunho' check (estado in ('rascunho','enviada','aceite','faturada','cancelada')),
  validade         date,
  subtotal         numeric(12,2) not null default 0,
  total_sem_iva    numeric(12,2) not null default 0,
  fatura_numero    text not null default '',
  tarefa_id        uuid,
  encomenda_id     uuid,
  criado_por       uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  atualizado_por   uuid references public.perfis(id) on delete set null,
  aceite_em        timestamptz,
  faturada_em      timestamptz,
  faturada_por     uuid references public.perfis(id) on delete set null
);
create index if not exists com_proformas_estado on public.com_proformas (estado, criado_em desc);
create index if not exists com_proformas_cliente on public.com_proformas (cliente_id);

create or replace function public.com_proformas_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_sub numeric := 0;
begin
  new.atualizado_em := now();
  if auth.uid() is not null then new.atualizado_por := auth.uid(); end if;
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.criado_por := auth.uid(); end if;
    new.estado := 'rascunho'; new.fatura_numero := ''; new.tarefa_id := null; new.encomenda_id := null;
    new.aceite_em := null; new.faturada_em := null; new.faturada_por := null;
  else
    new.numero := old.numero; new.criado_por := old.criado_por; new.criado_em := old.criado_em;
    -- aceitar, faturar e cancelar só pelas funções abaixo; depois de aceite já não se muda
    if coalesce(current_setting('central26.proforma', true), '') <> '1' then
      if old.estado not in ('rascunho','enviada') then
        raise exception 'A proforma PF-% já foi %. Já não pode ser alterada.', lpad(old.numero::text, 4, '0'),
          case old.estado when 'aceite' then 'aceite e está à espera da fatura' when 'faturada' then 'faturada' else 'cancelada' end;
      end if;
      if new.estado not in ('rascunho','enviada') then raise exception 'Usa os botões da proforma para a aceitar, faturar ou cancelar.'; end if;
      new.tarefa_id := old.tarefa_id; new.encomenda_id := old.encomenda_id; new.fatura_numero := old.fatura_numero;
      new.aceite_em := old.aceite_em; new.faturada_em := old.faturada_em; new.faturada_por := old.faturada_por;
    end if;
  end if;
  if jsonb_typeof(new.itens) <> 'array' then raise exception 'Artigos inválidos.'; end if;
  select coalesce(sum(round(greatest(coalesce(nullif(i->>'qtd','')::numeric, 0), 0) * greatest(coalesce(nullif(i->>'preco','')::numeric, 0), 0), 2)), 0)
    into v_sub from jsonb_array_elements(new.itens) i;
  new.subtotal := v_sub;
  new.total_sem_iva := round(v_sub * (1 - case when new.embaixador then new.desc_embaixador else 0 end / 100) * (1 - new.desconto / 100), 2);
  return new;
end $$;
drop trigger if exists com_proformas_antes on public.com_proformas;
create trigger com_proformas_antes before insert or update on public.com_proformas
  for each row execute function public.com_proformas_antes();

-- ---------------------------------------------------------------------
-- 4. Encomendas: transporte, tracking e ligação à proforma
-- ---------------------------------------------------------------------
alter table public.log_encomendas add column if not exists transportadora text not null default '';
alter table public.log_encomendas add column if not exists tracking text not null default '';
alter table public.log_encomendas add column if not exists envio jsonb;          -- dados para a ficha de envio
alter table public.log_encomendas add column if not exists proforma_id uuid;
alter table public.stk_produtos add column if not exists codigo_multixop text;   -- já vem do 20; fica aqui por segurança
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'log_encomendas_transportadora_ck') then
    alter table public.log_encomendas add constraint log_encomendas_transportadora_ck check (transportadora in ('','nacex','levanta'));
  end if;
end $$;

-- Igual ao do 05, com duas diferenças:
--  · uma encomenda criada a partir de uma proforma fica em nome de quem fez a proforma (recebe os avisos);
--  · quem cria encomendas pode escrever o transporte e o tracking em qualquer altura.
create or replace function public.log_encomendas_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if auth.uid() is not null then new.atualizado_por := auth.uid(); end if;
  if tg_op = 'INSERT' then
    if auth.uid() is not null and not (coalesce(current_setting('central26.proforma', true), '') = '1' and new.criado_por is not null) then
      new.criado_por := auth.uid();
    end if;
    if not public.pode_encomendas() and auth.uid() is not null then raise exception 'Sem permissão para criar encomendas.'; end if;
    return new;
  end if;
  new.numero := old.numero; new.criado_por := old.criado_por; new.criado_em := old.criado_em;
  if auth.uid() is not null and not public.e_logistica() then
    if public.pode_encomendas()
       and (to_jsonb(new) - array['transportadora','tracking','atualizado_em','atualizado_por'])
           = (to_jsonb(old) - array['transportadora','tracking','atualizado_em','atualizado_por']) then
      null; -- transporte e tracking
    elsif public.pode_rotas() and old.estado in ('pronta','em_rota','entregue') and new.estado in ('pronta','em_rota','entregue')
       and (to_jsonb(new) - array['estado','rota_id','lat','lng','morada_geo','atualizado_em','atualizado_por','entregue_em','entregue_por'])
           = (to_jsonb(old) - array['estado','rota_id','lat','lng','morada_geo','atualizado_em','atualizado_por','entregue_em','entregue_por']) then
      null; -- entrega
    elsif public.pode_rotas() and new.estado is not distinct from old.estado
       and (to_jsonb(new) - array['rota_id','lat','lng','morada_geo','atualizado_em','atualizado_por'])
           = (to_jsonb(old) - array['rota_id','lat','lng','morada_geo','atualizado_em','atualizado_por']) then
      null; -- juntar a uma rota ou guardar a localização
    elsif public.pode_rotas() and new.estado in ('em_rota','entregue') and old.estado not in ('pronta','em_rota','entregue') then
      raise exception 'A encomenda % ainda não está pronta. Só pode ser entregue depois de a Logística a preparar.', 'E-' || lpad(old.numero::text, 4, '0');
    else
      if old.criado_por is distinct from auth.uid() then raise exception 'Só a Logística e a direção alteram encomendas de outras pessoas.'; end if;
      if old.estado <> 'nova' and new.estado <> 'cancelada' then raise exception 'Esta encomenda já está com a Logística. Pede as alterações à Logística ou cancela-a.'; end if;
      if new.estado not in ('nova','cancelada') then raise exception 'Só a Logística prepara a encomenda. Podes entregá-la quando estiver pronta.'; end if;
    end if;
  end if;
  if new.morada is distinct from old.morada and new.morada_geo is not distinct from old.morada_geo then
    new.lat := null; new.lng := null; new.morada_geo := '';
  end if;
  if new.estado = 'entregue' and old.estado <> 'entregue' then new.entregue_em := now(); new.entregue_por := auth.uid();
  elsif new.estado <> 'entregue' then new.entregue_em := null; new.entregue_por := null; end if;
  new.tracking := trim(new.tracking);
  return new;
end $$;

-- Tracking escrito: quem fatura imprime a etiqueta; quem fez a encomenda fica a saber que seguiu.
create or replace function public.log_encomendas_tracking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a uuid := auth.uid();
  v_ref text := 'E-' || lpad(new.numero::text, 4, '0');
  v_fat uuid;
begin
  if new.tracking = '' or new.tracking is not distinct from old.tracking then return new; end if;
  select faturador into v_fat from public.com_config where id = 1;
  if v_fat is not null and v_fat is distinct from a then
    insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
    values (v_fat, 'encomenda', 'Etiqueta Nacex para imprimir · ' || v_ref, new.cliente_nome || ' · tracking ' || new.tracking, '#encomenda-' || new.id);
  end if;
  if new.criado_por is not null and new.criado_por is distinct from a and new.criado_por is distinct from v_fat then
    insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
    values (new.criado_por, 'encomenda', 'Encomenda ' || v_ref || ' com tracking', new.cliente_nome || ' · ' || new.tracking, '#encomenda-' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists log_encomendas_tracking on public.log_encomendas;
create trigger log_encomendas_tracking after update of tracking on public.log_encomendas
  for each row execute function public.log_encomendas_tracking();

-- Tarefas criadas pela própria Central (por exemplo, «Faturar PF-0007») podem ser atribuídas a quem fatura,
-- mesmo que quem aceitou a proforma não possa atribuir tarefas a essa pessoa. Igual ao do schema.sql, com essa exceção.
create or replace function public.tarefas_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_sistema boolean := coalesce(current_setting('central26.sistema', true), '') = '1';
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.criado_por := auth.uid();
      if not v_sistema and not public.pode_atribuir(new.responsavel_id) then
        raise exception 'Não tens permissão para atribuir tarefas a esta pessoa.';
      end if;
    elsif new.responsavel_id is distinct from old.responsavel_id
          and not v_sistema and not public.pode_atribuir(new.responsavel_id) then
      raise exception 'Não tens permissão para atribuir tarefas a esta pessoa.';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.criado_por := old.criado_por;
    new.criado_em  := old.criado_em;
    new.atualizado_em := now();
    if new.estado = 'concluido' and (old.estado <> 'concluido' or new.estado_periodo is distinct from old.estado_periodo) then
      new.concluido_por := auth.uid();
      new.concluido_em  := now();
    elsif new.estado <> 'concluido' then
      new.concluido_por := null;
      new.concluido_em  := null;
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 5. Passos da proforma
-- ---------------------------------------------------------------------
create or replace function public.com_eur(v numeric) returns text
language sql immutable as $$ select replace(to_char(round(coalesce(v, 0), 2), 'FM999999990.00'), '.', ',') $$;

-- Cliente aceitou: cria a tarefa para quem fatura
create or replace function public.com_proforma_aceitar(p_id uuid) returns public.com_proformas
language plpgsql security definer set search_path = public as $$
declare
  pf public.com_proformas; cfg public.com_config; v_ref text; v_linhas text; v_tarefa uuid;
begin
  if not (public.pode_crm() or public.e_gestor()) then raise exception 'Sem permissão.'; end if;
  select * into pf from public.com_proformas where id = p_id for update;
  if pf.id is null then raise exception 'A proforma já não existe.'; end if;
  v_ref := 'PF-' || lpad(pf.numero::text, 4, '0');
  if pf.estado not in ('rascunho','enviada') then raise exception 'A proforma % não está à espera do cliente.', v_ref; end if;
  if pf.subtotal <= 0 then raise exception 'A proforma % não tem artigos.', v_ref; end if;
  select * into cfg from public.com_config where id = 1;
  if cfg.faturador is null then raise exception 'Falta escolher quem fatura as proformas: Comercial → Proformas → Definições.'; end if;

  select string_agg(coalesce(i->>'qtd','0') || '× ' || coalesce(i->>'descricao', i->>'codigo', '') || ' a ' || public.com_eur((i->>'preco')::numeric) || ' €', E'\n')
    into v_linhas from jsonb_array_elements(pf.itens) i where coalesce(nullif(i->>'qtd','')::numeric, 0) > 0;

  perform set_config('central26.sistema', '1', true);
  insert into public.tarefas (titulo, marca, freq, prioridade, responsavel_id, prazo, notas)
  values ('Faturar ' || v_ref || ' · ' || coalesce(nullif(pf.cliente->>'nome', ''), 'cliente'), 'twentysix', 'unica', 'alta', cfg.faturador, current_date,
          'Criar a fatura no Multixop e escrever o número na Central (Comercial → Proformas → ' || v_ref || ').' || E'\n\n' ||
          'Cliente: ' || coalesce(pf.cliente->>'nome', '') || coalesce(nullif(' · NIF ' || coalesce(pf.cliente->>'nif', ''), ' · NIF '), '') || E'\n' ||
          coalesce(v_linhas, '') || E'\n' ||
          case when pf.embaixador and pf.desc_embaixador > 0 then 'Desconto de embaixador: ' || public.com_eur(pf.desc_embaixador) || '%' || E'\n' else '' end ||
          case when pf.desconto > 0 then 'Desconto: ' || public.com_eur(pf.desconto) || '%' || E'\n' else '' end ||
          'Total sem IVA: ' || public.com_eur(pf.total_sem_iva) || ' €' ||
          case pf.envio when 'nacex' then E'\nEnvio pela Nacex.' when 'levanta' then E'\nO cliente levanta.' else E'\nEntrega nossa.' end)
  returning id into v_tarefa;
  perform set_config('central26.sistema', '', true);

  perform set_config('central26.proforma', '1', true);
  update public.com_proformas set estado = 'aceite', aceite_em = now(), tarefa_id = v_tarefa where id = p_id returning * into pf;
  perform set_config('central26.proforma', '', true);
  return pf;
end $$;

-- Fatura criada no Multixop: a proforma passa a encomenda para a Logística
create or replace function public.com_proforma_faturar(p_id uuid, p_fatura text) returns public.com_proformas
language plpgsql security definer set search_path = public as $$
declare
  pf public.com_proformas; cfg public.com_config; v_ref text; v_enc uuid; v_itens jsonb; v_morada text;
begin
  if not (public.e_gestor() or public.e_faturador()) then raise exception 'Só quem fatura as proformas (ou a direção) pode marcar a fatura.'; end if;
  if coalesce(trim(p_fatura), '') = '' then raise exception 'Escreve o número da fatura do Multixop.'; end if;
  select * into pf from public.com_proformas where id = p_id for update;
  if pf.id is null then raise exception 'A proforma já não existe.'; end if;
  v_ref := 'PF-' || lpad(pf.numero::text, 4, '0');
  if pf.estado <> 'aceite' then raise exception 'A proforma % não está à espera da fatura.', v_ref; end if;
  select * into cfg from public.com_config where id = 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', 'i' || n, 'descricao', coalesce(nullif(i->>'descricao', ''), i->>'codigo'), 'qtd', (i->>'qtd')::numeric, 'preparado', false,
           'produto_id', (select s.id from public.stk_produtos s where s.ativo and s.codigo_multixop is not null and s.codigo_multixop = i->>'codigo' limit 1))
         order by n), '[]'::jsonb)
    into v_itens
    from jsonb_array_elements(pf.itens) with ordinality t(i, n)
   where coalesce(nullif(i->>'qtd','')::numeric, 0) > 0;
  -- tira as chaves vazias (artigos sem produto no stock)
  select coalesce(jsonb_agg(jsonb_strip_nulls(x)), '[]'::jsonb) into v_itens from jsonb_array_elements(v_itens) x;

  v_morada := concat_ws(', ', nullif(pf.cliente->>'morada', ''), nullif(trim(concat_ws(' ', pf.cliente->>'cp', pf.cliente->>'localidade')), ''));

  perform set_config('central26.proforma', '1', true);
  insert into public.log_encomendas (tipo, estado, prioridade, cliente_nome, crm_cliente_id, contacto, morada, itens, notas, fatura_numero,
                                     criado_por, transportadora, envio, proforma_id)
  values ('encomenda', 'nova', 'media', coalesce(nullif(pf.cliente->>'nome', ''), 'Cliente'), pf.cliente_id,
          coalesce(nullif(pf.cliente->>'telefone', ''), pf.cliente->>'telemovel', ''), coalesce(v_morada, ''), v_itens,
          v_ref || case when pf.notas <> '' then E'\n' || pf.notas else '' end, trim(p_fatura),
          pf.criado_por, case pf.envio when 'nacex' then 'nacex' when 'levanta' then 'levanta' else '' end,
          pf.cliente || jsonb_build_object('servico', cfg.nacex_servico), pf.id)
  returning id into v_enc;

  update public.com_proformas set estado = 'faturada', fatura_numero = trim(p_fatura), encomenda_id = v_enc,
         faturada_em = now(), faturada_por = auth.uid() where id = p_id returning * into pf;
  perform set_config('central26.proforma', '', true);

  if pf.tarefa_id is not null then
    update public.tarefas set estado = 'concluido' where id = pf.tarefa_id and estado <> 'concluido';
  end if;
  return pf;
end $$;

-- Cancelar (antes de faturada). Se já havia tarefa para faturar, a tarefa é apagada.
create or replace function public.com_proforma_cancelar(p_id uuid) returns public.com_proformas
language plpgsql security definer set search_path = public as $$
declare pf public.com_proformas;
begin
  if not (public.pode_crm() or public.e_gestor() or public.e_faturador()) then raise exception 'Sem permissão.'; end if;
  select * into pf from public.com_proformas where id = p_id for update;
  if pf.id is null then raise exception 'A proforma já não existe.'; end if;
  if pf.estado = 'faturada' then raise exception 'A proforma já foi faturada: cancela a encomenda na Logística e faz a nota de crédito no Multixop.'; end if;
  if pf.estado = 'cancelada' then return pf; end if;
  if pf.tarefa_id is not null then delete from public.tarefas where id = pf.tarefa_id; end if;
  perform set_config('central26.proforma', '1', true);
  update public.com_proformas set estado = 'cancelada', tarefa_id = null where id = p_id returning * into pf;
  perform set_config('central26.proforma', '', true);
  return pf;
end $$;

-- Voltar a abrir uma proforma aceite (o cliente quer mudar alguma coisa antes da fatura)
create or replace function public.com_proforma_reabrir(p_id uuid) returns public.com_proformas
language plpgsql security definer set search_path = public as $$
declare pf public.com_proformas;
begin
  if not (public.pode_crm() or public.e_gestor()) then raise exception 'Sem permissão.'; end if;
  select * into pf from public.com_proformas where id = p_id for update;
  if pf.id is null then raise exception 'A proforma já não existe.'; end if;
  if pf.estado not in ('aceite','cancelada') then raise exception 'Só se volta a abrir uma proforma aceite (ainda sem fatura) ou cancelada.'; end if;
  if pf.tarefa_id is not null then delete from public.tarefas where id = pf.tarefa_id; end if;
  perform set_config('central26.proforma', '1', true);
  update public.com_proformas set estado = 'enviada', tarefa_id = null, aceite_em = null where id = p_id returning * into pf;
  perform set_config('central26.proforma', '', true);
  return pf;
end $$;

-- ---------------------------------------------------------------------
-- 6. Acessos
-- ---------------------------------------------------------------------
alter table public.com_precos enable row level security;
alter table public.com_config enable row level security;
alter table public.com_proformas enable row level security;

drop policy if exists com_precos_ler on public.com_precos;
create policy com_precos_ler on public.com_precos for select to authenticated using (public.pode_crm() or public.e_faturador());
drop policy if exists com_precos_mudar on public.com_precos;
create policy com_precos_mudar on public.com_precos for all to authenticated using (public.e_gestor()) with check (public.e_gestor());

drop policy if exists com_config_ler on public.com_config;
create policy com_config_ler on public.com_config for select to authenticated using (public.pode_crm() or public.pode_encomendas() or public.e_faturador());
drop policy if exists com_config_mudar on public.com_config;
create policy com_config_mudar on public.com_config for update to authenticated using (public.e_gestor()) with check (public.e_gestor());

drop policy if exists com_proformas_ler on public.com_proformas;
create policy com_proformas_ler on public.com_proformas for select to authenticated using (public.pode_crm() or public.e_faturador());
drop policy if exists com_proformas_criar on public.com_proformas;
create policy com_proformas_criar on public.com_proformas for insert to authenticated with check (public.pode_crm());
drop policy if exists com_proformas_editar on public.com_proformas;
create policy com_proformas_editar on public.com_proformas for update to authenticated using (public.pode_crm()) with check (public.pode_crm());
drop policy if exists com_proformas_apagar on public.com_proformas;
create policy com_proformas_apagar on public.com_proformas for delete to authenticated
  using (public.e_gestor() or (criado_por = auth.uid() and estado in ('rascunho','enviada')));

revoke all on public.com_precos, public.com_config, public.com_proformas from anon;
grant select, insert, update, delete on public.com_precos, public.com_proformas to authenticated;
grant select, update on public.com_config to authenticated;

revoke all on function public.com_proforma_aceitar(uuid), public.com_proforma_faturar(uuid, text), public.com_proforma_cancelar(uuid),
                       public.com_proforma_reabrir(uuid), public.e_faturador(), public.com_eur(numeric) from public, anon;
grant execute on function public.com_proforma_aceitar(uuid), public.com_proforma_faturar(uuid, text), public.com_proforma_cancelar(uuid),
                          public.com_proforma_reabrir(uuid), public.e_faturador(), public.com_eur(numeric) to authenticated;
revoke all on function public.com_carimbo(), public.com_proformas_antes(), public.log_encomendas_tracking() from public, anon, authenticated;

-- tempo real (a lista de proformas atualiza-se sozinha)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'com_proformas') then
    alter publication supabase_realtime add table public.com_proformas;
  end if;
end $$;
