// Central 26 — aplicação
import {
  MARCAS, MARCA, FREQS, FREQ, ESTADOS, PRIORIDADES, PAPEIS, DIA, MES_L, cap, ymd, periodo, inicioPeriodo, rotuloPeriodo,
  rotuloPrazo, dataLonga, haQuanto, estadoAtual, concluida, itensChecklist, emAtraso, ordenar, eGestor, podeAtribuirA,
  podeEditar, podeApagar, iniciais, normalizar, semanaIso, paginar, paginador,
} from "./dados.js";
import { MODELOS } from "./modelos.js";
import { criarCrm, podeCrm } from "./crm.js";
import { criarChat } from "./chat.js";
import { criarAgenda, podeGerirAgenda } from "./agenda.js";
import { criarLogistica, podeEncomendas } from "./logistica.js";
import { criarAuditoria } from "./auditoria.js";
import { criarFornecedores, podeOperacional } from "./fornecedores.js";
import { criarFinanceiro, podeFinanceiro } from "./financeiro.js";
import { criarMarketing, podeMarketing } from "./marketing.js";
import { criarStocks, podeStocks } from "./stocks.js";
import { VERSAO } from "./config.js";

const DEMO = new URLSearchParams(location.search).has("demo");
const api = DEMO ? (await import("./demo.js")).criarDemo() : (await import("./api.js")).criarApi();

/* ============================== Estado ============================== */
const S = {
  fase: "a-carregar", // a-carregar | entrar | mudar-password | sem-perfil | app
  user: null, eu: null,
  perfis: {}, deps: {}, tarefas: {}, notifs: [], atividade: [], config: {}, fotos: {}, prefs: null,
  rota: "inicio", param: null,
  tab: {}, vista: "lista", q: "", filtroResp: "", rascunho: "", mostrarFeitas: false,
  aberto: null, confirmar: false, novaPass: null,
  periodoAtiv: "semana", filtroDep: "", filtroAcao: "", pagAtiv: 1, pagHoje: 1,
  hoje: ymd(new Date()), erroEntrada: "", aEntrar: false, offline: false,
  instalar: null, carregou: false,
  selecao: null, visiveis: [],
};
let desligar = null;
try { const p = JSON.parse(localStorage.getItem("central26-prefs") || "{}"); if (p.tab) S.tab = p.tab; if (p.vista) S.vista = p.vista; } catch { /* */ }
const guardarPrefs = () => { try { localStorage.setItem("central26-prefs", JSON.stringify({ tab: S.tab, vista: S.vista })); } catch { /* */ } };

/* ============================== Utilitários ============================== */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const I = {
  check: '<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  plus: '<svg class="i" viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg>',
  x: '<svg class="i" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  out: '<svg class="i" viewBox="0 0 16 16"><path d="M6 3h7v7M13 3L5 11"/></svg>',
  lupa: '<svg class="i" viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>',
  lista: '<svg class="i" viewBox="0 0 16 16"><path d="M3 4h10M3 8h10M3 12h10"/></svg>',
  seta: '<svg class="i" viewBox="0 0 16 16"><path d="M6 4l4 4-4 4"/></svg>',
  nota: '<svg class="i" viewBox="0 0 16 16"><path d="M4 2.5h6l2.5 2.5v8.5H4z"/><path d="M6.5 8h4M6.5 10.5h3"/></svg>',
  pessoa: '<svg class="i" viewBox="0 0 16 16"><circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c.8-2.5 2.7-3.5 5-3.5s4.2 1 5 3.5"/></svg>',
  cal: '<svg class="i" viewBox="0 0 16 16"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/></svg>',
  copiar: '<svg class="i" viewBox="0 0 16 16"><rect x="5" y="5" width="8.5" height="8.5" rx="1.5"/><path d="M3 10.5V3.5A1 1 0 014 2.5h7"/></svg>',
  lixo: '<svg class="i" viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9"/></svg>',
  sino: '<svg class="i" viewBox="0 0 16 16"><path d="M4 11.5V7.5a4 4 0 018 0v4l1 1H3z"/><path d="M6.5 13.5a1.5 1.5 0 003 0"/></svg>',
  casa: '<svg class="i" viewBox="0 0 16 16"><path d="M2.5 7.5L8 3l5.5 4.5V13a.5.5 0 01-.5.5H9.5V10h-3v3.5H3a.5.5 0 01-.5-.5z"/></svg>',
  tarefas: '<svg class="i" viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M5.5 8l1.8 1.8L10.8 6"/></svg>',
  equipa: '<svg class="i" viewBox="0 0 16 16"><circle cx="6" cy="5.5" r="2.2"/><path d="M2 13c.6-2.2 2-3.2 4-3.2s3.4 1 4 3.2"/><circle cx="11.5" cy="6" r="1.8"/><path d="M11 9.8c1.6 0 2.6.9 3 2.7"/></svg>',
  grafico: '<svg class="i" viewBox="0 0 16 16"><path d="M2.5 13.5h11"/><path d="M4.5 11V8M8 11V4.5M11.5 11V6.5"/></svg>',
  mais: '<svg class="i" viewBox="0 0 16 16"><circle cx="3.5" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="12.5" cy="8" r="1"/></svg>',
  balao: '<svg class="i" viewBox="0 0 16 16"><path d="M2.5 4a1.5 1.5 0 011.5-1.5h8A1.5 1.5 0 0113.5 4v5.5A1.5 1.5 0 0112 11H7l-3 2.5V11H4a1.5 1.5 0 01-1.5-1.5z"/></svg>',
  loja: '<svg class="i" viewBox="0 0 16 16"><path d="M2.5 6.5L3.5 3h9l1 3.5"/><path d="M2.5 6.5a1.8 1.8 0 003.6 0 1.8 1.8 0 003.8 0 1.8 1.8 0 003.6 0"/><path d="M3.5 8.5v5h9v-5M6.5 13.5V10h3v3.5"/></svg>',
  roda: '<svg class="i" viewBox="0 0 16 16"><circle cx="8" cy="8" r="2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></svg>',
  tel: '<svg class="i" viewBox="0 0 16 16"><path d="M4 2.5h2l1 3-1.5 1a7 7 0 003.5 3.5l1-1.5 3 1v2a1 1 0 01-1 1A10.5 10.5 0 013 3.5a1 1 0 011-1z"/></svg>',
  mail: '<svg class="i" viewBox="0 0 16 16"><rect x="2" y="3.5" width="12" height="9" rx="1.5"/><path d="M2.5 4.5L8 9l5.5-4.5"/></svg>',
  mapa: '<svg class="i" viewBox="0 0 16 16"><path d="M8 14s-4.5-4.2-4.5-7.5a4.5 4.5 0 019 0C12.5 9.8 8 14 8 14z"/><circle cx="8" cy="6.5" r="1.6"/></svg>',
  euro: '<svg class="i" viewBox="0 0 16 16"><path d="M12 4a5 5 0 100 8M2.5 7h7M2.5 9.5h7"/></svg>',
  micro: '<svg class="i" viewBox="0 0 16 16"><rect x="5.5" y="1.8" width="5" height="8" rx="2.5"/><path d="M3 7.5a5 5 0 0010 0M8 12.5v2"/></svg>',
  play: '<svg class="i" viewBox="0 0 16 16"><path d="M5 3.2v9.6L12.6 8z" fill="currentColor"/></svg>',
  pausa: '<svg class="i" viewBox="0 0 16 16"><path d="M5.2 3.2v9.6M10.8 3.2v9.6" stroke-width="2.6"/></svg>',
  enviar: '<svg class="i" viewBox="0 0 16 16"><path d="M2.5 8h10M8.5 3.5L13 8l-4.5 4.5"/></svg>',
  stock: '<svg class="i" viewBox="0 0 16 16"><path d="M2 5.5L8 2.5l6 3v5L8 13.5l-6-3z"/><path d="M2 5.5l6 3 6-3M8 8.5v5"/></svg>',
  camara: '<svg class="i" viewBox="0 0 16 16"><path d="M2 5.5h2.5l1.2-1.8h4.6l1.2 1.8H14v7H2z"/><circle cx="8" cy="8.8" r="2.3"/></svg>',
  megafone: '<svg class="i" viewBox="0 0 16 16"><path d="M2.5 6.5v3h2l5 3v-9l-5 3z"/><path d="M4.5 9.5l1 4h1.6l-.6-3.4M12 6a2.5 2.5 0 010 4"/></svg>',
  caixa: '<svg class="i" viewBox="0 0 16 16"><path d="M2 5l6-3 6 3v6l-6 3-6-3z"/><path d="M2 5l6 3 6-3M8 8v6"/></svg>',
  escudo: '<svg class="i" viewBox="0 0 16 16"><path d="M8 1.8l5 1.9v4c0 3.2-2.1 5.6-5 6.6-2.9-1-5-3.4-5-6.6v-4z"/><path d="M5.8 8l1.6 1.6 2.9-3"/></svg>',
  camiao: '<svg class="i" viewBox="0 0 16 16"><path d="M1.5 4h8v7h-8zM9.5 6.5h2.8l2.2 2.4V11h-5"/><circle cx="4.5" cy="11.8" r="1.3"/><circle cx="11.8" cy="11.8" r="1.3"/></svg>',
};

let toastT, toastAcao = null;
// toast(msg) · toast(msg, true) para erro · toast(msg, { acao: { rotulo, fn }, ms })
function toast(msg, op) {
  const o = typeof op === "object" && op ? op : { erro: !!op };
  const r = $("#toast-root");
  toastAcao = o.acao ? o.acao.fn : null;
  r.innerHTML = '<div class="toast' + (o.erro ? " erro" : "") + '" role="status"><span>' + esc(msg) + "</span>" +
    (o.acao ? '<button class="toast-acao" data-acao="toast-acao">' + esc(o.acao.rotulo) + "</button>" : "") + "</div>";
  clearTimeout(toastT);
  toastT = setTimeout(() => { r.innerHTML = ""; toastAcao = null; }, o.ms || (o.erro ? 5200 : 3200));
}
const falha = (e) => toast(e?.message || "Ocorreu um erro. Tenta outra vez.", true);

/* ---------- eliminar com «Anular» ----------
   As tarefas desaparecem logo do ecrã, mas só são apagadas na base de dados ao fim de 7 segundos.
   «Anular» repõe-nas sem deixar rasto. Se a app for fechada antes, a eliminação é feita nesse momento. */
const pendentes = new Map();
const emEspera = (id) => [...pendentes.values()].some((p) => p.lote.some(([x]) => x === id));
function eliminarTarefas(ids) {
  const permitidas = ids.filter((id) => S.tarefas[id] && podeApagar(S.eu, S.tarefas[id]));
  const recusadas = ids.length - permitidas.length;
  if (!permitidas.length) { toast("Não tens permissão para eliminar " + (ids.length === 1 ? "esta tarefa." : "estas tarefas."), true); return; }
  const lote = permitidas.map((id) => [id, S.tarefas[id]]);
  lote.forEach(([id]) => { delete S.tarefas[id]; S.selecao?.delete(id); });
  if (S.aberto?.tipo === "tarefa" && permitidas.includes(S.aberto.id)) { S.aberto = null; renderPainel(true); }
  const chave = "l" + Date.now() + Math.random();
  pendentes.set(chave, { lote, timer: setTimeout(() => confirmarEliminacao(chave), 7000) });
  render();
  const n = permitidas.length;
  toast((n === 1 ? "Tarefa eliminada" : n + " tarefas eliminadas") + (recusadas ? " · " + recusadas + " sem permissão" : ""),
    { acao: { rotulo: "Anular", fn: () => anularEliminacao(chave) }, ms: 7000 });
}
async function confirmarEliminacao(chave) {
  const p = pendentes.get(chave);
  if (!p) return;
  pendentes.delete(chave); clearTimeout(p.timer);
  try {
    const apagadas = new Set(await api.tarefas.apagarVarias(p.lote.map(([id]) => id)));
    const falharam = p.lote.filter(([id]) => !apagadas.has(id));
    if (falharam.length) { falharam.forEach(([id, t]) => { S.tarefas[id] = t; }); agendarRender(); toast("Não foi possível eliminar " + falharam.length + (falharam.length === 1 ? " tarefa." : " tarefas."), true); }
  } catch (e) { p.lote.forEach(([id, t]) => { S.tarefas[id] = t; }); agendarRender(); falha(e); }
}
function anularEliminacao(chave) {
  const p = pendentes.get(chave);
  if (!p) return;
  clearTimeout(p.timer); pendentes.delete(chave);
  p.lote.forEach(([id, t]) => { S.tarefas[id] = t; });
  render(); toast("Eliminação anulada");
}
const confirmarTudo = () => [...pendentes.keys()].forEach(confirmarEliminacao);
window.addEventListener("pagehide", confirmarTudo);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") confirmarTudo(); });

async function duplicarTarefa(id) {
  const t = S.tarefas[id]; if (!t) return;
  try {
    const r = await api.tarefas.criar({ titulo: t.titulo + " (cópia)", marca: t.marca, freq: t.freq, prioridade: t.prioridade,
      responsavel_id: podeAtribuirA(S.eu, S.perfis[t.responsavel_id]) ? t.responsavel_id : S.eu.id,
      departamento_id: t.departamento_id, prazo: t.prazo, notas: t.notas, checklist: itensChecklist(t).map((i) => ({ ...i, feito: false })),
      checklist_periodo: "", estado: "por_fazer", estado_periodo: periodo(t.freq) });
    S.tarefas[r.id] = r; abrirTarefa(r.id); toast("Tarefa duplicada");
  } catch (err) { falha(err); }
}

/* ---------- menu ⋯ de cada tarefa ---------- */
function abrirMenu(botao, id) {
  const t = S.tarefas[id]; if (!t) return;
  const pode = podeEditar(S.eu, t), apaga = podeApagar(S.eu, t), feita = concluida(t);
  const root = $("#menu-root");
  root.innerHTML = '<div class="menu" role="menu" data-id="' + id + '">' +
    '<button role="menuitem" data-acao="m-abrir">' + I.nota + "Abrir</button>" +
    (pode ? '<button role="menuitem" data-acao="m-alternar">' + I.tarefas + (feita ? "Marcar como por fazer" : "Marcar como concluída") + "</button>" : "") +
    (pode ? '<button role="menuitem" data-acao="m-duplicar">' + I.copiar + "Duplicar</button>" : "") +
    (apaga ? '<button role="menuitem" class="perigo" data-acao="m-eliminar">' + I.lixo + "Eliminar</button>" : "") +
    "</div>";
  const m = root.firstChild, r = botao.getBoundingClientRect();
  const larg = m.offsetWidth, alt = m.offsetHeight;
  let left = Math.min(r.right - larg, innerWidth - larg - 8), top = r.bottom + 4;
  if (top + alt > innerHeight - 8) top = Math.max(8, r.top - alt - 4);
  m.style.left = Math.max(8, left) + "px"; m.style.top = top + "px";
  m.querySelector("button")?.focus();
}
const fecharMenu = () => { const r = $("#menu-root"); if (r && r.innerHTML) r.innerHTML = ""; };

const timers = {};
const adiar = (k, fn, ms = 600) => { clearTimeout(timers[k]); timers[k] = setTimeout(fn, ms); };
let pedidoRender = 0;
const agendarRender = () => { cancelAnimationFrame(pedidoRender); pedidoRender = requestAnimationFrame(render); };

const listaPerfis = () => Object.values(S.perfis).sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
const ativos = () => listaPerfis().filter((p) => p.ativo);
const nomeDe = (id) => (id && S.perfis[id] ? S.perfis[id].nome : "");
const depNome = (id) => (id && S.deps[id] ? S.deps[id].nome : "Sem departamento");
const listaDeps = () => Object.values(S.deps).sort((a, b) => (a.ordem - b.ordem) || a.nome.localeCompare(b.nome, "pt"));
const todas = () => Object.values(S.tarefas);
// Avatar: foto (se a pessoa tiver) ou iniciais na cor escolhida
const av = (id, cls = "") => {
  const p = S.perfis[id], url = p?.foto_path && S.fotos[p.foto_path];
  const cor = p?.cor ? ' data-cor="' + esc(p.cor) + '"' : "";
  return url ? '<span class="av com-foto ' + cls + '"' + cor + ' aria-hidden="true"><img src="' + esc(url) + '" alt="" loading="lazy" decoding="async"></span>'
    : '<span class="av ' + cls + '"' + cor + ' aria-hidden="true">' + esc(iniciais(nomeDe(id) || "?")) + "</span>";
};
async function carregarFotos() {
  const falta = [...new Set(Object.values(S.perfis).map((p) => p.foto_path).filter((c) => c && !S.fotos[c]))];
  if (!falta.length || !api.perfis.urlsFotos) return;
  try { Object.assign(S.fotos, await api.perfis.urlsFotos(falta)); agendarRender(); } catch { /* fica com as iniciais */ }
}

