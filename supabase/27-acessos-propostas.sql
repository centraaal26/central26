-- =====================================================================
-- Central 26 · 27 · Contas com acesso limitado e propostas de tarefas do assistente
-- Correr no Supabase: SQL Editor → New query → colar tudo → Run. Pode ser corrido mais do que uma vez.
--
-- 1) Acesso limitado (perfis.restrito): a pessoa só vê o módulo do seu departamento e as suas tarefas,
--    e nunca vê registos com valores em euros. Tudo o que tem € (tarefas, publicações e documentos do
--    Marketing) fica escondido para ela, na base de dados e não só no ecrã.
-- 2) Responsável direto (perfis.supervisor_id): quem responde por quem. O responsável direto vê as
--    tarefas dessa pessoa, pode atribuir-lhe tarefas e é quem aprova o que o assistente propõe.
-- 3) Propostas do assistente (ia_propostas): o assistente analisa as tarefas pendentes e propõe tarefas
--    para alguém. Nada muda até o responsável direto aprovar cada proposta.
-- =====================================================================

alter table public.perfis add column if not exists restrito boolean not null default false;
alter table public.perfis add column if not exists supervisor_id uuid references public.perfis(id) on delete set null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'perfis_supervisor_nao_proprio') then
    alter table public.perfis add constraint perfis_supervisor_nao_proprio check (supervisor_id is null or supervisor_id <> id);
  end if;
end $$;

create or replace function public.e_restrito() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select restrito from public.perfis where id = auth.uid()), false)
$$;

