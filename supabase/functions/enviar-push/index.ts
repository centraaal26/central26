// Central 26 · enviar-push
// Envia as notificações para os telemóveis e computadores onde foram ativadas.
// - Chamada automaticamente pela base de dados sempre que é criada uma notificação (acao "enviar").
// - Chamada pela app para obter a chave pública (acao "chave") e para um envio de teste (acao "teste").
// As chaves VAPID são criadas automaticamente na primeira utilização e guardadas na base de dados.
// Email (opcional): com o segredo RESEND_API_KEY definido, também envia um email para tarefas atribuídas,
// eventos da agenda e mensagens, conforme as preferências de cada pessoa. EMAIL_REMETENTE define o remetente.
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

// ---------- email ----------
const APP_URL = Deno.env.get("APP_URL") || "https://centraaal26.github.io/central26/";
const TIPOS_EMAIL: Record<string, string> = {
  tarefa_atribuida: "email_tarefas",
  agenda: "email_agenda",
  lembrete: "email_agenda",
  mensagem: "email_mensagens",
};
const escHtml = (t: string) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function htmlEmail(nome: string, titulo: string, corpo: string, url: string) {
  return `<!doctype html><html lang="pt-PT"><body style="margin:0;background:#f4f1ea;font-family:Helvetica,Arial,sans-serif;color:#1c1a17">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6e0d4">
<tr><td style="background:#17150f;padding:18px 24px;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:.5px">CENTRAL <span style="color:#c9a35a">26</span></td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 6px;font-size:14px;color:#6b665d">Olá, ${escHtml(nome.split(" ")[0])}</p>
<h1 style="margin:0 0 10px;font-size:20px;line-height:1.3">${escHtml(titulo)}</h1>
<p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#3a362f">${escHtml(corpo)}</p>
<a href="${escHtml(url)}" style="display:inline-block;background:#8a6a2c;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:9px">Abrir na Central 26</a>
</td></tr>
<tr><td style="padding:14px 24px 20px;font-size:12px;color:#8b857a;border-top:1px solid #eee8dc">Recebes este email porque tens os avisos por email ligados. Podes desligá-los na Central 26, em «Mais».</td></tr>
</table></td></tr></table></body></html>`;
}

async function enviarEmail(para: string, nome: string, titulo: string, corpo: string, link: string) {
  const chave = Deno.env.get("RESEND_API_KEY");
  if (!chave) return { ok: false, motivo: "sem-chave" };
  const url = APP_URL + (link || "");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("EMAIL_REMETENTE") || "Central 26 <central@avisos.twentysix.pt>",
      to: [para],
      subject: titulo,
      html: htmlEmail(nome, titulo, corpo, url),
      text: `${titulo}\n\n${corpo}\n\nAbrir na Central 26: ${url}`,
    }),
  });
  if (!r.ok) { const t = await r.text(); console.error("Falha no email", r.status, t); return { ok: false, motivo: "resend-" + r.status, detalhe: t.slice(0, 200) }; }
  return { ok: true };
}

async function emailDaNotificacao(n: Record<string, string>) {
  const campo = TIPOS_EMAIL[n.tipo];
  if (!campo || !Deno.env.get("RESEND_API_KEY")) return null;
  const { data: p } = await admin.from("perfis").select("nome, email, ativo").eq("id", n.destinatario_id).maybeSingle();
  if (!p?.ativo || !p.email) return null;
  const { data: pref } = await admin.from("preferencias").select("*").eq("perfil_id", n.destinatario_id).maybeSingle();
  if (pref && (pref as unknown as Record<string, boolean>)[campo] === false) return null;
  return await enviarEmail(p.email, p.nome || "", n.titulo || "Central 26", n.corpo || "", n.link || "");
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
      const [enviados, email] = await Promise.all([
        enviarPara([n.destinatario_id], { titulo: n.titulo, corpo: n.corpo, link: n.link, id: n.id }),
        emailDaNotificacao(n).catch((e) => ({ ok: false, motivo: String(e?.message || e) })),
      ]);
      return json({ ok: true, enviados, email });
    }

    // Pedidos da app: exige sessão de um empregado ativo
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: sessao } = await admin.auth.getUser(token);
    if (!sessao?.user) return json({ erro: "A sessão expirou. Volta a entrar." }, 401);
    const { data: eu } = await admin.from("perfis").select("id, ativo, nome, email").eq("id", sessao.user.id).maybeSingle();
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
    if (corpo.acao === "email-teste") {
      if (!Deno.env.get("RESEND_API_KEY")) return json({ erro: "Os emails ainda não estão ligados: falta o segredo RESEND_API_KEY na função enviar-push (README, passo 3l)." }, 400);
      const r = await enviarEmail(eu.email, eu.nome || "", "Teste de avisos por email", "Se estás a ler isto, os avisos por email da Central 26 estão a funcionar.", "#definicoes");
      if (!r.ok) return json({ erro: "O serviço de email recusou o envio (" + r.motivo + "). Confirma o domínio e o remetente no Resend." }, 502);
      return json({ ok: true });
    }
    return json({ erro: "Ação desconhecida." }, 400);
  } catch (e) {
    return json({ erro: `Erro inesperado: ${(e as Error)?.message || e}` }, 500);
  }
});