/* ============================== Arranque e sessão ============================== */
async function arrancar() {
  if ("serviceWorker" in navigator) {
    const tinha = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js").then((reg) => {
      // procurar versões novas quando a app volta a ficar visível e a cada 30 minutos
      const ver = () => reg.update().catch(() => {});
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") ver(); });
      setInterval(ver, 30 * 60 * 1000);
    }).catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!tinha || S.versaoNova) return;
      S.versaoNova = true; agendarRender();
    });
  }
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); S.instalar = e; agendarRender(); });
  window.addEventListener("online", () => { S.offline = false; agendarRender(); });
  window.addEventListener("offline", () => { S.offline = true; agendarRender(); });
  window.addEventListener("hashchange", lerRota);
  document.addEventListener("scroll", fecharMenu, true);
  window.addEventListener("resize", fecharMenu);
  setInterval(() => { const h = ymd(new Date()); if (h !== S.hoje) { S.hoje = h; agendarRender(); } }, 60000);
  api.aoMudarSessao((ev) => { if (ev === "SIGNED_OUT") { S.fase = "entrar"; limparDados(); render(); } });
  lerRota(false);
  render();
  try {
    const u = await api.sessao();
    if (!u) { S.fase = "entrar"; render(); return; }
    await entrarNaApp(u);
  } catch (e) {
    S.fase = "entrar"; S.erroEntrada = e.message; render();
  }
}

function limparDados() {
  if (desligar) { desligar(); desligar = null; }
  CRM.reiniciar(); CHAT.reiniciar(); AGENDA.reiniciar(); LOG.reiniciar(); AUD.reiniciar(); OP.reiniciar(); FIN.reiniciar(); MK.reiniciar(); STK.reiniciar(); S.fotos = {}; S.prefs = null;
  Object.assign(S, { user: null, eu: null, perfis: {}, deps: {}, tarefas: {}, notifs: [], atividade: [], config: {}, aberto: null, carregou: false });
}

async function entrarNaApp(u) {
  S.user = u;
  const eu = await api.meuPerfil(u.id);
  if (!eu || !eu.ativo) { S.fase = "sem-perfil"; render(); return; }
  S.eu = eu;
  if (eu.mudar_password && api.modo !== "demo") { S.fase = "mudar-password"; render(); return; }
  S.fase = "app";
  render();
  await recarregar();
  if (desligar) desligar();
  desligar = api.subscrever(eu.id, aoMudar);
  if (S.rota === "tarefa" && S.param) abrirTarefa(S.param);
  if (S.rota === "cliente" && S.param) { S.aberto = { tipo: "cliente", id: S.param }; render(); }
  if (S.rota === "agenda" && S.param) { S.aberto = { tipo: "evento", id: S.param }; render(); }
  if (S.rota === "encomenda" && S.param) { S.aberto = { tipo: "encomenda", id: S.param }; render(); }
  if (S.rota === "auditoria" && /^[A-Z]{2,4}-\d{2,3}$/.test(S.param || "")) { S.aberto = { tipo: "aud-item", id: S.param }; render(); }
  if ((S.rota === "fornecedor" || S.rota === "pedido") && S.param) { S.aberto = { tipo: S.rota, id: S.param }; render(); }
  if (S.rota === "publicacao" && S.param) { S.aberto = { tipo: "publicacao", id: S.param }; render(); }
  if (S.rota === "stock" && S.param) { S.aberto = { tipo: "stock", id: S.param }; render(); }
  CHAT.carregar();
}

async function recarregar() {
  try {
    const d = await api.carregar();
    S.perfis = Object.fromEntries(d.perfis.map((p) => [p.id, p]));
    carregarFotos();
    S.deps = Object.fromEntries(d.departamentos.map((x) => [x.id, x]));
    S.tarefas = Object.fromEntries(d.tarefas.map((t) => [t.id, t]));
    S.notifs = d.notificacoes;
    S.atividade = d.atividade;
    S.config = Object.fromEntries(d.configuracao.map((c) => [c.chave, c.valor]));
    if (S.perfis[S.eu.id]) S.eu = S.perfis[S.eu.id];
    S.carregou = true;
    render();
  } catch (e) { falha(e); }
}

function aoMudar(tabela, ev, novo, antigo) {
  if (tabela === "tarefas") {
    if (ev === "DELETE") delete S.tarefas[antigo.id];
    else if (!emEspera(novo.id)) S.tarefas[novo.id] = novo;
  } else if (tabela === "perfis") {
    if (ev === "DELETE") delete S.perfis[antigo.id]; else { S.perfis[novo.id] = novo; if (novo.id === S.eu?.id) S.eu = { ...S.eu, ...novo }; carregarFotos(); }
    if (novo && S.eu && novo.id === S.eu.id) {
      S.eu = novo;
      if (!novo.ativo) { api.sair(); return; }
    }
  } else if (tabela === "departamentos") {
    if (ev === "DELETE") delete S.deps[antigo.id]; else S.deps[novo.id] = novo;
  } else if (tabela === "atividade") {
    if (!S.atividade.some((a) => a.id === novo.id)) S.atividade.unshift(novo);
  } else if (tabela === "notificacoes") {
    if (ev === "INSERT") {
      const naConversa = S.rota === "chat" && S.chat?.ativo && novo.link === "#chat-" + S.chat.ativo;
      S.notifs.unshift(naConversa ? { ...novo, lida: true } : novo);
      if (!naConversa) toast(novo.titulo + " · " + novo.corpo);
    }
    else if (ev === "UPDATE") S.notifs = S.notifs.map((n) => (n.id === novo.id ? novo : n));
    else if (ev === "DELETE") S.notifs = S.notifs.filter((n) => n.id !== antigo.id);
  }
  agendarRender();
}

