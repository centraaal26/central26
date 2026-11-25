// Central 26 · woo
// Liga a loja online da TwentySix (WooCommerce) à Central:
//   · lê as encomendas do site (de 10 em 10 minutos, pelo relógio da base de dados, ou quando se carrega em «Sincronizar agora»);
//   · cada encomenda paga passa para a Logística, com tarefa de faturar para quem fatura (woo_criar_encomenda);
//   · com o envio criado na Nacex, conclui a encomenda no site e manda ao cliente a nota com o seguimento;
//   · guarda as vendas do site, sem nomes nem contactos, para o CRM (woo_encomendas).
// As chaves ficam só nos Secrets da função (nunca no código):
//   WOO_URL      endereço do site (https://twentysix.pt)
//   WOO_CHAVE    chave do consumidor (ck_…)
//   WOO_SEGREDO  segredo do consumidor (cs_…)
// O relógio entra com o segredo_webhook; o resto exige sessão da direção ou de quem trata de encomendas.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-segredo",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (corpo: unknown, estado = 200) => new Response(JSON.stringify(corpo), { status: estado, headers: { ...cors, "Content-Type": "application/json" } });

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const env = (k: string) => (Deno.env.get(k) || "").trim();
type Obj = Record<string, any>;

// texto vindo do site: sem controlo, sem espaços a mais e com tamanho máximo
const txt = (v: unknown, max = 200) => String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const num = (v: unknown) => { const n = parseFloat(String(v ?? "")); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const data = (v: unknown) => { const s = String(v || ""); if (!s) return null; const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z"); return isNaN(+d) ? null : d.toISOString(); };

// ---------- pedidos ao WooCommerce ----------
let modoQuery = false; // alguns alojamentos tiram o cabeçalho Authorization: aí as chaves vão no endereço
async function woo(metodo: string, caminho: string, params: Obj = {}, corpo?: unknown): Promise<{ dados: any; total: number; paginas: number }> {
  const base = env("WOO_URL").replace(/\/+$/, ""), ck = env("WOO_CHAVE"), cs = env("WOO_SEGREDO");
  if (!base || !ck || !cs) throw new Error("Faltam as chaves da loja online (WOO_URL, WOO_CHAVE e WOO_SEGREDO) nos Secrets da função «woo».");
  if (!/^https:\/\//i.test(base)) throw new Error("O WOO_URL tem de começar por https://");
  const tentar = async (query: boolean) => {
    const u = new URL(base + "/wp-json/wc/v3/" + caminho);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
    const h: Record<string, string> = { "User-Agent": "Central26/1.0", Accept: "application/json" };
    if (query) { u.searchParams.set("consumer_key", ck); u.searchParams.set("consumer_secret", cs); }
    else h.Authorization = "Basic " + btoa(ck + ":" + cs);
    if (corpo !== undefined) h["Content-Type"] = "application/json";
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
    try { return await fetch(u, { method: metodo, headers: h, body: corpo === undefined ? undefined : JSON.stringify(corpo), signal: ctl.signal }); }
    catch { throw new Error("O site não respondeu. Tenta daqui a pouco."); }
    finally { clearTimeout(t); }
  };
  let r = await tentar(modoQuery);
  if (r.status === 401 && !modoQuery) { await r.body?.cancel(); modoQuery = true; r = await tentar(true); }
  const texto = await r.text();
  let dados: any = null; try { dados = JSON.parse(texto); } catch { /* resposta que não é JSON */ }
  if (!r.ok) {
    const msg = dados?.message ? txt(dados.message, 200) : "erro " + r.status;
    if (r.status === 401 || r.status === 403) throw new Error("O site recusou as chaves (" + msg + "). Confirma a chave e o segredo e se a chave tem permissão de Leitura/Escrita.");
    if (r.status === 404) throw new Error("O site não tem a API do WooCommerce neste endereço. Confirma o WOO_URL.");
    throw new Error("O site respondeu com um erro: " + msg);
  }
  if (dados === null) throw new Error("O site devolveu uma resposta inesperada (não é JSON). Pode haver um plugin de segurança ou de cache a bloquear a API.");
  return { dados, total: parseInt(r.headers.get("x-wp-total") || "0") || 0, paginas: parseInt(r.headers.get("x-wp-totalpages") || "1") || 1 };
}

// ---------- produtos ----------
async function mapaProdutos(): Promise<Map<number, string | null>> {
  const { data: l } = await admin.from("woo_produtos").select("woo_id, produto_codigo");
  return new Map((l || []).map((x: Obj) => [Number(x.woo_id), x.produto_codigo]));
}
async function atualizarProdutos() {
  let pagina = 1, n = 0;
  for (;;) {
    const { dados, paginas } = await woo("GET", "products", { per_page: 100, page: pagina, status: "any" });
    const linhas = (dados as Obj[]).map((p) => ({ woo_id: Number(p.id), nome: txt(p.name, 160), preco: p.price === "" || p.price == null ? null : num(p.price) }));
    if (linhas.length) { const { error } = await admin.from("woo_produtos").upsert(linhas, { onConflict: "woo_id", ignoreDuplicates: false }); if (error) throw new Error(error.message); }
    n += linhas.length;
    if (pagina >= paginas || pagina >= 20) break;
    pagina++;
  }
  return n;
}

// ---------- encomendas ----------
function moradaDe(o: Obj) {
  const s = o.shipping?.address_1 ? o.shipping : o.billing || {};
  const linha = [txt(s.address_1, 120), txt(s.address_2, 80)].filter(Boolean).join(" ");
  const cp = txt(s.postcode, 12), loc = txt(s.city, 60);
  return { morada: [linha, [cp, loc].filter(Boolean).join(" ")].filter(Boolean).join(", "), cp, loc, s };
}
function nomeDe(o: Obj) {
  const s = o.shipping?.first_name || o.shipping?.last_name ? o.shipping : o.billing || {};
  return txt([s.first_name, s.last_name].filter(Boolean).join(" "), 120) || txt(s.company || o.billing?.company, 120);
}

async function guardarEncomenda(o: Obj, mapa: Map<number, string | null>, cfg: Obj) {
  const m = moradaDe(o);
  const itens = ((o.line_items || []) as Obj[]).map((i) => {
    const pid = Number(i.product_id) || 0;
    if (pid && !mapa.has(pid)) mapa.set(pid, null);
    return { woo_id: pid, nome: txt(i.name, 120), qtd: Math.max(1, parseInt(i.quantity) || 1), total: num(num(i.total) + num(i.total_tax)), produto_codigo: mapa.get(pid) || null };
  });
  const novos = itens.filter((i) => i.woo_id && !i.produto_codigo).map((i) => ({ woo_id: i.woo_id, nome: i.nome }));
  if (novos.length) await admin.from("woo_produtos").upsert(novos, { onConflict: "woo_id", ignoreDuplicates: true });

  const linha = {
    woo_id: Number(o.id), numero: txt(o.number || o.id, 20), estado: txt(o.status, 20),
    criada_em: data(o.date_created_gmt || o.date_created), paga_em: data(o.date_paid_gmt || o.date_paid),
    total: num(o.total), portes: num(num(o.shipping_total) + num(o.shipping_tax)), desconto: num(num(o.discount_total) + num(o.discount_tax)),
    pagamento: txt(o.payment_method_title, 60), cp: m.cp, localidade: m.loc,
    itens: itens.map(({ woo_id, nome, qtd, total }) => ({ woo_id, nome, qtd, total })), atualizado_em: new Date().toISOString(),
  };
  const { error } = await admin.from("woo_encomendas").upsert(linha, { onConflict: "woo_id" });
  if (error) throw new Error(error.message);

  const { data: ja } = await admin.from("woo_encomendas").select("encomenda_id, tarefa_id").eq("woo_id", linha.woo_id).maybeSingle();
  let criada = false, cancelada = false;
  // paga depois de a ligação ser ativada → Logística
  if (!ja?.encomenda_id && cfg.ativo && cfg.desde && linha.estado === "processing" && linha.paga_em && linha.paga_em >= cfg.desde) {
    const tel = txt(m.s.phone || o.billing?.phone, 40);
    const { error: e2 } = await admin.rpc("woo_criar_encomenda", { p: {
      woo_id: linha.woo_id, numero: linha.numero, nome: nomeDe(o), contacto: tel, telemovel: tel, morada: m.morada, email: txt(o.billing?.email, 120),
      nota: txt(o.customer_note, 500), pagamento: linha.pagamento, total: linha.total, portes: linha.portes, itens,
    } });
    if (e2) throw new Error(e2.message);
    criada = true;
  }
  // cancelada ou reembolsada no site antes de seguir → cancela na Central (o envio na Nacex é cancelado pela base de dados)
  if (ja?.encomenda_id && ["cancelled", "refunded", "failed"].includes(linha.estado)) {
    const { data: e } = await admin.from("log_encomendas").select("id, numero, estado, notas").eq("id", ja.encomenda_id).maybeSingle();
    if (e && ["nova", "em_preparacao", "pronta"].includes(e.estado)) {
      await admin.from("log_encomendas").update({ estado: "cancelada", notas: (e.notas ? e.notas + "\n" : "") + "Cancelada automaticamente: a encomenda #" + linha.numero + " foi " + (linha.estado === "refunded" ? "reembolsada" : "cancelada") + " no site." }).eq("id", e.id);
      if (ja.tarefa_id) await admin.from("tarefas").delete().eq("id", ja.tarefa_id).neq("estado", "concluido");
      const { data: pessoas } = await admin.from("perfis").select("id").eq("ativo", true).eq("departamento_id", "logistica");
      const ref = "E-" + String(e.numero).padStart(4, "0");
      if (pessoas?.length) await admin.from("notificacoes").insert(pessoas.map((p: Obj) => ({ destinatario_id: p.id, tipo: "encomenda", titulo: "Encomenda " + ref + " cancelada no site", corpo: "Loja online · #" + linha.numero + (e.estado === "pronta" ? " · já estava pronta: volta a arrumar os artigos" : ""), link: "#encomenda-" + e.id })));
      cancelada = true;
    }
  }
  return { criada, cancelada };
}

async function sincronizar(cfg: Obj) {
  const mapa = await mapaProdutos();
  const desde = new Date(cfg.ultima_sinc ? Date.parse(cfg.ultima_sinc) - 15 * 60000 : Date.now() - 3 * 86400000).toISOString().replace(/\.\d+Z$/, "");
  let pagina = 1, vistas = 0, criadas = 0, canceladas = 0;
  const inicio = new Date().toISOString();
  for (;;) {
    const { dados, paginas } = await woo("GET", "orders", { per_page: 50, page: pagina, modified_after: desde, dates_are_gmt: "true", orderby: "modified", order: "asc" });
    for (const o of dados as Obj[]) { const r = await guardarEncomenda(o, mapa, cfg); vistas++; if (r.criada) criadas++; if (r.cancelada) canceladas++; }
    if (pagina >= paginas || pagina >= 10) break;
    pagina++;
  }
  await admin.from("woo_config").update({ ultima_sinc: inicio, ultimo_ok: inicio, ultimo_erro: "" }).eq("id", 1);
  return { vistas, criadas, canceladas };
}

// com envio na Nacex (ou já entregue), conclui no site e manda o seguimento ao cliente
async function concluir(cfg: Obj) {
  if (!cfg.concluir_no_site) return 0;
  const { data: l } = await admin.from("woo_encomendas").select("woo_id, numero, encomenda_id").eq("concluida_site", false).not("encomenda_id", "is", null).limit(30);
  let n = 0;
  for (const w of l || []) {
    const { data: e } = await admin.from("log_encomendas").select("estado, nacex, transportadora").eq("id", w.encomenda_id).maybeSingle();
    if (!e || e.estado === "cancelada") continue;
    const nx = (e.nacex || {}) as Obj;
    const enviado = nx.albaran && !nx.teste;
    if (!enviado && e.estado !== "entregue") continue;
    if (enviado) {
      const link = nx.seguimento || ("https://www.nacex.com/seguimientoDetalle.do?agencia_origen=" + String(nx.albaran).split("/")[0] + "&numero_albaran=" + String(nx.albaran).split("/")[1] + "&externo=N");
      await woo("POST", "orders/" + w.woo_id + "/notes", {}, { note: "A sua encomenda foi enviada pela Nacex (" + nx.albaran + "). Pode acompanhar a entrega aqui: " + link, customer_note: true });
    }
    await woo("PUT", "orders/" + w.woo_id, {}, { status: "completed" });
    await admin.from("woo_encomendas").update({ concluida_site: true, estado: "completed" }).eq("woo_id", w.woo_id);
    n++;
  }
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não suportado." }, 405);
  const corpo = await req.json().catch(() => ({}));
  const acao = String(corpo.acao || "");
  const lerCfg = async () => (await admin.from("woo_config").select("*").eq("id", 1).single()).data || {};
  try {
    // relógio da base de dados (de 10 em 10 minutos, só com a ligação ativa)
    if (acao === "tique") {
      const { data: s } = await admin.from("configuracao_privada").select("valor").eq("chave", "segredo_webhook").maybeSingle();
      if (!s?.valor || req.headers.get("x-segredo") !== s.valor) return json({ erro: "Não autorizado." }, 401);
      const cfg = await lerCfg();
      if (!cfg.ativo) return json({ ok: true, desligada: true });
      const r = await sincronizar(cfg);
      const concluidas = await concluir(cfg);
      return json({ ok: true, ...r, concluidas });
    }

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: sessao } = await admin.auth.getUser(token);
    if (!sessao?.user) return json({ erro: "A sessão expirou. Volta a entrar." }, 401);
    const sb = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false, autoRefreshToken: false } });
    const [{ data: gestor }, { data: enc }] = await Promise.all([sb.rpc("e_gestor"), sb.rpc("pode_encomendas")]);
    if (!gestor && !enc) return json({ erro: "Só a direção e quem trata de encomendas usam a ligação à loja online." }, 403);

    if (acao === "testar") {
      const [o, p] = await Promise.all([woo("GET", "orders", { per_page: 1 }), woo("GET", "products", { per_page: 1, status: "any" })]);
      return json({ ok: true, encomendas: o.total, produtos: p.total });
    }
    if (acao === "produtos") return json({ ok: true, produtos: await atualizarProdutos() });
    if (acao === "sincronizar") {
      const cfg = await lerCfg();
      const r = await sincronizar(cfg);
      const concluidas = await concluir(cfg);
      return json({ ok: true, ...r, concluidas });
    }
    // histórico para o CRM: só guarda as vendas (não cria encomendas na Logística); de página em página
    if (acao === "historico") {
      if (!gestor) return json({ erro: "Só a direção importa o histórico." }, 403);
      const pagina = Math.max(1, parseInt(corpo.pagina) || 1);
      const depois = /^\d{4}-\d{2}-\d{2}$/.test(String(corpo.desde || "")) ? corpo.desde + "T00:00:00" : "2024-01-01T00:00:00";
      const mapa = await mapaProdutos();
      const semLogistica = { ativo: false };
      let p = pagina, vistas = 0, paginas = 1, seguinte: number | null = null;
      const fim = Date.now() + 90000;
      do {
        const r = await woo("GET", "orders", { per_page: 100, page: p, after: depois, dates_are_gmt: "true", orderby: "date", order: "asc" });
        paginas = r.paginas;
        for (const o of r.dados as Obj[]) { await guardarEncomenda(o, mapa, semLogistica); vistas++; }
        seguinte = p < paginas ? p + 1 : null;
        p++;
      } while (seguinte && Date.now() < fim);
      return json({ ok: true, vistas, paginas, seguinte });
    }
    return json({ erro: "Ação desconhecida." }, 400);
  } catch (err) {
    const msg = (err as Error)?.message || String(err);
    if (acao === "tique" || acao === "sincronizar") await admin.from("woo_config").update({ ultimo_erro: txt(msg, 300) }).eq("id", 1);
    return json({ erro: msg }, 500);
  }
});
