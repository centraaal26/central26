-- =====================================================================
-- Central 26 · 12 · Foto e cor de perfil, avisos por email e Stocks da TwentySix
-- Correr uma vez no Supabase: SQL Editor → New query → colar tudo → Run
-- Pode voltar a ser corrido sem apagar dados. Corre-se depois do 11.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Foto e cor de perfil
-- ---------------------------------------------------------------------
alter table public.perfis add column if not exists foto_path text;
alter table public.perfis add column if not exists cor text not null default '';

-- Só o próprio muda a sua foto e cor (o caminho tem de estar na pasta da pessoa)
create or replace function public.definir_aparencia(p_foto text, p_cor text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.e_membro() then raise exception 'Sem acesso.'; end if;
  if p_foto is not null and p_foto <> '' and p_foto !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.(jpg|webp|png)$') then
    raise exception 'Foto inválida.';
  end if;
  if coalesce(p_cor, '') !~ '^(|twentysix|barbearia|academy|tech|grooms|grupo|vinho|verde|roxo|laranja)$' then
    raise exception 'Cor inválida.';
  end if;
  update public.perfis set foto_path = nullif(p_foto, ''), cor = coalesce(p_cor, '') where id = auth.uid();
end $$;

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatares', 'avatares', false, 2097152, array['image/jpeg','image/webp','image/png'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  drop policy if exists "central26 avatares ver" on storage.objects;
  create policy "central26 avatares ver" on storage.objects for select to authenticated
    using (bucket_id = 'avatares' and public.e_membro());
  drop policy if exists "central26 avatares enviar" on storage.objects;
  create policy "central26 avatares enviar" on storage.objects for insert to authenticated
    with check (bucket_id = 'avatares' and public.e_membro() and (storage.foldername(name))[1] = auth.uid()::text);
  drop policy if exists "central26 avatares apagar" on storage.objects;
  create policy "central26 avatares apagar" on storage.objects for delete to authenticated
    using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
exception when undefined_table or invalid_schema_name then
  raise notice 'Storage indisponível: as fotos de perfil ficam desligadas.';
end $$;

-- ---------------------------------------------------------------------
-- 2. Avisos por email (cada pessoa escolhe o que quer receber)
-- ---------------------------------------------------------------------
create table if not exists public.preferencias (
  perfil_id        uuid primary key references public.perfis(id) on delete cascade,
  email_tarefas    boolean not null default true,
  email_agenda     boolean not null default true,
  email_mensagens  boolean not null default true,
  atualizado_em    timestamptz not null default now()
);
alter table public.preferencias enable row level security;
drop policy if exists preferencias_proprias on public.preferencias;
create policy preferencias_proprias on public.preferencias for all to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid() and public.e_membro());
revoke all on public.preferencias from anon;
grant select, insert, update on public.preferencias to authenticated;

-- ---------------------------------------------------------------------
-- 3. Stocks da TwentySix
-- Quem vê e mexe: direção, Logística e Comercial.
-- Quando um produto chega ao mínimo, quem está em «avisar» recebe um aviso
-- de 15 em 15 minutos até alguém o repor; se alguém carregar em «Ignorar»,
-- passa a ser de hora a hora. Só entre as horas definidas (por defeito 8h–21h).
-- ---------------------------------------------------------------------
create or replace function public.pode_stocks() returns boolean
language sql stable security definer set search_path = public as $$
  select public.e_gestor() or coalesce(public.meu_departamento() in ('logistica','comercial'), false)
$$;

create table if not exists public.stk_produtos (
  id             uuid primary key default gen_random_uuid(),
  codigo         text unique,
  nome           text not null check (length(trim(nome)) > 0),
  categoria      text not null default 'Outros',
  ordem          int not null default 0,
  quantidade     int check (quantidade is null or quantidade >= 0),   -- null = ainda por contar
  minimo         int check (minimo is null or minimo >= 0),           -- null = sem alerta
  unidade        text not null default 'un.',
  ativo          boolean not null default true,
  alerta         text not null default 'ok' check (alerta in ('ok','alerta','ignorado')),
  alerta_desde   timestamptz,
  ultimo_aviso   timestamptz,
  ignorado_por   uuid references public.perfis(id) on delete set null,
  atualizado_por uuid references public.perfis(id) on delete set null,
  atualizado_em  timestamptz not null default now()
);

