-- =====================================================================
-- Central 26 · 08 · Operacional: fornecedores, contactos e pedidos de orçamento
-- Correr uma vez no Supabase: SQL Editor → New query → colar tudo → Run
-- Pode voltar a ser corrido sem apagar dados.
--
-- Quem vê e gere: direção (CEO e administração) e departamento Operacional.
-- =====================================================================

create or replace function public.pode_operacional() returns boolean
language sql stable security definer set search_path = public as $$
  select public.e_gestor() or coalesce(public.meu_departamento() = 'operacional', false)
$$;

create table if not exists public.op_fornecedores (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null check (length(trim(nome)) > 0),
  nif               text not null default '',
  categoria         text not null default '',
  estado            text not null default 'ativo' check (estado in ('potencial','contactado','proposta','negociacao','ativo','inativo')),
  marcas            text[] not null default '{}',
  produtos          text not null default '',       -- o que fornece
  contacto_nome     text not null default '',
  telefone          text not null default '',
  email             text not null default '',
  site              text not null default '',
  morada            text not null default '',
  localidade        text not null default '',
  pais              text not null default 'Portugal',
  prazo_pagamento   text not null default '',
  prazo_entrega     text not null default '',
  encomenda_minima  text not null default '',
  avaliacao         int check (avaliacao between 1 and 5),
  responsavel_id    uuid references public.perfis(id) on delete set null,
  proximo_contacto  date,
  notas             text not null default '',
  origem            text not null default 'manual' check (origem in ('manual','saft','despesas','importacao')),
  criado_por        uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em         timestamptz not null default now(),
  atualizado_por    uuid references public.perfis(id) on delete set null,
  atualizado_em     timestamptz not null default now()
);
create unique index if not exists op_forn_nome on public.op_fornecedores (lower(nome));

create table if not exists public.op_contactos (
  id             uuid primary key default gen_random_uuid(),
  fornecedor_id  uuid not null references public.op_fornecedores(id) on delete cascade,
  tipo           text not null default 'chamada' check (tipo in ('chamada','email','reuniao','visita','orcamento','outro')),
  resumo         text not null check (length(trim(resumo)) > 0),
  proximo_passo  text not null default '',
  data           timestamptz not null default now(),
  autor_id       uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em      timestamptz not null default now()
);
create index if not exists op_contactos_forn on public.op_contactos (fornecedor_id, data desc);

