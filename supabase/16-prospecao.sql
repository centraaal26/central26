-- =====================================================================
-- Central 26 · 16 · Prospeção de barbearias
-- Correr uma vez no Supabase: SQL Editor → New query → colar tudo → Run
-- Pode voltar a ser corrido sem apagar dados. Corre-se depois do 15 (e precisa do 03-crm).
--
-- O que faz:
--  · Junta ao CRM os dados da base de prospeção (Excel): estado, prioridade, zona, canal, WhatsApp…
--  · Todas as semanas a função «prospecao» procura barbearias novas, escolhe as barbearias a abordar
--    e o agente prepara uma proposta de primeira abordagem para cada uma (mensagem + questões a definir).
--  · Quem aprova (ex.: Marcos, Wembley, Samuel) revê, decide e envia para o contacto principal
--    da barbearia (email sai da app; WhatsApp e Instagram abrem com a mensagem pronta).
-- Acesso: o mesmo do CRM (direção e Comercial). Aprovar: direção e quem estiver em «Aprovadores».
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Campos de prospeção nos clientes/leads do CRM
-- ---------------------------------------------------------------------
alter table public.crm_clientes add column if not exists whatsapp          text not null default '';
alter table public.crm_clientes add column if not exists link_marcacao     text not null default '';
alter table public.crm_clientes add column if not exists link_mapa         text not null default '';
alter table public.crm_clientes add column if not exists tipo_negocio      text not null default '';
alter table public.crm_clientes add column if not exists confianca         text not null default '';
alter table public.crm_clientes add column if not exists prioridade        text not null default '';
alter table public.crm_clientes add column if not exists estado_prospecao  text not null default '';
alter table public.crm_clientes add column if not exists motivo            text not null default '';
alter table public.crm_clientes add column if not exists canal_recomendado text not null default '';
alter table public.crm_clientes add column if not exists nivel_visita      text not null default '';
alter table public.crm_clientes add column if not exists proximo_passo     text not null default '';
alter table public.crm_clientes add column if not exists zona_codigo       text not null default '';
alter table public.crm_clientes add column if not exists fonte             text not null default '';
alter table public.crm_clientes add column if not exists recolhido_em      date;
alter table public.crm_clientes add column if not exists externo_id        text;          -- OpenStreetMap / Google, para não repetir
create unique index if not exists crm_clientes_externo on public.crm_clientes (externo_id) where externo_id is not null;
create index if not exists crm_clientes_prospecao on public.crm_clientes (estado_prospecao) where estado_prospecao <> '';

alter table public.crm_clientes drop constraint if exists crm_clientes_origem_check;
alter table public.crm_clientes add constraint crm_clientes_origem_check
  check (origem in ('multixop', 'base_leads', 'manual', 'prospecao', 'auto'));

-- ---------------------------------------------------------------------
-- 2. Tabelas da prospeção
-- ---------------------------------------------------------------------
create table if not exists public.prs_zonas (
  codigo         text primary key,                 -- Z01…
  nome           text not null default '',
  semana         int  not null default 1 check (semana between 1 and 8),
  dia            int  not null default 1 check (dia between 1 and 7),   -- 1 = segunda
  distritos      text not null default '',
  concelhos      text not null default '',
  visitas        int,
  remotos        int,
  recursos       text not null default '',
  objetivo       text not null default '',
  observacoes    text not null default '',
  estado         text not null default 'Por executar',
  responsavel_id uuid references public.perfis(id) on delete set null,
  atualizado_em  timestamptz not null default now()
);

-- Barbearias já vistas e postas de parte (não voltam a ser propostas pela pesquisa automática)
create table if not exists public.prs_excluidos (
  chave     text primary key,                      -- nome|concelho normalizados, ou «ext:<id>»
  nome      text not null default '',
  distrito  text not null default '',
  concelho  text not null default '',
  motivo    text not null default '',
  criado_em timestamptz not null default now()
);
alter table public.prs_excluidos add column if not exists morada   text not null default '';
alter table public.prs_excluidos add column if not exists telefone text not null default '';
alter table public.prs_excluidos add column if not exists email    text not null default '';
alter table public.prs_excluidos add column if not exists website  text not null default '';
alter table public.prs_excluidos add column if not exists instagram text not null default '';

