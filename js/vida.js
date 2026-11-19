// Central 26 — vida no ecrã: ilustrações de cada área, números que contam até ao valor e gráficos que crescem.
// Tudo corre só na primeira vez que uma coisa aparece em cada visita a uma página (as atualizações em tempo real não repetem).
// Quem tem "reduzir movimento" ligado vê tudo parado, já no valor final.

const L = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const T = 'class="tom"'; // manchas de cor suaves por baixo do traço
const svg = (corpo) => '<svg viewBox="0 0 200 120" ' + L + ">" + corpo + "</svg>";

const ARTE = {
  // Barbearia com o poste à porta
  comercial: svg(
    '<path ' + T + ' d="M40 52h120v58H40z"/>' +
    '<path d="M8 110h184"/><path d="M40 52v58M160 52v58"/>' +
    '<path d="M34 40h132l-8-14H42z"/><path d="M34 40q8.25 10 16.5 0t16.5 0 16.5 0 16.5 0 16.5 0 16.5 0 16.5 0 16.5 0"/>' +
    '<path d="M52 62h28v26H52zM120 62h28v26h-28zM88 70h24v40H88z"/><path d="M107 90v2"/>' +
    '<path d="M18 50h8v44h-8z"/><path d="M18 58l8-5M18 67l8-5M18 76l8-5M18 85l8-5"/><circle cx="22" cy="46" r="3"/><path d="M16 94h12"/>'),
  // Prateleira com ceras, frascos e caixas
  stocks: svg(
    '<path ' + T + ' d="M34 38h26v22H34zM42 80h34v24H42z"/>' +
    '<path d="M22 18v92M178 18v92M18 60h164M18 104h164"/>' +
    '<rect x="34" y="38" width="26" height="22" rx="4"/><rect x="32" y="32" width="30" height="6" rx="2"/>' +
    '<path d="M74 60V42q0-6 6-8v-6h8v6q6 2 6 8v18z"/><path d="M80 22h8"/>' +
    '<path d="M108 60V36h20v24z"/><path d="M114 36v-6h8v6M114 26h12"/>' +
    '<ellipse cx="152" cy="54" rx="14" ry="5"/><path d="M138 54v-8M166 54v-8"/><ellipse cx="152" cy="46" rx="14" ry="5"/>' +
    '<rect x="42" y="80" width="34" height="24" rx="2"/><path d="M42 88h34M59 80v8"/>' +
    '<rect x="86" y="88" width="30" height="16" rx="2"/><path d="M128 104l6-22h10l6 22"/><path d="M131 92h16"/>'),
  // Carrinha de entregas com as riscas do poste
  logistica: svg(
    '<path ' + T + ' d="M24 50h88v42H24z"/>' +
    '<path d="M24 92V50h88v42"/><path d="M112 58h30l18 20v14h-48"/><path d="M118 64h22l12 13h-34z"/>' +
    '<path d="M42 50l-10 14M58 50l-18 26M74 50l-18 26M90 50l-18 26"/>' +
    '<circle cx="50" cy="94" r="10"/><circle cx="50" cy="94" r="3"/><circle cx="136" cy="94" r="10"/><circle cx="136" cy="94" r="3"/>' +
    '<path d="M24 92h16M60 92h66M146 92h14"/><path d="M4 62h12M8 72h10M2 82h12"/><path d="M0 110h200" stroke-dasharray="10 8"/>'),
  // Tesoura e pente
  academy: svg(
    '<path ' + T + ' d="M100 84h84v12h-84z"/>' +
    '<circle cx="44" cy="84" r="12"/><circle cx="72" cy="98" r="12"/>' +
    '<path d="M53 76L150 22l-10 16L62 86"/><path d="M83 92l74-46-4 14-64 42"/><circle cx="96" cy="66" r="2.2"/>' +
    '<rect x="100" y="84" width="84" height="12" rx="3"/><path d="M106 96v12M112 96v12M118 96v12M124 96v12M130 96v12M136 96v12M142 96v12M148 96v12M154 96v9M160 96v9M166 96v9M172 96v9M178 96v9"/>' +
    '<path d="M28 30l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM176 54l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"/>'),
  // Moedas e uma linha a subir
  financeiro: svg(
    '<path ' + T + ' d="M34 70h52v28H34z"/>' +
    '<ellipse cx="60" cy="98" rx="26" ry="7"/><path d="M34 98V70M86 98V70"/><path d="M34 88q26 14 52 0M34 79q26 14 52 0"/><ellipse cx="60" cy="70" rx="26" ry="7"/>' +
    '<ellipse cx="60" cy="56" rx="20" ry="5" transform="rotate(-8 60 56)"/>' +
    '<path d="M104 104h84M104 104V20"/><path d="M110 92l18-20 16 10 30-40"/><path d="M164 42h10v10"/>' +
    '<circle cx="128" cy="72" r="2.4"/><circle cx="144" cy="82" r="2.4"/>'),
  // Máquina fotográfica
  marketing: svg(
    '<path ' + T + ' d="M48 42h104v62H48z"/>' +
    '<rect x="48" y="42" width="104" height="62" rx="10"/><path d="M78 42l8-12h28l8 12"/><rect x="58" y="50" width="14" height="8" rx="2"/>' +
    '<circle cx="100" cy="74" r="20"/><circle cx="100" cy="74" r="11"/><path d="M95 69a7 7 0 018-2"/>' +
    '<path d="M168 28l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM30 76l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"/><path d="M162 60h14M164 70h18"/>'),
  // Calendário com um dia marcado
  agenda: svg(
    '<path ' + T + ' d="M56 24h88v20H56z"/>' +
    '<rect x="56" y="24" width="88" height="84" rx="8"/><path d="M56 44h88M76 16v14M124 16v14"/>' +
    '<path d="M70 58h6M88 58h6M106 58h6M124 58h6M70 74h6M88 74h6M124 74h6M70 90h6M88 90h6M106 90h6"/>' +
    '<circle cx="109" cy="74" r="8"/><path d="M152 92l18-18 8 8-18 18h-8z"/><path d="M164 80l8 8"/>'),
  // Carro e escudo (seguros e viaturas)
  prazos: svg(
    '<path ' + T + ' d="M140 22l26 10v20c0 18-12 30-26 36-14-6-26-18-26-36V32z"/>' +
    '<path d="M18 86l10-22a8 8 0 017-5h46a8 8 0 017 5l10 22"/><path d="M12 86h96v16H12z"/><path d="M22 102v8M98 102v8"/>' +
    '<circle cx="30" cy="94" r="3"/><circle cx="90" cy="94" r="3"/><path d="M40 72h40"/>' +
    '<path d="M140 22l26 10v20c0 18-12 30-26 36-14-6-26-18-26-36V32z"/><path d="M128 54l8 8 16-16"/><path d="M0 110h200"/>'),
  // Pessoas da equipa
  equipa: svg(
    '<path ' + T + ' d="M70 108c2-20 14-30 30-30s28 10 30 30z"/>' +
    '<circle cx="100" cy="52" r="16"/><path d="M70 108c2-20 14-30 30-30s28 10 30 30"/>' +
    '<circle cx="50" cy="62" r="12"/><path d="M28 108c1-16 10-24 22-24 7 0 13 3 17 8"/>' +
    '<circle cx="150" cy="62" r="12"/><path d="M172 108c-1-16-10-24-22-24-7 0-13 3-17 8"/>'),
  // Mapa com rota e alfinete
  prospecao: svg(
    '<path ' + T + ' d="M30 28l46-10v84l-46 10z"/>' +
    '<path d="M30 28l46-10 48 10 46-10v84l-46 10-48-10-46 10z"/><path d="M76 18v84M124 28v84"/>' +
    '<path d="M44 92c10-6 20-30 40-26s26 18 40 8 18-28 30-34" stroke-dasharray="5 6"/>' +
    '<path d="M154 52s-14-13-14-24a14 14 0 0128 0c0 11-14 24-14 24z"/><circle cx="154" cy="28" r="5"/>'),
  // Relatório com gráfico
  relatorio: svg(
    '<path ' + T + ' d="M72 70h12v28H72zM92 58h12v40H92zM112 46h12v52h-12z"/>' +
    '<path d="M60 12h62l18 18v82H60z"/><path d="M122 12v18h18"/>' +
    '<path d="M72 70h12v28H72zM92 58h12v40H92zM112 46h12v52h-12z"/><path d="M70 30h40M70 38h28"/>' +
    '<path d="M150 70l12-12 10 8 18-22"/><path d="M180 44h10v10"/>'),
  // Caixa de fornecedor com etiqueta
  operacional: svg(
    '<path ' + T + ' d="M40 50l50-22 50 22v44l-50 22-50-22z"/>' +
    '<path d="M40 50l50-22 50 22v44l-50 22-50-22z"/><path d="M40 50l50 22 50-22M90 72v44"/><path d="M65 39l50 22v14"/>' +
    '<path d="M150 30h34v44h-34z"/><path d="M158 42h18M158 52h18M158 62h10"/><path d="M160 22h14v8h-14z"/>'),
  // Janela do site e lupa
  auditoria: svg(
    '<path ' + T + ' d="M24 20h120v18H24z"/>' +
    '<rect x="24" y="20" width="120" height="84" rx="8"/><path d="M24 38h120"/><circle cx="34" cy="29" r="2"/><circle cx="42" cy="29" r="2"/><circle cx="50" cy="29" r="2"/>' +
    '<path d="M38 52h48M38 62h64M38 72h40"/>' +
    '<circle cx="142" cy="76" r="22"/><path d="M158 92l22 22"/><path d="M134 76l6 6 10-12"/>'),
  // Prancheta com tarefas feitas
  minhas: svg(
    '<path ' + T + ' d="M64 22h72v90H64z"/>' +
    '<rect x="64" y="22" width="72" height="90" rx="8"/><path d="M86 16h28v12H86z"/>' +
    '<path d="M76 46l5 5 9-10M98 46h26M76 68l5 5 9-10M98 68h26M78 90h10v10H78zM98 94h20"/>'),
};
ARTE.atividade = ARTE.equipa;

