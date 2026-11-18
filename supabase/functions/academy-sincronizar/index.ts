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
// Cada chamada pode durar até 150 s. Só se começa uma ação nova até aos 70 s e, se uma ação passar dos 125 s,
// pára sem gravar essa ação e a chamada seguinte recomeça nela (a Secretaria Online às vezes demora 2 s por página).
const LIMITE_MS = Number(Deno.env.get("FORINSIA_LIMITE_MS") || 70000);
const PRAZO_MS = Number(Deno.env.get("FORINSIA_PRAZO_MS") || 125000);
class Interrompido extends Error {}

// Só estes cliques são permitidos: entrar, escolher o perfil, pesquisar ações, abrir os formandos de uma ação e abrir a ficha de um formando
const PERMITIDOS = [
  /^ctl00\$ContentPlaceHolderNew\$Autenticacao1\$lnkAutenticar$/,
  /^ctl00\$ContentPlaceHolderNew\$Autenticacao1\$lnkAutAdministrador$/,
  /^ctl00\$ContentPlaceHolder2\$seleccionarAccao\$ctl01$/,
  /^ctl00\$ContentPlaceHolder2\$seleccionarAccao\$rptAccoesPorCaracterizacao\$\d+\$LinkButton4$/,
  /^ctl00\$ContentPlaceHolder2\$seleccionarAccao\$rptAccoesPorCaracterizacao\$\d+\$LinkButton9$/, // relatório de assiduidade (só consulta)
  /^ctl00\$ContentPlaceHolder2\$processosAccao\$rptProcessos\$\d+\$Linkbutton2$/,
];

