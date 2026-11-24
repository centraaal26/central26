-- Central 26 · 31 · Cancelar o envio na Nacex quando a encomenda é cancelada
-- Quando uma encomenda com envio criado na Nacex passa a «cancelada», a base de dados avisa a função «nacex»
-- (com o segredo_webhook), que cancela o envio na Nacex. Se a Nacex recusar (por exemplo, o envio já foi
-- recolhido), o motivo fica no envio para a Logística ver e tratar à mão.

create or replace function public.log_nacex_cancelar() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_url text; v_seg text;
begin
  if new.estado = 'cancelada' and old.estado is distinct from 'cancelada'
     and new.nacex is not null and coalesce(new.nacex->>'expe_codigo', '') <> '' then
    select valor into v_url from public.configuracao where chave = 'url_funcoes';
    select valor into v_seg from public.configuracao_privada where chave = 'segredo_webhook';
    if v_url is not null and v_seg is not null then
      perform net.http_post(url := v_url || '/nacex', headers := jsonb_build_object('Content-Type', 'application/json', 'x-segredo', v_seg),
                            body := jsonb_build_object('acao', 'cancelar_canceladas'), timeout_milliseconds := 30000);
    end if;
  end if;
  return new;
exception when others then
  raise warning 'Falha ao pedir o cancelamento na Nacex: %', sqlerrm;
  return new;
end $$;

revoke all on function public.log_nacex_cancelar() from public, anon, authenticated;

drop trigger if exists log_nacex_cancelar on public.log_encomendas;
create trigger log_nacex_cancelar after update of estado on public.log_encomendas
  for each row execute function public.log_nacex_cancelar();