create table if not exists public.prs_config (
  id                 int primary key default 1 check (id = 1),
  ativo              boolean not null default true,
  por_semana         int  not null default 25 check (por_semana between 0 and 200),
  dia_semana         int  not null default 1 check (dia_semana between 1 and 7),   -- dia em que prepara as propostas
  hora               int  not null default 8 check (hora between 0 and 23),
  aprovadores        uuid[] not null default '{}',   -- vazio = direção e administração
  comercial_id       uuid references public.perfis(id) on delete set null,       -- quem faz a visita com amostras
  assinatura         text not null default '',
  email_resposta     text not null default '',       -- as respostas aos emails vão para aqui
  oferta             text not null default 'Linha profissional TwentySix (ceras, pó, óleos, after shave, polos, golas, tapetes, carrinhos de apoio, vaporizadores) e formações da 26 Academy. A primeira abordagem serve para marcar uma visita do comercial, que leva amostras e apresenta os produtos e as condições profissionais.',
  perguntas_internas text[] not null default array[
    'Levamos amostras nesta visita? De que produtos?',
    'Em que dia propomos a visita (dentro da rota da zona)?',
    'Apresentamos também a 26 Academy (formação para a equipa)?',
    'Há alguma condição para a primeira encomenda (desconto, portes, oferta)?'],
  perguntas_barbearia text[] not null default array[
    'Quantas cadeiras e barbeiros têm?',
    'Que marcas de styling e de barba usam hoje, e onde compram?',
    'Vendem produtos aos clientes (revenda)?',
    'Quem decide as compras, e qual o melhor dia e hora para uma visita?',
    'Têm interesse em formação para a equipa (fade, barba, técnicas novas)?',
    'Precisam de equipamento ou consumíveis (golas, polos, tapetes, carrinhos, vaporizadores)?'],
  guioes             jsonb not null default '[]',      -- [{tipo, texto}] (vêm do Excel)
  pesquisa_auto      boolean not null default true,
  distritos          text[] not null default '{}',     -- vazio = todos
  max_novos          int  not null default 40 check (max_novos between 0 and 500),
  plano_inicio       date,                             -- segunda-feira da semana 1 do plano de rua
  ultima_semana      text not null default '',
  ultima_pesquisa    timestamptz,
  atualizado_em      timestamptz not null default now()
);
insert into public.prs_config (id) values (1) on conflict do nothing;

