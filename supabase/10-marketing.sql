-- =====================================================================
-- Central 26 · 10 · Marketing: calendário de publicações, ideias e documentos
-- Correr uma vez no Supabase: SQL Editor → New query → colar tudo → Run
-- Pode voltar a ser corrido sem apagar dados.
--
-- Quem vê e gere: direção (CEO e administração) e departamento de Marketing.
-- =====================================================================

create or replace function public.pode_marketing() returns boolean
language sql stable security definer set search_path = public as $$
  select public.e_gestor() or coalesce(public.meu_departamento() = 'marketing', false)
$$;

create table if not exists public.mk_publicacoes (
  id              uuid primary key default gen_random_uuid(),
  origem_id       text unique,                     -- identificador no Notion (para não duplicar ao importar)
  marca           text not null default 'grupo' check (marca in ('twentysix','barbearia','academy','tech','grooms','grupo')),
  titulo          text not null check (length(trim(titulo)) > 0),
  data            date,
  hora            text not null default '',
  tipo            text not null default '',          -- Foto, Vídeo, Storie, Carrossel, Reel, GIF, Design, Frase…
  plataformas     text[] not null default '{}',
  estado          text not null default 'ideia' check (estado in ('ideia','planeado','em_producao','pronto','publicado','cancelado')),
  link            text not null default '',          -- pasta ou ficheiro no Drive
  copy            text not null default '',          -- texto da publicação
  notas           text not null default '',
  inspiracao      text not null default '',
  responsavel_id  uuid references public.perfis(id) on delete set null,
  criado_por      uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em       timestamptz not null default now(),
  atualizado_por  uuid references public.perfis(id) on delete set null,
  atualizado_em   timestamptz not null default now()
);
create index if not exists mk_pub_data on public.mk_publicacoes (data);

create table if not exists public.mk_documentos (
  id              uuid primary key default gen_random_uuid(),
  origem_id       text unique,
  marca           text not null default 'grupo' check (marca in ('twentysix','barbearia','academy','tech','grooms','grupo')),
  titulo          text not null check (length(trim(titulo)) > 0),
  conteudo        text not null default '',
  criado_por      uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em       timestamptz not null default now(),
  atualizado_por  uuid references public.perfis(id) on delete set null,
  atualizado_em   timestamptz not null default now()
);

create or replace function public.mk_carimbo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if auth.uid() is not null then new.atualizado_por := auth.uid(); end if;
  if tg_op = 'UPDATE' then new.criado_por := old.criado_por; new.criado_em := old.criado_em; new.origem_id := old.origem_id; end if;
  return new;
end $$;
drop trigger if exists mk_pub_carimbo on public.mk_publicacoes;
create trigger mk_pub_carimbo before insert or update on public.mk_publicacoes for each row execute function public.mk_carimbo();
drop trigger if exists mk_doc_carimbo on public.mk_documentos;
create trigger mk_doc_carimbo before insert or update on public.mk_documentos for each row execute function public.mk_carimbo();

-- Aviso a quem fica responsável por uma publicação
create or replace function public.mk_avisar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.responsavel_id is not null and new.responsavel_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.responsavel_id is distinct from old.responsavel_id) then
    insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
    values (new.responsavel_id, 'marketing', 'Publicação atribuída a ti', left(new.titulo, 140) || coalesce(' · ' || to_char(new.data, 'DD/MM'), ''), '#publicacao-' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists mk_avisar on public.mk_publicacoes;
create trigger mk_avisar after insert or update on public.mk_publicacoes for each row execute function public.mk_avisar();

-- Importação (Notion): o que já existe não é alterado
create or replace function public.mk_importar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_pub int := 0; v_doc int := 0;
begin
  if not public.pode_marketing() then raise exception 'Só o Marketing e a direção importam o calendário.'; end if;
  insert into public.mk_publicacoes (origem_id, marca, titulo, data, hora, tipo, plataformas, estado, link, copy, notas, inspiracao)
  select x->>'origem_id', coalesce(x->>'marca','grupo'), x->>'titulo', nullif(x->>'data','')::date, coalesce(x->>'hora',''), coalesce(x->>'tipo',''),
         coalesce(array(select jsonb_array_elements_text(x->'plataformas')), '{}'), coalesce(x->>'estado','ideia'), coalesce(x->>'link',''),
         coalesce(x->>'copy',''), coalesce(x->>'notas',''), coalesce(x->>'inspiracao','')
    from jsonb_array_elements(coalesce(p->'publicacoes','[]')) x
   where coalesce(trim(x->>'titulo'),'') <> ''
  on conflict (origem_id) do nothing;
  get diagnostics v_pub = row_count;
  insert into public.mk_documentos (origem_id, marca, titulo, conteudo)
  select x->>'origem_id', coalesce(x->>'marca','grupo'), x->>'titulo', coalesce(x->>'conteudo','')
    from jsonb_array_elements(coalesce(p->'documentos','[]')) x
   where coalesce(trim(x->>'titulo'),'') <> ''
  on conflict (origem_id) do nothing;
  get diagnostics v_doc = row_count;
  return jsonb_build_object('publicacoes', v_pub, 'documentos', v_doc);
end $$;
revoke all on function public.mk_importar(jsonb) from public, anon;
grant execute on function public.mk_importar(jsonb) to authenticated;

alter table public.mk_publicacoes enable row level security;
alter table public.mk_documentos  enable row level security;
do $$
declare t text;
begin
  foreach t in array array['mk_publicacoes','mk_documentos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_acesso', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.pode_marketing()) with check (public.pode_marketing())', t || '_acesso', t);
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null; end;
  end loop;
end $$;
revoke all on public.mk_publicacoes, public.mk_documentos from anon;
grant select, insert, update, delete on public.mk_publicacoes, public.mk_documentos to authenticated;
