-- =====================================================================
-- Central 26 · Base de dados (fase 1)
-- Correr uma única vez no Supabase: SQL Editor → New query → colar tudo → Run
-- Pode voltar a ser corrido sem apagar dados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Departamentos
-- ---------------------------------------------------------------------
create table if not exists public.departamentos (
  id         text primary key,
  nome       text not null,
  ordem      int  not null default 100,
  criado_em  timestamptz not null default now()
);

insert into public.departamentos (id, nome, ordem) values
  ('direcao',        'Direção',                      1),
  ('administrativo', 'Administrativo e Operacional', 2),
  ('operacional',    'Operacional',                  3),
  ('comercial',      'Comercial',                    4),
  ('marketing',      'Marketing e Multimédia',       5),
  ('logistica',      'Logística',                    6),
  ('tecnologico',    'Tecnológico',                  7)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Perfis (um por empregado; a conta de acesso é criada pela função gerir-empregados)
-- papel: ceo | admin (gere a equipa e tudo o resto) | chefe (gere o seu departamento) | colaborador
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  id              uuid primary key references auth.users(id) on delete cascade,
  nome            text not null,
  email           text not null,
  cargo           text not null default '',
  departamento_id text references public.departamentos(id) on update cascade,
  papel           text not null default 'colaborador' check (papel in ('ceo','admin','chefe','colaborador')),
  telefone        text not null default '',
  ativo           boolean not null default true,
  mudar_password  boolean not null default true,
  criado_em       timestamptz not null default now(),
  criado_por      uuid
);

-- ---------------------------------------------------------------------
-- Funções de apoio às permissões
-- ---------------------------------------------------------------------
create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from public.perfis where id = auth.uid() and ativo
$$;

create or replace function public.meu_departamento() returns text
language sql stable security definer set search_path = public as $$
  select departamento_id from public.perfis where id = auth.uid() and ativo
$$;

create or replace function public.e_membro() returns boolean
language sql stable security definer set search_path = public as $$
  select public.meu_papel() is not null
$$;

create or replace function public.e_gestor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_papel() in ('ceo','admin'), false)
$$;

