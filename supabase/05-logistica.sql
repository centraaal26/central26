-- =====================================================================
-- Central 26 · 05 · Logística: encomendas, rotas e locais
-- Correr uma vez no Supabase: SQL Editor → New query → colar tudo → Run
-- Pode voltar a ser corrido sem apagar dados.
--
-- Quem vê as encomendas: direção, Logística, Comercial e quem as criou.
-- Quem cria: direção, Comercial e Logística. Quem trata (prepara e entrega): direção e Logística.
-- Rotas e locais: direção e Logística.
-- =====================================================================

create or replace function public.e_logistica() returns boolean
language sql stable security definer set search_path = public as $$
  select public.e_gestor() or coalesce(public.meu_departamento() = 'logistica', false)
$$;
create or replace function public.pode_encomendas() returns boolean
language sql stable security definer set search_path = public as $$
  select public.e_logistica() or coalesce(public.meu_departamento() = 'comercial', false)
$$;

-- ---------------------------------------------------------------------
-- Locais fixos (sede, armazém, barbearias…) para partida e paragens
-- ---------------------------------------------------------------------
create table if not exists public.log_locais (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  morada    text not null default '',
  lat       double precision,
  lng       double precision,
  tipo      text not null default 'outro' check (tipo in ('sede','armazem','barbearia','academia','cliente','outro')),
  ativo     boolean not null default true,
  ordem     int not null default 100,
  criado_em timestamptz not null default now()
);
create unique index if not exists log_locais_nome on public.log_locais (lower(nome));

-- Moradas públicas conhecidas. As barbearias ficam por preencher (o Rui completa em Logística → Locais).
insert into public.log_locais (nome, morada, tipo, ordem) values
  ('Sede · Ondina e Maia', 'Rua do Crasto, 123, 4405-742 Vila Nova de Gaia', 'sede', 1),
  ('26 Tech · Serzedo', 'Rua Santa Apolónia, 307, 4410-022 Serzedo, Vila Nova de Gaia', 'armazem', 2),
  ('Av. da República, 370 (26 Academy e Grooms)', 'Avenida da República, 370, 4430-188 Vila Nova de Gaia', 'academia', 3),
  ('Barbearia · Jardim do Morro', '', 'barbearia', 10),
  ('Barbearia · Madalena', '', 'barbearia', 11),
  ('Barbearia · Santo Ovídio', '', 'barbearia', 12),
  ('Barbearia · Praça da República', '', 'barbearia', 13),
  ('Barbearia · Arcozelo', '', 'barbearia', 14)
on conflict (lower(nome)) do nothing;

-- ---------------------------------------------------------------------
-- Encomendas
-- estado: nova → em_preparacao → pronta → em_rota → entregue · cancelada
-- itens: [{ id, descricao, qtd, preparado }]
-- ---------------------------------------------------------------------
create table if not exists public.log_encomendas (
  id              uuid primary key default gen_random_uuid(),
  numero          bigint generated always as identity,
  tipo            text not null default 'encomenda' check (tipo in ('encomenda','maquina','recolha','interna')),
  estado          text not null default 'nova' check (estado in ('nova','em_preparacao','pronta','em_rota','entregue','cancelada')),
  prioridade      text not null default 'media' check (prioridade in ('alta','media','baixa')),
  cliente_nome    text not null,
  crm_cliente_id  uuid references public.crm_clientes(id) on delete set null,
  contacto        text not null default '',
  morada          text not null default '',
  lat             double precision,
  lng             double precision,
  morada_geo      text not null default '',     -- morada usada para obter lat/lng (se mudar, volta a localizar)
  itens           jsonb not null default '[]'::jsonb,
  notas           text not null default '',
  fatura_numero   text not null default '',
  fatura_ficheiro text not null default '',     -- caminho no armazenamento «faturas»
  fatura_nome     text not null default '',
  data_prevista   date,
  responsavel_id  uuid references public.perfis(id) on delete set null,
  rota_id         uuid,
  criado_por      uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid references public.perfis(id) on delete set null,
  entregue_em     timestamptz,
  entregue_por    uuid references public.perfis(id) on delete set null
);
create index if not exists log_enc_estado on public.log_encomendas (estado, data_prevista);