/* ============================== Rotas ============================== */
function lerRota(desenhar = true) {
  const h = (location.hash || "").replace(/^#/, "");
  let rota = "inicio", param = null;
  const m = h.match(/^([a-z]+)(?:-(.+))?$/);
  if (m) {
    const [, r, p] = m;
    if (["inicio", "minhas", "equipa", "atividade", "notificacoes", "definicoes"].includes(r)) rota = r;
    else if (r === "comercial") { rota = "comercial"; param = ["funil", "mapa", "analise", "importar", "clientes"].includes(p) ? p : null; }
    else if (r === "cliente" && p) { rota = "cliente"; param = p; }
    else if (r === "chat") { rota = "chat"; param = p || null; }
    else if (r === "agenda") { rota = "agenda"; param = p || null; }
    else if (r === "logistica") { rota = "logistica"; param = p || null; }
    else if (r === "encomenda" && p) { rota = "encomenda"; param = p; }
    else if (r === "auditoria") { rota = "auditoria"; param = p || null; }
    else if (r === "operacional") { rota = "operacional"; param = p || null; }
    else if (r === "financeiro") { rota = "financeiro"; param = p || null; }
    else if (r === "marketing") { rota = "marketing"; param = p || null; }
    else if (r === "stocks") { rota = "stocks"; param = p || null; }
    else if (r === "stock" && p) { rota = "stock"; param = p; }
    else if (r === "publicacao" && p) { rota = "publicacao"; param = p; }
    else if ((r === "fornecedor" || r === "pedido") && p) { rota = r; param = p; }
    else if (r === "marca" && MARCA[p]) { rota = "marca"; param = p; }
    else if (r === "pessoa" && p) { rota = "pessoa"; param = p; }
    else if (r === "tarefa" && p) { rota = "tarefa"; param = p; }
  }
  if (rota !== S.rota || param !== S.param) { S.q = ""; S.filtroResp = ""; S.mostrarFeitas = false; S.selecao = null; S.pagHoje = 1; S.pagAtiv = 1; S.pagNotif = 1; }
  fecharMenu();
  // mudar de página (por exemplo, com o botão «voltar») fecha o painel que estava aberto
  if (desenhar && S.aberto && rota !== S.rota) { S.aberto = null; S.confirmar = false; renderPainel(true); }
  S.rota = rota; S.param = param;
  if (rota === "comercial" && param && S.crm) S.crm.tab = param;
  if (rota === "logistica" && ["encomendas", "rotas", "locais"].includes(param) && S.log) S.log.tab = param;
  if (!desenhar) return;
  if (rota === "tarefa" && S.fase === "app") { abrirTarefa(param); return; }
  if (rota === "cliente" && S.fase === "app") { if (S.crm) S.crm.tab = "clientes"; S.aberto = { tipo: "cliente", id: param }; }
  if (rota === "agenda" && param && S.fase === "app") S.aberto = { tipo: "evento", id: param };
  if (rota === "auditoria" && S.fase === "app" && /^[A-Z]{2,4}-\d{2,3}$/.test(param || "")) { if (S.aud) S.aud.tab = "registo"; S.aberto = { tipo: "aud-item", id: param }; }
  if ((rota === "fornecedor" || rota === "pedido") && S.fase === "app") { if (S.op) S.op.tab = rota === "pedido" ? "pedidos" : "fornecedores"; S.aberto = { tipo: rota, id: param }; }
  if (rota === "publicacao" && S.fase === "app") S.aberto = { tipo: "publicacao", id: param };
  if (rota === "stock" && S.fase === "app") S.aberto = { tipo: "stock", id: param };
  if (rota === "encomenda" && S.fase === "app") { if (S.log) S.log.tab = "encomendas"; S.aberto = { tipo: "encomenda", id: param }; }
  if (rota === "chat" && S.fase === "app") CHAT.aoEntrarNaRota(param);
  render();
  const m2 = $(".main"); if (m2) m2.scrollTop = 0;
}

/* ============================== Render principal ============================== */
function render() {
  const ae = document.activeElement, aid = ae && ae.id, sel = ae && "selectionStart" in ae ? [ae.selectionStart, ae.selectionEnd] : null;
  const app = $("#app");
  if (S.fase === "a-carregar") app.innerHTML = '<div class="entrada"><div class="cartao-entrada">' + marcaEntrada() + '<p class="nota-entrada">A abrir…</p></div></div>';
  else if (S.fase === "entrar") app.innerHTML = vistaEntrar();
  else if (S.fase === "mudar-password") app.innerHTML = vistaMudarPassword();
  else if (S.fase === "sem-perfil") app.innerHTML = vistaSemPerfil();
  else app.innerHTML = vistaApp();
  renderPainel();
  if (aid && !$("#painel-root").contains(document.getElementById(aid))) {
    const el = document.getElementById(aid);
    if (el && el !== document.activeElement) { el.focus(); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch { /* */ } }
  }
}

function marcaEntrada() {
  return '<div class="marca-entrada"><span class="nome">Central <b>26</b></span><span class="sub">Grupo TwentySix · espaço de trabalho interno</span></div>';
}

function vistaEntrar() {
  const logos = '<div class="logos-entrada">' + MARCAS.filter((m) => m.logo).map((m) => '<img src="' + m.logo + '" alt="' + esc(m.nome) + '">').join("") + "</div>";
  if (api.modo === "demo") {
    return '<div class="entrada"><div class="cartao-entrada">' + marcaEntrada() +
      '<div class="aviso" style="background:rgba(229,184,101,.14);color:#E5B865">Modo de demonstração. Os dados ficam só neste aparelho e não tocam na base de dados real.</div>' +
      '<p class="nota-entrada">Entra como:</p><div class="pessoas-demo">' +
      api.pessoas().map((p) => '<button data-acao="demo-entrar" data-id="' + p.id + '"><span class="av">' + esc(iniciais(p.nome)) + '</span><span>' + esc(p.nome) + "<small>" + esc(PAPEIS[p.papel]) + " · " + esc(p.cargo) + "</small></span></button>").join("") +
      "</div>" + logos + "</div></div>";
  }
  return '<div class="entrada"><form class="cartao-entrada" id="form-entrar" novalidate>' + marcaEntrada() +
    (S.erroEntrada ? '<div class="erro-entrada" role="alert">' + esc(S.erroEntrada) + "</div>" : "") +
    '<div class="form-entrada">' +
    '<label>Email<input id="e-email" type="email" autocomplete="username" inputmode="email" required></label>' +
    '<label>Palavra-passe<input id="e-pass" type="password" autocomplete="current-password" required></label>' +
    '<button class="btn" type="submit"' + (S.aEntrar ? " disabled" : "") + ">" + (S.aEntrar ? "A entrar…" : "Entrar") + "</button>" +
    '<p class="nota-entrada">Esqueceste-te da palavra-passe? Pede ao Samuel ou ao CEO para a repor na página Equipa.</p>' +
    "</div>" + logos + "</form></div>";
}

function vistaMudarPassword() {
  return '<div class="entrada"><form class="cartao-entrada" id="form-pass" novalidate>' + marcaEntrada() +
    '<p class="nota-entrada" style="color:var(--side-ink);font-size:15px">Olá, ' + esc(S.eu?.nome?.split(" ")[0] || "") + '. Antes de começar, escolhe a tua palavra-passe.</p>' +
    (S.erroEntrada ? '<div class="erro-entrada" role="alert">' + esc(S.erroEntrada) + "</div>" : "") +
    '<div class="form-entrada">' +
    '<label>Nova palavra-passe<input id="n-pass" type="password" autocomplete="new-password" minlength="8" required></label>' +
    '<label>Repetir palavra-passe<input id="n-pass2" type="password" autocomplete="new-password" minlength="8" required></label>' +
    '<button class="btn" type="submit"' + (S.aEntrar ? " disabled" : "") + ">" + (S.aEntrar ? "A guardar…" : "Guardar e entrar") + "</button>" +
    '<p class="nota-entrada">Pelo menos 8 caracteres, com letras e números.</p>' +
    '<button type="button" class="nota-entrada" data-acao="sair" style="text-decoration:underline;align-self:flex-start">Sair</button>' +
    "</div></form></div>";
}

function vistaSemPerfil() {
  return '<div class="entrada"><div class="cartao-entrada">' + marcaEntrada() +
    '<div class="erro-entrada">Esta conta não tem acesso à Central 26. Fala com o Samuel ou com o CEO.</div>' +
    '<div class="form-entrada"><button class="btn" data-acao="sair">Sair</button></div></div></div>';
}

/* ---------- moldura da app ---------- */
function vistaApp() {
  const g = eGestor(S.eu);
  const naoLidas = S.notifs.filter((n) => !n.lida).length;
  const minhasHoje = todas().filter((t) => t.responsavel_id === S.eu.id && ((t.freq === "diaria" && !concluida(t)) || emAtraso(t, S.hoje))).length;
  const atual = (r, p) => (S.rota === r && (p == null || S.param === p) ? ' aria-current="page"' : "");
  const contagemMarca = (m) => todas().filter((t) => t.marca === m && ((t.freq === "diaria" && !concluida(t)) || emAtraso(t, S.hoje))).length;

  let side = '<aside class="side"><a class="ws" href="#inicio" aria-label="Central 26, ir para o Início"><span class="ws-nome">Central <b>26</b></span><span class="ws-sub">Grupo TwentySix</span></a><nav class="nav" aria-label="Navegação">';
  side += '<a href="#inicio"' + atual("inicio") + ">" + I.casa + '<span class="nm">Início</span></a>';
  side += '<a href="#minhas"' + atual("minhas") + ">" + I.tarefas + '<span class="nm">As minhas tarefas</span>' + (minhasHoje ? '<span class="ct">' + minhasHoje + "</span>" : "") + "</a>";
  const porLerChat = CHAT.naoLidas();
  side += '<a href="#chat"' + atual("chat") + ">" + I.balao + '<span class="nm">Mensagens</span>' + (porLerChat ? '<span class="ct">' + porLerChat + "</span>" : "") + "</a>";
  side += '<a href="#agenda"' + atual("agenda") + ">" + I.cal + '<span class="nm">Agenda</span></a>';
  side += '<a href="#equipa"' + atual("equipa") + ">" + I.equipa + '<span class="nm">Equipa</span></a>';
  side += '<a href="#atividade"' + atual("atividade") + ">" + I.grafico + '<span class="nm">Quem fez o quê</span></a>';
  if (podeCrm(S.eu)) side += '<a href="#comercial"' + (S.rota === "comercial" || S.rota === "cliente" ? ' aria-current="page"' : "") + ">" + I.loja + '<span class="nm">Comercial</span></a>';
  if (podeMarketing(S.eu)) { const n = MK.contagem(); side += '<a href="#marketing"' + (S.rota === "marketing" || S.rota === "publicacao" ? ' aria-current="page"' : "") + ">" + I.megafone + '<span class="nm">Marketing</span>' + (n ? '<span class="ct">' + n + "</span>" : "") + "</a>"; }
  if (podeStocks(S.eu)) { const n = STK.contagem(); side += '<a href="#stocks"' + (S.rota === "stocks" || S.rota === "stock" ? ' aria-current="page"' : "") + ">" + I.stock + '<span class="nm">Stocks</span>' + (n ? '<span class="ct">' + n + "</span>" : "") + "</a>"; }
  if (podeFinanceiro(S.eu)) side += '<a href="#financeiro"' + atual("financeiro") + ">" + I.euro + '<span class="nm">Financeiro</span></a>';
  if (podeOperacional(S.eu)) { const n = OP.contagem(); side += '<a href="#operacional"' + (["operacional", "fornecedor", "pedido"].includes(S.rota) ? ' aria-current="page"' : "") + ">" + I.caixa + '<span class="nm">Fornecedores</span>' + (n ? '<span class="ct">' + n + "</span>" : "") + "</a>"; }
  if (AUD.visivel()) { const n = AUD.contagem(); side += '<a href="#auditoria"' + atual("auditoria") + ">" + I.escudo + '<span class="nm">Auditoria dos sites</span>' + (n ? '<span class="ct">' + n + "</span>" : "") + "</a>"; }
  if (podeEncomendas(S.eu)) { const n = LOG.contagem(); side += '<a href="#logistica"' + (S.rota === "logistica" || S.rota === "encomenda" ? ' aria-current="page"' : "") + ">" + I.camiao + '<span class="nm">Logística</span>' + (n ? '<span class="ct">' + n + "</span>" : "") + "</a>"; }
  side += '<div class="nav-rot">Marcas</div>';
  MARCAS.forEach((m) => {
    const n = contagemMarca(m.id);
    side += '<a href="#marca-' + m.id + '" data-marca="' + m.id + '"' + atual("marca", m.id) + '><span class="sw"></span><span class="nm">' + esc(m.nome) + "</span>" + (n ? '<span class="ct">' + n + "</span>" : "") + "</a>";
  });
  side += '</nav><div class="side-pe"><a class="eu-chip" href="#definicoes">' + av(S.eu.id) + "<span>" + esc(S.eu.nome) + "<small>" + esc(PAPEIS[S.eu.papel]) + "</small></span></a>" +
    '<span class="estado-ligacao' + (S.offline ? " off" : "") + '"><i></i>' + (S.offline ? "Sem ligação" : api.modo === "demo" ? "Modo de demonstração" : "Ligado") + "</span></div></aside>";

  const topo = '<header class="topo"><a class="ws-m" href="#inicio" aria-label="Central 26, ir para o Início">Central <b>26</b></a>' +
    '<a class="sino" href="#notificacoes" aria-label="Notificações' + (naoLidas ? ", " + naoLidas + " por ler" : "") + '">' + I.sino + (naoLidas ? '<span class="bolinha">' + (naoLidas > 9 ? "9+" : naoLidas) + "</span>" : "") + "</a></header>";

  const tab = '<nav class="tabbar" aria-label="Navegação">' +
    '<a href="#inicio"' + atual("inicio") + ">" + I.casa + "Início</a>" +
    '<a href="#minhas"' + atual("minhas") + ">" + I.tarefas + "Tarefas" + (minhasHoje ? '<span class="ct">' + minhasHoje + "</span>" : "") + "</a>" +
    '<a href="#chat"' + atual("chat") + ">" + I.balao + "Mensagens" + (CHAT.naoLidas() ? '<span class="ct">' + CHAT.naoLidas() + "</span>" : "") + "</a>" +
    (S.eu.departamento_id === "logistica" ? '<a href="#logistica"' + (S.rota === "logistica" || S.rota === "encomenda" ? ' aria-current="page"' : "") + ">" + I.camiao + "Logística" + (LOG.contagem() ? '<span class="ct">' + LOG.contagem() + "</span>" : "") + "</a>" : "") +
    (S.eu.departamento_id === "tecnologico" ? '<a href="#auditoria"' + atual("auditoria") + ">" + I.escudo + "Auditoria" + (AUD.contagem() ? '<span class="ct">' + AUD.contagem() + "</span>" : "") + "</a>" : "") +
    (S.eu.departamento_id === "operacional" ? '<a href="#operacional"' + (["operacional", "fornecedor", "pedido"].includes(S.rota) ? ' aria-current="page"' : "") + ">" + I.caixa + "Fornecedores" + (OP.contagem() ? '<span class="ct">' + OP.contagem() + "</span>" : "") + "</a>" : "") +
    (S.eu.departamento_id === "marketing" ? '<a href="#marketing"' + (S.rota === "marketing" || S.rota === "publicacao" ? ' aria-current="page"' : "") + ">" + I.megafone + "Marketing" + (MK.contagem() ? '<span class="ct">' + MK.contagem() + "</span>" : "") + "</a>" : "") +
    (["logistica", "tecnologico", "operacional", "marketing"].includes(S.eu.departamento_id) ? "" : podeCrm(S.eu) ? '<a href="#comercial"' + (S.rota === "comercial" || S.rota === "cliente" ? ' aria-current="page"' : "") + ">" + I.loja + "Comercial</a>" : '<a href="#equipa"' + (S.rota === "equipa" || S.rota === "pessoa" ? ' aria-current="page"' : "") + ">" + I.equipa + "Equipa</a>") +
    '<a href="#definicoes"' + atual("definicoes") + ">" + I.mais + "Mais</a></nav>";

  let corpo;
  if (!S.carregou) corpo = esqueleto();
  else if (S.rota === "marca") corpo = vistaMarca(MARCA[S.param]);
  else if (S.rota === "minhas") corpo = vistaMinhas();
  else if (S.rota === "equipa") corpo = vistaEquipa();
  else if (S.rota === "pessoa") corpo = vistaPessoa(S.perfis[S.param]);
  else if (S.rota === "atividade") corpo = vistaAtividade();
  else if (S.rota === "notificacoes") corpo = vistaNotificacoes();
  else if (S.rota === "definicoes") corpo = vistaDefinicoes();
  else if ((S.rota === "comercial" || S.rota === "cliente") && podeCrm(S.eu)) corpo = CRM.vista();
  else if (S.rota === "chat") corpo = CHAT.vista();
  else if (S.rota === "agenda") corpo = AGENDA.vista();
  else if (S.rota === "financeiro" && podeFinanceiro(S.eu)) corpo = FIN.vista(S.param);
  else if ((S.rota === "marketing" || S.rota === "publicacao") && podeMarketing(S.eu)) corpo = MK.vista(S.rota === "marketing" ? S.param : null);
  else if ((S.rota === "stocks" || S.rota === "stock") && podeStocks(S.eu)) corpo = STK.vista(S.rota === "stocks" ? S.param : null);
  else if (["operacional", "fornecedor", "pedido"].includes(S.rota) && podeOperacional(S.eu)) corpo = OP.vista(S.rota === "operacional" ? S.param : null);
  else if (S.rota === "auditoria") corpo = AUD.vista(/^[A-Z]{2,4}-/.test(S.param || "") ? null : S.param);
  else if ((S.rota === "logistica" || S.rota === "encomenda") && podeEncomendas(S.eu)) corpo = LOG.vista(S.rota === "logistica" ? S.param : null);
  else corpo = g ? vistaInicioGestor() : vistaInicioMembro();

  const demo = api.modo === "demo" ? '<div class="demo-faixa"><span>Modo de demonstração: os dados ficam só neste aparelho.</span><span><button data-acao="demo-repor">Repor dados</button> · <button data-acao="sair">Trocar de pessoa</button></span></div>' : "";
  const marcaAtual = S.rota === "marca" ? S.param : "twentysix";
  const nova = S.versaoNova ? '<div class="aviso aviso-acao versao-nova" role="status"><span><b>Há uma versão nova da Central 26.</b> Atualiza para ficares com as últimas correções.</span><button class="btn pri" data-acao="atualizar-app">Atualizar agora</button></div>' : "";
  // animação de entrada só quando se muda de página (não a cada atualização)
  const NORM = { stock: "stocks", publicacao: "marketing", fornecedor: "operacional", pedido: "operacional", encomenda: "logistica", cliente: "comercial", tarefa: "inicio" };
  const chaveAnim = (NORM[S.rota] || S.rota) + (["marca", "pessoa"].includes(S.rota) ? "-" + S.param : "");
  const anim = S.carregou && S.rota !== "chat" && S.rotaAnim !== chaveAnim && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (S.carregou) S.rotaAnim = chaveAnim;
  return '<div class="app">' + side + '<main class="main' + (S.rota === "chat" ? " em-chat" : "") + '">' + topo + '<div class="wrap' + (S.rota === "chat" ? " chat-wrap" : "") + (anim ? " anim" : "") + '" data-marca="' + marcaAtual + '">' + nova + (S.rota === "chat" ? "" : demo) + corpo + "</div></main>" + tab + "</div>";
}

function esqueleto() {
  let h = '<div class="tabela" style="margin-top:24px">';
  for (let i = 0; i < 5; i++) h += '<div class="esqueleto"><i style="width:20px;height:20px;border-radius:6px"></i><i style="width:' + (35 + i * 10) + '%"></i></div>';
  return h + "</div>";
}

/* ============================== Linhas de tarefas ============================== */
function linhaTarefa(t, o = {}) {
  const its = itensChecklist(t), feitos = its.filter((i) => i.feito).length, est = estadoAtual(t), feita = est === "concluido";
  const atraso = emAtraso(t, S.hoje), hoje = t.prazo === S.hoje, pode = podeEditar(S.eu, t);
  const sub = [];
  if (o.marca) sub.push('<span class="tag-marca" data-marca="' + t.marca + '">' + esc(MARCA[t.marca]?.curto || "") + "</span>");
  if (o.freq && t.freq !== "unica") sub.push("<span>" + FREQ[t.freq].um + "</span>");
  if (est === "em_curso") sub.push("<span>Em curso</span>");
  if (its.length) sub.push("<span>" + I.lista + '<span class="mono">' + feitos + "/" + its.length + "</span></span>");
  if (t.notas) sub.push('<span title="Tem notas">' + I.nota + "</span>");
  if (t.responsavel_id && !o.semResp) sub.push('<span class="so-m">' + I.pessoa + esc(nomeDe(t.responsavel_id)) + "</span>");
  if (t.prazo) sub.push('<span class="so-m' + (atraso ? " prazo atraso" : "") + '">' + I.cal + esc(rotuloPrazo(t.prazo)) + "</span>");
  const sel = !!S.selecao && !o.compacta, marcada = sel && S.selecao.has(t.id);
  const chk = sel
    ? '<button class="sel-box' + (marcada ? " on" : "") + '" data-acao="sel" data-id="' + t.id + '" aria-label="Selecionar tarefa" aria-pressed="' + marcada + '">' + I.check + "</button>"
    : '<button class="chk' + (feita ? " on" : est === "em_curso" ? " meio" : "") + '" data-acao="alternar" data-id="' + t.id + '" aria-label="' + (feita ? "Marcar como por fazer" : "Marcar como concluída") + '" aria-pressed="' + feita + '"' + (pode ? "" : " disabled") + ">" + I.check + "</button>";
  const ttl = '<button class="ttl" data-acao="' + (sel ? "sel" : "abrir") + '" data-id="' + t.id + '"><span class="t">' + (esc(t.titulo) || '<span style="color:var(--faint)">Sem título</span>') + "</span>" + (sub.length ? '<span class="sub">' + sub.join("") + "</span>" : "") + "</button>";
  const cauda = o.compacta
    ? (atraso ? '<span class="prazo atraso">Em atraso</span>' : '<span class="pri-tag ' + t.prioridade + '">' + PRIORIDADES[t.prioridade] + "</span>")
    : '<span class="pri-tag ' + t.prioridade + '">' + PRIORIDADES[t.prioridade] + '</span><span class="resp' + (t.responsavel_id ? "" : " vazio") + '">' + (t.responsavel_id ? av(t.responsavel_id) + "<span>" + esc(nomeDe(t.responsavel_id)) + "</span>" : "<span>Sem responsável</span>") + '</span><span class="prazo col-prazo' + (atraso ? " atraso" : hoje ? " hoje" : "") + '">' + (t.prazo ? esc(rotuloPrazo(t.prazo)) : "—") + "</span>";
  const mais = sel ? "<span></span>" : '<button class="mais-btn" data-acao="menu" data-id="' + t.id + '" aria-label="Mais ações" aria-haspopup="menu">' + I.mais + "</button>";
  return '<div class="linha' + (o.compacta ? " compacta" : "") + (feita ? " feita" : "") + (marcada ? " marcada" : "") + '" data-marca="' + t.marca + '">' + chk + ttl + cauda + mais + "</div>";
}

function barraSelecao() {
  if (!S.selecao) return "";
  const n = S.selecao.size, todasMarcadas = S.visiveis.length > 0 && S.visiveis.every((id) => S.selecao.has(id));
  const pessoas = ativos().filter((p) => podeAtribuirA(S.eu, p));
  return '<div class="barra-sel" role="region" aria-label="Ações sobre as tarefas selecionadas"><b>' + (n === 1 ? "1 selecionada" : n + " selecionadas") + "</b>" +
    '<button class="btn sec" data-acao="sel-todas">' + (todasMarcadas ? "Desmarcar todas" : "Selecionar todas (" + S.visiveis.length + ")") + "</button>" +
    '<span class="grupo-sel"><button class="btn sec" data-acao="sel-concluir"' + (n ? "" : " disabled") + ">" + I.tarefas + "Concluir</button>" +
    '<label class="sr" for="sel-resp">Atribuir a</label><select class="sel" id="sel-resp"' + (n ? "" : " disabled") + '><option value="">Atribuir a…</option><option value="nenhum">Sem responsável</option>' +
    pessoas.map((p) => '<option value="' + p.id + '">' + esc(p.nome) + "</option>").join("") + "</select>" +
    '<button class="btn perigo" data-acao="sel-eliminar"' + (n ? "" : " disabled") + ">" + I.lixo + "Eliminar</button></span>" +
    '<button class="btn sec" data-acao="sel-cancelar">Cancelar</button></div>';
}

function tabelaTarefas(lista, ctx) {
  const abertas = lista.filter((t) => !concluida(t)), feitas = lista.filter(concluida);
  S.visiveis = (S.mostrarFeitas ? abertas.concat(feitas) : abertas).map((t) => t.id);
  let h = '<div class="tabela"><div class="thead"><span></span><span>Tarefa</span><span>Prioridade</span><span>Responsável</span><span>Prazo</span><span></span></div>';
  h += abertas.map((t) => linhaTarefa(t, ctx.opcoes || {})).join("");
  if (!abertas.length) h += '<div class="vazio-linha">' + (S.q || S.filtroResp ? "Nenhuma tarefa corresponde ao filtro." : lista.length ? "Tudo concluído neste período." : ctx.vazio) + "</div>";
  if (ctx.rapida && !S.selecao) h += '<label class="rapida">' + I.plus + '<span class="sr">Nova tarefa</span><input id="rapida" placeholder="Escreve uma tarefa e carrega em Enter" value="' + esc(S.rascunho) + '" autocomplete="off" enterkeyhint="done"></label>';
  h += "</div>";
  if (feitas.length) {
    h += '<button class="mostrar-feitas" data-acao="mostrar-feitas" aria-expanded="' + S.mostrarFeitas + '">' + I.seta + "Concluídas (" + feitas.length + ")</button>";
    if (S.mostrarFeitas) h += '<div class="tabela">' + feitas.map((t) => linhaTarefa(t, ctx.opcoes || {})).join("") + "</div>";
  }
  return h + barraSelecao();
}

function quadroTarefas(lista) {
  const cols = [["por_fazer", "var(--faint)"], ["em_curso", "var(--b)"], ["concluido", "var(--ok)"]];
  let h = '<div class="quadro">';
  cols.forEach(([est, cor]) => {
    const nesta = lista.filter((t) => estadoAtual(t) === est);
    h += '<div class="col" data-largar="' + est + '"><div class="col-h"><span class="p" style="background:' + cor + '"></span>' + ESTADOS[est] + '<span class="n">' + nesta.length + "</span></div>";
    nesta.forEach((t) => {
      const its = itensChecklist(t), f = its.filter((i) => i.feito).length;
      h += '<div class="cartao" draggable="' + podeEditar(S.eu, t) + '" data-acao="abrir" data-id="' + t.id + '" tabindex="0" role="button"><span class="t">' + (esc(t.titulo) || "Sem título") + '</span><span class="meta"><span class="pri-tag ' + t.prioridade + '">' + PRIORIDADES[t.prioridade] + "</span>" +
        (its.length ? '<span class="mono">' + f + "/" + its.length + "</span>" : "") + (t.responsavel_id ? av(t.responsavel_id) + "<span>" + esc(nomeDe(t.responsavel_id).split(" ")[0]) + "</span>" : "") +
        (t.prazo ? '<span class="prazo' + (emAtraso(t, S.hoje) ? " atraso" : "") + '">' + esc(rotuloPrazo(t.prazo)) + "</span>" : "") + "</span></div>";
    });
    if (est === "por_fazer") h += '<button class="add" data-acao="nova-tarefa">' + I.plus + "Nova tarefa</button>";
    h += "</div>";
  });
  return h + "</div>";
}

const filtrar = (t) => {
  if (S.filtroResp === "nenhum" && t.responsavel_id) return false;
  if (S.filtroResp && S.filtroResp !== "nenhum" && t.responsavel_id !== S.filtroResp) return false;
  if (!S.q) return true;
  const q = normalizar(S.q);
  return normalizar(t.titulo).includes(q) || normalizar(nomeDe(t.responsavel_id)).includes(q) || normalizar(t.notas).includes(q);
};
const estat = (lista, freq) => { const a = lista.filter((t) => t.freq === freq); return { feitas: a.filter(concluida).length, total: a.length }; };

function anel(feitas, total) {
  const r = 26, c = 2 * Math.PI * r, p = total ? feitas / total : 0;
  return '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="' + r + '" fill="none" stroke="var(--sunken)" stroke-width="7"/>' + (p > 0 ? '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="var(--b)" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + (c * p).toFixed(1) + " " + c.toFixed(1) + '"/>' : "") + "</svg>";
}
function logoMarca(m) {
  if (m.logo) return '<img src="' + m.logo + '" alt="Logótipo ' + esc(m.nome) + '">';
  if (m.id === "grooms") return '<div class="marca-txt"><span class="g1">GROOMS</span><span class="g2">by Barbearia 26 de Junho</span></div>';
  return '<div class="marca-txt"><span class="g1">GRUPO 26</span><span class="g2">Interno</span></div>';
}

function separadores(lista, tab) {
  let h = '<div class="tabs" role="tablist">';
  FREQS.forEach((f) => { const s = estat(lista, f.id); h += '<button class="tab" role="tab" data-acao="tab" data-tab="' + f.id + '" aria-selected="' + (tab === f.id) + '">' + f.tab + '<span class="n">' + (s.total ? s.feitas + "/" + s.total : "0") + "</span></button>"; });
  return h + "</div>";
}

function barraFerramentas(tab, comResp) {
  let filtro = "";
  if (comResp) {
    const pessoas = ativos();
    filtro = '<label class="sr" for="filtro-resp">Responsável</label><select class="sel" id="filtro-resp"><option value="">Todos os responsáveis</option><option value="nenhum"' + (S.filtroResp === "nenhum" ? " selected" : "") + ">Sem responsável</option>" +
      pessoas.map((p) => '<option value="' + p.id + '"' + (S.filtroResp === p.id ? " selected" : "") + ">" + esc(p.nome) + "</option>").join("") + "</select>";
  }
  return '<div class="barra"><div class="periodo"><b>' + esc(rotuloPeriodo(tab)) + "</b><span>" + FREQ[tab].reset + '</span></div><div class="ferr">' +
    '<label class="pesq">' + I.lupa + '<span class="sr">Pesquisar tarefas</span><input id="pesquisa" type="search" placeholder="Pesquisar" value="' + esc(S.q) + '"></label>' + filtro +
    '<div class="seg" role="group" aria-label="Vista"><button data-acao="vista" data-vista="lista" aria-pressed="' + (S.vista === "lista") + '">Lista</button><button data-acao="vista" data-vista="quadro" aria-pressed="' + (S.vista === "quadro") + '">Quadro</button></div>' +
    (S.vista === "lista" ? '<button class="btn sec" data-acao="selecionar" aria-pressed="' + !!S.selecao + '">' + I.lista + (S.selecao ? "Terminar seleção" : "Selecionar") + "</button>" : "") +
    '<button class="btn pri" data-acao="nova-tarefa">' + I.plus + "Nova tarefa</button></div></div>";
}

/* ============================== Vistas ============================== */
// Uma frase por dia, igual para toda a equipa
const FRASES = [
  "O detalhe de hoje é a reputação de amanhã.",
  "Feito é melhor do que perfeito. Depois, melhora-se.",
  "Um cliente bem atendido traz o próximo.",
  "Pequenos passos todos os dias fazem grandes marcas.",
  "A disciplina faz o que a motivação não consegue.",
  "Começa pela tarefa mais difícil. O resto do dia agradece.",
  "Quem cuida dos pormenores não tem de explicar o resultado.",
  "Uma equipa alinhada vale mais do que dez ideias soltas.",
  "A consistência é o corte mais difícil de dominar.",
  "Cada tarefa fechada abre espaço para a próxima ideia.",
  "Fazer bem à primeira poupa o tempo de fazer duas vezes.",
  "O cliente não vê o esforço, vê o resultado. Que seja impecável.",
  "Rigor no processo, calma no resultado.",
  "Comunicar cedo evita corrigir tarde.",
  "Não esperes pela segunda-feira. Começa agora.",
  "O que se acompanha, cresce.",
  "Mais vale uma pergunta agora do que um erro depois.",
  "Ambição grande, passos concretos.",
  "O nosso nome vai em tudo o que fazemos.",
  "Arruma, prioriza, executa.",
  "Ninguém cresce sozinho: pede ajuda e dá ajuda.",
  "Deixa tudo um pouco melhor do que encontraste.",
  "Foco no essencial. As distrações ficam para depois.",
  "A pressa é inimiga do acabamento.",
  "Terminar também se treina. Treina hoje.",
  "O sucesso está nas rotinas que ninguém vê.",
  "Uma tarefa de cada vez, bem feita.",
  "As grandes marcas constroem-se em dias normais.",
  "Se é para fazer, faz-se como deve ser.",
  "Ouvir o cliente é o melhor estudo de mercado.",
  "Prazos cumpridos são confiança ganha.",
  "Hoje conta. Faz com que se note.",
  "Mão firme, cabeça fria, padrão alto.",
  "Quem prepara bem, executa depressa.",
  "Ideias há muitas. O que nos distingue é fazer.",
];
function fraseDoDia() {
  const d = new Date(), n = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2026, 0, 1)) / 864e5);
  return FRASES[((n % FRASES.length) + FRASES.length) % FRASES.length];
}
function cabInicio(acoes) {
  const d = new Date();
  return '<div class="cab cab-inicio"><div><div class="eyebrow neutro">' + esc(cap(DIA[d.getDay()])) + ", " + d.getDate() + " de " + MES_L[d.getMonth()] + " de " + d.getFullYear() + " · semana " + semanaIso(d)[1] + "</div><h1>Olá, " + esc(S.eu.nome.split(" ")[0]) +
    '</h1><p class="frase-dia"><span aria-hidden="true">“</span>' + esc(fraseDoDia()) + '<span aria-hidden="true">”</span></p></div>' + acoes + "</div>";
}
// Cada pessoa vê no Início o que é do seu departamento; a direção vê um resumo de todos
const MOD_DEP = { tecnologico: () => AUD, logistica: () => LOG, operacional: () => OP, marketing: () => MK, comercial: () => CRM };
function blocosInicio() {
  let h = AGENDA.blocoHoje();
  const dep = S.eu.departamento_id, mod = MOD_DEP[dep]?.();
  if (mod) h += mod.blocoInicio();
  else if (eGestor(S.eu)) h += resumoDirecao();
  if (dep !== "tecnologico" && !eGestor(S.eu)) h += AUD.blocoInicio(); // só aparece com itens atribuídos à pessoa
  h += STK.blocoInicio(); // só aparece quando há produtos a repor
  return h;
}
function resumoDirecao() {
  const t = [];
  const tile = (href, ic, nome, n, rot, alerta) => t.push('<a class="dep-tile' + (alerta && n ? " dt-alerta" : "") + '" href="' + href + '">' + ic + '<span class="dt-n">' + esc(nome) + "</span>" + (n == null ? '<span class="dt-abrir">Abrir' + I.seta + "</span>" : '<b class="mono">' + n + "</b>") + "<small>" + esc(rot) + "</small></a>");
  if (podeCrm(S.eu)) { const pronto = CRM.estado() === "pronto"; tile("#comercial", I.loja, "Comercial", pronto ? CRM.contagem() : null, pronto ? "seguimentos para hoje" : "clientes, funil e mapa", true); }
  if (podeMarketing(S.eu)) { if (MK.estado() === "por-carregar") MK.carregar(); tile("#marketing", I.megafone, "Marketing", MK.estado() === "pronto" ? MK.contagem() : null, "publicações atrasadas", true); }
  if (AUD.visivel()) { AUD.blocoInicio(); tile("#auditoria", I.escudo, "Tecnológico", AUD.estado() === "pronto" ? AUD.contagem() : null, "itens da auditoria por validar", false); }
  if (podeEncomendas(S.eu)) { LOG.blocoInicio(); tile("#logistica", I.camiao, "Logística", LOG.estado() === "pronto" ? LOG.contagem() : null, "encomendas novas", true); }
  if (podeOperacional(S.eu)) { OP.blocoInicio(); tile("#operacional", I.caixa, "Operacional", OP.estado() === "pronto" ? OP.contagem() : null, "fornecedores a contactar hoje", true); }
  if (podeFinanceiro(S.eu)) tile("#financeiro", I.euro, "Financeiro", null, "faturação e custos por mês", false);
  return t.length ? '<section class="resumo-dir" aria-label="Departamentos"><h2>Departamentos</h2><div class="dep-tiles">' + t.join("") + "</div></section>" : "";
}
function marcasHTML(lista) {
  let h = '<section class="marcas-sec"><h2>As marcas <span class="n">tarefas de hoje e do período</span></h2><div class="marcas-grid">';
  MARCAS.forEach((m) => {
    const lm = lista.filter((t) => t.marca === m.id), hoje = estat(lm, "diaria");
    const atraso = lm.filter((t) => emAtraso(t, S.hoje)).length;
    h += '<a class="mcard" href="#marca-' + m.id + '" data-marca="' + m.id + '"><div class="plate sm">' + logoMarca(m) + '</div><div class="corpo"><div class="mc-topo"><span class="nm">' + esc(m.nome) + '</span><span class="mc-anel" title="Hoje: ' + hoje.feitas + " de " + hoje.total + '">' + anel(hoje.feitas, hoje.total) + "</span></div>";
    [["semanal", "Semana"], ["mensal", "Mês"], ["unica", "Pontuais"]].forEach(([f, r]) => {
      const st = estat(lm, f);
      h += '<div class="medidor"><span>' + r + '</span><div class="barra-p"><i style="width:' + (st.total ? Math.round((st.feitas / st.total) * 100) : 0) + '%"></i></div><span class="v">' + st.feitas + "/" + st.total + "</span></div>";
    });
    h += '<span class="mc-pe">' + (atraso ? '<span class="alerta">' + atraso + (atraso === 1 ? " em atraso" : " em atraso") + "</span>" : '<span class="' + (hoje.feitas === hoje.total ? "ok-txt" : "muted") + '">' + (hoje.total ? hoje.feitas + "/" + hoje.total + " hoje" : "Em dia") + "</span>") + I.seta + "</span></div></a>";
  });
  return h + "</div></section>";
}
function paraHojeHTML(lista, opcoes, vazio) {
  const pg = paginar(lista, S.pagHoje, 10); S.pagHoje = pg.pag;
  return '<div class="tabela">' + (lista.length ? pg.itens.map((t) => linhaTarefa(t, opcoes)).join("") : '<div class="vazio-linha">' + vazio + "</div>") + "</div>" + paginador(pg, "pag-hoje", "tarefas");
}
function vistaInicioGestor() {
  const lista = todas();
  let h = cabInicio('<div class="acts"><button class="btn pri" data-acao="nova-tarefa">' + I.plus + "Nova tarefa</button></div>");
  h += avisoInstalar();
  h += blocosInicio();
  if (!lista.length) {
    h += '<div class="vazio"><h3>Ainda não há tarefas</h3><p>Podes começar pelos modelos sugeridos: rotinas de cada marca e rotinas da Logística. Depois atribuis cada tarefa à pessoa certa.</p><div class="acts"><button class="btn pri" data-acao="modelos">Escolher modelos</button></div></div>';
  }
  h += marcasHTML(lista);
  const paraHoje = ordenar(lista.filter((t) => !concluida(t) && (t.freq === "diaria" || (t.prazo && t.prazo <= S.hoje))));
  h += '<div class="duas"><section data-marca="twentysix"><h2>Para hoje <span class="n">' + paraHoje.length + " por fazer</span></h2>" + paraHojeHTML(paraHoje, { marca: true, compacta: true }, "Está tudo feito por hoje.") + "</section>";
  h += '<section><h2>Equipa hoje</h2><div class="equipa-hoje">' + ativos().map((p) => {
    const dele = lista.filter((t) => t.responsavel_id === p.id);
    const hojeTot = dele.filter((t) => t.freq === "diaria" || t.prazo === S.hoje);
    const hojeFeitas = hojeTot.filter(concluida).length;
    const at = dele.filter((t) => emAtraso(t, S.hoje)).length;
    return '<a class="eh-linha" href="#pessoa-' + p.id + '">' + av(p.id) + '<span><span class="nm">' + esc(p.nome) + "</span><small>" + esc(depNome(p.departamento_id)) + '</small></span><span class="num">' + hojeFeitas + "/" + hojeTot.length + " hoje" + (at ? '<br><span class="at">' + at + " em atraso</span>" : "") + "</span></a>";
  }).join("") + "</div></section></div>";
  return h;
}

