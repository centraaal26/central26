-- =====================================================================
-- Central 26 · 07 · Tecnológico: registo da auditoria aos sites e plano semanal
-- Correr uma vez no Supabase: SQL Editor → New query → colar tudo → Run
-- Pode voltar a ser corrido sem apagar dados.
--
-- Quem vê e gere o registo: direção (CEO e administração) e departamento Tecnológico.
-- Quem tem um item atribuído vê esse item e pode mudar o estado até «Resolvido».
-- Só a direção e o Tecnológico validam, e só com evidência da verificação.
-- Só a direção aceita um risco (fica registado o motivo).
-- Os achados de segurança nunca ficam no GitHub: entram só por importação na app.
-- =====================================================================

create or replace function public.pode_auditoria() returns boolean
language sql stable security definer set search_path = public as $$
  select public.e_gestor() or coalesce(public.meu_departamento() = 'tecnologico', false)
$$;

create table if not exists public.tec_itens (
  id              text primary key check (id ~ '^[A-Z]{2,4}-[0-9]{2,3}$'),
  marca           text not null default 'grupo' check (marca in ('twentysix','barbearia','academy','tech','grooms','grupo')),
  categoria       text not null default '',
  problema        text not null check (length(trim(problema)) > 0),
  evidencia       text not null default '',
  correcao        text not null default '',
  dominio         text not null default '',
  origem          text not null default 'manual' check (origem in ('registo','seguranca','manual')),
  prioridade      text not null default 'P2' check (prioridade in ('P0','P1','P2','P3')),
  impacto         text not null default '',
  esforco         text not null default '',
  responsavel_id  uuid references public.perfis(id) on delete set null,
  estado          text not null default 'novo' check (estado in ('novo','confirmado','em_correcao','a_aguardar','resolvido','validado','aceite')),
  semana          int check (semana between 1 and 12),
  relacionado     text[] not null default '{}',
  notas           text not null default '',
  verificacao     text not null default '',   -- evidência da verificação (obrigatória para validar)
  data_validacao  date,
  resolvido_por   uuid references public.perfis(id) on delete set null,
  resolvido_em    timestamptz,
  validado_por    uuid references public.perfis(id) on delete set null,
  validado_em     timestamptz,
  aceite_por      uuid references public.perfis(id) on delete set null,
  aceite_em       timestamptz,
  aceite_motivo   text not null default '',
  criado_por      uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em       timestamptz not null default now(),
  atualizado_por  uuid references public.perfis(id) on delete set null,
  atualizado_em   timestamptz not null default now()
);
create index if not exists tec_itens_resp on public.tec_itens (responsavel_id);

create table if not exists public.tec_historico (
  id         bigint generated always as identity primary key,
  item_id    text not null references public.tec_itens(id) on delete cascade on update cascade,
  autor_id   uuid references public.perfis(id) on delete set null,
  campo      text not null,          -- estado | responsavel | prioridade | semana | criado
  de         text,
  para       text,
  nota       text not null default '',
  criado_em  timestamptz not null default now()
);
create index if not exists tec_historico_item on public.tec_historico (item_id, criado_em desc);

create table if not exists public.tec_plano (
  semana      int primary key check (semana between 1 and 12),
  tema        text not null default '',
  objetivo    text not null default '',
  tarefas     text not null default '',
  entregavel  text not null default '',
  estado      text not null default '' check (estado in ('','por_iniciar','em_curso','concluida')),
  atualizado_em timestamptz not null default now()
);