-- Pode o utilizador atual pôr esta pessoa como responsável de uma tarefa?
create or replace function public.pode_atribuir(p_responsavel uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when not public.e_membro() then false
    when p_responsavel is null or p_responsavel = auth.uid() then true
    when public.e_gestor() then exists (select 1 from public.perfis where id = p_responsavel and ativo)
    when public.meu_papel() = 'chefe' then exists (
      select 1 from public.perfis
      where id = p_responsavel and ativo and departamento_id = public.meu_departamento())
    else false
  end
$$;

-- ---------------------------------------------------------------------
-- Proteções dos perfis
-- ---------------------------------------------------------------------
create or replace function public.perfis_proteger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Sem utilizador = SQL Editor ou função de servidor: sem restrições
  if auth.uid() is null then return new; end if;
  if coalesce(public.meu_papel(), '') <> 'ceo' and (old.papel = 'ceo' or new.papel = 'ceo') then
    raise exception 'Só o CEO pode alterar o perfil de CEO.';
  end if;
  if new.id = auth.uid() and new.papel <> old.papel then
    raise exception 'Não podes alterar o teu próprio papel.';
  end if;
  if new.id = auth.uid() and not new.ativo then
    raise exception 'Não podes desativar a tua própria conta.';
  end if;
  new.id := old.id;
  new.email := old.email;
  new.criado_em := old.criado_em;
  return new;
end $$;

drop trigger if exists perfis_proteger on public.perfis;
create trigger perfis_proteger before update on public.perfis
  for each row execute function public.perfis_proteger();

create or replace function public.atualizar_meu_perfil(p_nome text, p_telefone text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.perfis
     set nome = coalesce(nullif(trim(p_nome), ''), nome),
         telefone = coalesce(trim(p_telefone), '')
   where id = auth.uid();
end $$;

create or replace function public.password_mudada() returns void
language sql security definer set search_path = public as $$
  update public.perfis set mudar_password = false where id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- Tarefas
-- freq: diaria | semanal | mensal | anual | unica
-- estado_periodo: período a que o estado se refere (2026-11-02, 2026-W45, 2026-11, 2026 ou unica);
-- nas tarefas repetidas, um estado de um período anterior conta como "por fazer".
-- ---------------------------------------------------------------------
create table if not exists public.tarefas (
  id                uuid primary key default gen_random_uuid(),
  titulo            text not null default '',
  marca             text not null default 'grupo'
                    check (marca in ('twentysix','barbearia','academy','tech','grooms','grupo')),
  departamento_id   text references public.departamentos(id) on update cascade on delete set null,
  freq              text not null default 'unica' check (freq in ('diaria','semanal','mensal','anual','unica')),
  estado            text not null default 'por_fazer' check (estado in ('por_fazer','em_curso','concluido')),
  estado_periodo    text not null default 'unica',
  prioridade        text not null default 'media' check (prioridade in ('alta','media','baixa')),
  responsavel_id    uuid references public.perfis(id) on delete set null,
  prazo             date,
  notas             text not null default '',
  checklist         jsonb not null default '[]'::jsonb,
  checklist_periodo text not null default '',
  modelo            text,
  criado_por        uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  concluido_por     uuid references public.perfis(id) on delete set null,
  concluido_em      timestamptz
);
create index if not exists tarefas_responsavel on public.tarefas (responsavel_id);
create index if not exists tarefas_departamento on public.tarefas (departamento_id);
drop index if exists public.tarefas_modelo;
create unique index if not exists tarefas_modelo_unico on public.tarefas (modelo);

create or replace function public.tarefas_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.criado_por := auth.uid();
      if not public.pode_atribuir(new.responsavel_id) then
        raise exception 'Não tens permissão para atribuir tarefas a esta pessoa.';
      end if;
    elsif new.responsavel_id is distinct from old.responsavel_id
          and not public.pode_atribuir(new.responsavel_id) then
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

drop trigger if exists tarefas_antes on public.tarefas;
create trigger tarefas_antes before insert or update on public.tarefas
  for each row execute function public.tarefas_antes();

-- ---------------------------------------------------------------------
-- Atividade (quem fez o quê) — escrita só pelos triggers
-- ---------------------------------------------------------------------
create table if not exists public.atividade (
  id              bigint generated always as identity primary key,
  tarefa_id       uuid,
  titulo          text not null default '',
  marca           text,
  departamento_id text,
  autor_id        uuid references public.perfis(id) on delete set null,
  responsavel_id  uuid,
  acao            text not null,   -- criou | atribuiu | iniciou | concluiu | reabriu | eliminou
  periodo         text,
  detalhe         jsonb not null default '{}'::jsonb,
  criado_em       timestamptz not null default now()
);
create index if not exists atividade_data on public.atividade (criado_em desc);
create index if not exists atividade_tarefa on public.atividade (tarefa_id);

create or replace function public.tarefas_registar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a uuid := auth.uid();
  r public.tarefas;
  v_acao text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;

  if tg_op = 'INSERT' then
    insert into public.atividade (tarefa_id, titulo, marca, departamento_id, autor_id, responsavel_id, acao, periodo)
    values (r.id, r.titulo, r.marca, r.departamento_id, a, r.responsavel_id, 'criou', r.estado_periodo);
    if r.responsavel_id is not null and r.responsavel_id is distinct from a then
      insert into public.atividade (tarefa_id, titulo, marca, departamento_id, autor_id, responsavel_id, acao, periodo)
      values (r.id, r.titulo, r.marca, r.departamento_id, a, r.responsavel_id, 'atribuiu', r.estado_periodo);
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.atividade (tarefa_id, titulo, marca, departamento_id, autor_id, responsavel_id, acao, periodo)
    values (r.id, r.titulo, r.marca, r.departamento_id, a, r.responsavel_id, 'eliminou', r.estado_periodo);
    return old;
  end if;

  -- UPDATE
  if new.responsavel_id is distinct from old.responsavel_id and new.responsavel_id is not null then
    insert into public.atividade (tarefa_id, titulo, marca, departamento_id, autor_id, responsavel_id, acao, periodo)
    values (r.id, r.titulo, r.marca, r.departamento_id, a, r.responsavel_id, 'atribuiu', r.estado_periodo);
  end if;

  if new.estado is distinct from old.estado or new.estado_periodo is distinct from old.estado_periodo then
    v_acao := case
      when new.estado = 'concluido' then 'concluiu'
      when old.estado = 'concluido' and new.estado_periodo = old.estado_periodo then 'reabriu'
      when new.estado = 'em_curso' then 'iniciou'
      else null end;
    if v_acao is not null then
      insert into public.atividade (tarefa_id, titulo, marca, departamento_id, autor_id, responsavel_id, acao, periodo)
      values (r.id, r.titulo, r.marca, r.departamento_id, a, r.responsavel_id, v_acao, r.estado_periodo);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tarefas_registar on public.tarefas;
create trigger tarefas_registar after insert or update or delete on public.tarefas
  for each row execute function public.tarefas_registar();

-- ---------------------------------------------------------------------
-- Notificações
-- ---------------------------------------------------------------------
create table if not exists public.notificacoes (
  id              bigint generated always as identity primary key,
  destinatario_id uuid not null references public.perfis(id) on delete cascade,
  tipo            text not null,
  titulo          text not null,
  corpo           text not null default '',
  link            text not null default '',
  lida            boolean not null default false,
  criado_em       timestamptz not null default now()
);
create index if not exists notificacoes_dest on public.notificacoes (destinatario_id, criado_em desc);

create or replace function public.tarefas_notificar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a uuid := auth.uid();
  v_nome text;
  v_titulo text := coalesce(nullif(trim(new.titulo), ''), 'Sem título');
begin
  select nome into v_nome from public.perfis where id = a;
  v_nome := coalesce(v_nome, 'A direção');

  if new.responsavel_id is not null and new.responsavel_id is distinct from a
     and (tg_op = 'INSERT' or new.responsavel_id is distinct from old.responsavel_id) then
    insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
    values (new.responsavel_id, 'tarefa_atribuida', 'Nova tarefa para ti',
            v_nome || ' atribuiu-te: ' || v_titulo, '#tarefa-' || new.id);
  end if;

  -- Tarefa pontual concluída por outra pessoa: avisa quem a criou
  if tg_op = 'UPDATE' and new.freq = 'unica' and new.estado = 'concluido' and old.estado <> 'concluido'
     and new.criado_por is not null and new.criado_por is distinct from a then
    insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
    values (new.criado_por, 'tarefa_concluida', 'Tarefa concluída',
            v_nome || ' concluiu: ' || v_titulo, '#tarefa-' || new.id);
  end if;
  return new;
end $$;

drop trigger if exists tarefas_notificar on public.tarefas;
create trigger tarefas_notificar after insert or update on public.tarefas
  for each row execute function public.tarefas_notificar();

-- ---------------------------------------------------------------------
-- Notificações no telemóvel (Web Push)
-- ---------------------------------------------------------------------
create table if not exists public.subscricoes_push (
  id         bigint generated always as identity primary key,
  perfil_id  uuid not null references public.perfis(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  aparelho   text not null default '',
  criado_em  timestamptz not null default now()
);

create or replace function public.registar_push(p_endpoint text, p_p256dh text, p_auth text, p_aparelho text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.e_membro() then raise exception 'Sem acesso.'; end if;
  delete from public.subscricoes_push where endpoint = p_endpoint;
  insert into public.subscricoes_push (perfil_id, endpoint, p256dh, auth, aparelho)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, coalesce(p_aparelho, ''));
end $$;

-- Configuração pública (ex.: chave pública das notificações) e privada (só servidor)
create table if not exists public.configuracao (
  chave         text primary key,
  valor         text not null,
  atualizado_em timestamptz not null default now()
);
create table if not exists public.configuracao_privada (
  chave text primary key,
  valor text not null
);

do $$ begin
  insert into public.configuracao_privada (chave, valor)
  values ('segredo_webhook', md5(random()::text || clock_timestamp()::text) || md5(random()::text))
  on conflict (chave) do nothing;
end $$;

-- Envio automático: cada notificação nova chama a função enviar-push
do $$ begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net indisponível: as notificações no telemóvel ficam desligadas.';
end $$;

create or replace function public.notificacoes_enviar_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_seg text;
begin
  select valor into v_url from public.configuracao where chave = 'url_funcoes';
  select valor into v_seg from public.configuracao_privada where chave = 'segredo_webhook';
  if v_url is null then return new; end if;
  begin
    perform net.http_post(
      url     := v_url || '/enviar-push',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-segredo', v_seg),
      body    := jsonb_build_object('acao', 'enviar', 'notificacao', to_jsonb(new))
    );
  exception when others then
    raise warning 'Falha ao pedir o envio da notificação: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists notificacoes_enviar_push on public.notificacoes;
create trigger notificacoes_enviar_push after insert on public.notificacoes
  for each row execute function public.notificacoes_enviar_push();

-- ---------------------------------------------------------------------
-- Segurança por linha (RLS)
-- ---------------------------------------------------------------------
alter table public.departamentos        enable row level security;
alter table public.perfis               enable row level security;
alter table public.tarefas              enable row level security;
alter table public.atividade            enable row level security;
alter table public.notificacoes         enable row level security;
alter table public.subscricoes_push     enable row level security;
alter table public.configuracao         enable row level security;
alter table public.configuracao_privada enable row level security;  -- sem políticas: ninguém lê pela app

drop policy if exists dep_ler on public.departamentos;
create policy dep_ler on public.departamentos for select to authenticated using (public.e_membro());
drop policy if exists dep_gerir on public.departamentos;
create policy dep_gerir on public.departamentos for all to authenticated
  using (public.e_gestor()) with check (public.e_gestor());

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated
  using (public.e_membro() or id = auth.uid());
drop policy if exists perfis_gerir on public.perfis;
create policy perfis_gerir on public.perfis for update to authenticated
  using (public.e_gestor()) with check (public.e_gestor());

drop policy if exists tarefas_ler on public.tarefas;
create policy tarefas_ler on public.tarefas for select to authenticated using (
  public.e_gestor()
  or responsavel_id = auth.uid()
  or criado_por = auth.uid()
  or (public.e_membro() and departamento_id = public.meu_departamento()
      and (public.meu_papel() = 'chefe' or responsavel_id is null))
);
drop policy if exists tarefas_criar on public.tarefas;
create policy tarefas_criar on public.tarefas for insert to authenticated
  with check (public.e_membro() and public.pode_atribuir(responsavel_id));
drop policy if exists tarefas_editar on public.tarefas;
create policy tarefas_editar on public.tarefas for update to authenticated using (
  public.e_gestor()
  or responsavel_id = auth.uid()
  or criado_por = auth.uid()
  or (public.e_membro() and departamento_id = public.meu_departamento()
      and (public.meu_papel() = 'chefe' or responsavel_id is null))
) with check (public.e_membro());
drop policy if exists tarefas_apagar on public.tarefas;
create policy tarefas_apagar on public.tarefas for delete to authenticated using (
  public.e_gestor()
  or criado_por = auth.uid()
  or (public.meu_papel() = 'chefe' and departamento_id = public.meu_departamento())
);

drop policy if exists atividade_ler on public.atividade;
create policy atividade_ler on public.atividade for select to authenticated using (
  public.e_gestor()
  or autor_id = auth.uid()
  or responsavel_id = auth.uid()
  or (public.meu_papel() = 'chefe' and departamento_id = public.meu_departamento())
);

drop policy if exists notif_ler on public.notificacoes;
create policy notif_ler on public.notificacoes for select to authenticated using (destinatario_id = auth.uid());
drop policy if exists notif_marcar on public.notificacoes;
create policy notif_marcar on public.notificacoes for update to authenticated
  using (destinatario_id = auth.uid()) with check (destinatario_id = auth.uid());
drop policy if exists notif_apagar on public.notificacoes;
create policy notif_apagar on public.notificacoes for delete to authenticated using (destinatario_id = auth.uid());

drop policy if exists push_proprio on public.subscricoes_push;
create policy push_proprio on public.subscricoes_push for all to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

drop policy if exists config_ler on public.configuracao;
create policy config_ler on public.configuracao for select to authenticated using (public.e_membro());
drop policy if exists config_gerir on public.configuracao;
create policy config_gerir on public.configuracao for all to authenticated
  using (public.e_gestor()) with check (public.e_gestor());

-- Acessos: só utilizadores com sessão iniciada; visitantes anónimos não leem nada
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.departamentos, public.perfis, public.tarefas, public.atividade,
  public.notificacoes, public.subscricoes_push, public.configuracao
  to authenticated;
revoke all on public.configuracao_privada from authenticated;
revoke insert, update, delete on public.atividade from authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------
-- Tempo real
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['tarefas','notificacoes','atividade','perfis','departamentos'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Endereço das funções deste projeto (usado no envio das notificações)
-- ---------------------------------------------------------------------
insert into public.configuracao (chave, valor)
values ('url_funcoes', 'https://rpnahccsdxhzraoerhvq.supabase.co/functions/v1')
on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
