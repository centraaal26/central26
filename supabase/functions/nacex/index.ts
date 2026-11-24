// Central 26 · nacex
// Liga as encomendas da Logística ao webservice da Nacex: criar o envio, obter a etiqueta (PDF),
// consultar o estado e cancelar. As credenciais ficam só nos Secrets da função (nunca no código):
//   NACEX_UTILIZADOR  utilizador do webservice
//   NACEX_CHAVE       palavra-passe em MD5 (tal como a Nacex a fornece)
//   NACEX_DELEGACAO   agência do cliente (del_cli)
//   NACEX_CLIENTE     código de cliente / n.º de abonado (num_cli)
// Só quem trata de encomendas (pode_encomendas) pode usar esta função.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (corpo: unknown, estado = 200) => new Response(JSON.stringify(corpo), { status: estado, headers: { ...cors, "Content-Type": "application/json" } });

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const WS = "https://pda.nacex.com/nacex_ws/ws";
const env = (k: string) => (Deno.env.get(k) || "").trim();

// valores sem «|» nem quebras de linha (o separador do webservice) e com o tamanho máximo de cada campo
const limpo = (v: unknown, max: number) => String(v ?? "").replace(/[|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const hojeNacex = () => new Date().toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", year: "numeric" });
const ref = (e: { numero: number }) => "E-" + String(e.numero).padStart(4, "0");

async function chamar(metodo: string, dados: Record<string, string>): Promise<string> {
  const u = env("NACEX_UTILIZADOR"), p = env("NACEX_CHAVE");
  if (!u || !p) throw new Error("Faltam as credenciais da Nacex (NACEX_UTILIZADOR e NACEX_CHAVE) nos Secrets da função «nacex».");
  const data = Object.entries(dados).filter(([, v]) => v !== "").map(([k, v]) => k + "=" + v).join("|");
  const url = WS + "?method=" + metodo + "&data=" + encodeURIComponent(data) + "&user=" + encodeURIComponent(u) + "&pass=" + encodeURIComponent(p);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
  let r: Response;
  try { r = await fetch(url, { signal: ctl.signal }); }
  catch { throw new Error("A Nacex não respondeu. Tenta daqui a pouco."); }
  finally { clearTimeout(t); }
  const buf = new Uint8Array(await r.arrayBuffer());
  const cs = (r.headers.get("content-type") || "").match(/charset=([\w-]+)/i)?.[1] || "utf-8";
  let txt: string; try { txt = new TextDecoder(cs).decode(buf); } catch { txt = new TextDecoder("utf-8").decode(buf); }
  txt = txt.trim();
  if (!r.ok) throw new Error("A Nacex respondeu com um erro (" + r.status + ").");
  if (!txt || /^error/i.test(txt) || /^(ko|-\d+)\b/i.test(txt)) throw new Error("A Nacex recusou o pedido: " + txt.replace(/^error\s*[:|]?\s*/i, "").slice(0, 300));
  return txt;
}

// base64url → base64 normal (para o ecrã abrir o PDF)
const b64 = (s: string) => { let x = s.replace(/\*+$/, "").replace(/-/g, "+").replace(/_/g, "/"); while (x.length % 4) x += "="; return x; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não suportado." }, 405);
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: sessao } = await admin.auth.getUser(token);
    if (!sessao?.user) return json({ erro: "A sessão expirou. Volta a entrar." }, 401);
    const sb = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: pode } = await sb.rpc("pode_encomendas");
    if (!pode) return json({ erro: "Só a Logística, quem fatura e a direção tratam dos envios." }, 403);

    const corpo = await req.json().catch(() => ({}));
    const acao = String(corpo.acao || "");

    // estado de todos os envios em curso (chamado quando a Logística abre as encomendas)
    if (acao === "atualizar") {
      const { data: l } = await admin.from("log_encomendas").select("id, numero, estado, nacex").not("nacex", "is", null).not("estado", "in", "(entregue,cancelada)").limit(60);
      let mudaram = 0;
      for (const e of l || []) { try { if (await estado(e)) mudaram++; } catch { /* segue para o próximo */ } }
      return json({ ok: true, vistos: (l || []).length, mudaram });
    }

    const { data: e } = await admin.from("log_encomendas").select("*").eq("id", String(corpo.id || "")).maybeSingle();
    if (!e) return json({ erro: "Encomenda não encontrada." }, 404);
    const nx = (e.nacex || {}) as Record<string, any>;

    if (acao === "criar") {
      if (nx.expe_codigo) return json({ erro: "Esta encomenda já tem envio na Nacex (" + nx.albaran + "). Cancela-o primeiro se quiseres criar outro." }, 409);
      if (e.estado === "cancelada") return json({ erro: "A encomenda está cancelada." }, 400);
      const del = env("NACEX_DELEGACAO"), cli = env("NACEX_CLIENTE");
      if (!del || !cli) return json({ erro: "Faltam a agência e o código de cliente da Nacex (NACEX_DELEGACAO e NACEX_CLIENTE) nos Secrets da função «nacex»." }, 400);
      const v = (e.envio || {}) as Record<string, any>;
      const cp = limpo(v.cp || (String(e.morada || "").match(/\b\d{4}-\d{3}\b/) || [""])[0], 15);
      const morada = limpo(String(v.morada || e.morada || "").replace(/,?\s*\d{4}-\d{3}.*$/, ""), 60);
      const localidade = limpo(v.localidade || (String(e.morada || "").match(/\d{4}-\d{3}\s+(.+)$/) || [])[1] || "", 40);
      const tel = limpo(v.telefone || e.contacto || v.telemovel, 20);
      const falta = [!morada && "morada", !cp && "código postal", !localidade && "localidade", !tel && "telefone"].filter(Boolean);
      if (falta.length) return json({ erro: "Faltam dados de envio: " + falta.join(", ") + ". Corrige a ficha do cliente ou a encomenda." }, 400);
      const { data: cfg } = await admin.from("com_config").select("nacex_servico").eq("id", 1).maybeSingle();
      const volumes = Math.min(99, Math.max(1, parseInt(corpo.volumes) || 1));
      const peso = Math.min(999, Math.max(0.1, parseFloat(String(corpo.peso || "1").replace(",", ".")) || 1));
      const dados: Record<string, string> = {
        del_cli: del, num_cli: cli, fec: hojeNacex(), tip_ser: limpo(cfg?.nacex_servico || v.servico || "27", 2),
        tip_cob: "O", tip_env: "2", ref_cli: limpo(ref(e) + (e.fatura_numero ? " " + e.fatura_numero : ""), 30),
        bul: String(volumes).padStart(3, "0"), kil: peso.toFixed(1),
        nom_ent: limpo(v.nome || e.cliente_nome, 50), dir_ent: morada, pais_ent: "PT", cp_ent: cp, pob_ent: localidade, tel_ent: tel,
        movil_ent: limpo(v.telemovel, 20), email_ent: limpo(v.email, 50), obs1: limpo(corpo.obs || "", 38),
        etiqueta: "S", modelo: "PDF_B", seguimiento: "S",
      };
      const r = (await chamar("putExpedicion", dados)).split("|");
      if (!/^\d+$/.test(r[0] || "")) throw new Error("Resposta inesperada da Nacex: " + r.slice(0, 3).join(" | ").slice(0, 200));
      const albaran = r[1] || "";
      const novo = {
        expe_codigo: r[0], albaran, cor: r[2] || "", rota: r[3] || "", agencia_entrega: r[5] || "", servico: r[7] || "", prazo: r[8] || "",
        codigo_barras: r[9] || "", data_prevista: r[10] || "", seguimento: (r.find((x) => /^https?:\/\//.test(x)) || "").replace(/&amp;/g, "&"),
        volumes, peso, teste: /\/9{6,}$/.test(albaran), criado_em: new Date().toISOString(), criado_por: sessao.user.id,
        estado: "DOCUMENTADO", estado_em: null,
      };
      const pdf = r.length > 13 ? r[r.length - 1] : "";
      await admin.from("log_encomendas").update({ nacex: novo, tracking: albaran, transportadora: "nacex" }).eq("id", e.id);
      return json({ ok: true, nacex: novo, pdf: pdf && pdf.length > 100 ? b64(pdf) : null });
    }

    if (!nx.expe_codigo) return json({ erro: "Esta encomenda ainda não tem envio criado na Nacex." }, 400);

    if (acao === "etiqueta") {
      const r = await chamar("getEtiqueta", { codExp: nx.expe_codigo, modelo: "PDF_B" });
      return json({ ok: true, pdf: b64(r.split("|").pop() || r) });
    }
    if (acao === "estado") {
      await estado(e);
      const { data: d } = await admin.from("log_encomendas").select("nacex, estado").eq("id", e.id).single();
      return json({ ok: true, nacex: d?.nacex, estado: d?.estado });
    }
    if (acao === "cancelar") {
      const r = await chamar("cancelExpedicion", { expe_codigo: nx.expe_codigo });
      await admin.from("log_encomendas").update({ nacex: null, tracking: "" }).eq("id", e.id);
      return json({ ok: true, mensagem: r });
    }
    return json({ erro: "Ação desconhecida." }, 400);
  } catch (err) {
    return json({ erro: (err as Error)?.message || String(err) }, 500);
  }
});

// Consulta o estado na Nacex e acerta a encomenda: em trânsito → «em rota»; entregue (OK) → «entregue»
async function estado(e: { id: string; estado: string; nacex: Record<string, any> }) {
  const nx = e.nacex || {};
  const r = (await chamar("getEstadoExpedicion", { expe_codigo: nx.expe_codigo })).split("|");
  const est = (r[4] || "").toUpperCase();
  if (!est) return false;
  const novo = { ...nx, estado: est, estado_data: [r[1], r[2]].filter(Boolean).join(" "), estado_obs: r[3] && r[3] !== "-" ? r[3] : "", estado_codigo: r[5] || "", estado_em: new Date().toISOString() };
  const campos: Record<string, unknown> = { nacex: novo };
  if (est === "OK" && ["pronta", "em_rota"].includes(e.estado)) campos.estado = "entregue";
  else if (["RECOGIDO", "TRANSITO", "REPARTO"].includes(est) && e.estado === "pronta") campos.estado = "em_rota";
  const mudou = est !== nx.estado || "estado" in campos;
  if (mudou || !nx.estado_em) await admin.from("log_encomendas").update(campos).eq("id", e.id);
  return mudou;
}
