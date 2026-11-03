-- =====================================================================
-- Central 26 · 04 · Chat interno e agenda do CEO
-- Correr uma vez no Supabase: SQL Editor → New query → colar tudo → Run
-- Pode voltar a ser corrido sem apagar dados.
-- =====================================================================

-- =====================================================================
-- CHAT
-- Canais: geral (todos) · departamento (membros + direção) · direto (duas pessoas)
-- =====================================================================
create table if not exists public.chat_canais (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('geral','departamento','direto')),
  nome            text not null default '',
  departamento_id text unique references public.departamentos(id) on update cascade on delete cascade,
  chave_direta    text unique,
  criado_por      uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em       timestamptz not null default now()
);
create unique index if not exists chat_um_geral on public.chat_canais ((tipo)) where tipo = 'geral';

create table if not exists public.chat_membros (
  canal_id  uuid not null references public.chat_canais(id) on delete cascade,
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  lido_ate  timestamptz not null default now(),
  primary key (canal_id, perfil_id)
);

create table if not exists public.chat_mensagens (
  id         bigint generated always as identity primary key,
  canal_id   uuid not null references public.chat_canais(id) on delete cascade,
  autor_id   uuid references public.perfis(id) on delete set null default auth.uid(),
  texto      text not null default '' check (length(texto) <= 4000),
  mencoes    uuid[] not null default '{}',
  criado_em  timestamptz not null default now(),
  editado_em timestamptz,
  apagado    boolean not null default false
);
create index if not exists chat_msg_canal on public.chat_mensagens (canal_id, criado_em desc);

-- Canal geral e um por departamento (também para departamentos criados depois)
insert into public.chat_canais (tipo, nome) select 'geral', 'Geral'
 where not exists (select 1 from public.chat_canais where tipo = 'geral');
insert into public.chat_canais (tipo, nome, departamento_id)
select 'departamento', d.nome, d.id from public.departamentos d
on conflict (departamento_id) do nothing;

create or replace function public.departamentos_canal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.chat_canais (tipo, nome, departamento_id) values ('departamento', new.nome, new.id)
    on conflict (departamento_id) do nothing;
  elsif new.nome is distinct from old.nome then
    update public.chat_canais set nome = new.nome where departamento_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists departamentos_canal on public.departamentos;
create trigger departamentos_canal after insert or update on public.departamentos
  for each row execute function public.departamentos_canal();

