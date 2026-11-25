-- Central 26 · 34 · Comercial separado por marca: TwentySix e 26 Tech
-- As vendas separam-se pela linha do produto («tech» é 26 Tech). Os leads ainda sem compras
-- ficam da TwentySix, a não ser que se marquem como 26 Tech (por exemplo, clínicas para os equipamentos).
alter table public.crm_clientes add column if not exists marca text check (marca is null or marca in ('tech'));
create index if not exists crm_cli_marca on public.crm_clientes (marca) where marca is not null;
