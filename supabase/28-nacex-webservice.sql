-- =====================================================================
-- Central 26 · 28 · Envios pela Nacex através do webservice
-- Correr no Supabase: SQL Editor → New query → colar tudo → Run. Pode ser corrido mais do que uma vez.
--
-- A função «nacex» (Edge Functions) cria o envio, obtém a etiqueta e consulta o estado na Nacex.
-- Os dados do envio (carta de porte, serviço, data prevista, estado) ficam na coluna «nacex» da encomenda.
-- Só a função escreve nesta coluna; as credenciais da Nacex ficam nos Secrets da função.
-- =====================================================================
alter table public.log_encomendas add column if not exists nacex jsonb;
create index if not exists log_encomendas_nacex_ativo on public.log_encomendas ((nacex->>'expe_codigo')) where nacex is not null;