type Pagina = { url: string; html: string };
// O tempo de processador de cada chamada é curto (2 s no Supabase): as páginas lêem-se com expressões simples, sem montar a árvore HTML.

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
        if (parar?.(atual)) return { url: atual, html: "" };
        continue;
      }
      if (!r.ok) { await r.body?.cancel(); throw new Error("A Secretaria Online respondeu com o erro " + r.status + "."); }
      return { url: atual, html: await r.text() };
    }
    throw new Error("A Secretaria Online redirecionou demasiadas vezes.");
  }
  // um clique numa ligação da página (__doPostBack), só dos permitidos
  clicar(p: Pagina, alvo: string, mudar: Record<string, string> = {}, tirar: string[] = [], parar?: (destino: string) => boolean) {
    if (!PERMITIDOS.some((re) => re.test(alvo))) throw new Error("Clique não permitido: " + alvo);
    const d = { ...campos(p.html), ...mudar };
    for (const t of tirar) delete d[t];
    d.__EVENTTARGET = alvo; d.__EVENTARGUMENT = "";
    return this.pedir(p.url, d, parar);
  }
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", atilde: "ã", otilde: "õ", ccedil: "ç", acirc: "â", ecirc: "ê", ocirc: "ô", agrave: "à",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Atilde: "Ã", Otilde: "Õ", Ccedil: "Ç", Acirc: "Â", Ecirc: "Ê", Ocirc: "Ô", Agrave: "À", ordm: "º", ordf: "ª" };
const ent = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] ?? m));
function atributos(tag: string) {
  const a: Record<string, string> = {}, re = /([^\s=\/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  const corpo = tag.replace(/^<\s*[a-z0-9]+/i, "").replace(/\/?>$/, "");
  let m; while ((m = re.exec(corpo))) a[m[1].toLowerCase()] = ent(m[2] ?? m[3] ?? m[4] ?? "");
  return a;
}
// texto visível de um pedaço de HTML (com espaços entre as partes)
const texto = (h: string) => ent(h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
// os campos do formulário da página (o que o navegador enviaria num clique)
function campos(html: string) {
  const d: Record<string, string> = {};
  for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
    const a = atributos(m[0]), n = a.name, t = (a.type || "text").toLowerCase();
    if (!n || ["image", "submit", "button", "file", "reset"].includes(t)) continue;
    if (t === "checkbox" || t === "radio") { if ("checked" in a) d[n] = a.value || "on"; continue; }
    d[n] = a.value ?? "";
  }
  for (const m of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const n = atributos("<select" + m[1] + ">").name; if (!n) continue;
    const ops = [...m[2].matchAll(/<option\b[^>]*>/gi)].map((o) => atributos(o[0]));
    const o = ops.find((x) => "selected" in x) || ops[0];
    d[n] = o ? o.value ?? "" : "";
  }
  for (const m of html.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi)) { const n = atributos("<textarea" + m[1] + ">").name; if (n) d[n] = ent(m[2]); }
  return d;
}
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const valor = (html: string, id: string) => { const m = html.match(new RegExp('<input\\b[^>]*\\bid="' + reEsc(id) + '"[^>]*>', "i")); return m ? (atributos(m[0]).value || "").trim() : ""; };
function opcaoEscolhida(html: string, id: string) {
  const m = html.match(new RegExp('<select\\b[^>]*\\bid="' + reEsc(id) + '"[^>]*>([\\s\\S]*?)</select>', "i"));
  if (!m) return null;
  const o = m[1].match(/<option\b[^>]*\bselected\b[^>]*>([^<]*)/i);
  return o ? { valor: atributos(o[0].slice(0, o[0].indexOf(">") + 1)).value || "", texto: texto(o[1]) } : null;
}
// linhas de tabela (com as células de cada uma), respeitando tabelas dentro de células
function linhas(html: string) {
  const out: { attrs: Record<string, string>; cel: string[] }[] = [];
  const pilha: { attrs: Record<string, string>; cel: string[]; td: number }[] = [];
  for (const m of html.matchAll(/<(\/?)(tr|td|th)\b[^>]*>/gi)) {
    const fecho = m[1] === "/", tag = m[2].toLowerCase(), topo = pilha[pilha.length - 1];
    if (tag === "tr") {
      if (!fecho) pilha.push({ attrs: atributos(m[0]), cel: [], td: -1 });
      else if (topo) { if (topo.td >= 0) topo.cel.push(html.slice(topo.td, m.index)); out.push({ attrs: topo.attrs, cel: topo.cel }); pilha.pop(); }
    } else if (topo) {
      if (!fecho) { if (topo.td >= 0) topo.cel.push(html.slice(topo.td, m.index)); topo.td = m.index! + m[0].length; }
      else if (topo.td >= 0) {
        // fecha a célula aberta da linha atual
        topo.cel.push(html.slice(topo.td, m.index)); topo.td = -1;
      }
    }
  }
  return out;
}
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
  if (r.html.includes("lnkAutAdministrador")) r = await s.clicar(r, PA + "lnkAutAdministrador");
  const l = await s.pedir(LISTA);
  if (/autenticacao/i.test(l.url) || /name="[^"]*txtUser"/i.test(l.html)) throw new Error("A Secretaria Online não aceitou o utilizador ou a palavra-passe. Se a palavra-passe mudou, atualiza o segredo FORINSIA_PALAVRA_PASSE no Supabase.");
  return { s, l };
}
// todas as ações (incluindo concluídas e canceladas)
async function listarAccoes(s: Sessao, l: Pagina) {
  const p = await s.clicar(l, PL + "ctl01", {}, [ESCONDER]);
  const out: any[] = [], vistos = new Set<string>();
  for (const tr of linhas(p.html)) {
    if (tr.cel.length < 10) continue;
    const m = tr.cel.join(" ").match(/rptAccoesPorCaracterizacao\$(\d+)\$lnkSeleccion/);
    if (!m || vistos.has(m[1])) continue;
    vistos.add(m[1]);
    const t = tr.cel.map(texto);
    out.push({ id: m[1], externo_id: m[1], ano: t[0], curso: t[3], nome: t[4].replace(/^Acção\s+(?=Ação)/i, "").trim() || "Ação " + m[1], local: t[6], inicio: data(t[7]), estado: t[8].replace(/\s*Motivo.*$/i, "").trim(), estado_em: data(t[9]) });
  }
  if (!out.length) throw new Error("Não encontrei ações na Secretaria Online (a página pode ter mudado).");
  return { pagina: p, accoes: out };
}
// idade (em anos completos) numa data, a partir dos campos de nascimento da ficha; a data em si não sai daqui
function idadeEm(html: string, quando: string): number | null {
  const v = (k: string) => Number(opcaoEscolhida(html, PP + "dataNascimento_ddl" + k)?.valor || 0);
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
  for (const tr of linhas(p.html)) {
    if (tr.cel.length !== 5) continue;
    const tds = tr.cel.map(texto);
    if (!/^\d+$/.test(tds[0]) || !/^\d+$/.test(tds[3]) || !/^\d+$/.test(tds[4])) continue;
    const m = tds[1].match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?$/i);
    const horas = m ? (+(m[1] || 0) + +(m[2] || 0) / 60) : 0, pres = +tds[3], form = +tds[4];
    if (!horas || !form || !pres) continue; // sessão ainda sem presenças registadas
    previstas += horas * form; presentes += horas * Math.min(pres, form); sessoes++;
  }
  return previstas ? { assiduidade: Math.round((presentes / previstas) * 1000) / 10, assid_sessoes: sessoes } : null;
}

