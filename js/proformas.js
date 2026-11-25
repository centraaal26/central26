// Central 26 — Proformas da TwentySix: escalões de preço, proforma para o cliente, tarefa para faturar e passagem à Logística.
// Os preços vivem na base de dados (Comercial → Proformas → Tabela de preços); aqui não há preços.
import { eGestor, normalizar, haQuanto, ymd, MES } from "./dados.js";

export const ESCALOES = ["base", "pro6", "pro12", "pvd30", "pvd40", "pvd50"];
const PROXIMO = { base: "pro6", pro6: "pro12", pvd30: "pvd40", pvd40: "pvd50" };
const EST = { rascunho: ["Rascunho", "e-lead"], enviada: ["Enviada ao cliente", "e-contactado"], aceite: ["Aceite · por faturar", "e-proposta"], faturada: ["Faturada", "e-cliente"], cancelada: ["Cancelada", "e-perdido"] };
const PARC = { "": "Sem parceria", embaixador: "Embaixador", influencer: "Influencer" };
const ENVIO = { nacex: "Envio pela Nacex", entrega: "Entrega nossa", levanta: "O cliente levanta" };
const CAMPOS_CLIENTE = [["nome", "Nome"], ["nif", "NIF"], ["morada", "Morada"], ["cp", "Código postal"], ["localidade", "Localidade"], ["telefone", "Telefone"], ["telemovel", "Telemóvel"], ["email", "Email"]];
const CAMPOS_EMPRESA = [["nome", "Nome da empresa"], ["nif", "NIF"], ["morada", "Morada"], ["cp", "Código postal e localidade"], ["telefone", "Telefone"], ["email", "Email"], ["iban", "IBAN"]];

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const eur2 = (v) => (Number(v) || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const eur0 = (v) => (Number(v) || 0).toLocaleString("pt-PT", { maximumFractionDigits: 0 }) + " €";
const pct = (v) => (Number(v) || 0).toLocaleString("pt-PT", { maximumFractionDigits: 1 }) + "%";
const lerNum = (t) => { const s = String(t ?? "").replace(/\s|€|%/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."); if (s === "") return null; const n = Number(s); return Number.isFinite(n) ? n : NaN; };
const numIn = (v) => (v == null ? "" : String(r2(v)).replace(".", ","));
export const refPf = (p) => "PF-" + String(p?.numero ?? "").padStart(4, "0");

export function totais(p) {
  const sub = r2((p.itens || []).reduce((s, i) => s + r2(Math.max(0, +i.qtd || 0) * Math.max(0, +i.preco || 0)), 0));
  // desconto de parceria (embaixador ou influencer): não acumula com os escalões, só conta no preço Base
  const ativa = p.parceria !== undefined ? !!p.parceria && p.escalao === "base" : !!p.embaixador;
  const emb = ativa ? +p.desc_embaixador || 0 : 0, desc = +p.desconto || 0;
  const aposEmb = sub * (1 - emb / 100), base = r2(aposEmb * (1 - desc / 100)), iva = r2(base * (+p.iva || 0) / 100);
  return { sub, descEmb: r2(sub - aposEmb), descExtra: r2(aposEmb - base), base, iva, total: r2(base + iva), unidades: (p.itens || []).reduce((s, i) => s + (+i.qtd || 0), 0) };
}

export function criarProformas(ctx) {
  const { S, api, esc, I, toast, falha, render, renderPainel, abrir, nomeDe, ativos, podeCrm } = ctx;
  const P = (S.pf = { estado: "por-carregar", precos: {}, config: null, proformas: {}, sub: "lista", filtro: "abertas", q: "", colar: null });
  let desligar = null;
  const timers = {};

  /* ---------- permissões ---------- */
  const eFat = () => !!S.eu && P.config?.faturador === S.eu.id;
  const podeVer = () => podeCrm(S.eu) || eFat();
  const podeFaturar = () => eGestor(S.eu) || eFat();
  const editavel = (p) => p && ["rascunho", "enviada"].includes(p.estado) && podeCrm(S.eu);
  const cfg = () => P.config || { iva: 23, validade_dias: 15, desconto_embaixador: 0, desconto_influencer: 5, patamares: { pro6: 6000, pro12: 12000, pvd40: 3000, pvd50: 5000 }, patamar_por: "encomenda", empresa: {}, nacex_servico: "27" };
  const pctPar = (k) => (k === "embaixador" ? +cfg().desconto_embaixador || 0 : k === "influencer" ? +(cfg().desconto_influencer ?? 5) || 0 : 0);
  const nomePar = (k) => (k ? PARC[k] + " (−" + pct(pctPar(k)) + ")" : PARC[""]);
  const pat = () => ({ pro6: 6000, pro12: 12000, pvd40: 3000, pvd50: 5000, ...(cfg().patamares || {}) });
  function nomeEsc(k) {
    const l = pat();
    return { base: "Base (preço profissional)", pro6: "PRO " + eur0(l.pro6), pro12: "PRO " + eur0(l.pro12), pvd30: "Distribuidor PVD30", pvd40: "Distribuidor PVD40", pvd50: "Distribuidor PVD50" }[k] || k;
  }
  const curtoEsc = (k) => ({ base: "Base", pro6: "PRO " + eur0(pat().pro6), pro12: "PRO " + eur0(pat().pro12), pvd30: "PVD30", pvd40: "PVD40", pvd50: "PVD50" })[k] || k;
  const COLS = () => [["base", "Base"], ["pro6", curtoEsc("pro6")], ["pro12", curtoEsc("pro12")], ["pvd30", "PVD30"], ["pvd40", "PVD40"], ["pvd50", "PVD50"], ["prvp", "PRVP"]];

  /* ---------- dados ---------- */
  async function carregar() {
    if (P.estado === "a-carregar") return;
    P.estado = "a-carregar";
    try {
      const d = await api.com.carregar();
      P.precos = Object.fromEntries(d.precos.map((x) => [x.produto_codigo, x]));
      P.custos = Object.fromEntries((d.custos || []).map((x) => [x.produto_codigo, +x.custo]));
      P.config = d.config; P.proformas = Object.fromEntries(d.proformas.map((x) => [x.id, x]));
      P.estado = "pronto";
      if (!desligar && api.com.subscrever) desligar = api.com.subscrever(aoMudar);
    } catch (e) {
      P.estado = "erro";
      P.erro = /PGRST205|Could not find the table|com_(precos|config|proformas)|does not exist/i.test(String(e?.message)) ? "falta-script" : e.message;
    }
    render(); if (S.aberto && /^pf-|^proforma$/.test(S.aberto.tipo)) renderPainel(true);
  }
  function aoMudar(ev, novo, antigo) {
    if (ev === "DELETE") delete P.proformas[antigo.id]; else P.proformas[novo.id] = { ...P.proformas[novo.id], ...novo };
    render(); if (S.aberto?.tipo === "proforma") renderPainel();
  }
  const garantir = () => { if (P.estado === "por-carregar") carregar(); };

  const produto = (cod) => S.crm?.produtos?.[cod];
  const descDe = (cod) => produto(cod)?.descricao || cod;
  const precoDe = (cod, esc) => { const t = P.precos[cod]; if (!t) return null; return t[esc] ?? t.base ?? null; };
  const temPreco = (cod, esc) => P.precos[cod]?.[esc] != null;
  function catalogo() {
    return Object.values(P.precos).filter((t) => t.base != null || t.pro6 != null || t.pvd30 != null)
      .map((t) => ({ cod: t.produto_codigo, desc: descDe(t.produto_codigo), t }))
      .sort((a, b) => (a.t.ordem || 0) - (b.t.ordem || 0) || a.desc.localeCompare(b.desc, "pt"));
  }
  const lista = () => Object.values(P.proformas).sort((a, b) => (b.numero || 0) - (a.numero || 0));
  const doCliente = (cid) => lista().filter((p) => p.cliente_id === cid);

  // compras do cliente nos últimos 12 meses (para o patamar contado por ano)
  function comprasAno(cid) {
    const c = S.crm?.clientes?.[cid]; if (!c?.codigo_multixop || !S.crm?.vendas?.length) return 0;
    const desde = ymd(new Date(Date.now() - 365 * 864e5));
    return S.crm.vendas.reduce((s, v) => s + (v.cliente_codigo === c.codigo_multixop && v.data >= desde ? +v.valor : 0), 0);
  }

  /* ---------- gravação ---------- */
  function guardar(id, campos, ms = 700) {
    const p = P.proformas[id]; if (!p) return;
    Object.assign(p, campos);
    p._pend = { ...(p._pend || {}), ...campos };
    clearTimeout(timers[id]);
    timers[id] = setTimeout(async () => {
      const envio = p._pend; p._pend = null;
      try { const r = await api.com.atualizar(id, envio); if (r) P.proformas[id] = { ...r, _pend: P.proformas[id]?._pend || null }; render(); }
      catch (e) { falha(e); carregar(); }
    }, ms);
  }
  async function guardarJa(id) {
    const p = P.proformas[id]; if (!p?._pend) return;
    clearTimeout(timers[id]); const envio = p._pend; p._pend = null;
    const r = await api.com.atualizar(id, envio); if (r) P.proformas[id] = r;
  }
  function redesenhar() {
    const sc = document.querySelector("#painel-root .p-scroll"), top = sc?.scrollTop || 0;
    renderPainel(true);
    const n = document.querySelector("#painel-root .p-scroll"); if (n) n.scrollTop = top;
  }

  async function nova(cid) {
    garantir();
    const c = S.crm?.clientes?.[cid];
    if (!c) { toast("Escolhe o cliente.", true); return; }
    if (P.estado !== "pronto") await carregar();
    if (P.estado !== "pronto") { toast(P.erro === "falta-script" ? "Falta correr o ficheiro supabase/24-proformas-nacex.sql no Supabase." : "Não foi possível abrir as proformas.", true); return; }
    const k = cfg(), validade = new Date(Date.now() + (k.validade_dias || 15) * 864e5);
    try {
      const r = await api.com.criar({
        cliente_id: c.id, escalao: c.escalao || "base", parceria: c.parceria || "", desc_embaixador: pctPar(c.parceria || ""), iva: +k.iva, validade: ymd(validade), envio: "nacex",
        cliente: { nome: c.nome, nif: c.nif || "", morada: c.morada || "", cp: c.codigo_postal || "", localidade: c.concelho || "", telefone: c.telefone || "", telemovel: "", email: c.email || "" } });
      P.proformas[r.id] = r; render();
      abrir({ tipo: "proforma", id: r.id });
    } catch (e) { falha(e); }
  }

  /* ============================== Vistas ============================== */
  function vista() {
    garantir();
    if (P.estado === "erro") {
      if (P.erro === "falta-script") return '<div class="vazio"><h3>Falta instalar as proformas na base de dados</h3><p>No Supabase, abre o SQL Editor, cola o ficheiro <b>supabase/24-proformas-nacex.sql</b> do GitHub e carrega em Run. Depois recarrega esta página.</p></div>';
      return '<div class="aviso erro">Não foi possível carregar as proformas: ' + esc(P.erro) + ' <button class="btn sec" data-acao="pf-recarregar">Tentar outra vez</button></div>';
    }
    if (P.estado !== "pronto") return '<div class="tabela">' + [1, 2, 3].map((i) => '<div class="esqueleto"><i style="width:' + (30 + i * 14) + '%"></i></div>').join("") + "</div>";
    const subs = [["lista", "Proformas"], ["precos", "Tabela de preços"]];
    if (eGestor(S.eu)) subs.push(["definicoes", "Definições"]);
    let h = '<div class="barra"><div class="seg" role="group" aria-label="Mostrar">' + subs.map(([k, r]) => '<button data-acao="pf-sub" data-v="' + k + '" aria-pressed="' + (P.sub === k) + '">' + r + "</button>").join("") + "</div>" +
      (P.sub === "lista" && podeCrm(S.eu) ? '<button class="btn pri" data-acao="pf-escolher">' + I.plus + "Nova proforma</button>" : "") + "</div>";
    if (P.sub === "precos") return h + vistaPrecos();
    if (P.sub === "definicoes" && eGestor(S.eu)) return h + vistaDefinicoes();
    return h + vistaLista();
  }

  function vistaLista() {
    const l = lista(), mes = ymd(new Date()).slice(0, 7);
    const n = (e) => l.filter((p) => p.estado === e).length;
    const fatMes = l.filter((p) => p.estado === "faturada" && (p.faturada_em || "").slice(0, 7) === mes);
    let h = '<div class="resumo-crm">' +
      [["rascunho", "Rascunhos", n("rascunho")], ["enviada", "À espera do cliente", n("enviada")], ["aceite", "Por faturar", n("aceite")]].map(([k, r, v]) =>
        '<button class="kpi' + (k === "aceite" && v ? " alerta-kpi" : "") + '" data-acao="pf-filtro" data-v="' + k + '"><span>' + r + "</span><b>" + v + "</b></button>").join("") +
      '<div class="kpi"><span>Faturado este mês</span><b>' + eur0(fatMes.reduce((s, p) => s + +p.total_sem_iva, 0)) + "</b><small>" + fatMes.length + " proforma" + (fatMes.length === 1 ? "" : "s") + " · sem IVA</small></div></div>";
    const aceites = l.filter((p) => p.estado === "aceite");
    if (podeFaturar() && aceites.length) {
      h += '<section class="pf-faturar"><h3>' + I.nota + "Para faturar no Multixop</h3><p class=\"muted\">Cria a fatura no Multixop e escreve aqui o número. A encomenda passa logo para a Logística.</p>" +
        aceites.map((p) => '<form class="pf-fat-linha" id="pf-fat-' + p.id + '" data-id="' + p.id + '"><button type="button" class="c-link" data-acao="pf-abrir" data-id="' + p.id + '"><b>' + refPf(p) + "</b> · " + esc(p.cliente?.nome || "—") + '</button><span class="mono">' + eur2(p.total_sem_iva) + ' s/ IVA</span>' +
          '<label class="sr" for="pf-fatnum-' + p.id + '">N.º da fatura</label><input class="inp mini" id="pf-fatnum-' + p.id + '" placeholder="N.º da fatura" autocomplete="off"><button class="btn pri" type="submit">Faturada</button></form>').join("") + "</section>";
    }
    if (!podeCrm(S.eu)) return h + (aceites.length ? "" : '<p class="muted">Não há proformas à espera de fatura.</p>');
    const F = { abertas: ["rascunho", "enviada", "aceite"], faturadas: ["faturada"], todas: null, rascunho: ["rascunho"], enviada: ["enviada"], aceite: ["aceite"] };
    const q = normalizar(P.q || "");
    let ver = l.filter((p) => !F[P.filtro] || F[P.filtro].includes(p.estado));
    if (q) ver = ver.filter((p) => normalizar([refPf(p), p.cliente?.nome, p.fatura_numero].join(" ")).includes(q));
    h += '<div class="barra"><div class="seg" role="group" aria-label="Filtrar">' + [["abertas", "Abertas"], ["faturadas", "Faturadas"], ["todas", "Todas"]].map(([k, r]) => '<button data-acao="pf-filtro" data-v="' + k + '" aria-pressed="' + (P.filtro === k || (k === "abertas" && ["rascunho", "enviada", "aceite"].includes(P.filtro))) + '">' + r + "</button>").join("") + "</div>" +
      '<label class="pesq">' + I.lupa + '<span class="sr">Procurar</span><input id="pf-q" type="search" placeholder="Cliente ou número" value="' + esc(P.q || "") + '" autocomplete="off"></label></div>';
    if (!ver.length) return h + '<div class="vazio"><h3>' + (l.length ? "Nada com este filtro" : "Ainda não há proformas") + "</h3><p>" + (l.length ? "Muda o filtro acima." : "Abre a ficha de um cliente e carrega em <b>Proforma</b>, ou usa o botão <b>Nova proforma</b>.") + "</p></div>";
    h += '<div class="tabela-scroll"><table class="crm-tabela pf-tab"><thead><tr><th>Proforma</th><th>Cliente</th><th>Escalão</th><th class="n">Unid.</th><th class="n">Total s/ IVA</th><th>Estado</th></tr></thead><tbody>' +
      ver.map((p) => { const t = totais(p);
        return '<tr data-acao="pf-abrir" data-id="' + p.id + '" tabindex="0"><td><b class="mono">' + refPf(p) + "</b><small>" + esc(nomeDe(p.criado_por) || "—") + " · " + haQuanto(p.criado_em) + "</small></td><td>" + esc(p.cliente?.nome || "—") + (p.fatura_numero ? "<small>" + esc(p.fatura_numero) + "</small>" : "") + "</td><td>" + esc(curtoEsc(p.escalao)) + (p.parceria ? " <small>" + esc(PARC[p.parceria].toLowerCase()) + "</small>" : "") + '</td><td class="n">' + t.unidades + '</td><td class="n">' + eur2(p.total_sem_iva) + '</td><td><span class="etapa ' + EST[p.estado][1] + '">' + EST[p.estado][0] + "</span></td></tr>"; }).join("") +
      "</tbody></table></div>";
    return h;
  }

  function vistaPrecos() {
    const g = eGestor(S.eu);
    const prods = Object.values(S.crm?.produtos || {}).filter((x) => x.linha === "produtos");
    const q = normalizar(P.qp || "");
    const ver = prods.filter((x) => !q || normalizar(x.codigo + " " + x.descricao).includes(q))
      .sort((a, b) => (P.precos[a.codigo] ? 0 : 1) - (P.precos[b.codigo] ? 0 : 1) || (P.precos[a.codigo]?.ordem || 0) - (P.precos[b.codigo]?.ordem || 0) || a.descricao.localeCompare(b.descricao, "pt"));
    const l = pat();
    let h = '<div class="aviso"><span>Preços por unidade, <b>sem IVA</b>. <b>' + esc(curtoEsc("pro6")) + "</b> e <b>" + esc(curtoEsc("pro12")) + "</b> aplicam-se a partir desses valores" +
      "; distribuidores: PVD40 a partir de " + eur0(l.pvd40) + " e PVD50 a partir de " + eur0(l.pvd50) + " (" + (cfg().patamar_por === "ano" ? "compras dos últimos 12 meses" : "valor de cada encomenda") + "). " +
      "O PRVP é o preço recomendado ao público e serve para mostrar a margem do cliente." + (g ? " Só aparecem nas proformas os produtos com preço." : "") + "</span></div>";
    if (!prods.length) return h + '<div class="vazio"><h3>Ainda não há produtos</h3><p>Os produtos vêm do SAF-T do Multixop (Comercial → Importar).</p></div>';
    if (g) h += blocoColar();
    h += '<div class="barra"><label class="pesq">' + I.lupa + '<span class="sr">Procurar produto</span><input id="pf-qp" type="search" placeholder="Procurar produto" value="' + esc(P.qp || "") + '" autocomplete="off"></label><span class="muted">' + Object.keys(P.precos).length + " com preço · " + prods.length + " produtos</span></div>";
    h += '<div class="tabela-scroll"><table class="crm-tabela pf-precos"><thead><tr><th>Produto</th>' + COLS().map(([, r]) => '<th class="n">' + r + "</th>").join("") + "</tr></thead><tbody>" +
      ver.map((x) => { const t = P.precos[x.codigo] || {};
        return "<tr><td>" + esc(x.descricao) + '<small class="mono">' + esc(x.codigo) + "</small></td>" + COLS().map(([k, r]) => '<td class="n">' + (g
          ? '<label class="sr" for="pp-' + esc(x.codigo) + "-" + k + '">' + r + " de " + esc(x.descricao) + '</label><input class="crm-custo" id="pp-' + esc(x.codigo) + "-" + k + '" data-pf-preco="' + esc(x.codigo) + '" data-col="' + k + '" inputmode="decimal" value="' + numIn(t[k]) + '" placeholder="—">'
          : t[k] != null ? eur2(t[k]) : "—") + "</td>").join("") + "</tr>"; }).join("") + "</tbody></table></div>";
    return h;
  }

  /* --- colar a tabela de uma folha ou apresentação --- */
  function blocoColar() {
    const c = P.colar;
    let h = '<details class="pf-colar"' + (c ? " open" : "") + "><summary>Colar a tabela de preços de uma folha de cálculo</summary>" +
      '<p class="muted">Copia as linhas da tabela (nome do produto e preços) e cola aqui. A Central procura cada produto pelo nome e mostra o que encontrou antes de gravar.</p>' +
      '<div class="campos-2"><div class="campo"><label for="pf-colar-fmt">As colunas são</label><select id="pf-colar-fmt">' +
      [["pro", "Produto · Base · " + curtoEsc("pro6") + " · " + curtoEsc("pro12") + " · PRVP"], ["pvd", "Produto · PVD30 · PVD40 · PVD50 · PVP (=Base) · PRVP"]].map(([k, r]) => '<option value="' + k + '"' + ((c?.fmt || "pro") === k ? " selected" : "") + ">" + r + "</option>").join("") + "</select></div></div>" +
      '<div class="campo"><label for="pf-colar-txt">Linhas</label><textarea id="pf-colar-txt" rows="6" placeholder="Exemplo: Produto 100ML	9,97€	37%	8,71€	45%	7,13€	55%	15,84€">' + esc(c?.txt || "") + "</textarea><span class=\"ajuda\">As percentagens são ignoradas.</span></div>" +
      '<div class="acts"><button class="btn sec" data-acao="pf-colar-ler">Ler linhas</button></div>';
    if (c?.linhas) {
      const okL = c.linhas.filter((x) => x.cod);
      h += '<div class="tabela-scroll"><table class="crm-tabela"><thead><tr><th>Linha colada</th><th>Produto encontrado</th><th class="n">Preços</th></tr></thead><tbody>' +
        c.linhas.map((x) => "<tr><td>" + esc(x.nome) + "</td><td>" + (x.cod ? esc(descDe(x.cod)) + '<small class="mono">' + esc(x.cod) + "</small>" : x.repetido ? '<span class="at">Parece «' + esc(x.repetido) + '», que já ficou com outra linha: preenche à mão</span>' : '<span class="at">Não encontrado: preenche à mão</span>') + '</td><td class="n">' + esc(Object.entries(x.v).map(([k, v]) => (COLS().find((y) => y[0] === k)?.[1] || k) + " " + eur2(v)).join(" · ")) + "</td></tr>").join("") +
        "</tbody></table></div>" + '<div class="acts"><button class="btn pri" data-acao="pf-colar-gravar"' + (okL.length ? "" : " disabled") + ">Gravar " + okL.length + " produto" + (okL.length === 1 ? "" : "s") + '</button><button class="btn sec" data-acao="pf-colar-limpar">Limpar</button></div>';
    }
    return h + "</details>";
  }
  const chaves = (s) => normalizar(String(s)).replace(/(\d+)\s*(ml|gr|g)\b/g, "$1$2").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 1);
  function lerColagem(txt, fmt) {
    const prods = Object.values(S.crm?.produtos || {}).filter((x) => x.linha === "produtos");
    const ordem = fmt === "pvd" ? ["pvd30", "pvd40", "pvd50", "base", "prvp"] : ["base", "pro6", "pro12", "prvp"];
    const linhas = String(txt).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const cel = l.split(/\t|\s{2,}|\|/).map((x) => x.trim()).filter(Boolean);
      let nome = cel[0] || "";
      let nums = cel.slice(1).filter((x) => !/%\s*$/.test(x)).map(lerNum).filter((n) => n != null && !Number.isNaN(n));
      if (cel.length === 1) { // separado por espaços simples: os números ficam no fim
        const m = l.match(/^(.*?)((?:\s+\d+(?:[.,]\d+)?\s*€?(?:\s+\d+(?:[.,]\d+)?\s*%)?)+)\s*$/);
        if (m) { nome = m[1]; nums = m[2].trim().split(/\s+/).filter((x) => !/%$/.test(x)).map(lerNum).filter((n) => n != null && !Number.isNaN(n)); }
      }
      const v = {}; ordem.forEach((k, i) => { if (nums[i] != null) v[k] = r2(nums[i]); });
      const kn = chaves(nome), tam = kn.find((w) => /^\d+(ml|gr|g)$/.test(w));
      let cod = null, melhor = 0;
      for (const p of prods) {
        const kp = chaves(p.descricao), tp = kp.find((w) => /^\d+(ml|gr|g)$/.test(w));
        if (tam && tp && tam !== tp) continue;
        // tem de coincidir pelo menos uma palavra do nome (o tamanho sozinho não chega)
        const pal = kn.filter((w) => w.length > 2 && !/^\d/.test(w) && kp.includes(w)).length;
        if (!pal) continue;
        const nota = pal * 2 + (tam && tam === tp ? 1 : 0) - (tp && !tam ? 0.25 : 0);
        if (nota > melhor) { melhor = nota; cod = p.codigo; }
      }
      if (melhor < 1) cod = null;
      return { nome, v, cod, nota: melhor };
    }).filter((x) => x.nome && Object.keys(x.v).length);
    // dois produtos colados não podem ir parar ao mesmo produto do catálogo: fica o que tem o nome mais parecido
    const dono = new Map();
    linhas.forEach((x, i) => { if (!x.cod) return; const j = dono.get(x.cod); if (j == null || linhas[j].nota < x.nota) dono.set(x.cod, i); });
    linhas.forEach((x, i) => { if (x.cod && dono.get(x.cod) !== i) { x.repetido = descDe(x.cod); x.cod = null; } });
    return linhas;
  }

  function vistaDefinicoes() {
    const k = cfg(), e = k.empresa || {}, l = pat();
    const pessoas = ativos();
    const campo = (id, rot, val, extra = "") => '<div class="campo"><label for="' + id + '">' + rot + '</label><input id="' + id + '" value="' + esc(val ?? "") + '" autocomplete="off"' + extra + "></div>";
    return '<div class="pf-def"><section class="p-sec"><h3>Quem fatura</h3>' +
      '<div class="campo"><label for="pf-cfg-fat">Quem cria as faturas no Multixop</label><select id="pf-cfg-fat"><option value="">— escolher —</option>' + pessoas.map((p) => '<option value="' + p.id + '"' + (k.faturador === p.id ? " selected" : "") + ">" + esc(p.nome) + "</option>").join("") + '</select><span class="ajuda">Recebe uma tarefa sempre que um cliente aceita uma proforma e o aviso para imprimir as etiquetas da Nacex.</span></div></section>' +
      '<section class="p-sec"><h3>Empresa (aparece na proforma)</h3><div class="campos-2">' + CAMPOS_EMPRESA.map(([c, r]) => campo("pf-emp-" + c, r, e[c])).join("") + "</div></section>" +
      '<section class="p-sec"><h3>Condições</h3><div class="campos-2">' +
      campo("pf-cfg-iva", "IVA (%)", numIn(k.iva), ' inputmode="decimal"') + campo("pf-cfg-val", "Validade da proforma (dias)", k.validade_dias, ' inputmode="numeric"') +
      campo("pf-cfg-emb", "Desconto de embaixador (%)", numIn(k.desconto_embaixador), ' inputmode="decimal"') + campo("pf-cfg-inf", "Desconto de influencer (%)", numIn(k.desconto_influencer ?? 5), ' inputmode="decimal"') +
      campo("pf-cfg-nacex", "Serviço Nacex", k.nacex_servico) +
      "</div></section>" +
      '<section class="p-sec"><h3>Patamares</h3><div class="campos-2">' +
      campo("pf-pat-pro6", "1.º patamar PRO a partir de (€)", l.pro6, ' inputmode="numeric"') + campo("pf-pat-pro12", "2.º patamar PRO a partir de (€)", l.pro12, ' inputmode="numeric"') +
      campo("pf-pat-pvd40", "PVD40 a partir de (€)", l.pvd40, ' inputmode="numeric"') + campo("pf-pat-pvd50", "PVD50 a partir de (€)", l.pvd50, ' inputmode="numeric"') +
      '<div class="campo"><label for="pf-cfg-por">O patamar conta</label><select id="pf-cfg-por"><option value="encomenda"' + (k.patamar_por !== "ano" ? " selected" : "") + '>Pelo valor de cada encomenda</option><option value="ano"' + (k.patamar_por === "ano" ? " selected" : "") + ">Pelas compras dos últimos 12 meses</option></select></div>" +
      '</div><p class="muted">A proforma não muda o escalão sozinha: mostra ao comercial quanto falta para o próximo patamar e quanto o cliente poupa.</p></section></div>';
  }

  /* ============================== Bloco na ficha do cliente ============================== */
  function blocoCliente(c) {
    if (!podeCrm(S.eu) || c.tipo === "interno") return "";
    garantir();
    const minhas = P.estado === "pronto" ? doCliente(c.id).slice(0, 5) : [];
    return '<section class="p-sec pf-cli"><h3>Preços TwentySix</h3><div class="pf-cli-linha">' +
      '<label class="sr" for="pf-cli-esc">Escalão</label><select id="pf-cli-esc" class="sel" data-cliente="' + c.id + '">' + ESCALOES.map((k) => '<option value="' + k + '"' + ((c.escalao || "base") === k ? " selected" : "") + ">" + esc(nomeEsc(k)) + "</option>").join("") + "</select>" +
      '<label class="sr" for="pf-cli-par">Parceria</label><select id="pf-cli-par" class="sel" data-cliente="' + c.id + '">' + Object.keys(PARC).map((k) => '<option value="' + k + '"' + ((c.parceria || "") === k ? " selected" : "") + ">" + esc(nomePar(k)) + "</option>").join("") + "</select>" +
      '<button class="btn pri" data-acao="pf-nova" data-cliente="' + c.id + '">' + I.plus + "Proforma</button></div>" +
      (minhas.length ? '<div class="hist">' + minhas.map((p) => '<div><button class="c-link" data-acao="pf-abrir" data-id="' + p.id + '">' + refPf(p) + " · " + esc(haQuanto(p.criado_em)) + '</button><span><span class="etapa ' + EST[p.estado][1] + '">' + EST[p.estado][0] + '</span> <span class="mono">' + eur2(p.total_sem_iva) + "</span></span></div>").join("") + "</div>" : "") +
      "</section>";
  }

  /* ============================== Painel da proforma ============================== */
  function painel(a) {
    const mold = (c, pe) => '<div class="veu" data-acao="fechar"></div><aside class="painel largo" role="dialog" aria-label="Proforma" data-marca="twentysix"><div class="p-scroll">' + c + "</div>" + (pe ? '<div class="p-pe">' + pe + "</div>" : "") + "</aside>";
    const topo = (m, acts = "") => '<div class="p-topo"><span class="migalha"><i></i>' + m + '</span><span class="acts">' + acts + '<button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + "</button></span></div>";
    garantir();
    if (a.tipo === "pf-escolher") {
      const cl = Object.values(S.crm?.clientes || {}).filter((c) => c.tipo !== "interno").sort((x, y) => x.nome.localeCompare(y.nome, "pt"));
      return mold(topo("Comercial / Nova proforma") + '<h2 style="margin:0">Para que cliente?</h2><form class="form" id="form-pf-escolher" novalidate><div class="campo"><label for="pf-esc-cli">Cliente</label><input id="pf-esc-cli" list="pf-lista-cli" autocomplete="off" placeholder="Escreve o nome"><datalist id="pf-lista-cli">' +
        cl.map((c) => '<option value="' + esc(c.nome) + '">').join("") + '</datalist><span class="ajuda">Se o cliente ainda não existe, cria-o primeiro em Clientes e leads.</span></div><div class="acts"><button class="btn pri" type="submit">Criar proforma</button><button class="btn sec" type="button" data-acao="fechar">Cancelar</button></div></form>');
    }
    const p = P.proformas[a.id];
    if (!p) return mold(topo("Comercial / Proforma") + (P.estado === "pronto" ? '<div class="vazio"><h3>Proforma indisponível</h3><p>Foi eliminada ou não tens acesso.</p></div>' : '<div class="esqueleto"><i style="width:60%"></i></div>'));
    const ed = editavel(p), dis = ed ? "" : " disabled", t = totais(p);
    const apaga = (eGestor(S.eu) || p.criado_por === S.eu.id) && ["rascunho", "enviada"].includes(p.estado);
    let h = topo("Comercial / " + refPf(p), '<button class="ib" data-acao="pf-imprimir">' + I.nota + "Imprimir</button>" + (apaga ? '<button class="ib perigo" data-acao="pf-apagar">' + I.lixo + "Eliminar</button>" : ""));
    if (a.confirmar) h += '<div class="aviso erro" style="justify-content:space-between;flex-wrap:wrap">Eliminar a proforma ' + refPf(p) + '?<span class="acts"><button class="btn sec" data-acao="pf-apagar-nao">Manter</button><button class="btn perigo" data-acao="pf-apagar-sim">Eliminar</button></span></div>';
    h += '<h2 style="margin:0">' + esc(p.cliente?.nome || "Cliente") + "</h2>" +
      '<div class="chips"><span class="etapa ' + EST[p.estado][1] + '">' + EST[p.estado][0] + "</span><span>" + esc(nomeEsc(p.escalao)) + "</span>" + (p.parceria ? "<span>" + esc(PARC[p.parceria]) + "</span>" : "") +
      "<span>Feita por " + esc(nomeDe(p.criado_por) || "—") + " " + haQuanto(p.criado_em) + "</span>" + (p.cliente_id ? '<button class="c-link" data-acao="crm-abrir" data-id="' + p.cliente_id + '">Ficha do cliente</button>' : "") + "</div>";
    const passos = [["rascunho", "Rascunho"], ["enviada", "Enviada"], ["aceite", "Aceite"], ["faturada", "Faturada"]], iAtual = passos.findIndex(([k]) => k === p.estado);
    if (p.estado !== "cancelada") h += '<ol class="pf-passos">' + passos.map(([k, r], i) => '<li class="' + (i < iAtual ? "feito" : i === iAtual ? "atual" : "") + '">' + r + "</li>").join("") + "</ol>";
    h += blocoAcoes(p, t);
    // condições
    h += '<div class="props">' +
      '<label for="pf-esc">Escalão</label><select id="pf-esc"' + dis + ">" + ESCALOES.map((k) => '<option value="' + k + '"' + (p.escalao === k ? " selected" : "") + ">" + esc(nomeEsc(k)) + "</option>").join("") + "</select>" +
      '<label for="pf-par">Parceria</label><select id="pf-par"' + dis + ">" + Object.keys(PARC).map((k) => '<option value="' + k + '"' + ((p.parceria || "") === k ? " selected" : "") + ">" + esc(k && p.parceria === k ? PARC[k] + " (−" + pct(p.desc_embaixador) + ")" : nomePar(k)) + "</option>").join("") + "</select>" +
      (p.parceria && p.escalao !== "base" ? '<span class="ajuda">Não acumula com o escalão: o desconto de ' + esc(PARC[p.parceria].toLowerCase()) + " só conta no preço Base.</span>" : "") +
      '<label for="pf-desc">Desconto extra (%)</label><input id="pf-desc" inputmode="decimal" value="' + numIn(p.desconto || null) + '" placeholder="0"' + dis + ">" +
      '<label for="pf-envio">Envio</label><select id="pf-envio"' + dis + ">" + Object.entries(ENVIO).map(([k, r]) => '<option value="' + k + '"' + (p.envio === k ? " selected" : "") + ">" + r + "</option>").join("") + "</select>" +
      '<label for="pf-val">Válida até</label><input id="pf-val" type="date" value="' + esc(p.validade || "") + '"' + dis + ">" +
      "</div>";
    // produtos
    h += '<section class="p-sec"><h3>Produtos <span class="mono" id="pf-unid">' + t.unidades + " unid.</span></h3>" + tabelaProdutos(p, ed) + "</section>";
    h += '<div id="pf-totais">' + htmlTotais(p, t) + "</div>";
    // cliente
    h += '<section class="p-sec"><h3>Dados do cliente <span class="mono">para a fatura e o envio</span></h3><div class="props">' +
      CAMPOS_CLIENTE.map(([k, r]) => '<label for="pf-c-' + k + '">' + r + '</label><input id="pf-c-' + k + '" data-pf-cli="' + k + '" value="' + esc(p.cliente?.[k] || "") + '"' + (k === "email" ? ' type="email"' : k === "telefone" || k === "telemovel" ? ' type="tel"' : "") + ' autocomplete="off"' + dis + ">").join("") + "</div></section>";
    h += '<section class="p-sec"><h3>Notas</h3><textarea id="pf-notas" class="notas" placeholder="Condições combinadas, ofertas, prazo de entrega…"' + dis + ">" + esc(p.notas || "") + "</textarea></section>";
    if (p.estado !== "cancelada" && p.estado !== "faturada" && (podeCrm(S.eu) || podeFaturar())) h += '<div class="acts"><button class="btn perigo-sec" data-acao="pf-cancelar">Cancelar proforma</button></div>';
    const pe = "<span>" + (p.estado === "faturada" ? "Faturada por " + esc(nomeDe(p.faturada_por) || "—") + " " + haQuanto(p.faturada_em) : p.atualizado_por ? "Alterada por " + esc(nomeDe(p.atualizado_por) || "—") + " " + haQuanto(p.atualizado_em) : "") + "</span>";
    return mold(h, pe);
  }

  function blocoAcoes(p, t) {
    if (p.estado === "cancelada") return '<div class="aviso">Proforma cancelada.' + (podeCrm(S.eu) ? ' <button class="btn sec" data-acao="pf-reabrir">Voltar a abrir</button>' : "") + "</div>";
    if (p.estado === "faturada") {
      return '<div class="aviso ok"><span>Faturada com <b>' + esc(p.fatura_numero) + "</b>. A encomenda está com a Logística.</span>" + (p.encomenda_id ? ' <a class="btn sec" href="#encomenda-' + p.encomenda_id + '">Ver encomenda</a>' : "") + "</div>";
    }
    if (p.estado === "aceite") {
      let h = '<div class="aviso"><span>O cliente aceitou. ' + (P.config?.faturador ? esc(nomeDe(P.config.faturador) || "Quem fatura") + " tem a tarefa de criar a fatura no Multixop." : "Falta escolher quem fatura (Definições).") + "</span></div>";
      if (podeFaturar()) h += '<form class="pf-fat-linha" id="pf-fat-' + p.id + '" data-id="' + p.id + '"><label for="pf-fatnum-' + p.id + '">N.º da fatura no Multixop</label><input class="inp mini" id="pf-fatnum-' + p.id + '" placeholder="Ex.: Fac 26DNT/512" autocomplete="off"><button class="btn pri" type="submit">' + I.check + "Faturada · passar à Logística</button></form>";
      if (podeCrm(S.eu)) h += '<div class="acts"><button class="btn sec" data-acao="pf-reabrir">O cliente quer mudar alguma coisa</button></div>';
      return h;
    }
    if (!podeCrm(S.eu)) return "";
    const semItens = t.sub <= 0;
    return '<div class="acts pf-acoes">' + (p.estado === "rascunho" ? '<button class="btn sec" data-acao="pf-enviada"' + (semItens ? " disabled" : "") + ">Marcar como enviada ao cliente</button>" : "") +
      '<button class="btn pri" data-acao="pf-aceitar"' + (semItens ? " disabled" : "") + ">" + I.check + "Cliente aceitou · pedir fatura</button>" +
      (semItens ? '<span class="muted">Escolhe as quantidades abaixo.</span>' : "") + "</div>";
  }

  function tabelaProdutos(p, ed) {
    const naProforma = new Map((p.itens || []).map((i) => [i.codigo, i]));
    let linhas = ed ? catalogo() : [];
    for (const i of p.itens || []) if (!linhas.some((x) => x.cod === i.codigo)) linhas.push({ cod: i.codigo, desc: i.descricao || descDe(i.codigo), t: P.precos[i.codigo] || {} });
    if (!ed) linhas = linhas.filter((x) => naProforma.has(x.cod));
    if (!linhas.length) return eGestor(S.eu) ? '<div class="aviso">Ainda não há preços na tabela. Preenche-os em <b>Comercial → Proformas → Tabela de preços</b>.</div>' : '<div class="aviso">Ainda não há preços na tabela. Pede à direção para os preencher.</div>';
    const q = normalizar(P.qProd || "");
    let h = ed && linhas.length > 8 ? '<label class="pesq">' + I.lupa + '<span class="sr">Procurar produto</span><input id="pf-qprod" type="search" placeholder="Procurar produto" value="' + esc(P.qProd || "") + '" autocomplete="off"></label>' : "";
    h += '<div class="tabela-scroll"><table class="crm-tabela pf-prod"><thead><tr><th>Produto</th><th class="n">Preço</th><th class="n" title="Margem do cliente ao vender ao PRVP">Margem cliente</th><th class="n">Qtd.</th><th class="n">Total</th></tr></thead><tbody>';
    for (const x of linhas) {
      const it = naProforma.get(x.cod), preco = it ? +it.preco : precoDe(x.cod, p.escalao), prvp = x.t?.prvp;
      const falta = !it && !temPreco(x.cod, p.escalao);
      const esconde = q && !normalizar(x.desc + " " + x.cod).includes(q) && !it;
      h += '<tr class="' + (it && +it.qtd > 0 ? "on" : "") + '"' + (esconde ? " hidden" : "") + ' data-pf-linha="' + esc(normalizar(x.desc + " " + x.cod)) + '"><td>' + esc(x.desc) + (falta ? '<small>sem preço ' + esc(curtoEsc(p.escalao)) + ": usa o Base</small>" : "") + "</td>" +
        '<td class="n">' + (preco != null ? eur2(preco) : "—") + '</td><td class="n">' + (prvp && preco != null ? pct(((prvp - preco) / prvp) * 100) : "—") + "</td>" +
        '<td class="n">' + (ed ? '<label class="sr" for="pf-q-' + esc(x.cod) + '">Quantidade de ' + esc(x.desc) + '</label><input class="inp mini n pf-qtd" id="pf-q-' + esc(x.cod) + '" data-pf-qtd="' + esc(x.cod) + '" inputmode="numeric" value="' + (it ? it.qtd : "") + '" placeholder="0">' : it ? it.qtd : "") + "</td>" +
        '<td class="n" id="pf-lt-' + esc(x.cod) + '">' + (it ? eur2(r2(it.qtd * it.preco)) : "") + "</td></tr>";
    }
    return h + "</tbody></table></div>";
  }

  function htmlTotais(p, t) {
    let h = '<div class="pf-totais">' + (t.descEmb || t.descExtra ? "<div><span>Subtotal</span><b>" + eur2(t.sub) + "</b></div>" : "") +
      (t.descEmb ? "<div><span>Desconto de " + esc((PARC[p.parceria] || "parceria").toLowerCase()) + " (" + pct(p.desc_embaixador) + ")</span><b>−" + eur2(t.descEmb) + "</b></div>" : "") +
      (t.descExtra ? "<div><span>Desconto (" + pct(p.desconto) + ")</span><b>−" + eur2(t.descExtra) + "</b></div>" : "") +
      "<div><span>Total sem IVA</span><b>" + eur2(t.base) + "</b></div><div><span>IVA (" + pct(p.iva) + ")</span><b>" + eur2(t.iva) + '</b></div><div class="tot"><span>Total</span><b>' + eur2(t.total) + "</b></div></div>";
    h += htmlMargem(p, t);
    const prox = PROXIMO[p.escalao];
    if (prox && t.sub > 0 && ["rascunho", "enviada"].includes(p.estado)) {
      const lim = pat()[prox], porAno = cfg().patamar_por === "ano", ja = porAno ? comprasAno(p.cliente_id) : 0, conta = ja + t.base;
      const poup = r2((p.itens || []).reduce((s, i) => { const np = P.precos[i.codigo]?.[prox]; return s + (np != null ? Math.max(0, (+i.preco - np) * (+i.qtd || 0)) : 0); }, 0));
      if (lim) h += '<div class="pf-patamar' + (conta >= lim ? " ok" : "") + '"><b>' + esc(nomeEsc(prox)) + "</b> " + (conta >= lim
        ? "já está ao alcance" + (porAno ? " (compras dos últimos 12 meses + esta proforma)" : "") + ". Com esse preço o cliente poupa " + eur2(poup) + " nesta encomenda."
        : "· faltam " + eur2(lim - conta) + (porAno ? " (contando as compras dos últimos 12 meses)" : "") + ". Com esse preço o cliente pouparia " + eur2(poup) + " nesta encomenda.") +
        '<span class="pf-pat-barra"><i style="width:' + Math.min(100, Math.round((conta / lim) * 100)) + '%"></i></span></div>';
    }
    return h;
  }

  // Margem da TwentySix nesta proforma (total sem IVA menos o custo dos produtos): só a direção vê
  function htmlMargem(p, t) {
    if (!eGestor(S.eu) || !(t.base > 0)) return "";
    const itens = (p.itens || []).filter((i) => +i.qtd > 0), custos = P.custos || {};
    const sem = itens.filter((i) => custos[i.codigo] == null);
    if (sem.length === itens.length) return '<div class="pf-margem"><span>Margem</span><small>Falta o custo destes produtos (CRM → Margens).</small></div>';
    const custo = itens.reduce((s, i) => s + (custos[i.codigo] ?? 0) * (+i.qtd || 0), 0);
    // sem custo conhecido, a margem conta só com a parte da proforma que tem custo
    const baseCom = sem.length ? t.base * (itens.filter((i) => custos[i.codigo] != null).reduce((s, i) => s + +i.qtd * +i.preco, 0) / (t.sub || 1)) : t.base;
    const m = baseCom - custo, pm = baseCom ? (m / baseCom) * 100 : 0;
    return '<div class="pf-margem' + (pm < 20 ? " baixa" : "") + '"><span>Margem <small>só a direção vê</small></span><b>' + eur2(m) + " · " + pct(pm) + "</b>" +
      "<small>Custo dos produtos " + eur2(custo) + (sem.length ? " · sem custo: " + esc(sem.map((i) => i.descricao || descDe(i.codigo)).join(", ")) + " (fora da conta)" : "") + "</small></div>";
  }

  /* ---------- impressão (o navegador guarda em PDF) ---------- */
  function imprimir(p) {
    const e = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const t = totais(p), emp = cfg().empresa || {}, c = p.cliente || {};
    const dataPt = (s) => { if (!s) return "—"; const [y, m, d] = s.slice(0, 10).split("-").map(Number); return d + " " + MES[m - 1] + " " + y; };
    const linhas = (p.itens || []).filter((i) => +i.qtd > 0);
    const html = '<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><title>Proforma ' + e(refPf(p)) + " · " + e(c.nome) + "</title><style>" +
      "@page{size:A4;margin:16mm}body{font:12.5px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#1d1b18;margin:0}header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #8a6a2f;padding-bottom:12px}" +
      ".emp b{font-size:16px;display:block}.emp,.cli{color:#4a463f}.doc{text-align:right}.doc h1{margin:0;font-size:22px;letter-spacing:.04em;color:#8a6a2f}.doc p{margin:2px 0}" +
      ".cli{margin:18px 0;padding:12px 14px;border:1px solid #e5e1da;border-radius:8px}.cli b{color:#1d1b18}table{width:100%;border-collapse:collapse;margin-top:6px}th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#6b665f;border-bottom:1px solid #1d1b18;padding:6px 4px}" +
      "td{padding:7px 4px;border-bottom:1px solid #e5e1da}.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.tot{margin:14px 0 0 auto;width:300px}.tot div{display:flex;justify-content:space-between;padding:4px 0}.tot .g{border-top:2px solid #1d1b18;font-weight:700;font-size:15px;padding-top:8px}" +
      ".notas{margin-top:18px;white-space:pre-wrap}.rodape{margin-top:28px;color:#6b665f;font-size:11px;border-top:1px solid #e5e1da;padding-top:8px}</style></head><body>" +
      '<header><div class="emp"><b>' + e(emp.nome || "TwentySix") + "</b>" + [emp.morada, emp.cp, emp.nif ? "NIF " + emp.nif : "", [emp.telefone, emp.email].filter(Boolean).join(" · ")].filter(Boolean).map((x) => e(x)).join("<br>") + "</div>" +
      '<div class="doc"><h1>PROFORMA</h1><p><b>' + e(refPf(p)) + "</b></p><p>Data: " + e(dataPt(p.criado_em)) + "</p>" + (p.validade ? "<p>Válida até: " + e(dataPt(p.validade)) + "</p>" : "") + "</div></header>" +
      '<div class="cli"><b>' + e(c.nome) + "</b>" + (c.nif ? " · NIF " + e(c.nif) : "") + "<br>" + e([c.morada, [c.cp, c.localidade].filter(Boolean).join(" ")].filter(Boolean).join(", ")) + ([c.telefone, c.telemovel, c.email].filter(Boolean).length ? "<br>" + e([c.telefone, c.telemovel, c.email].filter(Boolean).join(" · ")) : "") + "</div>" +
      '<table><thead><tr><th>Ref.</th><th>Descrição</th><th class="n">Qtd.</th><th class="n">Preço unit.</th><th class="n">Total</th></tr></thead><tbody>' +
      linhas.map((i) => "<tr><td>" + e(i.codigo) + "</td><td>" + e(i.descricao || descDe(i.codigo)) + '</td><td class="n">' + e(i.qtd) + '</td><td class="n">' + e(eur2(i.preco)) + '</td><td class="n">' + e(eur2(r2(i.qtd * i.preco))) + "</td></tr>").join("") + "</tbody></table>" +
      '<div class="tot"><div><span>Subtotal</span><span>' + e(eur2(t.sub)) + "</span></div>" + (t.descEmb ? "<div><span>Desconto (" + e(pct(p.desc_embaixador)) + ")</span><span>−" + e(eur2(t.descEmb)) + "</span></div>" : "") +
      (t.descExtra ? "<div><span>Desconto (" + e(pct(p.desconto)) + ")</span><span>−" + e(eur2(t.descExtra)) + "</span></div>" : "") +
      "<div><span>Total sem IVA</span><span>" + e(eur2(t.base)) + "</span></div><div><span>IVA " + e(pct(p.iva)) + "</span><span>" + e(eur2(t.iva)) + '</span></div><div class="g"><span>Total</span><span>' + e(eur2(t.total)) + "</span></div></div>" +
      (p.notas ? '<div class="notas"><b>Notas</b><br>' + e(p.notas) + "</div>" : "") +
      '<div class="rodape">' + (emp.iban ? "IBAN: " + e(emp.iban) + "<br>" : "") + "Documento sem valor fiscal. Este documento não serve de fatura.</div>" +
      "<script>setTimeout(()=>print(),300)<\/script></body></html>";
    const w = window.open("", "_blank");
    if (!w) { toast("O navegador bloqueou a janela. Permite janelas para esta app e tenta de novo.", true); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  /* ============================== Ações ============================== */
  function atualizarItens(p, cod, qtd) {
    const itens = (p.itens || []).filter((i) => i.codigo !== cod);
    if (qtd > 0) {
      const antigo = (p.itens || []).find((i) => i.codigo === cod);
      itens.push({ codigo: cod, descricao: antigo?.descricao || descDe(cod), qtd, preco: antigo ? +antigo.preco : precoDe(cod, p.escalao) ?? 0 });
    }
    const ordem = catalogo().map((x) => x.cod);
    itens.sort((a, b) => (ordem.indexOf(a.codigo) + 1 || 999) - (ordem.indexOf(b.codigo) + 1 || 999));
    return itens;
  }
  async function passo(fn, msg) {
    const id = S.aberto?.id;
    try { await guardarJa(id); const r = await fn(id); if (r) P.proformas[r.id] = r; render(); redesenhar(); if (msg) toast(msg); }
    catch (e) { falha(e); }
  }

  function clique(acao, el) {
    if (!acao.startsWith("pf-")) return false;
    const p = S.aberto?.tipo === "proforma" ? P.proformas[S.aberto.id] : null;
    switch (acao) {
      case "pf-recarregar": P.estado = "por-carregar"; carregar(); return true;
      case "pf-sub": P.sub = el.dataset.v; render(); return true;
      case "pf-filtro": P.filtro = el.dataset.v; P.sub = "lista"; render(); return true;
      case "pf-abrir": abrir({ tipo: "proforma", id: el.dataset.id }); return true;
      case "pf-escolher": if (S.crm?.estado === "por-carregar") ctx.carregarCrm?.(); abrir({ tipo: "pf-escolher" }); return true;
      case "pf-nova": nova(el.dataset.cliente); return true;
      case "pf-imprimir": if (p) guardarJa(p.id).catch(() => {}).finally(() => imprimir(P.proformas[p.id])); return true;
      case "pf-apagar": S.aberto = { ...S.aberto, confirmar: true }; redesenhar(); return true;
      case "pf-apagar-nao": S.aberto = { ...S.aberto, confirmar: false }; redesenhar(); return true;
      case "pf-apagar-sim": {
        if (!p) return true;
        const antes = p; clearTimeout(timers[p.id]); delete P.proformas[p.id]; S.aberto = null; renderPainel(true); render();
        api.com.apagar(antes.id).then(() => toast("Proforma eliminada")).catch((e) => { P.proformas[antes.id] = antes; render(); falha(e); });
        return true;
      }
      case "pf-enviada": if (p) { guardar(p.id, { estado: "enviada" }, 0); redesenhar(); toast("Marcada como enviada"); } return true;
      case "pf-aceitar": passo((id) => api.com.aceitar(id), "Pedido de fatura enviado a " + (nomeDe(P.config?.faturador) || "quem fatura")); return true;
      case "pf-reabrir": passo((id) => api.com.reabrir(id), "Proforma aberta outra vez"); return true;
      case "pf-cancelar": passo((id) => api.com.cancelar(id), "Proforma cancelada"); return true;
      case "pf-colar-ler": {
        const txt = document.getElementById("pf-colar-txt")?.value || "", fmt = document.getElementById("pf-colar-fmt")?.value || "pro";
        const linhas = lerColagem(txt, fmt);
        P.colar = { txt, fmt, linhas };
        if (!linhas.length) toast("Não encontrei linhas com nome e preços.", true);
        render(); return true;
      }
      case "pf-colar-limpar": P.colar = null; render(); return true;
      case "pf-colar-gravar": {
        const l = (P.colar?.linhas || []).filter((x) => x.cod);
        const porCod = new Map(); l.forEach((x) => porCod.set(x.cod, { ...(porCod.get(x.cod) || {}), ...x.v }));
        const lote = [...porCod.entries()].map(([cod, v]) => ({ produto_codigo: cod, ...v }));
        api.com.precos(lote).then((rs) => { rs.forEach((r) => (P.precos[r.produto_codigo] = r)); P.colar = null; render(); toast("Preços gravados: " + rs.length + " produto" + (rs.length === 1 ? "" : "s")); }).catch(falha);
        return true;
      }
    }
    return false;
  }

  function mudar(e) {
    const t = e.target;
    if (t.dataset?.pfPreco) {
      const cod = t.dataset.pfPreco, col = t.dataset.col, v = lerNum(t.value);
      if (Number.isNaN(v) || (v != null && v < 0)) { toast("Escreve o preço em euros, por exemplo 9,97.", true); return true; }
      const antes = P.precos[cod];
      if ((antes?.[col] ?? null) === (v == null ? null : r2(v))) return true;
      P.precos[cod] = { produto_codigo: cod, ...(antes || {}), [col]: v == null ? null : r2(v) };
      api.com.precos([{ produto_codigo: cod, [col]: v == null ? null : r2(v) }]).then(([r]) => { if (r) P.precos[cod] = r; toast("Preço guardado"); })
        .catch((err) => { if (antes) P.precos[cod] = antes; else delete P.precos[cod]; render(); falha(err); });
      return true;
    }
    if (t.id === "pf-cli-esc" || t.id === "pf-cli-par") {
      const cid = t.dataset.cliente, c = S.crm?.clientes?.[cid]; if (!c) return true;
      const campos = t.id === "pf-cli-esc" ? { escalao: t.value } : { parceria: t.value };
      const antes = { escalao: c.escalao, parceria: c.parceria };
      Object.assign(c, campos);
      api.crm.atualizar(cid, campos).then((r) => { if (r) S.crm.clientes[cid] = r; toast(t.id === "pf-cli-esc" ? "Escalão: " + nomeEsc(t.value) : "Parceria: " + PARC[t.value]); })
        .catch((err) => { Object.assign(c, antes); renderPainel(true); falha(/escalao|parceria/.test(String(err?.message)) ? new Error("Falta correr os ficheiros supabase/24-proformas-nacex.sql e 25-lojas-parcerias.sql no Supabase.") : err); });
      return true;
    }
    // definições
    if (/^pf-(cfg|emp|pat)-/.test(t.id) && eGestor(S.eu)) {
      const k = cfg(), campos = {};
      if (t.id === "pf-cfg-fat") campos.faturador = t.value || null;
      else if (t.id === "pf-cfg-por") campos.patamar_por = t.value;
      else if (t.id === "pf-cfg-nacex") campos.nacex_servico = t.value.trim() || "27";
      else if (t.id.startsWith("pf-emp-")) campos.empresa = { ...(k.empresa || {}), [t.id.slice(7)]: t.value.trim() };
      else {
        const v = lerNum(t.value);
        if (v == null || Number.isNaN(v) || v < 0) { toast("Escreve um número.", true); return true; }
        if (t.id === "pf-cfg-iva") campos.iva = v; else if (t.id === "pf-cfg-val") campos.validade_dias = Math.round(v); else if (t.id === "pf-cfg-emb") campos.desconto_embaixador = v; else if (t.id === "pf-cfg-inf") campos.desconto_influencer = v;
        else campos.patamares = { ...pat(), [t.id.slice(7)]: Math.round(v) };
      }
      const antes = P.config; P.config = { ...k, ...campos };
      api.com.configurar(campos).then((r) => { if (r) P.config = r; render(); toast("Guardado"); }).catch((err) => { P.config = antes; render(); falha(err); });
      return true;
    }
    if (t.id === "pf-colar-fmt" && P.colar) { P.colar.fmt = t.value; return true; }
    const p = S.aberto?.tipo === "proforma" ? P.proformas[S.aberto.id] : null;
    if (!p || !editavel(p)) return false;
    if (t.id === "pf-esc") {
      const esc2 = t.value;
      guardar(p.id, { escalao: esc2, itens: (p.itens || []).map((i) => ({ ...i, preco: precoDe(i.codigo, esc2) ?? i.preco })) }, 0);
      redesenhar(); return true;
    }
    if (t.id === "pf-par") { guardar(p.id, { parceria: t.value, desc_embaixador: pctPar(t.value) }, 0); redesenhar(); return true; }
    if (t.id === "pf-desc") {
      const v = lerNum(t.value) ?? 0;
      if (Number.isNaN(v) || v < 0 || v > 100) { toast("O desconto é uma percentagem entre 0 e 100.", true); return true; }
      guardar(p.id, { desconto: r2(v) }, 0); redesenhar(); return true;
    }
    if (t.id === "pf-envio") { guardar(p.id, { envio: t.value }, 0); return true; }
    if (t.id === "pf-val") { guardar(p.id, { validade: t.value || null }, 0); return true; }
    if (t.dataset?.pfQtd) return true; // os totais atualizam-se ao escrever
    if (t.dataset?.pfCli || t.id === "pf-notas") return true; // já guardado ao escrever
    return false;
  }

  function escrever(e) {
    const t = e.target;
    if (t.id === "pf-q" || t.id === "pf-qp") {
      P[t.id === "pf-q" ? "q" : "qp"] = t.value; const pos = t.selectionStart, id = t.id;
      render(); const n = document.getElementById(id); if (n && document.activeElement !== n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch { /* */ } }
      return true;
    }
    if (t.id === "pf-colar-txt") { P.colar = { ...(P.colar || {}), txt: t.value }; return true; }
    if (t.id === "pf-qprod") {
      P.qProd = t.value; const q = normalizar(t.value);
      document.querySelectorAll("#painel-root tr[data-pf-linha]").forEach((tr) => { tr.hidden = !!q && !tr.dataset.pfLinha.includes(q) && !tr.classList.contains("on"); });
      return true;
    }
    const p = S.aberto?.tipo === "proforma" ? P.proformas[S.aberto.id] : null;
    if (!p || !editavel(p)) return false;
    if (t.dataset?.pfQtd) {
      const cod = t.dataset.pfQtd, v = lerNum(t.value);
      if (Number.isNaN(v) || (v != null && v < 0)) return true;
      const q = Math.round(v || 0);
      const itens = atualizarItens(p, cod, q);
      guardar(p.id, { itens });
      const it = itens.find((i) => i.codigo === cod), tt = totais(p);
      const lt = document.getElementById("pf-lt-" + cod); if (lt) lt.textContent = it ? eur2(r2(it.qtd * it.preco)) : "";
      t.closest("tr")?.classList.toggle("on", q > 0);
      const tot = document.getElementById("pf-totais"); if (tot) tot.innerHTML = htmlTotais(p, tt);
      const un = document.getElementById("pf-unid"); if (un) un.textContent = tt.unidades + " unid.";
      document.querySelectorAll("#painel-root [data-acao=pf-aceitar],#painel-root [data-acao=pf-enviada]").forEach((b) => { b.disabled = tt.sub <= 0; });
      return true;
    }
    if (t.dataset?.pfCli) { guardar(p.id, { cliente: { ...(p.cliente || {}), [t.dataset.pfCli]: t.value } }, 900); return true; }
    if (t.id === "pf-notas") { guardar(p.id, { notas: t.value }, 900); return true; }
    return false;
  }

  async function submeter(f) {
    if (f.id === "form-pf-escolher") {
      const nome = document.getElementById("pf-esc-cli")?.value.trim() || "";
      const c = Object.values(S.crm?.clientes || {}).find((x) => x.nome === nome) || Object.values(S.crm?.clientes || {}).find((x) => normalizar(x.nome) === normalizar(nome));
      if (!c) { toast("Escolhe um cliente da lista.", true); return true; }
      await nova(c.id); return true;
    }
    if (f.classList?.contains("pf-fat-linha")) {
      const id = f.dataset.id, num = f.querySelector("input")?.value.trim();
      if (!num) { toast("Escreve o número da fatura do Multixop.", true); return true; }
      try { const r = await api.com.faturar(id, num); P.proformas[r.id] = r; render(); if (S.aberto?.id === id) redesenhar(); toast(refPf(r) + " faturada · a encomenda passou para a Logística"); ctx.aoFaturar?.(); }
      catch (e) { falha(e); }
      return true;
    }
    return false;
  }

  function reiniciar() { if (desligar) { desligar(); desligar = null; } Object.values(timers).forEach(clearTimeout); Object.assign(P, { estado: "por-carregar", precos: {}, config: null, proformas: {}, sub: "lista", filtro: "abertas", q: "", colar: null }); }
  const porFaturar = () => (P.estado === "pronto" && podeFaturar() ? lista().filter((p) => p.estado === "aceite").length : 0);
  return { vista, painel, blocoCliente, clique, mudar, escrever, submeter, reiniciar, carregar, podeVer, porFaturar, estado: () => P.estado, config: () => P.config };
}