create or replace function public.e_supervisor_de(p_pessoa uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_pessoa is not null and exists (select 1 from public.perfis where id = p_pessoa and supervisor_id = auth.uid())
$$;

-- Texto com valores em euros: «€», «EUR», «euros» (não apanha «Europa» nem «europeu»)
create or replace function public.tem_euros(p text) returns boolean
language sql immutable as $$
  select coalesce(p, '') ~* '(€|\meur\M|\meuros?\M)'
$$;

-- Atribuir tarefas: o responsável direto também pode
create or replace function public.pode_atribuir(p_responsavel uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when not public.e_membro() then false
    when p_responsavel is null or p_responsavel = auth.uid() then true
    when public.e_gestor() then exists (select 1 from public.perfis where id = p_responsavel and ativo)
    when public.e_supervisor_de(p_responsavel) then exists (select 1 from public.perfis where id = p_responsavel and ativo)
    when public.meu_papel() = 'chefe' then exists (
      select 1 from public.perfis
      where id = p_responsavel and ativo and departamento_id = public.meu_departamento())
    else false
  end
$$;

/* ------------------------- registos com valores em € ------------------------- */
alter table public.tarefas        add column if not exists tem_valores boolean not null default false;
alter table public.mk_publicacoes add column if not exists tem_valores boolean not null default false;
alter table public.mk_documentos  add column if not exists tem_valores boolean not null default false;

create or replace function public.valores_tarefa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.tem_valores := public.tem_euros(coalesce(new.titulo, '') || ' ' || coalesce(new.notas, '') || ' ' || coalesce(new.checklist::text, ''));
  if new.tem_valores and public.e_restrito() then
    raise exception 'Não podes escrever valores em euros (€) nesta conta. Pede a quem te atribuiu a tarefa.';
  end if;
  return new;
end $$;
drop trigger if exists tarefas_valores on public.tarefas;
create trigger tarefas_valores before insert or update on public.tarefas for each row execute function public.valores_tarefa();

create or replace function public.valores_mk_pub() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.tem_valores := public.tem_euros(concat_ws(' ', new.titulo, new.copy, new.notas, new.inspiracao, new.link));
  if new.tem_valores and public.e_restrito() then
    raise exception 'Não podes escrever valores em euros (€) nesta conta. Pede ao responsável do Marketing.';
  end if;
  return new;
end $$;
drop trigger if exists mk_pub_valores on public.mk_publicacoes;
create trigger mk_pub_valores before insert or update on public.mk_publicacoes for each row execute function public.valores_mk_pub();

create or replace function public.valores_mk_doc() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.tem_valores := public.tem_euros(concat_ws(' ', new.titulo, new.conteudo));
  if new.tem_valores and public.e_restrito() then
    raise exception 'Não podes escrever valores em euros (€) nesta conta. Pede ao responsável do Marketing.';
  end if;
  return new;
end $$;
drop trigger if exists mk_doc_valores on public.mk_documentos;
create trigger mk_doc_valores before insert or update on public.mk_documentos for each row execute function public.valores_mk_doc();

-- marcar o que já existe
update public.tarefas set tem_valores = true
 where not tem_valores and public.tem_euros(titulo || ' ' || notas || ' ' || checklist::text);
update public.mk_publicacoes set tem_valores = true
 where not tem_valores and public.tem_euros(concat_ws(' ', titulo, copy, notas, inspiracao, link));
update public.mk_documentos set tem_valores = true
 where not tem_valores and public.tem_euros(concat_ws(' ', titulo, conteudo));

/* ------------------------------- tarefas ------------------------------- */
create or replace function public.ver_tarefa(p_resp uuid, p_criador uuid, p_dep text, p_valores boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select (public.e_gestor()
          or p_resp = auth.uid()
          or p_criador = auth.uid()
          or public.e_supervisor_de(p_resp)
          or (public.e_membro() and p_dep = public.meu_departamento()
              and (public.meu_papel() = 'chefe' or p_resp is null) and not public.e_restrito()))
     and not (p_valores and public.e_restrito())
$$;

drop policy if exists tarefas_ler on public.tarefas;
create policy tarefas_ler on public.tarefas for select to authenticated
  using (public.ver_tarefa(responsavel_id, criado_por, departamento_id, tem_valores));
drop policy if exists tarefas_editar on public.tarefas;
create policy tarefas_editar on public.tarefas for update to authenticated
  using (public.ver_tarefa(responsavel_id, criado_por, departamento_id, tem_valores))
  with check (public.e_membro());

/* ------------------------------- marketing ------------------------------- */
drop policy if exists mk_publicacoes_acesso on public.mk_publicacoes;
create policy mk_publicacoes_acesso on public.mk_publicacoes for all to authenticated
  using (public.pode_marketing() and not (tem_valores and public.e_restrito()))
  with check (public.pode_marketing());
drop policy if exists mk_documentos_acesso on public.mk_documentos;
create policy mk_documentos_acesso on public.mk_documentos for all to authenticated
  using (public.pode_marketing() and not (tem_valores and public.e_restrito()))
  with check (public.pode_marketing());

/* ------------------------ agenda e mensagens ------------------------ */
-- Conta limitada: só os eventos em que participa; nas mensagens, só o canal do departamento e as conversas em que está
drop policy if exists agenda_ler on public.agenda_eventos;
create policy agenda_ler on public.agenda_eventos for select to authenticated using (
  public.pode_agenda() or (public.e_membro() and (auth.uid() = any(participantes) or (visivel_equipa and not public.e_restrito()))));

create or replace function public.pode_ver_canal(p_canal uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.e_membro() and exists (
    select 1 from public.chat_canais c
     where c.id = p_canal
       and ((c.tipo = 'geral' and not public.e_restrito())
            or (c.tipo = 'departamento' and (public.e_gestor() or c.departamento_id = public.meu_departamento()))
            or (c.tipo in ('direto','grupo') and exists (select 1 from public.chat_membros m where m.canal_id = c.id and m.perfil_id = auth.uid()))))
$$;

/* ------------------------ propostas do assistente ------------------------ */
create table if not exists public.ia_propostas (
  id              uuid primary key default gen_random_uuid(),
  lote            uuid not null,
  tipo            text not null default 'nova' check (tipo in ('nova','tarefa','publicacao')),
  destinatario_id uuid not null references public.perfis(id) on delete cascade,
  aprovador_id    uuid not null references public.perfis(id) on delete cascade,
  pedido_por      uuid references public.perfis(id) on delete set null,
  tarefa_id       uuid references public.tarefas(id) on delete cascade,
  publicacao_id   uuid references public.mk_publicacoes(id) on delete cascade,
  titulo          text not null default '',
  notas           text not null default '',
  marca           text not null default 'grupo',
  prioridade      text not null default 'media' check (prioridade in ('alta','media','baixa')),
  prazo           date,
  motivo          text not null default '',
  estado          text not null default 'pendente' check (estado in ('pendente','aprovada','recusada')),
  decidido_por    uuid references public.perfis(id) on delete set null,
  decidido_em     timestamptz,
  criado_em       timestamptz not null default now()
);
create index if not exists ia_propostas_aprovador on public.ia_propostas (aprovador_id, estado);
alter table public.ia_propostas enable row level security;
grant select on public.ia_propostas to authenticated;
revoke all on public.ia_propostas from anon;
drop policy if exists ia_propostas_ler on public.ia_propostas;
create policy ia_propostas_ler on public.ia_propostas for select to authenticated
  using (aprovador_id = auth.uid() or pedido_por = auth.uid() or public.e_gestor());
-- sem políticas de escrita: só pelas funções abaixo

-- O assistente regista propostas (corre com a sessão de quem pediu a análise)
create or replace function public.ia_propor(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  eu uuid := auth.uid();
  v_dest public.perfis%rowtype;
  v_aprov uuid;
  v_lote uuid := gen_random_uuid();
  it jsonb;
  v_tipo text; v_tar public.tarefas%rowtype; v_pub public.mk_publicacoes%rowtype;
  v_tit text; v_notas text; v_marca text; v_pri text; v_prazo date;
  n int := 0; ignoradas text[] := '{}';
begin
  if eu is null or not public.e_membro() then raise exception 'Sem sessão.'; end if;
  select * into v_dest from public.perfis where id = (p->>'destinatario_id')::uuid and ativo;
  if not found then raise exception 'Pessoa não encontrada.'; end if;
  if not (public.e_gestor() or public.e_supervisor_de(v_dest.id) or (v_dest.id <> eu and public.pode_atribuir(v_dest.id))) then
    raise exception 'Só o responsável direto de % (ou a direção) pode pedir propostas de tarefas para essa pessoa.', v_dest.nome;
  end if;
  v_aprov := coalesce(v_dest.supervisor_id, eu);

  for it in select * from jsonb_array_elements(coalesce(p->'itens', '[]'::jsonb)) limit 15 loop
    v_tipo := coalesce(nullif(it->>'tipo', ''), 'nova');
    v_pri := case when it->>'prioridade' in ('alta','media','baixa') then it->>'prioridade' else 'media' end;
    v_prazo := case when coalesce(it->>'prazo', '') ~ '^\d{4}-\d{2}-\d{2}$' then (it->>'prazo')::date end;
    v_marca := case when it->>'marca' in ('twentysix','barbearia','academy','tech','grooms','grupo') then it->>'marca' else 'grupo' end;
    v_tit := left(trim(coalesce(it->>'titulo', '')), 200);
    v_notas := left(coalesce(it->>'notas', ''), 2000);

    if v_tipo = 'tarefa' then
      select * into v_tar from public.tarefas where id = nullif(it->>'tarefa_id', '')::uuid;
      if not found or v_tar.estado = 'concluido' or v_tar.responsavel_id = v_dest.id
         or not public.ver_tarefa(v_tar.responsavel_id, v_tar.criado_por, v_tar.departamento_id, v_tar.tem_valores) then
        ignoradas := ignoradas || coalesce(nullif(v_tit, ''), 'tarefa'); continue;
      end if;
      v_tit := v_tar.titulo; v_marca := v_tar.marca;
      if v_dest.restrito and v_tar.tem_valores then ignoradas := ignoradas || v_tit; continue; end if;
      if exists (select 1 from public.ia_propostas where estado = 'pendente' and tarefa_id = v_tar.id and destinatario_id = v_dest.id) then continue; end if;
    elsif v_tipo = 'publicacao' then
      if not public.pode_marketing() then ignoradas := ignoradas || v_tit; continue; end if;
      select * into v_pub from public.mk_publicacoes where id = nullif(it->>'publicacao_id', '')::uuid;
      if not found or v_pub.estado in ('publicado','cancelado') or v_pub.responsavel_id = v_dest.id
         or (v_pub.tem_valores and (v_dest.restrito or public.e_restrito())) then
        ignoradas := ignoradas || coalesce(nullif(v_tit, ''), 'publicação'); continue;
      end if;
      v_tit := v_pub.titulo; v_marca := v_pub.marca; v_prazo := coalesce(v_prazo, v_pub.data);
      if exists (select 1 from public.ia_propostas where estado = 'pendente' and publicacao_id = v_pub.id and destinatario_id = v_dest.id) then continue; end if;
    else
      v_tipo := 'nova';
      if v_tit = '' then continue; end if;
      if v_dest.restrito and public.tem_euros(v_tit || ' ' || v_notas) then ignoradas := ignoradas || v_tit; continue; end if;
      if exists (select 1 from public.ia_propostas where estado = 'pendente' and tipo = 'nova' and destinatario_id = v_dest.id and lower(titulo) = lower(v_tit)) then continue; end if;
    end if;

    insert into public.ia_propostas (lote, tipo, destinatario_id, aprovador_id, pedido_por, tarefa_id, publicacao_id, titulo, notas, marca, prioridade, prazo, motivo)
    values (v_lote, v_tipo, v_dest.id, v_aprov, eu,
            case when v_tipo = 'tarefa' then v_tar.id end, case when v_tipo = 'publicacao' then v_pub.id end,
            v_tit, case when v_tipo = 'nova' then v_notas else '' end, v_marca, v_pri, v_prazo, left(coalesce(it->>'motivo', p->>'motivo', ''), 500));
    n := n + 1;
  end loop;

  if n > 0 and v_aprov <> eu then
    insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
    values (v_aprov, 'propostas', 'Tarefas para aprovar',
            'O assistente propõe ' || n || case when n = 1 then ' tarefa' else ' tarefas' end || ' para ' || split_part(v_dest.nome, ' ', 1) || '.', '#propostas');
  end if;
  return jsonb_build_object('criadas', n, 'aprovador', (select nome from public.perfis where id = v_aprov), 'ignoradas', to_jsonb(ignoradas));
end $$;
revoke all on function public.ia_propor(jsonb) from public, anon;
grant execute on function public.ia_propor(jsonb) to authenticated;

-- O responsável direto aprova ou recusa. Aprovar cria a tarefa (ou atribui a tarefa/publicação existente).
create or replace function public.ia_proposta_decidir(p_id uuid, p_aprovar boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eu uuid := auth.uid();
  r public.ia_propostas%rowtype;
  v_dest public.perfis%rowtype;
  v_id uuid;
begin
  select * into r from public.ia_propostas where id = p_id for update;
  if not found then raise exception 'Proposta não encontrada.'; end if;
  if not (r.aprovador_id = eu or public.e_gestor()) then raise exception 'Só % pode decidir esta proposta.', (select nome from public.perfis where id = r.aprovador_id); end if;
  if r.estado <> 'pendente' then raise exception 'Esta proposta já foi decidida.'; end if;
  if not p_aprovar then
    update public.ia_propostas set estado = 'recusada', decidido_por = eu, decidido_em = now() where id = p_id;
    return null;
  end if;
  select * into v_dest from public.perfis where id = r.destinatario_id;
  if not coalesce(v_dest.ativo, false) then raise exception 'A conta de % está desativada.', coalesce(v_dest.nome, 'esta pessoa'); end if;

  perform set_config('central26.sistema', '1', true);
  if r.tipo = 'nova' then
    insert into public.tarefas (titulo, notas, marca, departamento_id, prioridade, prazo, responsavel_id)
    values (r.titulo, r.notas, r.marca, v_dest.departamento_id, r.prioridade, r.prazo, v_dest.id)
    returning id into v_id;
  elsif r.tipo = 'tarefa' then
    update public.tarefas set responsavel_id = v_dest.id, prazo = coalesce(r.prazo, prazo), prioridade = r.prioridade
     where id = r.tarefa_id and estado <> 'concluido' returning id into v_id;
    if v_id is null then perform set_config('central26.sistema', '', true); raise exception 'A tarefa já foi concluída ou apagada.'; end if;
  else
    update public.mk_publicacoes set responsavel_id = v_dest.id
     where id = r.publicacao_id and estado not in ('publicado','cancelado') returning id into v_id;
    if v_id is null then perform set_config('central26.sistema', '', true); raise exception 'A publicação já foi publicada, cancelada ou apagada.'; end if;
  end if;
  perform set_config('central26.sistema', '', true);

  update public.ia_propostas set estado = 'aprovada', decidido_por = eu, decidido_em = now(),
         tarefa_id = case when r.tipo = 'nova' then v_id else tarefa_id end
   where id = p_id;
  return v_id;
end $$;
revoke all on function public.ia_proposta_decidir(uuid, boolean) from public, anon;
grant execute on function public.ia_proposta_decidir(uuid, boolean) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ia_propostas') then
      alter publication supabase_realtime add table public.ia_propostas;
    end if;
  end if;
end $$;