create table if not exists public.prs_propostas (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.crm_clientes(id) on delete cascade,
  semana        text not null,                     -- ex.: 2026-S47
  canal         text not null default 'whatsapp' check (canal in ('whatsapp', 'instagram', 'email', 'telefone')),
  destino       text not null default '',          -- número, @conta ou email
  assunto       text not null default '',
  mensagem      text not null default '',
  mensagens     jsonb not null default '{}',       -- versões por canal: {whatsapp, instagram, email:{assunto,corpo}, telefone}
  resumo        text not null default '',          -- o que o agente encontrou
  fontes        text[] not null default '{}',
  perguntas     jsonb not null default '[]',       -- [{texto, resposta}] questões a definir por quem aprova
  perguntas_visita text[] not null default '{}',   -- perguntas para a barbearia (contacto/visita)
  estado        text not null default 'a_gerar' check (estado in ('a_gerar', 'pendente', 'aprovada', 'enviada', 'rejeitada', 'erro')),
  tentativas    int  not null default 0,
  erro          text not null default '',
  motivo        text not null default '',          -- porque foi rejeitada
  modelo        text not null default '',
  gerada_em     timestamptz,
  aprovada_por  uuid references public.perfis(id) on delete set null,
  aprovada_em   timestamptz,
  enviada_por   uuid references public.perfis(id) on delete set null,
  enviada_em    timestamptz,
  envio_detalhe text not null default '',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists prs_propostas_estado on public.prs_propostas (estado, semana);
create index if not exists prs_propostas_cliente on public.prs_propostas (cliente_id);

create table if not exists public.prs_balancos (
  id        bigint generated always as identity primary key,
  semana    text not null default '',
  tipo      text not null default 'semana' check (tipo in ('importacao', 'pesquisa', 'semana')),
  titulo    text not null default '',
  resumo    jsonb not null default '{}',             -- {novos, atualizados, propostas, por_distrito:{}, destaques:[{id,nome,concelho,distrito,canal,contacto}]}
  criado_em timestamptz not null default now()
);

create or replace function public.prs_mudou() returns trigger
language plpgsql as $$ begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists prs_propostas_mudou on public.prs_propostas;
create trigger prs_propostas_mudou before update on public.prs_propostas for each row execute function public.prs_mudou();
drop trigger if exists prs_config_mudou on public.prs_config;
create trigger prs_config_mudou before update on public.prs_config for each row execute function public.prs_mudou();
drop trigger if exists prs_zonas_mudou on public.prs_zonas;
create trigger prs_zonas_mudou before update on public.prs_zonas for each row execute function public.prs_mudou();

-- ---------------------------------------------------------------------
-- 3. Quem aprova e avisos
-- ---------------------------------------------------------------------
create or replace function public.prs_semana(p timestamptz default now()) returns text
language sql stable as $$ select to_char(p at time zone 'Europe/Lisbon', 'IYYY-"S"IW') $$;

create or replace function public.prs_aprovadores() returns setof uuid
language sql stable security definer set search_path = public as $$
  with lista as (select unnest(c.aprovadores) as pid from public.prs_config c where c.id = 1)
  select p.id from public.perfis p join lista l on l.pid = p.id where p.ativo
  union
  select p.id from public.perfis p where p.ativo and p.papel in ('ceo', 'admin') and not exists (select 1 from lista)
$$;

create or replace function public.pode_aprovar_prs() returns boolean
language sql stable security definer set search_path = public as $$
  select public.e_gestor() or exists (select 1 from public.prs_aprovadores() a where a = auth.uid())
$$;

create or replace function public.prs_avisar(p_titulo text, p_corpo text, p_link text) returns int
language plpgsql security definer set search_path = public as $$
declare d uuid; n int := 0;
begin
  for d in select public.prs_aprovadores() loop
    delete from public.notificacoes where destinatario_id = d and link = p_link and tipo = 'prospecao' and not lida;
    insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link) values (d, 'prospecao', p_titulo, p_corpo, p_link);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 4. Importar a base de prospeção (Excel), por partes
