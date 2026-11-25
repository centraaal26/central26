-- Central 26 · 32 · Comissão dos barbeiros 26 na venda de produtos
-- Percentagem sobre o preço recomendado ao público (PRVP) de cada produto que o barbeiro vende na loja.
-- Definida pela direção (25/11/2026: 15%). Usada pela área dos barbeiros quando chegarem as vendas do Multixop.
alter table public.com_config add column if not exists comissao_barbeiros numeric(5,2) not null default 15
  check (comissao_barbeiros between 0 and 100);
