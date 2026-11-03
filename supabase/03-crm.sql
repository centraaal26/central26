-- =====================================================================
-- Central 26 · 03 · CRM comercial
-- Correr uma vez no Supabase: SQL Editor → New query → colar tudo → Run
-- Pode voltar a ser corrido sem apagar dados.
--
-- Acesso: CEO, administração e o departamento Comercial.
-- As importações do Multixop (SAF-T) atualizam clientes, produtos e vendas,
-- mas nunca apagam o que foi preenchido no CRM (aniversário, contactos,
-- notas, responsável, etapa, nome corrigido).
-- =====================================================================

create or replace function public.pode_crm() returns boolean
language sql stable security definer set search_path = public as $$
  select public.e_gestor() or coalesce(public.meu_departamento() = 'comercial', false)
$$;

create or replace function public.pode_importar_crm() returns boolean
language sql stable security definer set search_path = public as $$
  select public.e_gestor() or (public.meu_papel() = 'chefe' and coalesce(public.meu_departamento() = 'comercial', false))
$$;

-- ---------------------------------------------------------------------
-- Clientes e leads
-- etapa: lead | contactado | proposta | cliente | perdido
-- ---------------------------------------------------------------------
create table if not exists public.crm_clientes (
  id               uuid primary key default gen_random_uuid(),
  codigo_multixop  text unique,
  chave_lead       text unique,
  nome             text not null,
  nome_corrigido   boolean not null default false,
  nif              text not null default '',
  tipo             text not null default 'lead' check (tipo in ('empresa','particular','interno','lead')),
  etapa            text not null default 'lead' check (etapa in ('lead','contactado','proposta','cliente','perdido')),
  origem           text not null default 'manual' check (origem in ('multixop','base_leads','manual')),
  morada           text not null default '',
  codigo_postal    text not null default '',
  freguesia        text not null default '',
  concelho         text not null default '',
  distrito         text not null default '',
  telefone         text not null default '',
  email            text not null default '',
  website          text not null default '',
  instagram        text not null default '',
  data_aniversario date,
  responsavel_id   uuid references public.perfis(id) on delete set null,
  score            int,
  notas            text not null default '',
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  atualizado_por   uuid references public.perfis(id) on delete set null
);
create index if not exists crm_clientes_etapa on public.crm_clientes (etapa);
create index if not exists crm_clientes_distrito on public.crm_clientes (distrito);

create or replace function public.crm_clientes_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if auth.uid() is not null then new.atualizado_por := auth.uid(); end if;
  if tg_op = 'UPDATE' then
    new.criado_em := old.criado_em;
    -- quem corrige o nome à mão protege-o das próximas importações
    if auth.uid() is not null and new.nome is distinct from old.nome then new.nome_corrigido := true; end if;
  end if;
  return new;
end $$;
drop trigger if exists crm_clientes_antes on public.crm_clientes;
create trigger crm_clientes_antes before insert or update on public.crm_clientes
  for each row execute function public.crm_clientes_antes();

-- ---------------------------------------------------------------------
-- Produtos e vendas (vêm do SAF-T)
-- linha: produtos | tech | equipamento | portes
-- ---------------------------------------------------------------------
create table if not exists public.crm_produtos (
  codigo    text primary key,
  descricao text not null default '',
  grupo     text not null default '',
  linha     text not null default 'produtos'
);

create table if not exists public.crm_vendas (
  documento      text not null,
  linha          int  not null,
  tipo           text not null,          -- FT fatura · NC nota de crédito (valor negativo)
  data           date not null,
  cliente_codigo text not null,
  produto_codigo text not null default '',
  descricao      text not null default '',
  qtd            numeric not null default 0,
  preco          numeric not null default 0,
  valor          numeric not null default 0,  -- sem IVA
  primary key (documento, linha)
);
create index if not exists crm_vendas_cliente on public.crm_vendas (cliente_codigo);
create index if not exists crm_vendas_data on public.crm_vendas (data);

-- ---------------------------------------------------------------------
-- Contactos com clientes (chamadas, visitas, propostas…)
-- ---------------------------------------------------------------------
create table if not exists public.crm_contactos (
  id            bigint generated always as identity primary key,
  cliente_id    uuid not null references public.crm_clientes(id) on delete cascade,
  autor_id      uuid references public.perfis(id) on delete set null default auth.uid(),
  tipo          text not null default 'nota' check (tipo in ('chamada','visita','email','whatsapp','reuniao','proposta','nota')),
  texto         text not null default '',
  proximo_passo text not null default '',
  data_proximo  date,
  criado_em     timestamptz not null default now()
);
create index if not exists crm_contactos_cliente on public.crm_contactos (cliente_id, criado_em desc);