-- p: { leads:[…], zonas:[…], excluidos:[…], guioes:[…], registo:{ficheiro, total, novos, atualizados, por_distrito, destaques} }
-- ---------------------------------------------------------------------
create or replace function public.prs_importar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_novos int := 0; n_atual int := 0; n_zonas int := 0; n_excl int := 0; r record;
begin
  if not public.pode_importar_crm() then
    raise exception 'Só a direção e o chefe do Comercial podem importar a base de prospeção.';
  end if;

  if p ? 'leads' then
    for r in
      insert into public.crm_clientes as x (chave_lead, nome, tipo, etapa, origem, distrito, concelho, morada, telefone, email, website, instagram,
             whatsapp, link_marcacao, link_mapa, tipo_negocio, confianca, prioridade, estado_prospecao, score, motivo, notas, fonte, recolhido_em,
             zona_codigo, canal_recomendado, nivel_visita, proximo_passo)
      select l->>'chave', coalesce(nullif(trim(l->>'nome'), ''), 'Sem nome'), 'lead', 'lead', 'prospecao',
             coalesce(l->>'distrito', ''), coalesce(l->>'concelho', ''), coalesce(l->>'morada', ''), coalesce(l->>'telefone', ''),
             coalesce(l->>'email', ''), coalesce(l->>'website', ''), coalesce(l->>'instagram', ''), coalesce(l->>'whatsapp', ''),
             coalesce(l->>'link_marcacao', ''), coalesce(l->>'link_mapa', ''), coalesce(l->>'tipo_negocio', ''), coalesce(l->>'confianca', ''),
             coalesce(l->>'prioridade', ''), coalesce(nullif(l->>'estado', ''), 'A validar'), nullif(l->>'score', '')::int,
             coalesce(l->>'motivo', ''), coalesce(l->>'notas', ''), coalesce(l->>'fonte', ''), nullif(l->>'recolhido_em', '')::date,
             coalesce(l->>'zona', ''), coalesce(l->>'canal', ''), coalesce(l->>'nivel', ''), coalesce(l->>'proximo', '')
        from jsonb_array_elements(p->'leads') l
       where coalesce(l->>'chave', '') <> ''
      on conflict (chave_lead) do update set
        distrito  = case when x.distrito  = '' then excluded.distrito  else x.distrito  end,
        concelho  = case when x.concelho  = '' then excluded.concelho  else x.concelho  end,
        morada    = case when x.morada    = '' then excluded.morada    else x.morada    end,
        telefone  = case when x.telefone  = '' then excluded.telefone  else x.telefone  end,
        email     = case when x.email     = '' then excluded.email     else x.email     end,
        website   = case when x.website   = '' then excluded.website   else x.website   end,
        instagram = case when x.instagram = '' then excluded.instagram else x.instagram end,
        whatsapp  = case when x.whatsapp  = '' then excluded.whatsapp  else x.whatsapp  end,
        link_marcacao = case when x.link_marcacao = '' then excluded.link_marcacao else x.link_marcacao end,
        link_mapa = case when x.link_mapa = '' then excluded.link_mapa else x.link_mapa end,
        tipo_negocio = excluded.tipo_negocio, confianca = excluded.confianca, prioridade = excluded.prioridade,
        estado_prospecao = excluded.estado_prospecao, score = coalesce(excluded.score, x.score), motivo = excluded.motivo,
        fonte = excluded.fonte, recolhido_em = coalesce(excluded.recolhido_em, x.recolhido_em),
        zona_codigo = case when excluded.zona_codigo <> '' then excluded.zona_codigo else x.zona_codigo end,
        canal_recomendado = case when excluded.canal_recomendado <> '' then excluded.canal_recomendado else x.canal_recomendado end,
        nivel_visita = case when excluded.nivel_visita <> '' then excluded.nivel_visita else x.nivel_visita end,
        proximo_passo = case when excluded.proximo_passo <> '' then excluded.proximo_passo else x.proximo_passo end,
        notas = case when x.notas = '' then excluded.notas else x.notas end
      returning (xmax = 0) as novo
    loop
      if r.novo then n_novos := n_novos + 1; else n_atual := n_atual + 1; end if;
    end loop;
  end if;

  if p ? 'zonas' then
    insert into public.prs_zonas as z (codigo, nome, semana, dia, distritos, concelhos, visitas, remotos, recursos, objetivo, observacoes)
    select x->>'codigo', coalesce(x->>'nome', ''), greatest(1, least(8, coalesce((x->>'semana')::int, 1))), greatest(1, least(7, coalesce((x->>'dia')::int, 1))),
           coalesce(x->>'distritos', ''), coalesce(x->>'concelhos', ''), nullif(x->>'visitas', '')::int, nullif(x->>'remotos', '')::int,
           coalesce(x->>'recursos', ''), coalesce(x->>'objetivo', ''), coalesce(x->>'observacoes', '')
      from jsonb_array_elements(p->'zonas') x where coalesce(x->>'codigo', '') <> ''
    on conflict (codigo) do update set nome = excluded.nome, semana = excluded.semana, dia = excluded.dia, distritos = excluded.distritos,
      concelhos = excluded.concelhos, visitas = excluded.visitas, remotos = excluded.remotos, recursos = excluded.recursos,
      objetivo = excluded.objetivo, observacoes = excluded.observacoes;
    get diagnostics n_zonas = row_count;
  end if;

  if p ? 'excluidos' then
    insert into public.prs_excluidos (chave, nome, distrito, concelho, motivo, morada, telefone, email, website, instagram)
    select x->>'chave', coalesce(x->>'nome', ''), coalesce(x->>'distrito', ''), coalesce(x->>'concelho', ''), left(coalesce(x->>'motivo', ''), 300),
           coalesce(x->>'morada', ''), coalesce(x->>'telefone', ''), coalesce(x->>'email', ''), coalesce(x->>'website', ''), coalesce(x->>'instagram', '')
      from jsonb_array_elements(p->'excluidos') x
     where coalesce(x->>'chave', '') <> '' and not exists (select 1 from public.crm_clientes c where c.chave_lead = x->>'chave')
    on conflict (chave) do update set motivo = excluded.motivo;
    get diagnostics n_excl = row_count;
  end if;

  if p ? 'guioes' and jsonb_array_length(p->'guioes') > 0 then
    update public.prs_config set guioes = p->'guioes' where id = 1;
  end if;

  if p ? 'registo' then
    insert into public.prs_balancos (semana, tipo, titulo, resumo)
    values (public.prs_semana(), 'importacao', 'Base de prospeção importada: ' || coalesce(p->'registo'->>'ficheiro', 'Excel'), p->'registo');
    perform public.prs_avisar(
      'Prospeção: ' || coalesce(p->'registo'->>'total', '0') || ' barbearias na base',
      coalesce(p->'registo'->>'novos', '0') || ' novas no CRM e ' || coalesce(p->'registo'->>'atualizados', '0') || ' atualizadas. Vê o balanço na Prospeção.',
      '#prospecao-balancos');
  end if;

  return jsonb_build_object('novos', n_novos, 'atualizados', n_atual, 'zonas', n_zonas, 'excluidos', n_excl);
