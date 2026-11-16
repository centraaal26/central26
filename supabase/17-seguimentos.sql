-- =====================================================================
-- Central 26 — Prospeção: seguimentos e respostas
-- Corre depois do 16-prospecao.sql. Pode ser corrido mais do que uma vez.
--
-- • Se a barbearia não responder, a Central prepara o «Follow-up 1» (e depois o «Follow-up 2»)
--   a partir dos guiões da empresa. Cada seguimento fica por aprovar, como as propostas.
-- • «A barbearia respondeu» marca a resposta, cancela os seguimentos e avisa o comercial.
-- • Os dias de espera e se há seguimentos definem-se nas Definições da Prospeção.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colunas novas
-- ---------------------------------------------------------------------
alter table public.prs_propostas add column if not exists tipo text not null default 'inicial';
alter table public.prs_propostas add column if not exists anterior_id uuid references public.prs_propostas(id) on delete set null;
alter table public.prs_propostas add column if not exists respondeu_em timestamptz;
alter table public.prs_propostas add column if not exists respondeu_por uuid references public.perfis(id) on delete set null;
alter table public.prs_propostas add column if not exists resposta text not null default '';
do $$ begin
  alter table public.prs_propostas add constraint prs_propostas_tipo check (tipo in ('inicial', 'seguimento1', 'seguimento2'));
exception when duplicate_object then null; end $$;
create unique index if not exists prs_propostas_anterior on public.prs_propostas (anterior_id) where anterior_id is not null;

alter table public.prs_config add column if not exists seguimentos boolean not null default true;
alter table public.prs_config add column if not exists seguimento1_dias int not null default 4;
alter table public.prs_config add column if not exists seguimento2_dias int not null default 5;
do $$ begin
  alter table public.prs_config add constraint prs_config_seg_dias check (seguimento1_dias between 1 and 60 and seguimento2_dias between 1 and 60);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. Preparar os seguimentos (chamado pelo relógio, uma vez por hora)
-- Só para abordagens enviadas, sem resposta, sem nenhum contacto novo no CRM desde o envio
-- e com a barbearia ainda em «contactado».
-- ---------------------------------------------------------------------
create or replace function public.prs_seguimentos() returns int
language plpgsql security definer set search_path = public as $$
declare cfg public.prs_config; r record; v_tipo text; v_guiao text; v_msg text; v_ms jsonb; n int := 0;
begin
  select * into cfg from public.prs_config where id = 1;
  if cfg.id is null or not cfg.ativo or not cfg.seguimentos then return 0; end if;
  for r in
    select pr.*, c.nome as c_nome
      from public.prs_propostas pr
      join public.crm_clientes c on c.id = pr.cliente_id
     where pr.estado = 'enviada' and pr.respondeu_em is null and pr.tipo in ('inicial', 'seguimento1')
       and c.etapa = 'contactado'
       and pr.enviada_em < now() - make_interval(days => case pr.tipo when 'inicial' then cfg.seguimento1_dias else cfg.seguimento2_dias end)
       and not exists (select 1 from public.prs_propostas s where s.anterior_id = pr.id)
       and not exists (select 1 from public.prs_propostas x where x.cliente_id = pr.cliente_id and x.respondeu_em is not null)
       and not exists (select 1 from public.crm_contactos k where k.cliente_id = pr.cliente_id and k.criado_em > pr.enviada_em + interval '1 minute')
     order by pr.enviada_em
     limit 50
  loop
    v_tipo := case r.tipo when 'inicial' then 'seguimento1' else 'seguimento2' end;
    select g->>'texto' into v_guiao from jsonb_array_elements(cfg.guioes) g
     where lower(g->>'tipo') ~ ('^(follow.?up|seguimento)\s*' || case v_tipo when 'seguimento1' then '1' else '2' end || '\y')
     limit 1;
    if coalesce(trim(v_guiao), '') = '' then continue; end if;  -- sem guião, não se inventa texto
    v_msg := replace(replace(v_guiao, '{Nome}', r.c_nome), '{nome}', r.c_nome);
    if coalesce(trim(cfg.assinatura), '') <> '' and position(trim(cfg.assinatura) in v_msg) = 0 then
      v_msg := v_msg || E'\n\n' || trim(cfg.assinatura);
    end if;
    v_ms := case when r.canal = 'email'
                 then jsonb_build_object('email', jsonb_build_object('assunto', left('Re: ' || coalesce(nullif(r.assunto, ''), 'TwentySix'), 120), 'corpo', v_msg))
                 else jsonb_build_object(r.canal, v_msg) end;
    insert into public.prs_propostas (cliente_id, semana, canal, destino, assunto, mensagem, mensagens, resumo, estado, tipo, anterior_id, modelo, gerada_em)
    values (r.cliente_id, public.prs_semana(), r.canal, r.destino,
            case when r.canal = 'email' then left('Re: ' || coalesce(nullif(r.assunto, ''), 'TwentySix'), 120) else '' end,
            v_msg, v_ms,
            'Sem resposta desde ' || to_char(r.enviada_em at time zone 'Europe/Lisbon', 'DD/MM') || ' (' ||
              case r.tipo when 'inicial' then 'primeira abordagem' else 'primeiro seguimento' end || ' por ' || r.canal || ').',
            'pendente', v_tipo, r.id, 'guião', now())
    on conflict do nothing;
    if found then n := n + 1; end if;
  end loop;
  if n > 0 then
    perform public.prs_avisar('Prospeção: ' || n || case when n = 1 then ' seguimento por aprovar' else ' seguimentos por aprovar' end,
                              'Barbearias que ainda não responderam. Revê a mensagem, aprova e envia.', '#prospecao');
  end if;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 3. A barbearia respondeu
