-- =====================================================================
-- Central 26 · 30 · Análise da barbearia no primeiro contacto de venda
-- Correr no Supabase: SQL Editor → New query → colar tudo → Run. Pode ser corrido mais do que uma vez.
-- Guarda a análise que o assistente faz das barbearias que ainda não são clientes
-- (cadeiras, barbeiros, avaliação no Google, necessidades e o que propor).
-- =====================================================================
alter table public.crm_abordagens add column if not exists analise jsonb not null default '{}'::jsonb;
