// Central 26 — Marketing: calendário de publicações das marcas, ideias e documentos (guiões, manuais…).
import { MARCA, MARCAS, MES, MES_L, DIA, ymd, normalizar, haQuanto, eGestor } from "./dados.js";

export const ESTADOS_MK = { ideia: "Ideia", planeado: "Planeado", em_producao: "Em produção", pronto: "Pronto", publicado: "Publicado", cancelado: "Cancelado" };
const TIPOS = ["Foto", "Vídeo", "Reel", "Storie", "Carrossel", "GIF", "Design", "Frase", "Live", "Anúncio"];
const PLATAFORMAS = ["Instagram", "Facebook", "TikTok", "YouTube", "LinkedIn", "Site", "WhatsApp"];
const n = (s) => normalizar(s).replace(/\s+/g, " ").trim();
const dataCurta = (s) => { if (!s) return ""; const [y, m, d] = s.split("-").map(Number); return d + " " + MES[m - 1] + (y !== new Date().getFullYear() ? " " + y : ""); };
const diaSemana = (s) => DIA[new Date(s + "T12:00:00").getDay()];

export const podeMarketing = (eu) => !!eu && (eGestor(eu) || eu.departamento_id === "marketing");

// Markdown simples (títulos, listas, negrito, itálico, ligações), sempre a partir de texto já escapado
export function markdown(txt, esc) {
  const linha = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>")
    .replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  let h = "", lista = 0;
  const fechar = (ate = 0) => { while (lista > ate) { h += "</ul>"; lista--; } };
  for (const bruta of String(txt || "").split("\n")) {
    const l = bruta.replace(/\t/g, "    ");
    const m = l.match(/^(\s*)[-*] (.*)$/);
    if (m) { const nivel = Math.floor(m[1].length / 4) + 1; while (lista < nivel) { h += "<ul>"; lista++; } fechar(nivel); h += "<li>" + linha(m[2]) + "</li>"; continue; }
    if (!l.trim()) { fechar(); continue; }
    if (/^\s{4,}\S/.test(l) && lista) { h += '<p class="md-sub">' + linha(l.trim()) + "</p>"; continue; }
    fechar();
    const t = l.match(/^(#{1,3}) (.*)$/);
    if (t) h += "<h" + (t[1].length + 2) + ">" + linha(t[2]) + "</h" + (t[1].length + 2) + ">";
    else if (/^-{3,}$/.test(l.trim())) h += "<hr>";
    else h += "<p>" + linha(l) + "</p>";
  }
  fechar();
  return h;
}

export function criarMarketing(ctx) {
  const { S, api, esc, I, toast, falha, render, agendarRender, renderPainel, abrir, fechar, nomeDe, ativos, $ } = ctx;
  const M = (S.mk = { estado: "por-carregar", pubs: {}, docs: {}, tab: "calendario", mes: ymd(new Date()).slice(0, 7), fMarca: "", fEstado: "", q: "", docSel: null, docEditar: false, importacao: null, aImportar: false });
  let desligar = null;

  async function carregar() {
    if (M.estado === "a-carregar") return;
    M.estado = "a-carregar";
    try {
      if (!api.mk) throw new Error("A app foi atualizada a meio. Recarrega a página para terminar a atualização.");
      const d = await api.mk.carregar();
      M.pubs = Object.fromEntries(d.publicacoes.map((x) => [x.id, x]));
      M.docs = Object.fromEntries(d.documentos.map((x) => [x.id, x]));
      M.estado = "pronto";
      if (!desligar && api.mk.subscrever) desligar = api.mk.subscrever(aoMudar);
    } catch (e) { M.estado = /PGRST20|mk_publicacoes|Could not find/i.test(String(e?.message)) ? "falta-script" : "erro"; M.erro = e.message; }
    agendarRender();
    if (S.aberto?.tipo === "publicacao") renderPainel(true);
  }
  function aoMudar(t, ev, novo, antigo) {
    const m = t === "pub" ? M.pubs : M.docs;
    if (ev === "DELETE") delete m[antigo.id]; else m[novo.id] = novo;
    agendarRender();
    if (S.aberto?.tipo === "publicacao") renderPainel();
  }
  const pode = () => podeMarketing(S.eu);
  const pubs = () => Object.values(M.pubs);
  const hoje = () => ymd(new Date());
  const ativa = (p) => !["publicado", "cancelado"].includes(p.estado);
  const atrasada = (p) => p.data && p.data < hoje() && ativa(p);
  const filtradas = () => pubs().filter((p) => (!M.fMarca || p.marca === M.fMarca) && (!M.fEstado || p.estado === M.fEstado) && (!M.q || n([p.titulo, p.copy, p.notas, p.tipo].join(" ")).includes(n(M.q))));
  const pessoasMk = () => ativos().filter((p) => p.departamento_id === "marketing" || eGestor(p));

  async function gravar(id, campos, silencioso) {
    const antes = M.pubs[id]; if (!antes) return null;
    M.pubs[id] = { ...antes, ...campos }; agendarRender();
    try { const r = await api.mk.pub.atualizar(id, campos); M.pubs[id] = r; agendarRender(); if (!silencioso) renderPainel(true); return r; }
    catch (e) { M.pubs[id] = antes; agendarRender(); renderPainel(true); falha(e); return null; }
  }

  /* ============================== Vistas ============================== */
  const pill = (e) => '<span class="est-mk m-' + esc(e) + '">' + esc(ESTADOS_MK[e] || e) + "</span>";
  function vista(param) {
    if (M.estado === "por-carregar") carregar();
    if (param !== M.ultimoParam) { M.ultimoParam = param; if (["calendario", "lista", "ideias", "documentos", "importar"].includes(param)) M.tab = param; }
    let h = '<div class="cab"><div><div class="eyebrow neutro">Departamento de Marketing</div><h1>Marketing</h1><p class="sub-cab">Calendário de publicações das marcas, ideias e documentos.</p></div>' +
      (M.estado === "pronto" ? '<div class="acts"><button class="btn sec" data-acao="mk-nova" data-estado="ideia">' + I.plus + 'Ideia</button><button class="btn pri" data-acao="mk-nova">' + I.plus + "Nova publicação</button></div>" : "") + "</div>";
    const ideias = pubs().filter((p) => p.estado === "ideia" || (!p.data && ativa(p))).length;
    const tabs = [["calendario", "Calendário"], ["lista", "Próximas"], ["ideias", "Ideias", ideias], ["documentos", "Documentos", Object.keys(M.docs).length], ["importar", "Importar"]];
    h += '<div class="tabs" role="tablist">' + tabs.map(([k, r, c]) => '<button class="tab" role="tab" data-acao="mk-tab" data-tab="' + k + '" aria-selected="' + (M.tab === k) + '">' + r + (c != null ? '<span class="n">' + c + "</span>" : "") + "</button>").join("") + "</div>";
    if (M.estado === "falta-script") return h + '<div class="vazio"><h3>Falta instalar o Marketing na base de dados</h3><p>No Supabase, abre o SQL Editor, cola o ficheiro <b>supabase/10-marketing.sql</b> do GitHub e carrega em Run. Depois recarrega esta página.</p></div>';
    if (M.estado === "erro") return h + '<div class="aviso erro">Não foi possível abrir o Marketing: ' + esc(M.erro || "") + "</div>";
    if (M.estado !== "pronto") return h + '<div class="tabela"><div class="esqueleto"><i style="width:50%"></i></div></div>';
    if (M.tab === "importar") return h + vistaImportar();
    if (M.tab === "documentos") return h + vistaDocumentos();
    if (!pubs().length) return h + '<div class="vazio"><h3>O calendário está vazio</h3><p>Importa o ficheiro com o calendário do Notion ou cria a primeira publicação.</p><div class="acts"><button class="btn pri" data-acao="mk-tab" data-tab="importar">Importar do Notion</button></div></div>';
    h += filtros();
    if (M.tab === "lista") return h + vistaLista();
    if (M.tab === "ideias") return h + vistaIdeias();
    return h + vistaCalendario();
  }
  function filtros() {
    return '<div class="barra"><div class="ferr ferr-aud"><div class="chips-marca" role="group" aria-label="Marca"><button class="chip-m' + (!M.fMarca ? " on" : "") + '" data-acao="mk-fmarca" data-v="">Todas</button>' +
      MARCAS.filter((m) => m.id !== "grupo").map((m) => '<button class="chip-m' + (M.fMarca === m.id ? " on" : "") + '" data-acao="mk-fmarca" data-v="' + m.id + '" data-marca="' + m.id + '"><i></i>' + esc(m.curto) + "</button>").join("") + "</div>" +
      '<label class="sr" for="mk-fest">Estado</label><select id="mk-fest" class="sel"><option value="">Todos os estados</option>' + Object.entries(ESTADOS_MK).map(([k, r]) => '<option value="' + k + '"' + (M.fEstado === k ? " selected" : "") + ">" + r + "</option>").join("") + "</select>" +
      '<label class="pesq">' + I.lupa + '<span class="sr">Pesquisar</span><input id="mk-q" type="search" placeholder="Título ou texto…" value="' + esc(M.q) + '"></label></div></div>';
  }

  function vistaCalendario() {
    const [y, m] = M.mes.split("-").map(Number), primeiro = new Date(y, m - 1, 1), dias = new Date(y, m, 0).getDate(), hj = hoje();
    const desloc = (primeiro.getDay() + 6) % 7;
    const doMes = filtradas().filter((p) => p.data && p.data.startsWith(M.mes) && p.estado !== "cancelado");
    const porDia = {}; doMes.forEach((p) => (porDia[p.data] = porDia[p.data] || []).push(p));
    const estreito = window.innerWidth <= 820;
    const diaSel = M.diaSel && M.diaSel.startsWith(M.mes) ? M.diaSel : estreito && hj.startsWith(M.mes) ? hj : null;
    const ant = ymd(new Date(y, m - 2, 1)).slice(0, 7), seg = ymd(new Date(y, m, 1)).slice(0, 7);
    let h = '<div class="ag-nav mk-nav"><button class="ib" data-acao="mk-mes" data-v="' + ant + '" aria-label="Mês anterior">' + I.seta + '</button><b>' + MES_L[m - 1].replace(/^./, (c) => c.toUpperCase()) + " " + y + '</b><button class="ib" data-acao="mk-mes" data-v="' + seg + '" aria-label="Mês seguinte">' + I.seta + '</button>' +
      (M.mes !== hj.slice(0, 7) ? '<button class="btn sec" data-acao="mk-mes" data-v="' + hj.slice(0, 7) + '">Hoje</button>' : "") +
      '<span class="muted mk-resumo">' + doMes.length + (doMes.length === 1 ? " publicação" : " publicações") + " · " + doMes.filter((p) => p.estado === "publicado").length + " publicadas</span></div>";
    h += '<div class="mk-grelha" role="grid"><div class="mk-sem" role="row">' + ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map((d) => '<span role="columnheader">' + d + "</span>").join("") + "</div><div class=\"mk-dias\">";
    for (let i = 0; i < desloc; i++) h += '<div class="mk-dia fora" aria-hidden="true"></div>';
    for (let d = 1; d <= dias; d++) {
      const dt = M.mes + "-" + String(d).padStart(2, "0"), l = (porDia[dt] || []).sort((a, b) => String(a.hora).localeCompare(String(b.hora)));
      h += '<div class="mk-dia' + (dt === hj ? " hoje" : "") + (dt === diaSel ? " sel" : "") + '" role="gridcell" data-acao="mk-dia" data-v="' + dt + '"><div class="mk-dia-cab"><span>' + d + '</span><button class="mk-mais" data-acao="mk-nova" data-data="' + dt + '" aria-label="Nova publicação a ' + d + '">+</button></div>' +
        l.slice(0, 4).map((p) => '<button class="mk-chip e-' + p.estado + (atrasada(p) ? " atr" : "") + '" data-marca="' + esc(p.marca) + '" data-acao="mk-abrir" data-id="' + p.id + '" title="' + esc(MARCA[p.marca]?.nome + " · " + p.titulo + " · " + ESTADOS_MK[p.estado]) + '"><i></i><span>' + esc(p.titulo) + "</span></button>").join("") +
        (l.length > 4 ? '<button class="mk-chip mais" data-acao="mk-dia" data-v="' + dt + '">+' + (l.length - 4) + " mais</button>" : "") + "</div>";
    }
    for (let i = (desloc + dias) % 7; i && i < 7; i++) h += '<div class="mk-dia fora" aria-hidden="true"></div>';
    h += "</div></div>";
    if (diaSel) {
      const l = (porDia[diaSel] || []).sort((a, b) => String(a.hora).localeCompare(String(b.hora)));
      h += '<section class="cartao-sec mk-diasel"><h3>' + esc(diaSemana(diaSel).replace(/^./, (c) => c.toUpperCase())) + ", " + esc(dataCurta(diaSel)) + ' <span class="mono muted">' + l.length + "</span></h3>" +
        (l.length ? '<div class="aud-lista">' + l.map(linhaPub).join("") + "</div>" : '<p class="muted">Nada marcado para este dia.</p>') +
        '<div class="acts"><button class="btn sec" data-acao="mk-nova" data-data="' + diaSel + '">' + I.plus + "Publicação neste dia</button></div></section>";
    }
    h += '<div class="legenda-mapa mk-leg"><span><i class="mk-pt e-planeado"></i>Planeado</span><span><i class="mk-pt e-em_producao"></i>Em produção</span><span><i class="mk-pt e-pronto"></i>Pronto</span><span><i class="mk-pt e-publicado"></i>Publicado</span><span><i class="mk-pt atr"></i>Atrasado</span></div>';
    return h;
  }
  function linhaPub(p) {
    const at = atrasada(p);
    return '<button class="op-linha mk-linha" data-acao="mk-abrir" data-id="' + p.id + '" data-marca="' + esc(p.marca) + '"><span class="aud-t"><b>' + esc(p.titulo) + "</b><small>" +
      ['<span class="tag-marca" data-marca="' + esc(p.marca) + '">' + esc(MARCA[p.marca]?.nome || "") + "</span>", esc(p.tipo), (p.plataformas || []).join(", "), p.link ? "com ficheiros" : ""].filter(Boolean).join(" · ") + "</small></span>" +
      '<span class="op-c">' + (p.copy ? "<small>texto pronto</small>" : "") + '</span><span class="aud-m">' + pill(p.estado) + '</span><span class="aud-r">' +
      (p.data ? '<small class="' + (at ? "at" : "") + '">' + (at ? "Atrasada · " : "") + esc(diaSemana(p.data).split("-")[0]) + ", " + esc(dataCurta(p.data)) + (p.hora ? " · " + esc(p.hora) : "") + "</small>" : '<small class="muted">Sem data</small>') +
      (p.responsavel_id ? "<small>" + esc((nomeDe(p.responsavel_id) || "").split(" ")[0]) + "</small>" : "") + "</span></button>";
  }
  function vistaLista() {
    const hj = hoje(), lim = ymd(new Date(Date.now() + 30 * 864e5)), l = filtradas();
    const atr = l.filter(atrasada).sort((a, b) => a.data.localeCompare(b.data));
    const prox = l.filter((p) => p.data && p.data >= hj && p.data <= lim && p.estado !== "cancelado").sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
    let h = "";
    if (atr.length) h += '<section class="cartao-sec"><h3>Atrasadas <span class="mono muted">' + atr.length + "</span></h3><p>Tinham data passada e ainda não estão marcadas como publicadas.</p><div class=\"aud-lista\">" + atr.map(linhaPub).join("") + "</div></section>";
    h += '<section class="cartao-sec"><h3>Próximos 30 dias <span class="mono muted">' + prox.length + "</span></h3>" + (prox.length ? '<div class="aud-lista">' + prox.map(linhaPub).join("") + "</div>" : '<p class="muted">Nada planeado para os próximos 30 dias.</p>') + "</section>";
    return h;
  }
  function vistaIdeias() {
    const l = filtradas().filter((p) => p.estado === "ideia" || (!p.data && ativa(p))).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
    if (!l.length) return '<div class="vazio"><h3>Sem ideias guardadas</h3><p>Guarda aqui as ideias de publicações. Quando houver data, passam para o calendário.</p></div>';
    return '<div class="mk-ideias">' + l.map((p) => '<button class="mk-ideia" data-marca="' + esc(p.marca) + '" data-acao="mk-abrir" data-id="' + p.id + '"><span class="tag-marca" data-marca="' + esc(p.marca) + '">' + esc(MARCA[p.marca]?.nome || "") + "</span><b>" + esc(p.titulo) + "</b>" +
      (p.notas || p.copy ? "<small>" + esc((p.notas || p.copy).slice(0, 140)) + ((p.notas || p.copy).length > 140 ? "…" : "") + "</small>" : "") + "<span class=\"mk-ideia-pe\">" + esc(p.tipo || "") + (p.inspiracao ? " · tem inspiração" : "") + "</span></button>").join("") + "</div>";
  }

  function vistaDocumentos() {
    const l = Object.values(M.docs).sort((a, b) => a.titulo.localeCompare(b.titulo, "pt"));
    if (M.docSel && !M.docs[M.docSel]) M.docSel = null;
    if (!M.docSel && l.length && window.innerWidth > 820) M.docSel = l[0].id;
    const d = M.docSel && M.docs[M.docSel];
    let h = '<div class="mk-docs' + (d ? " com-doc" : "") + '"><nav class="mk-doc-lista" aria-label="Documentos"><button class="btn sec" data-acao="mk-doc-novo">' + I.plus + "Novo documento</button>" +
      l.map((x) => '<button class="mk-doc-item' + (x.id === M.docSel ? " on" : "") + '" data-acao="mk-doc" data-id="' + x.id + '" data-marca="' + esc(x.marca) + '"><i></i><span>' + esc(x.titulo) + "<small>" + esc(MARCA[x.marca]?.nome || "") + "</small></span></button>").join("") +
      (l.length ? "" : '<p class="muted">Ainda não há documentos.</p>') + "</nav>";
    if (d) {
      h += '<article class="cartao-sec mk-doc" data-marca="' + esc(d.marca) + '"><div class="mk-doc-topo"><button class="ib mk-voltar" data-acao="mk-doc" data-id="">‹ Documentos</button><span class="acts">' +
        (M.docEditar ? '<button class="btn pri" data-acao="mk-doc-guardar">Guardar</button><button class="btn sec" data-acao="mk-doc-editar">Cancelar</button>' : '<button class="btn sec" data-acao="mk-doc-editar">Editar</button>') +
        '<button class="ib perigo" data-acao="mk-doc-apagar" aria-label="Eliminar documento">' + I.lixo + "</button></span></div>" +
        (M.docConfirmar ? '<div class="aviso erro aviso-acao"><span>Eliminar «' + esc(d.titulo) + "»?</span><span class=\"acts\"><button class=\"btn sec\" data-acao=\"mk-doc-apagar-nao\">Manter</button><button class=\"btn perigo\" data-acao=\"mk-doc-apagar-sim\">Eliminar</button></span></div>" : "") +
        (M.docEditar ? '<label class="sr" for="mk-doc-tit">Título</label><input id="mk-doc-tit" class="mk-doc-tit" value="' + esc(d.titulo) + '"><label class="sr" for="mk-doc-marca">Marca</label><select id="mk-doc-marca" class="sel">' + MARCAS.map((m) => '<option value="' + m.id + '"' + (m.id === d.marca ? " selected" : "") + ">" + esc(m.nome) + "</option>").join("") + "</select>" +
          '<label class="sr" for="mk-doc-txt">Conteúdo</label><textarea id="mk-doc-txt" class="notas mk-doc-txt">' + esc(d.conteudo) + '</textarea><p class="nota-tab">Podes usar **negrito**, *itálico*, listas com «- » e títulos com «# ».</p>'
          : "<h2>" + esc(d.titulo) + '</h2><div class="md">' + (markdown(d.conteudo, esc) || '<p class="muted">Documento vazio.</p>') + "</div>") +
        '<p class="nota-tab">' + (d.atualizado_por ? "Alterado por " + esc(nomeDe(d.atualizado_por) || "—") + " " + esc(haQuanto(d.atualizado_em)) : "") + "</p></article>";
    }
    return h + "</div>";
  }

  /* ---------- Importar ---------- */
  function vistaImportar() {
    const imp = M.importacao;
    let h = '<section class="cartao-sec"><h3>Importar do Notion</h3><p>Escolhe o ficheiro <b>central26-marketing-notion.json</b> (preparado a partir da exportação do Notion). Traz o calendário de publicações das marcas, as ideias do planeamento, as frases para vídeos, os documentos (guiões, datas, aniversários) e as listas de tarefas da Organização.</p>' +
      "<p>Voltar a importar não duplica nada: o que já existe fica como está.</p>" +
      '<div class="acts"><label class="btn pri" for="mk-ficheiro">' + I.plus + 'Escolher ficheiro</label><input id="mk-ficheiro" type="file" accept=".json,application/json" hidden></div></section>';
    if (imp?.erro) h += '<div class="aviso erro">' + esc(imp.erro) + "</div>";
    if (imp?.dados) {
      const d = imp.dados, ja = new Set(pubs().map((p) => p.origem_id).filter(Boolean));
      const novas = d.publicacoes.filter((p) => !ja.has(p.origem_id));
      const porMarca = {}; novas.forEach((p) => (porMarca[p.marca] = (porMarca[p.marca] || 0) + 1));
      h += '<section class="cartao-sec"><h3>' + esc(imp.nome) + '</h3><ul class="sem-tarefas">' +
        "<li><b>" + novas.length + "</b> " + (novas.length === 1 ? "publicação ou ideia nova" : "publicações e ideias novas") + (novas.length ? " (" + Object.entries(porMarca).map(([k, v]) => esc(MARCA[k]?.nome || k) + " " + v).join(", ") + ")" : "") + (d.publicacoes.length - novas.length ? " · " + (d.publicacoes.length - novas.length) + " já existem" : "") + "</li>" +
        "<li><b>" + d.documentos.length + "</b> documentos: " + esc(d.documentos.map((x) => x.titulo).join(", ")) + "</li>" +
        "<li><b>" + d.tarefas.length + "</b> tarefas para o departamento de Marketing (" + d.tarefas.filter((t) => t.estado === "em_curso").length + " em curso, " + d.tarefas.filter((t) => t.estado === "concluido").length + " concluídas)</li>" +
        "<li>As publicações com data já passada entram como «Publicado»; as futuras como «Planeado».</li></ul>" +
        '<div class="acts"><button class="btn pri" data-acao="mk-importar"' + (M.aImportar ? " disabled" : "") + ">" + (M.aImportar ? "A importar…" : "Importar") + '</button><button class="btn sec" data-acao="mk-imp-cancelar">Cancelar</button></div></section>';
    }
    return h;
  }
  async function lerFicheiro(f) {
    M.importacao = { nome: f.name };
    try {
      const d = JSON.parse(await f.text());
      if (d.formato !== "central26-marketing" || !Array.isArray(d.publicacoes)) throw new Error("Este ficheiro não é a exportação do Marketing para a Central 26.");
      d.documentos = d.documentos || []; d.tarefas = d.tarefas || [];
      M.importacao.dados = d;
    } catch (e) { M.importacao.erro = e instanceof SyntaxError ? "O ficheiro não é um JSON válido." : e.message; }
    render();
  }
  async function importar() {
    const d = M.importacao?.dados; if (!d) return;
    M.aImportar = true; render();
    try {
      const r = await api.mk.importar({ publicacoes: d.publicacoes, documentos: d.documentos });
      let nt = 0;
      if (d.tarefas.length) {
        const lista = d.tarefas.map((t) => ({ modelo: t.modelo, titulo: t.titulo, marca: t.marca || "grupo", freq: "unica", prioridade: "media", notas: t.notas || "", checklist: [], checklist_periodo: "", prazo: null,
          departamento_id: "marketing", responsavel_id: null, estado: t.estado || "por_fazer", estado_periodo: "unica" }));
        try { const x = await api.tarefas.criarVarias(lista); (x || []).forEach((t) => { S.tarefas[t.id] = t; }); nt = x?.length ?? lista.length; }
        catch (e) { toast("O calendário entrou, mas as tarefas não: " + e.message, true); }
      }
      M.aImportar = false; M.importacao = null; M.estado = "por-carregar"; await carregar(); M.tab = "calendario";
      if (S.rota === "marketing" && S.param) location.hash = "marketing"; else render();
      toast(r.publicacoes + " publicações, " + r.documentos + " documentos e " + nt + " tarefas importadas");
    } catch (e) { M.aImportar = false; render(); falha(e); }
  }

  /* ============================== Painéis ============================== */
  function painel(a) {
    if (a.tipo === "mk-nova") return painelNova(a);
    const p = M.pubs[a.id];
    const mold = (c, pe) => '<div class="veu" data-acao="fechar"></div><aside class="painel largo" role="dialog" aria-label="Publicação" data-marca="' + esc(p?.marca || "grupo") + '"><div class="p-scroll">' + c + "</div>" + (pe ? '<div class="p-pe">' + pe + "</div>" : "") + "</aside>";
    if (!p) return mold('<div class="p-topo"><span class="migalha">Marketing</span><button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + "</button></div>" + (M.estado === "pronto" ? '<div class="vazio"><h3>Já não existe</h3><p>Foi eliminada ou não tens acesso.</p></div>' : '<div class="esqueleto"><i style="width:60%"></i></div>'));
    let h = '<div class="p-topo"><span class="migalha"><i></i>Marketing / ' + esc(MARCA[p.marca]?.nome || "") + '</span><span class="acts"><button class="ib perigo" data-acao="mk-apagar">' + I.lixo + 'Eliminar</button><button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + "</button></span></div>";
    if (a.confirmar) h += '<div class="aviso erro aviso-acao"><span>Eliminar «' + esc(p.titulo) + "»? Se não vai sair, podes marcá-la como «Cancelado».</span><span class=\"acts\"><button class=\"btn sec\" data-acao=\"mk-apagar-nao\">Manter</button><button class=\"btn perigo\" data-acao=\"mk-apagar-sim\">Eliminar</button></span></div>";
    h += '<label class="sr" for="mp-titulo">Título</label><textarea id="mp-titulo" class="p-titulo" rows="1">' + esc(p.titulo) + "</textarea>";
    h += '<div class="chips">' + pill(p.estado) + (atrasada(p) ? '<span class="pill-at">Atrasada</span>' : "") + (p.data ? "<span>" + esc(diaSemana(p.data)) + ", " + esc(dataCurta(p.data)) + (p.hora ? " · " + esc(p.hora) : "") + "</span>" : "") + "</div>";
    h += '<div class="passos" role="group" aria-label="Estado">' + Object.entries(ESTADOS_MK).filter(([k]) => k !== "cancelado").map(([k, r]) => '<button data-acao="mk-estado" data-v="' + k + '" aria-pressed="' + (p.estado === k) + '">' + r + "</button>").join("") + "</div>";
    const sel = (id, rot, v, ops) => '<label for="' + id + '">' + rot + '</label><select id="' + id + '">' + ops.map(([k, r]) => '<option value="' + esc(k) + '"' + (String(v ?? "") === String(k) ? " selected" : "") + ">" + esc(r) + "</option>").join("") + "</select>";
    h += '<div class="props">' + sel("mp-marca", "Marca", p.marca, MARCAS.map((m) => [m.id, m.nome])) +
      '<label for="mp-data">Data</label><input id="mp-data" type="date" value="' + esc(p.data || "") + '"><label for="mp-hora">Hora</label><input id="mp-hora" value="' + esc(p.hora) + '" placeholder="Ex.: 18h00">' +
      sel("mp-tipo", "Tipo", p.tipo, [["", "—"]].concat(TIPOS.concat(TIPOS.includes(p.tipo) || !p.tipo ? [] : [p.tipo]).map((t) => [t, t]))) +
      sel("mp-resp", "Responsável", p.responsavel_id || "", [["", "Sem responsável"]].concat(pessoasMk().map((x) => [x.id, x.nome]))) +
      '<label for="mp-link">Ficheiros (Drive)</label><input id="mp-link" type="url" value="' + esc(p.link) + '" placeholder="Ligação da pasta no Drive">' +
      (p.link ? '<span class="ajuda"><a href="' + esc(/^https?:/i.test(p.link) ? p.link : "https://" + p.link) + '" target="_blank" rel="noopener">Abrir a pasta</a></span>' : "") + "</div>";
    h += '<section class="p-sec"><h3>Plataformas</h3><div class="chips-sel">' + PLATAFORMAS.map((x) => '<label class="chk-txt"><input type="checkbox" data-mk-plat="' + esc(x) + '"' + ((p.plataformas || []).includes(x) ? " checked" : "") + "> " + esc(x) + "</label>").join("") + "</div></section>";
    h += '<section class="p-sec"><h3>Texto da publicação <span class="mono muted" id="mp-conta">' + (p.copy || "").length + ' caracteres</span></h3><textarea id="mp-copy" class="notas mk-copy" placeholder="Legenda, hashtags, chamada para a ação…">' + esc(p.copy) + '</textarea><div class="acts"><button class="btn sec" data-acao="mk-copiar">' + I.copiar + 'Copiar texto</button><button class="btn sec btn-ia" data-acao="ia-pub">' + I.ia + "Escrever com o assistente</button></div></section>";
    h += '<section class="p-sec"><h3>Notas e ideia</h3><textarea id="mp-notas" class="notas" placeholder="Descrição da ideia, espaço, quem aparece…">' + esc(p.notas) + "</textarea></section>";
    h += '<section class="p-sec"><h3>Inspiração</h3><input id="mp-insp" class="inp-rel" value="' + esc(p.inspiracao) + '" placeholder="Ligações de referência (Instagram, Pinterest…)">' +
      (p.inspiracao ? '<div class="chips">' + p.inspiracao.split(/[,\s]+/).filter((u) => /^https?:/.test(u)).map((u) => '<a class="c-link" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40)) + "</a>").join("") + "</div>" : "") + "</section>";
    if (p.estado !== "cancelado") h += '<div class="acts"><button class="btn perigo-sec" data-acao="mk-estado" data-v="cancelado">Cancelar a publicação</button></div>';
    return mold(h, "<span>" + (p.origem_id ? "Veio do Notion · " : "") + (p.atualizado_por ? "Alterada por " + esc(nomeDe(p.atualizado_por) || "—") + " " + esc(haQuanto(p.atualizado_em)) : "") + "</span>");
  }
  function painelNova(a) {
    const c = '<div class="p-topo"><span class="migalha"><i></i>Marketing</span><button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + '</button></div><h2 style="margin:0">' + (a.estado === "ideia" ? "Nova ideia" : "Nova publicação") + "</h2>" +
      '<form class="form" id="form-mk" novalidate><div class="campo"><label for="mn-titulo">Título</label><input id="mn-titulo" required autocomplete="off" placeholder="Ex.: Antes e depois da semana"></div>' +
      '<div class="campos-3"><div class="campo"><label for="mn-marca">Marca</label><select id="mn-marca">' + MARCAS.map((m) => '<option value="' + m.id + '"' + (m.id === (M.fMarca || "barbearia") ? " selected" : "") + ">" + esc(m.nome) + "</option>").join("") + "</select></div>" +
      '<div class="campo"><label for="mn-data">Data</label><input id="mn-data" type="date" value="' + esc(a.data || "") + '"></div>' +
      '<div class="campo"><label for="mn-tipo">Tipo</label><select id="mn-tipo"><option value="">—</option>' + TIPOS.map((t) => "<option>" + t + "</option>").join("") + "</select></div></div>" +
      '<div class="campo"><label for="mn-resp">Responsável</label><select id="mn-resp"><option value="">Sem responsável</option>' + pessoasMk().map((x) => '<option value="' + x.id + '"' + (x.id === S.eu.id ? " selected" : "") + ">" + esc(x.nome) + "</option>").join("") + "</select></div>" +
      '<div class="campo"><label for="mn-notas">' + (a.estado === "ideia" ? "Ideia" : "Notas") + '</label><textarea id="mn-notas" placeholder="Descrição, espaço, quem aparece, referências…"></textarea></div>' +
      '<input type="hidden" id="mn-estado" value="' + (a.estado || "") + '">' +
      '<div class="acts"><button class="btn pri" type="submit">' + (a.estado === "ideia" ? "Guardar ideia" : "Criar publicação") + '</button><button class="btn sec" type="button" data-acao="fechar">Cancelar</button></div></form>';
    return '<div class="veu" data-acao="fechar"></div><aside class="painel largo" role="dialog" aria-label="Nova publicação" data-marca="grupo"><div class="p-scroll">' + c + "</div></aside>";
  }

  /* ============================== Início ============================== */
  function blocoInicio() {
    if (!pode()) return "";
    if (M.estado === "por-carregar") carregar();
    if (M.estado !== "pronto") return "";
    const hj = hoje(), sem = ymd(new Date(Date.now() + 7 * 864e5));
    const l = pubs().filter((p) => (atrasada(p) || (p.data && p.data >= hj && p.data <= sem && ativa(p))) && (eGestor(S.eu) || !p.responsavel_id || p.responsavel_id === S.eu.id))
      .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
    if (!l.length) return "";
    return '<section class="cartao-sec"><h3>Publicações desta semana <span class="mono" style="color:var(--faint);font-weight:400">' + l.length + '</span> <a class="c-link" href="#marketing-lista" style="font-size:13px;margin-left:8px">Ver todas</a></h3><div class="aud-lista">' + l.slice(0, 5).map(linhaPub).join("") + "</div></section>";
  }
  const contagem = () => (M.estado !== "pronto" ? 0 : pubs().filter(atrasada).length);

  /* ============================== Ações ============================== */
  function clique(acao, el) {
    switch (acao) {
      case "mk-tab": M.tab = el.dataset.tab; if (S.rota === "marketing" && S.param) location.hash = "marketing"; else render(); return true;
      case "mk-fmarca": M.fMarca = el.dataset.v; render(); return true;
      case "mk-mes": M.mes = el.dataset.v; M.diaSel = null; render(); return true;
      case "mk-dia": M.diaSel = M.diaSel === el.dataset.v && window.innerWidth > 820 ? null : el.dataset.v; render(); return true;
      case "mk-abrir": abrir({ tipo: "publicacao", id: el.dataset.id }); return true;
      case "mk-nova": abrir({ tipo: "mk-nova", data: el.dataset.data || "", estado: el.dataset.estado || "" }); return true;
      case "mk-estado": { const p = M.pubs[S.aberto?.id]; if (p) gravar(p.id, { estado: el.dataset.v }).then((r) => r && toast(ESTADOS_MK[r.estado])); return true; }
      case "mk-copiar": { const t = $("#mp-copy"); if (t) navigator.clipboard?.writeText(t.value).then(() => toast("Texto copiado")).catch(() => { t.select(); toast("Seleciona e copia o texto"); }); return true; }
      case "mk-apagar": S.aberto = { ...S.aberto, confirmar: true }; renderPainel(true); return true;
      case "mk-apagar-nao": S.aberto = { ...S.aberto, confirmar: false }; renderPainel(true); return true;
      case "mk-apagar-sim": { const id = S.aberto.id, antes = M.pubs[id]; delete M.pubs[id]; fechar(); render(); api.mk.pub.apagar(id).then(() => toast("Publicação eliminada")).catch((e) => { M.pubs[id] = antes; render(); falha(e); }); return true; }
      case "mk-doc": M.docSel = el.dataset.id || null; M.docEditar = false; M.docConfirmar = false; render(); return true;
      case "mk-doc-editar": M.docEditar = !M.docEditar; render(); return true;
      case "mk-doc-guardar": {
        const d = M.docs[M.docSel]; if (!d) return true;
        const campos = { titulo: ($("#mk-doc-tit")?.value || "").trim() || d.titulo, marca: $("#mk-doc-marca")?.value || d.marca, conteudo: $("#mk-doc-txt")?.value ?? d.conteudo };
        api.mk.doc.atualizar(d.id, campos).then((r) => { M.docs[r.id] = r; M.docEditar = false; render(); toast("Documento guardado"); }).catch(falha);
        return true;
      }
      case "mk-doc-novo": api.mk.doc.criar({ titulo: "Documento sem título", marca: M.fMarca || "grupo", conteudo: "" }).then((r) => { M.docs[r.id] = r; M.docSel = r.id; M.docEditar = true; render(); setTimeout(() => $("#mk-doc-tit")?.select(), 0); }).catch(falha); return true;
      case "mk-doc-apagar": M.docConfirmar = true; render(); return true;
      case "mk-doc-apagar-nao": M.docConfirmar = false; render(); return true;
      case "mk-doc-apagar-sim": { const id = M.docSel; M.docConfirmar = false; api.mk.doc.apagar(id).then(() => { delete M.docs[id]; M.docSel = null; render(); toast("Documento eliminado"); }).catch(falha); return true; }
      case "mk-importar": importar(); return true;
      case "mk-imp-cancelar": M.importacao = null; render(); return true;
    }
    return false;
  }
  const timers = {};
  const CT = { "mp-titulo": "titulo", "mp-hora": "hora", "mp-link": "link", "mp-copy": "copy", "mp-notas": "notas", "mp-insp": "inspiracao" };
  function escrever(e) {
    const t = e.target;
    if (t.id === "mk-q") { M.q = t.value; const pos = t.selectionStart; render(); const x = $("#mk-q"); if (x) { x.focus(); x.setSelectionRange(pos, pos); } return true; }
    if (S.aberto?.tipo === "publicacao" && CT[t.id]) {
      const id = S.aberto.id;
      if (t.id === "mp-titulo") { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }
      if (t.id === "mp-copy") { const c = $("#mp-conta"); if (c) c.textContent = t.value.length + " caracteres"; }
      clearTimeout(timers[t.id]);
      timers[t.id] = setTimeout(() => { const v = ["mp-copy", "mp-notas"].includes(t.id) ? t.value : t.value.trim(); if (t.id === "mp-titulo" && !v) return; gravar(id, { [CT[t.id]]: v }, true); }, 900);
      return true;
    }
    return false;
  }
  function mudar(e) {
    const t = e.target;
    if (t.id === "mk-fest") { M.fEstado = t.value; render(); return true; }
    if (t.id === "mk-ficheiro" && t.files?.[0]) { lerFicheiro(t.files[0]); t.value = ""; return true; }
    if (S.aberto?.tipo === "publicacao") {
      const id = S.aberto.id, m = { "mp-marca": "marca", "mp-data": "data", "mp-tipo": "tipo", "mp-resp": "responsavel_id" };
      if (m[t.id]) {
        const v = t.value || (t.id === "mp-tipo" ? "" : null), campos = { [m[t.id]]: v };
        if (t.id === "mp-data" && v && M.pubs[id]?.estado === "ideia") campos.estado = "planeado";
        gravar(id, campos); return true;
      }
      if (t.dataset.mkPlat) { const p = M.pubs[id], s = new Set(p.plataformas || []); if (t.checked) s.add(t.dataset.mkPlat); else s.delete(t.dataset.mkPlat); gravar(id, { plataformas: [...s] }, true); return true; }
    }
    return false;
  }
  async function submeter(f) {
    if (f.id !== "form-mk") return false;
    const titulo = $("#mn-titulo").value.trim(); if (!titulo) { toast("Dá um título à publicação.", true); $("#mn-titulo").focus(); return true; }
    const data = $("#mn-data").value || null;
    try {
      const r = await api.mk.pub.criar({ titulo, marca: $("#mn-marca").value, data, tipo: $("#mn-tipo").value, responsavel_id: $("#mn-resp").value || null, notas: $("#mn-notas").value,
        estado: $("#mn-estado").value === "ideia" && !data ? "ideia" : data ? "planeado" : "ideia" });
      M.pubs[r.id] = r; if (data) M.mes = data.slice(0, 7); if (["documentos", "importar"].includes(M.tab)) M.tab = data ? "calendario" : "ideias"; fechar(); render(); toast(r.estado === "ideia" ? "Ideia guardada" : "Publicação criada");
    } catch (e) { falha(e); }
    return true;
  }
  function reiniciar() { if (desligar) { desligar(); desligar = null; } Object.assign(M, { estado: "por-carregar", pubs: {}, docs: {}, importacao: null, tab: "calendario", docSel: null }); }

  return { vista, painel, clique, escrever, mudar, submeter, carregar, blocoInicio, reiniciar, contagem, estado: () => M.estado };
}
