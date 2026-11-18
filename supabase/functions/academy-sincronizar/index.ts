// Central 26 · academy-sincronizar
// Vai buscar à Secretaria Online da 26 Academy (Forinsia) as ações, os formandos de cada ação e a residência de cada
// formando, e atualiza a Academy na Central. SÓ LÊ: nunca carrega em botões que mudem dados na Secretaria Online.
// - Chamada pela base de dados duas vezes por dia (acao "tique", com o segredo partilhado).
// - Chamada pela app (direção e Administrativo): "agora" (ações novas, a decorrer ou que mudaram de estado)
//   ou "completa" (todas as ações e todas as fichas). Se o tempo não chegar, devolve «continuar_de» e a app pede o resto;
//   no relógio, a chamada seguinte continua onde a anterior ficou.
// Segredos (Supabase → Edge Functions → Secrets): FORINSIA_UTILIZADOR e FORINSIA_PALAVRA_PASSE.
// Guarda só o nome, o n.º da Secretaria Online, a residência (país, código postal, localidade, concelho, distrito)
// e as inscrições, a idade de cada formando no início de cada ação (a data de nascimento não é guardada) e a
// assiduidade de cada ação. Não lê documentos de identificação, NIF nem contactos.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { DOMParser } from "jsr:@b-fuze/deno-dom@0.1.49";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-segredo",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (corpo: unknown, estado = 200) =>
  new Response(JSON.stringify(corpo), { status: estado, headers: { ...cors, "Content-Type": "application/json" } });

const BASE = (Deno.env.get("FORINSIA_URL") || "https://formacao.26academy.pt").replace(/\/+$/, "");
const HOST = new URL(BASE).host;
const LISTA = BASE + "/Admin/Utilizadores/ListarAccoes.aspx";
const AUT = BASE + "/autenticacao.aspx?redirectTo=%2fAdmin%2fUtilizadores%2fListarAccoes.aspx";
const PL = "ctl00$ContentPlaceHolder2$seleccionarAccao$";
const PA = "ctl00$ContentPlaceHolderNew$Autenticacao1$";
const PP = "ctl00_ContentPlaceHolder2_perfilGeral_";
const ESCONDER = PL + "cbxHideConclCancel";
const LIMITE_MS = Number(Deno.env.get("FORINSIA_LIMITE_MS") || 100000);

// Só estes cliques são permitidos: entrar, escolher o perfil, pesquisar ações, abrir os formandos de uma ação e abrir a ficha de um formando
const PERMITIDOS = [
  /^ctl00\$ContentPlaceHolderNew\$Autenticacao1\$lnkAutenticar$/,
  /^ctl00\$ContentPlaceHolderNew\$Autenticacao1\$lnkAutAdministrador$/,
  /^ctl00\$ContentPlaceHolder2\$seleccionarAccao\$ctl01$/,
  /^ctl00\$ContentPlaceHolder2\$seleccionarAccao\$rptAccoesPorCaracterizacao\$\d+\$LinkButton4$/,
  /^ctl00\$ContentPlaceHolder2\$seleccionarAccao\$rptAccoesPorCaracterizacao\$\d+\$LinkButton9$/, // relatório de assiduidade (só consulta)
  /^ctl00\$ContentPlaceHolder2\$processosAccao\$rptProcessos\$\d+\$Linkbutton2$/,
];

type Pagina = { url: string; doc: any };