create table if not exists public.op_pedidos (
  id              uuid primary key default gen_random_uuid(),
  numero          int generated always as identity,
  titulo          text not null check (length(trim(titulo)) > 0),
  descricao       text not null default '',
  categoria       text not null default '',
  marca           text not null default 'grupo' check (marca in ('twentysix','barbearia','academy','tech','grooms','grupo')),
  quantidade      text not null default '',
  prazo           date,                               -- até quando é preciso decidir
  estado          text not null default 'aberto' check (estado in ('aberto','a_comparar','decidido','cancelado')),
  responsavel_id  uuid references public.perfis(id) on delete set null,
  escolhida_id    uuid,
  decisao         text not null default '',           -- porque foi escolhida esta proposta
  criado_por      uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create table if not exists public.op_propostas (
  id             uuid primary key default gen_random_uuid(),
  pedido_id      uuid not null references public.op_pedidos(id) on delete cascade,
  fornecedor_id  uuid not null references public.op_fornecedores(id) on delete cascade,
  estado         text not null default 'pedida' check (estado in ('pedida','recebida','recusada','escolhida')),
  preco          numeric(12,2),
  preco_base     text not null default 'total' check (preco_base in ('total','unidade')),
  iva_incluido   boolean not null default false,
  prazo_entrega  text not null default '',
  condicoes      text not null default '',
  validade       date,
  notas          text not null default '',
  pedida_em      timestamptz not null default now(),
  recebida_em    timestamptz,
  atualizado_em  timestamptz not null default now(),
  unique (pedido_id, fornecedor_id)
);

-- ---------------------------------------------------------------------
-- Automatismos
-- ---------------------------------------------------------------------
create or replace function public.op_carimbo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if tg_table_name = 'op_fornecedores' then
    if auth.uid() is not null then new.atualizado_por := auth.uid(); end if;
    if tg_op = 'UPDATE' then new.criado_por := old.criado_por; new.criado_em := old.criado_em; end if;
  elsif tg_table_name = 'op_propostas' then
    if new.estado in ('recebida','escolhida') and new.recebida_em is null then new.recebida_em := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists op_forn_carimbo on public.op_fornecedores;
create trigger op_forn_carimbo before insert or update on public.op_fornecedores for each row execute function public.op_carimbo();
drop trigger if exists op_ped_carimbo on public.op_pedidos;
create trigger op_ped_carimbo before update on public.op_pedidos for each row execute function public.op_carimbo();
drop trigger if exists op_prop_carimbo on public.op_propostas;
create trigger op_prop_carimbo before insert or update on public.op_propostas for each row execute function public.op_carimbo();

-- Escolher uma proposta: as outras do mesmo pedido ficam recusadas e o pedido fica decidido
create or replace function public.op_escolher(p_proposta uuid, p_decisao text default '') returns void
language plpgsql security definer set search_path = public as $$
declare v_pedido uuid;
begin
  if not public.pode_operacional() then raise exception 'Só o Operacional e a direção decidem pedidos de orçamento.'; end if;
  select pedido_id into v_pedido from public.op_propostas where id = p_proposta;
  if v_pedido is null then raise exception 'A proposta já não existe.'; end if;
  update public.op_propostas set estado = case when id = p_proposta then 'escolhida' else 'recusada' end
   where pedido_id = v_pedido and (id = p_proposta or estado <> 'recusada');
  update public.op_pedidos set estado = 'decidido', escolhida_id = p_proposta, decisao = coalesce(p_decisao, '') where id = v_pedido;
  -- o fornecedor escolhido passa a ativo
  update public.op_fornecedores f set estado = 'ativo'
    from public.op_propostas p where p.id = p_proposta and f.id = p.fornecedor_id and f.estado <> 'ativo';
end $$;
revoke all on function public.op_escolher(uuid, text) from public, anon;
grant execute on function public.op_escolher(uuid, text) to authenticated;

-- Avisos: pedido atribuído a alguém
create or replace function public.op_pedidos_avisar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.responsavel_id is not null and new.responsavel_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.responsavel_id is distinct from old.responsavel_id) then
    insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
    values (new.responsavel_id, 'operacional', 'Pedido de orçamento atribuído a ti · P-' || lpad(new.numero::text, 3, '0'), left(new.titulo, 140), '#pedido-' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists op_pedidos_avisar on public.op_pedidos;
create trigger op_pedidos_avisar after insert or update on public.op_pedidos for each row execute function public.op_pedidos_avisar();

-- Importação de uma lista de fornecedores (não duplica nomes; só completa campos vazios)
create or replace function public.op_importar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; v_novos int := 0; v_exist int := 0; v_id uuid;
begin
  if not public.pode_operacional() then raise exception 'Só o Operacional e a direção importam fornecedores.'; end if;
  for r in select * from jsonb_array_elements(coalesce(p->'fornecedores','[]')) loop
    if coalesce(trim(r->>'nome'),'') = '' then continue; end if;
    select id into v_id from public.op_fornecedores where lower(nome) = lower(trim(r->>'nome'));
    if v_id is null then
      insert into public.op_fornecedores (nome, nif, categoria, estado, marcas, produtos, contacto_nome, telefone, email, site, morada, localidade, pais, notas, origem)
      values (trim(r->>'nome'), coalesce(r->>'nif',''), coalesce(r->>'categoria',''), coalesce(nullif(r->>'estado',''),'ativo'),
              coalesce(array(select jsonb_array_elements_text(r->'marcas')), '{}'), coalesce(r->>'produtos',''), coalesce(r->>'contacto_nome',''),
              coalesce(r->>'telefone',''), coalesce(r->>'email',''), coalesce(r->>'site',''), coalesce(r->>'morada',''), coalesce(r->>'localidade',''),
              coalesce(nullif(r->>'pais',''),'Portugal'), coalesce(r->>'notas',''), coalesce(nullif(r->>'origem',''),'importacao'));
      v_novos := v_novos + 1;
    else
      update public.op_fornecedores set
        nif = case when nif = '' then coalesce(r->>'nif','') else nif end,
        categoria = case when categoria = '' then coalesce(r->>'categoria','') else categoria end,
        produtos = case when produtos = '' then coalesce(r->>'produtos','') else produtos end,
        telefone = case when telefone = '' then coalesce(r->>'telefone','') else telefone end,
        email = case when email = '' then coalesce(r->>'email','') else email end,
        site = case when site = '' then coalesce(r->>'site','') else site end,
        marcas = (select coalesce(array_agg(distinct x), '{}') from unnest(marcas || coalesce(array(select jsonb_array_elements_text(r->'marcas')), '{}')) x)
      where id = v_id;
      v_exist := v_exist + 1;
    end if;
  end loop;
  return jsonb_build_object('novos', v_novos, 'existentes', v_exist);
end $$;
revoke all on function public.op_importar(jsonb) from public, anon;
grant execute on function public.op_importar(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Segurança
-- ---------------------------------------------------------------------
alter table public.op_fornecedores enable row level security;
alter table public.op_contactos    enable row level security;
alter table public.op_pedidos      enable row level security;
alter table public.op_propostas    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['op_fornecedores','op_contactos','op_pedidos','op_propostas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_acesso', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.pode_operacional()) with check (public.pode_operacional())', t || '_acesso', t);
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null; end;
  end loop;
end $$;
drop policy if exists op_pedidos_resp on public.op_pedidos;

revoke all on public.op_fornecedores, public.op_contactos, public.op_pedidos, public.op_propostas from anon;
grant select, insert, update, delete on public.op_fornecedores, public.op_contactos, public.op_pedidos, public.op_propostas to authenticated;
grant usage, select on all sequences in schema public to authenticated;
