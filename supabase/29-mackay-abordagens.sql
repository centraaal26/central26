-- =====================================================================
-- Central 26 · 29 · Método Mackay 66 e clientes a abordar
-- Correr no Supabase: SQL Editor → New query → colar tudo → Run. Pode ser corrido mais do que uma vez.
--
-- crm_mackay: o perfil Mackay 66 de cada cliente (adaptado a barbearias). As respostas são confirmadas por
--   quem trabalha o cliente; o que o assistente encontra em fontes públicas fica como sugestão até ser aceite.
--   Não se guardam dados sensíveis (saúde, religião, política, vida familiar privada).
-- crm_abordagens: todos os dias, o assistente escolhe no CRM os clientes a abordar e prepara a abordagem
--   com o método Mackay (porquê agora, o que sabemos, como abordar, mensagem sugerida, o que descobrir).
-- =====================================================================

create table if not exists public.crm_mackay (
  cliente_id     uuid primary key references public.crm_clientes(id) on delete cascade,
  respostas      jsonb not null default '{}'::jsonb,   -- { "c01": "texto", ... } confirmadas
  sugestoes      jsonb not null default '{}'::jsonb,   -- { "n05": { "v": "texto", "fonte": "url" } } por confirmar
  fontes         jsonb not null default '[]'::jsonb,   -- [{ "titulo", "url" }] usadas na última pesquisa
  pesquisado_em  timestamptz,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references public.perfis(id) on delete set null
);
alter table public.crm_mackay enable row level security;
grant select, insert, update, delete on public.crm_mackay to authenticated;
revoke all on public.crm_mackay from anon;
drop policy if exists crm_mackay_acesso on public.crm_mackay;
create policy crm_mackay_acesso on public.crm_mackay for all to authenticated using (public.pode_crm()) with check (public.pode_crm());

create or replace function public.crm_mackay_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if auth.uid() is not null then new.atualizado_por := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists crm_mackay_antes on public.crm_mackay;
create trigger crm_mackay_antes before insert or update on public.crm_mackay for each row execute function public.crm_mackay_antes();

create table if not exists public.crm_abordagens (
  id           uuid primary key default gen_random_uuid(),
  dia          date not null,
  cliente_id   uuid not null references public.crm_clientes(id) on delete cascade,
  ordem        int not null default 0,
  motivo       text not null default '',          -- porquê hoje (calculado a partir do CRM)
  tipo         text not null default '',          -- recompra, seguimento, risco, lead
  resumo       text not null default '',          -- o que sabemos (Mackay)
  abordagem    text not null default '',          -- como abordar
  mensagem     text not null default '',          -- primeira mensagem sugerida
  descobrir    jsonb not null default '[]'::jsonb, -- perguntas Mackay a descobrir na conversa
  fontes       jsonb not null default '[]'::jsonb,
  preparada_em timestamptz,
  estado       text not null default 'sugerida' check (estado in ('sugerida','feita','ignorada')),
  tratado_por  uuid references public.perfis(id) on delete set null,
  tratado_em   timestamptz,
  criado_em    timestamptz not null default now(),
  unique (dia, cliente_id)
);
create index if not exists crm_abordagens_dia on public.crm_abordagens (dia desc, ordem);
alter table public.crm_abordagens enable row level security;
grant select, update on public.crm_abordagens to authenticated;
revoke all on public.crm_abordagens from anon;
drop policy if exists crm_abordagens_ler on public.crm_abordagens;
create policy crm_abordagens_ler on public.crm_abordagens for select to authenticated using (public.pode_crm());
drop policy if exists crm_abordagens_tratar on public.crm_abordagens;
create policy crm_abordagens_tratar on public.crm_abordagens for update to authenticated using (public.pode_crm()) with check (public.pode_crm());

-- Quem marca como feita ou ignorada só muda o estado; o resto é escrito pela função «crm-abordar»
create or replace function public.crm_abordagens_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new := (jsonb_populate_record(old, jsonb_build_object('estado', new.estado)));
    new.tratado_por := case when new.estado = 'sugerida' then null else auth.uid() end;
    new.tratado_em := case when new.estado = 'sugerida' then null else now() end;
  end if;
  return new;
end $$;
drop trigger if exists crm_abordagens_antes on public.crm_abordagens;
create trigger crm_abordagens_antes before update on public.crm_abordagens for each row execute function public.crm_abordagens_antes();

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'crm_abordagens') then
      alter publication supabase_realtime add table public.crm_abordagens;
    end if;
  end if;
end $$;