class Sessao {
  cookies = new Map<string, string>();
  pedidos = 0;
  // «parar» permite ficar só a saber para onde a página manda (sem a abrir)
  async pedir(url: string, form?: Record<string, string>, parar?: (destino: string) => boolean): Promise<Pagina> {
    let atual = url, metodo = form ? "POST" : "GET", corpo: string | undefined = form ? new URLSearchParams(form).toString() : undefined;
    for (let i = 0; i < 6; i++) {
      if (new URL(atual).host !== HOST) throw new Error("A Secretaria Online mandou para outro endereço.");
      const h: Record<string, string> = { "User-Agent": "Central26-Academy/1.0 (leitura)", "Accept-Language": "pt-PT" };
      if (this.cookies.size) h.Cookie = [...this.cookies].map(([k, v]) => k + "=" + v).join("; ");
      if (corpo) h["Content-Type"] = "application/x-www-form-urlencoded";
      const r = await fetch(atual, { method: metodo, body: corpo, headers: h, redirect: "manual", signal: AbortSignal.timeout(30000) });
      this.pedidos++;
      for (const c of r.headers.getSetCookie()) {
        const par = c.split(";")[0], k = par.indexOf("=");
        if (k > 0) this.cookies.set(par.slice(0, k).trim(), par.slice(k + 1).trim());
      }
      const loc = r.headers.get("location");
      if (r.status >= 300 && r.status < 400 && loc) {
        await r.body?.cancel(); atual = new URL(loc, atual).href; metodo = "GET"; corpo = undefined;
        if (parar?.(atual)) return { url: atual, doc: null };
        continue;
      }
      if (!r.ok) { await r.body?.cancel(); throw new Error("A Secretaria Online respondeu com o erro " + r.status + "."); }
      const html = await r.text();
      return { url: atual, doc: new DOMParser().parseFromString(html, "text/html") };
    }
    throw new Error("A Secretaria Online redirecionou demasiadas vezes.");
  }
  // um clique numa ligação da página (__doPostBack), só dos permitidos
  clicar(p: Pagina, alvo: string, mudar: Record<string, string> = {}, tirar: string[] = [], parar?: (destino: string) => boolean) {
    if (!PERMITIDOS.some((re) => re.test(alvo))) throw new Error("Clique não permitido: " + alvo);
    const d = { ...campos(p.doc), ...mudar };
    for (const t of tirar) delete d[t];
    d.__EVENTTARGET = alvo; d.__EVENTARGUMENT = "";
    return this.pedir(p.url, d, parar);
  }
}

function campos(doc: any) {
  const d: Record<string, string> = {};
  for (const i of doc.querySelectorAll("input")) {
    const n = i.getAttribute("name"), t = (i.getAttribute("type") || "text").toLowerCase();
    if (!n || ["image", "submit", "button", "file", "reset"].includes(t)) continue;
    if (t === "checkbox" || t === "radio") { if (i.hasAttribute("checked")) d[n] = i.getAttribute("value") || "on"; continue; }
    d[n] = i.getAttribute("value") ?? "";
  }
  for (const s of doc.querySelectorAll("select")) {
    const n = s.getAttribute("name"); if (!n) continue;
    const o = s.querySelector("option[selected]") || s.querySelector("option");
    d[n] = o ? o.getAttribute("value") ?? "" : "";
  }
  for (const t of doc.querySelectorAll("textarea")) { const n = t.getAttribute("name"); if (n) d[n] = t.textContent || ""; }
  return d;
}
// texto de um elemento com espaços entre as partes (como se vê no ecrã)
function texto(el: any): string {
  const partes: string[] = [];
  const andar = (n: any) => { for (const c of n.childNodes) { if (c.nodeType === 3) partes.push(c.textContent); else if (c.nodeType === 1) andar(c); } };
  andar(el);
  return partes.join(" ").replace(/\s+/g, " ").trim();
}
const valor = (doc: any, id: string) => (doc.getElementById(id)?.getAttribute("value") ?? "").trim();
const escolhido = (doc: any, id: string) => { const s = doc.getElementById(id); const o = s?.querySelector("option[selected]"); return o ? texto(o) : ""; };
const MESES: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
function data(s: string) {
  const m = String(s || "").match(/^(\d{1,2})-([a-zç]{3})-(\d{2,4})$/i);
  if (!m || !MESES[m[2].toLowerCase()]) return "";
  const a = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  return a + "-" + String(MESES[m[2].toLowerCase()]).padStart(2, "0") + "-" + m[1].padStart(2, "0");
}

