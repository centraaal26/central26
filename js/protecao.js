// Central 26 — Proteção de ecrã nas contas dos barbeiros.
// Uma aplicação web não consegue impedir uma captura de ecrã a 100%; por isso:
//  1. marca de água com o nome da pessoa e a hora em todo o ecrã (qualquer captura fica identificada);
//  2. o ecrã fica tapado quando a app sai de primeiro plano (mudar de app, outra janela, tecla Print Screen);
//  3. valores escondidos até tocar e que voltam a esconder-se sozinhos (valorProtegido);
//  4. sem copiar, sem menu de contexto, sem arrastar e sem imprimir.
import { eGestor } from "./dados.js";

// Quem fica protegido: as contas das barbearias (barbeiros e responsáveis de loja), nunca a direção
export const contaProtegida = (eu) => !!eu && !eGestor(eu) && eu.departamento_id === "barbearias";

const SEGUNDOS_VISIVEL = 6;
let ativa = false, nome = "", relogio = null, escondeTimers = new Map();

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const hora = () => { const d = new Date(); return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }); };

function desenharMarca() {
  let m = document.getElementById("marca-agua");
  if (!m) { m = document.createElement("div"); m.id = "marca-agua"; m.setAttribute("aria-hidden", "true"); document.body.appendChild(m); }
  const t = esc(nome) + " · " + hora();
  m.innerHTML = '<div class="ma-grelha">' + Array.from({ length: Math.min(500, Math.max(60, Math.ceil((innerWidth * innerHeight) / 7000))) }, () => "<span>" + t + "</span>").join("") + "</div>";
}

function tapar() {
  if (!ativa) return;
  let c = document.getElementById("cortina");
  if (!c) {
    c = document.createElement("div"); c.id = "cortina"; c.setAttribute("role", "dialog"); c.setAttribute("aria-label", "Ecrã protegido");
    c.innerHTML = '<div class="cortina-c"><span class="cortina-m">Central <b>26</b></span><p>Ecrã protegido</p><button type="button" class="btn pri" id="cortina-ok">Continuar</button></div>';
    document.body.appendChild(c);
    c.querySelector("#cortina-ok").addEventListener("click", destapar);
  }
  document.body.classList.add("tapada");
}
function destapar() { document.body.classList.remove("tapada"); desenharMarca(); }

function aoVisibilidade() { if (document.visibilityState === "hidden") tapar(); }
function aoBlur() { tapar(); }
function aoTecla(e) {
  // Print Screen e atalhos de captura conhecidos (Windows: Win+Shift+S; Mac: Cmd+Shift+3/4/5)
  const k = e.key || "";
  if (k === "PrintScreen" || (e.shiftKey && (e.metaKey || e.getModifierState?.("OS")) && /^[345s]$/i.test(k))) {
    tapar();
    try { navigator.clipboard?.writeText(""); } catch { /* sem acesso à área de transferência */ }
  }
  // impedir imprimir e guardar a página
  if ((e.ctrlKey || e.metaKey) && /^[ps]$/i.test(k)) { e.preventDefault(); }
}
const ehCampo = (el) => !!el?.closest?.("input, textarea, [contenteditable='true'], select");
function aoCopiar(e) { if (!ehCampo(e.target)) { e.preventDefault(); } }
function aoMenu(e) { if (!ehCampo(e.target)) e.preventDefault(); }
function aoArrastar(e) { if (!ehCampo(e.target)) e.preventDefault(); }
function aoImprimir() { tapar(); }

// Valor escondido: só aparece enquanto se toca e volta a esconder-se sozinho
export function valorProtegido(html, rotulo = "Toca para ver") {
  if (!ativa) return html;
  return '<button type="button" class="vp" data-acao="vp-ver" aria-label="' + esc(rotulo) + '"><span class="vp-v">' + html + '</span><span class="vp-r">' + esc(rotulo) + "</span></button>";
}
function aoClique(e) {
  const b = e.target.closest?.('[data-acao="vp-ver"]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  b.classList.add("vp-on");
  clearTimeout(escondeTimers.get(b));
  escondeTimers.set(b, setTimeout(() => { b.classList.remove("vp-on"); escondeTimers.delete(b); }, SEGUNDOS_VISIVEL * 1000));
}

function ligar(eu) {
  ativa = true; nome = eu.nome || "";
  document.body.classList.add("protegida");
  desenharMarca();
  relogio = setInterval(desenharMarca, 60000);
  document.addEventListener("visibilitychange", aoVisibilidade);
  window.addEventListener("blur", aoBlur);
  window.addEventListener("pagehide", tapar);
  window.addEventListener("beforeprint", aoImprimir);
  window.addEventListener("resize", desenharMarca);
  document.addEventListener("keydown", aoTecla, true);
  document.addEventListener("keyup", aoTecla, true);
  ["copy", "cut"].forEach((ev) => document.addEventListener(ev, aoCopiar, true));
  document.addEventListener("contextmenu", aoMenu, true);
  document.addEventListener("dragstart", aoArrastar, true);
  document.addEventListener("click", aoClique, true);
}
function desligar() {
  ativa = false;
  document.body.classList.remove("protegida", "tapada");
  clearInterval(relogio); relogio = null;
  document.getElementById("marca-agua")?.remove();
  document.getElementById("cortina")?.remove();
  document.removeEventListener("visibilitychange", aoVisibilidade);
  window.removeEventListener("blur", aoBlur);
  window.removeEventListener("pagehide", tapar);
  window.removeEventListener("beforeprint", aoImprimir);
  window.removeEventListener("resize", desenharMarca);
  document.removeEventListener("keydown", aoTecla, true);
  document.removeEventListener("keyup", aoTecla, true);
  ["copy", "cut"].forEach((ev) => document.removeEventListener(ev, aoCopiar, true));
  document.removeEventListener("contextmenu", aoMenu, true);
  document.removeEventListener("dragstart", aoArrastar, true);
  document.removeEventListener("click", aoClique, true);
}

// Chamado a cada desenho da app: liga ou desliga conforme a pessoa com sessão iniciada
export function sincronizarProtecao(eu) {
  const deve = contaProtegida(eu);
  if (deve && (!ativa || nome !== eu.nome)) { if (ativa) desligar(); ligar(eu); }
  else if (!deve && ativa) desligar();
}
export const protecaoAtiva = () => ativa;
