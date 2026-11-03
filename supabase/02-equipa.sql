-- =====================================================================
-- Central 26 · 02 · Gestão da equipa sem funções de servidor
-- Correr uma vez no Supabase: SQL Editor → New query → colar tudo → Run
-- Pode voltar a ser corrido sem apagar dados.
--
-- Permite ao CEO e à administração criar contas, repor palavras-passe e
-- desativar contas diretamente a partir da app.
-- =====================================================================

-- Palavra-passe temporária fácil de ditar: Central-4821-kqmt
create or replace function public.gerar_password_temporaria() returns text
language plpgsql volatile set search_path = public, extensions as $$
declare
  letras text := 'abcdefghjkmnpqrstuvwxyz';
  b bytea := extensions.gen_random_bytes(8);
  num text := '';
  let_ text := '';
  i int;
begin
  for i in 0..3 loop num := num || (get_byte(b, i) % 10)::text; end loop;
  for i in 4..7 loop let_ := let_ || substr(letras, (get_byte(b, i) % length(letras)) + 1, 1); end loop;
  return 'Central-' || num || '-' || let_;
end $$;

-- ---------------------------------------------------------------------
-- Criar empregado
-- ---------------------------------------------------------------------
create or replace function public.admin_criar_empregado(
  p_nome text, p_email text, p_cargo text default '', p_telefone text default '',
  p_departamento text default null, p_papel text default 'colaborador'
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_nome  text := trim(coalesce(p_nome, ''));
  v_papel text := coalesce(nullif(p_papel, ''), 'colaborador');
  v_id    uuid := gen_random_uuid();
  v_pass  text := public.gerar_password_temporaria();
begin
  if not public.e_gestor() then
    raise exception 'Só o CEO e a administração podem gerir a equipa.';
  end if;
  if v_nome = '' then raise exception 'Indica o nome do empregado.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'O email não é válido.'; end if;
  if v_papel not in ('ceo', 'admin', 'chefe', 'colaborador') then v_papel := 'colaborador'; end if;
  if v_papel = 'ceo' and public.meu_papel() <> 'ceo'
     and exists (select 1 from public.perfis where papel = 'ceo') then
    raise exception 'Só o CEO pode dar o papel de CEO.';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'Já existe uma conta com este email.';
  end if;
  if p_departamento is not null and p_departamento <> ''
     and not exists (select 1 from public.departamentos where id = p_departamento) then
    raise exception 'O departamento escolhido não existe.';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(v_pass, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('nome', v_nome), now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
          'email', null, now(), now());

  insert into public.perfis (id, nome, email, cargo, departamento_id, papel, telefone, criado_por, mudar_password)
  values (v_id, v_nome, v_email, trim(coalesce(p_cargo, '')), nullif(p_departamento, ''), v_papel,
          trim(coalesce(p_telefone, '')), auth.uid(), true);

  return jsonb_build_object('ok', true, 'id', v_id, 'password', v_pass);
end $$;

-- ---------------------------------------------------------------------
-- Repor palavra-passe
-- ---------------------------------------------------------------------
create or replace function public.admin_repor_password(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_papel text;
  v_pass  text := public.gerar_password_temporaria();
begin
  if not public.e_gestor() then raise exception 'Só o CEO e a administração podem gerir a equipa.'; end if;
  select papel into v_papel from public.perfis where id = p_id;
  if v_papel is null then raise exception 'Empregado não encontrado.'; end if;
  if v_papel = 'ceo' and public.meu_papel() <> 'ceo' then
    raise exception 'Só o CEO pode repor a palavra-passe do CEO.';
  end if;
  update auth.users set encrypted_password = extensions.crypt(v_pass, extensions.gen_salt('bf')), updated_at = now()
   where id = p_id;
  update public.perfis set mudar_password = true where id = p_id;
  return jsonb_build_object('ok', true, 'password', v_pass);
end $$;

-- ---------------------------------------------------------------------
-- Ativar / desativar conta
-- ---------------------------------------------------------------------
create or replace function public.admin_definir_ativo(p_id uuid, p_ativo boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_papel text;
begin
  if not public.e_gestor() then raise exception 'Só o CEO e a administração podem gerir a equipa.'; end if;
  if p_id = auth.uid() then raise exception 'Não podes desativar a tua própria conta.'; end if;
  select papel into v_papel from public.perfis where id = p_id;
  if v_papel is null then raise exception 'Empregado não encontrado.'; end if;
  if v_papel = 'ceo' and public.meu_papel() <> 'ceo' then
    raise exception 'Só o CEO pode desativar a conta do CEO.';
  end if;
  update auth.users
     set banned_until = case when p_ativo then null else now() + interval '100 years' end, updated_at = now()
   where id = p_id;
  if not p_ativo then
    delete from auth.refresh_tokens where user_id::text = p_id::text;
  end if;
  update public.perfis set ativo = p_ativo where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.gerar_password_temporaria() from public, anon, authenticated;
revoke all on function public.admin_criar_empregado(text, text, text, text, text, text) from public, anon;
revoke all on function public.admin_repor_password(uuid) from public, anon;
revoke all on function public.admin_definir_ativo(uuid, boolean) from public, anon;
grant execute on function public.admin_criar_empregado(text, text, text, text, text, text) to authenticated;
grant execute on function public.admin_repor_password(uuid) to authenticated;
grant execute on function public.admin_definir_ativo(uuid, boolean) to authenticated;