create or replace function public.log_encomendas_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if auth.uid() is not null then new.atualizado_por := auth.uid(); end if;
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.criado_por := auth.uid(); end if;
    if not public.pode_encomendas() and auth.uid() is not null then raise exception 'Sem permissão para criar encomendas.'; end if;
    return new;
  end if;
  new.numero := old.numero; new.criado_por := old.criado_por; new.criado_em := old.criado_em;
  -- o Comercial só mexe nas suas encomendas enquanto estão «nova»; preparar e entregar é da Logística
  if auth.uid() is not null and not public.e_logistica() then
    if old.criado_por is distinct from auth.uid() then raise exception 'Só a Logística e a direção alteram encomendas de outras pessoas.'; end if;
    if old.estado <> 'nova' and new.estado <> 'cancelada' then raise exception 'Esta encomenda já está com a Logística. Pede as alterações à Logística ou cancela-a.'; end if;
    if new.estado not in ('nova','cancelada') then raise exception 'Só a Logística muda o estado da encomenda.'; end if;
  end if;
  if new.morada is distinct from old.morada and new.morada_geo is not distinct from old.morada_geo then
    new.lat := null; new.lng := null; new.morada_geo := '';
  end if;
  if new.estado = 'entregue' and old.estado <> 'entregue' then new.entregue_em := now(); new.entregue_por := auth.uid();
  elsif new.estado <> 'entregue' then new.entregue_em := null; new.entregue_por := null; end if;
  return new;
end $$;
drop trigger if exists log_encomendas_antes on public.log_encomendas;
create trigger log_encomendas_antes before insert or update on public.log_encomendas
  for each row execute function public.log_encomendas_antes();

create or replace function public.log_encomendas_avisar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a uuid := auth.uid();
  v_autor text;
  v_ref text := 'E-' || lpad(new.numero::text, 4, '0');
  v_itens text;
  p uuid;