function vistaInicioMembro() {
  const minhas = todas().filter((t) => t.responsavel_id === S.eu.id);
  const hoje = ordenar(minhas.filter((t) => !concluida(t) && (t.freq === "diaria" || (t.prazo && t.prazo <= S.hoje))));
  const feitasHoje = minhas.filter((t) => t.freq === "diaria" && concluida(t)).length;
  const livres = ordenar(todas().filter((t) => !t.responsavel_id && t.departamento_id === S.eu.departamento_id && !concluida(t)));
  let h = cabInicio('<button class="btn pri" data-acao="nova-tarefa">' + I.plus + "Nova tarefa</button>");
  h += avisoInstalar();
  h += blocosInicio();
  h += '<section data-marca="twentysix"><h2>Para hoje <span class="n">' + hoje.length + " por fazer · " + feitasHoje + " concluídas</span></h2>" + paraHojeHTML(hoje, { marca: true, compacta: true, semResp: true }, "Não tens nada pendente para hoje.") + "</section>";
  const resto = ordenar(minhas.filter((t) => !concluida(t) && t.freq !== "diaria" && !(t.prazo && t.prazo <= S.hoje)));
  if (resto.length) h += '<section data-marca="twentysix"><h2>Próximas <span class="n">' + resto.length + '</span></h2><div class="tabela">' + resto.slice(0, 8).map((t) => linhaTarefa(t, { marca: true, freq: true, compacta: true, semResp: true })).join("") + "</div>" + (resto.length > 8 ? '<a class="mostrar-feitas" href="#minhas">' + I.seta + "Ver todas as minhas tarefas</a>" : "") + "</section>";
  if (livres.length) h += '<section data-marca="twentysix"><h2>Sem responsável no departamento <span class="n">' + livres.length + '</span></h2><div class="tabela">' + livres.slice(0, 8).map((t) => linhaTarefa(t, { marca: true, freq: true, compacta: true })).join("") + "</div></section>";
  return h;
}

const CHAVE_INSTALAR = "central26-instalar-fechado";
function avisoInstalar() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (standalone || !window.matchMedia("(max-width:820px)").matches) return "";
  try { if (localStorage.getItem(CHAVE_INSTALAR)) return ""; } catch { /* sem armazenamento */ }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const fechar = '<button class="ib" data-acao="instalar-fechar" aria-label="Fechar aviso">' + I.x + "</button>";
  if (S.instalar) return '<div class="instalar so-browser"><span>' + I.casa + 'Instala a app para receberes avisos.</span><span class="acts"><button class="btn sec" data-acao="instalar">Instalar</button>' + fechar + "</span></div>";
  if (ios) return '<div class="instalar so-browser"><span>' + I.casa + "Para instalar: Partilhar → «Adicionar ao ecrã principal».</span>" + fechar + "</div>";
  return "";
}

function vistaMinhas() {
  const tab = S.tab.minhas || "diaria";
  const minhas = todas().filter((t) => t.responsavel_id === S.eu.id);
  const lista = ordenar(minhas.filter((t) => t.freq === tab).filter(filtrar));
  let h = '<div class="cab"><div><div class="eyebrow neutro">' + esc(depNome(S.eu.departamento_id)) + "</div><h1>As minhas tarefas</h1></div></div>";
  h += separadores(minhas, tab) + barraFerramentas(tab, false);
  return h + (S.vista === "quadro" ? quadroTarefas(lista) : tabelaTarefas(lista, { rapida: true, opcoes: { marca: true, semResp: true }, vazio: "Não tens tarefas " + FREQ[tab].tab.toLowerCase() + "." }));
}

function vistaMarca(m) {
  const tab = S.tab[m.id] || "diaria";
  const daMarca = todas().filter((t) => t.marca === m.id);
  const lista = ordenar(daMarca.filter((t) => t.freq === tab).filter(filtrar));
  const s = estat(daMarca, tab);
  let h = '<header class="bhead"><div class="plate">' + logoMarca(m) + '</div><div class="bmeta"><span class="eyebrow">' + esc(m.eyebrow) + "</span><h1>" + esc(m.nome) + '</h1><p class="bdesc">' + esc(m.desc) + "</p>" +
    (m.site ? '<a class="link-site" href="' + m.site + '" target="_blank" rel="noopener">' + esc(m.host) + I.out + "</a>" : "") + "</div>" +
    '<div class="anel">' + anel(s.feitas, s.total) + '<div class="rt"><b>' + s.feitas + "/" + s.total + "</b><span>" + ({ diaria: "concluídas hoje", semanal: "concluídas esta semana", mensal: "concluídas este mês", anual: "concluídas este ano", unica: "pontuais concluídas" })[tab] + "</span></div></div></header>";
  h += separadores(daMarca, tab);
  if (!daMarca.length && eGestor(S.eu)) h += '<div class="vazio"><h3>Ainda não há tarefas da ' + esc(m.nome) + "</h3><p>Carrega o modelo sugerido ou cria a primeira tarefa.</p>" + '<div class="acts"><button class="btn pri" data-acao="modelos">Escolher modelos</button></div></div>';
  h += barraFerramentas(tab, true);
  return h + (S.vista === "quadro" ? quadroTarefas(lista) : tabelaTarefas(lista, { rapida: true, opcoes: {}, vazio: "Sem tarefas " + FREQ[tab].tab.toLowerCase() + "." }));
}