async function lerAccao(s: Sessao, lista: Pagina, a: any, conhecidos: Map<string, any>, jaTemos: Set<string>, ate: number) {
  const id = a.id;
  const p = await s.clicar(lista, PL + "rptAccoesPorCaracterizacao$" + id + "$LinkButton4", {}, [ESCONDER]);
  if (!/GerirProcessos/i.test(p.url) || !new RegExp("idAccao=" + id + "(\\D|$)").test(p.url)) throw new Error("Não consegui abrir os formandos da ação " + id + ".");
  const rows: { n: string; nome: string; desistente: boolean }[] = [], vistos = new Set<string>();
  for (const tr of linhas(p.html)) {
    const m = (tr.attrs.id || "").match(/rptProcessos_(\d+)_row$/);
    if (!m || vistos.has(m[1])) continue;
    vistos.add(m[1]);
    const h = tr.cel.join(" ");
    const lk = h.match(/<a\b[^>]*\bid="[^"]*_Linkbutton2"[^>]*>([\s\S]*?)<\/a>/i), img = h.match(/<img\b[^>]*\bid="[^"]*_Image2"[^>]*>/i);
    rows.push({ n: m[1], nome: lk ? texto(lk[1]) : "", desistente: !!img && !/cross/i.test(atributos(img[0]).src || "") });
  }
  const inscricoes: any[] = [];
  for (const l of rows) {
    if (Date.now() > ate) throw new Interrompido();
    // a ficha de quem já está na Central só se abre na sincronização completa
    const f = await s.clicar(p, "ctl00$ContentPlaceHolder2$processosAccao$rptProcessos$" + l.n + "$Linkbutton2", {}, [], (u) => jaTemos.has(u.match(/idUtilizador=(\d+)/)?.[1] || ""));
    const m = f.url.match(/idUtilizador=(\d+)/);
    if (!m) continue;
    const idade = f.html && a.inicio ? idadeEm(f.html, a.inicio) : null;
    if (f.html && !conhecidos.has(m[1])) {
      const cp = valor(f.html, PP + "codigopostaluc1_txtcp");
      conhecidos.set(m[1], {
        externo_id: m[1], nome: (valor(f.html, PP + "TxtNome") || l.nome).slice(0, 200), pais: opcaoEscolhida(f.html, PP + "codigopostaluc1_ddlPais")?.texto || "",
        cp4: /^\d{4}$/.test(cp) ? cp : "", localidade: valor(f.html, PP + "codigopostaluc1_txtLocalidade"),
        concelho: valor(f.html, PP + "codigopostaluc1_txtConcelho"), distrito: valor(f.html, PP + "codigopostaluc1_txtDistrito"),
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
    let inscricoes;
    try { inscricoes = await lerAccao(s, pagina, a, conhecidos, o.jaTemos || new Set(), inicio + PRAZO_MS); }
    catch (e) { if (e instanceof Interrompido) return { ...total, continuar_de: a.id, pedidos: s.pedidos }; throw e; }
    const assid = /cancel/i.test(a.estado) || Date.now() - inicio > PRAZO_MS ? null : await lerAssiduidade(s, pagina, a.id).catch(() => null);
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
