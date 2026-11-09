-- =====================================================================
-- Central 26 · 15 · Seguros e viaturas
-- Correr uma vez no Supabase: SQL Editor → New query → colar tudo → Run
-- Pode voltar a ser corrido sem apagar dados. Corre-se depois do 14.
--
-- Guarda as datas dos seguros e das viaturas (revisões, inspeções, IUC…) e avisa
-- no telemóvel antes de cada data: quando faltam os dias escolhidos, na semana,
-- na véspera, no próprio dia e, se passar, uma vez por semana até ser tratado.
--
-- Quem vê e mexe: direção, Administrativo e Logística. Quem é responsável por um
-- prazo também o vê e pode marcá-lo como feito. Eliminar: só a direção.
-- =====================================================================

create or replace function public.pode_prazos() returns boolean
language sql stable security definer set search_path = public as $$
  select public.e_gestor() or coalesce(public.meu_departamento() in ('administrativo', 'logistica'), false)
$$;

-- ---------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.prz_viaturas (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,                       -- ex.: Carrinha de entregas
  matricula      text not null default '',
  modelo         text not null default '',
  km             int check (km >= 0),                 -- último registo de quilómetros
  responsavel_id uuid references public.perfis(id) on delete set null,
  notas          text not null default '',
  ativo          boolean not null default true,
  criado_por     uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create table if not exists public.prz_prazos (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null default 'seguro' check (tipo in ('seguro', 'revisao', 'inspecao', 'iuc', 'outro')),
  titulo         text not null,
  viatura_id     uuid references public.prz_viaturas(id) on delete cascade,
  entidade       text not null default '',             -- seguradora, oficina, centro de inspeção…
  referencia     text not null default '',             -- n.º da apólice, n.º do processo…
  data           date not null,                        -- data de vencimento / marcação
  valor          numeric(12,2) check (valor >= 0),
  repetir        text not null default 'anual' check (repetir in ('nao', 'mensal', 'trimestral', 'semestral', 'anual', 'bienal')),
  avisar_dias    int not null default 30 check (avisar_dias between 0 and 365),
  km_limite      int check (km_limite >= 0),           -- revisões: fazer até aos X km
  responsavel_id uuid references public.perfis(id) on delete set null,
  notas          text not null default '',
  estado         text not null default 'ativo' check (estado in ('ativo', 'tratado')),
  tratado_em     timestamptz,
  tratado_por    uuid references public.perfis(id) on delete set null,
  tratado_nota   text not null default '',
  anterior_id    uuid references public.prz_prazos(id) on delete set null,
  criado_por     uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index if not exists prz_prazos_estado on public.prz_prazos (estado, data);
create index if not exists prz_prazos_viatura on public.prz_prazos (viatura_id);

-- Avisos já enviados (um por marco: «antes», «semana», «vespera», «dia», «atraso-N»)
create table if not exists public.prz_avisos (
  prazo_id   uuid not null references public.prz_prazos(id) on delete cascade,
  marco      text not null,
  enviado_em timestamptz not null default now(),
  primary key (prazo_id, marco)
);

create table if not exists public.prz_config (
  id            int primary key default 1 check (id = 1),
  avisar        uuid[] not null default '{}',          -- além do responsável; vazio = direção e administração
  hora          int not null default 9 check (hora between 0 and 23),
  atualizado_em timestamptz not null default now()
);
insert into public.prz_config (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Avisos
-- ---------------------------------------------------------------------
create or replace function public.prz_destinatarios(p_prazo uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  with x as (
    select pz.responsavel_id as id from public.prz_prazos pz where pz.id = p_prazo and pz.responsavel_id is not null
    union
    select v.responsavel_id from public.prz_prazos pz join public.prz_viaturas v on v.id = pz.viatura_id where pz.id = p_prazo and v.responsavel_id is not null
    union
    select unnest(c.avisar) from public.prz_config c where c.id = 1
  ), ativos as (select p.id from public.perfis p join x on x.id = p.id where p.ativo)
  select id from ativos
  union
  select p.id from public.perfis p where p.ativo and p.papel in ('ceo', 'admin') and not exists (select 1 from ativos)
$$;

create or replace function public.prz_avisar(p_prazo uuid, p_dias int) returns int
language plpgsql security definer set search_path = public as $$
declare pz record; d uuid; n int := 0; v_tit text; v_corpo text; v_acao text;
begin
  select p.*, v.nome as v_nome, v.matricula as v_mat into pz
    from public.prz_prazos p left join public.prz_viaturas v on v.id = p.viatura_id where p.id = p_prazo;
  if pz.id is null or pz.estado <> 'ativo' then return 0; end if;
  v_tit := case when p_dias < 0 then 'Em atraso: ' || pz.titulo
                when p_dias = 0 then 'Hoje: ' || pz.titulo
                when p_dias = 1 then 'Amanhã: ' || pz.titulo
                else pz.titulo || ' · daqui a ' || p_dias || ' dias' end;
  v_acao := case pz.tipo when 'seguro' then 'renovado' when 'iuc' then 'pago' else 'feito' end;
  v_corpo := concat_ws(' · ',
               case when p_dias < 0 then 'Passou a ' else 'Data: ' end || to_char(pz.data, 'DD/MM/YYYY'),
               nullif(trim(coalesce(pz.v_nome, '') || case when coalesce(pz.v_mat, '') <> '' then ' (' || pz.v_mat || ')' else '' end), ''),
               nullif(pz.entidade, ''),
               case when pz.referencia <> '' then 'Ref. ' || pz.referencia end)
             || '. Quando estiver tratado, marca-o como ' || v_acao || ' na Central.';
  for d in select public.prz_destinatarios(pz.id) loop
    delete from public.notificacoes where destinatario_id = d and link = '#prazo-' || pz.id and not lida;
    insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link) values (d, 'prazo', v_tit, v_corpo, '#prazo-' || pz.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Corre de hora a hora (pg_cron); cada marco só é avisado uma vez
create or replace function public.prz_lembretes() returns int
language plpgsql security definer set search_path = public as $$
declare c public.prz_config; hoje date := (now() at time zone 'Europe/Lisbon')::date; r record; v_dias int; v_marco text; v_ins int; n int := 0;
begin
  select * into c from public.prz_config where id = 1;
  if extract(hour from now() at time zone 'Europe/Lisbon') < coalesce(c.hora, 9) then return 0; end if;
  for r in select p.id, p.data, p.avisar_dias from public.prz_prazos p left join public.prz_viaturas v on v.id = p.viatura_id
            where p.estado = 'ativo' and (v.id is null or v.ativo) loop
    v_dias := r.data - hoje;
    v_marco := case when v_dias < 0 then 'atraso-' || ((-v_dias - 1) / 7)
                    when v_dias = 0 then 'dia'
                    when v_dias = 1 then 'vespera'
                    when v_dias > r.avisar_dias then null
                    when v_dias <= 7 then 'semana'
                    else 'antes' end;
    continue when v_marco is null;
    insert into public.prz_avisos (prazo_id, marco) values (r.id, v_marco) on conflict do nothing;
    get diagnostics v_ins = row_count;
    if v_ins > 0 then n := n + public.prz_avisar(r.id, v_dias); end if;
  end loop;
  return n;
end $$;

-- Mudar a data (ou reabrir) volta a pôr os avisos a zero
create or replace function public.prz_mudou() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if new.data is distinct from old.data or new.avisar_dias is distinct from old.avisar_dias or (new.estado = 'ativo' and old.estado <> 'ativo') then
    delete from public.prz_avisos where prazo_id = new.id;
  end if;
  if new.data is distinct from old.data or new.estado <> 'ativo' then
    delete from public.notificacoes where link = '#prazo-' || new.id and not lida;
  end if;
  return new;
end $$;
drop trigger if exists prz_mudou on public.prz_prazos;
create trigger prz_mudou before update on public.prz_prazos for each row execute function public.prz_mudou();

create or replace function public.prz_viatura_mudou() returns trigger
language plpgsql as $$ begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists prz_viatura_mudou on public.prz_viaturas;
create trigger prz_viatura_mudou before update on public.prz_viaturas for each row execute function public.prz_viatura_mudou();

-- ---------------------------------------------------------------------
-- 3. Marcar como feito / renovado (cria logo o próximo, se se repetir)
-- ---------------------------------------------------------------------
create or replace function public.prz_tratar(p_prazo uuid, p_proxima date default null, p_nota text default '') returns public.prz_prazos
language plpgsql security definer set search_path = public as $$
declare pz public.prz_prazos; novo public.prz_prazos; v_data date;
begin
  select * into pz from public.prz_prazos where id = p_prazo for update;
  if pz.id is null then raise exception 'Este prazo já não existe.'; end if;
  if not (public.pode_prazos() or pz.responsavel_id = auth.uid()) then raise exception 'Sem acesso a este prazo.'; end if;
  if pz.estado <> 'ativo' then raise exception 'Este prazo já foi tratado.'; end if;
  update public.prz_prazos set estado = 'tratado', tratado_em = now(), tratado_por = auth.uid(), tratado_nota = left(coalesce(p_nota, ''), 500)
   where id = pz.id returning * into pz;
  v_data := coalesce(p_proxima, case pz.repetir
              when 'mensal' then pz.data + interval '1 month' when 'trimestral' then pz.data + interval '3 months'
              when 'semestral' then pz.data + interval '6 months' when 'anual' then pz.data + interval '1 year'
              when 'bienal' then pz.data + interval '2 years' end);
  if v_data is null then return pz; end if;
  insert into public.prz_prazos (tipo, titulo, viatura_id, entidade, referencia, data, valor, repetir, avisar_dias, km_limite, responsavel_id, notas, anterior_id, criado_por)
  values (pz.tipo, pz.titulo, pz.viatura_id, pz.entidade, pz.referencia, v_data, pz.valor, pz.repetir, pz.avisar_dias, null, pz.responsavel_id, pz.notas, pz.id, auth.uid())
  returning * into novo;
  return novo;
end $$;

-- Desfazer um «feito» por engano: volta a ficar ativo e apaga o próximo criado automaticamente
create or replace function public.prz_reabrir(p_prazo uuid) returns public.prz_prazos
language plpgsql security definer set search_path = public as $$
declare pz public.prz_prazos;
begin
  if not public.pode_prazos() then raise exception 'Sem acesso aos prazos.'; end if;
  delete from public.prz_prazos where anterior_id = p_prazo and estado = 'ativo';
  update public.prz_prazos set estado = 'ativo', tratado_em = null, tratado_por = null, tratado_nota = ''
   where id = p_prazo returning * into pz;
  if pz.id is null then raise exception 'Este prazo já não existe.'; end if;
  return pz;
end $$;

-- ---------------------------------------------------------------------
-- 4. Acessos
-- ---------------------------------------------------------------------
alter table public.prz_viaturas enable row level security;
alter table public.prz_prazos   enable row level security;
alter table public.prz_avisos   enable row level security;
alter table public.prz_config   enable row level security;

drop policy if exists prz_viaturas_ler on public.prz_viaturas;
create policy prz_viaturas_ler on public.prz_viaturas for select to authenticated using (public.pode_prazos() or responsavel_id = auth.uid());
drop policy if exists prz_viaturas_criar on public.prz_viaturas;
create policy prz_viaturas_criar on public.prz_viaturas for insert to authenticated with check (public.pode_prazos());
drop policy if exists prz_viaturas_mudar on public.prz_viaturas;
create policy prz_viaturas_mudar on public.prz_viaturas for update to authenticated using (public.pode_prazos()) with check (public.pode_prazos());
drop policy if exists prz_viaturas_apagar on public.prz_viaturas;
create policy prz_viaturas_apagar on public.prz_viaturas for delete to authenticated using (public.e_gestor());

drop policy if exists prz_prazos_ler on public.prz_prazos;
create policy prz_prazos_ler on public.prz_prazos for select to authenticated
  using (public.pode_prazos() or responsavel_id = auth.uid()
         or exists (select 1 from public.prz_viaturas v where v.id = viatura_id and v.responsavel_id = auth.uid()));
drop policy if exists prz_prazos_criar on public.prz_prazos;
create policy prz_prazos_criar on public.prz_prazos for insert to authenticated with check (public.pode_prazos());
drop policy if exists prz_prazos_mudar on public.prz_prazos;
create policy prz_prazos_mudar on public.prz_prazos for update to authenticated using (public.pode_prazos()) with check (public.pode_prazos());
drop policy if exists prz_prazos_apagar on public.prz_prazos;
create policy prz_prazos_apagar on public.prz_prazos for delete to authenticated using (public.e_gestor());

drop policy if exists prz_config_ler on public.prz_config;
create policy prz_config_ler on public.prz_config for select to authenticated using (public.pode_prazos());
drop policy if exists prz_config_mudar on public.prz_config;
create policy prz_config_mudar on public.prz_config for update to authenticated using (public.e_gestor()) with check (public.e_gestor());

revoke all on public.prz_viaturas, public.prz_prazos, public.prz_avisos, public.prz_config from anon;
revoke all on public.prz_avisos from authenticated;            -- só usado no servidor
grant select, insert, update, delete on public.prz_viaturas, public.prz_prazos to authenticated;
grant select, update on public.prz_config to authenticated;

do $$
declare t text;
begin
  foreach t in array array['prz_viaturas', 'prz_prazos'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null; end;
  end loop;
end $$;

do $$ begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'central26-prazos';
  perform cron.schedule('central26-prazos', '7 * * * *', 'select public.prz_lembretes()');
exception when others then
  raise notice 'pg_cron indisponível: os avisos dos seguros e viaturas ficam desligados (%).', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 5. Permissões das funções (só com sessão iniciada; as internas ficam fechadas)
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
