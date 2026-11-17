-- =====================================================================
-- Central 26 — Fiabilidade
-- Corre depois do 17-seguimentos.sql. Pode ser corrido mais do que uma vez.
--
-- 1. Histórico de cada ficha: quem mudou o quê e quando.
-- 2. Reciclagem: o que é apagado fica 30 dias e pode ser recuperado.
-- 3. Comentários dentro das fichas (clientes, encomendas, fornecedores, prazos…), com menções.
-- 4. Pesquisa no servidor em tudo o que cada pessoa pode ver (também mensagens e notas).
-- 5. Avisos: horas de sossego, resumo diário e email quando um aviso importante fica por ler.
-- 6. Cópia de segurança automática semanal (com a função «copia-seguranca»).
-- 7. Tarefas criadas a partir de uma mensagem guardam a ligação à conversa.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Ajudas
-- ---------------------------------------------------------------------
-- Tabelas com histórico, reciclagem e comentários
create or replace function public.tabelas_registo() returns text[]
language sql immutable as $$
  select array['tarefas','crm_clientes','crm_contactos','agenda_eventos','log_encomendas','log_rotas','op_fornecedores','op_pedidos',
               'mk_publicacoes','stk_produtos','prz_prazos','prz_viaturas']
$$;

-- Ligação dentro da app para cada tipo de registo
create or replace function public.link_registo(p_tabela text, p_id text) returns text
language sql immutable as $$
  select case p_tabela
    when 'tarefas' then '#tarefa-' when 'crm_clientes' then '#cliente-' when 'agenda_eventos' then '#agenda-'
    when 'log_encomendas' then '#encomenda-' when 'op_fornecedores' then '#fornecedor-' when 'op_pedidos' then '#pedido-'
    when 'mk_publicacoes' then '#publicacao-' when 'stk_produtos' then '#stock-' when 'prz_prazos' then '#prazo-'
    when 'prz_viaturas' then '#viatura-' else '#' end || coalesce(p_id, '')
$$;

-- Texto sem acentos e em minúsculas (para a pesquisa)
create or replace function public.sem_acentos(t text) returns text
language sql immutable parallel safe as $$
  select translate(lower(coalesce(t, '')), 'áàâãäåéèêëíìîïóòôõöúùûüçñ', 'aaaaaaeeeeiiiiooooouuuucn')
$$;

-- A pessoa com sessão iniciada consegue ver este registo? Corre com as permissões dela (as regras de cada tabela aplicam-se).
create or replace function public.pode_ver_registo(p_tabela text, p_id text) returns boolean
language plpgsql stable security invoker set search_path = public as $$
declare r boolean;
begin
  if p_tabela is null or p_id is null or not (p_tabela = any(public.tabelas_registo())) then return false; end if;
  execute format('select exists(select 1 from public.%I where id::text = $1)', p_tabela) into r using p_id;
  return coalesce(r, false);
end $$;

-- ---------------------------------------------------------------------
-- 1 e 2. Histórico e reciclagem
-- ---------------------------------------------------------------------
create table if not exists public.historico (
  id             bigint generated always as identity primary key,
  tabela         text not null,
  registo_id     text not null,
  acao           text not null check (acao in ('alterado', 'apagado')),
  antes          jsonb,
  depois         jsonb,
  autor_id       uuid references public.perfis(id) on delete set null,
  lote           bigint,
  criado_em      timestamptz not null default now(),
  recuperado_em  timestamptz,
  recuperado_por uuid references public.perfis(id) on delete set null
);
create index if not exists historico_registo on public.historico (tabela, registo_id, criado_em desc);
create index if not exists historico_apagados on public.historico (criado_em desc) where acao = 'apagado';
create index if not exists historico_lote on public.historico (lote);

create or replace function public.historico_registar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb; v_new jsonb; k text; a jsonb := '{}'; d jsonb := '{}'; h public.historico;
  -- campos que mudam sozinhos ou não interessam a quem lê
  ignorar text[] := array['atualizado_em','atualizado_por','lat','lng','geo_em','geo_aprox','geo_falhou','morada_geo','estado_periodo',
                          'checklist_periodo','lembrete_enviado','ultimo_aviso','alerta_desde','alerta','ignorado_por','quantidade',
                          'geometria','stock_movido','distancia_m','duracao_s'];
