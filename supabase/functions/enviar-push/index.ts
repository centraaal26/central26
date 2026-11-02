// Central 26 · enviar-push
// Envia as notificações para os telemóveis e computadores onde foram ativadas.
// - Chamada automaticamente pela base de dados sempre que é criada uma notificação (acao "enviar").
// - Chamada pela app para obter a chave pública (acao "chave") e para um envio de teste (acao "teste").
// As chaves VAPID são criadas automaticamente na primeira utilização e guardadas na base de dados.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-segredo",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (corpo: unknown, estado = 200) =>
  new Response(JSON.stringify(corpo), { status: estado, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function lerChaves() {
  const { data } = await admin.from("configuracao_privada").select("chave, valor").in("chave", ["vapid_publica", "vapid_privada"]);
  return {
    pub: data?.find((x) => x.chave === "vapid_publica")?.valor as string | undefined,
    priv: data?.find((x) => x.chave === "vapid_privada")?.valor as string | undefined,
  };
}

async function chaves() {
  let k = await lerChaves();
  if (!k.pub || !k.priv) {
    const novas = webpush.generateVAPIDKeys();
    await admin.from("configuracao_privada").upsert(
      [{ chave: "vapid_publica", valor: novas.publicKey }, { chave: "vapid_privada", valor: novas.privateKey }],
      { onConflict: "chave", ignoreDuplicates: true },
    );
    k = await lerChaves(); // se dois pedidos chegarem ao mesmo tempo, fica a primeira chave gravada
    await admin.from("configuracao").upsert({ chave: "vapid_publica", valor: k.pub }, { onConflict: "chave" });
  }
  return k as { pub: string; priv: string };
}

async function enviarPara(perfis: string[], conteudo: Record<string, unknown>) {
  const { pub, priv } = await chaves();
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "https://centraaal26.github.io/central26/", pub, priv);
  const { data: subs } = await admin.from("subscricoes_push").select("id, endpoint, p256dh, auth").in("perfil_id", perfis);
  let enviados = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(conteudo),
        { TTL: 60 * 60 * 24 },
      );
      enviados++;
    } catch (e) {
      const codigo = (e as { statusCode?: number })?.statusCode;
      if (codigo === 404 || codigo === 410) await admin.from("subscricoes_push").delete().eq("id", s.id);
      else console.error("Falha no envio", codigo, (e as Error)?.message);
    }
  }
  return enviados;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não suportado." }, 405);

  try {
    const corpo = await req.json().catch(() => ({}));

    // Pedido da base de dados: valida o segredo partilhado
    if (corpo.acao === "enviar") {
      const { data } = await admin.from("configuracao_privada").select("valor").eq("chave", "segredo_webhook").maybeSingle();
      if (!data || req.headers.get("x-segredo") !== data.valor) return json({ erro: "Não autorizado." }, 401);
      const n = corpo.notificacao || {};
      if (!n.destinatario_id) return json({ erro: "Notificação sem destinatário." }, 400);
      const enviados = await enviarPara([n.destinatario_id], { titulo: n.titulo, corpo: n.corpo, link: n.link, id: n.id });
      return json({ ok: true, enviados });
    }

    // Pedidos da app: exige sessão de um empregado ativo
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: sessao } = await admin.auth.getUser(token);
    if (!sessao?.user) return json({ erro: "A sessão expirou. Volta a entrar." }, 401);
    const { data: eu } = await admin.from("perfis").select("id, ativo").eq("id", sessao.user.id).maybeSingle();
    if (!eu?.ativo) return json({ erro: "Conta sem acesso." }, 403);

    if (corpo.acao === "chave") {
      const { pub } = await chaves();
      return json({ chave: pub });
    }
    if (corpo.acao === "teste") {
      const enviados = await enviarPara([eu.id], {
        titulo: "Central 26",
        corpo: "As notificações estão ativas neste aparelho.",
        link: "#definicoes",
      });
      return json({ ok: true, enviados });
    }
    return json({ erro: "Ação desconhecida." }, 400);
  } catch (e) {
    return json({ erro: `Erro inesperado: ${(e as Error)?.message || e}` }, 500);
  }
});