create or replace function public.pode_ver_canal(p_canal uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.e_membro() and exists (
    select 1 from public.chat_canais c
     where c.id = p_canal
       and (c.tipo = 'geral'
            or (c.tipo = 'departamento' and (public.e_gestor() or c.departamento_id = public.meu_departamento()))
            or (c.tipo = 'direto' and exists (select 1 from public.chat_membros m where m.canal_id = c.id and m.perfil_id = auth.uid()))))
$$;

-- Abre (ou cria) a conversa direta com outra pessoa
create or replace function public.chat_canal_direto(p_outro uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_chave text;
  v_id uuid;
begin
  if not public.e_membro() then raise exception 'Sem acesso.'; end if;
  if p_outro = auth.uid() then raise exception 'Escolhe outra pessoa.'; end if;
  if not exists (select 1 from public.perfis where id = p_outro and ativo) then raise exception 'Esta pessoa não está ativa.'; end if;
  v_chave := least(auth.uid()::text, p_outro::text) || '|' || greatest(auth.uid()::text, p_outro::text);
  select id into v_id from public.chat_canais where chave_direta = v_chave;
  if v_id is null then
    insert into public.chat_canais (tipo, nome, chave_direta) values ('direto', '', v_chave)
    on conflict (chave_direta) do nothing returning id into v_id;
    if v_id is null then select id into v_id from public.chat_canais where chave_direta = v_chave; end if;
    insert into public.chat_membros (canal_id, perfil_id, lido_ate) values (v_id, auth.uid(), now()), (v_id, p_outro, now())
    on conflict do nothing;
  end if;
  return v_id;
end $$;

-- Lista de conversas visíveis com a última mensagem e quantas faltam ler
create or replace function public.chat_resumo()
returns table (canal_id uuid, tipo text, nome text, departamento_id text, outro_id uuid,
               ultima_em timestamptz, ultima_texto text, ultimo_autor uuid, por_ler int)
language sql stable security definer set search_path = public as $$
  with vis as (
    select c.* from public.chat_canais c where public.pode_ver_canal(c.id)
  ), eu as (
    select criado_em from public.perfis where id = auth.uid()
  )
  select v.id, v.tipo, v.nome, v.departamento_id,
         (select m.perfil_id from public.chat_membros m where m.canal_id = v.id and m.perfil_id <> auth.uid() limit 1),
         u.criado_em, case when u.apagado then '' else left(u.texto, 140) end, u.autor_id,
         (select count(*)::int from public.chat_mensagens x
           where x.canal_id = v.id and not x.apagado and x.autor_id is distinct from auth.uid()
             and x.criado_em > coalesce((select lido_ate from public.chat_membros m where m.canal_id = v.id and m.perfil_id = auth.uid()),
                                        (select criado_em from eu)))
    from vis v
    left join lateral (select * from public.chat_mensagens x where x.canal_id = v.id order by x.criado_em desc limit 1) u on true
$$;

create or replace function public.chat_marcar_lido(p_canal uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.pode_ver_canal(p_canal) then return; end if;
  insert into public.chat_membros (canal_id, perfil_id, lido_ate) values (p_canal, auth.uid(), now())
  on conflict (canal_id, perfil_id) do update set lido_ate = now();
  update public.notificacoes set lida = true
   where destinatario_id = auth.uid() and link = '#chat-' || p_canal and not lida;
end $$;

create or replace function public.chat_mensagens_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.autor_id := auth.uid(); end if;
    new.criado_em := now(); new.editado_em := null; new.apagado := false;
    new.texto := trim(new.texto);
    if new.texto = '' then raise exception 'A mensagem está vazia.'; end if;
    return new;
  end if;
  -- só o autor edita ou apaga, e só o texto muda
  if auth.uid() is not null and old.autor_id is distinct from auth.uid() then
    raise exception 'Só podes alterar as tuas mensagens.';
  end if;
  new.canal_id := old.canal_id; new.autor_id := old.autor_id; new.criado_em := old.criado_em; new.mencoes := old.mencoes;
  if new.apagado then new.texto := ''; new.editado_em := coalesce(new.editado_em, now());
  elsif new.texto is distinct from old.texto then new.texto := trim(new.texto); new.editado_em := now();
    if new.texto = '' then raise exception 'A mensagem está vazia.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists chat_mensagens_antes on public.chat_mensagens;
create trigger chat_mensagens_antes before insert or update on public.chat_mensagens
  for each row execute function public.chat_mensagens_antes();

-- Avisos: mensagem direta e menções. Uma notificação por conversa até ser lida (sem encher de avisos).
create or replace function public.chat_notificar(p_dest uuid, p_canal uuid, p_titulo text, p_corpo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  select id into v_id from public.notificacoes
   where destinatario_id = p_dest and link = '#chat-' || p_canal and not lida order by criado_em desc limit 1;
  if v_id is null then
    insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link) values (p_dest, 'mensagem', p_titulo, p_corpo, '#chat-' || p_canal);
  else
    update public.notificacoes set titulo = p_titulo, corpo = p_corpo, criado_em = now() where id = v_id;
  end if;
end $$;

create or replace function public.chat_mensagens_depois() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c public.chat_canais;
  v_autor text;
  v_curto text := left(new.texto, 120);
  d uuid;
begin
  select * into c from public.chat_canais where id = new.canal_id;
  select nome into v_autor from public.perfis where id = new.autor_id;
  v_autor := coalesce(v_autor, 'Alguém');
  if c.tipo = 'direto' then
    for d in select perfil_id from public.chat_membros where canal_id = c.id and perfil_id is distinct from new.autor_id loop
      perform public.chat_notificar(d, c.id, 'Mensagem de ' || v_autor, v_curto);
    end loop;
  else
    for d in select unnest(new.mencoes) loop
      if d is distinct from new.autor_id and exists (
          select 1 from public.perfis p where p.id = d and p.ativo
             and (c.tipo = 'geral' or p.papel in ('ceo','admin') or p.departamento_id = c.departamento_id)) then
        perform public.chat_notificar(d, c.id, v_autor || ' mencionou-te em #' || c.nome, v_curto);
      end if;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists chat_mensagens_depois on public.chat_mensagens;
create trigger chat_mensagens_depois after insert on public.chat_mensagens
  for each row execute function public.chat_mensagens_depois();

alter table public.chat_canais    enable row level security;
alter table public.chat_membros   enable row level security;
alter table public.chat_mensagens enable row level security;

drop policy if exists chat_canais_ler on public.chat_canais;
create policy chat_canais_ler on public.chat_canais for select to authenticated using (public.pode_ver_canal(id));
drop policy if exists chat_membros_ler on public.chat_membros;
create policy chat_membros_ler on public.chat_membros for select to authenticated using (public.pode_ver_canal(canal_id));
drop policy if exists chat_msg_ler on public.chat_mensagens;
create policy chat_msg_ler on public.chat_mensagens for select to authenticated using (public.pode_ver_canal(canal_id));
drop policy if exists chat_msg_criar on public.chat_mensagens;
create policy chat_msg_criar on public.chat_mensagens for insert to authenticated
  with check (public.pode_ver_canal(canal_id) and autor_id = auth.uid());
drop policy if exists chat_msg_editar on public.chat_mensagens;
create policy chat_msg_editar on public.chat_mensagens for update to authenticated
  using (autor_id = auth.uid()) with check (autor_id = auth.uid());

revoke all on public.chat_canais, public.chat_membros, public.chat_mensagens from anon;
grant select on public.chat_canais, public.chat_membros to authenticated;
grant select, insert, update on public.chat_mensagens to authenticated;
revoke all on function public.chat_notificar(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.chat_canal_direto(uuid), public.chat_resumo(), public.chat_marcar_lido(uuid) to authenticated;

-- =====================================================================
-- AGENDA DO CEO
-- Quem gere: o CEO e quem tiver «gere_agenda» (o Samuel). Quem vê: quem gere,
-- os participantes de cada evento e toda a equipa nos eventos marcados como visíveis.
-- =====================================================================
alter table public.perfis add column if not exists gere_agenda boolean not null default false;

create or replace function public.pode_agenda() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo and (papel = 'ceo' or gere_agenda))
$$;

-- Só o CEO e a administração dão a permissão da agenda, e ninguém a dá a si próprio
create or replace function public.perfis_proteger_agenda() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or new.gere_agenda is not distinct from old.gere_agenda then return new; end if;
  if not public.e_gestor() then raise exception 'Só o CEO e a administração podem dar acesso à agenda.'; end if;
  if new.id = auth.uid() and public.meu_papel() <> 'ceo' then raise exception 'Não podes dar acesso à agenda a ti próprio.'; end if;
  return new;
end $$;
drop trigger if exists perfis_proteger_agenda on public.perfis;
create trigger perfis_proteger_agenda before update on public.perfis
  for each row execute function public.perfis_proteger_agenda();

create table if not exists public.agenda_eventos (
  id                uuid primary key default gen_random_uuid(),
  titulo            text not null check (length(trim(titulo)) > 0),
  inicio            timestamptz not null,
  fim               timestamptz,
  dia_inteiro       boolean not null default false,
  local             text not null default '',
  notas             text not null default '',
  participantes     uuid[] not null default '{}',
  visivel_equipa    boolean not null default false,
  lembrete_min      int check (lembrete_min is null or lembrete_min between 0 and 10080),
  lembrete_enviado  boolean not null default false,
  criado_por        uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  atualizado_por    uuid references public.perfis(id) on delete set null,
  check (fim is null or fim >= inicio)
);
create index if not exists agenda_inicio on public.agenda_eventos (inicio);

create or replace function public.agenda_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if auth.uid() is not null then new.atualizado_por := auth.uid(); end if;
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.criado_por := auth.uid(); end if;
  else
    new.criado_por := old.criado_por; new.criado_em := old.criado_em;
    if new.inicio is distinct from old.inicio or new.lembrete_min is distinct from old.lembrete_min then new.lembrete_enviado := false; end if;
  end if;
  return new;
end $$;
drop trigger if exists agenda_antes on public.agenda_eventos;
create trigger agenda_antes before insert or update on public.agenda_eventos
  for each row execute function public.agenda_antes();

-- Avisos: o CEO sabe quando outra pessoa lhe marca ou muda algo; os participantes sabem quando são convidados ou o evento muda
create or replace function public.agenda_notificar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a uuid := auth.uid();
  v_autor text;
  v_quando text;
  p uuid;
  r record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  select nome into v_autor from public.perfis where id = a;
  v_autor := coalesce(v_autor, 'Alguém');
  v_quando := to_char(r.inicio at time zone 'Europe/Lisbon', 'DD/MM') ||
              case when r.dia_inteiro then '' else ' às ' || to_char(r.inicio at time zone 'Europe/Lisbon', 'HH24:MI') end;

  -- CEO(s)
  for p in select id from public.perfis where papel = 'ceo' and ativo and id is distinct from a loop
    if tg_op = 'INSERT' then
      insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link) values (p, 'agenda', 'Novo evento na tua agenda', v_autor || ' marcou: ' || r.titulo || ' · ' || v_quando, '#agenda-' || r.id);
    elsif tg_op = 'DELETE' then
      insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link) values (p, 'agenda', 'Evento cancelado', v_autor || ' cancelou: ' || r.titulo || ' · ' || v_quando, '#agenda');
    elsif new.inicio is distinct from old.inicio or new.titulo is distinct from old.titulo or new.local is distinct from old.local then
      insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link) values (p, 'agenda', 'Evento alterado', v_autor || ' alterou: ' || r.titulo || ' · ' || v_quando, '#agenda-' || r.id);
    end if;
  end loop;

  -- participantes
  if tg_op = 'INSERT' then
    for p in select unnest(new.participantes) loop
      if p is distinct from a then
        insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link) values (p, 'agenda', 'Convite para um evento', r.titulo || ' · ' || v_quando, '#agenda-' || r.id);
      end if;
    end loop;
  elsif tg_op = 'UPDATE' then
    for p in select unnest(new.participantes) loop
      if p is distinct from a and not (p = any(old.participantes)) then
        insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link) values (p, 'agenda', 'Convite para um evento', r.titulo || ' · ' || v_quando, '#agenda-' || r.id);
      elsif p is distinct from a and (new.inicio is distinct from old.inicio or new.local is distinct from old.local) then
        insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link) values (p, 'agenda', 'Evento alterado', r.titulo || ' · ' || v_quando, '#agenda-' || r.id);
      end if;
    end loop;
  else
    for p in select unnest(old.participantes) loop
      if p is distinct from a then
        insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link) values (p, 'agenda', 'Evento cancelado', r.titulo || ' · ' || v_quando, '#agenda');
      end if;
    end loop;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists agenda_notificar on public.agenda_eventos;
