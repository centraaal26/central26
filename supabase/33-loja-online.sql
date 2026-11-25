-- =====================================================================
-- Central 26 · 33 · Loja online da TwentySix (WooCommerce)
-- Corre depois do 32. Pode ser corrido mais do que uma vez.
--
-- • A função «woo» lê as encomendas do site de 10 em 10 minutos (relógio da base de dados).
-- • Cada encomenda paga («Em processamento» no WooCommerce) entra na Logística, com a Nacex como transporte,
--   e quem fatura recebe a tarefa de criar a fatura no Multixop. Quando o número da fatura é escrito na
--   encomenda, a tarefa fica concluída.
-- • Quando a encomenda tem envio na Nacex, o site passa a encomenda a «Concluída» e manda ao cliente
--   a nota com o seguimento. Se o site cancelar ou reembolsar uma encomenda ainda não enviada, a Central cancela-a.
-- • As vendas do site ficam em woo_encomendas para o CRM (Comercial → Loja online), sem nomes nem contactos.
-- As chaves do WooCommerce ficam só nos Secrets da função «woo» (WOO_URL, WOO_CHAVE, WOO_SEGREDO).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Definições da ligação
-- ---------------------------------------------------------------------
create table if not exists public.woo_config (
  id              int primary key default 1 check (id = 1),
  ativo           boolean not null default false,          -- encomendas novas passam para a Logística
  concluir_no_site boolean not null default true,          -- com envio na Nacex, conclui no site e manda o seguimento
  desde           timestamptz,                             -- só as encomendas pagas a partir daqui entram na Logística
  ultima_sinc     timestamptz,
  ultimo_erro     text not null default '',
  ultimo_ok       timestamptz,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid references public.perfis(id) on delete set null
);
insert into public.woo_config (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Produtos do site ↔ produtos da Central (para o stock e para o CRM)
-- ---------------------------------------------------------------------
create table if not exists public.woo_produtos (
  woo_id          bigint primary key,
  nome            text not null default '',
  preco           numeric(10,2),
  produto_codigo  text references public.crm_produtos(codigo) on delete set null,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid references public.perfis(id) on delete set null
);

-- ---------------------------------------------------------------------
-- 3. Encomendas do site (sem dados pessoais: só código postal e localidade)
-- itens: [{ woo_id, nome, qtd, total }]
-- ---------------------------------------------------------------------
create table if not exists public.woo_encomendas (
  woo_id          bigint primary key,
  numero          text not null default '',
  estado          text not null default '',
  criada_em       timestamptz,
  paga_em         timestamptz,
  total           numeric(12,2) not null default 0,       -- com IVA, como no site
  portes          numeric(12,2) not null default 0,
  desconto        numeric(12,2) not null default 0,
  pagamento       text not null default '',
  cp              text not null default '',
  localidade      text not null default '',
  itens           jsonb not null default '[]'::jsonb,
  encomenda_id    uuid references public.log_encomendas(id) on delete set null,
  tarefa_id       uuid references public.tarefas(id) on delete set null,
  concluida_site  boolean not null default false,
  atualizado_em   timestamptz not null default now()
);
create index if not exists woo_enc_data on public.woo_encomendas (criada_em);
create index if not exists woo_enc_encomenda on public.woo_encomendas (encomenda_id);

alter table public.log_encomendas add column if not exists woo_id bigint;
create unique index if not exists log_enc_woo on public.log_encomendas (woo_id) where woo_id is not null;

-- ---------------------------------------------------------------------
-- 4. Acessos
-- ---------------------------------------------------------------------
alter table public.woo_config enable row level security;
alter table public.woo_produtos enable row level security;
alter table public.woo_encomendas enable row level security;

drop policy if exists woo_config_ler on public.woo_config;
create policy woo_config_ler on public.woo_config for select to authenticated using (public.e_gestor() or public.pode_encomendas() or public.pode_crm());
drop policy if exists woo_config_mudar on public.woo_config;
create policy woo_config_mudar on public.woo_config for update to authenticated using (public.e_gestor()) with check (public.e_gestor());

drop policy if exists woo_produtos_ler on public.woo_produtos;
create policy woo_produtos_ler on public.woo_produtos for select to authenticated using (public.e_gestor() or public.pode_encomendas() or public.pode_crm());
drop policy if exists woo_produtos_mudar on public.woo_produtos;
create policy woo_produtos_mudar on public.woo_produtos for update to authenticated using (public.e_gestor() or public.e_logistica()) with check (public.e_gestor() or public.e_logistica());

drop policy if exists woo_encomendas_ler on public.woo_encomendas;
create policy woo_encomendas_ler on public.woo_encomendas for select to authenticated using (public.e_gestor() or public.pode_encomendas() or public.pode_crm());

revoke all on public.woo_config, public.woo_produtos, public.woo_encomendas from anon;
grant select, update on public.woo_config to authenticated;
grant select, update (produto_codigo, atualizado_em, atualizado_por) on public.woo_produtos to authenticated;
grant select on public.woo_produtos to authenticated;
grant select on public.woo_encomendas to authenticated;

-- quem muda: carimbo e só as colunas que se podem mudar no ecrã
create or replace function public.woo_carimbo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if auth.uid() is not null then
    new.atualizado_por := auth.uid();
    if tg_table_name = 'woo_config' then
      new.ultima_sinc := old.ultima_sinc; new.ultimo_erro := old.ultimo_erro; new.ultimo_ok := old.ultimo_ok;
      -- ao ligar, só as encomendas pagas a partir de agora passam para a Logística
      if new.ativo and not old.ativo then new.desde := now(); else new.desde := old.desde; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists woo_config_carimbo on public.woo_config;
create trigger woo_config_carimbo before update on public.woo_config for each row execute function public.woo_carimbo();
drop trigger if exists woo_produtos_carimbo on public.woo_produtos;
create trigger woo_produtos_carimbo before update on public.woo_produtos for each row execute function public.woo_carimbo();
revoke all on function public.woo_carimbo() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Encomenda paga no site → Logística + tarefa de faturar (chamada pela função «woo»)
-- p: { woo_id, numero, nome, contacto, morada, email, telemovel, nota, pagamento, total, portes,
--      itens: [{ nome, qtd, total, produto_codigo }] }
-- ---------------------------------------------------------------------
create or replace function public.woo_criar_encomenda(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cfg public.com_config; v_enc uuid; v_tarefa uuid; v_itens jsonb; v_linhas text; v_num text := p->>'numero';
  v_woo bigint := (p->>'woo_id')::bigint; v_ref text;
begin
  select id into v_enc from public.log_encomendas where woo_id = v_woo;
  if v_enc is not null then return v_enc; end if;
  select * into cfg from public.com_config where id = 1;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id', 'w' || n, 'descricao', left(coalesce(nullif(i->>'nome', ''), 'Artigo'), 120), 'qtd', greatest(coalesce(nullif(i->>'qtd','')::numeric, 1), 1), 'preparado', false,
           'produto_id', (select s.id from public.stk_produtos s where s.ativo and s.codigo_multixop is not null
                           and s.codigo_multixop = nullif(i->>'produto_codigo', '') limit 1)))
         order by n), '[]'::jsonb),
         string_agg(coalesce(i->>'qtd', '1') || '× ' || coalesce(i->>'nome', '') || ' · ' || public.com_eur(coalesce(nullif(i->>'total','')::numeric, 0)) || ' €', E'\n' order by n)
    into v_itens, v_linhas
    from jsonb_array_elements(coalesce(p->'itens', '[]'::jsonb)) with ordinality t(i, n);

  insert into public.log_encomendas (tipo, estado, prioridade, cliente_nome, contacto, morada, itens, notas, transportadora, envio, woo_id, criado_por)
  values ('encomenda', 'nova', 'media', left(coalesce(nullif(p->>'nome', ''), 'Cliente da loja online'), 120), left(coalesce(p->>'contacto', ''), 40),
          left(coalesce(p->>'morada', ''), 300), v_itens,
          'Loja online · encomenda #' || v_num || coalesce(E'\nNota do cliente: ' || nullif(left(p->>'nota', 500), ''), ''),
          'nacex',
          jsonb_strip_nulls(jsonb_build_object('nome', left(p->>'nome', 120), 'telefone', left(p->>'contacto', 40), 'telemovel', nullif(left(p->>'telemovel', 40), ''),
                             'email', nullif(left(p->>'email', 120), ''), 'servico', cfg.nacex_servico)),
          v_woo, null)
  returning id into v_enc;
  select 'E-' || lpad(numero::text, 4, '0') into v_ref from public.log_encomendas where id = v_enc;

  if cfg.faturador is not null then
    perform set_config('central26.sistema', '1', true);
    insert into public.tarefas (titulo, marca, freq, prioridade, responsavel_id, prazo, notas)
    values ('Faturar encomenda online #' || v_num || ' · ' || coalesce(nullif(p->>'nome', ''), 'cliente'), 'twentysix', 'unica', 'alta', cfg.faturador, current_date,
            'Encomenda paga na loja online (' || coalesce(nullif(p->>'pagamento', ''), 'pagamento no site') || '). Criar a fatura no Multixop e escrever o número na encomenda ' || v_ref ||
            ' (Logística). Quando o número for guardado, esta tarefa fica concluída.' || E'\n\n' ||
            coalesce(v_linhas, '') || E'\n' ||
            case when coalesce(nullif(p->>'portes','')::numeric, 0) > 0 then 'Portes: ' || public.com_eur((p->>'portes')::numeric) || ' €' || E'\n' else '' end ||
            'Total pago (com IVA): ' || public.com_eur(coalesce(nullif(p->>'total','')::numeric, 0)) || ' €')
    returning id into v_tarefa;
    perform set_config('central26.sistema', '', true);
  end if;

  update public.woo_encomendas set encomenda_id = v_enc, tarefa_id = v_tarefa where woo_id = v_woo;
  return v_enc;