// Início: sol de manhã e de tarde, lua à noite
function arteInicio() {
  const h = new Date().getHours();
  if (h >= 20 || h < 6) return svg('<path ' + T + ' d="M120 24a34 34 0 1 0 30 50 28 28 0 0 1-30-50z"/><path d="M120 24a34 34 0 1 0 30 50 28 28 0 0 1-30-50z"/>' +
    '<path d="M60 34l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM170 30l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5zM50 80l1.5 3.5 3.5 1.5-3.5 1.5-1.5 3.5-1.5-3.5-3.5-1.5 3.5-1.5z"/><path d="M20 110h160"/>');
  return svg('<path ' + T + ' d="M70 96a30 30 0 0160 0z"/><path d="M70 96a30 30 0 0160 0"/>' +
    '<g class="raios"><path d="M100 50V36M70 60l-9-10M130 60l9-10M56 82H42M144 82h14"/></g>' +
    '<path d="M20 96h160M40 106h120M70 114h60"/>');
}

const reduzir = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let rotaVista = null, vistos = new Set(), inicioArte = 0;

// Número no texto (formato português: "947 047 €", "68,6%", "28,7"); devolve o valor e as casas decimais
const RE_NUM = /-?\d{1,3}(?:[\s  .]\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?/;
function animarNumero(el) {
  const no = [...el.childNodes].find((n) => n.nodeType === 3 && RE_NUM.test(n.nodeValue));
  if (!no) return;
  const orig = no.nodeValue, m = orig.match(RE_NUM), txt = m[0];
  const dec = (txt.split(",")[1] || "").length, alvo = parseFloat(txt.replace(/[\s  .]/g, "").replace(",", "."));
  if (!isFinite(alvo) || Math.abs(alvo) < 2) return;
  const fmt = (v) => (dec ? v.toLocaleString("pt-PT", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : Math.round(v).toLocaleString("pt-PT"));
  const t0 = performance.now(), dur = Math.min(900, 450 + Math.log10(Math.abs(alvo) + 1) * 90);
  const passo = (t) => {
    if (!no.isConnected) return;
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    no.nodeValue = p < 1 ? orig.replace(txt, fmt(alvo * e)) : orig;
    if (p < 1) requestAnimationFrame(passo);
  };
  no.nodeValue = orig.replace(txt, fmt(0));
  requestAnimationFrame(passo);
}

// Ilustração a desenhar-se traço a traço. "decorrido" (ms) continua a animação quando a página volta a ser desenhada a meio
// (por exemplo quando os dados chegam), em vez de a cortar.
const DURACAO_ARTE = 2600;
function desenhar(el, decorrido) {
  const d = -decorrido / 1000;
  el.style.animationDelay = d + "s";
  el.querySelectorAll(".tom").forEach((f) => (f.style.animationDelay = 0.7 + d + "s"));
  el.querySelectorAll("path,rect,circle,ellipse,line").forEach((f, i) => {
    if (f.classList.contains("tom") || !f.getTotalLength) return;
    let c = 0; try { c = f.getTotalLength(); } catch { return; }
    if (!c) return;
    if (f.getAttribute("stroke-dasharray")) { f.style.animation = "aparecer .5s " + (0.3 + i * 0.035 + d) + "s both"; return; }
    f.style.setProperty("--c", c.toFixed(1));
    f.style.strokeDasharray = c.toFixed(1);
    f.style.animation = "tracar " + (0.7 + Math.min(c, 260) / 400).toFixed(2) + "s cubic-bezier(.45,.05,.25,1) " + (i * 0.035 + d).toFixed(3) + "s both";
  });
}

const NUMEROS = ".kpi > b, .dado > b, .dep-tile > b, .stk-qtd > b";
const GRAFICOS = ".grafico, .aca-ev, .rk-barra, .bh, .sem-prog, .barra-prog";

export function darVida(raiz) {
  // só a página principal: painéis e avisos também passam por aqui e não podem baralhar o que já foi animado
  if (!raiz || !raiz.querySelector(".wrap")) return;
  const rota = (location.hash || "#inicio").slice(1) || "inicio", base = rota.split("-")[0];
  const nova = rota !== rotaVista;
  if (nova) { rotaVista = rota; vistos = new Set(); }
  const mexer = !reduzir();

  // 1. Ilustração no cabeçalho da página
  const cab = raiz.querySelector(".wrap > .cab");
  const arte = base === "inicio" ? arteInicio() : ARTE[base];
  if (cab && arte && !cab.querySelector(".cab-arte")) {
    const d = document.createElement("div");
    d.className = "cab-arte"; d.setAttribute("aria-hidden", "true"); d.innerHTML = arte;
    cab.classList.add("com-arte"); cab.prepend(d);
    if (!vistos.has("arte")) { vistos.add("arte"); inicioArte = performance.now(); }
    const passou = performance.now() - inicioArte;
    if (mexer && passou < DURACAO_ARTE) { d.classList.add("entra"); desenhar(d, passou); }
  }
  if (!mexer) return;

  // Troca de separador dentro da mesma página: o conteúdo novo aparece suavemente e volta a contar e a crescer
  const tab = raiz.querySelector('.wrap .tabs [aria-selected="true"]');
  const chaveTab = tab ? tab.textContent.trim() : "";
  if (chaveTab && vistos.tab !== undefined && vistos.tab !== chaveTab) {
    const arteVista = vistos.has("arte");
    vistos = new Set(); if (arteVista) vistos.add("arte");
    let n = tab.closest(".tabs").nextElementSibling;
    while (n) { n.classList.add("surge"); n = n.nextElementSibling; }
  }
  vistos.tab = chaveTab;

  // 2. Números a contar
  raiz.querySelectorAll(NUMEROS).forEach((el, i) => {
    const k = "n" + i;
    if (vistos.has(k)) return;
    vistos.add(k);
    if (el.closest(".painel")) return;
    animarNumero(el);
  });

  // 3. Gráficos e barras a crescer
  raiz.querySelectorAll(GRAFICOS).forEach((el, i) => {
    const k = "g" + i;
    if (vistos.has(k)) return;
    vistos.add(k);
    el.classList.add("cresce");
  });
}