async function entrar(utilizador: string, palavra: string) {
  const s = new Sessao();
  const p = await s.pedir(AUT);
  let r = await s.clicar(p, PA + "lnkAutenticar", { [PA + "txtUser"]: utilizador, [PA + "TxtPwd"]: palavra });
  if (r.doc.querySelector('a[href*="lnkAutAdministrador"]')) r = await s.clicar(r, PA + "lnkAutAdministrador");
  const l = await s.pedir(LISTA);
  if (/autenticacao/i.test(l.url) || l.doc.querySelector('input[name$="txtUser"]')) throw new Error("A Secretaria Online não aceitou o utilizador ou a palavra-passe. Se a palavra-passe mudou, atualiza o segredo FORINSIA_PALAVRA_PASSE no Supabase.");
  return { s, l };
}
// todas as ações (incluindo concluídas e canceladas)
async function listarAccoes(s: Sessao, l: Pagina) {
  const p = await s.clicar(l, PL + "ctl01", {}, [ESCONDER]);
  const out: any[] = [];
  for (const tr of p.doc.querySelectorAll("tr")) {
    const tds = [...tr.children].filter((e: any) => e.tagName === "TD");
    if (tds.length < 10) continue;
    const lk = tr.querySelector('a[href*="lnkSeleccion"]');
    const m = lk?.getAttribute("href")?.match(/rptAccoesPorCaracterizacao\$(\d+)\$lnkSeleccion/);
    if (!m) continue;
    const t = tds.map(texto);
    out.push({ id: m[1], externo_id: m[1], ano: t[0], curso: t[3], nome: t[4].replace(/^Acção\s+(?=Ação)/i, "").trim() || "Ação " + m[1], local: t[6], inicio: data(t[7]), estado: t[8].replace(/\s*Motivo.*$/i, "").trim(), estado_em: data(t[9]) });
  }
  if (!out.length) throw new Error("Não encontrei ações na Secretaria Online (a página pode ter mudado).");
  return { pagina: p, accoes: out };
}
// formandos de uma ação, com a residência de cada um
// idade (em anos completos) numa data, a partir dos campos de nascimento da ficha; a data em si não sai daqui
function idadeEm(doc: any, quando: string): number | null {
  const v = (k: string) => Number(doc.getElementById(PP + "dataNascimento_ddl" + k)?.querySelector("option[selected]")?.getAttribute("value") || 0);
  const a = v("Ano"), m = v("Mes"), d = v("Dia");
  if (!a || !m || !d || !/^\d{4}-\d{2}-\d{2}$/.test(quando)) return null;
  const [qa, qm, qd] = quando.split("-").map(Number);
  const idade = qa - a - (qm < m || (qm === m && qd < d) ? 1 : 0);
  return idade >= 10 && idade <= 99 ? idade : null;
}
// assiduidade da ação: % das horas com presença, só nas sessões que já têm presenças registadas
async function lerAssiduidade(s: Sessao, lista: Pagina, id: string) {
  const p = await s.clicar(lista, PL + "rptAccoesPorCaracterizacao$" + id + "$LinkButton9", {}, [ESCONDER]);
  if (!/RelatorioAssiduidade/i.test(p.url)) return null;
  let previstas = 0, presentes = 0, sessoes = 0;
  for (const tr of p.doc.querySelectorAll("tr")) {
    const tds = [...tr.children].filter((e: any) => e.tagName === "TD").map(texto);
    if (tds.length !== 5 || !/^\d+$/.test(tds[0]) || !/^\d+$/.test(tds[3]) || !/^\d+$/.test(tds[4])) continue;
    const m = tds[1].match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?$/i);
    const horas = m ? (+(m[1] || 0) + +(m[2] || 0) / 60) : 0, pres = +tds[3], form = +tds[4];
    if (!horas || !form || !pres) continue; // sessão ainda sem presenças registadas
    previstas += horas * form; presentes += horas * Math.min(pres, form); sessoes++;
  }
  return previstas ? { assiduidade: Math.round((presentes / previstas) * 1000) / 10, assid_sessoes: sessoes } : null;
}

async function lerAccao(s: Sessao, lista: Pagina, a: any, conhecidos: Map<string, any>, jaTemos: Set<string>) {
  const id = a.id;
  const p = await s.clicar(lista, PL + "rptAccoesPorCaracterizacao$" + id + "$LinkButton4", {}, [ESCONDER]);
  if (!/GerirProcessos/i.test(p.url) || !new RegExp("idAccao=" + id + "(\\D|$)").test(p.url)) throw new Error("Não consegui abrir os formandos da ação " + id + ".");
  const linhas: { n: string; nome: string; desistente: boolean }[] = [];
  for (const tr of p.doc.querySelectorAll("tr")) {
    const m = (tr.getAttribute("id") || "").match(/rptProcessos_(\d+)_row$/);
    if (!m) continue;
    const img = tr.querySelector('img[id$="_Image2"]');
    linhas.push({ n: m[1], nome: texto(tr.querySelector('a[id$="_Linkbutton2"]') || tr), desistente: !!img && !/cross/i.test(img.getAttribute("src") || "") });
  }
  const inscricoes: any[] = [];
  for (const l of linhas) {
    // a ficha de quem já está na Central só se abre na sincronização completa
    const f = await s.clicar(p, "ctl00$ContentPlaceHolder2$processosAccao$rptProcessos$" + l.n + "$Linkbutton2", {}, [], (u) => jaTemos.has(u.match(/idUtilizador=(\d+)/)?.[1] || ""));
    const m = f.url.match(/idUtilizador=(\d+)/);
    if (!m) continue;
    const idade = f.doc && a.inicio ? idadeEm(f.doc, a.inicio) : null;
    if (f.doc && !conhecidos.has(m[1])) {
      const cp = valor(f.doc, PP + "codigopostaluc1_txtcp");
      conhecidos.set(m[1], {
        externo_id: m[1], nome: (valor(f.doc, PP + "TxtNome") || l.nome).slice(0, 200), pais: escolhido(f.doc, PP + "codigopostaluc1_ddlPais"),
        cp4: /^\d{4}$/.test(cp) ? cp : "", localidade: valor(f.doc, PP + "codigopostaluc1_txtLocalidade"),
        concelho: valor(f.doc, PP + "codigopostaluc1_txtConcelho"), distrito: valor(f.doc, PP + "codigopostaluc1_txtDistrito"),
      });
    }
    inscricoes.push({ formacao: id, formando: m[1], desistente: l.desistente, idade });
  }
  return inscricoes;
}