begin
  select nome into v_autor from public.perfis where id = a;
  v_autor := coalesce(v_autor, 'Alguém');
  if tg_op = 'INSERT' then
    select string_agg(coalesce(nullif(i->>'qtd',''),'1') || '× ' || (i->>'descricao'), ', ') into v_itens from jsonb_array_elements(new.itens) i;
    for p in select id from public.perfis
              where ativo and id is distinct from a
                and ((new.responsavel_id is not null and id = new.responsavel_id)
                     or (new.responsavel_id is null and departamento_id = 'logistica')) loop
      insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
      values (p, 'encomenda', case when new.tipo = 'maquina' then 'Nova entrega de máquina ' else 'Nova encomenda ' end || v_ref,
              v_autor || ' · ' || new.cliente_nome || coalesce(' · ' || left(v_itens, 90), ''), '#encomenda-' || new.id);
    end loop;
  elsif new.estado is distinct from old.estado and new.criado_por is distinct from a and new.criado_por is not null then
    if new.estado in ('pronta','entregue','cancelada') then
      insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
      values (new.criado_por, 'encomenda',
              'Encomenda ' || v_ref || ' ' || case new.estado when 'pronta' then 'pronta' when 'entregue' then 'entregue' else 'cancelada' end,
              new.cliente_nome || ' · ' || v_autor, '#encomenda-' || new.id);
    end if;
  end if;
  if tg_op = 'UPDATE' and new.responsavel_id is distinct from old.responsavel_id and new.responsavel_id is not null and new.responsavel_id is distinct from a then
    insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
    values (new.responsavel_id, 'encomenda', 'Encomenda ' || v_ref || ' atribuída a ti', new.cliente_nome, '#encomenda-' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists log_encomendas_avisar on public.log_encomendas;
create trigger log_encomendas_avisar after insert or update on public.log_encomendas
  for each row execute function public.log_encomendas_avisar();

-- ---------------------------------------------------------------------
-- Rotas
-- paragens: [{ id, tipo: 'encomenda'|'local'|'morada', encomenda_id?, local_id?, nome, morada, lat, lng, feito, feito_em }]
-- (na ordem calculada; a partida e o fim ficam em partida/fim)
-- ---------------------------------------------------------------------
create table if not exists public.log_rotas (
  id             uuid primary key default gen_random_uuid(),
  data           date not null default current_date,
  titulo         text not null default '',
  partida        jsonb,
  fim            jsonb,
  voltar         boolean not null default true,
  paragens       jsonb not null default '[]'::jsonb,
  estado         text not null default 'planeada' check (estado in ('planeada','em_curso','concluida')),
  distancia_m    int,
  duracao_s      int,
  geometria      jsonb,
  responsavel_id uuid references public.perfis(id) on delete set null,
  criado_por     uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index if not exists log_rotas_data on public.log_rotas (data desc);

create or replace function public.log_rotas_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if tg_op = 'UPDATE' then new.criado_por := old.criado_por; new.criado_em := old.criado_em;
  elsif auth.uid() is not null then new.criado_por := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists log_rotas_antes on public.log_rotas;
create trigger log_rotas_antes before insert or update on public.log_rotas
  for each row execute function public.log_rotas_antes();

-- ---------------------------------------------------------------------
-- Segurança
-- ---------------------------------------------------------------------
alter table public.log_locais     enable row level security;
alter table public.log_encomendas enable row level security;
alter table public.log_rotas      enable row level security;

drop policy if exists log_locais_ler on public.log_locais;
create policy log_locais_ler on public.log_locais for select to authenticated using (public.pode_encomendas());
drop policy if exists log_locais_gerir on public.log_locais;
create policy log_locais_gerir on public.log_locais for all to authenticated using (public.e_logistica()) with check (public.e_logistica());

drop policy if exists log_enc_ler on public.log_encomendas;
create policy log_enc_ler on public.log_encomendas for select to authenticated using (public.pode_encomendas() or criado_por = auth.uid());
drop policy if exists log_enc_criar on public.log_encomendas;
create policy log_enc_criar on public.log_encomendas for insert to authenticated with check (public.pode_encomendas());
drop policy if exists log_enc_editar on public.log_encomendas;
create policy log_enc_editar on public.log_encomendas for update to authenticated
  using (public.e_logistica() or criado_por = auth.uid()) with check (public.e_logistica() or criado_por = auth.uid());
drop policy if exists log_enc_apagar on public.log_encomendas;
create policy log_enc_apagar on public.log_encomendas for delete to authenticated
  using (public.e_gestor() or (criado_por = auth.uid() and estado = 'nova'));

drop policy if exists log_rotas_ler on public.log_rotas;
create policy log_rotas_ler on public.log_rotas for select to authenticated using (public.e_logistica());
drop policy if exists log_rotas_gerir on public.log_rotas;
create policy log_rotas_gerir on public.log_rotas for all to authenticated using (public.e_logistica()) with check (public.e_logistica());

revoke all on public.log_locais, public.log_encomendas, public.log_rotas from anon;
grant select, insert, update, delete on public.log_locais, public.log_encomendas, public.log_rotas to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------
-- Faturas: armazenamento privado «faturas» (PDF ou imagem, até 10 MB)
-- ---------------------------------------------------------------------
do $$ begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('faturas', 'faturas', false, 10485760, array['application/pdf','image/jpeg','image/png','image/webp','image/heic'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists "central26 faturas ler" on storage.objects;
  create policy "central26 faturas ler" on storage.objects for select to authenticated
    using (bucket_id = 'faturas' and public.pode_encomendas());
  drop policy if exists "central26 faturas enviar" on storage.objects;
  create policy "central26 faturas enviar" on storage.objects for insert to authenticated
    with check (bucket_id = 'faturas' and public.pode_encomendas());
  drop policy if exists "central26 faturas apagar" on storage.objects;
  create policy "central26 faturas apagar" on storage.objects for delete to authenticated
    using (bucket_id = 'faturas' and (public.e_logistica() or owner = auth.uid()));
exception when others then
  raise notice 'Não foi possível preparar o armazenamento das faturas (%). Cria o bucket «faturas» (privado) em Storage.', sqlerrm;
end $$;

do $$
declare t text;
begin
  foreach t in array array['log_encomendas','log_rotas','log_locais'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null; end;
  end loop;
end $$;