-- Tabelas de consulta importadas da folha (inventário técnico, redes sociais, KPIs, controlos positivos)
create table if not exists public.tec_referencia (
  tipo          text primary key,
  titulo        text not null default '',
  colunas       jsonb not null default '[]'::jsonb,
  linhas        jsonb not null default '[]'::jsonb,
  ordem         int not null default 0,
  atualizado_por uuid references public.perfis(id) on delete set null,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.tec_config (
  id      int primary key default 1 check (id = 1),
  inicio  date,                      -- segunda-feira da semana 1 do plano
  atualizado_em timestamptz not null default now()
);
insert into public.tec_config (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------
-- Regras do registo
-- ---------------------------------------------------------------------
create or replace function public.tec_itens_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  livres text[] := array['estado','notas','verificacao','atualizado_em','atualizado_por','resolvido_por','resolvido_em'];
begin
  new.atualizado_em := now();
  if auth.uid() is not null then new.atualizado_por := auth.uid(); end if;
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.criado_por := auth.uid(); end if;
  else
    new.id := old.id; new.criado_por := old.criado_por; new.criado_em := old.criado_em;
    -- quem tem o item atribuído (sem ser do Tecnológico nem da direção) só avança o trabalho
    if auth.uid() is not null and not public.pode_auditoria() then
      if (to_jsonb(new) - livres) is distinct from (to_jsonb(old) - livres) then
        raise exception 'Só o Tecnológico e a direção alteram os dados do item. Podes mudar o estado e escrever notas.';
      end if;
      if new.estado in ('validado','aceite') or old.estado in ('validado','aceite') then
        raise exception 'Só o Tecnológico e a direção validam ou reabrem itens fechados.';
      end if;
    end if;
  end if;

  if new.estado = 'validado' and (tg_op = 'INSERT' or old.estado is distinct from 'validado') then
    if auth.uid() is not null and not public.pode_auditoria() then raise exception 'Só o Tecnológico e a direção validam itens.'; end if;
    if length(trim(new.verificacao)) = 0 then raise exception 'Para validar, descreve a evidência da verificação (o que foi testado, quando e com que resultado).'; end if;
    new.validado_por := auth.uid(); new.validado_em := now(); new.data_validacao := coalesce(new.data_validacao, current_date);
  elsif new.estado <> 'validado' then
    new.validado_por := null; new.validado_em := null;
    if tg_op = 'UPDATE' and old.estado = 'validado' then new.data_validacao := null; end if;
  end if;

  if new.estado = 'aceite' and (tg_op = 'INSERT' or old.estado is distinct from 'aceite') then
    if auth.uid() is not null and not public.e_gestor() then raise exception 'Só a direção (CEO ou administração) pode aceitar um risco.'; end if;
    if length(trim(new.aceite_motivo)) = 0 then raise exception 'Indica o motivo pelo qual a direção aceita este risco.'; end if;
    new.aceite_por := auth.uid(); new.aceite_em := now();
  elsif new.estado <> 'aceite' then
    new.aceite_por := null; new.aceite_em := null;
  end if;

  if new.estado = 'resolvido' and (tg_op = 'INSERT' or old.estado is distinct from 'resolvido') then
    new.resolvido_por := auth.uid(); new.resolvido_em := now();
  elsif new.estado in ('novo','confirmado','em_correcao','a_aguardar') then
    new.resolvido_por := null; new.resolvido_em := null;
  end if;
  return new;
end $$;
drop trigger if exists tec_itens_antes on public.tec_itens;
create trigger tec_itens_antes before insert or update on public.tec_itens
  for each row execute function public.tec_itens_antes();

create or replace function public.tec_itens_depois() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a uuid := auth.uid();
  v_autor text;
  ROT constant jsonb := '{"novo":"Novo","confirmado":"Confirmado","em_correcao":"Em correção","a_aguardar":"A aguardar informação","resolvido":"Resolvido","validado":"Validado","aceite":"Aceite pela administração"}';
  p uuid;
  n int := 0;
begin
  select nome into v_autor from public.perfis where id = a;
  v_autor := coalesce(v_autor, 'Alguém');
  if tg_op = 'INSERT' then
    insert into public.tec_historico (item_id, autor_id, campo, para) values (new.id, a, 'criado', new.estado);
  else
    if new.estado is distinct from old.estado then
      insert into public.tec_historico (item_id, autor_id, campo, de, para, nota)
      values (new.id, a, 'estado', old.estado, new.estado,
              case when new.estado = 'validado' then new.verificacao when new.estado = 'aceite' then new.aceite_motivo else '' end);
    end if;
    if new.responsavel_id is distinct from old.responsavel_id then
      insert into public.tec_historico (item_id, autor_id, campo, de, para)
      values (new.id, a, 'responsavel', (select nome from public.perfis where id = old.responsavel_id), (select nome from public.perfis where id = new.responsavel_id));
    end if;
    if new.prioridade is distinct from old.prioridade then
      insert into public.tec_historico (item_id, autor_id, campo, de, para) values (new.id, a, 'prioridade', old.prioridade, new.prioridade);
    end if;
    if new.semana is distinct from old.semana then
      insert into public.tec_historico (item_id, autor_id, campo, de, para) values (new.id, a, 'semana', old.semana::text, new.semana::text);
    end if;
  end if;

  -- avisos
  if new.responsavel_id is not null and new.responsavel_id is distinct from a
     and (tg_op = 'INSERT' or new.responsavel_id is distinct from old.responsavel_id) then
    insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
    values (new.responsavel_id, 'auditoria', 'Item da auditoria atribuído a ti · ' || new.id, left(new.problema, 140), '#auditoria-' || new.id);
  end if;
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if new.estado = 'resolvido' then
      -- pronto para validar: avisa o Tecnológico (ou a direção, se não houver ninguém no Tecnológico)
      for p in select id from public.perfis where ativo and departamento_id = 'tecnologico' and id is distinct from a loop
        insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
        values (p, 'auditoria', 'Por validar · ' || new.id, v_autor || ' marcou como resolvido: ' || left(new.problema, 110), '#auditoria-' || new.id);
        n := n + 1;
      end loop;
      if n = 0 then
        for p in select id from public.perfis where ativo and papel in ('ceo','admin') and id is distinct from a loop
          insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
          values (p, 'auditoria', 'Por validar · ' || new.id, v_autor || ' marcou como resolvido: ' || left(new.problema, 110), '#auditoria-' || new.id);
        end loop;
      end if;
    elsif new.estado in ('validado','aceite') and new.responsavel_id is not null and new.responsavel_id is distinct from a then
      insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
      values (new.responsavel_id, 'auditoria', new.id || ' · ' || (ROT ->> new.estado), left(new.problema, 140), '#auditoria-' || new.id);
    elsif old.estado in ('resolvido','validado') and new.estado in ('em_correcao','confirmado','novo') and new.responsavel_id is not null and new.responsavel_id is distinct from a then
      insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
      values (new.responsavel_id, 'auditoria', new.id || ' reaberto', v_autor || ' voltou a abrir: ' || left(new.problema, 110), '#auditoria-' || new.id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists tec_itens_depois on public.tec_itens;
create trigger tec_itens_depois after insert or update on public.tec_itens
  for each row execute function public.tec_itens_depois();

-- ---------------------------------------------------------------------
-- Importação da folha de acompanhamento (a app lê o Excel e envia isto)
-- p: { itens:[{id,marca,categoria,problema,evidencia,correcao,dominio,origem,prioridade,impacto,esforco,estado,semana,relacionado,responsavel_id}],
--      plano:[{semana,tema,objetivo,tarefas,entregavel}], referencias:[{tipo,titulo,colunas,linhas,ordem}] }
-- Itens novos entram completos. Itens que já existem mantêm o que foi trabalhado na app
-- (estado, responsável, prioridade, semana, notas, verificação); só se preenchem campos vazios.
-- ---------------------------------------------------------------------
create or replace function public.tec_importar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v_novos int := 0; v_exist int := 0; v_sem int := 0; v_ref int := 0; v_estado text;
begin
  if not public.pode_auditoria() then raise exception 'Só o Tecnológico e a direção importam o registo da auditoria.'; end if;
  for r in select * from jsonb_array_elements(coalesce(p->'itens','[]')) loop
    if exists (select 1 from public.tec_itens where id = r->>'id') then
      update public.tec_itens set
        categoria = case when categoria = '' then coalesce(r->>'categoria','') else categoria end,
        evidencia = case when evidencia = '' then coalesce(r->>'evidencia','') else evidencia end,
        correcao  = case when correcao  = '' then coalesce(r->>'correcao','')  else correcao  end,
        dominio   = case when dominio   = '' then coalesce(r->>'dominio','')   else dominio   end,
        impacto   = case when impacto   = '' then coalesce(r->>'impacto','')   else impacto   end,
        esforco   = case when esforco   = '' then coalesce(r->>'esforco','')   else esforco   end,
        relacionado = (select coalesce(array_agg(distinct x order by x), '{}') from unnest(relacionado || coalesce(array(select jsonb_array_elements_text(r->'relacionado')), '{}')) x)
      where id = r->>'id';
      v_exist := v_exist + 1;
    else
      v_estado := coalesce(r->>'estado', 'novo');
      if v_estado in ('validado','aceite') then v_estado := 'resolvido'; end if; -- validar e aceitar fazem-se na app, com evidência
      insert into public.tec_itens (id, marca, categoria, problema, evidencia, correcao, dominio, origem, prioridade, impacto, esforco, estado, semana, relacionado, responsavel_id)
      values (r->>'id', coalesce(r->>'marca','grupo'), coalesce(r->>'categoria',''), r->>'problema', coalesce(r->>'evidencia',''), coalesce(r->>'correcao',''),
              coalesce(r->>'dominio',''), coalesce(r->>'origem','registo'), coalesce(r->>'prioridade','P2'), coalesce(r->>'impacto',''), coalesce(r->>'esforco',''),
              v_estado, nullif(r->>'semana','')::int, coalesce(array(select jsonb_array_elements_text(r->'relacionado')), '{}'), nullif(r->>'responsavel_id','')::uuid);
      v_novos := v_novos + 1;
    end if;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p->'plano','[]')) loop
    insert into public.tec_plano (semana, tema, objetivo, tarefas, entregavel)
    values ((r->>'semana')::int, coalesce(r->>'tema',''), coalesce(r->>'objetivo',''), coalesce(r->>'tarefas',''), coalesce(r->>'entregavel',''))
    on conflict (semana) do update set tema = excluded.tema, objetivo = excluded.objetivo, tarefas = excluded.tarefas, entregavel = excluded.entregavel, atualizado_em = now();
    v_sem := v_sem + 1;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p->'referencias','[]')) loop
    insert into public.tec_referencia (tipo, titulo, colunas, linhas, ordem, atualizado_por)
    values (r->>'tipo', coalesce(r->>'titulo',''), coalesce(r->'colunas','[]'), coalesce(r->'linhas','[]'), coalesce((r->>'ordem')::int, 0), auth.uid())
    on conflict (tipo) do update set titulo = excluded.titulo, colunas = excluded.colunas, linhas = excluded.linhas, ordem = excluded.ordem, atualizado_por = auth.uid(), atualizado_em = now();
    v_ref := v_ref + 1;
  end loop;
  return jsonb_build_object('novos', v_novos, 'existentes', v_exist, 'semanas', v_sem, 'referencias', v_ref);