end $$;

-- Uma barbearia posta de parte passa a lead do CRM (ex.: um distrito que deixou de estar fora da campanha)
create or replace function public.prs_recuperar(p_chave text) returns uuid
language plpgsql security definer set search_path = public as $$
declare e public.prs_excluidos; v_id uuid;
begin
  if not public.pode_crm() then raise exception 'Sem acesso ao CRM.'; end if;
  select * into e from public.prs_excluidos where chave = p_chave;
  if e.chave is null then raise exception 'Esta barbearia já não está na lista.'; end if;
  insert into public.crm_clientes (chave_lead, nome, tipo, etapa, origem, distrito, concelho, morada, telefone, email, website, instagram, estado_prospecao, motivo)
  values (case when e.chave like 'ext:%' then null else e.chave end, coalesce(nullif(e.nome, ''), 'Sem nome'), 'lead', 'lead', 'prospecao', e.distrito, e.concelho,
          e.morada, e.telefone, e.email, e.website, e.instagram, 'A validar', 'Recuperada da lista posta de parte: ' || e.motivo)
  on conflict (chave_lead) do update set estado_prospecao = case when crm_clientes.estado_prospecao = '' then 'A validar' else crm_clientes.estado_prospecao end
  returning id into v_id;
  delete from public.prs_excluidos where chave = p_chave;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 5. Decidir e registar o envio
-- ---------------------------------------------------------------------
create or replace function public.prs_decidir(p_id uuid, p_acao text, p_canal text default null, p_assunto text default null,
                                             p_mensagem text default null, p_perguntas jsonb default null, p_motivo text default '')
returns public.prs_propostas
language plpgsql security definer set search_path = public as $$
declare pr public.prs_propostas;
begin
  if not public.pode_aprovar_prs() then raise exception 'Só quem aprova a prospeção pode decidir as propostas.'; end if;
  select * into pr from public.prs_propostas where id = p_id for update;
  if pr.id is null then raise exception 'Esta proposta já não existe.'; end if;
  if p_acao = 'guardar' then
    if pr.estado not in ('pendente', 'aprovada') then raise exception 'Esta proposta já não pode ser alterada.'; end if;
    update public.prs_propostas set canal = coalesce(p_canal, canal), assunto = coalesce(p_assunto, assunto), mensagem = coalesce(p_mensagem, mensagem),
           perguntas = coalesce(p_perguntas, perguntas) where id = p_id returning * into pr;
  elsif p_acao = 'aprovar' then
    if pr.estado not in ('pendente', 'aprovada') then raise exception 'Esta proposta já foi tratada.'; end if;
    if coalesce(trim(coalesce(p_mensagem, pr.mensagem)), '') = '' then raise exception 'A mensagem está vazia.'; end if;
    update public.prs_propostas set estado = 'aprovada', canal = coalesce(p_canal, canal), assunto = coalesce(p_assunto, assunto),
           mensagem = coalesce(p_mensagem, mensagem), perguntas = coalesce(p_perguntas, perguntas),
           aprovada_por = auth.uid(), aprovada_em = now() where id = p_id returning * into pr;
  elsif p_acao = 'rejeitar' then
    if pr.estado = 'enviada' then raise exception 'Esta proposta já foi enviada.'; end if;
    update public.prs_propostas set estado = 'rejeitada', motivo = left(coalesce(p_motivo, ''), 500), aprovada_por = auth.uid(), aprovada_em = now()
     where id = p_id returning * into pr;
  elsif p_acao = 'reabrir' then
    if pr.estado not in ('rejeitada', 'aprovada', 'erro') then raise exception 'Esta proposta não pode ser reaberta.'; end if;
    update public.prs_propostas set estado = case when pr.mensagem = '' then 'a_gerar' else 'pendente' end, motivo = '', tentativas = 0, erro = ''
     where id = p_id returning * into pr;
  else
    raise exception 'Ação desconhecida.';
  end if;
  return pr;