create trigger agenda_notificar after insert or update or delete on public.agenda_eventos
  for each row execute function public.agenda_notificar();

-- Lembretes: corre a cada minuto (pg_cron)
create or replace function public.agenda_lembretes() returns int
language plpgsql security definer set search_path = public as $$
declare
  e record; p uuid; n int := 0;
begin
  for e in select * from public.agenda_eventos
            where lembrete_min is not null and not lembrete_enviado
              and inicio - make_interval(mins => lembrete_min) <= now() and inicio > now() - interval '2 hours' loop
    for p in select id from public.perfis where ativo and (papel = 'ceo' or id = any(e.participantes)) loop
      insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
      values (p, 'lembrete', case when e.lembrete_min = 0 then 'Agora: ' else 'Daqui a pouco: ' end || e.titulo,
              to_char(e.inicio at time zone 'Europe/Lisbon', 'HH24:MI') || case when e.local <> '' then ' · ' || e.local else '' end, '#agenda-' || e.id);
      n := n + 1;
    end loop;
    update public.agenda_eventos set lembrete_enviado = true where id = e.id;
  end loop;
  return n;
end $$;
revoke all on function public.agenda_lembretes() from public, anon, authenticated;

do $$ begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'central26-lembretes';
  perform cron.schedule('central26-lembretes', '* * * * *', 'select public.agenda_lembretes()');
exception when others then
  raise notice 'pg_cron indisponível: os lembretes da agenda ficam desligados (%).', sqlerrm;
end $$;

alter table public.agenda_eventos enable row level security;
drop policy if exists agenda_ler on public.agenda_eventos;
create policy agenda_ler on public.agenda_eventos for select to authenticated using (
  public.pode_agenda() or (public.e_membro() and (visivel_equipa or auth.uid() = any(participantes))));
drop policy if exists agenda_criar on public.agenda_eventos;
create policy agenda_criar on public.agenda_eventos for insert to authenticated with check (public.pode_agenda());
drop policy if exists agenda_editar on public.agenda_eventos;
create policy agenda_editar on public.agenda_eventos for update to authenticated using (public.pode_agenda()) with check (public.pode_agenda());
drop policy if exists agenda_apagar on public.agenda_eventos;
create policy agenda_apagar on public.agenda_eventos for delete to authenticated using (public.pode_agenda());
revoke all on public.agenda_eventos from anon;
grant select, insert, update, delete on public.agenda_eventos to authenticated;

-- Tempo real
do $$
declare t text;
begin
  foreach t in array array['chat_mensagens','chat_canais','agenda_eventos'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null; end;
  end loop;
end $$;
