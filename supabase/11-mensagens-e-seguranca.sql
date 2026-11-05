-- =====================================================================
-- Central 26 · 11 · Mensagens (grupos com nome e mensagens de voz) e revisão de segurança
-- Correr uma vez no Supabase: SQL Editor → New query → colar tudo → Run
-- Pode voltar a ser corrido sem apagar dados. Corre-se depois de todos os anteriores (02 a 10).
-- Se um dia voltares a correr o 04-chat-agenda.sql, corre este outra vez a seguir.
-- =====================================================================

-- Novo tipo de conversa: grupo (pessoas escolhidas, com nome)
alter table public.chat_canais drop constraint if exists chat_canais_tipo_check;
alter table public.chat_canais add constraint chat_canais_tipo_check check (tipo in ('geral','departamento','direto','grupo'));

-- Anexo de voz nas mensagens
alter table public.chat_mensagens add column if not exists anexo_path text;
alter table public.chat_mensagens add column if not exists anexo_tipo text;
alter table public.chat_mensagens add column if not exists anexo_duracao numeric(6,1);
alter table public.chat_mensagens drop constraint if exists chat_msg_anexo_ok;
alter table public.chat_mensagens add constraint chat_msg_anexo_ok check (anexo_path is null or (anexo_tipo like 'audio/%' and anexo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webm|ogg|m4a|mp4|aac|mp3)$'));

create or replace function public.pode_ver_canal(p_canal uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.e_membro() and exists (
    select 1 from public.chat_canais c
     where c.id = p_canal
       and (c.tipo = 'geral'
            or (c.tipo = 'departamento' and (public.e_gestor() or c.departamento_id = public.meu_departamento()))
            or (c.tipo in ('direto','grupo') and exists (select 1 from public.chat_membros m where m.canal_id = c.id and m.perfil_id = auth.uid()))))
$$;

-- Criar um grupo: quem cria entra sempre; só pessoas ativas
create or replace function public.chat_criar_grupo(p_nome text, p_membros uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nome text := left(trim(coalesce(p_nome, '')), 60);
begin
  if not public.e_membro() then raise exception 'Sem acesso.'; end if;
  if v_nome = '' then raise exception 'Dá um nome ao grupo.'; end if;
  if coalesce(array_length(p_membros, 1), 0) < 1 then raise exception 'Escolhe pelo menos uma pessoa.'; end if;
  insert into public.chat_canais (tipo, nome) values ('grupo', v_nome) returning id into v_id;
  insert into public.chat_membros (canal_id, perfil_id, lido_ate)
  select v_id, p.id, now() from public.perfis p where p.ativo and (p.id = auth.uid() or p.id = any(p_membros))
  on conflict do nothing;
  return v_id;
end $$;

-- Sair de um grupo (o grupo fica para os restantes)
create or replace function public.chat_sair_grupo(p_canal uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.chat_canais where id = p_canal and tipo = 'grupo') then raise exception 'Só se pode sair de grupos.'; end if;
  delete from public.chat_membros where canal_id = p_canal and perfil_id = auth.uid();
end $$;

-- Membros de um grupo (para mostrar quem lá está)
create or replace function public.chat_membros_de(p_canal uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.perfil_id from public.chat_membros m where m.canal_id = p_canal and public.pode_ver_canal(p_canal)
$$;

-- Resumo das conversas: o texto de uma mensagem de voz aparece como «Mensagem de voz»
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
         case when v.tipo = 'direto' then (select m.perfil_id from public.chat_membros m where m.canal_id = v.id and m.perfil_id <> auth.uid() limit 1) end,
         u.criado_em,
         case when u.apagado then '' when u.anexo_path is not null and u.texto = '' then 'Mensagem de voz' else left(u.texto, 140) end, u.autor_id,
         (select count(*)::int from public.chat_mensagens x
           where x.canal_id = v.id and not x.apagado and x.autor_id is distinct from auth.uid()
             and x.criado_em > coalesce((select lido_ate from public.chat_membros m where m.canal_id = v.id and m.perfil_id = auth.uid()),
                                        (select criado_em from eu)))
    from vis v
    left join lateral (select * from public.chat_mensagens x where x.canal_id = v.id order by x.criado_em desc limit 1) u on true
$$;

create or replace function public.chat_mensagens_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.autor_id := auth.uid(); end if;
    new.criado_em := now(); new.editado_em := null; new.apagado := false;
    new.texto := trim(new.texto);
    if new.anexo_path is not null and split_part(new.anexo_path, '/', 1) <> new.canal_id::text then
      raise exception 'O áudio não pertence a esta conversa.';
    end if;
    if new.texto = '' and new.anexo_path is null then raise exception 'A mensagem está vazia.'; end if;
    return new;
  end if;
  -- só o autor edita ou apaga, e só o texto muda
  if auth.uid() is not null and old.autor_id is distinct from auth.uid() then
    raise exception 'Só podes alterar as tuas mensagens.';
  end if;
  new.canal_id := old.canal_id; new.autor_id := old.autor_id; new.criado_em := old.criado_em; new.mencoes := old.mencoes;
  new.anexo_tipo := old.anexo_tipo; new.anexo_duracao := old.anexo_duracao;
  if new.apagado then new.texto := ''; new.anexo_path := null; new.editado_em := coalesce(new.editado_em, now());
  else
    new.anexo_path := old.anexo_path;
    if new.texto is distinct from old.texto then new.texto := trim(new.texto); new.editado_em := now();
      if new.texto = '' and new.anexo_path is null then raise exception 'A mensagem está vazia.'; end if;
    end if;
  end if;
  return new;
end $$;

-- Avisos: conversas diretas e grupos avisam todos os membros; canais só as menções
create or replace function public.chat_mensagens_depois() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c public.chat_canais;
  v_autor text;
  v_curto text := case when new.texto = '' and new.anexo_path is not null then 'Mensagem de voz' else left(new.texto, 120) end;
  d uuid;
begin
  select * into c from public.chat_canais where id = new.canal_id;
  select nome into v_autor from public.perfis where id = new.autor_id;
  v_autor := coalesce(v_autor, 'Alguém');
  if c.tipo = 'direto' then
    for d in select perfil_id from public.chat_membros where canal_id = c.id and perfil_id is distinct from new.autor_id loop
      perform public.chat_notificar(d, c.id, 'Mensagem de ' || v_autor, v_curto);
    end loop;
  elsif c.tipo = 'grupo' then
    for d in select perfil_id from public.chat_membros where canal_id = c.id and perfil_id is distinct from new.autor_id loop
      perform public.chat_notificar(d, c.id, v_autor || ' em «' || c.nome || '»', v_curto);
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

revoke all on function public.chat_criar_grupo(text, uuid[]), public.chat_sair_grupo(uuid), public.chat_membros_de(uuid) from public, anon;
grant execute on function public.chat_criar_grupo(text, uuid[]), public.chat_sair_grupo(uuid), public.chat_membros_de(uuid) to authenticated;

-- Ficheiros de voz: pasta por conversa, só quem vê a conversa ouve e envia (máx. 10 MB)
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('chat', 'chat', false, 10485760, array['audio/webm','audio/ogg','audio/mp4','audio/aac','audio/mpeg','audio/x-m4a'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  drop policy if exists "central26 chat ouvir" on storage.objects;
  create policy "central26 chat ouvir" on storage.objects for select to authenticated
    using (bucket_id = 'chat' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and public.pode_ver_canal(((storage.foldername(name))[1])::uuid));
  drop policy if exists "central26 chat enviar" on storage.objects;
  create policy "central26 chat enviar" on storage.objects for insert to authenticated
    with check (bucket_id = 'chat' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and public.pode_ver_canal(((storage.foldername(name))[1])::uuid));
  drop policy if exists "central26 chat apagar" on storage.objects;
  create policy "central26 chat apagar" on storage.objects for delete to authenticated
    using (bucket_id = 'chat' and owner = auth.uid());
exception when undefined_table or invalid_schema_name then
  raise notice 'Storage indisponível: as mensagens de voz ficam desligadas.';
end $$;

-- =====================================================================
-- Revisão de segurança
-- =====================================================================

-- 2. Uma conta desativada não altera o próprio perfil
create or replace function public.atualizar_meu_perfil(p_nome text, p_telefone text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.e_membro() then raise exception 'Sem acesso.'; end if;
  update public.perfis
     set nome = coalesce(nullif(left(trim(p_nome), 80), ''), nome),
         telefone = left(coalesce(trim(p_telefone), ''), 30)
   where id = auth.uid();
end $$;

-- 3. Ao desativar uma conta, os aparelhos dessa pessoa deixam de receber avisos
create or replace function public.perfis_desativar_push() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.ativo and not new.ativo then delete from public.subscricoes_push where perfil_id = new.id; end if;
  return new;
end $$;
drop trigger if exists perfis_desativar_push on public.perfis;
create trigger perfis_desativar_push after update of ativo on public.perfis
  for each row execute function public.perfis_desativar_push();
delete from public.subscricoes_push s using public.perfis p where p.id = s.perfil_id and not p.ativo;

-- 4. Procura rápida da notificação por ler de cada conversa
create index if not exists notificacoes_por_ler on public.notificacoes (destinatario_id, link) where not lida;

-- 5. Nenhuma função da app pode ser chamada sem sessão iniciada
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as assinatura from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke execute on function %s from public, anon', f.assinatura);
    execute format('grant execute on function %s to authenticated, service_role', f.assinatura);
  end loop;
end $$;
-- funções internas continuam fora do alcance da app
revoke execute on function public.chat_notificar(uuid, uuid, text, text) from authenticated;