begin
  if tg_op = 'DELETE' then
    insert into public.historico (tabela, registo_id, acao, antes, autor_id, lote)
    values (tg_table_name, to_jsonb(old)->>'id', 'apagado', to_jsonb(old), auth.uid(), txid_current());
    return old;
  end if;
  if auth.uid() is null then return new; end if;  -- mudanças automáticas da Central (repetições, avisos) não entram
  v_old := to_jsonb(old); v_new := to_jsonb(new);
  for k in select jsonb_object_keys(v_new) loop
    if k = any(ignorar) then continue; end if;
    if v_old->k is distinct from v_new->k then
      a := a || jsonb_build_object(k, v_old->k);
      d := d || jsonb_build_object(k, v_new->k);
    end if;
  end loop;
  if d = '{}'::jsonb then return new; end if;
  -- várias gravações seguidas da mesma pessoa (ex.: a escrever notas) ficam numa só entrada
  select * into h from public.historico
   where tabela = tg_table_name and registo_id = v_new->>'id' and acao = 'alterado'
   order by criado_em desc limit 1;
  if h.id is not null and h.autor_id = auth.uid() and h.criado_em > now() - interval '10 minutes' then
    a := a || h.antes; d := h.depois || d;
    for k in select jsonb_object_keys(d) loop
      if a->k is not distinct from d->k then a := a - k; d := d - k; end if;
    end loop;
    if d = '{}'::jsonb then delete from public.historico where id = h.id;
    else update public.historico set antes = a, depois = d, criado_em = now() where id = h.id; end if;
    return new;
  end if;
  insert into public.historico (tabela, registo_id, acao, antes, depois, autor_id, lote)
  values (tg_table_name, v_new->>'id', 'alterado', a, d, auth.uid(), txid_current());
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array public.tabelas_registo() loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists historico_registar on public.%I', t);
    execute format('create trigger historico_registar after update or delete on public.%I for each row execute function public.historico_registar()', t);
  end loop;
end $$;

-- Recuperar o que foi apagado (e o que foi apagado com ele, ex.: os contactos de um cliente).
-- Corre com as permissões de quem recupera: só volta o que essa pessoa podia criar.
create or replace function public.historico_marcar_recuperado(p_ids bigint[]) returns void
language plpgsql security definer set search_path = public as $$
declare h public.historico; existe boolean;
begin
  for h in select * from public.historico where id = any(p_ids) and acao = 'apagado' and recuperado_em is null loop
    -- só marca o que voltou mesmo a existir
    execute format('select exists(select 1 from public.%I where id::text = $1)', h.tabela) into existe using h.registo_id;
    if existe then update public.historico set recuperado_em = now(), recuperado_por = auth.uid() where id = h.id; end if;
  end loop;
end $$;

create or replace function public.recuperar(p_id bigint) returns int
language plpgsql security invoker set search_path = public as $$
declare h public.historico; r record; v_cols text; feitos bigint[] := '{}'; n int := 0;
begin
  if not public.e_membro() then raise exception 'Sem acesso.'; end if;
  select * into h from public.historico where id = p_id;
  if h.id is null or h.acao <> 'apagado' then raise exception 'Este registo já não está na reciclagem.'; end if;
  if h.recuperado_em is not null then raise exception 'Este registo já foi recuperado.'; end if;
  for r in
    select x.* from public.historico x
     where x.id = h.id or (x.lote = h.lote and x.acao = 'apagado' and x.recuperado_em is null and x.id <> h.id and x.lote is not null)
     order by (x.id <> h.id), x.id
  loop
    select string_agg(quote_ident(c.column_name), ',' order by c.ordinal_position) into v_cols
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = r.tabela and r.antes ? c.column_name and c.is_generated = 'NEVER';
    begin
      execute format('insert into public.%I (%s) overriding system value select %s from jsonb_populate_record(null::public.%I, $1)',
                     r.tabela, v_cols, v_cols, r.tabela) using r.antes;
      feitos := feitos || r.id; n := n + 1;
    exception when unique_violation then
      feitos := feitos || r.id;  -- já existe outra vez: não há nada a recuperar
    when others then
      if r.id = h.id then raise exception 'Não foi possível recuperar: %', sqlerrm; end if;
    end;
  end loop;
  perform public.historico_marcar_recuperado(feitos);
  return n;