end $$;
revoke all on function public.woo_criar_encomenda(jsonb) from public, anon, authenticated;
grant execute on function public.woo_criar_encomenda(jsonb) to service_role;

-- Número da fatura escrito numa encomenda do site → a tarefa de faturar fica concluída
create or replace function public.woo_faturada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.woo_id is not null and coalesce(new.fatura_numero, '') <> '' and coalesce(old.fatura_numero, '') = '' then
    update public.tarefas set estado = 'concluido'
     where estado <> 'concluido' and id = (select tarefa_id from public.woo_encomendas where encomenda_id = new.id);
  end if;
  return new;
end $$;
drop trigger if exists log_encomendas_woo_faturada on public.log_encomendas;
create trigger log_encomendas_woo_faturada after update of fatura_numero on public.log_encomendas
  for each row execute function public.woo_faturada();
revoke all on function public.woo_faturada() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Relógio: de 10 em 10 minutos, se a ligação estiver ativa
-- ---------------------------------------------------------------------
create or replace function public.woo_tique() returns boolean
language plpgsql security definer set search_path = public as $$
declare v_url text; v_seg text;
begin
  if not coalesce((select ativo from public.woo_config where id = 1), false) then return false; end if;
  select valor into v_url from public.configuracao where chave = 'url_funcoes';
  select valor into v_seg from public.configuracao_privada where chave = 'segredo_webhook';
  if v_url is null or v_seg is null then return false; end if;
  perform net.http_post(url := v_url || '/woo', headers := jsonb_build_object('Content-Type', 'application/json', 'x-segredo', v_seg),
                        body := jsonb_build_object('acao', 'tique'), timeout_milliseconds := 60000);
  return true;
exception when others then
  raise warning 'Falha ao chamar a loja online: %', sqlerrm;
  return false;
end $$;
revoke all on function public.woo_tique() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('central26-woo');
exception when others then null; end $$;
do $$ begin
  perform cron.schedule('central26-woo', '*/10 * * * *', 'select public.woo_tique()');
exception when others then raise warning 'Sem pg_cron: a loja online só sincroniza quando alguém carrega em «Sincronizar agora».'; end $$;

-- tempo real
do $$ begin
  begin execute 'alter publication supabase_realtime add table public.woo_config'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.woo_encomendas'; exception when others then null; end;
end $$;