end $$;
revoke all on function public.tec_importar(jsonb) from public, anon;
grant execute on function public.tec_importar(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Segurança
-- ---------------------------------------------------------------------
alter table public.tec_itens      enable row level security;
alter table public.tec_historico  enable row level security;
alter table public.tec_plano      enable row level security;
alter table public.tec_referencia enable row level security;
alter table public.tec_config     enable row level security;

create or replace function public.tem_itens_auditoria() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tec_itens where responsavel_id = auth.uid())
$$;

drop policy if exists tec_itens_ler on public.tec_itens;
create policy tec_itens_ler on public.tec_itens for select to authenticated using (public.pode_auditoria() or responsavel_id = auth.uid());
drop policy if exists tec_itens_criar on public.tec_itens;
create policy tec_itens_criar on public.tec_itens for insert to authenticated with check (public.pode_auditoria());
drop policy if exists tec_itens_editar on public.tec_itens;
create policy tec_itens_editar on public.tec_itens for update to authenticated
  using (public.pode_auditoria() or responsavel_id = auth.uid()) with check (public.pode_auditoria() or responsavel_id = auth.uid());
drop policy if exists tec_itens_apagar on public.tec_itens;
create policy tec_itens_apagar on public.tec_itens for delete to authenticated using (public.pode_auditoria());