end $$;

-- Depois de enviada (email pela app, ou WhatsApp/Instagram/telefone pela pessoa): regista no CRM e cria o seguimento
create or replace function public.prs_registar_envio(p_id uuid, p_detalhe text default '') returns public.prs_propostas
language plpgsql security definer set search_path = public as $$
declare pr public.prs_propostas; c public.crm_clientes; cfg public.prs_config; v_tipo text; v_resp uuid;
begin
  if auth.uid() is not null and not public.pode_aprovar_prs() then raise exception 'Só quem aprova a prospeção pode registar envios.'; end if;
  select * into pr from public.prs_propostas where id = p_id for update;
  if pr.id is null then raise exception 'Esta proposta já não existe.'; end if;
  if pr.estado = 'enviada' then return pr; end if;
  if pr.estado <> 'aprovada' then raise exception 'A proposta tem de estar aprovada antes de ser enviada.'; end if;
  select * into cfg from public.prs_config where id = 1;
  select * into c from public.crm_clientes where id = pr.cliente_id;
  update public.prs_propostas set estado = 'enviada', enviada_em = now(), enviada_por = coalesce(auth.uid(), pr.aprovada_por),
         envio_detalhe = left(coalesce(p_detalhe, ''), 300) where id = p_id returning * into pr;
  v_tipo := case pr.canal when 'email' then 'email' when 'whatsapp' then 'whatsapp' when 'telefone' then 'chamada' else 'nota' end;
  v_resp := coalesce(c.responsavel_id, cfg.comercial_id);
  insert into public.crm_contactos (cliente_id, autor_id, tipo, texto, proximo_passo, data_proximo)
  values (c.id, coalesce(auth.uid(), pr.aprovada_por), v_tipo,
          'Primeira abordagem (prospeção, ' || pr.canal || ')' || case when pr.assunto <> '' then ' · ' || pr.assunto else '' end || E'\n\n' || pr.mensagem,
          'Visita com amostras' || case when cfg.comercial_id is not null then ' (' || coalesce((select split_part(nome, ' ', 1) from public.perfis where id = cfg.comercial_id), '') || ')' else '' end,
          (now() at time zone 'Europe/Lisbon')::date + 4);
  update public.crm_clientes set etapa = case when etapa = 'lead' then 'contactado' else etapa end, responsavel_id = coalesce(responsavel_id, v_resp)
   where id = c.id;
  if v_resp is not null then
    insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
    values (v_resp, 'prospecao', 'Barbearia contactada: ' || c.nome,
            'A primeira abordagem foi enviada por ' || pr.canal || '. Próximo passo: marcar a visita com amostras.', '#cliente-' || c.id);
  end if;
  return pr;
end $$;

-- ---------------------------------------------------------------------
-- 6. Relógio: de 5 em 5 minutos chama a função «prospecao» quando há trabalho
-- ---------------------------------------------------------------------
create or replace function public.prs_tique() returns boolean
language plpgsql security definer set search_path = public as $$
declare cfg public.prs_config; v_url text; v_seg text; agora timestamp := now() at time zone 'Europe/Lisbon'; devido boolean;
begin
  select * into cfg from public.prs_config where id = 1;
  if cfg.id is null or not cfg.ativo then return false; end if;
  devido := cfg.ultima_semana <> public.prs_semana() and extract(isodow from agora) >= cfg.dia_semana
            and (extract(isodow from agora) > cfg.dia_semana or extract(hour from agora) >= cfg.hora);
  if not devido and not exists (select 1 from public.prs_propostas where estado = 'a_gerar' and tentativas < 3) then return false; end if;
  select valor into v_url from public.configuracao where chave = 'url_funcoes';
  select valor into v_seg from public.configuracao_privada where chave = 'segredo_webhook';
  if v_url is null then return false; end if;
  perform net.http_post(url := v_url || '/prospecao', headers := jsonb_build_object('Content-Type', 'application/json', 'x-segredo', v_seg),
                        body := jsonb_build_object('acao', 'tique'), timeout_milliseconds := 5000);
  return true;