// Leitura completa ou parcial. «precisa» diz que ações reler; «aGuardar» grava o que já foi lido (ação a ação)
export async function sincronizar(o: { utilizador: string; palavra: string; precisa: (a: any) => boolean; aPartirDe?: string; jaTemos?: Set<string>; aGuardar: (p: any) => Promise<any> }) {
  const inicio = Date.now();
  const { s, l } = await entrar(o.utilizador, o.palavra);
  const { pagina, accoes } = await listarAccoes(s, l);
  const total = { accoes: accoes.length, lidas: 0, formandos_novos: 0, formandos_atualizados: 0, inscricoes: 0, inscricoes_removidas: 0, formacoes_novas: 0 };
  const somar = (r: any) => { if (!r) return; total.formandos_novos += r.formandos_novos || 0; total.formandos_atualizados += r.formandos_atualizados || 0; total.inscricoes += r.inscricoes || 0; total.inscricoes_removidas += r.inscricoes_removidas || 0; total.formacoes_novas += r.formacoes_novas || 0; };
  // primeiro os dados de todas as ações (estado, datas…)
  somar(await o.aGuardar({ formacoes: accoes, formandos: [], inscricoes: [], substituir: [] }));
  const porLer = accoes.filter(o.precisa).sort((a, b) => +a.id - +b.id).filter((a) => !o.aPartirDe || +a.id >= +o.aPartirDe);
  for (const a of porLer) {
    if (Date.now() - inicio > LIMITE_MS) return { ...total, continuar_de: a.id, pedidos: s.pedidos };
    const conhecidos = new Map<string, any>();
    const inscricoes = await lerAccao(s, pagina, a, conhecidos, o.jaTemos || new Set());
    const assid = /cancel/i.test(a.estado) ? null : await lerAssiduidade(s, pagina, a.id).catch(() => null);
    const r = await o.aGuardar({ formacoes: assid ? [{ ...a, ...assid }] : [], formandos: [...conhecidos.values()], inscricoes, substituir: [a.id] });
    total.lidas++; somar({ ...r, formacoes_novas: 0 });
  }
  return { ...total, pedidos: s.pedidos };
}

let adminCache: any = null;
const admin = () => (adminCache ||= createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } }));

async function avisarDirecao(titulo: string, corpo: string) {
  const { data } = await admin().from("perfis").select("id").in("papel", ["ceo", "admin"]).eq("ativo", true);
  if (data?.length) await admin().from("notificacoes").insert(data.map((p: any) => ({ destinatario_id: p.id, tipo: "academy", titulo, corpo, link: "#academy-importar" })));
}