drop policy if exists tec_hist_ler on public.tec_historico;
create policy tec_hist_ler on public.tec_historico for select to authenticated
  using (public.pode_auditoria() or exists (select 1 from public.tec_itens i where i.id = item_id and i.responsavel_id = auth.uid()));

drop policy if exists tec_plano_ler on public.tec_plano;
create policy tec_plano_ler on public.tec_plano for select to authenticated using (public.pode_auditoria() or public.tem_itens_auditoria());
drop policy if exists tec_plano_gerir on public.tec_plano;
create policy tec_plano_gerir on public.tec_plano for all to authenticated using (public.pode_auditoria()) with check (public.pode_auditoria());

drop policy if exists tec_ref_ler on public.tec_referencia;
create policy tec_ref_ler on public.tec_referencia for select to authenticated using (public.pode_auditoria());
drop policy if exists tec_ref_gerir on public.tec_referencia;
create policy tec_ref_gerir on public.tec_referencia for all to authenticated using (public.pode_auditoria()) with check (public.pode_auditoria());

drop policy if exists tec_config_ler on public.tec_config;
create policy tec_config_ler on public.tec_config for select to authenticated using (public.pode_auditoria() or public.tem_itens_auditoria());
drop policy if exists tec_config_gerir on public.tec_config;
create policy tec_config_gerir on public.tec_config for update to authenticated using (public.pode_auditoria()) with check (public.pode_auditoria());

revoke all on public.tec_itens, public.tec_historico, public.tec_plano, public.tec_referencia, public.tec_config from anon;
grant select, insert, update, delete on public.tec_itens to authenticated;
grant select on public.tec_historico to authenticated;
grant select, insert, update, delete on public.tec_plano, public.tec_referencia to authenticated;
grant select, update on public.tec_config to authenticated;

do $$
declare t text;
begin
  foreach t in array array['tec_itens','tec_plano'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null; end;
  end loop;
end $$;
