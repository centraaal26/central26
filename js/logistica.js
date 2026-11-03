// Central 26 — Logística: encomendas (com fatura e preparação artigo a artigo), rotas otimizadas e locais.
import { MES, MES_L, DIA, ymd, normalizar, haQuanto, eGestor, PRIORIDADES } from "./dados.js";
import { localizar, calcularRota, ligacoesGoogle, navegarGoogle, navegarWaze, desenharMapa } from "./geo.js";

export const ESTADOS_ENC = { nova: "Nova", em_preparacao: "Em preparação", pronta: "Pronta", em_rota: "Em rota", entregue: "Entregue", cancelada: "Cancelada" };
const TIPOS_ENC = { encomenda: "Encomenda de produtos", maquina: "Entrega de máquina", recolha: "Recolha", interna: "Reposição interna (barbearias)" };
const TIPOS_LOCAL = { sede: "Sede", armazem: "Armazém", barbearia: "Barbearia", academia: "Academia", cliente: "Cliente", outro: "Outro" };
const ref = (e) => "E-" + String(e.numero).padStart(4, "0");
const ATIVOS = ["nova", "em_preparacao", "pronta", "em_rota"];
const rotData = (s) => { if (!s) return "—"; const [y, m, d] = s.split("-").map(Number); return d + " " + MES[m - 1] + (y !== new Date().getFullYear() ? " " + y : ""); };
const diaLongo = (s) => { const d = new Date(s + "T12:00:00"); return DIA[d.getDay()].replace(/^./, (x) => x.toUpperCase()) + ", " + d.getDate() + " de " + MES_L[d.getMonth()]; };
const km = (m) => (m == null ? "—" : (m / 1000).toLocaleString("pt-PT", { maximumFractionDigits: m < 10000 ? 1 : 0 }) + " km");
const tempo = (s) => { if (s == null) return "—"; const h = Math.floor(s / 3600), mi = Math.round((s % 3600) / 60); return (h ? h + " h " : "") + mi + " min"; };
const uidc = () => "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const eLogistica = (eu) => !!eu && (eGestor(eu) || eu.departamento_id === "logistica");
export const podeEncomendas = (eu) => !!eu && (eLogistica(eu) || eu.departamento_id === "comercial");