create table if not exists public.stk_movimentos (
  id          bigint generated always as identity primary key,
  produto_id  uuid not null references public.stk_produtos(id) on delete cascade,
  tipo        text not null check (tipo in ('saida','entrada','acerto','reposto')),
  quantidade  int not null,
  antes       int,
  depois      int,
  nota        text not null default '',
  autor_id    uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em   timestamptz not null default now()
);
create index if not exists stk_mov_produto on public.stk_movimentos (produto_id, criado_em desc);
create index if not exists stk_mov_data on public.stk_movimentos (criado_em desc);

create table if not exists public.stk_config (
  id          int primary key default 1 check (id = 1),
  avisar      uuid[] not null default '{}',     -- vazio = departamento de Logística
  hora_inicio int not null default 8 check (hora_inicio between 0 and 23),
  hora_fim    int not null default 21 check (hora_fim between 1 and 24),
  atualizado_em timestamptz not null default now()
);
insert into public.stk_config (id) values (1) on conflict do nothing;

-- Recalcula o estado do alerta depois de mexer na quantidade ou no mínimo
create or replace function public.stk_estado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if auth.uid() is not null then new.atualizado_por := auth.uid(); end if;
  if new.ativo and new.minimo is not null and new.quantidade is not null and new.quantidade <= new.minimo then
    if new.alerta = 'ok' then new.alerta := 'alerta'; new.alerta_desde := now(); new.ultimo_aviso := null; new.ignorado_por := null; end if;
  else
    new.alerta := 'ok'; new.alerta_desde := null; new.ultimo_aviso := null; new.ignorado_por := null;
  end if;
  return new;
end $$;
drop trigger if exists stk_estado on public.stk_produtos;
create trigger stk_estado before insert or update on public.stk_produtos for each row execute function public.stk_estado();

-- Quem recebe os avisos de stock
create or replace function public.stk_destinatarios() returns setof uuid
language sql stable security definer set search_path = public as $$
  with cfg as (select avisar from public.stk_config where id = 1)
  select p.id from public.perfis p, cfg
   where p.ativo and (case when coalesce(array_length(cfg.avisar, 1), 0) > 0 then p.id = any(cfg.avisar)
                           else p.departamento_id = 'logistica' end)
$$;

-- Envia um aviso (substitui o anterior por ler do mesmo produto, para não encher a lista)
create or replace function public.stk_avisar(p_produto uuid) returns int
language plpgsql security definer set search_path = public as $$
declare pr public.stk_produtos; d uuid; n int := 0;
begin
  select * into pr from public.stk_produtos where id = p_produto;
  if pr.id is null or pr.alerta = 'ok' then return 0; end if;
  perform set_config('central26.movimento', '1', true);
  for d in select public.stk_destinatarios() loop
    delete from public.notificacoes where destinatario_id = d and link = '#stock-' || pr.id and not lida;
    insert into public.notificacoes (destinatario_id, tipo, titulo, corpo, link)
    values (d, 'stock', 'Repor stock: ' || pr.nome,
            'Restam ' || pr.quantidade || ' ' || pr.unidade || ' (mínimo ' || pr.minimo || '). Abre a Central para marcar como reposto ou ignorar.',
            '#stock-' || pr.id);
    n := n + 1;
  end loop;
  update public.stk_produtos set ultimo_aviso = now() where id = pr.id;
  return n;
end $$;

-- Corre a cada minuto (pg_cron): 15 em 15 minutos em alerta, de hora a hora se ignorado
create or replace function public.stk_lembretes() returns int
language plpgsql security definer set search_path = public as $$
declare c public.stk_config; h int; pr record; n int := 0;
begin
  select * into c from public.stk_config where id = 1;
  h := extract(hour from now() at time zone 'Europe/Lisbon');
  if h < coalesce(c.hora_inicio, 8) or h >= coalesce(c.hora_fim, 21) then return 0; end if;
  for pr in select id from public.stk_produtos
             where ativo and (
               (alerta = 'alerta'   and (ultimo_aviso is null or ultimo_aviso <= now() - interval '15 minutes' + interval '20 seconds')) or
               (alerta = 'ignorado' and (ultimo_aviso is null or ultimo_aviso <= now() - interval '60 minutes' + interval '20 seconds'))) loop
    n := n + public.stk_avisar(pr.id);
  end loop;
  return n;