-- ---------------------------------------------------------------------
create or replace function public.prs_respondeu(p_id uuid, p_nota text default '') returns public.prs_propostas
language plpgsql security definer set search_path = public as $$
declare pr public.prs_propostas; c public.crm_clientes; cfg public.prs_config; v_resp uuid; v_raiz uuid;
begin
  if not public.pode_crm() then raise exception 'Sem acesso à prospeção.'; end if;
  select * into pr from public.prs_propostas where id = p_id for update;
  if pr.id is null then raise exception 'Esta proposta já não existe.'; end if;
  if pr.estado <> 'enviada' then raise exception 'Só se marca a resposta depois de a mensagem ser enviada.'; end if;
  if pr.respondeu_em is not null then return pr; end if;
  select * into cfg from public.prs_config where id = 1;
  select * into c from public.crm_clientes where id = pr.cliente_id;
  update public.prs_propostas set respondeu_em = now(), respondeu_por = auth.uid(), resposta = left(coalesce(p_nota, ''), 1000)
   where id = p_id returning * into pr;
  -- os seguimentos ainda por enviar deixam de fazer sentido
  update public.prs_propostas set estado = 'rejeitada', motivo = 'A barbearia respondeu', aprovada_por = auth.uid(), aprovada_em = now()
   where cliente_id = pr.cliente_id and estado in ('pendente', 'aprovada', 'a_gerar', 'erro') and tipo <> 'inicial';
  insert into public.crm_contactos (cliente_id, autor_id, tipo, texto, proximo_passo, data_proximo)
  values (c.id, auth.uid(), 'nota', 'A barbearia respondeu à prospeção (' || pr.canal || ')' || case when coalesce(trim(p_nota), '') <> '' then E'\n\n' || trim(p_nota) else '' end,
          'Marcar a visita com amostras', (now() at time zone 'Europe/Lisbon')::date + 2);
  v_resp := coalesce(c.responsavel_id, cfg.comercial_id);
  if v_resp is not null and v_resp <> auth.uid() then
    insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
    values (v_resp, 'prospecao', 'Respondeu: ' || c.nome,
            coalesce(nullif(left(trim(p_nota), 140), ''), 'A barbearia respondeu à mensagem da prospeção.') || ' Próximo passo: marcar a visita.', '#cliente-' || c.id);
  end if;
  return pr;
end $$;