/* ---------- equipa ---------- */
function contagensPessoa(id) {
  const dele = todas().filter((t) => t.responsavel_id === id);
  const sem = inicioPeriodo("semana").getTime(), mes = inicioPeriodo("mes").getTime();
  const c = conclusoes(S.atividade);
  const semana = c.filter((a) => a.autor_id === id && new Date(a.criado_em).getTime() >= sem).length;
  const doMes = c.filter((a) => a.autor_id === id && new Date(a.criado_em).getTime() >= mes).length;
  return {
    abertas: dele.filter((t) => !concluida(t)).length,
    atraso: dele.filter((t) => emAtraso(t, S.hoje)).length,
    semana, mes: doMes,
  };
}

// Cor de cada departamento (reaproveita as cores das marcas, que já funcionam em claro e escuro)
const COR_DEP = { direcao: "twentysix", administrativo: "grupo", comercial: "tech", marketing: "academy", operacional: "barbearia", logistica: "grooms", tecnologico: "tech" };
const corDep = (id) => COR_DEP[id] || "grupo";
function vistaEquipa() {
  const g = eGestor(S.eu);
  const pessoas = listaPerfis().filter((p) => p.ativo || g);
  const abertas = todas().filter((t) => t.responsavel_id && !concluida(t)), atraso = todas().filter((t) => emAtraso(t, S.hoje)).length;
  let h = '<div class="cab"><div><div class="eyebrow neutro">Grupo 26</div><h1>Equipa</h1></div>' +
    (g ? '<div class="acts"><button class="btn sec" data-acao="novo-dep">Novo departamento</button><button class="btn pri" data-acao="novo-empregado">' + I.plus + "Adicionar empregado</button></div>" : "") + "</div>";
  h += '<div class="resumo-crm resumo-eq"><div class="kpi"><span>Pessoas ativas</span><b>' + ativos().length + '</b></div><div class="kpi"><span>Departamentos</span><b>' + listaDeps().length +
    '</b></div><div class="kpi"><span>Tarefas por fazer</span><b>' + abertas.length + '</b></div><div class="kpi' + (atraso ? " alerta-kpi" : "") + '"><span>Em atraso</span><b>' + atraso + "</b></div></div>";
  const porDep = {};
  pessoas.forEach((p) => (porDep[p.departamento_id || ""] ||= []).push(p));
  const ordem = [...listaDeps().map((d) => d.id), ""];
  const papelOrd = { ceo: 0, admin: 1, chefe: 2, colaborador: 3 };
  h += '<div class="eq-deps">';
  ordem.forEach((dep) => {
    const l = (porDep[dep] || []).sort((a, b) => (papelOrd[a.papel] ?? 9) - (papelOrd[b.papel] ?? 9) || a.nome.localeCompare(b.nome, "pt"));
    if (!l.length) return;
    h += '<section class="dep-bloco" data-marca="' + corDep(dep) + '"><div class="dep-cab"><span class="dep-ponto"></span><h2>' + esc(depNome(dep || null)) + '</h2><span class="n">' + l.length + (l.length === 1 ? " pessoa" : " pessoas") + '</span></div><div class="pessoas">' +
      l.map((p) => {
        const c = contagensPessoa(p.id);
        return '<a class="pcard' + (p.ativo ? "" : " inativo") + '" href="#pessoa-' + p.id + '">' + av(p.id, "g") +
          '<span class="pc-nome"><b>' + esc(p.nome) + '</b><small>' + esc(p.cargo || "—") + (p.ativo ? "" : " · Conta desativada") + '</small><span class="papel-tag p-' + esc(p.papel) + '">' + esc(PAPEIS[p.papel]) + "</span></span>" +
          '<span class="pc-nums"><span><b class="mono">' + c.abertas + '</b>por fazer</span><span><b class="mono">' + c.semana + '</b>na semana</span><span class="' + (c.atraso ? "at" : "") + '"><b class="mono">' + c.atraso + "</b>em atraso</span></span></a>";
      }).join("") + "</div></section>";
  });
  return h + "</div>";
}

function vistaPessoa(p) {
  if (!p) return '<div class="vazio"><h3>Pessoa não encontrada</h3><p>Pode ter sido removida.</p><a class="btn sec" href="#equipa">Voltar à equipa</a></div>';
  const g = eGestor(S.eu), c = contagensPessoa(p.id);
  const dele = ordenar(todas().filter((t) => t.responsavel_id === p.id && !concluida(t)));
  let h = '<a href="#equipa" class="eyebrow neutro" style="text-decoration:none">← Equipa</a>';
  h += '<div class="ficha">' + av(p.id, "xg") + '<div class="bmeta"><span class="eyebrow neutro">' + esc(PAPEIS[p.papel]) + " · " + esc(depNome(p.departamento_id)) + (p.ativo ? "" : " · Conta desativada") + "</span><h1>" + esc(p.nome) + '</h1><p class="sub-cab">' + esc(p.cargo || "") + '</p><div class="contactos"><span>' + I.mail + esc(p.email) + "</span>" + (p.telefone ? "<span>" + I.tel + esc(p.telefone) + "</span>" : "") + "</div></div></div>";
  if (p.id !== S.eu.id && p.ativo) h += '<div class="acts"><button class="btn sec" data-acao="chat-direto" data-id="' + p.id + '">' + I.balao + "Enviar mensagem</button></div>";
  h += '<div class="dados"><div class="dado"><span>Por fazer</span><b>' + c.abertas + '</b></div><div class="dado"><span>Em atraso</span><b class="' + (c.atraso ? "at" : "") + '">' + c.atraso + '</b></div><div class="dado"><span>Concluídas esta semana</span><b>' + c.semana + '</b></div><div class="dado"><span>Concluídas este mês</span><b>' + c.mes + "</b></div></div>";
  const podeDar = podeAtribuirA(S.eu, p);
  h += '<section data-marca="twentysix"><h2>Tarefas atribuídas <span class="n">' + dele.length + " por fazer</span>" + (podeDar && p.ativo ? '<button class="btn pri" style="margin-left:auto" data-acao="nova-tarefa" data-resp="' + p.id + '">' + I.plus + "Dar tarefa</button>" : "") + '</h2><div class="tabela">' +
    (dele.length ? dele.map((t) => linhaTarefa(t, { marca: true, freq: true, compacta: true, semResp: true })).join("") : '<div class="vazio-linha">Sem tarefas por fazer.</div>') + "</div></section>";
  const feed = S.atividade.filter((a) => a.autor_id === p.id).slice(0, 15);
  h += "<section><h2>Atividade recente</h2>" + feedHTML(feed, true) + "</section>";
  if (g && p.id !== S.eu.id && (p.papel !== "ceo" || S.eu.papel === "ceo")) {
    h += '<section class="cartao-sec"><h3>Gerir conta</h3><form class="form" id="form-pessoa" data-id="' + p.id + '">' +
      '<div class="campos-2"><div class="campo"><label for="ep-cargo">Cargo</label><input id="ep-cargo" value="' + esc(p.cargo) + '"></div>' +
      '<div class="campo"><label for="ep-tel">Telefone</label><input id="ep-tel" type="tel" value="' + esc(p.telefone) + '"></div></div>' +
      '<div class="campos-2"><div class="campo"><label for="ep-dep">Departamento</label><select id="ep-dep">' + opcoesDeps(p.departamento_id) + "</select></div>" +
      '<div class="campo"><label for="ep-papel">Papel</label><select id="ep-papel">' + opcoesPapel(p.papel) + "</select></div></div>" +
      (p.papel !== "ceo" ? '<label class="chk-txt"><input type="checkbox" id="ep-agenda"' + (p.gere_agenda ? " checked" : "") + "> Pode gerir a agenda do CEO (criar, mudar e cancelar eventos)</label>" : "") +
      '<div class="acts"><button class="btn pri" type="submit">Guardar alterações</button><button class="btn sec" type="button" data-acao="repor-pass" data-id="' + p.id + '">Repor palavra-passe</button>' +
      (p.ativo ? '<button class="btn perigo-sec" type="button" data-acao="ativar" data-id="' + p.id + '" data-ativo="0">Desativar conta</button>' : '<button class="btn sec" type="button" data-acao="ativar" data-id="' + p.id + '" data-ativo="1">Reativar conta</button>') +
      "</div></form>" + (S.novaPass && S.novaPass.id === p.id ? senhaHTML(S.novaPass.password, p.nome) : "") + "</section>";
  }
  return h;
}

function opcoesDeps(atual) {
  return '<option value="">Sem departamento</option>' + listaDeps().map((d) => '<option value="' + d.id + '"' + (d.id === atual ? " selected" : "") + ">" + esc(d.nome) + "</option>").join("");
}
function opcoesPapel(atual) {
  const haCeo = listaPerfis().some((p) => p.papel === "ceo" && p.ativo);
  return Object.entries(PAPEIS).filter(([k]) => k !== "ceo" || S.eu.papel === "ceo" || !haCeo || atual === "ceo")
    .map(([k, v]) => '<option value="' + k + '"' + (k === atual ? " selected" : "") + ">" + v + "</option>").join("");
}
function senhaHTML(pass, nome) {
  return '<div class="aviso ok" style="flex-direction:column;align-items:stretch;gap:10px"><span>Palavra-passe temporária de ' + esc(nome) + '. Entrega-a pessoalmente; vai ter de a mudar no primeiro acesso. Não volta a ser mostrada.</span>' +
    '<div class="senha" id="senha-txt">' + esc(pass) + '</div><button class="btn sec" data-acao="copiar-senha" style="align-self:flex-start">' + I.copiar + "Copiar</button></div>";
}

/* ---------- atividade ---------- */
// Conta cada tarefa uma vez por período: se foi reaberta depois, deixa de contar.
function conclusoes(lista) {
  const ult = new Map();
  [...lista].sort((a, b) => (a.criado_em < b.criado_em ? -1 : 1)).forEach((a) => {
    if (a.acao !== "concluiu" && a.acao !== "reabriu") return;
    ult.set(a.tarefa_id + "|" + a.periodo, a);
  });
  return [...ult.values()].filter((a) => a.acao === "concluiu");
}

const ACOES = { criou: "criou", atribuiu: "atribuiu", iniciou: "começou", concluiu: "concluiu", reabriu: "reabriu", eliminou: "eliminou" };
function itemFeed(a, semAutor) {
  const para = a.acao === "atribuiu" && a.responsavel_id ? " a " + esc(nomeDe(a.responsavel_id) || "alguém") : "";
  const titulo = a.tarefa_id && S.tarefas[a.tarefa_id] ? '<a href="#tarefa-' + a.tarefa_id + '">«' + esc(a.titulo || "Sem título") + "»</a>" : "«" + esc(a.titulo || "Sem título") + "»";
  return '<div class="feed-item">' + (semAutor ? '<span class="feed-ic a-' + a.acao + '" aria-hidden="true"></span>' : av(a.autor_id)) + '<span class="txt">' + (semAutor ? "" : "<b>" + esc(nomeDe(a.autor_id) || "Alguém") + "</b> ") + '<span class="acao ' + a.acao + '">' + (ACOES[a.acao] || a.acao) + "</span> " + titulo + para +
    (a.marca && MARCA[a.marca] ? ' <span class="tag-marca" data-marca="' + a.marca + '">' + esc(MARCA[a.marca].curto) + "</span>" : "") + '</span><span class="q">' + new Date(a.criado_em).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) + "</span></div>";
}
function rotuloDiaFeed(ts) {
  const d = new Date(ts), k = ymd(d), ontem = ymd(new Date(Date.now() - 864e5));
  if (k === S.hoje) return "Hoje";
  if (k === ontem) return "Ontem";
  return cap(DIA[d.getDay()]) + ", " + d.getDate() + " de " + MES_L[d.getMonth()];
}
// Registo agrupado por dia
function feedHTML(lista, semAutor) {
  if (!lista.length) return '<div class="vazio-linha">Sem atividade registada.</div>';
  let h = "", dia = "";
  for (const a of lista) {
    const k = ymd(new Date(a.criado_em));
    if (k !== dia) { if (dia) h += "</div>"; h += '<div class="feed-dia"><span>' + esc(rotuloDiaFeed(a.criado_em)) + '</span></div><div class="feed">'; dia = k; }
    h += itemFeed(a, semAutor);
  }
  return h + "</div>";
}

function vistaAtividade() {
  const tipo = S.periodoAtiv;
  const desde = tipo === "hoje" ? inicioPeriodo("dia").getTime() : inicioPeriodo(tipo).getTime();
  const noPeriodo = S.atividade.filter((a) => new Date(a.criado_em).getTime() >= desde);
  const feitas = conclusoes(noPeriodo);
  const g = eGestor(S.eu);
  let pessoas = ativos();
  if (!g) pessoas = S.eu.papel === "chefe" ? pessoas.filter((p) => p.departamento_id === S.eu.departamento_id) : pessoas.filter((p) => p.id === S.eu.id);
  if (S.filtroDep) pessoas = pessoas.filter((p) => p.departamento_id === S.filtroDep);
  const linhas = pessoas.map((p) => {
    const dele = todas().filter((t) => t.responsavel_id === p.id);
    return { p, feitas: feitas.filter((a) => a.autor_id === p.id).length, abertas: dele.filter((t) => !concluida(t)).length, atraso: dele.filter((t) => emAtraso(t, S.hoje)).length };
  }).sort((a, b) => b.feitas - a.feitas || a.p.nome.localeCompare(b.p.nome, "pt"));
  const max = Math.max(1, ...linhas.map((l) => l.feitas));
  const rot = { hoje: "hoje", semana: "esta semana", mes: "este mês" }[tipo];

  let h = '<div class="cab"><div><div class="eyebrow neutro">Atividade da equipa</div><h1>Quem fez o quê</h1></div><div class="ferr">' +
    '<div class="seg" role="group" aria-label="Período"><button data-acao="per-ativ" data-p="hoje" aria-pressed="' + (tipo === "hoje") + '">Hoje</button><button data-acao="per-ativ" data-p="semana" aria-pressed="' + (tipo === "semana") + '">Semana</button><button data-acao="per-ativ" data-p="mes" aria-pressed="' + (tipo === "mes") + '">Mês</button></div>' +
    (g ? '<label class="sr" for="filtro-dep">Departamento</label><select class="sel" id="filtro-dep"><option value="">Todos os departamentos</option>' + listaDeps().map((d) => '<option value="' + d.id + '"' + (S.filtroDep === d.id ? " selected" : "") + ">" + esc(d.nome) + "</option>").join("") + "</select>" : "") +
    "</div></div>";
  const totFeitas = linhas.reduce((x, l) => x + l.feitas, 0), totAt = linhas.reduce((x, l) => x + l.atraso, 0);
  const melhor = linhas[0] && linhas[0].feitas ? linhas[0] : null;
  h += '<div class="resumo-crm resumo-eq"><div class="kpi"><span>Concluídas ' + rot + "</span><b>" + totFeitas + '</b></div><div class="kpi"><span>Ações registadas</span><b>' + noPeriodo.length + '</b></div><div class="kpi' + (totAt ? " alerta-kpi" : "") + '"><span>Em atraso</span><b>' + totAt + '</b></div><div class="kpi"><span>Mais concluídas</span><b class="kpi-txt">' + (melhor ? esc(melhor.p.nome.split(" ")[0]) : "—") + "</b></div></div>";
  h += '<section data-marca="twentysix"><div class="ranking-cartoes">' +
    linhas.map((l, i) => '<a class="rk" href="#pessoa-' + l.p.id + '"><span class="rk-pos mono">' + (i + 1) + "</span>" + av(l.p.id) + '<span class="rk-t"><b>' + esc(l.p.nome) + "</b><small>" + esc(depNome(l.p.departamento_id)) + '</small></span><span class="rk-barra"><span class="barra-p"><i style="width:' + Math.round((l.feitas / max) * 100) + '%"></i></span></span>' +
      '<span class="rk-n rk-feitas"><b class="mono">' + l.feitas + '</b><small>concluídas</small></span><span class="rk-n"><b class="mono">' + l.abertas + '</b><small>por fazer</small></span><span class="rk-n' + (l.atraso ? " at" : "") + '"><b class="mono">' + l.atraso + "</b><small>em atraso</small></span></a>").join("") +
    "</div></section>";
  const ids = new Set(pessoas.map((p) => p.id));
  const doFiltro = noPeriodo.filter((a) => (g && !S.filtroDep ? true : ids.has(a.autor_id)) && (!S.filtroAcao || a.acao === S.filtroAcao));
  const pg = paginar(doFiltro, S.pagAtiv, 25); S.pagAtiv = pg.pag;
  const fAc = [["", "Tudo"], ["concluiu", "Concluídas"], ["criou", "Criadas"], ["atribuiu", "Atribuídas"], ["reabriu", "Reabertas"]];
  h += '<section class="registo"><h2>Registo <span class="n">' + doFiltro.length + " ações " + rot + '</span></h2><div class="chips-marca" role="group" aria-label="Tipo de ação">' +
    fAc.map(([k, r]) => '<button class="chip-m' + (S.filtroAcao === k ? " on" : "") + '" data-acao="ativ-acao" data-v="' + k + '">' + r + "</button>").join("") + "</div>" + feedHTML(pg.itens) + paginador(pg, "pag-ativ", "ações") + "</section>";
  return h;
}