end $$;

-- Movimento de stock (retirar, dar entrada, acertar contagem ou repor) — tudo de uma vez, sem corridas
create or replace function public.stk_movimento(p_produto uuid, p_tipo text, p_qtd int, p_nota text default '') returns public.stk_produtos
language plpgsql security definer set search_path = public as $$
declare pr public.stk_produtos; v_novo int;
begin
  if not public.pode_stocks() then raise exception 'Sem acesso aos stocks.'; end if;
  perform set_config('central26.movimento', '1', true);
  if p_tipo not in ('saida','entrada','acerto','reposto') then raise exception 'Movimento inválido.'; end if;
  if p_qtd is null or p_qtd < 0 or (p_tipo in ('saida','entrada') and p_qtd = 0) then raise exception 'Indica uma quantidade válida.'; end if;
  select * into pr from public.stk_produtos where id = p_produto for update;
  if pr.id is null then raise exception 'Produto não encontrado.'; end if;
  if p_tipo = 'saida' then
    if pr.quantidade is null then raise exception 'Este produto ainda não foi contado. Acerta primeiro a contagem.'; end if;
    if p_qtd > pr.quantidade then raise exception 'Só há % % de %.', pr.quantidade, pr.unidade, pr.nome; end if;
    v_novo := pr.quantidade - p_qtd;
  elsif p_tipo = 'entrada' then v_novo := coalesce(pr.quantidade, 0) + p_qtd;
  else v_novo := p_qtd;   -- acerto ou reposto: fica a quantidade indicada
  end if;
  insert into public.stk_movimentos (produto_id, tipo, quantidade, antes, depois, nota)
  values (pr.id, p_tipo, p_qtd, pr.quantidade, v_novo, left(coalesce(p_nota, ''), 200));
  update public.stk_produtos set quantidade = v_novo where id = pr.id returning * into pr;
  -- aviso imediato quando acabou de chegar ao mínimo
  if pr.alerta = 'alerta' and pr.ultimo_aviso is null then perform public.stk_avisar(pr.id); select * into pr from public.stk_produtos where id = p_produto; end if;
  -- reposto acima do mínimo: limpa os avisos por ler
  if pr.alerta = 'ok' then delete from public.notificacoes where link = '#stock-' || pr.id and not lida; end if;
  return pr;
end $$;

create or replace function public.stk_ignorar(p_produto uuid) returns public.stk_produtos
language plpgsql security definer set search_path = public as $$
declare pr public.stk_produtos;
begin
  if not public.pode_stocks() then raise exception 'Sem acesso aos stocks.'; end if;
  perform set_config('central26.movimento', '1', true);
  update public.stk_produtos set alerta = 'ignorado', ignorado_por = auth.uid(), ultimo_aviso = now()
   where id = p_produto and alerta <> 'ok' returning * into pr;
  if pr.id is null then select * into pr from public.stk_produtos where id = p_produto; end if;
  delete from public.notificacoes where link = '#stock-' || p_produto and not lida;
  return pr;
end $$;