-- ---------------------------------------------------------------------
-- 4. Registar o envio: o texto no CRM diz se foi a primeira abordagem ou um seguimento
-- ---------------------------------------------------------------------
create or replace function public.prs_registar_envio(p_id uuid, p_detalhe text default '') returns public.prs_propostas
language plpgsql security definer set search_path = public as $$
declare pr public.prs_propostas; c public.crm_clientes; cfg public.prs_config; v_tipo text; v_resp uuid; v_rot text;
begin
  if auth.uid() is not null and not public.pode_aprovar_prs() then raise exception 'Só quem aprova a prospeção pode registar envios.'; end if;
  select * into pr from public.prs_propostas where id = p_id for update;
  if pr.id is null then raise exception 'Esta proposta já não existe.'; end if;
  if pr.estado = 'enviada' then return pr; end if;
  if pr.estado <> 'aprovada' then raise exception 'A proposta tem de estar aprovada antes de ser enviada.'; end if;
  select * into cfg from public.prs_config where id = 1;
  select * into c from public.crm_clientes where id = pr.cliente_id;
  update public.prs_propostas set estado = 'enviada', enviada_em = now(), enviada_por = coalesce(auth.uid(), pr.aprovada_por),
         envio_detalhe = left(coalesce(p_detalhe, ''), 300) where id = p_id returning * into pr;
  v_tipo := case pr.canal when 'email' then 'email' when 'whatsapp' then 'whatsapp' when 'telefone' then 'chamada' else 'nota' end;
  v_rot := case pr.tipo when 'seguimento1' then 'Primeiro seguimento' when 'seguimento2' then 'Segundo seguimento' else 'Primeira abordagem' end;
  v_resp := coalesce(c.responsavel_id, cfg.comercial_id);
  insert into public.crm_contactos (cliente_id, autor_id, tipo, texto, proximo_passo, data_proximo)
  values (c.id, coalesce(auth.uid(), pr.aprovada_por), v_tipo,
          v_rot || ' (prospeção, ' || pr.canal || ')' || case when pr.assunto <> '' then ' · ' || pr.assunto else '' end || E'\n\n' || pr.mensagem,
          'Visita com amostras' || case when cfg.comercial_id is not null then ' (' || coalesce((select split_part(nome, ' ', 1) from public.perfis where id = cfg.comercial_id), '') || ')' else '' end,
          (now() at time zone 'Europe/Lisbon')::date + 4);
  update public.crm_clientes set etapa = case when etapa = 'lead' then 'contactado' else etapa end, responsavel_id = coalesce(responsavel_id, v_resp)
   where id = c.id;
  if v_resp is not null and pr.tipo = 'inicial' then
    insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
    values (v_resp, 'prospecao', 'Barbearia contactada: ' || c.nome,
            'A primeira abordagem foi enviada por ' || pr.canal || '. Próximo passo: marcar a visita com amostras.', '#cliente-' || c.id);
  end if;
  return pr;
end $$;

-- ---------------------------------------------------------------------
-- 5. Relógio: os seguimentos entram no tique (uma vez por hora)
-- ---------------------------------------------------------------------
create or replace function public.prs_tique() returns boolean
language plpgsql security definer set search_path = public as $$
declare cfg public.prs_config; v_url text; v_seg text; agora timestamp := now() at time zone 'Europe/Lisbon'; devido boolean;
begin
  select * into cfg from public.prs_config where id = 1;
  if cfg.id is null or not cfg.ativo then return false; end if;
  if extract(minute from agora) < 5 and extract(hour from agora) between 8 and 20 then
    begin perform public.prs_seguimentos();
    exception when others then raise warning 'Falha ao preparar os seguimentos: %', sqlerrm; end;
  end if;
  devido := cfg.ultima_semana <> public.prs_semana() and extract(isodow from agora) >= cfg.dia_semana
            and (extract(isodow from agora) > cfg.dia_semana or extract(hour from agora) >= cfg.hora);
  if not devido and not exists (select 1 from public.prs_propostas where estado = 'a_gerar' and tentativas < 3) then return false; end if;
  select valor into v_url from public.configuracao where chave = 'url_funcoes';
  select valor into v_seg from public.configuracao_privada where chave = 'segredo_webhook';
  if v_url is null then return false; end if;
  perform net.http_post(url := v_url || '/prospecao', headers := jsonb_build_object('Content-Type', 'application/json', 'x-segredo', v_seg),
                        body := jsonb_build_object('acao', 'tique'), timeout_milliseconds := 5000);
  return true;
exception when others then
  raise warning 'Falha ao chamar a prospeção: %', sqlerrm;
  return false;
end $$;

-- ---------------------------------------------------------------------
-- 6. Acessos às funções
-- ---------------------------------------------------------------------
revoke all on function public.prs_seguimentos() from public, anon, authenticated;
grant execute on function public.prs_seguimentos() to service_role;
revoke all on function public.prs_respondeu(uuid, text) from public, anon;
grant execute on function public.prs_respondeu(uuid, text) to authenticated, service_role;
revoke all on function public.prs_registar_envio(uuid, text) from public, anon;
grant execute on function public.prs_registar_envio(uuid, text) to authenticated, service_role;
revoke all on function public.prs_tique() from public, anon, authenticated;
grant execute on function public.prs_tique() to service_role;