end $$;

alter table public.historico enable row level security;
drop policy if exists historico_ler on public.historico;
create policy historico_ler on public.historico for select to authenticated
  using (public.e_membro() and (
    public.e_gestor() or autor_id = auth.uid()
    or (acao = 'alterado' and public.pode_ver_registo(tabela, registo_id))
  ));
revoke all on public.historico from anon;
grant select on public.historico to authenticated;

-- ---------------------------------------------------------------------
-- 3. Comentários nas fichas
-- ---------------------------------------------------------------------
create table if not exists public.comentarios (
  id          bigint generated always as identity primary key,
  tabela      text not null,
  registo_id  text not null,
  autor_id    uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  texto       text not null check (char_length(trim(texto)) between 1 and 4000),
  mencoes     uuid[] not null default '{}',
  criado_em   timestamptz not null default now()
);
create index if not exists comentarios_registo on public.comentarios (tabela, registo_id, criado_em);

create or replace function public.comentarios_avisar() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_autor text; v_link text; v_resp uuid; v_titulo text; p uuid;
begin
  select split_part(nome, ' ', 1) into v_autor from public.perfis where id = new.autor_id;
  v_link := public.link_registo(new.tabela, new.registo_id);
  begin
    execute format('select (to_jsonb(t)->>''responsavel_id'')::uuid, coalesce(to_jsonb(t)->>''titulo'', to_jsonb(t)->>''nome'', to_jsonb(t)->>''cliente_nome'', '''') from public.%I t where id::text = $1', new.tabela)
      into v_resp, v_titulo using new.registo_id;
  exception when others then v_resp := null; v_titulo := '';
  end;
  foreach p in array coalesce(new.mencoes, '{}') loop
    if p <> new.autor_id then
      insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
      values (p, 'comentario', coalesce(v_autor, 'Alguém') || ' mencionou-te' || case when v_titulo <> '' then ' em ' || left(v_titulo, 60) else '' end,
              left(new.texto, 160), v_link);
    end if;
  end loop;
  if v_resp is not null and v_resp <> new.autor_id and not (v_resp = any(coalesce(new.mencoes, '{}'))) then
    insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
    values (v_resp, 'comentario', coalesce(v_autor, 'Alguém') || ' comentou' || case when v_titulo <> '' then ' em ' || left(v_titulo, 60) else '' end,
            left(new.texto, 160), v_link);
  end if;
  return new;
end $$;
drop trigger if exists comentarios_avisar on public.comentarios;
create trigger comentarios_avisar after insert on public.comentarios for each row execute function public.comentarios_avisar();

alter table public.comentarios enable row level security;
drop policy if exists comentarios_ler on public.comentarios;
create policy comentarios_ler on public.comentarios for select to authenticated
  using (public.e_membro() and public.pode_ver_registo(tabela, registo_id));
drop policy if exists comentarios_criar on public.comentarios;
create policy comentarios_criar on public.comentarios for insert to authenticated
  with check (autor_id = auth.uid() and public.e_membro() and public.pode_ver_registo(tabela, registo_id));
drop policy if exists comentarios_apagar on public.comentarios;
create policy comentarios_apagar on public.comentarios for delete to authenticated
  using (autor_id = auth.uid() or public.e_gestor());
revoke all on public.comentarios from anon;
grant select, insert, delete on public.comentarios to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.comentarios;
exception when others then null; end $$;

-- ---------------------------------------------------------------------
-- 4. Pesquisa em tudo o que a pessoa pode ver (corre com as permissões dela)
-- ---------------------------------------------------------------------
create or replace function public.pesquisar(p_q text) returns table (tipo text, id text, titulo text, sub text, quando timestamptz, link text)
language plpgsql stable security invoker set search_path = public as $$
declare termos text[];
begin
  if not public.e_membro() then return; end if;
  termos := array(select '%' || replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') || '%'
                    from unnest(regexp_split_to_array(public.sem_acentos(trim(coalesce(p_q, ''))), '\s+')) t where length(t) > 0);
  if coalesce(array_length(termos, 1), 0) = 0 or length(trim(p_q)) < 2 then return; end if;

  return query select 'tarefa', t.id::text, t.titulo, left(t.notas, 120), t.atualizado_em, '#tarefa-' || t.id
    from public.tarefas t where public.sem_acentos(t.titulo || ' ' || t.notas) like all (termos)
    order by (t.estado = 'concluido'), t.atualizado_em desc limit 6;

  if to_regclass('public.crm_clientes') is not null then
    return query select 'cliente', c.id::text, c.nome, concat_ws(' · ', case c.etapa when 'lead' then 'Lead' else 'Cliente' end, nullif(c.concelho, ''), nullif(c.telefone, '')), c.atualizado_em, '#cliente-' || c.id
      from public.crm_clientes c
     where public.sem_acentos(concat_ws(' ', c.nome, c.nif, c.concelho, c.distrito, c.telefone, c.email, c.instagram, c.notas, c.morada)) like all (termos)
     order by c.atualizado_em desc limit 6;
    return query select 'contacto', k.id::text, c.nome, left(k.texto, 140), k.criado_em, '#cliente-' || c.id
      from public.crm_contactos k join public.crm_clientes c on c.id = k.cliente_id
     where public.sem_acentos(k.texto || ' ' || k.proximo_passo) like all (termos)
     order by k.criado_em desc limit 6;
  end if;

  if to_regclass('public.chat_mensagens') is not null then
    return query select 'mensagem', m.id::text,
           coalesce(case when ca.tipo = 'direto' then (select p.nome from public.perfis p where p.id = m.autor_id) else '#' || ca.nome end, 'Mensagem'),
           left(m.texto, 140), m.criado_em, '#chat-' || m.canal_id
      from public.chat_mensagens m join public.chat_canais ca on ca.id = m.canal_id
     where not m.apagado and public.sem_acentos(m.texto) like all (termos)
     order by m.criado_em desc limit 6;
  end if;

  if to_regclass('public.log_encomendas') is not null then
    return query select 'encomenda', e.id::text, 'E-' || lpad(e.numero::text, 4, '0') || ' · ' || e.cliente_nome, left(concat_ws(' · ', nullif(e.morada, ''), nullif(e.notas, '')), 120), e.atualizado_em, '#encomenda-' || e.id
      from public.log_encomendas e
     where public.sem_acentos(concat_ws(' ', 'e-' || lpad(e.numero::text, 4, '0'), e.numero::text, e.cliente_nome, e.morada, e.notas, e.fatura_numero, e.contacto)) like all (termos)
     order by e.atualizado_em desc limit 6;
  end if;

  if to_regclass('public.agenda_eventos') is not null then
    return query select 'evento', a.id::text, a.titulo, concat_ws(' · ', to_char(a.inicio at time zone 'Europe/Lisbon', 'DD/MM/YYYY'), nullif(a.local, '')), a.inicio, '#agenda-' || a.id
      from public.agenda_eventos a where public.sem_acentos(concat_ws(' ', a.titulo, a.local, a.notas)) like all (termos)
     order by a.inicio desc limit 6;
  end if;

  if to_regclass('public.op_fornecedores') is not null then
    return query select 'fornecedor', f.id::text, f.nome, concat_ws(' · ', nullif(f.categoria, ''), nullif(f.localidade, '')), f.atualizado_em, '#fornecedor-' || f.id
      from public.op_fornecedores f
     where public.sem_acentos(concat_ws(' ', f.nome, f.nif, f.categoria, f.produtos, f.contacto_nome, f.telefone, f.email, f.localidade, f.notas)) like all (termos)
     order by f.atualizado_em desc limit 6;
  end if;

  if to_regclass('public.prz_prazos') is not null then
    return query select 'prazo', z.id::text, z.titulo, concat_ws(' · ', to_char(z.data, 'DD/MM/YYYY'), nullif(z.entidade, ''), nullif(z.referencia, '')), z.atualizado_em, '#prazo-' || z.id
      from public.prz_prazos z where public.sem_acentos(concat_ws(' ', z.titulo, z.entidade, z.referencia, z.notas)) like all (termos)
     order by z.data desc limit 6;
    return query select 'viatura', v.id::text, v.nome, concat_ws(' · ', nullif(v.matricula, ''), nullif(v.modelo, '')), v.atualizado_em, '#viatura-' || v.id
      from public.prz_viaturas v where public.sem_acentos(concat_ws(' ', v.nome, v.matricula, v.modelo, v.notas)) like all (termos)
     limit 4;
  end if;

  if to_regclass('public.mk_publicacoes') is not null then
    return query select 'publicacao', p.id::text, p.titulo, concat_ws(' · ', to_char(p.data, 'DD/MM/YYYY'), p.estado), p.atualizado_em, '#publicacao-' || p.id
      from public.mk_publicacoes p where public.sem_acentos(concat_ws(' ', p.titulo, p.copy, p.notas)) like all (termos)
     order by p.data desc nulls last limit 6;
  end if;

  return query select 'comentario', k.id::text, coalesce((select pp.nome from public.perfis pp where pp.id = k.autor_id), 'Comentário'),
         left(k.texto, 140), k.criado_em, public.link_registo(k.tabela, k.registo_id)
    from public.comentarios k where public.sem_acentos(k.texto) like all (termos)
   order by k.criado_em desc limit 6;
end $$;

-- ---------------------------------------------------------------------
-- 5. Avisos: horas de sossego, resumo diário e email quando fica por ler
-- ---------------------------------------------------------------------
alter table public.preferencias add column if not exists sossego         boolean  not null default false;
alter table public.preferencias add column if not exists sossego_inicio  smallint not null default 21;
alter table public.preferencias add column if not exists sossego_fim     smallint not null default 8;
alter table public.preferencias add column if not exists sossego_fds     boolean  not null default true;
alter table public.preferencias add column if not exists resumo_diario   boolean  not null default false;
alter table public.preferencias add column if not exists resumo_hora     smallint not null default 8;
alter table public.preferencias add column if not exists email_por_ler   boolean  not null default true;
alter table public.preferencias add column if not exists ultimo_resumo   timestamptz;
do $$ begin
  alter table public.preferencias add constraint preferencias_horas check (sossego_inicio between 0 and 23 and sossego_fim between 0 and 23 and resumo_hora between 0 and 23);
exception when duplicate_object then null; end $$;

alter table public.notificacoes add column if not exists urgente     boolean not null default false;
alter table public.notificacoes add column if not exists adiada      boolean not null default false;
alter table public.notificacoes add column if not exists escalada_em timestamptz;

-- Lembretes dos eventos e datas de hoje ou em atraso chegam sempre, mesmo nas horas de sossego
create or replace function public.notificacoes_urgente() returns trigger
language plpgsql as $$
begin
  new.urgente := new.urgente or new.tipo in ('lembrete', 'resumo') or (new.tipo = 'prazo' and new.titulo ~ '^(Hoje|Em atraso):');
  return new;
end $$;
drop trigger if exists notificacoes_urgente on public.notificacoes;
create trigger notificacoes_urgente before insert on public.notificacoes for each row execute function public.notificacoes_urgente();

create or replace function public.aviso_em_silencio(p_perfil uuid, p_urgente boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare pr public.preferencias; agora timestamp := now() at time zone 'Europe/Lisbon'; h int; fds boolean;
begin
  if p_urgente then return false; end if;
  select * into pr from public.preferencias where perfil_id = p_perfil;
  if pr.perfil_id is null then return false; end if;
  if pr.resumo_diario then return true; end if;  -- quem escolheu o resumo recebe tudo de uma vez
  if not pr.sossego then return false; end if;
  h := extract(hour from agora); fds := extract(isodow from agora) in (6, 7);
  if pr.sossego_fds and fds then return true; end if;
  if pr.sossego_inicio = pr.sossego_fim then return false; end if;
  if pr.sossego_inicio > pr.sossego_fim then return h >= pr.sossego_inicio or h < pr.sossego_fim; end if;
  return h >= pr.sossego_inicio and h < pr.sossego_fim;
end $$;

create or replace function public.notificacoes_enviar_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_url text; v_seg text;
begin
  if public.aviso_em_silencio(new.destinatario_id, new.urgente) then
    update public.notificacoes set adiada = true where id = new.id;
    return new;
  end if;
  select valor into v_url from public.configuracao where chave = 'url_funcoes';
  select valor into v_seg from public.configuracao_privada where chave = 'segredo_webhook';
  if v_url is null then return new; end if;
  begin
    perform net.http_post(url := v_url || '/enviar-push',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-segredo', v_seg),
      body := jsonb_build_object('acao', 'enviar', 'notificacao', to_jsonb(new)));
  exception when others then
    raise warning 'Falha ao pedir o envio da notificação: %', sqlerrm;
  end;
  return new;
end $$;

-- De hora a hora: resumo para quem o escolheu (à hora escolhida) e, para quem tem horas de sossego,
-- um só aviso no fim do sossego com o que ficou guardado.
create or replace function public.avisos_resumo() returns int
language plpgsql security definer set search_path = public as $$
declare pr record; agora timestamp := now() at time zone 'Europe/Lisbon'; h int := extract(hour from now() at time zone 'Europe/Lisbon');
  hoje date := (now() at time zone 'Europe/Lisbon')::date; n int; tits text; tarefas_hoje int; total int := 0; corpo text;
begin
  for pr in
    select p.* from public.preferencias p join public.perfis pe on pe.id = p.perfil_id and pe.ativo
     where (p.resumo_diario and p.resumo_hora = h and extract(isodow from agora) <= 5)
        or (not p.resumo_diario and p.sossego and p.sossego_fim = h and not (p.sossego_fds and extract(isodow from agora) in (6, 7)))
  loop
    if pr.ultimo_resumo is not null and (pr.ultimo_resumo at time zone 'Europe/Lisbon')::date = hoje
       and extract(hour from pr.ultimo_resumo at time zone 'Europe/Lisbon') = h then continue; end if;
    select count(*), string_agg(titulo, ' · ' order by criado_em desc) filter (where rn <= 3)
      into n, tits
      from (select titulo, criado_em, row_number() over (order by criado_em desc) rn from public.notificacoes
             where destinatario_id = pr.perfil_id and adiada and not lida) x;
    select count(*) into tarefas_hoje from public.tarefas
     where responsavel_id = pr.perfil_id and prazo = hoje and estado <> 'concluido';
    if n = 0 and not (pr.resumo_diario and tarefas_hoje > 0) then continue; end if;
    corpo := concat_ws(' · ',
      case when tarefas_hoje > 0 then tarefas_hoje || case when tarefas_hoje = 1 then ' tarefa' else ' tarefas' end || ' com prazo hoje' end,
      nullif(left(tits, 160), ''));
    insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link, urgente)
    values (pr.perfil_id, 'resumo',
            case when n = 0 then 'Bom dia' when n = 1 then '1 aviso por ler' else n || ' avisos por ler' end,
            corpo, case when n > 0 then '#notificacoes' else '#minhas' end, true);
    update public.notificacoes set adiada = false where destinatario_id = pr.perfil_id and adiada;
    update public.preferencias set ultimo_resumo = now() where perfil_id = pr.perfil_id;
    total := total + 1;
  end loop;
  return total;
end $$;

-- Avisos importantes por ler há mais de 4 horas seguem por email (só os que não foram logo por email)
create or replace function public.avisos_escalar() returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_url text; v_seg text; n int := 0;
begin
  select valor into v_url from public.configuracao where chave = 'url_funcoes';
  select valor into v_seg from public.configuracao_privada where chave = 'segredo_webhook';
  if v_url is null then return 0; end if;
  for r in
    select nt.* from public.notificacoes nt
      join public.perfis pe on pe.id = nt.destinatario_id and pe.ativo and coalesce(pe.email, '') <> ''
      left join public.preferencias pr on pr.perfil_id = nt.destinatario_id
     where not nt.lida and nt.escalada_em is null
       and nt.criado_em < now() - interval '4 hours' and nt.criado_em > now() - interval '48 hours'
       and nt.tipo in ('tarefa_atribuida', 'prazo', 'agenda', 'lembrete', 'mensagem', 'encomenda', 'comentario', 'prospecao', 'stock')
       and coalesce(pr.email_por_ler, true)
       and not public.aviso_em_silencio(nt.destinatario_id, false)
       -- os que já seguiram logo por email não se repetem
       and not coalesce(case nt.tipo when 'tarefa_atribuida' then pr.email_tarefas when 'mensagem' then pr.email_mensagens
                                     when 'agenda' then pr.email_agenda when 'lembrete' then pr.email_agenda when 'prazo' then pr.email_agenda end, false)
     order by nt.criado_em limit 50
  loop
    update public.notificacoes set escalada_em = now() where id = r.id;
    begin
      perform net.http_post(url := v_url || '/enviar-push',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-segredo', v_seg),
        body := jsonb_build_object('acao', 'email', 'notificacao', to_jsonb(r)));
      n := n + 1;
    exception when others then raise warning 'Falha ao pedir o email: %', sqlerrm;
    end;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 6. Cópia de segurança automática (a função «copia-seguranca» guarda o ficheiro no armazenamento privado «copias»)
-- ---------------------------------------------------------------------
create table if not exists public.copias (
  id        bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  caminho   text not null default '',
  tamanho   bigint not null default 0,
  registos  int not null default 0,
  ok        boolean not null default true,
  erro      text not null default ''
);
alter table public.copias enable row level security;
drop policy if exists copias_ler on public.copias;
create policy copias_ler on public.copias for select to authenticated using (public.e_gestor());
revoke all on public.copias from anon;
grant select on public.copias to authenticated;

do $$ begin
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('copias', 'copias', false, 104857600)
  on conflict (id) do update set public = false;
exception when others then raise notice 'Armazenamento indisponível: %', sqlerrm;
end $$;
-- sem regras no armazenamento «copias»: só o servidor (função copia-seguranca) lê e escreve

create or replace function public.copia_tique() returns boolean
language plpgsql security definer set search_path = public as $$
declare v_url text; v_seg text;
begin
  select valor into v_url from public.configuracao where chave = 'url_funcoes';
  select valor into v_seg from public.configuracao_privada where chave = 'segredo_webhook';
  if v_url is null then return false; end if;
  perform net.http_post(url := v_url || '/copia-seguranca',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-segredo', v_seg),
    body := jsonb_build_object('acao', 'tique'), timeout_milliseconds := 120000);
  return true;
exception when others then
  raise warning 'Falha ao pedir a cópia de segurança: %', sqlerrm;
  return false;
end $$;

-- ---------------------------------------------------------------------
-- 7. Tarefas criadas a partir de uma mensagem
-- ---------------------------------------------------------------------
alter table public.tarefas add column if not exists origem text not null default '';

-- ---------------------------------------------------------------------
-- 8. Relógio
-- ---------------------------------------------------------------------
create or replace function public.historico_limpar() returns void
language sql security definer set search_path = public as $$
  delete from public.historico where (acao = 'alterado' and criado_em < now() - interval '400 days')
                                  or (acao = 'apagado' and criado_em < now() - interval '90 days');
$$;

do $$ begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname in ('central26-resumo', 'central26-escalar', 'central26-historico', 'central26-copia');
  perform cron.schedule('central26-resumo', '2 * * * *', 'select public.avisos_resumo()');
  perform cron.schedule('central26-escalar', '32 * * * *', 'select public.avisos_escalar()');
  perform cron.schedule('central26-historico', '41 3 * * *', 'select public.historico_limpar()');
  perform cron.schedule('central26-copia', '17 3 * * 0', 'select public.copia_tique()');
exception when others then
  raise notice 'pg_cron indisponível: resumo, emails por ler e cópias automáticas ficam desligados (%).', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 9. Acessos às funções
-- ---------------------------------------------------------------------
revoke all on function public.pode_ver_registo(text, text) from public, anon;
grant execute on function public.pode_ver_registo(text, text) to authenticated, service_role;
revoke all on function public.recuperar(bigint) from public, anon;
grant execute on function public.recuperar(bigint) to authenticated, service_role;
revoke all on function public.pesquisar(text) from public, anon;
grant execute on function public.pesquisar(text) to authenticated, service_role;
revoke all on function public.sem_acentos(text) from anon;
revoke all on function public.link_registo(text, text) from anon;
revoke all on function public.tabelas_registo() from anon;
do $$
declare f text;
begin
  foreach f in array array['public.historico_registar()', 'public.historico_marcar_recuperado(bigint[])', 'public.comentarios_avisar()',
                           'public.aviso_em_silencio(uuid, boolean)', 'public.avisos_resumo()', 'public.avisos_escalar()',
                           'public.copia_tique()', 'public.historico_limpar()', 'public.notificacoes_enviar_push()'] loop
    execute 'revoke all on function ' || f || ' from public, anon, authenticated';
    execute 'grant execute on function ' || f || ' to service_role';
  end loop;
end $$;
-- quem recupera precisa de marcar o registo como recuperado (a função confirma que foi mesmo apagado)
grant execute on function public.historico_marcar_recuperado(bigint[]) to authenticated;