exception when others then
  raise warning 'Falha ao chamar a prospeção: %', sqlerrm;
  return false;
end $$;

do $$ begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'central26-prospecao';
  perform cron.schedule('central26-prospecao', '*/5 * * * *', 'select public.prs_tique()');
exception when others then
  raise notice 'pg_cron indisponível: a prospeção semanal fica desligada (%).', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 7. Acessos
-- ---------------------------------------------------------------------
alter table public.prs_zonas     enable row level security;
alter table public.prs_excluidos enable row level security;
alter table public.prs_config    enable row level security;
alter table public.prs_propostas enable row level security;
alter table public.prs_balancos  enable row level security;

drop policy if exists prs_zonas_ler on public.prs_zonas;
create policy prs_zonas_ler on public.prs_zonas for select to authenticated using (public.pode_crm());
drop policy if exists prs_zonas_mudar on public.prs_zonas;
create policy prs_zonas_mudar on public.prs_zonas for update to authenticated using (public.pode_crm()) with check (public.pode_crm());
drop policy if exists prs_config_ler on public.prs_config;
create policy prs_config_ler on public.prs_config for select to authenticated using (public.pode_crm());
drop policy if exists prs_config_mudar on public.prs_config;
create policy prs_config_mudar on public.prs_config for update to authenticated using (public.e_gestor()) with check (public.e_gestor());
drop policy if exists prs_propostas_ler on public.prs_propostas;
create policy prs_propostas_ler on public.prs_propostas for select to authenticated using (public.pode_crm());
drop policy if exists prs_balancos_ler on public.prs_balancos;
create policy prs_balancos_ler on public.prs_balancos for select to authenticated using (public.pode_crm());
drop policy if exists prs_excluidos_ler on public.prs_excluidos;
create policy prs_excluidos_ler on public.prs_excluidos for select to authenticated using (public.pode_crm());

revoke all on public.prs_zonas, public.prs_excluidos, public.prs_config, public.prs_propostas, public.prs_balancos from anon;
grant select on public.prs_zonas, public.prs_excluidos, public.prs_config, public.prs_propostas, public.prs_balancos to authenticated;
grant update on public.prs_zonas, public.prs_config to authenticated;
-- as propostas só mudam pelas funções (decidir, registar envio) e pela função «prospecao» no servidor

do $$
declare t text;
begin
  foreach t in array array['prs_propostas', 'prs_balancos'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null; end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8. Permissões das funções (só com sessão iniciada; as internas ficam fechadas)
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as assinatura from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke execute on function %s from public, anon', f.assinatura);
    execute format('grant execute on function %s to authenticated, service_role', f.assinatura);
  end loop;
end $$;
revoke execute on function public.chat_notificar(uuid, uuid, text, text) from authenticated;
revoke execute on function public.agenda_lembretes() from authenticated;
revoke execute on function public.gerar_password_temporaria() from authenticated;
revoke execute on function public.stk_lembretes() from authenticated;
revoke execute on function public.stk_avisar(uuid) from authenticated;
revoke execute on function public.stk_ajustar(uuid, int, text) from authenticated;
revoke execute on function public.lembrar_copia() from authenticated;
revoke execute on function public.ia_registar_uso(uuid, text, int, int) from authenticated;
revoke execute on function public.prz_lembretes() from authenticated;
revoke execute on function public.prz_avisar(uuid, int) from authenticated;
revoke execute on function public.prz_destinatarios(uuid) from authenticated;
revoke execute on function public.prs_tique() from authenticated;
revoke execute on function public.prs_avisar(text, text, text) from authenticated;