/* ---------- notificações ---------- */
function vistaNotificacoes() {
  const nl = S.notifs.filter((n) => !n.lida).length;
  const lidas = S.notifs.length - nl;
  let h = '<div class="cab"><div><div class="eyebrow neutro">' + (nl ? nl + " por ler" : "Tudo lido") + "</div><h1>Notificações</h1></div>" +
    '<div class="acts">' + (nl ? '<button class="btn sec" data-acao="ler-todas">Marcar todas como lidas</button>' : "") + (lidas ? '<button class="btn sec" data-acao="limpar-lidas">' + I.lixo + "Apagar as lidas (" + lidas + ")</button>" : "") + "</div></div>";
  if (!S.notifs.length) return h + '<div class="vazio"><h3>Sem notificações</h3><p>Aqui aparecem as tarefas que te atribuírem e as tarefas que criaste quando forem concluídas.</p></div>';
  const pg = paginar(S.notifs, S.pagNotif, 20); S.pagNotif = pg.pag;
  return h + '<div class="notifs">' + pg.itens.map((n) => '<button class="notif' + (n.lida ? "" : " nova") + '" data-acao="abrir-notif" data-id="' + n.id + '"><span class="ponto"></span><span><span class="t">' + esc(n.titulo) + '</span><br><span class="c">' + esc(n.corpo) + '</span></span><span class="q">' + haQuanto(n.criado_em) + "</span></button>").join("") + "</div>" + paginador(pg, "pag-notif", "notificações");
}

/* ---------- definições ---------- */
function estadoPush() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return ios && !standalone ? { estado: "instalar", txt: "No iPhone, as notificações só funcionam com a app instalada: no Safari, toca em Partilhar → «Adicionar ao ecrã principal», abre a Central 26 pelo ícone e volta aqui." }
      : { estado: "nao", txt: "Este navegador não suporta notificações. Usa o Chrome (Android ou computador) ou o Safari no iPhone com a app instalada." };
  }
  if (Notification.permission === "denied") return { estado: "negado", txt: "As notificações estão bloqueadas para este site. Ativa-as nas definições do navegador ou do telemóvel." };
  if (Notification.permission === "granted") return { estado: "ok", txt: "Permissão concedida. Se ainda não recebes notificações, toca em «Ativar neste aparelho» outra vez." };
  return { estado: "pedir", txt: "Recebe um aviso no telemóvel quando te atribuírem uma tarefa." };
}

function vistaDefinicoes() {
  const p = estadoPush();
  let h = '<div class="cab"><div><div class="eyebrow neutro">' + esc(S.eu.email) + "</div><h1>Mais</h1></div></div>";
  h += '<nav class="atalhos" aria-label="Secções">' + [["#agenda", I.cal, "Agenda"], ["#notificacoes", I.sino, "Notificações"], ["#atividade", I.grafico, "Quem fez o quê"], ["#equipa", I.equipa, "Equipa"], ...(podeCrm(S.eu) ? [["#comercial", I.loja, "Comercial"]] : []),
    ...(podeEncomendas(S.eu) ? [["#logistica", I.camiao, "Logística"]] : []), ...(podeOperacional(S.eu) ? [["#operacional", I.caixa, "Fornecedores"]] : []), ...(podeMarketing(S.eu) ? [["#marketing", I.megafone, "Marketing"]] : []), ...(podeStocks(S.eu) ? [["#stocks", I.stock, "Stocks TwentySix"]] : []),
    ...(AUD.visivel() ? [["#auditoria", I.escudo, "Auditoria dos sites"]] : []), ...(podeFinanceiro(S.eu) ? [["#financeiro", I.euro, "Financeiro"]] : [])]
    .map(([href, ic, r]) => '<a href="' + href + '">' + ic + "<span>" + r + "</span>" + I.seta + "</a>").join("") + "</nav>";
  if (!S.prefs && api.preferencias) { S.prefs = { aCarregar: true }; api.preferencias.ler(S.eu.id).then((x) => { S.prefs = x; render(); }).catch(() => { S.prefs = { falta: true }; render(); }); }
  const corAtual = S.eu.cor || "";
  h += '<section class="cartao-sec perfil-sec"><h3>O meu perfil</h3><div class="perfil-topo">' + av(S.eu.id, "xl") + '<div class="perfil-acoes"><b>' + esc(S.eu.nome) + "</b><small>" + esc(S.eu.cargo || "—") + " · " + esc(depNome(S.eu.departamento_id)) + "</small>" +
    '<div class="acts"><label class="btn sec" for="pf-foto">' + I.camara + (S.eu.foto_path ? "Mudar a foto" : "Pôr uma foto") + '</label><input id="pf-foto" type="file" accept="image/*" hidden>' +
    (S.eu.foto_path ? '<button class="btn sec" data-acao="foto-remover">Remover a foto</button>' : "") + "</div></div></div>" +
    '<div class="cores-perfil" role="radiogroup" aria-label="Cor do perfil"><span class="muted">Cor</span>' + ["", "twentysix", "barbearia", "academy", "tech", "grooms", "vinho", "verde", "roxo", "laranja"].map((c) =>
      '<button class="cor-b" role="radio" aria-checked="' + (c === corAtual) + '" data-acao="cor-perfil" data-v="' + c + '" data-cor="' + c + '" aria-label="' + (c ? "Cor " + c : "Cor automática") + '"></button>').join("") + "</div>" +
    '<form class="form" id="form-perfil"><div class="campos-2"><div class="campo"><label for="pf-nome">Nome</label><input id="pf-nome" value="' + esc(S.eu.nome) + '" autocomplete="name"></div><div class="campo"><label for="pf-tel">Telefone</label><input id="pf-tel" type="tel" value="' + esc(S.eu.telefone) + '" autocomplete="tel"></div></div>' +
    '<p class="campo ajuda" style="margin:0">Cargo: ' + esc(S.eu.cargo || "—") + " · " + esc(depNome(S.eu.departamento_id)) + " · " + esc(PAPEIS[S.eu.papel]) + '. Estes dados são alterados pela administração.</p><div class="acts"><button class="btn pri" type="submit">Guardar</button></div></form></section>';
  const pr = S.prefs || {};
  h += '<section class="cartao-sec"><h3>Avisos por email</h3>' + (pr.falta ? '<p class="muted">Os avisos por email precisam do script supabase/12-perfil-email-stocks.sql no Supabase.</p>' :
    "<p>Recebe um email em <b>" + esc(S.eu.email) + "</b> quando:</p>" + '<div class="prefs">' + [["email_tarefas", "Te atribuem uma tarefa"], ["email_agenda", "Te convidam ou alteram um evento da agenda"], ["email_mensagens", "Recebes uma mensagem (um email por conversa até a leres)"]].map(([k, rot]) =>
      '<label class="interruptor"><input type="checkbox" data-pref="' + k + '"' + (pr[k] !== false ? " checked" : "") + (pr.aCarregar ? " disabled" : "") + "><span class=\"int-t\"></span>" + rot + "</label>").join("") + "</div>" +
    '<div class="acts"><button class="btn sec" data-acao="email-teste">Enviar email de teste</button></div>') + "</section>";
  h += '<section class="cartao-sec"><h3>Notificações neste aparelho</h3><p>' + esc(p.txt) + '</p><div class="acts">' +
    (["pedir", "ok"].includes(p.estado) ? '<button class="btn pri" data-acao="push">Ativar neste aparelho</button>' : "") +
    (p.estado === "ok" ? '<button class="btn sec" data-acao="push-teste">Enviar notificação de teste</button>' : "") + "</div></section>";
  if (eGestor(S.eu)) h += '<section class="cartao-sec"><h3>Modelos de tarefas</h3><p>Rotinas sugeridas para cada marca e departamento. Escolhes as que queres e atribuis depois a cada pessoa.</p><div class="acts"><button class="btn sec" data-acao="modelos">Carregar modelos</button></div></section>';
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (!standalone) h += '<section class="cartao-sec so-browser"><h3>Instalar a app</h3><p>No Android: Chrome → menu ⋮ → «Instalar app». No iPhone: Safari → Partilhar → «Adicionar ao ecrã principal».</p>' + (S.instalar ? '<div class="acts"><button class="btn pri" data-acao="instalar">Instalar agora</button></div>' : "") + "</section>";
  h += '<section class="cartao-sec"><h3>Palavra-passe</h3><form class="form" id="form-mudar"><div class="campos-2"><div class="campo"><label for="mp-1">Nova palavra-passe</label><input id="mp-1" type="password" autocomplete="new-password" minlength="8"></div><div class="campo"><label for="mp-2">Repetir</label><input id="mp-2" type="password" autocomplete="new-password" minlength="8"></div></div><div class="acts"><button class="btn sec" type="submit">Mudar palavra-passe</button></div></form></section>';
  h += '<section class="cartao-sec"><h3>Sessão</h3><p>Central 26 · versão ' + VERSAO + (api.modo === "demo" ? " · modo de demonstração" : "") + '</p><div class="acts"><button class="btn perigo-sec" data-acao="sair">Sair</button></div></section>';
  return h;
}

// Foto de perfil: recorta ao centro, reduz para 320 px e grava em JPEG
async function fotoQuadrada(ficheiro) {
  if (!/^image\//.test(ficheiro.type)) throw new Error("Escolhe uma imagem.");
  if (ficheiro.size > 15 * 1024 * 1024) throw new Error("A imagem é demasiado grande (máximo 15 MB).");
  const url = URL.createObjectURL(ficheiro);
  try {
    const img = await new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falha(new Error("Não foi possível abrir esta imagem. Experimenta outra (JPG ou PNG).")); i.src = url; });
    const lado = Math.min(img.naturalWidth, img.naturalHeight), T = 320;
    const c = document.createElement("canvas"); c.width = T; c.height = T;
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high";
    g.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, T, T);
    return await new Promise((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error("Não foi possível preparar a foto."))), "image/jpeg", 0.86));
  } finally { URL.revokeObjectURL(url); }
}
async function mudarFoto(ficheiro) {
  try {
    toast("A preparar a foto…");
    const blob = await fotoQuadrada(ficheiro), antiga = S.eu.foto_path;
    const caminho = await api.perfis.enviarFoto(S.eu.id, blob, "jpg");
    S.fotos[caminho] = URL.createObjectURL(blob);
    await guardarAparencia(caminho, S.eu.cor || "");
    if (antiga && antiga !== caminho) api.perfis.apagarFoto(antiga);
    toast("Foto atualizada");
  } catch (e) { falha(e); }
}
async function guardarAparencia(foto, cor) {
  const antes = { foto_path: S.eu.foto_path, cor: S.eu.cor };
  const novo = { foto_path: foto || null, cor: cor || "" };
  Object.assign(S.eu, novo); if (S.perfis[S.eu.id]) Object.assign(S.perfis[S.eu.id], novo); render();
  try { await api.perfis.aparencia(foto, cor); }
  catch (e) { Object.assign(S.eu, antes); if (S.perfis[S.eu.id]) Object.assign(S.perfis[S.eu.id], antes); render(); falha(/definir_aparencia|Could not find/i.test(String(e?.message)) ? new Error("A foto e a cor de perfil precisam do script supabase/12-perfil-email-stocks.sql no Supabase.") : e); }
}

