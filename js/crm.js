// Central 26 — CRM comercial: clientes e leads, ficha, funil, análise de vendas e importação do SAF-T.
import { MES, MES_L, ymd, normalizar, dataLonga, haQuanto, eGestor } from "./dados.js";

export const DISTRITOS = ["Aveiro", "Beja", "Braga", "Bragança", "Castelo Branco", "Coimbra", "Évora", "Faro", "Guarda", "Leiria", "Lisboa",
  "Portalegre", "Porto", "Santarém", "Setúbal", "Viana do Castelo", "Vila Real", "Viseu", "Açores", "Madeira"];
export const ETAPAS = { lead: "Lead", contactado: "Contactado", proposta: "Proposta", cliente: "Cliente", perdido: "Perdido" };
const TIPOS = { empresa: "Empresa", particular: "Particular / ENI", lead: "Lead", interno: "Interno (grupo)" };
const LINHAS = { produtos: "Produtos (TwentySix e revenda)", tech: "26 Tech (equipamentos e aluguer)", equipamento: "Equipamento de barbearia", portes: "Portes de envio" };
const TIPOS_CONTACTO = { chamada: "Chamada", visita: "Visita", whatsapp: "WhatsApp", email: "Email", reuniao: "Reunião", proposta: "Proposta enviada", nota: "Nota" };
const ESTADOS = { ativo: "Ativo", morno: "Morno", risco: "Em risco", perdido: "Perdido", sem: "Sem compras" };
const ESTADO_AJUDA = { ativo: "comprou nos últimos 30 dias", morno: "31 a 90 dias sem comprar", risco: "91 a 180 dias sem comprar", perdido: "mais de 180 dias sem comprar", sem: "sem compras no período importado" };

export const podeCrm = (eu) => !!eu && (eGestor(eu) || eu.departamento_id === "comercial");
export const podeImportar = (eu) => !!eu && (eGestor(eu) || (eu.papel === "chefe" && eu.departamento_id === "comercial"));