async function correr(modo: "tique" | "agora" | "completa", aPartirDe?: string) {
  const utilizador = Deno.env.get("FORINSIA_UTILIZADOR"), palavra = Deno.env.get("FORINSIA_PALAVRA_PASSE");
  const { data: antes } = await admin().from("aca_config").select("sinc_ok, sinc_ativa, sinc_em, sinc_continuar_de").eq("id", 1).maybeSingle();
  if (modo === "tique") {
    if (antes?.sinc_ativa === false) return { desligada: true };
    // o relógio chama várias vezes seguidas: continua onde ficou, ou não faz nada se a última leitura é recente
    if (antes?.sinc_continuar_de) aPartirDe = antes.sinc_continuar_de;
    else if (antes?.sinc_ok && antes.sinc_em && Date.now() - new Date(antes.sinc_em).getTime() < 5 * 3600e3) return { recente: true };
  }
  try {
    if (!utilizador || !palavra) throw new Error("Faltam os segredos FORINSIA_UTILIZADOR e FORINSIA_PALAVRA_PASSE no Supabase (Edge Functions → Secrets).");
    const { data: db, error } = await admin().from("aca_formacoes").select("externo_id, estado").not("externo_id", "is", null);
    if (error) throw new Error(error.message);
    const estados = new Map((db || []).map((f: any) => [String(f.externo_id), f.estado || ""]));
    const jaTemos = new Set<string>();
    if (modo !== "completa") {
      for (let de = 0; ; de += 1000) {
        const { data: l, error: e2 } = await admin().from("aca_formandos").select("externo_id").not("externo_id", "is", null).range(de, de + 999);
        if (e2) throw new Error(e2.message);
        l.forEach((x: any) => jaTemos.add(String(x.externo_id)));
        if (l.length < 1000) break;
      }
    }
    const r = await sincronizar({
      utilizador, palavra, aPartirDe, jaTemos,
      // releem-se as ações novas, as que mudaram de estado e as que não estão concluídas nem canceladas
      precisa: (a) => modo === "completa" || !estados.has(a.id) || estados.get(a.id) !== a.estado || !/conclu|cancel/i.test(a.estado),
      aGuardar: async (p) => {
        const { data, error } = await admin().rpc("aca_importar", { p: { fonte: "Secretaria Online (sincronização)", ...p } });
        if (error) throw new Error(error.message);
        return data;
      },
    });
    const partes = [r.lidas + (r.lidas === 1 ? " ação lida" : " ações lidas") + " de " + r.accoes, r.formandos_novos ? r.formandos_novos + (r.formandos_novos === 1 ? " formando novo" : " formandos novos") : "", r.inscricoes_removidas ? r.inscricoes_removidas + " inscrições retiradas" : ""].filter(Boolean);
    const cont = (r as any).continuar_de || null;
    if (modo === "tique") await admin().from("aca_config").update({ sinc_continuar_de: cont }).eq("id", 1);
    if (!cont) await admin().from("aca_config").update({ sinc_em: new Date().toISOString(), sinc_ok: true, sinc_msg: partes.join(" · ") }).eq("id", 1);
    return r;
  } catch (e) {
    const msg = String((e as Error)?.message || e).slice(0, 400);
    await admin().from("aca_config").update({ sinc_em: new Date().toISOString(), sinc_ok: false, sinc_msg: msg, sinc_continuar_de: null }).eq("id", 1);
    if (modo === "tique" && antes?.sinc_ok !== false) await avisarDirecao("A ligação à Secretaria Online falhou", msg.slice(0, 160));
    throw e;
  }
}

if (!Deno.env.get("ACADEMY_TESTE")) Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não suportado." }, 405);
  try {
    const corpo = await req.json().catch(() => ({}));
    if (corpo.acao === "tique") {
      const { data } = await admin().from("configuracao_privada").select("valor").eq("chave", "segredo_webhook").maybeSingle();
      if (!data || req.headers.get("x-segredo") !== data.valor) return json({ erro: "Não autorizado." }, 401);
      return json({ ok: true, ...(await correr("tique")) });
    }
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: sessao } = await admin().auth.getUser(token);
    if (!sessao?.user) return json({ erro: "A sessão expirou. Volta a entrar." }, 401);
    const { data: eu } = await admin().from("perfis").select("papel, departamento_id, ativo").eq("id", sessao.user.id).maybeSingle();
    if (!eu?.ativo || !(["ceo", "admin"].includes(eu.papel) || eu.departamento_id === "administrativo")) return json({ erro: "Sem acesso à Academy." }, 403);
    if (corpo.acao === "agora" || corpo.acao === "completa") {
      const a = corpo.continuar_de ? String(corpo.continuar_de).replace(/\D/g, "") : undefined;
      return json({ ok: true, ...(await correr(corpo.acao, a)) });
    }
    return json({ erro: "Ação desconhecida." }, 400);
  } catch (e) {
    return json({ erro: String((e as Error)?.message || e).slice(0, 400) }, 500);
  }
});