/* ============================== Painel lateral ============================== */
function renderPainel(forcar) {
  const root = $("#painel-root");
  const ae = document.activeElement;
  if (!forcar && S.aberto && root.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
  root.innerHTML = S.fase === "app" ? painelHTML() : "";
  const ta = root.querySelector(".p-titulo"); if (ta) autoAltura(ta);
}
const autoAltura = (el) => { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; };

function painelHTML() {
  const a = S.aberto;
  if (!a) return "";
  if (a.tipo === "tarefa") return painelTarefa(S.tarefas[a.id]);
  if (a.tipo === "nova") return painelNova(a);
  if (a.tipo === "empregado") return painelEmpregado(a);
  if (a.tipo === "dep") return painelDep();
  if (a.tipo === "modelos") return painelModelos();
  if (a.tipo === "cliente" || a.tipo === "crm-novo") return CRM.painel(a);
  if (a.tipo === "evento") return AGENDA.painel(a);
  if (["encomenda", "enc-nova", "rota-nova", "local-novo"].includes(a.tipo)) return LOG.painel(a);
  if (a.tipo === "aud-item" || a.tipo === "aud-novo") return AUD.painel(a);
  if (["fornecedor", "pedido", "op-forn-novo", "op-pedido-novo"].includes(a.tipo)) return OP.painel(a);
  if (a.tipo === "publicacao" || a.tipo === "mk-nova") return MK.painel(a);
  if (a.tipo === "stock" || a.tipo === "stk-novo") return STK.painel(a);
  return "";
}
const moldura = (marca, label, conteudo, pe) =>
  '<div class="veu" data-acao="fechar"></div><aside class="painel" role="dialog" aria-label="' + esc(label) + '" data-marca="' + marca + '"><div class="p-scroll">' + conteudo + "</div>" + (pe ? '<div class="p-pe">' + pe + "</div>" : "") + "</aside>";

function opcoesResp(atual) {
  const pessoas = ativos().filter((p) => podeAtribuirA(S.eu, p) || p.id === atual);
  return '<option value="">Sem responsável</option>' + pessoas.map((p) => '<option value="' + p.id + '"' + (p.id === atual ? " selected" : "") + (podeAtribuirA(S.eu, p) ? "" : " disabled") + ">" + esc(p.nome) + (p.id === S.eu.id ? " (eu)" : "") + "</option>").join("");
}

function painelTarefa(t) {
  if (!t) return moldura("twentysix", "Tarefa", '<div class="p-topo"><span class="migalha">Tarefa</span><button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + '</button></div><div class="vazio"><h3>Tarefa indisponível</h3><p>Foi eliminada ou não tens acesso a ela.</p></div>');
  const pode = podeEditar(S.eu, t), dis = pode ? "" : " disabled", its = itensChecklist(t), est = estadoAtual(t), m = MARCA[t.marca] || MARCA.grupo;
  const dica = t.freq === "unica" ? "" : "Volta a «Por fazer» " + ({ diaria: "amanhã", semanal: "na próxima segunda-feira", mensal: "no dia 1 do próximo mês", anual: "a 1 de janeiro" })[t.freq] + ".";
  let c = '<div class="p-topo"><span class="migalha"><i></i>' + esc(m.nome) + " / " + esc(FREQ[t.freq].tab) + '</span><span class="acts">' +
    (pode ? '<button class="ib" data-acao="duplicar">' + I.copiar + "Duplicar</button>" : "") +
    (podeApagar(S.eu, t) ? '<button class="ib perigo" data-acao="apagar">' + I.lixo + "Eliminar</button>" : "") +
    '<button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + "</button></span></div>";
  c += '<textarea id="t-titulo" class="p-titulo" rows="1" placeholder="Sem título"' + dis + ">" + esc(t.titulo) + "</textarea>";
  if (!pode) c += '<div class="aviso">Podes ver esta tarefa, mas só o responsável, quem a criou e a chefia a podem alterar.</div>';
  c += '<div class="props">' +
    '<label for="t-estado">Estado</label><select id="t-estado"' + dis + ">" + Object.entries(ESTADOS).map(([k, v]) => '<option value="' + k + '"' + (est === k ? " selected" : "") + ">" + v + "</option>").join("") + "</select>" + (dica ? '<span class="ajuda">' + dica + "</span>" : "") +
    '<label for="t-resp">Responsável</label><select id="t-resp"' + dis + ">" + opcoesResp(t.responsavel_id) + "</select>" +
    '<label for="t-prio">Prioridade</label><select id="t-prio"' + dis + ">" + Object.entries(PRIORIDADES).map(([k, v]) => '<option value="' + k + '"' + (t.prioridade === k ? " selected" : "") + ">" + v + "</option>").join("") + "</select>" +
    '<label for="t-prazo">Prazo</label><input id="t-prazo" type="date" value="' + esc(t.prazo || "") + '"' + dis + ">" +
    '<label for="t-freq">Repetição</label><select id="t-freq"' + dis + ">" + FREQS.map((f) => '<option value="' + f.id + '"' + (t.freq === f.id ? " selected" : "") + ">" + f.um + "</option>").join("") + "</select>" +
    '<label for="t-marca">Marca</label><select id="t-marca"' + dis + ">" + MARCAS.map((x) => '<option value="' + x.id + '"' + (t.marca === x.id ? " selected" : "") + ">" + esc(x.nome) + "</option>").join("") + "</select>" +
    '<label for="t-dep">Departamento</label><select id="t-dep"' + dis + ">" + opcoesDeps(t.departamento_id) + "</select>" +
    "</div>";
  c += '<section class="p-sec"><h3>Checklist <span class="mono">' + its.filter((i) => i.feito).length + "/" + its.length + "</span></h3>";
  its.forEach((i) => {
    c += '<div class="cl-item' + (i.feito ? " feito" : "") + '"><button class="chk' + (i.feito ? " on" : "") + '" data-acao="item" data-item="' + i.id + '" aria-label="' + (i.feito ? "Desmarcar item" : "Marcar item") + '"' + dis + ">" + I.check + '</button><input type="text" id="ci-' + i.id + '" data-item="' + i.id + '" value="' + esc(i.texto) + '" aria-label="Texto do item"' + dis + ">" + (pode ? '<button class="ib x" data-acao="item-apagar" data-item="' + i.id + '" aria-label="Remover item">' + I.x + "</button>" : "") + "</div>";
  });
  if (pode) c += '<label class="cl-add">' + I.plus + '<span class="sr">Adicionar item</span><input id="t-novoitem" placeholder="Adicionar item e carregar em Enter" autocomplete="off" enterkeyhint="done"></label>';
  c += '</section><section class="p-sec"><h3>Notas</h3><textarea id="t-notas" class="notas" placeholder="Contexto, moradas, contactos…"' + dis + ">" + esc(t.notas) + "</textarea></section>";
  const hist = S.atividade.filter((a) => a.tarefa_id === t.id).slice(0, 8);
  if (hist.length) c += '<section class="p-sec"><h3>Histórico</h3><div class="hist">' + hist.map((a) => "<div><span>" + esc(nomeDe(a.autor_id) || "Alguém") + " " + (ACOES[a.acao] || a.acao) + (a.acao === "atribuiu" && a.responsavel_id ? " a " + esc(nomeDe(a.responsavel_id)) : "") + '</span><span class="q">' + haQuanto(a.criado_em) + "</span></div>").join("") + "</div></section>";
  const pe = "<span>Criada por " + esc(nomeDe(t.criado_por) || "—") + (t.criado_em ? " a " + dataLonga(t.criado_em) : "") + "</span>" +
    (podeApagar(S.eu, t) ? '<button class="apagar" data-acao="apagar">' + I.lixo + "Eliminar tarefa</button>" : "");
  return moldura(t.marca, "Detalhes da tarefa", c, pe);
}

function painelNova(a) {
  const marca = a.marca || "grupo";
  let c = '<div class="p-topo"><span class="migalha"><i></i>Nova tarefa</span><button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + "</button></div>";
  c += '<form class="form" id="form-nova" novalidate><div class="campo"><label for="nv-titulo">O que é preciso fazer?</label><input id="nv-titulo" required placeholder="Ex.: Entregar a Lather Machine em Santo Ovídio" autocomplete="off"></div>' +
    '<div class="campos-2"><div class="campo"><label for="nv-resp">Responsável</label><select id="nv-resp">' + opcoesResp(a.resp ?? S.eu.id) + '</select></div><div class="campo"><label for="nv-prazo">Prazo</label><input id="nv-prazo" type="date"></div></div>' +
    '<div class="campos-2"><div class="campo"><label for="nv-marca">Marca</label><select id="nv-marca">' + MARCAS.map((x) => '<option value="' + x.id + '"' + (x.id === marca ? " selected" : "") + ">" + esc(x.nome) + "</option>").join("") + '</select></div><div class="campo"><label for="nv-freq">Repetição</label><select id="nv-freq">' + FREQS.map((f) => '<option value="' + f.id + '"' + (f.id === (a.freq || "unica") ? " selected" : "") + ">" + f.um + "</option>").join("") + "</select></div></div>" +
    '<div class="campos-2"><div class="campo"><label for="nv-prio">Prioridade</label><select id="nv-prio">' + Object.entries(PRIORIDADES).map(([k, v]) => '<option value="' + k + '"' + (k === "media" ? " selected" : "") + ">" + v + "</option>").join("") + '</select></div><div class="campo"><label for="nv-dep">Departamento</label><select id="nv-dep">' + opcoesDeps(a.dep ?? (a.resp ? S.perfis[a.resp]?.departamento_id : S.eu.departamento_id)) + "</select></div></div>" +
    '<div class="campo"><label for="nv-notas">Notas</label><textarea id="nv-notas" placeholder="Opcional"></textarea></div>' +
    '<div class="acts"><button class="btn pri" type="submit">Criar tarefa</button><button class="btn sec" type="button" data-acao="fechar">Cancelar</button></div></form>';
  return moldura(marca, "Nova tarefa", c);
}

function painelEmpregado(a) {
  let c = '<div class="p-topo"><span class="migalha"><i></i>Equipa</span><button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + "</button></div><h2 style=\"margin:0\">Adicionar empregado</h2>";
  if (a.resultado) {
    c += senhaHTML(a.resultado.password, a.resultado.nome) + '<p style="color:var(--muted);margin:0">' + esc(a.resultado.nome) + " entra com o email <b>" + esc(a.resultado.email) + '</b> e esta palavra-passe.</p><div class="acts"><button class="btn pri" data-acao="novo-empregado">Adicionar outro</button><button class="btn sec" data-acao="fechar">Fechar</button></div>';
    return moldura("twentysix", "Adicionar empregado", c);
  }
  c += '<form class="form" id="form-empregado" novalidate>' + (a.erro ? '<div class="aviso erro">' + esc(a.erro) + "</div>" : "") +
    '<div class="campo"><label for="em-nome">Nome completo</label><input id="em-nome" required autocomplete="off"></div>' +
    '<div class="campo"><label for="em-email">Email</label><input id="em-email" type="email" required autocomplete="off" inputmode="email"><span class="ajuda">É o email com que a pessoa vai entrar.</span></div>' +
    '<div class="campos-2"><div class="campo"><label for="em-cargo">Cargo</label><input id="em-cargo" placeholder="Ex.: Barbeiro, Motorista"></div><div class="campo"><label for="em-tel">Telefone</label><input id="em-tel" type="tel"></div></div>' +
    '<div class="campos-2"><div class="campo"><label for="em-dep">Departamento</label><select id="em-dep">' + opcoesDeps("") + '</select></div><div class="campo"><label for="em-papel">Papel</label><select id="em-papel">' + opcoesPapel("colaborador") + "</select></div></div>" +
    '<div class="aviso">Colaborador vê as suas tarefas. Chefe de departamento dá tarefas e vê o trabalho do seu departamento. Administração gere a equipa e vê tudo.</div>' +
    '<div class="acts"><button class="btn pri" type="submit"' + (a.aGuardar ? " disabled" : "") + ">" + (a.aGuardar ? "A criar conta…" : "Criar conta") + '</button><button class="btn sec" type="button" data-acao="fechar">Cancelar</button></div></form>';
  return moldura("twentysix", "Adicionar empregado", c);
}

function painelDep() {
  const c = '<div class="p-topo"><span class="migalha"><i></i>Equipa</span><button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + '</button></div><h2 style="margin:0">Novo departamento</h2>' +
    '<form class="form" id="form-dep" novalidate><div class="campo"><label for="dp-nome">Nome</label><input id="dp-nome" required placeholder="Ex.: Financeiro"></div><div class="acts"><button class="btn pri" type="submit">Criar departamento</button><button class="btn sec" type="button" data-acao="fechar">Cancelar</button></div></form>';
  return moldura("twentysix", "Novo departamento", c);
}

function painelModelos() {
  const existentes = new Set(todas().map((t) => t.modelo).filter(Boolean));
  let c = '<div class="p-topo"><span class="migalha"><i></i>Modelos sugeridos</span><button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + '</button></div><h2 style="margin:0">Carregar modelos</h2><p style="margin:0;color:var(--muted)">As tarefas entram sem responsável. Depois abre cada uma e escolhe quem a faz. Um modelo já carregado não se repete.</p><form class="form" id="form-modelos"><div class="lista-modelos">';
  Object.entries(MODELOS).forEach(([k, m]) => {
    const total = m.tarefas.length, ja = m.tarefas.filter((_, i) => existentes.has(k + "-" + i)).length;
    c += '<label><input type="checkbox" name="modelo" value="' + k + '"' + (ja === total ? " disabled" : "") + "><span><b>" + esc(m.nome) + "</b><small>" + total + " tarefas" + (ja ? " · " + ja + " já carregadas" : "") + "</small></span></label>";
  });
  c += '</div><div class="acts"><button class="btn pri" type="submit">Carregar selecionados</button><button class="btn sec" type="button" data-acao="fechar">Cancelar</button></div></form>';
  return moldura("twentysix", "Modelos sugeridos", c);
}

function abrirTarefa(id) { S.aberto = { tipo: "tarefa", id }; S.confirmar = false; renderPainel(true); focarPainel(); }
function abrir(o) { S.aberto = o; S.confirmar = false; renderPainel(true); focarPainel(); }
function focarPainel() {
  const r = $("#painel-root");
  const alvo = r.querySelector("#nv-titulo, #em-nome, #dp-nome, #cn-nome, #ev-titulo, #ne-cliente, #nl-nome, #an-prob, #nf-nome, #np-titulo, #mn-titulo, #sn-nome") || r.querySelector('.ib[data-acao="fechar"]');
  if (alvo) alvo.focus();
}
function fechar() {
  S.aberto = null; S.confirmar = false; renderPainel(true);
  if (S.rota === "tarefa") history.replaceState(null, "", "#inicio"), lerRota();
  if (S.rota === "cliente") history.replaceState(null, "", "#comercial"), lerRota();
  if (S.rota === "agenda" && S.param) history.replaceState(null, "", "#agenda"), lerRota();
  if (S.rota === "encomenda") history.replaceState(null, "", "#logistica"), lerRota();
  if (S.rota === "auditoria" && /^[A-Z]{2,4}-/.test(S.param || "")) history.replaceState(null, "", "#auditoria"), lerRota();
  if (S.rota === "fornecedor" || S.rota === "pedido") history.replaceState(null, "", "#operacional"), lerRota();
  if (S.rota === "publicacao") history.replaceState(null, "", "#marketing"), lerRota();
  if (S.rota === "stock") history.replaceState(null, "", "#stocks"), lerRota();
}

/* ============================== Ações sobre tarefas ============================== */
async function gravar(id, campos) {
  const antes = S.tarefas[id];
  if (!antes) return;
  S.tarefas[id] = { ...antes, ...campos };
  agendarRender();
  try { const r = await api.tarefas.atualizar(id, campos); if (r) S.tarefas[id] = r; agendarRender(); }
  catch (e) { S.tarefas[id] = antes; agendarRender(); renderPainel(true); falha(e); }
}
function definirEstado(id, est) {
  const t = S.tarefas[id]; if (!t) return;
  gravar(id, { estado: est, estado_periodo: periodo(t.freq) });
}
function alternar(id) { const t = S.tarefas[id]; if (t) definirEstado(id, concluida(t) ? "por_fazer" : "concluido"); }
function alternarItem(id, item) {
  const t = S.tarefas[id]; if (!t) return;
  const lista = itensChecklist(t).map((i) => (i.id === item ? { ...i, feito: !i.feito } : i));
  const campos = { checklist: lista, checklist_periodo: periodo(t.freq) };
  if (estadoAtual(t) === "por_fazer" && lista.some((i) => i.feito)) { campos.estado = "em_curso"; campos.estado_periodo = periodo(t.freq); }
  gravar(id, campos);
}
async function criarTarefa(dados) {
  const t = { titulo: dados.titulo, marca: dados.marca || "grupo", freq: dados.freq || "unica", prioridade: dados.prioridade || "media",
    responsavel_id: dados.responsavel_id || null, departamento_id: dados.departamento_id || null, prazo: dados.prazo || null, notas: dados.notas || "",
    estado: "por_fazer", estado_periodo: periodo(dados.freq || "unica"), checklist: [], checklist_periodo: "" };
  const r = await api.tarefas.criar(t);
  S.tarefas[r.id] = r; agendarRender();
  return r;
}

/* ============================== Eventos ============================== */
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-acao]");
  const noMenu = e.target.closest("#menu-root");
  if (!noMenu && (!el || el.dataset.acao !== "menu")) fecharMenu();
  if (!el) return;
  const acao = el.dataset.acao, id = el.dataset.id || el.closest(".menu")?.dataset.id;
  if (acao.startsWith("m-")) fecharMenu();
  const marcaAtual = S.rota === "marca" ? S.param : null;
  const chaveTab = marcaAtual || (S.rota === "minhas" ? "minhas" : null);
  switch (acao) {
    case "demo-entrar": await api.entrar(id); S.fase = "a-carregar"; render(); await entrarNaApp(await api.sessao()); break;
    case "demo-repor": api.repor(); await recarregar(); toast("Dados de demonstração repostos."); break;
    case "sair": limparDados(); await api.sair(); S.fase = "entrar"; S.erroEntrada = ""; render(); break;
    case "alternar": if (!el.disabled) alternar(id); break;
    case "abrir": if (!el.classList.contains("arrastar")) abrirTarefa(id); break;
    case "fechar": fechar(); break;
    case "tab": if (chaveTab) { S.tab[chaveTab] = el.dataset.tab; S.q = ""; guardarPrefs(); render(); } break;
    case "vista": S.vista = el.dataset.vista; if (S.vista !== "lista") S.selecao = null; guardarPrefs(); render(); break;
    case "menu": if ($("#menu-root .menu")?.dataset.id === id) fecharMenu(); else abrirMenu(el, id); break;
    case "m-abrir": abrirTarefa(id); break;
    case "m-alternar": alternar(id); break;
    case "m-duplicar": duplicarTarefa(id); break;
    case "m-eliminar": eliminarTarefas([id]); break;
    case "toast-acao": { const fn = toastAcao; toastAcao = null; $("#toast-root").innerHTML = ""; if (fn) fn(); break; }
    case "selecionar": S.selecao = S.selecao ? null : new Set(); render(); break;
    case "sel": if (S.selecao) { S.selecao.has(id) ? S.selecao.delete(id) : S.selecao.add(id); render(); } break;
    case "sel-todas": { const todasM = S.visiveis.every((x) => S.selecao.has(x)); S.selecao = todasM ? new Set() : new Set(S.visiveis); render(); break; }
    case "sel-cancelar": S.selecao = null; render(); break;
    case "sel-eliminar": if (S.selecao?.size) { eliminarTarefas([...S.selecao]); S.selecao = new Set(); render(); } break;
    case "sel-concluir": {
      const ids = [...(S.selecao || [])].filter((x) => S.tarefas[x] && podeEditar(S.eu, S.tarefas[x]) && !concluida(S.tarefas[x]));
      ids.forEach((x) => definirEstado(x, "concluido"));
      S.selecao = new Set(); render(); toast(ids.length ? (ids.length === 1 ? "1 tarefa concluída" : ids.length + " tarefas concluídas") : "Nada para concluir.");
      break;
    }
    case "limpar-lidas": {
      const ids = S.notifs.filter((n) => n.lida).map((n) => n.id), antes = S.notifs;
      S.notifs = S.notifs.filter((n) => !n.lida); render();
      api.notificacoes.apagar(ids).then(() => toast("Notificações lidas apagadas")).catch((err) => { S.notifs = antes; render(); falha(err); });
      break;
    }
    case "mostrar-feitas": S.mostrarFeitas = !S.mostrarFeitas; render(); break;
    case "nova-tarefa": abrir({ tipo: "nova", marca: marcaAtual || "grupo", freq: chaveTab ? S.tab[chaveTab] || "diaria" : "unica", resp: el.dataset.resp }); break;
    case "novo-empregado": abrir({ tipo: "empregado" }); break;
    case "novo-dep": abrir({ tipo: "dep" }); break;
    case "modelos": abrir({ tipo: "modelos" }); break;
    case "item": alternarItem(S.aberto.id, el.dataset.item); renderPainel(true); break;
    case "item-apagar": { const t = S.tarefas[S.aberto.id]; if (t) { await gravar(t.id, { checklist: (t.checklist || []).filter((i) => i.id !== el.dataset.item) }); renderPainel(true); } break; }
    case "duplicar": if (S.aberto?.id) duplicarTarefa(S.aberto.id); break;
    case "apagar": if (S.aberto?.id) { const tid = S.aberto.id; fechar(); eliminarTarefas([tid]); } break;
    case "per-ativ": S.periodoAtiv = el.dataset.p; S.pagAtiv = 1; render(); break;
    case "ativ-acao": S.filtroAcao = el.dataset.v; S.pagAtiv = 1; render(); break;
    case "pag-ativ": S.pagAtiv = +el.dataset.p; render(); $(".registo")?.scrollIntoView({ block: "start", behavior: "smooth" }); break;
    case "pag-hoje": S.pagHoje = +el.dataset.p; render(); break;
    case "pag-notif": S.pagNotif = +el.dataset.p; render(); $(".main").scrollTop = 0; break;
    case "instalar-fechar": try { localStorage.setItem(CHAVE_INSTALAR, "1"); } catch { /* */ } render(); toast("Podes instalar mais tarde em «Mais»."); break;
    case "ler-todas": { const ids = S.notifs.filter((n) => !n.lida).map((n) => n.id); S.notifs = S.notifs.map((n) => ({ ...n, lida: true })); render(); api.notificacoes.marcarLidas(ids).catch(falha); break; }
    case "abrir-notif": {
      const n = S.notifs.find((x) => String(x.id) === id);
      if (n && !n.lida) { n.lida = true; api.notificacoes.marcarLidas([n.id]).catch(() => {}); }
      if (n && n.link) location.hash = n.link.replace(/^#/, ""); else render();
      break;
    }
    case "repor-pass": {
      try { const r = await api.empregados("repor_password", { id }); S.novaPass = { id, password: r.password }; render(); }
      catch (err) { falha(err); }
      break;
    }
    case "ativar": {
      try { await api.empregados("definir_ativo", { id, ativo: el.dataset.ativo === "1" }); if (S.perfis[id]) S.perfis[id].ativo = el.dataset.ativo === "1"; render(); toast(el.dataset.ativo === "1" ? "Conta reativada" : "Conta desativada"); }
      catch (err) { falha(err); }
      break;
    }
    case "copiar-senha": {
      const txt = $("#senha-txt")?.textContent || "";
      try { await navigator.clipboard.writeText(txt); toast("Copiada"); }
      catch { const r = document.createRange(); r.selectNodeContents($("#senha-txt")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Seleciona e copia o texto"); }
      break;
    }
    case "atualizar-app": location.reload(); break;
    case "instalar": if (S.instalar) { S.instalar.prompt(); const r = await S.instalar.userChoice.catch(() => null); if (r?.outcome === "accepted") S.instalar = null; render(); } break;
    case "push": ativarPush(); break;
    case "email-teste": try { await api.push.emailTeste(); toast("Email de teste enviado para " + S.eu.email); } catch (err) { falha(err); } break;
    case "cor-perfil": guardarAparencia(S.eu.foto_path || "", el.dataset.v); break;
    case "foto-remover": { const antiga = S.eu.foto_path; await guardarAparencia("", S.eu.cor || ""); if (antiga) api.perfis.apagarFoto(antiga); break; }
    case "push-teste": try { const r = await api.push.teste(); toast(r.enviados ? "Notificação enviada" : "Nenhum aparelho registado. Toca em «Ativar neste aparelho»."); } catch (err) { falha(err); } break;
    default: CRM.clique(acao, el) || CHAT.clique(acao, el) || AGENDA.clique(acao, el) || LOG.clique(acao, el) || AUD.clique(acao, el) || OP.clique(acao, el) || FIN.clique(acao, el) || MK.clique(acao, el) || STK.clique(acao, el);
  }
});

document.addEventListener("submit", async (e) => {
  const f = e.target;
  e.preventDefault();
  if ((await CRM.submeter(f)) || (await CHAT.submeter(f)) || (await AGENDA.submeter(f)) || (await LOG.submeter(f)) || (await AUD.submeter(f)) || (await OP.submeter(f)) || (await MK.submeter(f)) || (await STK.submeter(f))) return;
  if (f.id === "form-entrar") {
    const email = $("#e-email").value, pass = $("#e-pass").value;
    if (!email || !pass) { S.erroEntrada = "Indica o email e a palavra-passe."; render(); return; }
    S.aEntrar = true; S.erroEntrada = ""; render();
    try { await api.entrar(email, pass); S.aEntrar = false; S.fase = "a-carregar"; render(); await entrarNaApp(await api.sessao()); }
    catch (err) { S.aEntrar = false; S.erroEntrada = err.message; render(); const pe = $("#e-email"); if (pe) pe.value = email; }
  } else if (f.id === "form-pass") {
    const a = $("#n-pass").value, b = $("#n-pass2").value;
    const erro = validarPass(a, b); if (erro) { S.erroEntrada = erro; render(); return; }
    S.aEntrar = true; S.erroEntrada = ""; render();
    try { await api.mudarPassword(a); S.aEntrar = false; S.eu.mudar_password = false; S.fase = "a-carregar"; render(); await entrarNaApp(S.user); toast("Palavra-passe guardada"); }
    catch (err) { S.aEntrar = false; S.erroEntrada = err.message; render(); }
  } else if (f.id === "form-mudar") {
    const a = $("#mp-1").value, b = $("#mp-2").value, erro = validarPass(a, b);
    if (erro) { toast(erro, true); return; }
    try { await api.mudarPassword(a); toast("Palavra-passe alterada"); f.reset(); } catch (err) { falha(err); }
  } else if (f.id === "form-perfil") {
    try { await api.perfis.atualizarMeu($("#pf-nome").value, $("#pf-tel").value); S.eu = { ...S.eu, nome: $("#pf-nome").value.trim() || S.eu.nome, telefone: $("#pf-tel").value.trim() }; S.perfis[S.eu.id] = S.eu; render(); toast("Perfil guardado"); }
    catch (err) { falha(err); }
  } else if (f.id === "form-nova") {
    const titulo = $("#nv-titulo").value.trim();
    if (!titulo) { $("#nv-titulo").focus(); toast("Escreve o que é preciso fazer.", true); return; }
    try {
      await criarTarefa({ titulo, responsavel_id: $("#nv-resp").value, prazo: $("#nv-prazo").value, marca: $("#nv-marca").value, freq: $("#nv-freq").value,
        prioridade: $("#nv-prio").value, departamento_id: $("#nv-dep").value, notas: $("#nv-notas").value });
      fechar(); toast("Tarefa criada");
    } catch (err) { falha(err); }
  } else if (f.id === "form-empregado") {
    const dados = { nome: $("#em-nome").value.trim(), email: $("#em-email").value.trim(), cargo: $("#em-cargo").value.trim(), telefone: $("#em-tel").value.trim(), departamento_id: $("#em-dep").value || null, papel: $("#em-papel").value };
    if (!dados.nome || !dados.email) { S.aberto.erro = "Indica o nome e o email."; renderPainel(true); return; }
    S.aberto.aGuardar = true; S.aberto.erro = ""; renderPainel(true);
    try {
      const r = await api.empregados("criar", dados);
      S.aberto = { tipo: "empregado", resultado: { password: r.password, nome: dados.nome, email: dados.email } };
      renderPainel(true); recarregar();
    } catch (err) { S.aberto.aGuardar = false; S.aberto.erro = err.message; renderPainel(true); }
  } else if (f.id === "form-dep") {
    const nome = $("#dp-nome").value.trim();
    if (!nome) return;
    const id = normalizar(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    try { const d = await api.departamentos.criar({ id, nome, ordem: 50 }); S.deps[d.id] = d; fechar(); render(); toast("Departamento criado"); }
    catch (err) { falha(/duplicate|already/i.test(err.message) ? new Error("Já existe um departamento com este nome.") : err); }
  } else if (f.id === "form-pessoa") {
    const pid = f.dataset.id;
    try {
      const campos = { cargo: $("#ep-cargo").value.trim(), telefone: $("#ep-tel").value.trim(), departamento_id: $("#ep-dep").value || null, papel: $("#ep-papel").value };
      if ($("#ep-agenda")) campos.gere_agenda = $("#ep-agenda").checked;
      const r = await api.perfis.atualizar(pid, campos);
      S.perfis[pid] = r; render(); toast("Alterações guardadas");
    } catch (err) { falha(err); }
  } else if (f.id === "form-modelos") {
    const escolhidos = [...f.querySelectorAll('input[name="modelo"]:checked')].map((x) => x.value);
    if (!escolhidos.length) { toast("Escolhe pelo menos um modelo.", true); return; }
    const existentes = new Set(todas().map((t) => t.modelo).filter(Boolean));
    const lista = [];
    escolhidos.forEach((k) => MODELOS[k].tarefas.forEach((t, i) => {
      const modelo = k + "-" + i;
      if (existentes.has(modelo)) return;
      lista.push({ modelo, titulo: t.titulo, marca: t.marca || (k === "auditorias" ? "grupo" : k), freq: t.freq, prioridade: t.prioridade, notas: t.notas || "",
        checklist: t.checklist || [], checklist_periodo: "", prazo: t.prazo || null, departamento_id: t.departamento_id || null, responsavel_id: null,
        estado: "por_fazer", estado_periodo: periodo(t.freq) });
    }));
    try { const r = await api.tarefas.criarVarias(lista); (r || []).forEach((t) => { S.tarefas[t.id] = t; }); fechar(); render(); toast((r?.length ?? lista.length) + " tarefas carregadas"); }
    catch (err) { falha(err); }
  }
});

function validarPass(a, b) {
  if (a.length < 8) return "A palavra-passe precisa de pelo menos 8 caracteres.";
  if (!/[a-zA-Z]/.test(a) || !/\d/.test(a)) return "Usa letras e números na palavra-passe.";
  if (/^central-\d{4}-/i.test(a)) return "Escolhe uma palavra-passe diferente da temporária.";
  if (a !== b) return "As duas palavras-passe não são iguais.";
  return "";
}

document.addEventListener("keydown", async (e) => {
  const t = e.target;
  if (CHAT.tecla(e) || LOG.tecla(e)) return;
  if (e.key === "Escape" && $("#menu-root")?.innerHTML) { fecharMenu(); return; }
  if (e.key === "Escape" && S.aberto) { fechar(); return; }
  if (e.key === "Escape" && S.selecao) { S.selecao = null; render(); return; }
  if (t.id === "rapida" && e.key === "Enter" && t.value.trim()) {
    e.preventDefault();
    const marca = S.rota === "marca" ? S.param : "grupo";
    const chave = S.rota === "marca" ? S.param : "minhas";
    const titulo = t.value.trim();
    S.rascunho = ""; t.value = "";
    try { await criarTarefa({ titulo, marca, freq: S.tab[chave] || "diaria", responsavel_id: S.eu.id, departamento_id: S.eu.departamento_id }); toast("Tarefa criada"); }
    catch (err) { S.rascunho = titulo; render(); falha(err); }
  }
  if (t.id === "t-novoitem" && e.key === "Enter" && t.value.trim()) {
    e.preventDefault();
    const tk = S.tarefas[S.aberto.id]; if (!tk) return;
    const lista = itensChecklist(tk).concat([{ id: "c" + Date.now().toString(36), texto: t.value.trim(), feito: false }]);
    await gravar(tk.id, { checklist: lista, checklist_periodo: periodo(tk.freq) });
    renderPainel(true); $("#t-novoitem")?.focus();
  }
  if (t.id === "t-titulo" && e.key === "Enter") { e.preventDefault(); t.blur(); }
  if (t.classList?.contains("cartao") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); t.dataset.cliente ? abrir({ tipo: "cliente", id: t.dataset.id }) : abrirTarefa(t.dataset.id); }
  if (t.closest?.(".crm-tabela") && t.tagName === "TR" && e.key === "Enter") { e.preventDefault(); abrir({ tipo: "cliente", id: t.dataset.id }); }
});

document.addEventListener("input", (e) => {
  const t = e.target;
  if (CRM.escrever(e) || CHAT.escrever(e) || LOG.escrever(e) || AUD.escrever(e) || OP.escrever(e) || FIN.escrever(e) || MK.escrever(e) || STK.escrever(e)) return;
  if (t.id === "rapida") { S.rascunho = t.value; return; }
  if (t.id === "pesquisa") { S.q = t.value; render(); return; }
  if (!S.aberto || S.aberto.tipo !== "tarefa") return;
  const id = S.aberto.id;
  if (t.id === "t-titulo") { autoAltura(t); adiar("tt" + id, () => gravar(id, { titulo: t.value })); }
  else if (t.id === "t-notas") adiar("tn" + id, () => gravar(id, { notas: t.value }), 800);
  else if (t.id && t.id.startsWith("ci-")) {
    const item = t.dataset.item;
    adiar("ci" + id + item, () => { const tk = S.tarefas[id]; if (tk) gravar(id, { checklist: (tk.checklist || []).map((i) => (i.id === item ? { ...i, texto: t.value } : i)) }); });
  }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (CRM.mudar(e) || AGENDA.mudar(e) || LOG.mudar(e) || AUD.mudar(e) || OP.mudar(e) || FIN.mudar(e) || MK.mudar(e) || STK.mudar(e)) return;
  if (t.id === "pf-foto" && t.files?.[0]) { mudarFoto(t.files[0]); t.value = ""; return; }
  if (t.dataset.pref && S.prefs && !S.prefs.falta) {
    const campo = t.dataset.pref, v = t.checked; S.prefs = { ...S.prefs, [campo]: v };
    api.preferencias.guardar(S.eu.id, { [campo]: v }).then((x) => { S.prefs = x; toast(v ? "Vais receber estes avisos por email" : "Deixas de receber estes avisos por email"); }).catch((e) => { S.prefs = { ...S.prefs, [campo]: !v }; render(); falha(e); });
    return;
  }
  if (t.id === "filtro-resp") { S.filtroResp = t.value; render(); return; }
  if (t.id === "filtro-dep") { S.filtroDep = t.value; render(); return; }
  if (t.id === "sel-resp" && t.value && S.selecao?.size) {
    const destino = t.value === "nenhum" ? null : t.value;
    const ids = [...S.selecao].filter((x) => S.tarefas[x] && podeEditar(S.eu, S.tarefas[x]));
    ids.forEach((x) => gravar(x, { responsavel_id: destino, ...(destino && S.perfis[destino]?.departamento_id && !S.tarefas[x].departamento_id ? { departamento_id: S.perfis[destino].departamento_id } : {}) }));
    S.selecao = new Set(); render();
    toast((ids.length === 1 ? "1 tarefa atribuída" : ids.length + " tarefas atribuídas") + (destino ? " a " + nomeDe(destino) : " a ninguém"));
    return;
  }
  if (!S.aberto || S.aberto.tipo !== "tarefa") return;
  const id = S.aberto.id, tk = S.tarefas[id]; if (!tk) return;
  const mapa = { "t-prio": "prioridade", "t-prazo": "prazo", "t-marca": "marca", "t-dep": "departamento_id", "t-resp": "responsavel_id" };
  if (t.id === "t-estado") definirEstado(id, t.value);
  else if (t.id === "t-freq") gravar(id, { freq: t.value, estado: "por_fazer", estado_periodo: periodo(t.value), checklist_periodo: "" });
  else if (mapa[t.id]) gravar(id, { [mapa[t.id]]: t.value || null });
  else return;
  t.blur(); setTimeout(() => renderPainel(true), 0);
});

/* Arrastar no quadro */
let arrastado = null;
document.addEventListener("dragstart", (e) => { const c = e.target.closest?.(".cartao"); if (!c) return; arrastado = c.dataset.id; c.classList.add("arrastar"); try { e.dataTransfer.setData("text/plain", arrastado); e.dataTransfer.effectAllowed = "move"; } catch { /* */ } });
document.addEventListener("dragend", () => { document.querySelectorAll(".arrastar,.sobre").forEach((x) => x.classList.remove("arrastar", "sobre")); arrastado = null; });
document.addEventListener("dragover", (e) => { const col = e.target.closest?.("[data-largar],[data-etapa]"); if (col && arrastado) { e.preventDefault(); document.querySelectorAll(".col.sobre").forEach((x) => x !== col && x.classList.remove("sobre")); col.classList.add("sobre"); } });
document.addEventListener("drop", (e) => { const col = e.target.closest?.("[data-largar],[data-etapa]"); if (col && arrastado) { e.preventDefault(); const id = arrastado; arrastado = null; if (col.dataset.etapa) { CRM.mudarEtapa(id, col.dataset.etapa); return; } if (estadoAtual(S.tarefas[id]) !== col.dataset.largar) definirEstado(id, col.dataset.largar); else render(); } });

/* ============================== Notificações push ============================== */
const b64uParaBytes = (s) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
function aparelho() {
  const ua = navigator.userAgent;
  if (/iphone/i.test(ua)) return "iPhone"; if (/ipad/i.test(ua)) return "iPad"; if (/android/i.test(ua)) return "Android";
  if (/mac/i.test(ua)) return "Mac"; if (/windows/i.test(ua)) return "Windows"; return "Outro";
}
async function ativarPush() {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { render(); toast("Sem permissão, não é possível enviar notificações para este aparelho.", true); return; }
    const reg = await navigator.serviceWorker.ready;
    const chave = S.config.vapid_publica || (await api.push.chave());
    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      const atual = sub.options?.applicationServerKey;
      if (atual && btoa(String.fromCharCode(...new Uint8Array(atual))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") !== chave) { await sub.unsubscribe(); sub = null; }
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uParaBytes(chave) });
    const j = sub.toJSON();
    await api.push.registar(j.endpoint, j.keys.p256dh, j.keys.auth, aparelho());
    render(); toast("Notificações ativadas neste aparelho");
  } catch (e) { render(); falha(e); }
}

const CRM = criarCrm({ S, api, esc, I, toast, falha, render, agendarRender, renderPainel, abrir, nomeDe, ativos, av, criarTarefa, $ });
const CHAT = criarChat({ S, api, esc, I, toast, falha, render, agendarRender, nomeDe, ativos, av, $ });
const AGENDA = criarAgenda({ S, api, esc, I, toast, falha, render, agendarRender, renderPainel, abrir, fechar, nomeDe, ativos, av, abrirTarefa, $ });
const LOG = criarLogistica({ S, api, esc, I, toast, falha, render, agendarRender, renderPainel, abrir, fechar, nomeDe, ativos, av, crm: () => CRM, podeCrm, $ });
const AUD = criarAuditoria({ S, api, esc, I, toast, falha, render, agendarRender, renderPainel, abrir, fechar, nomeDe, ativos, av, $ });
const FIN = criarFinanceiro({ S, api, esc, I, toast, falha, render, agendarRender, $ });
const STK = criarStocks({ S, api, esc, I, toast, falha, render, agendarRender, renderPainel, abrir, fechar, nomeDe, ativos, av, $ });
const MK = criarMarketing({ S, api, esc, I, toast, falha, render, agendarRender, renderPainel, abrir, fechar, nomeDe, ativos, $ });
const OP = criarFornecedores({ S, api, esc, I, toast, falha, render, agendarRender, renderPainel, abrir, fechar, nomeDe, ativos, $ });
arrancar();