-- Importação do Excel: atualiza por código ou nome; cria os que não existem
create or replace function public.stk_importar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare x jsonb; pr public.stk_produtos; v_novos int := 0; v_atual int := 0; v_q int; v_m int;
begin
  if not public.pode_stocks() then raise exception 'Sem acesso aos stocks.'; end if;
  perform set_config('central26.movimento', '1', true);
  for x in select * from jsonb_array_elements(coalesce(p->'produtos', '[]')) loop
    continue when coalesce(trim(x->>'nome'), '') = '';
    v_q := nullif(x->>'quantidade', '')::numeric::int; v_m := nullif(x->>'minimo', '')::numeric::int;
    select * into pr from public.stk_produtos
     where (x->>'codigo' is not null and codigo = x->>'codigo') or lower(trim(nome)) = lower(trim(x->>'nome')) limit 1;
    if pr.id is null then
      insert into public.stk_produtos (codigo, nome, categoria, quantidade, minimo)
      values (nullif(x->>'codigo', ''), trim(x->>'nome'), coalesce(nullif(trim(x->>'categoria'), ''), 'Outros'), v_q, v_m) returning * into pr;
      if v_q is not null then insert into public.stk_movimentos (produto_id, tipo, quantidade, antes, depois, nota) values (pr.id, 'acerto', v_q, null, v_q, 'Importação'); end if;
      v_novos := v_novos + 1;
    else
      if v_q is not null and v_q is distinct from pr.quantidade then
        insert into public.stk_movimentos (produto_id, tipo, quantidade, antes, depois, nota) values (pr.id, 'acerto', v_q, pr.quantidade, v_q, 'Importação');
      end if;
      update public.stk_produtos set quantidade = coalesce(v_q, quantidade), minimo = case when x ? 'minimo' then v_m else minimo end,
             categoria = coalesce(nullif(trim(x->>'categoria'), ''), categoria)
       where id = pr.id;
      v_atual := v_atual + 1;
    end if;
    pr := null;
  end loop;
  perform public.stk_avisar(id) from public.stk_produtos where alerta = 'alerta' and ultimo_aviso is null;
  return jsonb_build_object('novos', v_novos, 'atualizados', v_atual);
end $$;

alter table public.stk_produtos   enable row level security;
alter table public.stk_movimentos enable row level security;
alter table public.stk_config     enable row level security;
drop policy if exists stk_produtos_ler on public.stk_produtos;
create policy stk_produtos_ler on public.stk_produtos for select to authenticated using (public.pode_stocks());
drop policy if exists stk_produtos_criar on public.stk_produtos;
create policy stk_produtos_criar on public.stk_produtos for insert to authenticated with check (public.pode_stocks());
drop policy if exists stk_produtos_mudar on public.stk_produtos;
create policy stk_produtos_mudar on public.stk_produtos for update to authenticated using (public.pode_stocks()) with check (public.pode_stocks());
drop policy if exists stk_produtos_apagar on public.stk_produtos;
create policy stk_produtos_apagar on public.stk_produtos for delete to authenticated using (public.e_gestor());
drop policy if exists stk_mov_ler on public.stk_movimentos;
create policy stk_mov_ler on public.stk_movimentos for select to authenticated using (public.pode_stocks());
drop policy if exists stk_config_ler on public.stk_config;
create policy stk_config_ler on public.stk_config for select to authenticated using (public.pode_stocks());
drop policy if exists stk_config_mudar on public.stk_config;
create policy stk_config_mudar on public.stk_config for update to authenticated using (public.e_gestor()) with check (public.e_gestor());
revoke all on public.stk_produtos, public.stk_movimentos, public.stk_config from anon;
grant select, insert, update, delete on public.stk_produtos to authenticated;
grant select on public.stk_movimentos to authenticated;
grant select, update on public.stk_config to authenticated;
-- a quantidade só muda através dos movimentos (fica sempre registado quem mexeu)
create or replace function public.stk_proteger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('central26.movimento', true) = '1' then return new; end if;
  if tg_op = 'UPDATE' then
    new.quantidade := old.quantidade; new.alerta := old.alerta; new.ultimo_aviso := old.ultimo_aviso; new.ignorado_por := old.ignorado_por; new.alerta_desde := old.alerta_desde;
  elsif tg_op = 'INSERT' then
    new.quantidade := null;
  end if;
  return new;
end $$;
drop trigger if exists stk_a_proteger on public.stk_produtos;
create trigger stk_a_proteger before insert or update on public.stk_produtos for each row execute function public.stk_proteger();