export function criarLogistica(ctx) {
  const { S, api, esc, I, toast, falha, render, agendarRender, renderPainel, abrir, fechar, nomeDe, ativos, crm, podeCrm, $ } = ctx;
  const G = (S.log = { estado: "por-carregar", locais: {}, encomendas: {}, rotas: {}, tab: "encomendas", filtro: "ativas", q: "", minhas: false,
    nova: null, aCalcular: null, verFeitas: false });
  let desligar = null;

  async function carregar() {
    if (G.estado === "a-carregar") return;
    G.estado = "a-carregar";
    try {
      const d = await api.log.carregar();
      G.locais = Object.fromEntries(d.locais.map((x) => [x.id, x]));
      G.encomendas = Object.fromEntries(d.encomendas.map((x) => [x.id, x]));
      G.rotas = Object.fromEntries(d.rotas.map((x) => [x.id, x]));
      G.estado = "pronto";
      if (!desligar) desligar = api.log.subscrever(aoMudar);
    } catch (e) { G.estado = /PGRST205|log_encomendas|Could not find/i.test(String(e?.message)) ? "falta-script" : "erro"; G.erro = e.message; }
    agendarRender();
    if (["encomenda", "enc-nova"].includes(S.aberto?.tipo)) renderPainel(true);
  }
  function aoMudar(t, ev, novo, antigo) {
    const m = { encomendas: G.encomendas, rotas: G.rotas, locais: G.locais }[t];
    if (ev === "DELETE") delete m[antigo.id]; else if (t === "locais" && !novo.ativo) delete m[novo.id]; else m[novo.id] = novo;
    agendarRender();
    if (S.aberto?.tipo === "encomenda") renderPainel();
  }
  const podeTratar = () => eLogistica(S.eu);
  const podeEditar = (e) => podeTratar() || (e.criado_por === S.eu.id && e.estado === "nova");
  const encomendas = () => Object.values(G.encomendas);
  const locais = () => Object.values(G.locais).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt"));
  const porTratar = () => encomendas().filter((e) => ATIVOS.includes(e.estado));

  async function gravarEnc(id, campos) {
    const antes = G.encomendas[id]; if (!antes) return;
    G.encomendas[id] = { ...antes, ...campos }; agendarRender();
    try { const r = await api.log.encomendas.atualizar(id, campos); G.encomendas[id] = r; agendarRender(); renderPainel(); return r; }
    catch (e) { G.encomendas[id] = antes; agendarRender(); renderPainel(true); falha(e); return null; }
  }

  /* ============================== Vistas ============================== */
  function vista(param) {
    if (G.estado === "por-carregar") carregar();
    if (param && param.startsWith("rota:")) return vistaRota(G.rotas[param.slice(5)]);
    let h = '<div class="cab"><div><div class="eyebrow neutro">' + (podeTratar() ? "Encomendas, entregas e rotas" : "Envia encomendas para a Logística") + "</div><h1>Logística</h1></div>" +
      (G.estado === "pronto" ? '<div class="acts">' + (podeTratar() ? '<button class="btn sec" data-acao="rota-nova">' + I.mapa + "Nova rota</button>" : "") + '<button class="btn pri" data-acao="enc-nova">' + I.plus + "Nova encomenda</button></div>" : "") + "</div>";
    const tabs = [["encomendas", "Encomendas"]].concat(podeTratar() ? [["rotas", "Rotas"], ["locais", "Locais"]] : []);
    h += '<div class="tabs" role="tablist">' + tabs.map(([k, r]) => '<button class="tab" role="tab" data-acao="log-tab" data-tab="' + k + '" aria-selected="' + (G.tab === k) + '">' + r + (k === "encomendas" ? '<span class="n">' + porTratar().length + "</span>" : "") + "</button>").join("") + "</div>";
    if (G.estado === "falta-script") return h + '<div class="vazio"><h3>Falta instalar a Logística na base de dados</h3><p>No Supabase, abre o SQL Editor, cola o ficheiro <b>supabase/05-logistica.sql</b> do GitHub e carrega em Run. Depois recarrega esta página.</p></div>';
    if (G.estado === "erro") return h + '<div class="aviso erro">Não foi possível abrir a Logística: ' + esc(G.erro || "") + "</div>";
    if (G.estado !== "pronto") return h + '<div class="tabela"><div class="esqueleto"><i style="width:50%"></i></div></div>';
    if (G.tab === "rotas" && podeTratar()) return h + vistaRotas();
    if (G.tab === "locais" && podeTratar()) return h + vistaLocais();
    return h + vistaEncomendas();
  }

  function cartaoEstado(e) { return '<span class="est est-' + e.estado + '">' + ESTADOS_ENC[e.estado] + "</span>"; }
  function linhaEnc(e) {
    const prep = e.itens.filter((i) => i.preparado).length, tot = e.itens.length;
    const resumo = e.itens.slice(0, 3).map((i) => (i.qtd || 1) + "× " + i.descricao).join(", ") + (e.itens.length > 3 ? " e mais " + (e.itens.length - 3) : "");
    const atraso = e.data_prevista && e.data_prevista < ymd(new Date()) && ATIVOS.includes(e.estado);
    const proxima = { nova: ["em_preparacao", "Começar"], em_preparacao: ["pronta", "Pronta"], pronta: ["entregue", "Entregue"], em_rota: ["entregue", "Entregue"] }[e.estado];
    return '<div class="enc-linha" data-tipo="' + e.tipo + '"><button class="enc-abrir" data-acao="enc-abrir" data-id="' + e.id + '"><span class="enc-ref mono">' + ref(e) + '</span><span class="enc-t"><span><b>' + esc(e.cliente_nome) + "</b>" +
      (e.tipo !== "encomenda" ? ' <span class="tag-tipo">' + ({ maquina: "Máquina", recolha: "Recolha", interna: "Reposição" })[e.tipo] + "</span>" : "") + "</span>" +
      "<small>" + esc(resumo || "Sem artigos") + "</small><small>" + [e.morada ? esc(e.morada) : '<span class="at">sem morada</span>', "pedida por " + esc((nomeDe(e.criado_por) || "—").split(" ")[0]), e.fatura_numero ? esc(e.fatura_numero) : ""].filter(Boolean).join(" · ") + "</small></span>" +
      '<span class="enc-m">' + cartaoEstado(e) + (tot && ATIVOS.includes(e.estado) ? '<small class="mono">' + prep + "/" + tot + " preparados</small>" : "") +
      (e.data_prevista ? '<small class="' + (atraso ? "at" : "") + '">' + (atraso ? "Atrasada · " : "Para ") + esc(rotData(e.data_prevista)) + "</small>" : "") + "</span></button>" +
      (podeTratar() && proxima ? '<button class="btn sec enc-passo" data-acao="enc-estado" data-id="' + e.id + '" data-v="' + proxima[0] + '">' + proxima[1] + "</button>" : "") + "</div>";
  }

  function vistaEncomendas() {
    const conta = (k) => encomendas().filter((e) => e.estado === k).length;
    let h = '<div class="resumo-crm resumo-log">' + ATIVOS.map((k) => '<button class="kpi' + (G.filtro === k ? " on" : "") + '" data-acao="enc-filtro" data-v="' + k + '"><span>' + ESTADOS_ENC[k] + "</span><b>" + conta(k) + "</b></button>").join("") +
      '<button class="kpi' + (G.filtro === "fechadas" ? " on" : "") + '" data-acao="enc-filtro" data-v="fechadas"><span>Entregues (90 dias)</span><b>' + conta("entregue") + "</b></button></div>";
    h += '<div class="barra"><div class="periodo"><b>' + (G.filtro === "ativas" ? "Por tratar" : G.filtro === "fechadas" ? "Entregues e canceladas" : ESTADOS_ENC[G.filtro]) + "</b><span>" +
      (podeTratar() ? "Abre uma encomenda para ires marcando os artigos preparados." : "Acompanha aqui o estado das encomendas que enviaste.") + '</span></div><div class="ferr">' +
      '<label class="pesq">' + I.lupa + '<span class="sr">Pesquisar encomendas</span><input id="enc-q" type="search" placeholder="Cliente, artigo, fatura…" value="' + esc(G.q) + '"></label>' +
      '<label class="chk-txt"><input type="checkbox" id="enc-minhas"' + (G.minhas ? " checked" : "") + "> Só as que eu pedi</label>" +
      (G.filtro !== "ativas" ? '<button class="btn sec" data-acao="enc-filtro" data-v="ativas">Ver todas por tratar</button>' : "") + "</div></div>";
    const q = normalizar(G.q);
    let l = encomendas().filter((e) => (G.filtro === "ativas" ? ATIVOS.includes(e.estado) : G.filtro === "fechadas" ? !ATIVOS.includes(e.estado) : e.estado === G.filtro));
    if (G.minhas) l = l.filter((e) => e.criado_por === S.eu.id);
    if (q) l = l.filter((e) => normalizar([ref(e), e.cliente_nome, e.morada, e.fatura_numero, e.notas, ...e.itens.map((i) => i.descricao)].join(" ")).includes(q));
    const ordemEst = { nova: 0, em_preparacao: 1, pronta: 2, em_rota: 3, entregue: 4, cancelada: 5 }, ordemPri = { alta: 0, media: 1, baixa: 2 };
    l.sort((a, b) => G.filtro === "fechadas" ? String(b.entregue_em || b.atualizado_em).localeCompare(String(a.entregue_em || a.atualizado_em))
      : ordemPri[a.prioridade] - ordemPri[b.prioridade] || String(a.data_prevista || "9999").localeCompare(String(b.data_prevista || "9999")) || ordemEst[a.estado] - ordemEst[b.estado] || a.numero - b.numero);
    h += l.length ? '<div class="enc-lista">' + l.map(linhaEnc).join("") + "</div>" : '<div class="vazio"><h3>' + (G.filtro === "ativas" ? "Nada por tratar" : "Sem encomendas aqui") + "</h3><p>" +
      (G.filtro === "ativas" ? "Quando o Comercial ou a direção enviarem uma encomenda, ela aparece aqui e a Logística recebe um aviso." : "Muda o filtro para ver outras encomendas.") + "</p></div>";
    return h;
  }

  // Bloco para o início
  function blocoInicio() {
    if (!podeEncomendas(S.eu)) return "";
    if (G.estado === "por-carregar") carregar();
    if (G.estado !== "pronto") return "";
    const l = (podeTratar() ? porTratar() : porTratar().filter((e) => e.criado_por === S.eu.id)).sort((a, b) => String(a.data_prevista || "9999").localeCompare(String(b.data_prevista || "9999")));
    if (!l.length) return "";
    return '<section class="cartao-sec"><h3>' + (podeTratar() ? "Encomendas por tratar" : "As tuas encomendas em curso") + ' <span class="mono" style="color:var(--faint);font-weight:400">' + l.length + '</span> <a class="c-link" href="#logistica" style="font-size:13px;margin-left:8px">Ver todas</a></h3><div class="enc-lista">' + l.slice(0, 4).map(linhaEnc).join("") + "</div></section>";
  }

  /* ---------- Rotas ---------- */
  function vistaRotas() {
    const l = Object.values(G.rotas).sort((a, b) => b.data.localeCompare(a.data) || String(b.criado_em).localeCompare(String(a.criado_em)));
    if (!l.length) return '<div class="vazio"><h3>Ainda não há rotas</h3><p>Uma rota junta as encomendas e os pontos do dia. A app põe-nos pela ordem mais curta e abre a navegação no Google Maps.</p><div class="acts"><button class="btn pri" data-acao="rota-nova">' + I.mapa + "Planear a primeira rota</button></div></div>";
    return '<div class="enc-lista">' + l.map((r) => {
      const feitas = r.paragens.filter((p) => p.feito).length;
      return '<div class="enc-linha"><a class="enc-abrir" href="#logistica-rota:' + r.id + '"><span class="enc-ref mono">' + esc(rotData(r.data)) + '</span><span class="enc-t"><b>' + esc(r.titulo || "Rota") + "</b><small>" + r.paragens.length + " paragens · " + km(r.distancia_m) + " · " + tempo(r.duracao_s) +
        "</small><small>" + esc(r.paragens.map((p) => p.nome).slice(0, 4).join(" → ")) + (r.paragens.length > 4 ? " → …" : "") + '</small></span><span class="enc-m"><span class="est est-' + (r.estado === "concluida" ? "entregue" : r.estado === "em_curso" ? "em_rota" : "nova") + '">' +
        ({ planeada: "Planeada", em_curso: "Em curso", concluida: "Concluída" })[r.estado] + '</span><small class="mono">' + feitas + "/" + r.paragens.length + " feitas</small></span></a></div>";
    }).join("") + "</div>";
  }

  function vistaRota(r) {
    if (!r) return '<a href="#logistica" class="eyebrow neutro" style="text-decoration:none">← Logística</a><div class="vazio"><h3>Rota indisponível</h3><p>Foi eliminada ou ainda está a carregar.</p></div>';
    const partida = r.partida, fim = r.voltar ? r.partida : r.fim;
    const pontos = [partida, ...r.paragens].concat(fim ? [fim] : []);
    const links = ligacoesGoogle(pontos);
    const semLocal = r.paragens.filter((p) => p.lat == null);
    let h = '<a href="#logistica" class="eyebrow neutro" style="text-decoration:none" data-acao="log-tab" data-tab="rotas">← Rotas</a>';
    h += '<div class="cab"><div><div class="eyebrow neutro">' + esc(diaLongo(r.data)) + "</div><h1>" + esc(r.titulo || "Rota") + '</h1><p class="sub-cab">' + r.paragens.length + " paragens · " + km(r.distancia_m) + " · cerca de " + tempo(r.duracao_s) + " a conduzir" +
      (r.voltar ? " · volta a " + esc(partida?.nome || "partida") : fim ? " · termina em " + esc(fim.nome) : "") + '</p></div><div class="acts">' +
      (r.estado === "planeada" ? '<button class="btn pri" data-acao="rota-estado" data-id="' + r.id + '" data-v="em_curso">Começar rota</button>' : r.estado === "em_curso" ? '<button class="btn pri" data-acao="rota-estado" data-id="' + r.id + '" data-v="concluida">Concluir rota</button>' : "") +
      '<button class="btn sec" data-acao="rota-recalcular" data-id="' + r.id + '">Recalcular</button><button class="btn perigo-sec" data-acao="rota-apagar" data-id="' + r.id + '">' + I.lixo + "Eliminar</button></div></div>";
    if (G.confirmarRota === r.id) h += '<div class="aviso erro" style="justify-content:space-between;flex-wrap:wrap">Eliminar esta rota? As encomendas «em rota» voltam a «pronta».<span class="acts"><button class="btn sec" data-acao="rota-apagar-nao">Manter</button><button class="btn perigo" data-acao="rota-apagar-sim" data-id="' + r.id + '">Eliminar rota</button></span></div>';
    if (G.aCalcular) h += '<div class="aviso">' + esc(G.aCalcular) + "</div>";
    h += '<div class="rota-nav">' + links.map((l, i) => '<a class="btn pri" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + I.mapa + (links.length > 1 ? "Google Maps · parte " + (i + 1) + " (paragens " + Math.max(1, l.de - 1) + "–" + Math.min(r.paragens.length, l.ate - 1) + ")" : "Abrir a rota no Google Maps") + "</a>").join("") + "</div>";
    if (semLocal.length) h += '<div class="aviso erro">' + semLocal.length + (semLocal.length === 1 ? " paragem não foi encontrada no mapa" : " paragens não foram encontradas no mapa") + " e ficou fora do trajeto: " + esc(semLocal.map((p) => p.nome).join(", ")) + ". Corrige a morada e carrega em Recalcular.</div>";
    h += '<div class="rota-grid"><div id="mapa-rota" class="mapa" data-marca="grupo" role="img" aria-label="Mapa da rota"></div><ol class="paragens">';
    h += '<li class="par inicio"><span class="pino inicio">▶</span><span class="par-t"><b>' + esc(partida?.nome || "Partida") + "</b><small>" + esc(partida?.morada || "") + "</small></span></li>";
    r.paragens.forEach((p, i) => {
      const enc = p.encomenda_id ? G.encomendas[p.encomenda_id] : null;
      h += '<li class="par' + (p.feito ? " feita" : "") + '"><span class="pino' + (p.feito ? " feito" : "") + '">' + (i + 1) + '</span><span class="par-t"><b>' + esc(p.nome) + "</b>" + (p.aproximada ? ' <span class="tag-tipo">morada aproximada</span>' : "") + "<small>" + esc(p.morada || "") + "</small>" +
        (enc ? '<small><button class="c-link" data-acao="enc-abrir" data-id="' + enc.id + '">' + ref(enc) + "</button> · " + esc(enc.itens.map((x) => (x.qtd || 1) + "× " + x.descricao).join(", ")) + (enc.contacto ? " · " + esc(enc.contacto) : "") + "</small>" : "") +
        (p.lat != null ? '<span class="par-nav"><a href="' + navegarGoogle(p) + '" target="_blank" rel="noopener">Maps</a><a href="' + navegarWaze(p) + '" target="_blank" rel="noopener">Waze</a></span>' : "") +
        '</span><button class="chk' + (p.feito ? " on" : "") + '" data-acao="par-feito" data-id="' + r.id + '" data-i="' + i + '" aria-label="' + (p.feito ? "Desmarcar paragem" : "Marcar paragem como feita") + '" aria-pressed="' + !!p.feito + '">' + I.check + "</button></li>";
    });
    if (fim) h += '<li class="par inicio"><span class="pino inicio">■</span><span class="par-t"><b>' + esc(r.voltar ? "Regresso a " + (partida?.nome || "partida") : fim.nome) + "</b></span></li>";
    h += "</ol></div>";
    h += '<p class="nota-tab">Mapa © OpenStreetMap · trajeto calculado por OSRM' + (r.estrada === false ? " (estimativa em linha reta: o serviço de estradas não respondeu)" : "") + ".</p>";
    setTimeout(() => { const el = document.getElementById("mapa-rota"); if (el && !el.dataset.pronto) { el.dataset.pronto = "1"; desenharMapa(el, { partida, paragens: r.paragens, fim: r.voltar ? null : fim, geometria: r.geometria }).catch(() => { el.innerHTML = '<p class="muted" style="padding:16px">Não foi possível carregar o mapa. As ligações para o Google Maps continuam a funcionar.</p>'; }); } }, 0);
    return h;
  }

  /* ---------- Locais ---------- */
  function vistaLocais() {
    let h = '<div class="barra"><div class="periodo"><b>Locais fixos</b><span>Pontos de partida e paragens frequentes. Preenche a morada das barbearias para as poderes juntar às rotas.</span></div><div class="ferr"><button class="btn sec" data-acao="local-novo">' + I.plus + "Novo local</button></div></div>";
    h += '<div class="enc-lista">' + locais().map((l) => '<div class="enc-linha"><div class="enc-abrir local"><span class="enc-ref">' + esc(TIPOS_LOCAL[l.tipo] || "") + '</span><span class="enc-t"><label class="sr" for="lc-n-' + l.id + '">Nome</label><input class="inp" id="lc-n-' + l.id + '" data-local="' + l.id + '" data-campo="nome" value="' + esc(l.nome) + '">' +
      '<label class="sr" for="lc-m-' + l.id + '">Morada</label><input class="inp" id="lc-m-' + l.id + '" data-local="' + l.id + '" data-campo="morada" value="' + esc(l.morada) + '" placeholder="Morada completa com código postal"></span><span class="enc-m">' +
      (l.lat != null ? '<span class="est est-entregue">No mapa</span>' : l.morada ? '<button class="btn sec" data-acao="local-localizar" data-id="' + l.id + '">Localizar</button>' : '<span class="est est-nova">Falta morada</span>') +
      '<button class="ib perigo" data-acao="local-apagar" data-id="' + l.id + '" aria-label="Retirar local">' + I.lixo + "</button></span></div></div>").join("") + "</div>";
    return h;
  }

  /* ============================== Painéis ============================== */
  function painel(a) {
    if (a.tipo === "enc-nova") return painelNova(a);
    if (a.tipo === "rota-nova") return painelRota(a);
    if (a.tipo === "local-novo") return painelLocal();
    const e = G.encomendas[a.id];
    const mold = (c, pe) => '<div class="veu" data-acao="fechar"></div><aside class="painel largo" role="dialog" aria-label="Encomenda" data-marca="grupo"><div class="p-scroll">' + c + "</div>" + (pe ? '<div class="p-pe">' + pe + "</div>" : "") + "</aside>";
    if (!e) return mold('<div class="p-topo"><span class="migalha">Logística</span><button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + "</button></div>" + (G.estado === "pronto" ? '<div class="vazio"><h3>Encomenda indisponível</h3><p>Foi eliminada ou não tens acesso.</p></div>' : '<div class="esqueleto"><i style="width:60%"></i></div>'));
    const ed = podeEditar(e), trata = podeTratar(), dis = ed ? "" : " disabled";
    const apaga = eGestor(S.eu) || (e.criado_por === S.eu.id && e.estado === "nova");
    let h = '<div class="p-topo"><span class="migalha"><i></i>Logística / ' + ref(e) + '</span><span class="acts">' + (apaga ? '<button class="ib perigo" data-acao="enc-apagar">' + I.lixo + "Eliminar</button>" : "") + '<button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + "</button></span></div>";
    if (a.confirmar) h += '<div class="aviso erro" style="justify-content:space-between;flex-wrap:wrap">Eliminar a encomenda ' + ref(e) + "?" + '<span class="acts"><button class="btn sec" data-acao="enc-apagar-nao">Manter</button><button class="btn perigo" data-acao="enc-apagar-sim">Eliminar</button></span></div>';
    h += '<h2 style="margin:0">' + esc(e.cliente_nome) + "</h2>";
    h += '<div class="chips">' + cartaoEstado(e) + "<span>" + esc(TIPOS_ENC[e.tipo]) + "</span><span>Pedida por " + esc(nomeDe(e.criado_por) || "—") + " " + haQuanto(e.criado_em) + "</span></div>";
    if (!trata && e.estado !== "nova" && e.criado_por === S.eu.id && ATIVOS.includes(e.estado)) h += '<div class="aviso">A Logística já está a tratar desta encomenda. Para mudar alguma coisa, fala com a Logística ou cancela-a.</div>';
    // passos de estado
    if (trata) {
      const passos = [["nova", "Nova"], ["em_preparacao", "Em preparação"], ["pronta", "Pronta"], ["em_rota", "Em rota"], ["entregue", "Entregue"]];
      h += '<div class="passos" role="group" aria-label="Estado">' + passos.map(([k, r]) => '<button data-acao="enc-estado" data-id="' + e.id + '" data-v="' + k + '" aria-pressed="' + (e.estado === k) + '">' + r + "</button>").join("") + "</div>";
    }
    // artigos
    const prep = e.itens.filter((i) => i.preparado).length;
    h += '<section class="p-sec"><h3>Artigos <span class="mono">' + prep + "/" + e.itens.length + " preparados</span></h3>";
    e.itens.forEach((it) => {
      h += '<div class="cl-item' + (it.preparado ? " feito" : "") + '"><button class="chk' + (it.preparado ? " on" : "") + '" data-acao="enc-item" data-item="' + it.id + '" aria-label="' + (it.preparado ? "Desmarcar artigo" : "Marcar artigo como preparado") + '"' + (trata ? "" : " disabled") + ">" + I.check + "</button>" +
        '<input type="number" class="inp qtd" id="ei-q-' + it.id + '" data-item="' + it.id + '" data-campo="qtd" min="0" step="1" value="' + esc(it.qtd) + '" aria-label="Quantidade"' + dis + '><input type="text" id="ei-d-' + it.id + '" data-item="' + it.id + '" data-campo="descricao" value="' + esc(it.descricao) + '" aria-label="Artigo"' + dis + ">" +
        (ed ? '<button class="ib x" data-acao="enc-item-apagar" data-item="' + it.id + '" aria-label="Remover artigo">' + I.x + "</button>" : "") + "</div>";
    });
    if (ed) h += '<label class="cl-add">' + I.plus + '<span class="sr">Adicionar artigo</span><input id="enc-novoitem" placeholder="Adicionar artigo (ex.: 6 CLAY) e carregar em Enter" autocomplete="off" list="lista-produtos"></label>' + listaProdutos();
    h += "</section>";
    // dados
    const pessoasLog = ativos().filter((p) => p.departamento_id === "logistica" || eGestor(p));
    h += '<div class="props">' +
      '<label for="enc-tipo">Tipo</label><select id="enc-tipo"' + dis + ">" + Object.entries(TIPOS_ENC).map(([k, r]) => '<option value="' + k + '"' + (e.tipo === k ? " selected" : "") + ">" + r + "</option>").join("") + "</select>" +
      '<label for="enc-prio">Prioridade</label><select id="enc-prio"' + dis + ">" + Object.entries(PRIORIDADES).map(([k, r]) => '<option value="' + k + '"' + (e.prioridade === k ? " selected" : "") + ">" + r + "</option>").join("") + "</select>" +
      '<label for="enc-data">Para quando</label><input id="enc-data" type="date" value="' + esc(e.data_prevista || "") + '"' + dis + ">" +
      '<label for="enc-resp">Quem entrega</label><select id="enc-resp"' + (trata ? "" : " disabled") + '><option value="">Logística (qualquer pessoa)</option>' + pessoasLog.map((p) => '<option value="' + p.id + '"' + (e.responsavel_id === p.id ? " selected" : "") + ">" + esc(p.nome) + "</option>").join("") + "</select>" +
      '<label for="enc-cliente">Cliente</label><input id="enc-cliente" value="' + esc(e.cliente_nome) + '"' + dis + ">" +
      '<label for="enc-contacto">Contacto</label><input id="enc-contacto" type="tel" value="' + esc(e.contacto) + '"' + dis + ">" +
      '<label for="enc-morada">Morada</label><input id="enc-morada" value="' + esc(e.morada) + '" placeholder="Com código postal, para a rota"' + dis + ">" +
      (e.lat != null ? '<span class="ajuda"><a href="' + navegarGoogle(e) + '" target="_blank" rel="noopener">Abrir no Google Maps</a> · <a href="' + navegarWaze(e) + '" target="_blank" rel="noopener">Waze</a></span>' : "") +
      '<label for="enc-fatnum">N.º da fatura</label><input id="enc-fatnum" value="' + esc(e.fatura_numero) + '" placeholder="Ex.: Fac 26DNT/512"' + dis + ">" +
      "</div>";
    h += '<section class="p-sec"><h3>Fatura</h3><div class="acts">' + (e.fatura_ficheiro ? '<button class="btn sec" data-acao="enc-fatura-ver">' + I.nota + "Abrir " + esc(e.fatura_nome || "fatura") + "</button>" : '<span class="muted">Sem ficheiro anexado.</span>') +
      (ed || trata ? '<label class="btn sec" for="enc-fatura">' + I.plus + (e.fatura_ficheiro ? "Substituir" : "Anexar fatura (PDF ou foto)") + '</label><input id="enc-fatura" type="file" accept="application/pdf,image/*" hidden>' : "") + "</div></section>";
    h += '<section class="p-sec"><h3>Notas</h3><textarea id="enc-notas" class="notas" placeholder="Horário de entrega, a quem entregar, cuidados…"' + dis + ">" + esc(e.notas) + "</textarea></section>";
    if (e.estado !== "cancelada" && (ed || (e.criado_por === S.eu.id && ATIVOS.includes(e.estado)))) h += '<div class="acts"><button class="btn perigo-sec" data-acao="enc-estado" data-id="' + e.id + '" data-v="cancelada">Cancelar encomenda</button></div>';
    const pe = "<span>" + (e.entregue_em ? "Entregue por " + esc(nomeDe(e.entregue_por) || "—") + " " + haQuanto(e.entregue_em) : e.atualizado_por ? "Alterada por " + esc(nomeDe(e.atualizado_por) || "—") + " " + haQuanto(e.atualizado_em) : "") + "</span>";
    return mold(h, pe);
  }
  function listaProdutos() {
    const prods = S.crm?.produtos ? Object.values(S.crm.produtos) : [];
    if (!prods.length) return "";
    return '<datalist id="lista-produtos">' + prods.slice(0, 600).map((p) => '<option value="' + esc(p.descricao) + '">').join("") + "</datalist>";
  }
  function clientesCrm() { return S.crm?.clientes ? Object.values(S.crm.clientes).filter((c) => c.tipo !== "interno") : []; }

  function painelNova(a) {
    const n = G.nova || (G.nova = { itens: [{ id: uidc(), descricao: "", qtd: 1 }], ...a.pre });
    const cli = clientesCrm();
    let c = '<div class="p-topo"><span class="migalha"><i></i>Logística</span><button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + '</button></div><h2 style="margin:0">Nova encomenda</h2>' +
      '<form class="form" id="form-enc" novalidate><div class="campos-2"><div class="campo"><label for="ne-tipo">Tipo</label><select id="ne-tipo">' + Object.entries(TIPOS_ENC).map(([k, r]) => '<option value="' + k + '"' + ((n.tipo || "encomenda") === k ? " selected" : "") + ">" + r + "</option>").join("") + "</select></div>" +
      '<div class="campo"><label for="ne-prio">Prioridade</label><select id="ne-prio">' + Object.entries(PRIORIDADES).map(([k, r]) => '<option value="' + k + '"' + ((n.prioridade || "media") === k ? " selected" : "") + ">" + r + "</option>").join("") + "</select></div></div>" +
      '<div class="campo"><label for="ne-cliente">Cliente ou destino</label><input id="ne-cliente" required value="' + esc(n.cliente_nome || "") + '" autocomplete="off" placeholder="Ex.: Barbearia do Zela"' + (cli.length ? ' list="lista-clientes"' : "") + ">" +
      (cli.length ? '<datalist id="lista-clientes">' + cli.slice(0, 1500).map((x) => '<option value="' + esc(x.nome) + '">' + esc([x.concelho, x.distrito].filter(Boolean).join(", ")) + "</option>").join("") + '</datalist><span class="ajuda">Ao escolher um cliente do CRM, a morada e o contacto são preenchidos.</span>' : "") + "</div>" +
      '<div class="campos-2"><div class="campo"><label for="ne-contacto">Contacto</label><input id="ne-contacto" type="tel" value="' + esc(n.contacto || "") + '" autocomplete="off"></div><div class="campo"><label for="ne-data">Para quando</label><input id="ne-data" type="date" value="' + esc(n.data_prevista || "") + '"></div></div>' +
      '<div class="campo"><label for="ne-morada">Morada de entrega</label><input id="ne-morada" value="' + esc(n.morada || "") + '" placeholder="Rua, número, código postal e localidade" autocomplete="off"></div>' +
      '<div class="campo"><span class="rot">Artigos</span><div class="ne-itens">' + n.itens.map((it) => '<div class="ne-item"><label class="sr" for="ni-q-' + it.id + '">Quantidade</label><input class="inp qtd" type="number" min="1" step="1" id="ni-q-' + it.id + '" data-novo-item="' + it.id + '" data-campo="qtd" value="' + esc(it.qtd) + '">' +
        '<label class="sr" for="ni-d-' + it.id + '">Artigo</label><input class="inp" id="ni-d-' + it.id + '" data-novo-item="' + it.id + '" data-campo="descricao" value="' + esc(it.descricao) + '" placeholder="Artigo" list="lista-produtos" autocomplete="off">' +
        (n.itens.length > 1 ? '<button type="button" class="ib x" data-acao="ne-item-apagar" data-item="' + it.id + '" aria-label="Remover artigo">' + I.x + "</button>" : "") + "</div>").join("") + listaProdutos() +
      '<button type="button" class="btn sec" data-acao="ne-item" style="align-self:flex-start">' + I.plus + "Mais um artigo</button></div></div>" +
      '<div class="campos-2"><div class="campo"><label for="ne-fatnum">N.º da fatura</label><input id="ne-fatnum" value="' + esc(n.fatura_numero || "") + '" placeholder="Ex.: Fac 26DNT/512" autocomplete="off"></div>' +
      '<div class="campo"><label for="ne-fatura">Ficheiro da fatura</label><input id="ne-fatura" type="file" accept="application/pdf,image/*"><span class="ajuda">PDF ou fotografia, até 10 MB.</span></div></div>' +
      '<div class="campo"><label for="ne-notas">Notas</label><textarea id="ne-notas" placeholder="Horário, a quem entregar, cuidados…">' + esc(n.notas || "") + "</textarea></div>" +
      '<div class="acts"><button class="btn pri" type="submit"' + (G.aEnviar ? " disabled" : "") + ">" + (G.aEnviar ? "A enviar…" : "Enviar para a Logística") + '</button><button class="btn sec" type="button" data-acao="fechar">Cancelar</button></div></form>';
    return '<div class="veu" data-acao="fechar"></div><aside class="painel largo" role="dialog" aria-label="Nova encomenda" data-marca="grupo"><div class="p-scroll">' + c + "</div></aside>";
  }

  function painelRota(a) {
    const hoje = ymd(new Date());
    const cand = porTratar().filter((e) => e.estado !== "em_rota").sort((x, y) => String(x.data_prevista || "9999").localeCompare(String(y.data_prevista || "9999")));
    const ls = locais(), sede = ls.find((l) => l.tipo === "sede") || ls[0];
    let c = '<div class="p-topo"><span class="migalha"><i></i>Logística</span><button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + '</button></div><h2 style="margin:0">Planear rota</h2>' +
      '<p class="muted" style="margin:0">Escolhe as encomendas e os pontos. A app procura cada morada no mapa e põe as paragens pela ordem mais curta.</p>' +
      '<form class="form" id="form-rota" novalidate><div class="campos-2"><div class="campo"><label for="nr-data">Dia</label><input id="nr-data" type="date" value="' + hoje + '"></div><div class="campo"><label for="nr-titulo">Nome</label><input id="nr-titulo" placeholder="Ex.: Porto e Gaia" autocomplete="off"></div></div>' +
      '<div class="campos-2"><div class="campo"><label for="nr-partida">Partida</label><select id="nr-partida">' + ls.filter((l) => l.morada).map((l) => '<option value="' + l.id + '"' + (l.id === sede?.id ? " selected" : "") + ">" + esc(l.nome) + "</option>").join("") + "</select></div>" +
      '<div class="campo"><label for="nr-fim">Terminar</label><select id="nr-fim"><option value="voltar">Voltar à partida</option><option value="ultima">Na última paragem</option>' + ls.filter((l) => l.morada).map((l) => '<option value="' + l.id + '">Em ' + esc(l.nome) + "</option>").join("") + "</select></div></div>" +
      '<div class="campo"><span class="rot">Encomendas por entregar</span><div class="ev-pessoas">' + (cand.length ? cand.map((e) => '<label class="chk-txt"><input type="checkbox" name="nr-enc" value="' + e.id + '"' + (e.estado === "pronta" || (a.pre || []).includes(e.id) ? " checked" : "") + (e.morada ? "" : " disabled") + "> " + ref(e) + " · " + esc(e.cliente_nome) + (e.morada ? "" : " (sem morada)") + "</label>").join("") : '<span class="muted">Não há encomendas por entregar.</span>') + "</div></div>" +
      '<div class="campo"><span class="rot">Locais (barbearias, armazém…)</span><div class="ev-pessoas">' + ls.map((l) => '<label class="chk-txt"><input type="checkbox" name="nr-local" value="' + l.id + '"' + (l.morada ? "" : " disabled") + "> " + esc(l.nome) + (l.morada ? "" : " (sem morada)") + "</label>").join("") + "</div></div>" +
      '<div class="campo"><label for="nr-extra">Outras moradas (uma por linha)</label><textarea id="nr-extra" placeholder="Ex.: Rua de Santa Catarina 100, 4000-447 Porto"></textarea></div>' +
      '<div class="acts"><button class="btn pri" type="submit"' + (G.aCalcular ? " disabled" : "") + ">" + (G.aCalcular ? esc(G.aCalcular) : "Calcular a rota") + '</button><button class="btn sec" type="button" data-acao="fechar">Cancelar</button></div></form>';
    return '<div class="veu" data-acao="fechar"></div><aside class="painel largo" role="dialog" aria-label="Planear rota" data-marca="grupo"><div class="p-scroll">' + c + "</div></aside>";
  }

  function painelLocal() {
    const c = '<div class="p-topo"><span class="migalha"><i></i>Logística</span><button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + '</button></div><h2 style="margin:0">Novo local</h2>' +
      '<form class="form" id="form-local" novalidate><div class="campo"><label for="nl-nome">Nome</label><input id="nl-nome" required placeholder="Ex.: Armazém de Serzedo" autocomplete="off"></div>' +
      '<div class="campo"><label for="nl-tipo">Tipo</label><select id="nl-tipo">' + Object.entries(TIPOS_LOCAL).map(([k, r]) => '<option value="' + k + '">' + r + "</option>").join("") + "</select></div>" +
      '<div class="campo"><label for="nl-morada">Morada</label><input id="nl-morada" placeholder="Rua, número, código postal e localidade" autocomplete="off"></div>' +
      '<div class="acts"><button class="btn pri" type="submit">Criar local</button><button class="btn sec" type="button" data-acao="fechar">Cancelar</button></div></form>';
    return '<div class="veu" data-acao="fechar"></div><aside class="painel" role="dialog" aria-label="Novo local" data-marca="grupo"><div class="p-scroll">' + c + "</div></aside>";
  }

  /* ============================== Ações ============================== */
  function lerItemTexto(t) { const m = t.trim().match(/^(\d+)\s*[x×]?\s+(.+)$/i); return m ? { qtd: +m[1], descricao: m[2].trim() } : { qtd: 1, descricao: t.trim() }; }

  async function criarEncomenda(f) {
    const n = G.nova || {};
    const cliente = $("#ne-cliente").value.trim();
    const itens = (n.itens || []).map((it) => ({ id: it.id, descricao: String(it.descricao || "").trim(), qtd: Math.max(1, +it.qtd || 1), preparado: false })).filter((it) => it.descricao);
    if (!cliente) { toast("Indica o cliente ou o destino.", true); $("#ne-cliente").focus(); return; }
    if (!itens.length) { toast("Junta pelo menos um artigo.", true); return; }
    const crm = clientesCrm().find((x) => x.nome === cliente);
    const dados = { tipo: $("#ne-tipo").value, prioridade: $("#ne-prio").value, cliente_nome: cliente, crm_cliente_id: crm?.id || null, contacto: $("#ne-contacto").value.trim(),
      morada: $("#ne-morada").value.trim(), data_prevista: $("#ne-data").value || null, itens, fatura_numero: $("#ne-fatnum").value.trim(), notas: $("#ne-notas").value };
    const ficheiro = $("#ne-fatura").files?.[0];
    if (ficheiro && ficheiro.size > 10 * 1024 * 1024) { toast("A fatura tem mais de 10 MB.", true); return; }
    G.aEnviar = true; renderPainel(true);
    try {
      let r = await api.log.encomendas.criar(dados);
      G.encomendas[r.id] = r;
      if (ficheiro) {
        try { const c = await api.log.enviarFatura(r.id, ficheiro); r = await api.log.encomendas.atualizar(r.id, { fatura_ficheiro: c, fatura_nome: ficheiro.name }); G.encomendas[r.id] = r; }
        catch (e) { toast("Encomenda enviada, mas a fatura não foi anexada: " + e.message, true); }
      }
      G.aEnviar = false; G.nova = null; fechar(); render();
      toast("Encomenda " + ref(r) + " enviada para a Logística");
    } catch (e) { G.aEnviar = false; renderPainel(true); falha(e); }
  }

  async function calcular(f) {
    const ls = G.locais;
    const partidaL = ls[$("#nr-partida").value]; if (!partidaL) { toast("Escolhe o ponto de partida.", true); return; }
    const fimSel = $("#nr-fim").value;
    const encs = [...f.querySelectorAll('input[name="nr-enc"]:checked')].map((x) => G.encomendas[x.value]).filter(Boolean);
    const locs = [...f.querySelectorAll('input[name="nr-local"]:checked')].map((x) => ls[x.value]).filter((l) => l && l.id !== partidaL.id);
    const extras = $("#nr-extra").value.split("\n").map((x) => x.trim()).filter(Boolean);
    const paragens = encs.map((e) => ({ id: uidc(), tipo: "encomenda", encomenda_id: e.id, nome: e.cliente_nome, morada: e.morada, lat: e.lat, lng: e.lng, geo: e.morada_geo === e.morada }))
      .concat(locs.map((l) => ({ id: uidc(), tipo: "local", local_id: l.id, nome: l.nome, morada: l.morada, lat: l.lat, lng: l.lng, geo: l.lat != null })))
      .concat(extras.map((m) => ({ id: uidc(), tipo: "morada", nome: m.split(",")[0], morada: m, lat: null, lng: null })));
    if (!paragens.length) { toast("Escolhe pelo menos uma paragem.", true); return; }
    const dados = { data: $("#nr-data").value || ymd(new Date()), titulo: $("#nr-titulo").value.trim() };
    const fimL = fimSel !== "voltar" && fimSel !== "ultima" ? ls[fimSel] : null;
    try {
      const r = await montarRota({ partida: { nome: partidaL.nome, morada: partidaL.morada, lat: partidaL.lat, lng: partidaL.lng, local_id: partidaL.id },
        fim: fimL ? { nome: fimL.nome, morada: fimL.morada, lat: fimL.lat, lng: fimL.lng, local_id: fimL.id } : null, voltar: fimSel === "voltar", paragens, ...dados });
      const guardada = await api.log.rotas.criar(r);
      G.rotas[guardada.id] = guardada;
      for (const e of encs) if (["pronta", "em_preparacao", "nova"].includes(e.estado)) await gravarEnc(e.id, { rota_id: guardada.id, ...(e.estado === "pronta" ? { estado: "em_rota" } : {}) });
      G.aCalcular = null; fechar(); location.hash = "logistica-rota:" + guardada.id;
      toast("Rota calculada: " + guardada.paragens.length + " paragens, " + km(guardada.distancia_m));
    } catch (e) { G.aCalcular = null; renderPainel(true); render(); falha(e); }
  }

  // Localiza o que falta, ordena e devolve a rota pronta a guardar
  async function montarRota({ partida, fim, voltar, paragens, data, titulo }) {
    const progresso = (t) => { G.aCalcular = t; renderPainel(true); render(); };
    const aLocalizar = [partida, fim, ...paragens].filter((p) => p && p.lat == null && p.morada);
    let i = 0;
    for (const p of aLocalizar) {
      progresso("A procurar moradas no mapa… " + ++i + " de " + aLocalizar.length);
      const g = await localizar(p.morada);
      if (g) { p.lat = g.lat; p.lng = g.lng; p.aproximada = !!g.aproximada; guardarCoordenadas(p, g); }
    }
    if (partida.lat == null) throw new Error("Não encontrei a morada de partida no mapa. Corrige-a em Logística → Locais.");
    if (fim && fim.lat == null) throw new Error("Não encontrei a morada de fim no mapa. Corrige-a em Logística → Locais.");
    progresso("A calcular o trajeto mais curto…");
    const comLocal = paragens.filter((p) => p.lat != null), semLocal = paragens.filter((p) => p.lat == null);
    const r = await calcularRota(partida, comLocal, { fim, voltar });
    const ordenadas = r.ordem.map((k) => comLocal[k]).concat(semLocal).map(({ geo, ...p }) => ({ ...p, feito: !!p.feito }));
    return { data, titulo: titulo || tituloAuto(ordenadas, partida), partida, fim, voltar, paragens: ordenadas,
      distancia_m: r.distancia_m, duracao_s: r.duracao_s, geometria: r.geometria, responsavel_id: S.eu.id };
  }
  // "Coimbra, Lisboa e Vila Nova de Gaia": localidades das paragens, pela ordem da rota
  function tituloAuto(paragens, partida) {
    const loc = (m) => { const t = String(m || "").trim(); const cp = t.match(/\d{4}-\d{3}\s+([^,]+)$/); return (cp ? cp[1] : t.split(",").pop()).trim(); };
    const casa = loc(partida?.morada);
    const l = [...new Set(paragens.map((p) => loc(p.morada)).filter((x) => x && x !== casa && !/^\d/.test(x)))];
    if (!l.length) return "Entregas locais";
    const v = l.slice(0, 3); const txt = v.length > 1 ? v.slice(0, -1).join(", ") + " e " + v[v.length - 1] : v[0];
    return l.length > 3 ? txt + " e mais " + (l.length - 3) : txt;
  }
  function guardarCoordenadas(p, g) {
    // guarda para não voltar a procurar a mesma morada
    if (p.encomenda_id && G.encomendas[p.encomenda_id]) api.log.encomendas.atualizar(p.encomenda_id, { lat: g.lat, lng: g.lng, morada_geo: p.morada }).then((x) => { G.encomendas[x.id] = x; }).catch(() => {});
    if (p.local_id && G.locais[p.local_id]) api.log.locais.atualizar(p.local_id, { lat: g.lat, lng: g.lng }).then((x) => { G.locais[x.id] = x; }).catch(() => {});
  }

  async function recalcular(id) {
    const r = G.rotas[id]; if (!r) return;
    try {
      const nova = await montarRota({ partida: { ...r.partida }, fim: r.fim ? { ...r.fim } : null, voltar: r.voltar, paragens: r.paragens.map((p) => {
        const enc = p.encomenda_id ? G.encomendas[p.encomenda_id] : null, loc = p.local_id ? G.locais[p.local_id] : null;
        const fonte = enc || loc; const morada = fonte ? fonte.morada : p.morada;
        return { ...p, morada, lat: morada === p.morada ? p.lat : null, lng: morada === p.morada ? p.lng : null };
      }), data: r.data, titulo: r.titulo });
      const pendentes = nova.paragens.filter((p) => !p.feito), feitas = nova.paragens.filter((p) => p.feito);
      const g = await api.log.rotas.atualizar(id, { paragens: feitas.concat(pendentes), distancia_m: nova.distancia_m, duracao_s: nova.duracao_s, geometria: nova.geometria });
      G.rotas[id] = g; G.aCalcular = null; render(); toast("Rota recalculada");
    } catch (e) { G.aCalcular = null; render(); falha(e); }
  }

  async function marcarParagem(id, i) {
    const r = G.rotas[id]; if (!r) return;
    const paragens = r.paragens.map((p, k) => (k === i ? { ...p, feito: !p.feito, feito_em: !p.feito ? new Date().toISOString() : null } : p));
    const p = paragens[i];
    G.rotas[id] = { ...r, paragens, estado: r.estado === "planeada" ? "em_curso" : r.estado }; render();
    try {
      const todas = paragens.every((x) => x.feito);
      G.rotas[id] = await api.log.rotas.atualizar(id, { paragens, estado: todas ? "concluida" : r.estado === "planeada" ? "em_curso" : r.estado });
      if (p.encomenda_id && G.encomendas[p.encomenda_id]) {
        const e = G.encomendas[p.encomenda_id];
        if (p.feito && e.estado !== "entregue") await gravarEnc(e.id, { estado: "entregue" });
        else if (!p.feito && e.estado === "entregue") await gravarEnc(e.id, { estado: "em_rota" });
      }
      render();
      if (p.feito) toast(p.encomenda_id ? "Entregue · " + p.nome : "Paragem feita · " + p.nome);
      if (todas) toast("Rota concluída. Bom trabalho!");
    } catch (e) { G.rotas[id] = r; render(); falha(e); }
  }

  function clique(acao, el) {
    const id = el.dataset.id;
    switch (acao) {
      case "log-tab": G.tab = el.dataset.tab; if (S.param) { location.hash = "logistica"; } else render(); return true;
      case "enc-filtro": G.filtro = G.filtro === el.dataset.v && el.dataset.v !== "ativas" ? "ativas" : el.dataset.v; render(); return true;
      case "enc-nova": {
        G.nova = null; abrir({ tipo: "enc-nova", pre: el.dataset.cliente ? preDeCliente(el.dataset.cliente) : null });
        // a lista de clientes do CRM ajuda a preencher a morada
        if (podeCrm(S.eu) && S.crm?.estado === "por-carregar") Promise.resolve(crm().carregar()).then(() => { if (S.aberto?.tipo === "enc-nova") { guardarNova(); renderPainel(true); } });
        return true;
      }
      case "enc-abrir": abrir({ tipo: "encomenda", id }); return true;
      case "enc-estado": { const e = G.encomendas[id]; if (e) gravarEnc(id, { estado: el.dataset.v }).then((r) => r && toast(ref(r) + " · " + ESTADOS_ENC[r.estado])); return true; }
      case "enc-item": {
        const e = G.encomendas[S.aberto?.id]; if (!e) return true;
        const itens = e.itens.map((i) => (i.id === el.dataset.item ? { ...i, preparado: !i.preparado } : i));
        const campos = { itens };
        if (e.estado === "nova" && itens.some((i) => i.preparado)) campos.estado = "em_preparacao";
        gravarEnc(e.id, campos).then((r) => { if (r && r.itens.length && r.itens.every((i) => i.preparado) && r.estado === "em_preparacao") toast("Todos os artigos preparados. Marca a encomenda como pronta.", { acao: { rotulo: "Marcar pronta", fn: () => gravarEnc(r.id, { estado: "pronta" }) } }); });
        return true;
      }
      case "enc-item-apagar": { const e = G.encomendas[S.aberto?.id]; if (e) gravarEnc(e.id, { itens: e.itens.filter((i) => i.id !== el.dataset.item) }); return true; }
      case "enc-apagar": S.aberto = { ...S.aberto, confirmar: true }; renderPainel(true); return true;
      case "enc-apagar-nao": S.aberto = { ...S.aberto, confirmar: false }; renderPainel(true); return true;
      case "enc-apagar-sim": { const eid = S.aberto.id, antes = G.encomendas[eid]; delete G.encomendas[eid]; fechar(); render(); api.log.encomendas.apagar(eid).then(() => toast("Encomenda eliminada")).catch((e) => { G.encomendas[eid] = antes; render(); falha(e); }); return true; }
      case "enc-fatura-ver": { const e = G.encomendas[S.aberto?.id]; if (e?.fatura_ficheiro) api.log.urlFatura(e.fatura_ficheiro).then((u) => { const a = document.createElement("a"); a.href = u; a.target = "_blank"; a.rel = "noopener"; a.click(); }).catch(falha); return true; }
      case "ne-item": guardarNova(); G.nova.itens.push({ id: uidc(), descricao: "", qtd: 1 }); renderPainel(true); setTimeout(() => { const l = document.querySelectorAll('[data-novo-item][data-campo="descricao"]'); l[l.length - 1]?.focus(); }, 0); return true;
      case "ne-item-apagar": guardarNova(); G.nova.itens = G.nova.itens.filter((i) => i.id !== el.dataset.item); renderPainel(true); return true;
      case "rota-nova": G.aCalcular = null; abrir({ tipo: "rota-nova", pre: el.dataset.enc ? [el.dataset.enc] : [] }); return true;
      case "rota-estado": { const r = G.rotas[id]; if (r) api.log.rotas.atualizar(id, { estado: el.dataset.v }).then((x) => { G.rotas[id] = x; render(); toast(el.dataset.v === "em_curso" ? "Rota começada. Boa viagem!" : "Rota concluída"); }).catch(falha); return true; }
      case "rota-recalcular": recalcular(id); return true;
      case "rota-apagar": G.confirmarRota = id; render(); return true;
      case "rota-apagar-nao": G.confirmarRota = null; render(); return true;
      case "rota-apagar-sim": {
        const r = G.rotas[id]; G.confirmarRota = null;
        api.log.rotas.apagar(id).then(async () => {
          delete G.rotas[id];
          for (const p of r.paragens) { const e = p.encomenda_id && G.encomendas[p.encomenda_id]; if (e && e.estado === "em_rota") await gravarEnc(e.id, { estado: "pronta", rota_id: null }); }
          location.hash = "logistica"; G.tab = "rotas"; toast("Rota eliminada");
        }).catch(falha);
        return true;
      }
      case "par-feito": marcarParagem(id, +el.dataset.i); return true;
      case "local-novo": abrir({ tipo: "local-novo" }); return true;
      case "local-localizar": {
        const l = G.locais[id]; if (!l) return true;
        el.disabled = true; el.textContent = "A procurar…";
        localizar(l.morada).then(async (g) => {
          if (!g) { toast("Não encontrei esta morada. Junta o código postal e a localidade.", true); render(); return; }
          G.locais[id] = await api.log.locais.atualizar(id, { lat: g.lat, lng: g.lng }); render(); toast(g.aproximada ? "Localizado de forma aproximada (pela localidade)" : "Localizado no mapa");
        }).catch((e) => { render(); falha(e); });
        return true;
      }
      case "local-apagar": { const l = G.locais[id]; delete G.locais[id]; render(); api.log.locais.atualizar(id, { ativo: false }).then(() => toast("Local retirado", { acao: { rotulo: "Anular", fn: () => api.log.locais.atualizar(id, { ativo: true }).then((x) => { G.locais[id] = x; render(); }) } })).catch((e) => { G.locais[id] = l; render(); falha(e); }); return true; }
    }
    return false;
  }
  function preDeCliente(cid) {
    const c = S.crm?.clientes?.[cid]; if (!c) return null;
    const local = [c.codigo_postal, c.freguesia || c.concelho].filter(Boolean).join(" ");
    return { cliente_nome: c.nome, contacto: c.telefone || "", morada: [c.morada, c.morada && local && c.morada.includes(c.codigo_postal || "§") ? "" : local].filter(Boolean).join(", ") };
  }
  function guardarNova() {
    if (!G.nova) return;
    const v = (id) => document.getElementById(id)?.value;
    Object.assign(G.nova, { tipo: v("ne-tipo") ?? G.nova.tipo, prioridade: v("ne-prio") ?? G.nova.prioridade, cliente_nome: v("ne-cliente") ?? G.nova.cliente_nome, contacto: v("ne-contacto") ?? G.nova.contacto,
      data_prevista: v("ne-data") ?? G.nova.data_prevista, morada: v("ne-morada") ?? G.nova.morada, fatura_numero: v("ne-fatnum") ?? G.nova.fatura_numero, notas: v("ne-notas") ?? G.nova.notas });
  }

  const timers = {};
  function escrever(e) {
    const t = e.target;
    if (t.id === "enc-q") { G.q = t.value; const pos = t.selectionStart; render(); const n = $("#enc-q"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } return true; }
    if (t.dataset.novoItem && G.nova) { const it = G.nova.itens.find((x) => x.id === t.dataset.novoItem); if (it) it[t.dataset.campo] = t.value; return true; }
    if (t.id === "ne-cliente") {
      guardarNova();
      const c = clientesCrm().find((x) => x.nome === t.value);
      if (c) { const p = preDeCliente(c.id); const m = $("#ne-morada"), k = $("#ne-contacto"); if (m && !m.value) m.value = p.morada; if (k && !k.value) k.value = p.contacto || ""; guardarNova(); }
      return true;
    }
    if (S.aberto?.tipo === "encomenda") {
      const e = G.encomendas[S.aberto.id]; if (!e) return false;
      const campos = { "enc-cliente": "cliente_nome", "enc-contacto": "contacto", "enc-morada": "morada", "enc-fatnum": "fatura_numero", "enc-notas": "notas" };
      if (campos[t.id]) { clearTimeout(timers[t.id]); timers[t.id] = setTimeout(() => gravarEnc(e.id, { [campos[t.id]]: t.value }), 900); return true; }
      if (t.dataset.item && t.dataset.campo) {
        clearTimeout(timers[t.id]);
        timers[t.id] = setTimeout(() => { const atual = G.encomendas[e.id]; gravarEnc(e.id, { itens: atual.itens.map((i) => (i.id === t.dataset.item ? { ...i, [t.dataset.campo]: t.dataset.campo === "qtd" ? Math.max(0, +t.value || 0) : t.value } : i)) }); }, 900);
        return true;
      }
    }
    if (t.dataset.local && t.dataset.campo) {
      const lid = t.dataset.local;
      clearTimeout(timers[t.id]);
      timers[t.id] = setTimeout(() => api.log.locais.atualizar(lid, { [t.dataset.campo]: t.value.trim(), ...(t.dataset.campo === "morada" ? { lat: null, lng: null } : {}) }).then((x) => { G.locais[lid] = x; if (document.activeElement !== t) render(); }).catch(falha), 1000);
      return true;
    }
    return false;
  }
  function mudar(e) {
    const t = e.target;
    if (t.id === "enc-minhas") { G.minhas = t.checked; render(); return true; }
    if (S.aberto?.tipo === "encomenda") {
      const enc = G.encomendas[S.aberto.id]; if (!enc) return false;
      const m = { "enc-tipo": "tipo", "enc-prio": "prioridade", "enc-data": "data_prevista", "enc-resp": "responsavel_id" };
      if (m[t.id]) { gravarEnc(enc.id, { [m[t.id]]: t.value || null }); return true; }
      if (t.id === "enc-fatura" && t.files?.[0]) {
        const f = t.files[0];
        if (f.size > 10 * 1024 * 1024) { toast("A fatura tem mais de 10 MB.", true); return true; }
        toast("A anexar a fatura…");
        api.log.enviarFatura(enc.id, f).then((c) => gravarEnc(enc.id, { fatura_ficheiro: c, fatura_nome: f.name })).then((r) => r && toast("Fatura anexada")).catch(falha);
        return true;
      }
    }
    return false;
  }
  function tecla(e) {
    const t = e.target;
    if (t.id === "enc-novoitem" && e.key === "Enter" && t.value.trim()) {
      e.preventDefault();
      const enc = G.encomendas[S.aberto?.id]; if (!enc) return true;
      const it = lerItemTexto(t.value); t.value = "";
      gravarEnc(enc.id, { itens: enc.itens.concat([{ id: uidc(), ...it, preparado: false }]), ...(enc.estado === "pronta" ? { estado: "em_preparacao" } : {}) }).then(() => { renderPainel(true); $("#enc-novoitem")?.focus(); });
      return true;
    }
    return false;
  }
  async function submeter(f) {
    if (f.id === "form-enc") { guardarNova(); await criarEncomenda(f); return true; }
    if (f.id === "form-rota") { await calcular(f); return true; }
    if (f.id === "form-local") {
      const nome = $("#nl-nome").value.trim(); if (!nome) { toast("Dá um nome ao local.", true); return true; }
      try { const r = await api.log.locais.criar({ nome, tipo: $("#nl-tipo").value, morada: $("#nl-morada").value.trim(), ordem: 50 }); G.locais[r.id] = r; fechar(); render(); toast("Local criado"); }
      catch (e) { falha(/duplicate|unique/i.test(e.message) ? new Error("Já existe um local com este nome.") : e); }
      return true;
    }
    return false;
  }
  function reiniciar() { if (desligar) { desligar(); desligar = null; } Object.assign(G, { estado: "por-carregar", locais: {}, encomendas: {}, rotas: {}, nova: null }); }
  const contagem = () => (podeTratar() ? porTratar().filter((e) => e.estado === "nova").length : 0);

  return { vista, painel, clique, escrever, mudar, tecla, submeter, carregar, blocoInicio, reiniciar, contagem, estado: () => G.estado };
}