const eur = (v, dec = 0) => (Number(v) || 0).toLocaleString("pt-PT", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + " €";
const num = (v) => (Number(v) || 0).toLocaleString("pt-PT");
const diasEntre = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const mediana = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const rotData = (s) => { if (!s) return "—"; const [y, m, d] = s.split("-").map(Number); return d + " " + MES[m - 1] + " " + y; };
const MAU = "�";

/* ============================== Leitura do SAF-T ============================== */
const INTERNOS = /^(barbearia (madalena|avenida|sto\.? ?ovide?io|santo ovidio|porto|arcozelo)|26 academy|26 avenue|ondina\s+e\s+maia)/i;
function linhaNegocio(desc, cod) {
  const d = String(desc || "").toUpperCase();
  if (cod === "3" || /^SERVI/.test(d) || /PORTES/.test(d)) return "portes";
  if (/LASER|EMSCULPT|SKIN CLEANING|LATHER|ALICE|\bEMS\b|M.QUINA DIO/.test(d)) return "tech";
  if (/CADEIRA|LAVAT|ESPELHO|MARQUESA|CARRINHO|BANCADA/.test(d)) return "equipamento";
  return "produtos";
}
function nifValido(n) {
  if (!/^\d{9}$/.test(n || "")) return false;
  let s = 0; for (let i = 0; i < 8; i++) s += +n[i] * (9 - i);
  const c = 11 - (s % 11); return (c >= 10 ? 0 : c) === +n[8];
}
function decodificar(buf) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return new TextDecoder("windows-1252").decode(buf); }
}
export function lerSaft(texto) {
  const doc = new DOMParser().parseFromString(texto, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("O ficheiro não é um XML válido.");
  const todos = (el, nome) => Array.from(el.getElementsByTagNameNS("*", nome));
  const um = (el, nome) => el.getElementsByTagNameNS("*", nome)[0];
  const t = (el, nome) => (um(el, nome)?.textContent || "").trim();
  const filho = (el, nome) => Array.from(el.children).find((c) => c.localName === nome);
  const tf = (el, nome) => (filho(el, nome)?.textContent || "").trim();
  const head = um(doc, "Header");
  if (!head || !um(doc, "MasterFiles")) throw new Error("Este ficheiro não parece um SAF-T de faturação.");
  const nifEmpresa = t(head, "TaxRegistrationNumber");
  const clientes = todos(um(doc, "MasterFiles"), "Customer").map((c) => {
    const codigo = tf(c, "CustomerID"), nome = tf(c, "CompanyName"), nif = tf(c, "CustomerTaxID");
    const morada = (t(c, "AddressDetail") || "").replace(/^Desconhecido$/i, "");
    const interno = nif === nifEmpresa || INTERNOS.test(nome);
    const tipo = interno ? "interno" : nifValido(nif) && /^[5679]/.test(nif) ? "empresa" : "particular";
    return { codigo, nome, nif, tipo, morada };
  }).filter((c) => c.codigo && !/^consumidor final$/i.test(c.codigo));
  const produtos = todos(um(doc, "MasterFiles"), "Product").map((p) => {
    const codigo = tf(p, "ProductCode"), descricao = tf(p, "ProductDescription");
    return { codigo, descricao, grupo: tf(p, "ProductGroup"), linha: linhaNegocio(descricao, codigo) };
  }).filter((p) => p.codigo);
  const vendas = [];
  const fat = um(doc, "SalesInvoices");
  if (fat) for (const inv of todos(fat, "Invoice")) {
    if (t(inv, "InvoiceStatus") === "A") continue; // anuladas
    const documento = tf(inv, "InvoiceNo"), tipo = tf(inv, "InvoiceType"), data = tf(inv, "InvoiceDate"), cliente = tf(inv, "CustomerID");
    for (const l of todos(inv, "Line")) {
      const cr = parseFloat(tf(l, "CreditAmount") || "0"), db = parseFloat(tf(l, "DebitAmount") || "0");
      vendas.push({ documento, linha: parseInt(tf(l, "LineNumber"), 10) || 0, tipo, data, cliente,
        produto: tf(l, "ProductCode"), descricao: tf(l, "ProductDescription"), qtd: parseFloat(tf(l, "Quantity") || "0"),
        preco: parseFloat(tf(l, "UnitPrice") || "0"), valor: Math.round((cr - db) * 10000) / 10000 });
    }
  }
  const acentos = clientes.filter((c) => c.nome.includes(MAU)).length + produtos.filter((p) => p.descricao.includes(MAU)).length;
  return { empresa: t(head, "CompanyName"), nifEmpresa, programa: t(head, "ProductID"), periodo: { de: t(head, "StartDate"), ate: t(head, "EndDate") },
    clientes, leads: [], produtos, vendas, acentos };
}
export function lerJson(texto) {
  const d = JSON.parse(texto);
  if (d.formato !== "central26-crm") throw new Error("Este ficheiro JSON não é um ficheiro de dados da Central 26.");
  const acentos = (d.clientes || []).filter((c) => String(c.nome).includes(MAU)).length;
  return { empresa: d.empresa || "", periodo: d.periodo || {}, clientes: d.clientes || [], leads: d.leads || [], produtos: d.produtos || [], vendas: d.vendas || [], acentos };
}

/* ============================== Módulo ============================== */
export function criarCrm(ctx) {
  const { S, api, esc, I, toast, falha, render, agendarRender, renderPainel, abrir, nomeDe, ativos, av, criarTarefa, $ } = ctx;
  const C = (S.crm = {
    estado: "por-carregar", erro: "", clientes: {}, produtos: {}, vendas: [], contactos: [], importacoes: [],
    tab: "clientes", vista: "clientes", q: "", fEtapa: "", fEstado: "", fDistrito: "", fResp: "", ordem: "", limite: 150,
    funilDistrito: "", funilResp: "", periodo: "", importacao: null, aImportar: null, versao: 0,
  });
  let cache = null, desligar = null;

  /* ---------- dados ---------- */
  async function carregar() {
    C.estado = "a-carregar"; agendarRender();
    try {
      const d = await api.crm.carregar();
      C.clientes = Object.fromEntries(d.clientes.map((c) => [c.id, c]));
      C.produtos = Object.fromEntries(d.produtos.map((p) => [p.codigo, p]));
      C.vendas = d.vendas; C.contactos = d.contactos; C.importacoes = d.importacoes;
      C.estado = "pronto"; C.versao++;
      if (!desligar && api.crm.subscrever) desligar = api.crm.subscrever(aoMudar);
    } catch (e) {
      C.estado = "erro";
      C.erro = /PGRST205|Could not find the table|crm_clientes/i.test(String(e?.message)) ? "falta-script" : e.message;
    }
    agendarRender();
    if (S.aberto?.tipo === "cliente") renderPainel(true);
  }
  function aoMudar(tabela, ev, novo, antigo) {
    if (tabela === "crm_clientes") { if (ev === "DELETE") delete C.clientes[antigo.id]; else C.clientes[novo.id] = novo; }
    if (tabela === "crm_contactos") {
      if (ev === "DELETE") C.contactos = C.contactos.filter((x) => x.id !== antigo.id);
      else if (!C.contactos.some((x) => x.id === novo.id)) C.contactos.unshift(novo);
    }
    C.versao++; agendarRender();
    if (S.aberto?.tipo === "cliente") renderPainel();
  }

  /* ---------- cálculos ---------- */
  function calc() {
    if (cache && cache.versao === C.versao) return cache;
    const porCod = new Map();
    let ref = "";
    for (const v of C.vendas) {
      if (v.data > ref) ref = v.data;
      let r = porCod.get(v.cliente_codigo);
      if (!r) porCod.set(v.cliente_codigo, (r = { total: 0, docs: new Map(), datas: new Set(), produtos: new Map(), nc: 0, tech: false }));
      r.total += +v.valor;
      if (v.tipo === "NC") { r.nc += +v.valor; continue; }
      r.datas.add(v.data);
      const d = r.docs.get(v.documento) || { documento: v.documento, data: v.data, valor: 0, itens: 0 };
      d.valor += +v.valor; d.itens += 1; r.docs.set(v.documento, d);
      const p = r.produtos.get(v.descricao) || { qtd: 0, valor: 0 };
      p.qtd += +v.qtd; p.valor += +v.valor; r.produtos.set(v.descricao, p);
      if (C.produtos[v.produto_codigo]?.linha === "tech") r.tech = true;
    }
    for (const r of porCod.values()) {
      const ds = [...r.datas].sort();
      r.primeira = ds[0]; r.ultima = ds[ds.length - 1]; r.compras = ds.length;
      r.dias = r.ultima ? diasEntre(r.ultima, ref) : null;
      const inter = ds.slice(1).map((d, i) => diasEntre(ds[i], d));
      r.ritmo = ds.length >= 3 ? Math.round(mediana(inter)) : null;
      r.estado = r.dias == null ? "sem" : r.dias <= 30 ? "ativo" : r.dias <= 90 ? "morno" : r.dias <= 180 ? "risco" : "perdido";
      r.aContactar = r.compras >= 4 && r.ritmo && r.dias > r.ritmo * 1.5;
    }
    cache = { versao: C.versao, porCod, ref };
    return cache;
  }
  const statsDe = (c) => (c.codigo_multixop ? calc().porCod.get(c.codigo_multixop) : null) || null;
  const estadoDe = (c) => statsDe(c)?.estado || "sem";
  const listaClientes = () => Object.values(C.clientes);
  const visiveis = () => listaClientes().filter((c) => c.tipo !== "interno");

  /* ---------- gravação ---------- */
  const timers = {};
  async function gravar(id, campos, silencioso) {
    const antes = C.clientes[id]; if (!antes) return;
    C.clientes[id] = { ...antes, ...campos }; C.versao++;
    agendarRender();
    try { const r = await api.crm.atualizar(id, campos); if (r) C.clientes[id] = r; C.versao++; agendarRender(); if (!silencioso) renderPainel(); }
    catch (e) { C.clientes[id] = antes; C.versao++; agendarRender(); renderPainel(true); falha(e); }
  }
  const adiar = (k, fn, ms = 700) => { clearTimeout(timers[k]); timers[k] = setTimeout(fn, ms); };

  /* ============================== Vistas ============================== */
  function vista() {
    if (C.estado === "por-carregar") carregar();
    const ref = C.estado === "pronto" ? calc().ref : "";
    let h = '<div class="cab"><div><div class="eyebrow neutro">Departamento Comercial' + (ref ? " · faturação até " + esc(rotData(ref)) : "") + "</div><h1>Comercial</h1></div>" +
      (C.estado === "pronto" ? '<div class="acts"><button class="btn pri" data-acao="crm-novo">' + I.plus + "Novo cliente ou lead</button></div>" : "") + "</div>";
    const tabs = [["clientes", "Clientes e leads"], ["funil", "Funil"], ["analise", "Análise"]];
    if (podeImportar(S.eu)) tabs.push(["importar", "Importar"]);
    h += '<div class="tabs" role="tablist">' + tabs.map(([k, r]) => '<button class="tab" role="tab" data-acao="crm-tab" data-tab="' + k + '" aria-selected="' + (C.tab === k) + '">' + r + "</button>").join("") + "</div>";
    if (C.estado === "erro") {
      if (C.erro === "falta-script") return h + '<div class="vazio"><h3>Falta instalar o CRM na base de dados</h3><p>No Supabase, abre o SQL Editor, cola o ficheiro <b>supabase/03-crm.sql</b> do GitHub e carrega em Run. Depois recarrega esta página.</p></div>';
      return h + '<div class="aviso erro">Não foi possível carregar o CRM: ' + esc(C.erro) + ' <button class="btn sec" data-acao="crm-recarregar">Tentar outra vez</button></div>';
    }
    if (C.estado !== "pronto") return h + '<div class="tabela">' + [1, 2, 3, 4].map((i) => '<div class="esqueleto"><i style="width:' + (30 + i * 12) + '%"></i></div>').join("") + "</div>";
    if (!listaClientes().length && C.tab !== "importar") {
      return h + '<div class="vazio"><h3>O CRM ainda está vazio</h3><p>Importa o ficheiro de dados iniciais (clientes e vendas do SAF-T de janeiro a setembro e as barbearias das bases de leads) ou um SAF-T exportado do Multixop.</p>' +
        (podeImportar(S.eu) ? '<div class="acts"><button class="btn pri" data-acao="crm-tab" data-tab="importar">Importar dados</button></div>' : "<p>Pede à administração ou ao chefe do Comercial para importar os dados.</p>") + "</div>";
    }
    if (C.tab === "funil") return h + vistaFunil();
    if (C.tab === "analise") return h + vistaAnalise();
    if (C.tab === "importar") return h + vistaImportar();
    return h + vistaClientes();
  }

  /* ---------- Clientes e leads ---------- */
  function filtrados() {
    const { porCod } = calc();
    const q = normalizar(C.q);
    let l = visiveis();
    if (C.vista === "clientes") l = l.filter((c) => c.etapa === "cliente" || porCod.has(c.codigo_multixop));
    else if (C.vista === "leads") l = l.filter((c) => c.etapa !== "cliente" && !porCod.has(c.codigo_multixop));
    if (C.fEtapa) l = l.filter((c) => c.etapa === C.fEtapa);
    if (C.fEstado) l = l.filter((c) => (C.fEstado === "contactar" ? statsDe(c)?.aContactar : estadoDe(c) === C.fEstado));
    if (C.fDistrito) l = l.filter((c) => (C.fDistrito === "sem" ? !c.distrito : c.distrito === C.fDistrito));
    if (C.fResp) l = l.filter((c) => (C.fResp === "nenhum" ? !c.responsavel_id : c.responsavel_id === C.fResp));
    if (q) l = l.filter((c) => normalizar([c.nome, c.nif, c.concelho, c.distrito, c.telefone, c.email, c.codigo_multixop].join(" ")).includes(q));
    const ordem = C.ordem || (C.vista === "leads" ? "score" : "total");
    const st = (c) => statsDe(c);
    const cmp = {
      total: (a, b) => (st(b)?.total || 0) - (st(a)?.total || 0),
      recente: (a, b) => String(st(b)?.ultima || "").localeCompare(String(st(a)?.ultima || "")),
      parado: (a, b) => (st(b)?.dias ?? -1) - (st(a)?.dias ?? -1),
      score: (a, b) => (b.score ?? -1) - (a.score ?? -1) || a.nome.localeCompare(b.nome, "pt"),
      nome: (a, b) => a.nome.localeCompare(b.nome, "pt"),
    }[ordem];
    return l.sort(cmp);
  }

  function vistaClientes() {
    const { porCod } = calc();
    const vs = visiveis();
    const compraram = vs.filter((c) => porCod.has(c.codigo_multixop));
    const n = (e) => compraram.filter((c) => porCod.get(c.codigo_multixop).estado === e).length;
    const aContactar = compraram.filter((c) => porCod.get(c.codigo_multixop).aContactar).length;
    const leads = vs.filter((c) => c.etapa === "lead").length;
    const resumo = [["", "Compraram", compraram.length], ["ativo", "Ativos", n("ativo")], ["morno", "Mornos", n("morno")], ["risco", "Em risco", n("risco")], ["perdido", "Perdidos", n("perdido")], ["contactar", "A contactar", aContactar]];
    let h = '<div class="resumo-crm">' + resumo.map(([k, r, v]) => '<button class="kpi' + (C.fEstado === k && k ? " on" : "") + (k === "contactar" ? " alerta-kpi" : "") + '" data-acao="crm-fest" data-v="' + k + '"><span>' + r + "</span><b>" + num(v) + "</b></button>").join("") +
      '<button class="kpi" data-acao="crm-vista" data-v="leads"><span>Leads por trabalhar</span><b>' + num(leads) + "</b></button></div>";
    const pessoas = ativos();
    h += '<div class="barra"><div class="seg" role="group" aria-label="Mostrar">' + [["clientes", "Clientes"], ["leads", "Leads"], ["todos", "Todos"]].map(([k, r]) => '<button data-acao="crm-vista" data-v="' + k + '" aria-pressed="' + (C.vista === k) + '">' + r + "</button>").join("") + "</div>" +
      '<div class="ferr"><label class="pesq">' + I.lupa + '<span class="sr">Pesquisar clientes</span><input id="crm-q" type="search" placeholder="Nome, NIF, concelho…" value="' + esc(C.q) + '"></label>' +
      sel("crm-fetapa", "Etapa", C.fEtapa, [["", "Todas as etapas"], ...Object.entries(ETAPAS)]) +
      (C.vista !== "leads" ? sel("crm-festado", "Estado", C.fEstado, [["", "Todos os estados"], ...Object.entries(ESTADOS).filter(([k]) => k !== "sem"), ["contactar", "A contactar"]]) : "") +
      sel("crm-fdist", "Distrito", C.fDistrito, [["", "Todos os distritos"], ["sem", "Sem distrito"], ...DISTRITOS.map((d) => [d, d])]) +
      sel("crm-fresp", "Responsável", C.fResp, [["", "Todos os responsáveis"], ["nenhum", "Sem responsável"], ...pessoas.map((p) => [p.id, p.nome])]) +
      sel("crm-ordem", "Ordenar", C.ordem || (C.vista === "leads" ? "score" : "total"), [["total", "Ordenar: maior valor"], ["recente", "Ordenar: compra mais recente"], ["parado", "Ordenar: mais tempo sem comprar"], ["score", "Ordenar: pontuação do lead"], ["nome", "Ordenar: nome"]]) +
      "</div></div>";
    const l = filtrados();
    h += '<div class="tabela-scroll"><table class="crm-tabela"><thead><tr><th>Cliente</th><th>Etapa</th><th>Estado</th><th class="n">Total</th><th>Última compra</th><th>Responsável</th></tr></thead><tbody>';
    h += l.slice(0, C.limite).map((c) => {
      const s = statsDe(c), e = s?.estado || "sem";
      const local = [c.concelho, c.distrito].filter(Boolean).join(", ");
      const sub = [TIPOS[c.tipo] || "", local, c.nif && c.tipo !== "lead" ? "NIF " + c.nif : "", c.origem === "base_leads" && c.score != null ? "pontuação " + c.score : ""].filter(Boolean).join(" · ");
      return '<tr data-acao="crm-abrir" data-id="' + c.id + '" tabindex="0"><td><span class="c-nome">' + esc(c.nome) + (s?.aContactar ? ' <span class="pill-at">A contactar</span>' : "") + "</span><small>" + esc(sub) + "</small></td>" +
        '<td><span class="etapa e-' + c.etapa + '">' + ETAPAS[c.etapa] + "</span></td>" +
        "<td>" + (s ? '<span class="rec r-' + e + '" title="' + esc(ESTADO_AJUDA[e]) + '"><i></i>' + ESTADOS[e] + "</span>" : '<span class="muted">—</span>') + "</td>" +
        '<td class="n">' + (s ? eur(s.total) : "—") + "</td><td>" + (s ? esc(rotData(s.ultima)) + '<small>há ' + s.dias + " dias</small>" : "—") + "</td>" +
        "<td>" + (c.responsavel_id ? '<span class="resp">' + av(c.responsavel_id) + "<span>" + esc(nomeDe(c.responsavel_id).split(" ")[0]) + "</span></span>" : '<span class="muted">—</span>') + "</td></tr>";
    }).join("");
    if (!l.length) h += '<tr><td colspan="6" class="vazio-linha">Nenhum cliente corresponde aos filtros.</td></tr>';
    h += "</tbody></table></div>";
    if (l.length > C.limite) h += '<button class="mostrar-feitas" data-acao="crm-mais">' + I.seta + "Mostrar mais (" + num(l.length - C.limite) + ")</button>";
    else if (l.length) h += '<p class="nota-tab">' + num(l.length) + (l.length === 1 ? " registo" : " registos") + "</p>";
    return h;
  }
  function sel(id, rotulo, atual, opcoes) {
    return '<label class="sr" for="' + id + '">' + rotulo + '</label><select class="sel" id="' + id + '">' + opcoes.map(([k, r]) => '<option value="' + esc(k) + '"' + (String(atual) === String(k) ? " selected" : "") + ">" + esc(r) + "</option>").join("") + "</select>";
  }

  /* ---------- Funil ---------- */
  function vistaFunil() {
    let l = visiveis();
    if (C.funilDistrito) l = l.filter((c) => c.distrito === C.funilDistrito);
    if (C.funilResp) l = l.filter((c) => (C.funilResp === "nenhum" ? !c.responsavel_id : c.responsavel_id === C.funilResp));
    const cont = Object.fromEntries(Object.keys(ETAPAS).map((k) => [k, l.filter((c) => c.etapa === k)]));
    let h = '<div class="barra"><div class="periodo"><b>Funil de vendas</b><span>Arrasta um cartão para mudar de etapa. Um lead que compra passa sozinho a cliente na importação seguinte.</span></div><div class="ferr">' +
      sel("crm-fundist", "Distrito", C.funilDistrito, [["", "Todos os distritos"], ...DISTRITOS.map((d) => [d, d])]) +
      sel("crm-funresp", "Responsável", C.funilResp, [["", "Todos os responsáveis"], ["nenhum", "Sem responsável"], ...ativos().map((p) => [p.id, p.nome])]) + "</div></div>";
    const ganhos = cont.cliente.filter((c) => c.origem !== "multixop").length;
    const notas = { lead: "por contactar", contactado: "já houve conversa", proposta: "proposta enviada", cliente: ganhos ? num(ganhos) + " vieram de leads" : "clientes do Multixop" };
    h += '<div class="conversao">' + ["lead", "contactado", "proposta", "cliente"].map((k) =>
      '<div><span>' + ETAPAS[k] + "</span><b>" + num(cont[k].length) + "</b><small>" + notas[k] + "</small></div>").join('<span class="seta">' + I.seta + "</span>") + "</div>";
    h += '<div class="funil">';
    for (const [k, rot] of Object.entries(ETAPAS)) {
      const ord = cont[k].sort((a, b) => (statsDe(b)?.total || 0) - (statsDe(a)?.total || 0) || (b.score ?? -1) - (a.score ?? -1));
      const tot = ord.reduce((s, c) => s + (statsDe(c)?.total || 0), 0);
      h += '<div class="col funil-col" data-etapa="' + k + '"><div class="col-h"><span class="etapa e-' + k + '">' + rot + '</span><span class="n">' + num(ord.length) + "</span>" + (tot ? '<span class="n" style="margin-left:auto">' + eur(tot) + "</span>" : "") + "</div>";
      h += ord.slice(0, 40).map((c) => {
        const s = statsDe(c);
        return '<div class="cartao" draggable="true" data-acao="crm-abrir" data-id="' + c.id + '" data-cliente="1" tabindex="0" role="button"><span class="t">' + esc(c.nome) + '</span><span class="meta">' +
          (c.concelho || c.distrito ? "<span>" + esc(c.concelho || c.distrito) + "</span>" : "") + (s ? '<span class="mono">' + eur(s.total) + "</span>" : c.score != null ? '<span class="mono">' + c.score + " pts</span>" : "") +
          (c.responsavel_id ? av(c.responsavel_id) : "") + "</span></div>";
      }).join("");
      if (ord.length > 40) h += '<button class="add" data-acao="crm-ver-etapa" data-v="' + k + '">E mais ' + num(ord.length - 40) + " · ver na lista</button>";
      h += "</div>";
    }
    return h + "</div>";
  }

  /* ---------- Análise ---------- */
  function vistaAnalise() {
    const meses = [...new Set(C.vendas.map((v) => v.data.slice(0, 7)))].sort();
    const p = C.periodo;
    const vendas = !p ? C.vendas : p === "3m" ? C.vendas.filter((v) => meses.slice(-3).includes(v.data.slice(0, 7))) : C.vendas.filter((v) => v.data.startsWith(p));
    const ft = vendas.filter((v) => v.tipo !== "NC"), nc = vendas.filter((v) => v.tipo === "NC");
    const total = vendas.reduce((s, v) => s + +v.valor, 0);
    const docs = new Set(ft.map((v) => v.documento)), compradores = new Set(ft.map((v) => v.cliente_codigo));
    const devol = nc.reduce((s, v) => s + +v.valor, 0);
    const precoMed = {};
    for (const v of ft) if (+v.preco > 0) { const x = (precoMed[v.produto_codigo] ||= { q: 0, val: 0 }); x.q += +v.qtd; x.val += +v.valor; }
    const ofertas = ft.filter((v) => +v.preco === 0 && +v.qtd > 0);
    const valorOfertas = ofertas.reduce((s, v) => s + (precoMed[v.produto_codigo]?.q ? (precoMed[v.produto_codigo].val / precoMed[v.produto_codigo].q) * v.qtd : 0), 0);
    const opcoesPeriodo = [["", "Todo o período"], ["3m", "Últimos 3 meses"],
      ...meses.map((m) => [m, MES_L[+m.slice(5) - 1].replace(/^./, (x) => x.toUpperCase()) + " " + m.slice(0, 4)])];
    let h = '<div class="barra"><div class="periodo"><b>Vendas da faturação (sem IVA)</b><span>Fonte: SAF-T do Multixop' + (C.vendas.length ? ", " + esc(rotData(C.vendas[0].data)) + " a " + esc(rotData(calc().ref)) : "") + '. As notas de crédito já estão descontadas.</span></div><div class="ferr">' + sel("crm-periodo", "Período", p, opcoesPeriodo) + "</div></div>";
    h += '<div class="dados">' +
      dado("Vendas", eur(total)) + dado("Faturas", num(docs.size)) + dado("Clientes que compraram", num(compradores.size)) +
      dado("Valor médio por fatura", eur(docs.size ? (total - devol) / docs.size : 0)) +
      dado("Devoluções (notas de crédito)", eur(-devol), devol < 0 ? "at" : "") + dado("Ofertas", num(ofertas.reduce((s, v) => s + +v.qtd, 0)) + " un.", "", "≈ " + eur(valorOfertas) + " em produto") + "</div>";

    // por mês
    if (!p || p === "3m") {
      const porMes = meses.filter((m) => !p || meses.slice(-3).includes(m)).map((m) => [m, vendas.filter((v) => v.data.startsWith(m)).reduce((s, v) => s + +v.valor, 0)]);
      h += '<section class="cartao-sec"><h3>Vendas por mês</h3>' + barrasMes(porMes) + (porMes.length && porMes[porMes.length - 1][0] === meses[meses.length - 1] && calc().ref.slice(8) !== "31" && +calc().ref.slice(8) < 28 ? '<p class="nota-tab">O último mês está incompleto: os dados vão até ' + esc(rotData(calc().ref)) + ".</p>" : "") + "</section>";
    }
    // por linha de negócio
    const porLinha = {};
    for (const v of vendas) { const k = C.produtos[v.produto_codigo]?.linha || "produtos"; porLinha[k] = (porLinha[k] || 0) + +v.valor; }
    h += '<div class="duas"><section class="cartao-sec"><h3>Por linha de negócio</h3>' + barrasH(Object.entries(porLinha).sort((a, b) => b[1] - a[1]).map(([k, v]) => [LINHAS[k] || k, v]), total) + "</section>";
    // estado dos clientes
    const { porCod } = calc();
    const segs = ["ativo", "morno", "risco", "perdido"].map((e) => [e, visiveis().filter((c) => porCod.get(c.codigo_multixop)?.estado === e).length]);
    const totSeg = segs.reduce((s, x) => s + x[1], 0);
    h += '<section class="cartao-sec"><h3>Estado dos clientes</h3><p>Conta os dias desde a última compra até ' + esc(rotData(calc().ref)) + ".</p>" +
      barrasH(segs.map(([e, n]) => [ESTADOS[e] + " · " + ESTADO_AJUDA[e], n]), totSeg, true) + "</section></div>";

    // produtos
    const porProd = new Map();
    for (const v of vendas) {
      const k = v.produto_codigo || v.descricao;
      const x = porProd.get(k) || { desc: C.produtos[v.produto_codigo]?.descricao || v.descricao, qtd: 0, valor: 0, clientes: new Set() };
      if (v.tipo !== "NC") { x.qtd += +v.qtd; x.clientes.add(v.cliente_codigo); }
      x.valor += +v.valor; porProd.set(k, x);
    }
    const prods = [...porProd.values()].filter((x) => x.qtd > 0 && x.valor > 0).sort((a, b) => b.valor - a.valor);
    const tabelaProd = (lista) => '<div class="tabela-scroll"><table class="ranking"><thead><tr><th>Produto</th><th class="n">Unidades</th><th class="n">Valor</th><th class="n">Clientes</th></tr></thead><tbody>' +
      lista.map((x) => "<tr><td>" + esc(x.desc) + '</td><td class="n">' + num(x.qtd) + '</td><td class="n">' + eur(x.valor) + '</td><td class="n">' + x.clientes.size + "</td></tr>").join("") + "</tbody></table></div>";
    const top10 = prods.slice(0, 10).reduce((s, x) => s + x.valor, 0);
    h += '<div class="duas"><section class="cartao-sec"><h3>Mais vendidos</h3><p>Os 10 primeiros fazem ' + (total ? Math.round((top10 / total) * 100) : 0) + "% das vendas.</p>" + tabelaProd(prods.slice(0, 12)) + "</section>";
    const nunca = Object.values(C.produtos).filter((x) => !porProd.has(x.codigo));
    h += '<section class="cartao-sec"><h3>Menos vendidos</h3><p>Produtos com vendas pagas no período, do menor para o maior valor. Os que só saíram como oferta não entram aqui.</p>' + tabelaProd(prods.slice(-10).reverse()) +
      '<details class="nunca"><summary>' + num(nunca.length) + " produtos do catálogo não venderam nada neste período</summary><ul>" + nunca.slice(0, 200).map((x) => "<li>" + esc(x.descricao) + "</li>").join("") + (nunca.length > 200 ? "<li>…</li>" : "") + "</ul></details></section></div>";

    // a contactar + aniversários
    const contactar = visiveis().filter((c) => statsDe(c)?.aContactar).sort((a, b) => statsDe(b).dias - statsDe(a).dias);
    const mesAtual = new Date().getMonth(), mesSeg = (mesAtual + 1) % 12;
    const anos = visiveis().filter((c) => c.data_aniversario).map((c) => ({ c, m: +c.data_aniversario.slice(5, 7) - 1, d: +c.data_aniversario.slice(8) }))
      .filter((x) => x.m === mesAtual || x.m === mesSeg).sort((a, b) => ((a.m - mesAtual + 12) % 12) - ((b.m - mesAtual + 12) % 12) || a.d - b.d);
    h += '<div class="duas"><section class="cartao-sec"><h3>A contactar <span class="mono" style="color:var(--faint);font-weight:400">' + contactar.length + "</span></h3><p>Clientes que costumam encomendar com regularidade e já passaram 1,5 vezes o seu intervalo habitual.</p>" +
      (contactar.length ? '<div class="lista-crm">' + contactar.map((c) => { const s = statsDe(c); return '<div class="lc"><button class="c-link" data-acao="crm-abrir" data-id="' + c.id + '">' + esc(c.nome) + "</button><small>encomenda a cada " + s.ritmo + " dias · sem comprar há " + s.dias + ' dias</small><button class="btn sec" data-acao="crm-tarefa" data-id="' + c.id + '">' + I.plus + "Tarefa</button></div>"; }).join("") + "</div>" : '<p class="muted">Ninguém em atraso.</p>') + "</section>";
    h += '<section class="cartao-sec"><h3>Aniversários</h3><p>Este mês e o próximo. A data preenche-se na ficha de cada cliente.</p>' +
      (anos.length ? '<div class="lista-crm">' + anos.map(({ c, m, d }) => '<div class="lc"><button class="c-link" data-acao="crm-abrir" data-id="' + c.id + '">' + esc(c.nome) + "</button><small>" + d + " de " + MES_L[m] + "</small></div>").join("") + "</div>" : '<p class="muted">Ainda não há datas de aniversário preenchidas.</p>') + "</section></div>";

    // por distrito
    const linhas = DISTRITOS.map((d) => {
      const doD = visiveis().filter((c) => c.distrito === d);
      return { d, clientes: doD.filter((c) => porCod.has(c.codigo_multixop)).length, ativos: doD.filter((c) => ["ativo", "morno"].includes(porCod.get(c.codigo_multixop)?.estado)).length,
        leads: doD.filter((c) => c.etapa === "lead").length, emCurso: doD.filter((c) => ["contactado", "proposta"].includes(c.etapa)).length };
    }).filter((x) => x.clientes || x.leads || x.emCurso).sort((a, b) => b.ativos - a.ativos || b.leads - a.leads);
    const semDist = visiveis().filter((c) => porCod.has(c.codigo_multixop) && !c.distrito).length;
    h += '<section class="cartao-sec"><h3>Por distrito</h3><p>Clientes ativos são os que compraram nos últimos 90 dias. Leads disponíveis são barbearias que ainda não foram contactadas.' + (semDist ? " " + num(semDist) + " clientes ainda não têm distrito: preenche-o na ficha para aparecerem aqui." : "") + "</p>" +
      '<div class="tabela-scroll"><table class="ranking"><thead><tr><th>Distrito</th><th class="n">Clientes ativos</th><th class="n">Clientes</th><th class="n">Em negociação</th><th class="n">Leads disponíveis</th></tr></thead><tbody>' +
      linhas.map((x) => '<tr><td><button class="c-link" data-acao="crm-distrito" data-v="' + esc(x.d) + '">' + esc(x.d) + '</button></td><td class="n">' + x.ativos + '</td><td class="n">' + x.clientes + '</td><td class="n">' + x.emCurso + '</td><td class="n">' + x.leads + "</td></tr>").join("") +
      "</tbody></table></div></section>";
    h += '<p class="nota-tab">Os gastos fixos (rendas, fornecedores, viaturas) não estão no SAF-T de vendas; vão ficar no módulo do Financeiro.</p>';
    return h;
  }
  const dado = (rot, val, cls = "", nota = "") => '<div class="dado"><span>' + esc(rot) + '</span><b class="' + cls + '">' + val + "</b>" + (nota ? "<small>" + esc(nota) + "</small>" : "") + "</div>";

  function barrasMes(pares) {
    if (!pares.length) return '<p class="muted">Sem vendas no período.</p>';
    const max = Math.max(...pares.map((x) => x[1]), 1), W = 640, H = 220, pe = 28, topo = 22, larg = (W - 8) / pares.length, bw = Math.min(46, larg * 0.62);
    const passo = Math.pow(10, Math.floor(Math.log10(max))) * (max / Math.pow(10, Math.floor(Math.log10(max))) > 5 ? 2 : max / Math.pow(10, Math.floor(Math.log10(max))) > 2 ? 1 : 0.5);
    const linhas = []; for (let v = passo; v <= max; v += passo) linhas.push(v);
    const y = (v) => H - pe - (v / max) * (H - pe - topo);
    let s = '<div class="grafico"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Vendas por mês">';
    s += linhas.map((v) => '<line x1="0" x2="' + W + '" y1="' + y(v) + '" y2="' + y(v) + '" class="g-grelha"/><text x="' + W + '" y="' + (y(v) - 4) + '" class="g-eixo" text-anchor="end">' + (v >= 1000 ? (v / 1000).toLocaleString("pt-PT") + " mil" : v) + "</text>").join("");
    s += '<line x1="0" x2="' + W + '" y1="' + (H - pe) + '" y2="' + (H - pe) + '" class="g-base"/>';
    pares.forEach(([m, v], i) => {
      const cx = 4 + larg * i + larg / 2, yy = y(Math.max(v, 0)), alt = Math.max(1, H - pe - yy), r = Math.min(4, alt / 2, bw / 2);
      s += '<g class="g-barra"><title>' + MES_L[+m.slice(5) - 1] + " " + m.slice(0, 4) + ": " + eur(v) + "</title>" +
        '<rect x="' + (cx - larg / 2) + '" y="' + topo + '" width="' + larg + '" height="' + (H - pe - topo) + '" class="g-alvo"/>' +
        '<path d="M' + (cx - bw / 2) + "," + (H - pe) + " V" + (yy + r) + " Q" + (cx - bw / 2) + "," + yy + " " + (cx - bw / 2 + r) + "," + yy + " H" + (cx + bw / 2 - r) + " Q" + (cx + bw / 2) + "," + yy + " " + (cx + bw / 2) + "," + (yy + r) + " V" + (H - pe) + ' Z" class="g-marca"/>' +
        '<text x="' + cx + '" y="' + (yy - 6) + '" class="g-valor" text-anchor="middle">' + (v >= 1000 ? (v / 1000).toLocaleString("pt-PT", { maximumFractionDigits: 1 }) + " mil" : Math.round(v)) + "</text>" +
        '<text x="' + cx + '" y="' + (H - 8) + '" class="g-eixo" text-anchor="middle">' + MES[+m.slice(5) - 1] + "</text></g>";
    });
    return s + "</svg></div>";
  }
  function barrasH(pares, total, contagem) {
    const max = Math.max(...pares.map((x) => x[1]), 1);
    return '<div class="barras-h">' + pares.map(([r, v]) => '<div class="bh"><span class="bh-r">' + esc(r) + '</span><span class="bh-v">' + (contagem ? num(v) : eur(v)) + (total ? ' <small>' + Math.round((v / total) * 100) + "%</small>" : "") + '</span><div class="barra-p"><i style="width:' + Math.max(1, (v / max) * 100) + '%"></i></div></div>').join("") + "</div>";
  }

  /* ---------- Importar ---------- */
  function vistaImportar() {
    const im = C.importacao, a = C.aImportar;
    let h = '<section class="cartao-sec"><h3>Importar faturação do Multixop</h3><p>No Multixop, exporta o ficheiro SAF-T (.xml) do período que queres e carrega-o aqui. Os clientes, produtos e vendas desse período são atualizados. Nada do que foi preenchido no CRM (aniversários, contactos, notas, responsável, etapa, nomes corrigidos) é apagado.</p>' +
      '<p>Também aceita o ficheiro de dados iniciais da Central 26 (.json), com os clientes, as vendas de janeiro a setembro e as barbearias das bases de leads.</p>' +
      '<div class="acts"><label class="btn pri" for="crm-ficheiro">' + I.plus + 'Escolher ficheiro</label><input id="crm-ficheiro" type="file" accept=".xml,.json,application/xml,text/xml,application/json" hidden></div></section>';
    if (a) h += '<div class="aviso">A importar… ' + esc(a) + "</div>";
    else if (im?.erro) h += '<div class="aviso erro">' + esc(im.erro) + "</div>";
    else if (im) {
      const d = im.dados, total = d.vendas.reduce((s, v) => s + v.valor, 0), docs = new Set(d.vendas.map((v) => v.documento)).size;
      h += '<section class="cartao-sec"><h3>' + esc(im.nome) + "</h3>" +
        '<div class="dados">' + dado("Empresa", esc(d.empresa || "—")) + dado("Período", esc(rotData(d.periodo?.de) + " a " + rotData(d.periodo?.ate))) +
        dado("Clientes", num(d.clientes.length)) + (d.leads.length ? dado("Leads", num(d.leads.length)) : "") + dado("Produtos", num(d.produtos.length)) +
        dado("Faturas e notas de crédito", num(docs)) + dado("Vendas sem IVA", eur(total)) + "</div>" +
        (d.acentos ? '<div class="aviso">' + num(d.acentos) + " nomes têm acentos estragados no ficheiro (aparecem com «" + MAU + "»). Os nomes que já estão certos no CRM não são substituídos. Para evitar isto, envia o XML tal como sai do Multixop, sem o abrir noutro programa.</div>" : "") +
        '<div class="aviso">As vendas já guardadas entre ' + esc(rotData(d.periodo?.de)) + " e " + esc(rotData(d.periodo?.ate)) + " são substituídas pelas deste ficheiro (assim, faturas anuladas desaparecem).</div>" +
        '<div class="acts"><button class="btn pri" data-acao="crm-importar">Importar agora</button><button class="btn sec" data-acao="crm-imp-cancelar">Cancelar</button></div></section>';
    }
    if (C.importacoes.length) {
      h += '<section><h2>Importações anteriores</h2><div class="feed">' + C.importacoes.map((x) => '<div class="feed-item">' + av(x.autor_id) + '<span class="txt"><b>' + esc(nomeDe(x.autor_id) || "Alguém") + "</b> importou " + esc(x.ficheiro || "um ficheiro") +
        " · " + num(x.clientes) + " clientes" + (x.leads ? ", " + num(x.leads) + " leads" : "") + ", " + num(x.vendas) + " linhas de venda (" + eur(x.total) + ")" + (x.periodo_de ? " · " + esc(rotData(x.periodo_de)) + " a " + esc(rotData(x.periodo_ate)) : "") + '</span><span class="q">' + haQuanto(x.criado_em) + "</span></div>").join("") + "</div></section>";
    }
    return h;
  }

  async function lerFicheiro(f) {
    C.importacao = null; agendarRender();
    try {
      const buf = await f.arrayBuffer();
      const texto = decodificar(buf);
      const dados = /\.json$/i.test(f.name) || texto.trim().startsWith("{") ? lerJson(texto) : lerSaft(texto);
      if (!dados.clientes.length && !dados.vendas.length && !dados.leads.length) throw new Error("O ficheiro não tem clientes nem vendas.");
      C.importacao = { nome: f.name, dados };
    } catch (e) { C.importacao = { erro: "Não foi possível ler o ficheiro: " + e.message }; }
    render();
  }

  async function importar() {
    const d = C.importacao?.dados; if (!d) return;
    const partes = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
    const pedidos = [];
    if (d.produtos.length) pedidos.push({ produtos: d.produtos });
    partes(d.clientes, 400).forEach((x) => pedidos.push({ clientes: x }));
    partes(d.leads, 400).forEach((x) => pedidos.push({ leads: x }));
    const pv = partes(d.vendas, 700);
    pv.forEach((x, i) => pedidos.push(i === 0 && d.periodo?.de && d.periodo?.ate ? { vendas: x, limpar_de: d.periodo.de, limpar_ate: d.periodo.ate } : { vendas: x }));
    pedidos.push({ registo: { ficheiro: C.importacao.nome, de: d.periodo?.de || "", ate: d.periodo?.ate || "", clientes: d.clientes.length, leads: d.leads.length,
      produtos: d.produtos.length, vendas: d.vendas.length, total: Math.round(d.vendas.reduce((s, v) => s + v.valor, 0) * 100) / 100 } });
    try {
      for (let i = 0; i < pedidos.length; i++) { C.aImportar = "parte " + (i + 1) + " de " + pedidos.length; render(); await api.crm.importar(pedidos[i]); }
      C.aImportar = null; C.importacao = null;
      await carregar();
      C.tab = "clientes"; render();
      toast("Importação concluída: " + num(d.clientes.length) + " clientes" + (d.leads.length ? ", " + num(d.leads.length) + " leads" : "") + " e " + num(d.vendas.length) + " linhas de venda");
    } catch (e) { C.aImportar = null; render(); falha(e); }
  }

  /* ============================== Ficha (painel) ============================== */
  function painel(a) {
    if (a.tipo === "crm-novo") return painelNovo();
    const c = C.clientes[a.id];
    const moldura = (conteudo, pe) => '<div class="veu" data-acao="fechar"></div><aside class="painel largo" role="dialog" aria-label="Ficha de cliente" data-marca="twentysix"><div class="p-scroll">' + conteudo + "</div>" + (pe ? '<div class="p-pe">' + pe + "</div>" : "") + "</aside>";
    if (!c) return moldura('<div class="p-topo"><span class="migalha">Comercial</span><button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + "</button></div>" +
      (C.estado === "pronto" ? '<div class="vazio"><h3>Cliente indisponível</h3><p>Foi eliminado ou não tens acesso.</p></div>' : '<div class="esqueleto"><i style="width:60%"></i></div>'));
    const s = statsDe(c), e = s?.estado || "sem";
    let h = '<div class="p-topo"><span class="migalha"><i></i>Comercial / ' + esc(c.etapa === "cliente" ? "Cliente" : "Lead") + '</span><span class="acts">' +
      '<button class="ib" data-acao="crm-tarefa" data-id="' + c.id + '">' + I.plus + "Tarefa</button>" +
      (c.tipo !== "interno" ? '<button class="ib" data-acao="enc-nova" data-cliente="' + c.id + '">' + (I.camiao || I.plus) + "Encomenda</button>" : "") +
      (podeImportar(S.eu) ? '<button class="ib perigo" data-acao="crm-apagar" data-id="' + c.id + '">' + I.lixo + "Eliminar</button>" : "") +
      '<button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + "</button></span></div>";
    if (a.confirmarApagar) h += '<div class="aviso erro" style="justify-content:space-between;flex-wrap:wrap">Eliminar «' + esc(c.nome) + '» e o histórico de contactos? As vendas do Multixop não são apagadas.<span class="acts"><button class="btn sec" data-acao="crm-apagar-nao">Cancelar</button><button class="btn perigo" data-acao="crm-apagar-sim" data-id="' + c.id + '">Eliminar</button></span></div>';
    h += '<textarea id="cf-nome" class="p-titulo" rows="1">' + esc(c.nome) + "</textarea>";
    if (c.nome.includes(MAU)) h += '<div class="aviso">O nome veio do Multixop com acentos estragados («' + MAU + '»). Corrige-o aqui: as próximas importações não o voltam a mudar.</div>';
    h += '<div class="chips"><span class="etapa e-' + c.etapa + '">' + ETAPAS[c.etapa] + "</span>" + (s ? '<span class="rec r-' + e + '"><i></i>' + ESTADOS[e] + " · " + esc(ESTADO_AJUDA[e]) + "</span>" : "") +
      (s?.aContactar ? '<span class="pill-at">A contactar</span>' : "") + "<span>" + esc(TIPOS[c.tipo] || "") + "</span>" + (c.codigo_multixop ? '<span class="mono">Multixop ' + esc(c.codigo_multixop) + "</span>" : "") + "</div>";
    if (s) h += '<div class="dados">' + dado("Total no período", eur(s.total)) + dado("Faturas", num(s.docs.size)) + dado("Última compra", esc(rotData(s.ultima)), "", "há " + s.dias + " dias") +
      dado("Encomenda a cada", s.ritmo ? s.ritmo + " dias" : "—", "", s.ritmo ? "mediana entre compras" : "precisa de 3 compras") + (s.nc ? dado("Devoluções", eur(-s.nc), "at") : "") + "</div>";
    const pessoas = ativos();
    const campo = (id, rot, val, tipo = "text", extra = "") => '<label for="' + id + '">' + rot + '</label><input id="' + id + '" type="' + tipo + '" value="' + esc(val || "") + '"' + extra + ">";
    h += '<div class="props">' +
      '<label for="cf-etapa">Etapa</label><select id="cf-etapa">' + Object.entries(ETAPAS).map(([k, r]) => '<option value="' + k + '"' + (c.etapa === k ? " selected" : "") + ">" + r + "</option>").join("") + "</select>" +
      '<label for="cf-resp">Responsável</label><select id="cf-resp"><option value="">Sem responsável</option>' + pessoas.map((p) => '<option value="' + p.id + '"' + (c.responsavel_id === p.id ? " selected" : "") + ">" + esc(p.nome) + "</option>").join("") + "</select>" +
      '<label for="cf-tipo">Tipo</label><select id="cf-tipo">' + Object.entries(TIPOS).map(([k, r]) => '<option value="' + k + '"' + (c.tipo === k ? " selected" : "") + ">" + r + "</option>").join("") + "</select>" +
      campo("cf-aniv", "Aniversário", c.data_aniversario, "date") +
      campo("cf-tel", "Telefone", c.telefone, "tel", ' autocomplete="off"') + campo("cf-email", "Email", c.email, "email", ' autocomplete="off"') +
      campo("cf-ig", "Instagram", c.instagram, "url", ' placeholder="https://instagram.com/…"') + campo("cf-web", "Site", c.website, "url", ' placeholder="https://…"') +
      campo("cf-morada", "Morada", c.morada) + campo("cf-cp", "Código postal", c.codigo_postal, "text", ' inputmode="numeric" placeholder="4400-000"') +
      campo("cf-freg", "Freguesia", c.freguesia) + campo("cf-conc", "Concelho", c.concelho) +
      '<label for="cf-dist">Distrito</label><select id="cf-dist"><option value="">—</option>' + DISTRITOS.map((d) => '<option' + (c.distrito === d ? " selected" : "") + ">" + d + "</option>").join("") + "</select>" +
      campo("cf-nif", "NIF", c.nif, "text", ' inputmode="numeric"') +
      (c.origem === "multixop" ? "" : campo("cf-cod", "Código no Multixop", c.codigo_multixop, "text", ' placeholder="Quando passar a cliente"') + '<span class="ajuda">Preenche quando este lead for criado no Multixop: as compras passam a aparecer aqui.</span>') +
      "</div>";
    const links = [c.telefone && '<span>' + I.tel + esc(c.telefone) + "</span>", c.email && "<span>" + I.mail + esc(c.email) + "</span>",
      c.instagram && /^https?:/.test(c.instagram) && '<a href="' + esc(c.instagram) + '" target="_blank" rel="noopener">Instagram ' + I.out + "</a>", c.website && /^https?:/.test(c.website) && '<a href="' + esc(c.website) + '" target="_blank" rel="noopener">Site ' + I.out + "</a>"].filter(Boolean);
    if (links.length) h += '<div class="contactos">' + links.join("") + "</div>";
    h += '<section class="p-sec"><h3>Notas</h3><textarea id="cf-notas" class="notas" placeholder="O que é preciso saber sobre este cliente…">' + esc(c.notas) + "</textarea></section>";
    // contactos
    const cont = C.contactos.filter((x) => x.cliente_id === c.id);
    h += '<section class="p-sec"><h3>Contactos <span class="mono">' + cont.length + "</span></h3>" +
      '<form class="form-contacto" id="form-contacto" data-id="' + c.id + '"><div class="linha-form"><label class="sr" for="ct-tipo">Tipo</label><select id="ct-tipo" class="sel">' + Object.entries(TIPOS_CONTACTO).map(([k, r]) => '<option value="' + k + '">' + r + "</option>").join("") + "</select>" +
      '<label class="sr" for="ct-texto">O que aconteceu</label><input id="ct-texto" class="inp" placeholder="O que aconteceu? Ex.: pediu catálogo das cadeiras" autocomplete="off"></div>' +
      '<div class="linha-form"><label class="sr" for="ct-prox">Próximo passo</label><input id="ct-prox" class="inp" placeholder="Próximo passo (opcional)" autocomplete="off"><label class="sr" for="ct-data">Data do próximo passo</label><input id="ct-data" class="inp" type="date"></div>' +
      '<div class="linha-form"><label class="chk-txt"><input type="checkbox" id="ct-tarefa" checked> Criar tarefa com o próximo passo</label><button class="btn pri" type="submit">Registar contacto</button></div></form>';
    h += cont.length ? '<div class="feed">' + cont.map((x) => '<div class="feed-item">' + av(x.autor_id) + '<span class="txt"><b>' + esc(TIPOS_CONTACTO[x.tipo] || x.tipo) + "</b> · " + esc(nomeDe(x.autor_id) || "Alguém") +
      (x.texto ? "<br>" + esc(x.texto) : "") + (x.proximo_passo ? '<br><span class="muted">Próximo passo: ' + esc(x.proximo_passo) + (x.data_proximo ? " · " + esc(rotData(x.data_proximo)) : "") + "</span>" : "") + '</span><span class="q">' + haQuanto(x.criado_em) + "</span></div>").join("") + "</div>" : '<p class="muted" style="margin:0">Ainda sem contactos registados.</p>';
    h += "</section>";
    if (s) {
      const prefs = [...s.produtos.entries()].sort((a, b) => b[1].qtd - a[1].qtd).slice(0, 8);
      h += '<section class="p-sec"><h3>O que compra</h3><div class="barras-h">' + prefs.map(([d, x]) => '<div class="bh"><span class="bh-r">' + esc(d) + '</span><span class="bh-v">' + num(x.qtd) + " un. <small>" + eur(x.valor) + '</small></span><div class="barra-p"><i style="width:' + Math.max(2, (x.qtd / prefs[0][1].qtd) * 100) + '%"></i></div></div>').join("") + "</div></section>";
      const docs = [...s.docs.values()].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 12);
      h += '<section class="p-sec"><h3>Faturas recentes</h3><div class="hist">' + docs.map((d) => '<div><span>' + esc(rotData(d.data)) + " · " + esc(d.documento) + " · " + d.itens + (d.itens === 1 ? " linha" : " linhas") + '</span><span class="mono">' + eur(d.valor, 2) + "</span></div>").join("") + "</div></section>";
    }
    const pe = "<span>" + (c.origem === "base_leads" ? "Veio das bases de barbearias" : c.origem === "multixop" ? "Veio do Multixop" : "Criado à mão") + (c.atualizado_por ? " · alterado por " + esc(nomeDe(c.atualizado_por) || "—") + " " + haQuanto(c.atualizado_em) : "") + "</span>";
    return moldura(h, pe);
  }

  function painelNovo() {
    const c = '<div class="p-topo"><span class="migalha"><i></i>Comercial</span><button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + '</button></div><h2 style="margin:0">Novo cliente ou lead</h2>' +
      '<form class="form" id="form-crm-novo" novalidate><div class="campo"><label for="cn-nome">Nome</label><input id="cn-nome" required autocomplete="off" placeholder="Ex.: Barbearia do Zé"></div>' +
      '<div class="campos-2"><div class="campo"><label for="cn-etapa">Etapa</label><select id="cn-etapa">' + Object.entries(ETAPAS).map(([k, r]) => '<option value="' + k + '"' + (k === "lead" ? " selected" : "") + ">" + r + "</option>").join("") + "</select></div>" +
      '<div class="campo"><label for="cn-dist">Distrito</label><select id="cn-dist"><option value="">—</option>' + DISTRITOS.map((d) => "<option>" + d + "</option>").join("") + "</select></div></div>" +
      '<div class="campos-2"><div class="campo"><label for="cn-conc">Concelho</label><input id="cn-conc" autocomplete="off"></div><div class="campo"><label for="cn-tel">Telefone</label><input id="cn-tel" type="tel" autocomplete="off"></div></div>' +
      '<div class="acts"><button class="btn pri" type="submit">Criar</button><button class="btn sec" type="button" data-acao="fechar">Cancelar</button></div></form>';
    return '<div class="veu" data-acao="fechar"></div><aside class="painel" role="dialog" aria-label="Novo cliente" data-marca="twentysix"><div class="p-scroll">' + c + "</div></aside>";
  }

  /* ============================== Eventos ============================== */
  const CAMPOS = { "cf-tel": "telefone", "cf-email": "email", "cf-ig": "instagram", "cf-web": "website", "cf-morada": "morada", "cf-cp": "codigo_postal",
    "cf-freg": "freguesia", "cf-conc": "concelho", "cf-nif": "nif", "cf-notas": "notas", "cf-nome": "nome" };

  function clique(acao, el) {
    const id = el.dataset.id;
    switch (acao) {
      case "crm-tab": C.tab = el.dataset.tab; render(); return true;
      case "crm-recarregar": carregar(); return true;
      case "crm-vista": C.vista = el.dataset.v; C.fEstado = ""; C.limite = 150; if (C.tab !== "clientes") C.tab = "clientes"; render(); return true;
      case "crm-fest": C.fEstado = C.fEstado === el.dataset.v ? "" : el.dataset.v; if (C.fEstado) C.vista = "clientes"; C.limite = 150; render(); return true;
      case "crm-mais": C.limite += 300; render(); return true;
      case "crm-abrir": abrir({ tipo: "cliente", id }); return true;
      case "crm-novo": abrir({ tipo: "crm-novo" }); return true;
      case "crm-ver-etapa": C.tab = "clientes"; C.vista = "todos"; C.fEtapa = el.dataset.v; C.fEstado = ""; render(); return true;
      case "crm-distrito": C.tab = "clientes"; C.vista = "todos"; C.fDistrito = el.dataset.v; render(); return true;
      case "crm-imp-cancelar": C.importacao = null; render(); return true;
      case "crm-importar": importar(); return true;
      case "crm-apagar": S.aberto = { ...S.aberto, confirmarApagar: true }; renderPainel(true); return true;
      case "crm-apagar-nao": S.aberto = { ...S.aberto, confirmarApagar: false }; renderPainel(true); return true;
      case "crm-apagar-sim": {
        const antes = C.clientes[id]; delete C.clientes[id]; C.versao++;
        S.aberto = null; renderPainel(true); render();
        api.crm.apagar(id).then(() => toast("Cliente eliminado")).catch((e) => { C.clientes[id] = antes; C.versao++; render(); falha(e); });
        return true;
      }
      case "crm-tarefa": {
        const c = C.clientes[id]; if (!c) return true;
        const s = statsDe(c);
        criarTarefa({ titulo: "Contactar " + c.nome, marca: s?.tech ? "tech" : "twentysix", freq: "unica", prioridade: s?.aContactar ? "alta" : "media",
          responsavel_id: c.responsavel_id || S.eu.id, departamento_id: "comercial",
          notas: "Cliente do CRM: " + c.nome + (c.telefone ? "\nTelefone: " + c.telefone : "") + (s ? "\nÚltima compra: " + rotData(s.ultima) + " (há " + s.dias + " dias)" : "") })
          .then((t) => toast("Tarefa criada para " + (nomeDe(t.responsavel_id) || "ti"))).catch(falha);
        return true;
      }
    }
    return false;
  }

  function mudar(e) {
    const t = e.target, id = S.aberto?.tipo === "cliente" ? S.aberto.id : null;
    const filtros = { "crm-fetapa": "fEtapa", "crm-festado": "fEstado", "crm-fdist": "fDistrito", "crm-fresp": "fResp", "crm-ordem": "ordem", "crm-fundist": "funilDistrito", "crm-funresp": "funilResp", "crm-periodo": "periodo" };
    if (filtros[t.id]) { C[filtros[t.id]] = t.value; C.limite = 150; render(); return true; }
    if (t.id === "crm-ficheiro") { if (t.files?.[0]) lerFicheiro(t.files[0]); t.value = ""; return true; }
    if (!id) return false;
    if (t.id === "cf-etapa") { gravar(id, { etapa: t.value }); return true; }
    if (t.id === "cf-resp") { gravar(id, { responsavel_id: t.value || null }); return true; }
    if (t.id === "cf-tipo") { gravar(id, { tipo: t.value }); return true; }
    if (t.id === "cf-dist") { gravar(id, { distrito: t.value }); return true; }
    if (t.id === "cf-aniv") { gravar(id, { data_aniversario: t.value || null }); return true; }
    if (t.id === "cf-cod") { gravar(id, { codigo_multixop: t.value.trim() || null }); return true; }
    if (CAMPOS[t.id]) { clearTimeout(timers[t.id]); gravar(id, { [CAMPOS[t.id]]: t.id === "cf-nome" ? t.value.trim() || C.clientes[id].nome : t.value.trim() }, true); return true; }
    return false;
  }
  function escrever(e) {
    const t = e.target;
    if (t.id === "crm-q") { C.q = t.value; C.limite = 150; render(); return true; }
    const id = S.aberto?.tipo === "cliente" ? S.aberto.id : null;
    if (id && CAMPOS[t.id]) {
      if (t.id === "cf-nome") { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }
      adiar(t.id, () => gravar(id, { [CAMPOS[t.id]]: t.id === "cf-nome" ? t.value.trim() || C.clientes[id].nome : t.value.trim() }, true), 900);
      return true;
    }
    return false;
  }
  async function submeter(f) {
    if (f.id === "form-contacto") {
      const id = f.dataset.id, c = C.clientes[id];
      const texto = $("#ct-texto").value.trim(), prox = $("#ct-prox").value.trim(), data = $("#ct-data").value || null, tipo = $("#ct-tipo").value;
      if (!texto && !prox) { toast("Escreve o que aconteceu ou o próximo passo.", true); return true; }
      try {
        const r = await api.crm.contacto({ cliente_id: id, tipo, texto, proximo_passo: prox, data_proximo: data });
        if (!C.contactos.some((x) => x.id === r.id)) C.contactos.unshift(r);
        if (c.etapa === "lead" && ["chamada", "visita", "whatsapp", "email", "reuniao"].includes(tipo)) gravar(id, { etapa: "contactado" });
        if (c.etapa !== "cliente" && tipo === "proposta") gravar(id, { etapa: "proposta" });
        if (prox && $("#ct-tarefa").checked) {
          await criarTarefa({ titulo: prox + " · " + c.nome, marca: statsDe(c)?.tech ? "tech" : "twentysix", freq: "unica", prioridade: "media", prazo: data,
            responsavel_id: c.responsavel_id || S.eu.id, departamento_id: "comercial", notas: "Cliente do CRM: " + c.nome + (c.telefone ? "\nTelefone: " + c.telefone : "") + (texto ? "\nÚltimo contacto: " + texto : "") });
          toast("Contacto registado e tarefa criada");
        } else toast("Contacto registado");
        renderPainel(true);
      } catch (e) { falha(e); }
      return true;
    }
    if (f.id === "form-crm-novo") {
      const nome = $("#cn-nome").value.trim();
      if (!nome) { toast("Indica o nome.", true); return true; }
      try {
        const r = await api.crm.criar({ nome, etapa: $("#cn-etapa").value, distrito: $("#cn-dist").value, concelho: $("#cn-conc").value.trim(), telefone: $("#cn-tel").value.trim(),
          tipo: $("#cn-etapa").value === "cliente" ? "particular" : "lead", origem: "manual", responsavel_id: S.eu.id });
        C.clientes[r.id] = r; C.versao++; abrir({ tipo: "cliente", id: r.id }); render(); toast("Criado");
      } catch (e) { falha(e); }
      return true;
    }
    return false;
  }
  function mudarEtapa(id, etapa) { if (C.clientes[id] && C.clientes[id].etapa !== etapa) gravar(id, { etapa }); }

  function reiniciar() { if (desligar) { desligar(); desligar = null; } Object.assign(C, { estado: "por-carregar", clientes: {}, produtos: {}, vendas: [], contactos: [], importacoes: [], importacao: null, tab: "clientes" }); cache = null; }
  return { vista, painel, clique, mudar, escrever, submeter, mudarEtapa, carregar, reiniciar, estado: () => C.estado };
}
