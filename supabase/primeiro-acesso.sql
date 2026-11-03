-- =====================================================================
-- Central 26 · Primeiro acesso
-- Dá o papel de Administração à primeira conta, para poder criar o resto da equipa na app.
--
-- Antes de correr:
--   1. Authentication → Users → Add user → Create new user
--      (o teu email, uma palavra-passe forte, com «Auto Confirm User» ligado)
--   2. Troca o email abaixo pelo email que usaste
-- =====================================================================
insert into public.perfis (id, nome, email, cargo, departamento_id, papel, mudar_password)
select id, 'Isaac Maia', email, 'Departamento Tecnológico', 'tecnologico', 'admin', false
from auth.users
where email = lower('COLOCA-AQUI-O-TEU-EMAIL')
on conflict (id) do update set papel = 'admin', ativo = true;

-- Deve aparecer uma linha com o teu nome:
select nome, email, papel from public.perfis;
