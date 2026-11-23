-- =====================================================================
-- Central 26 · 25 · Lojas (responsáveis, stock, pedidos, trocos, manutenção, aluguer de cadeiras)
--                    e parcerias da TwentySix (embaixador / influencer)
-- Correr no Supabase: SQL Editor → New query → colar tudo → Run.
-- Pode ser corrido mais do que uma vez. Corre-se depois do 24.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Parcerias: embaixador ou influencer (um ou outro).
--    O desconto de parceria não acumula com os escalões: só se aplica no preço Base.
-- ---------------------------------------------------------------------
do $$
declare v_novo boolean := not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'com_config' and column_name = 'desconto_influencer');
begin
  alter table public.com_config add column if not exists desconto_influencer numeric(5,2) not null default 5;
  if v_novo then
    -- até aqui o «embaixador» a 5% era, na verdade, o influencer; o desconto de embaixador fica por definir
    update public.com_config set desconto_influencer = desconto_embaixador, desconto_embaixador = 0 where id = 1;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'com_config_influencer_ck') then
    alter table public.com_config add constraint com_config_influencer_ck check (desconto_influencer between 0 and 100);
  end if;
end $$;

alter table public.crm_clientes add column if not exists parceria text not null default '';
alter table public.com_proformas add column if not exists parceria text not null default '';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crm_clientes_parceria_ck') then
    update public.crm_clientes set parceria = 'influencer' where embaixador and parceria = '';
    alter table public.crm_clientes add constraint crm_clientes_parceria_ck check (parceria in ('','embaixador','influencer'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'com_proformas_parceria_ck') then
    perform set_config('central26.proforma', '1', true);
    update public.com_proformas set parceria = 'influencer' where embaixador and parceria = '';
    perform set_config('central26.proforma', '', true);
    alter table public.com_proformas add constraint com_proformas_parceria_ck check (parceria in ('','embaixador','influencer'));
  end if;
end $$;

-- Igual ao do 24, com o desconto de parceria (desc_embaixador guarda a percentagem da parceria escolhida)
create or replace function public.com_proformas_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_sub numeric := 0; v_par numeric;
begin
  new.atualizado_em := now();
  if auth.uid() is not null then new.atualizado_por := auth.uid(); end if;
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.criado_por := auth.uid(); end if;
    new.estado := 'rascunho'; new.fatura_numero := ''; new.tarefa_id := null; new.encomenda_id := null;
    new.aceite_em := null; new.faturada_em := null; new.faturada_por := null;
  else
    new.numero := old.numero; new.criado_por := old.criado_por; new.criado_em := old.criado_em;
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
  -- parceria: não acumula com o escalão
  new.embaixador := new.parceria <> '' and new.escalao = 'base';
  v_par := case when new.embaixador then new.desc_embaixador else 0 end;
  select coalesce(sum(round(greatest(coalesce(nullif(i->>'qtd','')::numeric, 0), 0) * greatest(coalesce(nullif(i->>'preco','')::numeric, 0), 0), 2)), 0)
    into v_sub from jsonb_array_elements(new.itens) i;
  new.subtotal := v_sub;
  new.total_sem_iva := round(v_sub * (1 - v_par / 100) * (1 - new.desconto / 100), 2);
  return new;
end $$;

-- texto da tarefa de faturação com o nome certo da parceria
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
          case when pf.embaixador and pf.desc_embaixador > 0 then 'Desconto de ' || pf.parceria || ': ' || public.com_eur(pf.desc_embaixador) || '%' || E'\n' else '' end ||
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

-- ---------------------------------------------------------------------
-- 2. Lojas e responsáveis
-- ---------------------------------------------------------------------
create table if not exists public.loj_lojas (
  id             text primary key,
  nome           text not null,
  responsavel_id uuid references public.perfis(id) on delete set null,
  ativo          boolean not null default true,
  ordem          int not null default 0
);
insert into public.loj_lojas (id, nome, ordem) values
  ('morro', 'Jardim do Morro', 1), ('santo-ovidio', 'Santo Ovídio', 2), ('porto', 'Porto', 3), ('arcozelo', 'Arcozelo', 4), ('madalena', 'Madalena', 5)
on conflict (id) do nothing;

create or replace function public.e_resp_loja(p_loja text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.loj_lojas where id = p_loja and responsavel_id = auth.uid() and ativo)
$$;
create or replace function public.pode_lojas() returns boolean
language sql stable security definer set search_path = public as $$
  select public.e_gestor() or public.e_logistica() or exists (select 1 from public.loj_lojas where responsavel_id = auth.uid() and ativo)
$$;

-- artigos que as lojas gastam e pedem (consumíveis e produtos)
create table if not exists public.loj_itens (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null check (length(trim(nome)) > 0),
  categoria text not null default 'consumivel' check (categoria in ('consumivel','produto')),
  unidade   text not null default 'un.',
  ativo     boolean not null default true,
  ordem     int not null default 0,
  criado_em timestamptz not null default now()
);
create unique index if not exists loj_itens_nome on public.loj_itens (lower(nome));
insert into public.loj_itens (nome, categoria, unidade, ordem) values
  ('Luvas de látex', 'consumivel', 'caixa', 1), ('Papel higiénico', 'consumivel', 'rolo', 2), ('Rolo de papel de cozinha', 'consumivel', 'rolo', 3),
  ('Esfregona', 'consumivel', 'un.', 4), ('Líquido de chão', 'consumivel', 'garrafa', 5), ('WC Pato', 'consumivel', 'un.', 6),
  ('Bloco sanitário (pendurar na sanita)', 'consumivel', 'un.', 7), ('Multiusos', 'consumivel', 'garrafa', 8), ('Líquido de vidros', 'consumivel', 'garrafa', 9),
  ('Ambientador (Ambipur)', 'consumivel', 'un.', 10), ('Água de colónia', 'consumivel', 'garrafa', 11), ('Sacos do lixo 50 L', 'consumivel', 'rolo', 12),
  ('Sacos do lixo 10 L', 'consumivel', 'rolo', 13), ('Rebuçados', 'consumivel', 'saco', 14)
on conflict do nothing;

create table if not exists public.loj_stock (
  loja_id        text not null references public.loj_lojas(id) on delete cascade,
  item_id        uuid not null references public.loj_itens(id) on delete cascade,
  quantidade     int check (quantidade is null or quantidade >= 0),
  minimo         int check (minimo is null or minimo >= 0),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references public.perfis(id) on delete set null,
  primary key (loja_id, item_id)
);
create or replace function public.loj_stock_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.atualizado_em := now(); new.atualizado_por := coalesce(auth.uid(), new.atualizado_por); return new; end $$;
drop trigger if exists loj_stock_antes on public.loj_stock;
create trigger loj_stock_antes before insert or update on public.loj_stock for each row execute function public.loj_stock_antes();

-- ---------------------------------------------------------------------
-- 3. Pedidos das lojas: semanal (artigos), trocos e manutenção
-- estado: pedido → em_curso → feito · cancelado
-- itens: [{ item_id, nome, qtd }] · trocos: { "2": n, "1": n, "0.5": n } (número de moedas)
-- ---------------------------------------------------------------------
create table if not exists public.loj_pedidos (
  id          uuid primary key default gen_random_uuid(),
  numero      bigint generated always as identity,
  loja_id     text not null references public.loj_lojas(id) on delete cascade,
  tipo        text not null check (tipo in ('semanal','trocos','manutencao')),
  estado      text not null default 'pedido' check (estado in ('pedido','em_curso','feito','cancelado')),
  itens       jsonb not null default '[]'::jsonb,
  trocos      jsonb not null default '{}'::jsonb,
  descricao   text not null default '',
  urgente     boolean not null default false,
  resposta    text not null default '',
  criado_por  uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  tratado_por uuid references public.perfis(id) on delete set null,
  feito_em    timestamptz,
  stock_somado boolean not null default false
);
create index if not exists loj_pedidos_estado on public.loj_pedidos (estado, criado_em desc);

create table if not exists public.loj_config (
  id                int primary key default 1 check (id = 1),
  recebe_semanal    uuid[] not null default '{}',   -- vazio: Logística
  recebe_trocos     uuid[] not null default '{}',   -- vazio: direção
  recebe_manutencao uuid[] not null default '{}',   -- vazio: direção
  atualizado_em     timestamptz not null default now()
);
insert into public.loj_config (id) values (1) on conflict do nothing;

create or replace function public.loj_destinatarios(p_tipo text) returns setof uuid
language sql stable security definer set search_path = public as $$
  with c as (select case p_tipo when 'semanal' then recebe_semanal when 'trocos' then recebe_trocos else recebe_manutencao end as l from public.loj_config where id = 1)
  select p.id from public.perfis p, c
   where p.ativo and (case when cardinality(c.l) > 0 then p.id = any (c.l)
                           when p_tipo = 'semanal' then p.departamento_id = 'logistica' or p.papel in ('ceo','admin')
                           else p.papel in ('ceo','admin') end)
$$;
create or replace function public.pode_tratar_pedido(p_tipo text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.e_gestor() or (p_tipo = 'semanal' and public.e_logistica()) or auth.uid() in (select public.loj_destinatarios(p_tipo))
$$;

create or replace function public.loj_pedidos_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_trata boolean;
begin
  new.atualizado_em := now();
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.criado_por := auth.uid();
      if not (public.e_gestor() or public.e_resp_loja(new.loja_id)) then raise exception 'Só o responsável da loja (ou a direção) faz pedidos para esta loja.'; end if;
    end if;
    new.estado := 'pedido'; new.tratado_por := null; new.feito_em := null; new.stock_somado := false; new.resposta := '';
    if new.tipo = 'semanal' and jsonb_array_length(coalesce(new.itens, '[]'::jsonb)) = 0 then raise exception 'O pedido não tem artigos.'; end if;
    if new.tipo = 'manutencao' and trim(new.descricao) = '' then raise exception 'Descreve o que precisa de manutenção.'; end if;
    return new;
  end if;
  new.numero := old.numero; new.loja_id := old.loja_id; new.tipo := old.tipo; new.criado_por := old.criado_por; new.criado_em := old.criado_em;
  if coalesce(current_setting('central26.loja', true), '') <> '1' then new.stock_somado := old.stock_somado; end if;
  if auth.uid() is not null then
    v_trata := public.pode_tratar_pedido(old.tipo);
    if not v_trata then
      -- quem pediu só altera enquanto está «pedido» e pode cancelar
      if old.criado_por is distinct from auth.uid() and not public.e_resp_loja(old.loja_id) then raise exception 'Sem permissão para alterar este pedido.'; end if;
      if old.estado <> 'pedido' then raise exception 'O pedido já está a ser tratado. Fala com quem o está a tratar.'; end if;
      if new.estado not in ('pedido','cancelado') then raise exception 'Só quem trata os pedidos muda o estado.'; end if;
      new.resposta := old.resposta;
    end if;
    if new.estado is distinct from old.estado and new.estado in ('em_curso','feito') then new.tratado_por := auth.uid(); end if;
  end if;
  if new.estado = 'feito' and old.estado <> 'feito' then new.feito_em := now();
  elsif new.estado <> 'feito' then new.feito_em := null; end if;
  return new;
end $$;
drop trigger if exists loj_pedidos_antes on public.loj_pedidos;
create trigger loj_pedidos_antes before insert or update on public.loj_pedidos for each row execute function public.loj_pedidos_antes();

-- avisos e, quando o pedido semanal fica feito, os artigos entram no stock da loja
create or replace function public.loj_pedidos_depois() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a uuid := auth.uid(); p uuid; v_loja text; v_ref text := 'P-' || lpad(new.numero::text, 4, '0');
  v_tipo text := case new.tipo when 'semanal' then 'Pedido da semana' when 'trocos' then 'Pedido de trocos' else 'Pedido de manutenção' end;
  v_autor text; i jsonb;
begin
  select nome into v_loja from public.loj_lojas where id = new.loja_id;
  select nome into v_autor from public.perfis where id = a;
  if tg_op = 'INSERT' then
    for p in select public.loj_destinatarios(new.tipo) loop
      if p is distinct from a then
        insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
        values (p, 'loja', (case when new.urgente then 'Urgente · ' else '' end) || v_tipo || ' · ' || v_loja,
                coalesce(v_autor, 'Alguém') || ' · ' || case new.tipo
                  when 'semanal' then (select string_agg(coalesce(x->>'qtd','1') || '× ' || (x->>'nome'), ', ') from jsonb_array_elements(new.itens) x)
                  when 'trocos' then concat_ws(', ', nullif((new.trocos->>'2'), '0') || ' moedas de 2 €', nullif((new.trocos->>'1'), '0') || ' de 1 €', nullif((new.trocos->>'0.5'), '0') || ' de 0,50 €')
                  else left(new.descricao, 120) end, '#lojas-pedidos');
      end if;
    end loop;
    return new;
  end if;
  if new.estado is distinct from old.estado and new.criado_por is not null and new.criado_por is distinct from a and new.estado in ('em_curso','feito','cancelado') then
    insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
    values (new.criado_por, 'loja', v_tipo || ' ' || case new.estado when 'em_curso' then 'a ser tratado' when 'feito' then 'feito' else 'cancelado' end,
            v_loja || coalesce(' · ' || nullif(new.resposta, ''), ''), '#lojas-pedidos');
  end if;
  if new.tipo = 'semanal' and new.estado = 'feito' and not new.stock_somado then
    for i in select * from jsonb_array_elements(new.itens) loop
      if coalesce(i->>'item_id', '') ~ '^[0-9a-f-]{36}$' and exists (select 1 from public.loj_itens where id = (i->>'item_id')::uuid) then
        insert into public.loj_stock (loja_id, item_id, quantidade) values (new.loja_id, (i->>'item_id')::uuid, greatest(coalesce(nullif(i->>'qtd','')::int, 0), 0))
        on conflict (loja_id, item_id) do update set quantidade = coalesce(public.loj_stock.quantidade, 0) + excluded.quantidade;
      end if;
    end loop;
    perform set_config('central26.loja', '1', true);
    update public.loj_pedidos set stock_somado = true where id = new.id;
    perform set_config('central26.loja', '', true);
  end if;
  return new;
end $$;
drop trigger if exists loj_pedidos_depois on public.loj_pedidos;
create trigger loj_pedidos_depois after insert or update of estado on public.loj_pedidos for each row execute function public.loj_pedidos_depois();

-- ---------------------------------------------------------------------
-- 4. Aluguer de cadeiras (só a direção e o financeiro)
-- Valor do mês = valor fixo + percentagem × faturação bruta do barbeiro. A fatura sai do Multixop.
-- ---------------------------------------------------------------------
create table if not exists public.loj_cadeiras (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (length(trim(nome)) > 0),
  nif         text not null default '',
  loja_id     text references public.loj_lojas(id) on delete set null,
  fixo        numeric(10,2) not null default 300 check (fixo >= 0),
  percentagem numeric(5,2) not null default 5 check (percentagem between 0 and 100),
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);
create table if not exists public.loj_cadeiras_mes (
  cadeira_id    uuid not null references public.loj_cadeiras(id) on delete cascade,
  mes           text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  bruto         numeric(12,2) check (bruto is null or bruto >= 0),
  fatura_numero text not null default '',
  atualizado_em timestamptz not null default now(),
  primary key (cadeira_id, mes)
);

-- ---------------------------------------------------------------------
-- 5. Acessos
-- ---------------------------------------------------------------------
alter table public.loj_lojas enable row level security;
alter table public.loj_itens enable row level security;
alter table public.loj_stock enable row level security;
alter table public.loj_pedidos enable row level security;
alter table public.loj_config enable row level security;
alter table public.loj_cadeiras enable row level security;
alter table public.loj_cadeiras_mes enable row level security;

drop policy if exists loj_lojas_ler on public.loj_lojas;
create policy loj_lojas_ler on public.loj_lojas for select to authenticated using (public.e_membro());
drop policy if exists loj_lojas_mudar on public.loj_lojas;
create policy loj_lojas_mudar on public.loj_lojas for all to authenticated using (public.e_gestor()) with check (public.e_gestor());

drop policy if exists loj_itens_ler on public.loj_itens;
create policy loj_itens_ler on public.loj_itens for select to authenticated using (public.pode_lojas());
drop policy if exists loj_itens_mudar on public.loj_itens;
create policy loj_itens_mudar on public.loj_itens for all to authenticated using (public.e_gestor() or public.e_logistica()) with check (public.e_gestor() or public.e_logistica());

drop policy if exists loj_stock_ler on public.loj_stock;
create policy loj_stock_ler on public.loj_stock for select to authenticated using (public.e_gestor() or public.e_logistica() or public.e_resp_loja(loja_id));
drop policy if exists loj_stock_mudar on public.loj_stock;
create policy loj_stock_mudar on public.loj_stock for all to authenticated
  using (public.e_gestor() or public.e_logistica() or public.e_resp_loja(loja_id)) with check (public.e_gestor() or public.e_logistica() or public.e_resp_loja(loja_id));

drop policy if exists loj_pedidos_ler on public.loj_pedidos;
create policy loj_pedidos_ler on public.loj_pedidos for select to authenticated
  using (public.e_resp_loja(loja_id) or criado_por = auth.uid() or public.pode_tratar_pedido(tipo));
drop policy if exists loj_pedidos_criar on public.loj_pedidos;
create policy loj_pedidos_criar on public.loj_pedidos for insert to authenticated with check (public.e_gestor() or public.e_resp_loja(loja_id));
drop policy if exists loj_pedidos_editar on public.loj_pedidos;
create policy loj_pedidos_editar on public.loj_pedidos for update to authenticated
  using (public.e_resp_loja(loja_id) or criado_por = auth.uid() or public.pode_tratar_pedido(tipo))
  with check (public.e_resp_loja(loja_id) or criado_por = auth.uid() or public.pode_tratar_pedido(tipo));
drop policy if exists loj_pedidos_apagar on public.loj_pedidos;
create policy loj_pedidos_apagar on public.loj_pedidos for delete to authenticated using (public.e_gestor());

drop policy if exists loj_config_ler on public.loj_config;
create policy loj_config_ler on public.loj_config for select to authenticated using (public.pode_lojas());
drop policy if exists loj_config_mudar on public.loj_config;
create policy loj_config_mudar on public.loj_config for update to authenticated using (public.e_gestor()) with check (public.e_gestor());

drop policy if exists loj_cadeiras_tudo on public.loj_cadeiras;
create policy loj_cadeiras_tudo on public.loj_cadeiras for all to authenticated using (public.pode_financeiro()) with check (public.pode_financeiro());
drop policy if exists loj_cadeiras_mes_tudo on public.loj_cadeiras_mes;
create policy loj_cadeiras_mes_tudo on public.loj_cadeiras_mes for all to authenticated using (public.pode_financeiro()) with check (public.pode_financeiro());

revoke all on public.loj_lojas, public.loj_itens, public.loj_stock, public.loj_pedidos, public.loj_config, public.loj_cadeiras, public.loj_cadeiras_mes from anon;
grant select, insert, update, delete on public.loj_lojas, public.loj_itens, public.loj_stock, public.loj_pedidos, public.loj_cadeiras, public.loj_cadeiras_mes to authenticated;
grant select, update on public.loj_config to authenticated;

revoke all on function public.e_resp_loja(text), public.pode_lojas(), public.loj_destinatarios(text), public.pode_tratar_pedido(text) from public, anon;
grant execute on function public.e_resp_loja(text), public.pode_lojas(), public.loj_destinatarios(text), public.pode_tratar_pedido(text) to authenticated;
revoke all on function public.loj_stock_antes(), public.loj_pedidos_antes(), public.loj_pedidos_depois() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'loj_pedidos') then
      alter publication supabase_realtime add table public.loj_pedidos;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'loj_stock') then
      alter publication supabase_realtime add table public.loj_stock;
    end if;
  end if;
end $$;
