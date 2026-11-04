-- =====================================================================
-- Central 26 · 06 · Mapa de clientes
-- Correr uma vez no Supabase: SQL Editor → New query → colar tudo → Run
-- Pode voltar a ser corrido sem apagar dados. Precisa do 03-crm.sql.
--
-- Guarda a posição de cada cliente ou lead no mapa (procurada a partir da morada).
-- Os limites de distritos, concelhos e freguesias (CAOP 2025, DGT) vêm com a app.
-- =====================================================================

alter table public.crm_clientes add column if not exists lat double precision;
alter table public.crm_clientes add column if not exists lng double precision;
alter table public.crm_clientes add column if not exists geo_aprox boolean not null default false; -- só pela localidade ou pelo código postal
alter table public.crm_clientes add column if not exists geo_em timestamptz;
alter table public.crm_clientes add column if not exists geo_falhou boolean not null default false; -- a morada não foi encontrada

-- Se a morada, o código postal ou o concelho mudarem, a posição antiga deixa de valer
create or replace function public.crm_clientes_geo() returns trigger
language plpgsql as $$
begin
  if (new.morada is distinct from old.morada or new.codigo_postal is distinct from old.codigo_postal or new.concelho is distinct from old.concelho)
     and new.lat is not distinct from old.lat and new.lng is not distinct from old.lng and new.geo_falhou is not distinct from old.geo_falhou then
    new.lat := null; new.lng := null; new.geo_aprox := false; new.geo_em := null; new.geo_falhou := false;
  end if;
  if new.lat is distinct from old.lat and new.lat is not null then new.geo_em := now(); new.geo_falhou := false; end if;
  return new;
end $$;
drop trigger if exists crm_clientes_geo on public.crm_clientes;
create trigger crm_clientes_geo before update on public.crm_clientes
  for each row execute function public.crm_clientes_geo();