do $$
declare t text;
begin
  foreach t in array array['stk_produtos','stk_movimentos','stk_config'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null; end;
  end loop;
end $$;

-- Catálogo inicial (produtos à venda na loja da TwentySix e material da marca). Quantidades por contar.
insert into public.stk_produtos (codigo, nome, categoria, ordem) values
  ('mist-100','Mist · Cera 100 ml','Ceras',1), ('mist-250','Mist · Cera 250 ml','Ceras',2), ('mist-500','Mist · Cera 500 ml','Ceras',3),
  ('spark-100','Spark · Cera 100 ml','Ceras',4), ('spark-250','Spark · Cera 250 ml','Ceras',5), ('spark-500','Spark · Cera 500 ml','Ceras',6),
  ('clay-100','Clay · Cera 100 ml','Ceras',7), ('clay-250','Clay · Cera 250 ml','Ceras',8), ('clay-500','Clay · Cera 500 ml','Ceras',9),
  ('blaze-100','Blaze · Cera 100 ml','Ceras',10), ('blaze-250','Blaze · Cera 250 ml','Ceras',11), ('blaze-500','Blaze · Cera 500 ml','Ceras',12),
  ('fog-100','Fog · Cera 100 ml','Ceras',13), ('fog-250','Fog · Cera 250 ml','Ceras',14), ('fog-500','Fog · Cera 500 ml','Ceras',15),
  ('kids','Kids','Ceras',16),
  ('river-salt','River Salt · 150 ml','Styling',1), ('dust','Dust · pó de volume','Styling',2), ('booster','Booster · grooming spray','Styling',3),
  ('hack-300','Hack · champô antiqueda 300 ml','Champôs e tratamento',1), ('hack-1000','Hack · champô antiqueda 1000 ml','Champôs e tratamento',2),
  ('unity-300','Unity · champô antioleosidade 300 ml','Champôs e tratamento',3), ('unity-1000','Unity · champô antioleosidade 1000 ml','Champôs e tratamento',4),
  ('xscalp-300','Xscalp · champô anticaspa 300 ml','Champôs e tratamento',5), ('xscalp-1000','Xscalp · champô anticaspa 1000 ml','Champôs e tratamento',6),
  ('hack-tonico','Hack · tónico','Champôs e tratamento',7),
  ('beard-balm','Beard Balm · bálsamo 100 ml','Barba',1), ('bravo-oil','Bravo · óleo de barba 30 ml','Barba',2), ('original-oil','Original · óleo de barba 30 ml','Barba',3),
  ('shave-500','Shave Cream · 500 ml','Barbear e corpo',1), ('shave-1000','Shave Cream · 1000 ml','Barbear e corpo',2),
  ('after-1000','After Shave · 1000 ml','Barbear e corpo',3), ('black-breeze','Black Breeze · sabonete íntimo','Barbear e corpo',4),
  ('polo','Polo de barbeiro','Têxteis e acessórios',1), ('golas-pretas','Golas pretas','Têxteis e acessórios',2), ('golas-brancas','Golas brancas','Têxteis e acessórios',3),
  ('necessaire','Necessaire','Têxteis e acessórios',4), ('penteador','Penteador TwentySix','Têxteis e acessórios',5),
  ('tapete','Tapete de descanso','Equipamento',1), ('carrinho','Carrinho de apoio','Equipamento',2), ('vaporizador','Vaporizador','Equipamento',3),
  ('assento-crianca','Assento para crianças','Equipamento',4), ('forno','Forno de toalhas','Equipamento',5), ('maq-espuma','Máquina de espuma','Equipamento',6),
  ('cad-austria','Cadeira profissional d''Áustria','Equipamento',7), ('cad-lencastre','Cadeira profissional d''Lencastre','Equipamento',8), ('cad-sancha','Cadeira profissional Sancha','Equipamento',9),
  ('caixa-p','Caixa de envio pequena','Embalagem e envio',1), ('caixa-m','Caixa de envio média','Embalagem e envio',2), ('caixa-g','Caixa de envio grande','Embalagem e envio',3),
  ('saco','Saco TwentySix','Embalagem e envio',4)
on conflict (codigo) do nothing;

do $$ begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'central26-stocks';
  perform cron.schedule('central26-stocks', '* * * * *', 'select public.stk_lembretes()');
exception when others then
  raise notice 'pg_cron indisponível: os lembretes de stock ficam desligados (%).', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 4. Permissões das funções (só com sessão iniciada; as internas ficam fechadas)
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