create table if not exists public.crm_importacoes (
  id          bigint generated always as identity primary key,
  autor_id    uuid references public.perfis(id) on delete set null default auth.uid(),
  ficheiro    text not null default '',
  periodo_de  date,
  periodo_ate date,
  clientes    int not null default 0,
  leads       int not null default 0,
  produtos    int not null default 0,
  vendas      int not null default 0,
  total       numeric not null default 0,
  criado_em   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Importação (chamada pela app, por partes)
-- p: { clientes:[{codigo,nome,nif,tipo,morada}], leads:[{chave,nome,distrito,concelho,morada,telefone,email,website,instagram,score,notas}],
--      produtos:[{codigo,descricao,grupo,linha}], vendas:[{documento,linha,tipo,data,cliente,produto,descricao,qtd,preco,valor}],
--      limpar_de, limpar_ate }  — as vendas desse intervalo são apagadas antes de inserir (só no 1.º pedido)
-- ---------------------------------------------------------------------
create or replace function public.crm_importar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  n_cli int := 0; n_lead int := 0; n_prod int := 0; n_vend int := 0;
begin
  if not public.pode_importar_crm() then
    raise exception 'Só a administração e o chefe do Comercial podem importar dados.';
  end if;

  if p ? 'produtos' then
    insert into public.crm_produtos as x (codigo, descricao, grupo, linha)
    select r->>'codigo', coalesce(r->>'descricao',''), coalesce(r->>'grupo',''), coalesce(nullif(r->>'linha',''),'produtos')
      from jsonb_array_elements(p->'produtos') r
     where coalesce(r->>'codigo','') <> ''
    on conflict (codigo) do update set
      descricao = case when excluded.descricao like '%' || chr(65533) || '%' and x.descricao not like '%' || chr(65533) || '%'
                       then x.descricao else excluded.descricao end,
      grupo = excluded.grupo, linha = excluded.linha;
    get diagnostics n_prod = row_count;
  end if;

  if p ? 'clientes' then
    insert into public.crm_clientes as x (codigo_multixop, nome, nif, tipo, morada, origem, etapa)
    select r->>'codigo', coalesce(nullif(trim(r->>'nome'),''), 'Sem nome'), coalesce(r->>'nif',''),
           coalesce(nullif(r->>'tipo',''),'particular'), coalesce(r->>'morada',''), 'multixop', 'cliente'
      from jsonb_array_elements(p->'clientes') r
     where coalesce(r->>'codigo','') <> ''
    on conflict (codigo_multixop) do update set
      nome = case when x.nome_corrigido then x.nome
                  when excluded.nome like '%' || chr(65533) || '%' and x.nome not like '%' || chr(65533) || '%' then x.nome
                  else excluded.nome end,
      nif = excluded.nif,
      tipo = case when x.tipo = 'lead' then excluded.tipo else x.tipo end,
      morada = case when x.morada = '' then excluded.morada else x.morada end;
    get diagnostics n_cli = row_count;
  end if;

  if p ? 'leads' then
    insert into public.crm_clientes as x (chave_lead, nome, tipo, etapa, origem, distrito, concelho, morada, telefone, email, website, instagram, score, notas)
    select r->>'chave', coalesce(nullif(trim(r->>'nome'),''),'Sem nome'), 'lead', 'lead', 'base_leads',
           coalesce(r->>'distrito',''), coalesce(r->>'concelho',''), coalesce(r->>'morada',''), coalesce(r->>'telefone',''),
           coalesce(r->>'email',''), coalesce(r->>'website',''), coalesce(r->>'instagram',''), nullif(r->>'score','')::int, coalesce(r->>'notas','')
      from jsonb_array_elements(p->'leads') r
     where coalesce(r->>'chave','') <> ''
    on conflict (chave_lead) do update set
      distrito  = case when x.distrito  = '' then excluded.distrito  else x.distrito  end,
      concelho  = case when x.concelho  = '' then excluded.concelho  else x.concelho  end,
      morada    = case when x.morada    = '' then excluded.morada    else x.morada    end,
      telefone  = case when x.telefone  = '' then excluded.telefone  else x.telefone  end,
      email     = case when x.email     = '' then excluded.email     else x.email     end,
      website   = case when x.website   = '' then excluded.website   else x.website   end,
      instagram = case when x.instagram = '' then excluded.instagram else x.instagram end,
      score     = coalesce(x.score, excluded.score);
    get diagnostics n_lead = row_count;
  end if;

  if p ? 'limpar_de' and p ? 'limpar_ate' then
    delete from public.crm_vendas where data between (p->>'limpar_de')::date and (p->>'limpar_ate')::date;
  end if;

  if p ? 'vendas' then
    insert into public.crm_vendas as x (documento, linha, tipo, data, cliente_codigo, produto_codigo, descricao, qtd, preco, valor)
    select r->>'documento', (r->>'linha')::int, r->>'tipo', (r->>'data')::date, r->>'cliente', coalesce(r->>'produto',''),
           coalesce(r->>'descricao',''), coalesce((r->>'qtd')::numeric,0), coalesce((r->>'preco')::numeric,0), coalesce((r->>'valor')::numeric,0)
      from jsonb_array_elements(p->'vendas') r
    on conflict (documento, linha) do update set
      tipo = excluded.tipo, data = excluded.data, cliente_codigo = excluded.cliente_codigo, produto_codigo = excluded.produto_codigo,
      descricao = excluded.descricao, qtd = excluded.qtd, preco = excluded.preco, valor = excluded.valor;
    get diagnostics n_vend = row_count;
    -- um lead (da base de leads ou criado à mão) que passa a comprar fica cliente no funil;
    -- a etapa dos clientes do Multixop é decidida pelo Comercial e não é mexida
    update public.crm_clientes c set etapa = 'cliente'
     where c.codigo_multixop in (select distinct r->>'cliente' from jsonb_array_elements(p->'vendas') r)
       and c.origem <> 'multixop'
       and c.etapa in ('lead','contactado','proposta');
  end if;

  if p ? 'registo' then
    insert into public.crm_importacoes (ficheiro, periodo_de, periodo_ate, clientes, leads, produtos, vendas, total)
    values (coalesce(p->'registo'->>'ficheiro',''), nullif(p->'registo'->>'de','')::date, nullif(p->'registo'->>'ate','')::date,
            coalesce((p->'registo'->>'clientes')::int,0), coalesce((p->'registo'->>'leads')::int,0), coalesce((p->'registo'->>'produtos')::int,0),
            coalesce((p->'registo'->>'vendas')::int,0), coalesce((p->'registo'->>'total')::numeric,0));
  end if;

  return jsonb_build_object('clientes', n_cli, 'leads', n_lead, 'produtos', n_prod, 'vendas', n_vend);
end $$;

revoke all on function public.crm_importar(jsonb) from public, anon;
grant execute on function public.crm_importar(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Segurança
-- ---------------------------------------------------------------------
alter table public.crm_clientes    enable row level security;
alter table public.crm_produtos    enable row level security;
alter table public.crm_vendas      enable row level security;
alter table public.crm_contactos   enable row level security;
alter table public.crm_importacoes enable row level security;

drop policy if exists crm_cli_ler on public.crm_clientes;
create policy crm_cli_ler on public.crm_clientes for select to authenticated using (public.pode_crm());
drop policy if exists crm_cli_criar on public.crm_clientes;
create policy crm_cli_criar on public.crm_clientes for insert to authenticated with check (public.pode_crm());
drop policy if exists crm_cli_editar on public.crm_clientes;
create policy crm_cli_editar on public.crm_clientes for update to authenticated using (public.pode_crm()) with check (public.pode_crm());
drop policy if exists crm_cli_apagar on public.crm_clientes;
create policy crm_cli_apagar on public.crm_clientes for delete to authenticated using (public.pode_importar_crm());

drop policy if exists crm_prod_ler on public.crm_produtos;
create policy crm_prod_ler on public.crm_produtos for select to authenticated using (public.pode_crm());
drop policy if exists crm_vend_ler on public.crm_vendas;
create policy crm_vend_ler on public.crm_vendas for select to authenticated using (public.pode_crm());
drop policy if exists crm_imp_ler on public.crm_importacoes;
create policy crm_imp_ler on public.crm_importacoes for select to authenticated using (public.pode_crm());

drop policy if exists crm_cont_ler on public.crm_contactos;
create policy crm_cont_ler on public.crm_contactos for select to authenticated using (public.pode_crm());
drop policy if exists crm_cont_criar on public.crm_contactos;
create policy crm_cont_criar on public.crm_contactos for insert to authenticated with check (public.pode_crm() and autor_id = auth.uid());
drop policy if exists crm_cont_apagar on public.crm_contactos;
create policy crm_cont_apagar on public.crm_contactos for delete to authenticated using (autor_id = auth.uid() or public.e_gestor());

revoke all on public.crm_clientes, public.crm_produtos, public.crm_vendas, public.crm_contactos, public.crm_importacoes from anon;
grant select, insert, update, delete on public.crm_clientes to authenticated;
grant select, insert, delete on public.crm_contactos to authenticated;
grant select on public.crm_produtos, public.crm_vendas, public.crm_importacoes to authenticated;
grant usage, select on all sequences in schema public to authenticated;

do $$
declare t text;
begin
  foreach t in array array['crm_clientes','crm_contactos'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null;
    end;
  end loop;
end $$;
