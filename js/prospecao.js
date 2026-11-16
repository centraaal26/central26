// Central 26 — Prospeção de barbearias: base de prospeção, propostas do agente, aprovação e envio.
import { normalizar, eGestor, paginar, paginador, haQuanto, MES, ymd } from "./dados.js";
import { podeCrm, podeImportar, DISTRITOS } from "./crm.js";
import { carregarXlsx } from "./xlsx.js";
import { lerBaseProspecao, canaisDe, canalPrincipal, digitos } from "./prospecao-importar.js";

export const podeProspecao = (eu) => podeCrm(eu);
const CANAIS = { whatsapp: "WhatsApp", instagram: "Instagram", email: "Email", telefone: "Telefone" };
const ESTADOS_PR = { pendente: "Por aprovar", aprovada: "Aprovadas", a_gerar: "Em preparação", enviada: "Enviadas", rejeitada: "Rejeitadas", erro: "Com erro" };
const ESTADO_UM = { pendente: "Por aprovar", aprovada: "Aprovada, por enviar", a_gerar: "Em preparação", enviada: "Enviada", rejeitada: "Rejeitada", erro: "Com erro" };
const TIPOS_PR = { seguimento1: "1.º seguimento", seguimento2: "2.º seguimento" };
const ESTADOS_LEAD = ["Pronto a contactar", "Bom lead digital", "A validar", "Fraco"];
const DIAS = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const n = (s) => normalizar(s).replace(/\s+/g, " ").trim();
const fmtTel = (d) => (d && d.startsWith("351") && d.length === 12 ? "+351 " + d.slice(3, 6) + " " + d.slice(6, 9) + " " + d.slice(9) : d ? "+" + d : "");
const proximaSegunda = () => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + ((8 - (d.getDay() || 7)) % 7 || 7)); return ymd(d); };
const somarDias = (s, k) => { const [a, m, d] = s.split("-").map(Number); return ymd(new Date(a, m - 1, d + k, 12)); };
const local = (c) => [...new Set([c.concelho, c.distrito].filter(Boolean))].join(", ");
const fmtData = (s) => { const [, m, d] = s.split("-").map(Number); return d + " " + MES[m - 1]; };

export function criarProspecao(ctx) {
  const { S, api, esc, I, toast, falha, render, agendarRender, renderPainel, abrir, fechar, nomeDe, ativos, av, $, demo, abrirCliente } = ctx;
  const R = (S.prs = { estado: "por-carregar", cfg: null, propostas: {}, balancos: [], zonas: [], leads: {}, excluidos: 0, tab: "propostas", filtro: "pendente", pag: 1,
    q: "", fEstado: "", fDistrito: "", fZona: "", pagB: 1, excl: null, imp: null, rasc: {}, rejeitar: false, ocupado: false });
  let desligar = null;

  async function carregar() {
    if (R.estado === "a-carregar") return;
    R.estado = "a-carregar";
    try {
      if (!api.prs) throw new Error("A app foi atualizada a meio. Recarrega a página para terminar a atualização.");
      const d = await api.prs.carregar();
      R.cfg = d.config; R.balancos = d.balancos || []; R.zonas = d.zonas || []; R.excluidos = d.excluidos || 0;
      R.propostas = Object.fromEntries(d.propostas.map((p) => [p.id, p]));
      R.leads = Object.fromEntries(d.leads.map((c) => [c.id, c]));
      R.estado = R.cfg ? "pronto" : "falta-script";
      if (!desligar && api.prs.subscrever) desligar = api.prs.subscrever(aoMudar);
    } catch (e) { R.estado = /PGRST20|prs_|Could not find|does not exist|whatsapp|estado_prospecao/i.test(String(e?.message)) ? "falta-script" : "erro"; R.erro = e.message; }
    agendarRender();
    if (S.aberto?.tipo === "proposta") renderPainel(true);
  }
  // Início e menu: só as propostas por aprovar (a base completa carrega quando se abre a Prospeção)
  let resumo = "por-carregar";
  async function carregarResumo() {
    if (resumo !== "por-carregar" || R.estado !== "por-carregar") return;
    resumo = "a-carregar";
    try {
      if (!api.prs?.resumo) throw new Error("sem resumo");
      const d = await api.prs.resumo();
      if (R.estado !== "por-carregar") { resumo = "falta"; return; } // a base completa já está a chegar
      R.cfg = d.config;
      R.propostas = Object.fromEntries(d.propostas.map((p) => [p.id, p]));
      R.leads = Object.fromEntries(d.leads.map((c) => [c.id, c]));
      resumo = d.config ? "pronto" : "falta";
      if (resumo === "pronto" && !desligar && api.prs.subscrever) desligar = api.prs.subscrever(aoMudar);
    } catch { resumo = "falta"; }
    agendarRender();
  }
  const temPendentes = () => R.estado === "pronto" || resumo === "pronto";
  function aoMudar(t, ev, novo, antigo) {
    if (t === "proposta") { if (ev === "DELETE") delete R.propostas[antigo.id]; else R.propostas[novo.id] = { ...(R.propostas[novo.id] || {}), ...novo }; }
    if (t === "balanco" && novo) R.balancos = [novo, ...R.balancos.filter((b) => b.id !== novo.id)];
    agendarRender();
    if (S.aberto?.tipo === "proposta" && S.aberto.id === novo?.id && !R.ocupado && !document.activeElement?.closest?.(".painel")) renderPainel();
  }

  const pode = () => podeProspecao(S.eu);
  const aprova = () => !!S.eu && (eGestor(S.eu) || (R.cfg?.aprovadores || []).includes(S.eu.id));
  const lista = (estado) => Object.values(R.propostas).filter((p) => p.estado === estado);
  const lead = (p) => R.leads[p.cliente_id] || S.crm?.clientes?.[p.cliente_id] || null;
  const pillCanal = (c) => (c ? '<span class="prs-canal c-' + c + '">' + esc(CANAIS[c] || c) + "</span>" : "");
  const pillTipo = (p) => (TIPOS_PR[p.tipo] ? '<span class="prs-tipo">' + TIPOS_PR[p.tipo] + "</span>" : "");
  const pillResp = (p) => (p.respondeu_em ? '<span class="prs-resp">Respondeu</span>' : "");
  const pillEstado = (e) => '<span class="prs-est e-' + e + '">' + esc(ESTADO_UM[e] || e) + "</span>";

  /* ============================== Vistas ============================== */
  function vista(param) {
    if (R.estado === "por-carregar") carregar();
    if (param !== undefined && param !== R.ultimoParam) { R.ultimoParam = param; R.tab = ["barbearias", "rotas", "balancos", "definicoes", "importar"].includes(param) ? param : "propostas"; }
    let h = '<div class="cab" data-marca="twentysix"><div><div class="eyebrow">Comercial</div><h1>Prospeção</h1><p class="sub-cab">Barbearias novas todas as semanas, cada uma com uma proposta de primeira abordagem preparada pelo agente. Quem aprova revê, decide e envia para o contacto principal da barbearia.</p></div></div>';
    const tabs = [["propostas", "Propostas"], ["barbearias", "Barbearias"], ["rotas", "Rotas"], ["balancos", "Balanços"], ["definicoes", "Definições"]].concat(podeImportar(S.eu) ? [["importar", "Importar"]] : []);
    h += '<div class="tabs" role="tablist">' + tabs.map(([k, r]) => '<button class="tab" role="tab" data-acao="prs-tab" data-tab="' + k + '" aria-selected="' + (R.tab === k) + '">' + r + (k === "propostas" && aprova() && lista("pendente").length ? ' <span class="ct-tab">' + lista("pendente").length + "</span>" : "") + "</button>").join("") + "</div>";
    if (R.estado === "falta-script") return h + '<div class="vazio"><h3>Falta instalar a Prospeção na base de dados</h3><p>No Supabase, abre o SQL Editor, cola o ficheiro <b>supabase/16-prospecao.sql</b> do GitHub e carrega em Run. Depois recarrega esta página.</p></div>';
    if (R.estado === "erro") return h + '<div class="aviso erro">Não foi possível abrir a Prospeção: ' + esc(R.erro || "") + "</div>";
    if (R.estado !== "pronto") return h + '<div class="tabela"><div class="esqueleto"><i style="width:50%"></i></div></div>';
    if (R.tab === "importar" && podeImportar(S.eu)) return h + vistaImportar();
    if (!Object.keys(R.leads).length && !Object.keys(R.propostas).length && R.tab !== "definicoes")
      return h + '<div class="vazio"><h3>A base de prospeção ainda está vazia</h3><p>Importa o Excel com as barbearias (separador Importar). A partir daí, a Central procura barbearias novas todas as semanas e prepara as propostas de abordagem.</p>' +
        (podeImportar(S.eu) ? '<div class="acts"><button class="btn pri" data-acao="prs-tab" data-tab="importar">Importar o Excel</button></div>' : "") + "</div>";
    if (R.tab === "barbearias") return h + vistaBarbearias();
    if (R.tab === "rotas") return h + vistaRotas();
    if (R.tab === "balancos") return h + vistaBalancos();
    if (R.tab === "definicoes") return h + vistaDefinicoes();
    return h + vistaPropostas();
  }

  function vistaPropostas() {
    const todas = Object.values(R.propostas), cfg = R.cfg;
    const semana = todas.map((p) => p.semana).sort().pop() || "";
    const enviadasSem = todas.filter((p) => p.estado === "enviada" && p.semana === semana).length;
    let h = '<div class="resumo-crm resumo-eq"><div class="kpi' + (lista("pendente").length && aprova() ? " alerta-kpi" : "") + '"><span>Por aprovar</span><b>' + lista("pendente").length + '</b></div><div class="kpi"><span>Em preparação</span><b>' + lista("a_gerar").length +
      '</b></div><div class="kpi"><span>Enviadas esta semana</span><b>' + enviadasSem + '</b></div><div class="kpi"><span>Barbearias na base</span><b>' + Object.keys(R.leads).length.toLocaleString("pt-PT") + "</b></div></div>";
    if (!cfg.ativo) h += '<div class="aviso">A prospeção semanal está desligada. Liga-a em Definições.</div>';
    else if (!todas.length) h += '<div class="aviso">As primeiras ' + cfg.por_semana + ' propostas são preparadas ' + (cfg.dia_semana === 1 ? "na segunda-feira" : "à " + DIAS[cfg.dia_semana].toLowerCase() + "-feira").replace("sábado-feira", "sábado").replace("domingo-feira", "domingo") + " às " + cfg.hora + "h." + (eGestor(S.eu) ? ' Para começar já, vai a Definições e carrega em «Preparar as propostas agora».' : "") + "</div>";
    if (!aprova() && lista("pendente").length) h += '<p class="muted">Quem aprova as propostas: ' + esc(nomesAprovadores()) + ".</p>";
    const conta = (e) => lista(e).length;
    h += '<div class="chips-marca" role="tablist" aria-label="Estado">' + Object.entries(ESTADOS_PR).filter(([k]) => conta(k) || k === "pendente")
      .map(([k, r]) => '<button class="chip-m' + (R.filtro === k ? " on" : "") + '" role="tab" aria-selected="' + (R.filtro === k) + '" data-acao="prs-filtro" data-v="' + k + '">' + r + ' <span class="n">' + conta(k) + "</span></button>").join("") + "</div>";
    const l = lista(R.filtro).sort((a, b) => R.filtro === "enviada" ? String(b.enviada_em).localeCompare(String(a.enviada_em)) : String(b.semana).localeCompare(String(a.semana)) || (lead(a)?.nome || "").localeCompare(lead(b)?.nome || "", "pt"));
    if (!l.length) return h + '<div class="vazio"><h3>' + (R.filtro === "pendente" ? "Nada por aprovar" : "Sem propostas aqui") + "</h3><p>" + (R.filtro === "pendente" ? "Quando o agente preparar as propostas da semana, aparecem aqui e recebes um aviso." : "Muda de filtro para ver as outras propostas.") + "</p></div>";
    const pg = paginar(l, R.pag, 20); R.pag = pg.pag;
    return h + '<div class="prs-lista">' + pg.itens.map(cartao).join("") + "</div>" + paginador(pg, "prs-pag", "propostas");
  }
  function cartao(p) {
    const c = lead(p) || { nome: "Barbearia", concelho: "", distrito: "" };
    const corpo = p.estado === "a_gerar" ? '<span class="muted">' + (p.erro ? "A tentar outra vez: " + esc(p.erro) : "O agente está a preparar a proposta…") + "</span>"
      : p.estado === "erro" ? '<span class="prs-erro">' + esc(p.erro || "Não foi possível preparar a proposta.") + "</span>"
      : esc((p.mensagem || "").replace(/\s+/g, " ").slice(0, 170)) + ((p.mensagem || "").length > 170 ? "…" : "");
    return '<button class="prs-cartao e-' + p.estado + '" data-acao="prs-abrir" data-id="' + p.id + '"><span class="prs-c-cab"><b>' + esc(c.nome) + "</b>" + pillTipo(p) + pillCanal(p.canal) + "</span>" +
      '<small class="prs-c-loc">' + esc(local(c)) + (c.zona_codigo ? " · zona " + esc(c.zona_codigo) : "") + (c.prioridade ? " · prioridade " + esc(c.prioridade) : "") + "</small>" +
      '<span class="prs-c-msg">' + corpo + "</span>" +
      '<span class="prs-c-pe">' + pillEstado(p.estado) + pillResp(p) + "<small>" + esc(p.estado === "enviada" ? "enviada " + haQuanto(p.enviada_em) + " por " + ((nomeDe(p.enviada_por) || "").split(" ")[0] || "—") : "semana " + String(p.semana).slice(-2)) + "</small></span></button>";
  }
  const nomesAprovadores = () => { const a = (R.cfg?.aprovadores || []).map((id) => (nomeDe(id) || "").split(" ")[0]).filter(Boolean); return a.length ? a.join(", ") : "a direção"; };

  function vistaBarbearias() {
    const todos = Object.values(R.leads), q = n(R.q);
    const prop = {}; Object.values(R.propostas).forEach((p) => { const a = prop[p.cliente_id]; if (!a || String(p.criado_em) > String(a.criado_em)) prop[p.cliente_id] = p; });
    const respondeu = new Set(Object.values(R.propostas).filter((p) => p.respondeu_em).map((p) => p.cliente_id));
    const conta = (e) => todos.filter((c) => (e === "auto" ? c.origem === "auto" : c.estado_prospecao === e)).length;
    const distritos = [...new Set(todos.map((c) => c.distrito).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt"));
    const zonas = [...new Set(todos.map((c) => c.zona_codigo).filter(Boolean))].sort();
    let h = '<div class="barra"><div class="ferr ferr-aud"><label class="pesq stk-pesq">' + I.lupa + '<span class="sr">Procurar</span><input id="prs-q" type="search" placeholder="Procurar por nome, concelho, telefone…" value="' + esc(R.q) + '"></label>' +
      '<select id="prs-f-distrito" class="sel" aria-label="Distrito"><option value="">Todos os distritos</option>' + distritos.map((d) => '<option' + (d === R.fDistrito ? " selected" : "") + ">" + esc(d) + "</option>").join("") + "</select>" +
      '<select id="prs-f-zona" class="sel" aria-label="Zona"><option value="">Todas as zonas</option>' + zonas.map((z) => '<option value="' + esc(z) + '"' + (z === R.fZona ? " selected" : "") + ">" + esc(z + " · " + (R.zonas.find((x) => x.codigo === z)?.nome || "")) + "</option>").join("") + "</select></div></div>";
    h += '<div class="chips-marca" role="tablist" aria-label="Estado">' + [["", "Todas", todos.length], ...ESTADOS_LEAD.map((e) => [e, e, conta(e)]), ["auto", "Novas da pesquisa", conta("auto")]].filter(([k, , c]) => !k || c)
      .map(([k, r, c]) => '<button class="chip-m' + (R.fEstado === k ? " on" : "") + '" role="tab" aria-selected="' + (R.fEstado === k) + '" data-acao="prs-f-estado" data-v="' + esc(k) + '">' + esc(r) + ' <span class="n">' + c + "</span></button>").join("") + "</div>";
    const l = todos.filter((c) => (!R.fEstado || (R.fEstado === "auto" ? c.origem === "auto" : c.estado_prospecao === R.fEstado)) && (!R.fDistrito || c.distrito === R.fDistrito) && (!R.fZona || c.zona_codigo === R.fZona) &&
      (!q || n([c.nome, c.concelho, c.distrito, c.telefone, c.email, c.instagram].join(" ")).includes(q)))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.nome.localeCompare(b.nome, "pt"));
    const pg = paginar(l, R.pagB, 25); R.pagB = pg.pag;
    h += '<div class="tabela-scroll"><table class="crm-tabela prs-tab"><thead><tr><th>Barbearia</th><th>Local</th><th>Estado</th><th class="num">Score</th><th>Contacto principal</th><th>Zona</th><th>Abordagem</th></tr></thead><tbody>' +
      (pg.itens.map((c) => {
        const k = canalPrincipal(c), cont = canaisDe(c)[k] || "", p = prop[c.id];
        return '<tr><td><button class="c-link" data-acao="prs-cliente" data-id="' + c.id + '">' + esc(c.nome) + "</button>" + (c.origem === "auto" ? ' <span class="prs-novo">nova</span>' : "") + "<small>" + esc(c.tipo_negocio || "") + "</small></td><td>" + esc(local(c)) + "</td><td>" + esc(c.estado_prospecao || "—") + (c.prioridade ? "<small>prioridade " + esc(c.prioridade) + "</small>" : "") +
          '</td><td class="num mono">' + (c.score ?? "—") + "</td><td>" + (k ? pillCanal(k) + " <small>" + esc(k === "whatsapp" || k === "telefone" ? fmtTel(cont) : k === "instagram" ? "@" + cont : cont) + "</small>" : '<span class="muted">sem contacto</span>') +
          "</td><td>" + esc(c.zona_codigo || "—") + "</td><td>" + (p ? '<button class="prs-est-b" data-acao="prs-abrir" data-id="' + p.id + '">' + (respondeu.has(c.id) ? '<span class="prs-resp">Respondeu</span>' : pillTipo(p) + pillEstado(p.estado)) + "</button>" : c.etapa !== "lead" ? esc(c.etapa) : '<span class="muted">—</span>') + "</td></tr>";
      }).join("") || '<tr><td colspan="7" class="muted">Nada encontrado.</td></tr>') + "</tbody></table></div>" + paginador(pg, "prs-pag-b", "barbearias");
    h += '<section class="cartao-sec prs-excl"><h3>Postas de parte <span class="mono muted">' + R.excluidos.toLocaleString("pt-PT") + '</span></h3><p>Barbearias que ficaram fora da campanha ou foram excluídas na base (por exemplo, distritos fora do reforço, ou sem prova de serem barbearias). A pesquisa automática não as volta a propor. Se alguma fizer sentido, passa-a para o CRM.</p>' +
      (R.excl ? vistaExcluidos() : '<div class="acts"><button class="btn sec" data-acao="prs-excl-ver">Ver a lista</button></div>') + "</section>";
    return h;
  }
  function vistaExcluidos() {
    const e = R.excl;
    let h = '<label class="pesq stk-pesq">' + I.lupa + '<span class="sr">Procurar</span><input id="prs-excl-q" type="search" placeholder="Procurar nas postas de parte…" value="' + esc(e.q) + '"></label>';
    if (e.aCarregar) return h + '<div class="esqueleto"><i style="width:40%"></i></div>';
    h += '<div class="prs-excl-lista">' + (e.itens.map((x) => '<div class="prs-excl-item"><span><b>' + esc(x.nome) + "</b><small>" + esc(local(x) + (x.motivo ? " · " + x.motivo : "")) + '</small></span><button class="btn sec" data-acao="prs-recuperar" data-chave="' + esc(x.chave) + '">Passar para o CRM</button></div>').join("") || '<p class="muted">Nada encontrado.</p>') + "</div>";
    const r = { pag: e.pag, paginas: Math.max(1, Math.ceil(e.total / 20)), total: e.total, de: e.total ? (e.pag - 1) * 20 + 1 : 0, ate: Math.min(e.pag * 20, e.total) };
    return h + paginador(r, "prs-excl-pag", "barbearias");
  }
  async function verExcluidos(pag = 1) {
    R.excl = { ...(R.excl || { q: "" }), pag, aCarregar: true, itens: [], total: 0 }; render();
    try { const r = await api.prs.excluidos(R.excl.q.trim(), (pag - 1) * 20, pag * 20 - 1); Object.assign(R.excl, r, { aCarregar: false }); } catch (e) { R.excl.aCarregar = false; falha(e); }
    render();
  }

  function cicloAtual() {
    const ini = R.cfg?.plano_inicio; if (!ini || !R.zonas.length) return { semana: 0, inicioSemana: null };
    const ciclo = Math.max(...R.zonas.map((z) => z.semana || 1));
    const [a, m, d] = ini.split("-").map(Number), hoje = new Date(); hoje.setHours(12, 0, 0, 0);
    const semanas = Math.floor((hoje - new Date(a, m - 1, d, 12)) / (7 * 864e5));
    if (semanas < 0) return { semana: 0, antes: true, ciclo, base: ini };
    return { semana: (semanas % ciclo) + 1, ciclo, base: somarDias(ini, Math.floor(semanas / ciclo) * ciclo * 7) };
  }
  function vistaRotas() {
    const cfg = R.cfg, c = cicloAtual(), g = eGestor(S.eu);
    let h = '<section class="cartao-sec"><h3>Plano de rua</h3><p>As zonas vêm do Excel e repetem-se em ciclos de ' + (c.ciclo || 4) + ' semanas. As propostas de cada semana dão prioridade às barbearias das zonas da semana seguinte, para o contacto chegar antes da visita.</p>' +
      '<div class="campos-3"><div class="campo"><label for="prs-plano">Início do plano (segunda-feira da semana 1)</label><input id="prs-plano" type="date" value="' + esc(cfg.plano_inicio || "") + '"' + (g ? "" : " disabled") + "></div>" +
      '<div class="campo"><span class="lbl">Esta semana</span><b class="prs-sem-atual">' + (c.semana ? "Semana " + c.semana + " do ciclo" : c.antes ? "O plano começa a " + fmtData(cfg.plano_inicio) : "Escolhe a data de início") + "</b></div></div></section>";
    if (!R.zonas.length) return h + '<div class="vazio"><h3>Sem zonas</h3><p>As zonas e o plano de rua entram com a importação do Excel.</p></div>';
    const porZona = {}, porAbordar = {}; const comProp = new Set(Object.values(R.propostas).map((p) => p.cliente_id));
    Object.values(R.leads).forEach((l) => { if (!l.zona_codigo) return; porZona[l.zona_codigo] = (porZona[l.zona_codigo] || 0) + 1; if (l.etapa === "lead" && !comProp.has(l.id)) porAbordar[l.zona_codigo] = (porAbordar[l.zona_codigo] || 0) + 1; });
    const semanas = [...new Set(R.zonas.map((z) => z.semana))].sort((a, b) => a - b);
    for (const s of semanas) {
      const zs = R.zonas.filter((z) => z.semana === s).sort((a, b) => a.dia - b.dia);
      const atual = c.semana === s;
      h += '<section class="prs-rota-sem' + (atual ? " atual" : "") + '"><h2>Semana ' + s + (atual ? ' <span class="prs-est e-pendente">esta semana</span>' : "") + '</h2><div class="tabela-scroll"><table class="crm-tabela"><thead><tr><th>Dia</th><th>Zona</th><th>Concelhos</th><th class="num">Barbearias</th><th class="num">Por abordar</th><th>Objetivo</th><th>Estado</th></tr></thead><tbody>' +
        zs.map((z) => {
          const data = c.base ? fmtData(somarDias(c.base, (s - 1) * 7 + (z.dia - 1))) : "";
          return "<tr><td><b>" + DIAS[z.dia] + "</b>" + (data ? "<small>" + data + "</small>" : "") + '</td><td><button class="c-link" data-acao="prs-ver-zona" data-v="' + esc(z.codigo) + '"><b>' + esc(z.codigo) + "</b> " + esc(z.nome) + "</button>" + (z.recursos ? "<small>" + esc(z.recursos) + "</small>" : "") + "</td><td>" + esc(z.concelhos) +
            '</td><td class="num mono">' + (porZona[z.codigo] || 0) + '</td><td class="num mono">' + (porAbordar[z.codigo] || 0) + "</td><td><small>" + esc(z.objetivo || z.observacoes || "") + "</small></td><td>" +
            '<select class="sel" data-prs-zona="' + esc(z.codigo) + '" aria-label="Estado da zona ' + esc(z.codigo) + '">' + ["Por executar", "Em curso", "Feito"].map((e) => "<option" + (e === z.estado ? " selected" : "") + ">" + e + "</option>").join("") + "</select></td></tr>";
        }).join("") + "</tbody></table></div></section>";
    }
    return h;
  }

  function vistaBalancos() {
    if (!R.balancos.length) return '<div class="vazio"><h3>Ainda sem balanços</h3><p>Cada importação e cada semana de prospeção deixa aqui um balanço: quantas barbearias novas, onde ficam e o contacto principal de cada uma.</p></div>';
    return R.balancos.map((b) => {
      const r = b.resumo || {}, dist = Object.entries(r.por_distrito || {}).sort((a, x) => x[1] - a[1]);
      const kpis = b.tipo === "importacao"
        ? [["Na base", r.total], ["Novas no CRM", r.novos], ["Atualizadas", r.atualizados], ["Com telefone", r.com_telefone]]
        : [["Barbearias novas", r.novos], ["Propostas", r.propostas], ["Distritos pesquisados", (r.distritos || []).length]];
      let h = '<section class="cartao-sec prs-bal"><h3>' + esc(b.titulo || "Balanço") + ' <span class="muted mono">' + esc(new Date(b.criado_em).toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" })) + "</span></h3>" +
        '<div class="resumo-crm resumo-eq">' + kpis.filter(([, v]) => v != null).map(([k, v]) => '<div class="kpi"><span>' + k + "</span><b>" + Number(v).toLocaleString("pt-PT") + "</b></div>").join("") + "</div>";
      if (r.distritos?.length && b.tipo !== "importacao") h += "<p>Pesquisa em " + esc(r.distritos.join(", ")) + (r.encontrados != null ? " · " + Number(r.encontrados) + " encontradas, já sem as que estavam na base" : "") + ".</p>";
      if (dist.length) h += '<div class="prs-dist">' + dist.map(([d, v]) => '<span class="prs-dchip">' + esc(d) + " <b>" + Number(v) + "</b></span>").join("") + "</div>";
      const linhas = (x) => '<div class="tabela-scroll"><table class="crm-tabela"><thead><tr><th>Barbearia</th><th>Local</th><th>Contacto principal</th></tr></thead><tbody>' + x.map((d) =>
        '<tr><td>' + (d.id && R.leads[d.id] ? '<button class="c-link" data-acao="prs-cliente" data-id="' + esc(d.id) + '">' + esc(d.nome) + "</button>" : esc(d.nome)) + "</td><td>" + esc(local(d)) + "</td><td>" + (d.canal ? pillCanal(d.canal) + " <small>" + esc(d.canal === "whatsapp" || d.canal === "telefone" ? fmtTel(d.contacto) : d.canal === "instagram" ? "@" + d.contacto : d.contacto) + "</small>" : '<span class="muted">sem contacto</span>') + "</td></tr>").join("") + "</tbody></table></div>";
      if (r.destaques?.length) h += '<h4>Barbearias novas</h4>' + linhas(r.destaques.slice(0, 15)) + (r.destaques.length > 15 ? '<p class="muted">E mais ' + (r.destaques.length - 15) + " no separador Barbearias (filtro «Novas da pesquisa»).</p>" : "");
      if (r.escolhidas?.length) h += '<h4>Escolhidas para abordar esta semana</h4>' + linhas(r.escolhidas.slice(0, 25));
      if (b.tipo === "importacao" && r.por_estado) h += '<div class="prs-dist">' + Object.entries(r.por_estado).map(([e, v]) => '<span class="prs-dchip">' + esc(e) + " <b>" + v + "</b></span>").join("") + "</div>";
      return h + "</section>";
    }).join("");
  }

  function vistaDefinicoes() {
    const c = R.cfg, g = eGestor(S.eu), dis = g ? "" : " disabled";
    const pessoas = ativos().slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
    const sel = new Set(c.aprovadores || []), dsel = new Set(c.distritos || []);
    const linhas = (a) => esc((a || []).join("\n"));
    let h = g ? "" : '<p class="muted">Só a direção muda estas definições.</p>';
    h += '<section class="cartao-sec"><h3>Funcionamento</h3><label class="interruptor"><input type="checkbox" id="prs-ativo"' + (c.ativo ? " checked" : "") + dis + '><span class="int-t"></span>Prospeção semanal ligada</label>' +
      '<div class="campos-3"><div class="campo"><label for="prs-por">Propostas por semana</label><input id="prs-por" type="number" min="0" max="200" value="' + c.por_semana + '"' + dis + "></div>" +
      '<div class="campo"><label for="prs-dia">Dia</label><select id="prs-dia" class="sel"' + dis + ">" + DIAS.slice(1).map((d, i) => '<option value="' + (i + 1) + '"' + (i + 1 === c.dia_semana ? " selected" : "") + ">" + d + "</option>").join("") + "</select></div>" +
      '<div class="campo"><label for="prs-hora">Hora</label><select id="prs-hora" class="sel"' + dis + ">" + Array.from({ length: 24 }, (_, i) => '<option value="' + i + '"' + (i === c.hora ? " selected" : "") + ">" + String(i).padStart(2, "0") + ":00</option>").join("") + "</select></div></div>" +
      '<p class="muted">Nesse dia, a Central procura barbearias novas, escolhe as barbearias a abordar e o agente prepara as propostas uma a uma (pode levar algumas horas no serviço de IA gratuito). Quem aprova recebe um aviso no início e outro quando estiverem todas prontas.</p></section>';
    h += '<section class="cartao-sec"><h3>Quem aprova</h3><p>Recebem os avisos e podem aprovar, rejeitar e enviar. Sem ninguém escolhido, aprova a direção.</p><div class="stk-pessoas">' +
      pessoas.map((p) => '<label class="chk-txt stk-pessoa"><input type="checkbox" data-prs-aprov="' + p.id + '"' + (sel.has(p.id) ? " checked" : "") + dis + "> " + av(p.id) + "<span>" + esc(p.nome) + "</span></label>").join("") + "</div>" +
      '<div class="campos-2"><div class="campo"><label for="prs-comercial">Quem faz a visita com amostras</label><select id="prs-comercial" class="sel"' + dis + '><option value="">Ninguém em particular</option>' + pessoas.map((p) => '<option value="' + p.id + '"' + (p.id === c.comercial_id ? " selected" : "") + ">" + esc(p.nome) + "</option>").join("") + "</select></div>" +
      '<div class="campo"><label for="prs-resp">Email para as respostas</label><input id="prs-resp" type="email" value="' + esc(c.email_resposta) + '" placeholder="ex.: comercial@twentysix.pt"' + dis + "></div></div>" +
      '<div class="campo"><label for="prs-assin">Assinatura das mensagens</label><textarea id="prs-assin" rows="2" placeholder="ex.: Wembley Costa · TwentySix"' + dis + ">" + esc(c.assinatura) + "</textarea></div></section>";
    if (!("seguimento1_dias" in c)) h += '<section class="cartao-sec"><h3>Seguimentos</h3><div class="aviso">Para ligar os seguimentos, corre no Supabase o script <b>supabase/17-seguimentos.sql</b>.</div></section>';
    else h += '<section class="cartao-sec"><h3>Seguimentos</h3><label class="interruptor"><input type="checkbox" id="prs-seg"' + (c.seguimentos !== false ? " checked" : "") + dis + '><span class="int-t"></span>Preparar seguimentos quando a barbearia não responde</label>' +
      '<div class="campos-3"><div class="campo"><label for="prs-seg1">1.º seguimento, dias depois da abordagem</label><input id="prs-seg1" type="number" min="1" max="60" value="' + Number(c.seguimento1_dias ?? 4) + '"' + dis + "></div>" +
      '<div class="campo"><label for="prs-seg2">2.º seguimento, dias depois do 1.º</label><input id="prs-seg2" type="number" min="1" max="60" value="' + Number(c.seguimento2_dias ?? 5) + '"' + dis + "></div></div>" +
      '<p class="muted">Usam os guiões «Follow-up 1» e «Follow-up 2» e ficam por aprovar, como as propostas. Param quando alguém marca «A barbearia respondeu» ou regista um contacto novo no CRM.</p></section>';
    h += '<section class="cartao-sec"><h3>O que propomos</h3><div class="campo"><label for="prs-oferta">Oferta (o agente nunca promete mais do que isto)</label><textarea id="prs-oferta" rows="4"' + dis + ">" + esc(c.oferta) + "</textarea></div>" +
      '<div class="campos-2"><div class="campo"><label for="prs-qint">Questões a definir por quem aprova (uma por linha)</label><textarea id="prs-qint" rows="6"' + dis + ">" + linhas(c.perguntas_internas) + "</textarea></div>" +
      '<div class="campo"><label for="prs-qbar">Perguntas para a barbearia, no contacto ou na visita (uma por linha)</label><textarea id="prs-qbar" rows="6"' + dis + ">" + linhas(c.perguntas_barbearia) + "</textarea></div></div>" +
      '<h4>Guiões de contacto</h4>' + ((c.guioes || []).length ? (c.guioes || []).map((x, i) => '<div class="campo"><label for="prs-g' + i + '">' + esc(x.tipo) + '</label><textarea id="prs-g' + i + '" data-prs-guiao="' + i + '" rows="4"' + dis + ">" + esc(x.texto) + "</textarea></div>").join("") : '<p class="muted">Os guiões entram com a importação do Excel.</p>') + "</section>";
    h += '<section class="cartao-sec"><h3>Pesquisa automática</h3><label class="interruptor"><input type="checkbox" id="prs-pauto"' + (c.pesquisa_auto ? " checked" : "") + dis + '><span class="int-t"></span>Procurar barbearias novas todas as semanas</label>' +
      '<div class="campos-3"><div class="campo"><label for="prs-maxn">Máximo de barbearias novas por semana</label><input id="prs-maxn" type="number" min="0" max="500" value="' + c.max_novos + '"' + dis + "></div></div>" +
      "<p>Distritos onde procurar (3 por semana, à vez). Sem nenhum escolhido, usa os distritos das zonas do plano de rua.</p>" +
      '<div class="prs-distritos">' + DISTRITOS.filter((d) => !/Açores|Madeira/.test(d)).map((d) => '<label class="chk-txt"><input type="checkbox" data-prs-dist="' + esc(d) + '"' + (dsel.has(d) ? " checked" : "") + dis + "> " + esc(d) + "</label>").join("") + "</div>" +
      '<p class="muted">Fonte: OpenStreetMap (gratuito). Com a chave do Google Maps (GOOGLE_PLACES_KEY) encontra mais barbearias e quase sempre com telefone.' + (c.ultima_pesquisa ? " Última pesquisa: " + esc(haQuanto(c.ultima_pesquisa)) + "." : "") + "</p></section>";
    if (g) h += '<div class="acts acts-fim"><button class="btn pri" data-acao="prs-guardar">Guardar</button><button class="btn sec" data-acao="prs-pesquisar"' + (R.ocupado ? " disabled" : "") + ">" + I.lupa + "Procurar barbearias agora</button>" +
      '<button class="btn sec" data-acao="prs-semana"' + (R.ocupado ? " disabled" : "") + ">Preparar as propostas agora</button></div>";
    return h;
  }

  function vistaImportar() {
    const m = R.imp;
    let h = '<section class="cartao-sec"><h3>Importar a base de prospeção</h3><p>Escolhe o Excel das barbearias (por exemplo «base_500_barbearias_twentysix_ROTAS_ZONAS_MENSAL.xlsx»). Entram no CRM todas as barbearias de «Todos os Leads», com o estado, a prioridade, a zona e o canal recomendado; as zonas e o plano de rua; os guiões de contacto; e as barbearias postas de parte, para a pesquisa automática não as repetir. Se a barbearia já estiver no CRM, os dados são atualizados sem apagar o que o Comercial já preencheu.</p>' +
      '<label class="btn sec ficheiro">' + I.plus + 'Escolher o Excel<input type="file" id="prs-ficheiro" accept=".xlsx,.xls" hidden></label></section>';
    if (!m) return h;
    if (m.erro) return h + '<div class="aviso erro">' + esc(m.erro) + "</div>";
    if (m.aLer) return h + '<div class="esqueleto"><i style="width:40%"></i></div>';
    const r = m.base.resumo;
    h += '<section class="cartao-sec"><h3>' + esc(m.base.ficheiro) + '</h3><div class="resumo-crm resumo-eq"><div class="kpi"><span>Barbearias</span><b>' + r.total + '</b></div><div class="kpi"><span>Com telefone</span><b>' + r.com_telefone +
      '</b></div><div class="kpi"><span>Com email</span><b>' + r.com_email + '</b></div><div class="kpi"><span>Com Instagram</span><b>' + r.com_instagram + "</b></div></div>" +
      '<div class="prs-dist">' + Object.entries(r.por_estado).map(([e, v]) => '<span class="prs-dchip">' + esc(e) + " <b>" + v + "</b></span>").join("") + "</div>" +
      '<div class="prs-dist">' + Object.entries(r.por_distrito).sort((a, b) => b[1] - a[1]).map(([e, v]) => '<span class="prs-dchip">' + esc(e) + " <b>" + v + "</b></span>").join("") + "</div>" +
      "<p>" + r.zonas + " zonas do plano de rua · " + r.guioes + " guiões de contacto · " + r.excluidos.toLocaleString("pt-PT") + " barbearias postas de parte.</p>" +
      (m.feito ? '<div class="aviso ok">Importado: ' + m.feito.novos + " barbearias novas no CRM e " + m.feito.atualizados + " atualizadas.</div>"
        : m.prog != null ? '<div class="copia-prog"><span class="barra-p"><i style="width:' + Math.round(m.prog * 100) + '%"></i></span><small>A importar…</small></div>'
        : '<div class="acts"><button class="btn pri" data-acao="prs-importar">Importar ' + r.total + " barbearias</button></div>") + "</section>";
    return h;
  }
  async function lerFicheiro(f) {
    R.imp = { aLer: true }; render();
    try {
      const XLSX = await carregarXlsx();
      const base = lerBaseProspecao(XLSX, new Uint8Array(await f.arrayBuffer()), f.name);
      if (!base.leads.length) throw new Error("Não encontrei barbearias na folha «Todos os Leads».");
      R.imp = { base };
    } catch (e) { R.imp = { erro: e.message || String(e) }; }
    render();
  }
  async function importar() {
    const b = R.imp.base; R.imp.prog = 0; render();
    try {
      const partes = [];
      for (let i = 0; i < b.leads.length; i += 150) partes.push({ leads: b.leads.slice(i, i + 150) });
      for (let i = 0; i < b.excluidos.length; i += 400) partes.push({ excluidos: b.excluidos.slice(i, i + 400) });
      partes[0] = { ...partes[0], zonas: b.zonas, guioes: b.guioes };
      let novos = 0, atualizados = 0;
      for (let i = 0; i < partes.length; i++) {
        const r = await api.prs.importar(partes[i]); novos += r.novos || 0; atualizados += r.atualizados || 0;
        R.imp.prog = (i + 1) / (partes.length + 1); render();
      }
      const destaques = b.leads.filter((l) => l.estado === "Pronto a contactar").slice(0, 40).map((l) => { const k = canalPrincipal({ ...l, canal_recomendado: l.canal }); return { nome: l.nome, concelho: l.concelho, distrito: l.distrito, canal: k, contacto: k ? canaisDe(l)[k] : "" }; });
      await api.prs.importar({ registo: { ficheiro: b.ficheiro, total: b.leads.length, novos, atualizados, ...b.resumo, destaques } });
      if (eGestor(S.eu) && !R.cfg?.plano_inicio) await api.prs.guardarConfig({ plano_inicio: proximaSegunda() }).catch(() => {});
      R.imp.feito = { novos, atualizados }; R.imp.prog = null;
      if (S.crm) S.crm.estado = "por-carregar"; // o CRM volta a ler os clientes com as novas barbearias
      R.estado = "por-carregar"; await carregar();
      toast("Base importada: " + novos + " barbearias novas e " + atualizados + " atualizadas.");
    } catch (e) { R.imp.prog = null; render(); falha(e); }
  }

  /* ============================== Painel da proposta ============================== */
  const mold = (c, pe) => '<div class="veu" data-acao="fechar"></div><aside class="painel largo" role="dialog" aria-label="Proposta de abordagem" data-marca="twentysix"><div class="p-scroll">' + c + "</div>" + (pe ? '<div class="p-pe">' + pe + "</div>" : "") + "</aside>";
  const topo = () => '<div class="p-topo"><span class="migalha"><i></i>Prospeção</span><span class="acts"><button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + "</button></span></div>";
  function rasc(p) {
    const r = R.rasc[p.id] || (R.rasc[p.id] = { canal: p.canal, mensagens: JSON.parse(JSON.stringify(p.mensagens || {})), perguntas: JSON.parse(JSON.stringify(p.perguntas || [])) });
    // a mensagem guardada (editada por quem aprova) ganha à versão do agente no canal escolhido
    if (!r.tocado) { if (p.canal === "email") r.mensagens.email = { assunto: p.assunto, corpo: p.mensagem }; else if (p.canal) r.mensagens[p.canal] = p.mensagem; r.tocado = true; }
    return r;
  }
  function linkCanal(canal, destino, p, texto) {
    if (canal === "whatsapp") return "https://wa.me/" + destino + "?text=" + encodeURIComponent(texto);
    if (canal === "instagram") return "https://ig.me/m/" + destino;
    if (canal === "telefone") return "tel:+" + destino;
    if (canal === "email") return "mailto:" + destino + "?subject=" + encodeURIComponent(p.assunto || "") + "&body=" + encodeURIComponent(texto);
    return "#";
  }

  function painel(a) {
    if (R.estado === "por-carregar") carregar(); // vindo do Início ou de um aviso: completa os dados da barbearia
    const p = R.propostas[a.id];
    if (!p) return mold(topo() + (R.estado === "pronto" ? '<div class="vazio"><h3>Esta proposta já não existe</h3></div>' : '<div class="esqueleto"><i style="width:60%"></i></div>'));
    const c = lead(p) || { nome: "Barbearia", id: p.cliente_id }, can = canaisDe(c), ap = aprova(), editavel = ap && ["pendente", "aprovada"].includes(p.estado);
    let h = topo() + '<div class="prs-p-cab"><h2>' + esc(c.nome) + "</h2>" + pillTipo(p) + pillEstado(p.estado) + pillResp(p) + "</div>" +
      '<p class="muted prs-p-sub">' + esc(local(c)) + (c.zona_codigo ? " · zona " + esc(c.zona_codigo) : "") + (c.prioridade ? " · prioridade " + esc(c.prioridade) : "") + (c.score != null ? " · score " + c.score : "") +
      (demo ? "" : ' · <button class="c-link" data-acao="prs-cliente" data-id="' + esc(c.id) + '">Ver a ficha no CRM</button>') + "</p>";
    if (p.estado === "a_gerar") return mold(h + '<div class="aviso">' + (p.erro ? "A tentar outra vez: " + esc(p.erro) : "O agente está a preparar esta proposta. Aparece aqui assim que estiver pronta.") + '</div><div class="esqueleto"><i style="width:70%"></i><i style="width:50%"></i></div>');
    if (p.estado === "erro") return mold(h + '<div class="aviso erro">' + esc(p.erro || "Não foi possível preparar a proposta.") + "</div>" + (ap ? '<div class="acts"><button class="btn pri" data-acao="prs-gerar"' + (R.ocupado ? " disabled" : "") + ">Tentar de novo</button></div>" : ""));
    const seg = !!TIPOS_PR[p.tipo], ant = seg && p.anterior_id ? R.propostas[p.anterior_id] : null;
    if (seg) h += '<section class="p-sec"><h3>Porquê este seguimento</h3><p>' + esc(p.resumo || "A barbearia ainda não respondeu.") + "</p>" + (ant ? '<details class="prs-ant"><summary>Mensagem anterior</summary><div class="prs-msg-lida">' + esc(ant.mensagem) + "</div></details>" : "") +
      (p.estado === "enviada" ? "" : '<p class="muted">Texto do guião «' + (p.tipo === "seguimento1" ? "Follow-up 1" : "Follow-up 2") + '» da empresa. Podes ajustá-lo antes de aprovar.</p>') + "</section>";
    else if (p.resumo || (p.fontes || []).length) h += '<section class="p-sec"><h3>O que o agente encontrou</h3>' + (p.resumo ? "<p>" + esc(p.resumo) + "</p>" : "") +
      ((p.fontes || []).length ? '<p class="muted">Páginas lidas: ' + p.fontes.filter((u) => /^https?:\/\//i.test(u)).map((u) => '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")) + "</a>").join(", ") + "</p>" : '<p class="muted">Sem site para ler: a proposta usa só os dados da base.</p>') + "</section>";
    if (p.estado === "enviada") {
      h += '<div class="aviso ok">Enviada ' + esc(haQuanto(p.enviada_em)) + " por " + esc(nomeDe(p.enviada_por) || "—") + " (" + esc(CANAIS[p.canal]) + (p.destino ? " · " + esc(p.canal === "instagram" ? "@" + p.destino : p.canal === "email" ? p.destino : fmtTel(p.destino)) : "") + "). Ficou registada no CRM, com o seguimento para a visita.</div>";
      h += '<section class="p-sec"><h3>Mensagem enviada</h3>' + (p.assunto ? "<p><b>" + esc(p.assunto) + "</b></p>" : "") + '<div class="prs-msg-lida">' + esc(p.mensagem) + "</div></section>";
      if (p.respondeu_em) h += '<div class="aviso ok">A barbearia respondeu (marcado por ' + esc((nomeDe(p.respondeu_por) || "—").split(" ")[0]) + " " + esc(haQuanto(p.respondeu_em)) + ")" + (p.resposta ? ": «" + esc(p.resposta) + "»" : ".") + "</div>";
      else if (!Object.values(R.propostas).some((x) => x.cliente_id === p.cliente_id && x.respondeu_em))
        h += '<section class="p-sec"><h3>Resposta</h3><p class="muted">Se a barbearia respondeu (por mensagem, chamada ou na loja), marca aqui: os seguimentos param e ' + esc((nomeDe(R.cfg?.comercial_id) || "o comercial").split(" ")[0]) + " recebe um aviso para marcar a visita.</p>" +
          '<div class="prs-rejeitar"><input id="prs-resposta" placeholder="O que disseram? (opcional)" maxlength="500"><button class="btn pri" data-acao="prs-respondeu"' + (R.ocupado ? " disabled" : "") + ">" + I.check + "A barbearia respondeu</button></div></section>";
      return mold(h + (seg ? "" : visitaHTML(p)));
    }
    if (p.estado === "rejeitada") {
      h += '<div class="aviso">Rejeitada por ' + esc(nomeDe(p.aprovada_por) || "—") + " " + esc(haQuanto(p.aprovada_em)) + (p.motivo ? ": «" + esc(p.motivo) + "»" : ".") + "</div>" + '<div class="prs-msg-lida">' + esc(p.mensagem) + "</div>";
      return mold(h + (ap ? '<div class="acts"><button class="btn sec" data-acao="prs-reabrir">Reabrir</button></div>' : ""));
    }
    const r = rasc(p), canal = r.canal, dis = editavel ? "" : " disabled";
    h += '<section class="p-sec"><h3>Contacto principal</h3><div class="seg prs-canais" role="radiogroup" aria-label="Canal">' + Object.keys(CANAIS).filter((k) => can[k] && (!seg || k === p.canal)).map((k) =>
      '<button type="button" role="radio" aria-checked="' + (k === canal) + '" data-acao="prs-canal" data-v="' + k + '"' + dis + ">" + esc(CANAIS[k]) + "<small>" + esc(k === "instagram" ? "@" + can[k] : k === "email" ? can[k] : fmtTel(can[k])) + "</small></button>").join("") + "</div>" +
      (!seg && !r.mensagens[canal] && canal ? '<p class="muted">O agente não escreveu uma versão para este canal. Escreve-a ou carrega em «Preparar de novo».</p>' : "") + "</section>";
    const m = r.mensagens[canal];
    h += '<section class="p-sec"><h3>' + (canal === "telefone" ? "Guião da chamada" : "Mensagem") + "</h3>" + (canal === "email" ? '<div class="campo"><label for="prs-assunto">Assunto</label><input id="prs-assunto" maxlength="140" value="' + esc(m?.assunto || "") + '"' + dis + "></div>" : "") +
      '<textarea id="prs-msg" class="prs-msg" rows="' + (canal === "email" ? 12 : 8) + '"' + dis + ">" + esc(canal === "email" ? m?.corpo || "" : m || "") + '</textarea><small class="muted prs-conta" id="prs-conta">' + (canal === "email" ? m?.corpo || "" : m || "").length + " caracteres</small></section>";
    if (!seg) h += '<section class="p-sec"><h3>Questões a definir</h3>' + (r.perguntas.length ? '<div class="prs-perguntas">' + r.perguntas.map((q, i) => '<div class="campo"><label for="prs-q' + i + '">' + esc(q.texto) + '</label><input id="prs-q' + i + '" data-prs-perg="' + i + '" value="' + esc(q.resposta || "") + '" placeholder="A tua decisão (opcional)"' + dis + "></div>").join("") + "</div>" : '<p class="muted">Sem questões para esta barbearia.</p>') +
      (editavel ? '<div class="acts"><button class="btn sec" data-acao="prs-gerar"' + (R.ocupado ? " disabled" : "") + ">" + (R.ocupado === "gerar" ? "A preparar…" : "Preparar de novo com as respostas") + "</button></div>" : "") + "</section>";
    if (!seg) h += visitaHTML(p);
    if (!ap) return mold(h + '<p class="muted">Quem aprova: ' + esc(nomesAprovadores()) + ".</p>");
    let pe = "";
    if (R.rejeitar) pe = '<div class="prs-rejeitar"><input id="prs-motivo" placeholder="Porquê? (opcional, ex.: já é cliente de outra marca)" maxlength="300"><button class="btn sec" data-acao="prs-rejeitar-nao">Cancelar</button><button class="btn perigo" data-acao="prs-rejeitar-sim">Rejeitar</button></div>';
    else if (p.estado === "aprovada") {
      const texto = canal === "email" ? m?.corpo || "" : m || "";
      pe = '<span class="muted prs-pe-txt">Aprovada' + (p.aprovada_por ? " por " + esc((nomeDe(p.aprovada_por) || "").split(" ")[0]) : "") + ". " + (canal === "email" ? "Se o email não saiu, envia-o pelo teu programa de email." : "Depois de enviares, confirma aqui.") + "</span>" +
        (canal === "email" ? '<button class="btn sec" data-acao="prs-enviar"' + (R.ocupado ? " disabled" : "") + ">Enviar pela app</button>" : "") +
        '<a class="btn sec" href="' + esc(linkCanal(canal, can[canal], { assunto: m?.assunto }, texto)) + '" target="_blank" rel="noopener" data-acao="prs-abrir-canal">' + (canal === "telefone" ? "Ligar" : "Abrir " + esc(CANAIS[canal])) + "</a>" +
        '<button class="btn pri" data-acao="prs-feito">' + I.check + (canal === "telefone" ? "Já liguei" : "Já enviei") + "</button>";
    } else {
      const texto = canal === "email" ? m?.corpo || "" : m || "";
      const rot = canal === "email" ? "Aprovar e enviar email" : canal === "telefone" ? "Aprovar e ligar" : "Aprovar e abrir " + CANAIS[canal];
      pe = '<button class="btn sec" data-acao="prs-rejeitar">Rejeitar</button><button class="btn sec" data-acao="prs-guardar-p">Guardar</button>' +
        (canal === "email" ? '<button class="btn pri" data-acao="prs-aprovar"' + (R.ocupado ? " disabled" : "") + ">" + I.check + rot + "</button>"
          : '<a class="btn pri" href="' + esc(linkCanal(canal, can[canal], {}, texto)) + '" target="_blank" rel="noopener" data-acao="prs-aprovar" id="prs-aprovar-link">' + I.check + esc(rot) + "</a>");
    }
    return mold(h, pe);
  }
  const visitaHTML = (p) => (p.perguntas_visita || []).length ? '<section class="p-sec"><h3>Perguntas para a barbearia</h3><ul class="prs-visita">' + p.perguntas_visita.map((q) => "<li>" + esc(q) + "</li>").join("") + '</ul><button class="btn sec" data-acao="prs-copiar-visita">' + I.copiar + "Copiar</button></section>" : "";

  function camposAtuais(p) {
    const r = rasc(p), canal = r.canal, m = r.mensagens[canal];
    return { canal, assunto: canal === "email" ? m?.assunto || "" : "", mensagem: canal === "email" ? m?.corpo || "" : m || "", perguntas: r.perguntas };
  }
  async function aprovar(p) {
    const c = lead(p), can = canaisDe(c || {}), campos = camposAtuais(p);
    if (!campos.mensagem.trim()) { toast("A mensagem está vazia.", true); return; }
    R.ocupado = "aprovar";
    try {
      const novo = await api.prs.decidir(p.id, "aprovar", campos);
      R.propostas[p.id] = { ...p, ...novo, destino: can[campos.canal] || p.destino };
      if (campos.canal === "email") {
        try { R.propostas[p.id] = { ...R.propostas[p.id], ...(await api.prs.enviarEmail(p.id)) }; toast("Email enviado a " + c.nome + ". Ficou registado no CRM."); }
        catch (e) { toast("Aprovada, mas o email não saiu: " + (e.message || e), true); }
      } else if (campos.canal === "instagram") toast("Mensagem copiada. Cola-a na conversa do Instagram e envia; depois carrega em «Já enviei».");
      else toast(campos.canal === "telefone" ? "Liga e, no fim, carrega em «Já liguei»." : "Envia a mensagem no WhatsApp e, depois, carrega em «Já enviei».");
    } catch (e) { falha(e); }
    R.ocupado = false; render(); renderPainel(true);
  }
  async function gerar(p) {
    R.ocupado = "gerar"; renderPainel(true);
    const r = R.rasc[p.id];
    try {
      const novo = await api.prs.gerar(p.id, (r?.perguntas || p.perguntas || []).map((q) => ({ texto: q.texto, resposta: q.resposta || "" })));
      R.propostas[p.id] = novo; delete R.rasc[p.id]; toast("Proposta preparada de novo.");
    } catch (e) { falha(e); R.estado === "pronto" && (R.propostas[p.id] = { ...p }); }
    R.ocupado = false; render(); renderPainel(true);
  }

  function clique(acao, el) {
    const p = S.aberto?.tipo === "proposta" ? R.propostas[S.aberto.id] : null;
    switch (acao) {
      case "prs-tab": R.tab = el.dataset.tab; location.hash = R.tab === "propostas" ? "prospecao" : "prospecao-" + R.tab; return true;
      case "prs-filtro": R.filtro = el.dataset.v; R.pag = 1; render(); return true;
      case "prs-pag": R.pag = +el.dataset.p; render(); return true;
      case "prs-pag-b": R.pagB = +el.dataset.p; render(); return true;
      case "prs-f-estado": R.fEstado = el.dataset.v; R.pagB = 1; render(); return true;
      case "prs-ver-zona": R.fZona = el.dataset.v; R.fEstado = ""; R.q = ""; R.pagB = 1; R.tab = "barbearias"; location.hash = "prospecao-barbearias"; return true;
      case "prs-cliente": abrirCliente(el.dataset.id); return true;
      case "prs-abrir": R.rejeitar = false; abrir({ tipo: "proposta", id: el.dataset.id }); return true;
      case "prs-excl-ver": verExcluidos(1); return true;
      case "prs-excl-pag": verExcluidos(+el.dataset.p); return true;
      case "prs-recuperar": api.prs.recuperar(el.dataset.chave).then(() => { R.excluidos--; toast("Passou para o CRM como lead «A validar»."); R.estado = "por-carregar"; carregar(); verExcluidos(R.excl?.pag || 1); }).catch(falha); return true;
      case "prs-importar": importar(); return true;
      case "prs-guardar": guardarDefinicoes(); return true;
      case "prs-pesquisar": acaoServidor("pesquisar"); return true;
      case "prs-semana": acaoServidor("semana"); return true;
      case "prs-canal": if (p) { rasc(p).canal = el.dataset.v; renderPainel(true); } return true;
      case "prs-gerar": if (p && !R.ocupado) gerar(p); return true;
      case "prs-guardar-p": if (p) api.prs.decidir(p.id, "guardar", camposAtuais(p)).then((x) => { R.propostas[p.id] = { ...p, ...x }; toast("Guardado."); }).catch(falha); return true;
      case "prs-aprovar": {
        if (!p || R.ocupado) return true;
        if (rasc(p).canal === "instagram") { const t = camposAtuais(p).mensagem; navigator.clipboard?.writeText(t).catch(() => {}); }
        aprovar(p); return true; // o link (WhatsApp, Instagram, telefone) abre no próprio clique
      }
      case "prs-abrir-canal": if (p && rasc(p).canal === "instagram") navigator.clipboard?.writeText(camposAtuais(p).mensagem).catch(() => {}); return true;
      case "prs-enviar": if (p && !R.ocupado) { R.ocupado = "enviar"; renderPainel(true); api.prs.enviarEmail(p.id).then((x) => { R.propostas[p.id] = { ...p, ...x }; toast("Email enviado. Ficou registado no CRM."); }).catch(falha).finally(() => { R.ocupado = false; render(); renderPainel(true); }); } return true;
      case "prs-feito": if (p) api.prs.registarEnvio(p.id, CANAIS[p.canal]).then((x) => { R.propostas[p.id] = { ...p, ...x }; const c = lead(p); if (c) c.etapa = c.etapa === "lead" ? "contactado" : c.etapa; toast("Registado no CRM: " + (c?.nome || "barbearia") + " passou a «Contactado», com o seguimento da visita."); render(); renderPainel(true); }).catch(falha); return true;
      case "prs-rejeitar": R.rejeitar = true; renderPainel(true); setTimeout(() => $("#prs-motivo")?.focus(), 30); return true;
      case "prs-rejeitar-nao": R.rejeitar = false; renderPainel(true); return true;
      case "prs-rejeitar-sim": if (p) api.prs.decidir(p.id, "rejeitar", { motivo: $("#prs-motivo")?.value.trim() || "" }).then((x) => { R.propostas[p.id] = { ...p, ...x }; R.rejeitar = false; render(); renderPainel(true); toast("Proposta rejeitada."); }).catch(falha); return true;
      case "prs-respondeu": if (p && !R.ocupado) {
        R.ocupado = "respondeu";
        api.prs.respondeu(p.id, ($("#prs-resposta")?.value || "").trim()).then((x) => {
          R.propostas[p.id] = { ...p, ...x };
          Object.values(R.propostas).forEach((o) => { if (o.cliente_id === p.cliente_id && o.tipo && o.tipo !== "inicial" && ["pendente", "aprovada", "a_gerar", "erro"].includes(o.estado)) Object.assign(o, { estado: "rejeitada", motivo: "A barbearia respondeu" }); });
          toast("Registado. Os seguimentos param e o comercial recebe um aviso.");
        }).catch(falha).finally(() => { R.ocupado = false; render(); renderPainel(true); });
      } return true;
      case "prs-reabrir": if (p) api.prs.decidir(p.id, "reabrir").then((x) => { R.propostas[p.id] = { ...p, ...x }; render(); renderPainel(true); }).catch(falha); return true;
      case "prs-copiar-visita": if (p) navigator.clipboard?.writeText((p.perguntas_visita || []).map((q) => "- " + q).join("\n")).then(() => toast("Perguntas copiadas.")).catch(() => toast("Não foi possível copiar.", true)); return true;
    }
    return false;
  }
  async function acaoServidor(qual) {
    R.ocupado = qual; render();
    try {
      const r = qual === "pesquisar" ? await api.prs.pesquisarAgora() : await api.prs.semanaAgora();
      toast(qual === "pesquisar" ? (r.novos ? r.novos + " barbearias novas em " + (r.distritos || []).join(", ") + "." : "Não apareceram barbearias novas em " + (r.distritos || []).join(", ") + ".")
        : (r.propostas ? r.propostas + " barbearias escolhidas. O agente está a preparar as propostas: recebes um aviso quando estiverem prontas." : "Não há barbearias com contacto por abordar."));
      R.estado = "por-carregar"; await carregar();
    } catch (e) { falha(e); }
    R.ocupado = false; render();
  }
  async function guardarDefinicoes() {
    const linhas = (id) => ($(id)?.value || "").split("\n").map((x) => x.trim()).filter(Boolean);
    const guioes = (R.cfg.guioes || []).map((g, i) => ({ tipo: g.tipo, texto: $("#prs-g" + i)?.value ?? g.texto }));
    const campos = {
      ativo: $("#prs-ativo").checked, por_semana: Math.max(0, Math.min(200, +$("#prs-por").value || 0)), dia_semana: +$("#prs-dia").value, hora: +$("#prs-hora").value,
      aprovadores: [...document.querySelectorAll("[data-prs-aprov]")].filter((x) => x.checked).map((x) => x.dataset.prsAprov),
      comercial_id: $("#prs-comercial").value || null, email_resposta: $("#prs-resp").value.trim(), assinatura: $("#prs-assin").value.trim(), oferta: $("#prs-oferta").value.trim(),
      perguntas_internas: linhas("#prs-qint"), perguntas_barbearia: linhas("#prs-qbar"), guioes, pesquisa_auto: $("#prs-pauto").checked,
      max_novos: Math.max(0, Math.min(500, +$("#prs-maxn").value || 0)), ...("seguimento1_dias" in R.cfg ? { seguimentos: $("#prs-seg").checked, seguimento1_dias: Math.max(1, Math.min(60, +$("#prs-seg1").value || 4)), seguimento2_dias: Math.max(1, Math.min(60, +$("#prs-seg2").value || 5)) } : {}), distritos: [...document.querySelectorAll("[data-prs-dist]")].filter((x) => x.checked).map((x) => x.dataset.prsDist),
    };
    if (campos.email_resposta && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(campos.email_resposta)) { toast("O email para as respostas não parece válido.", true); return; }
    try { R.cfg = await api.prs.guardarConfig(campos); render(); toast("Definições guardadas."); } catch (e) { falha(e); }
  }

  function escrever(e) {
    const t = e.target;
    if (t.id === "prs-q") { R.q = t.value; R.pagB = 1; const pos = t.selectionStart; render(); const x = $("#prs-q"); if (x) { x.focus(); x.setSelectionRange(pos, pos); } return true; }
    if (t.id === "prs-excl-q") { R.excl.q = t.value; clearTimeout(R.tExcl); R.tExcl = setTimeout(() => { verExcluidos(1).then(() => { const x = $("#prs-excl-q"); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }); }, 350); return true; }
    const p = S.aberto?.tipo === "proposta" ? R.propostas[S.aberto.id] : null;
    if (p && (t.id === "prs-msg" || t.id === "prs-assunto")) {
      const r = rasc(p), canal = r.canal;
      if (canal === "email") r.mensagens.email = { assunto: $("#prs-assunto")?.value || "", corpo: $("#prs-msg")?.value || "" }; else r.mensagens[canal] = t.value;
      const cnt = $("#prs-conta"); if (cnt) cnt.textContent = ($("#prs-msg")?.value || "").length + " caracteres";
      const a = $("#prs-aprovar-link"); if (a && canal !== "email") a.href = linkCanal(canal, canaisDe(lead(p) || {})[canal], {}, $("#prs-msg").value);
      return true;
    }
    if (p && t.dataset.prsPerg != null) { rasc(p).perguntas[+t.dataset.prsPerg].resposta = t.value; return true; }
    return false;
  }
  function mudar(e) {
    const t = e.target;
    if (t.id === "prs-ficheiro" && t.files?.[0]) { lerFicheiro(t.files[0]); return true; }
    if (t.id === "prs-f-distrito") { R.fDistrito = t.value; R.pagB = 1; render(); return true; }
    if (t.id === "prs-f-zona") { R.fZona = t.value; R.pagB = 1; render(); return true; }
    if (t.id === "prs-plano") {
      let v = t.value; if (v) { const [a, m, d] = v.split("-").map(Number); const dt = new Date(a, m - 1, d, 12); dt.setDate(dt.getDate() - ((dt.getDay() || 7) - 1)); v = ymd(dt); }
      api.prs.guardarConfig({ plano_inicio: v || null }).then((c) => { R.cfg = c; render(); toast(v ? "O plano começa a " + fmtData(v) + "." : "Plano sem data."); }).catch(falha); return true;
    }
    if (t.dataset?.prsZona) { api.prs.guardarZona(t.dataset.prsZona, { estado: t.value }).then((z) => { R.zonas = R.zonas.map((x) => (x.codigo === z.codigo ? z : x)); }).catch(falha); return true; }
    return false;
  }

  /* ============================== Início e contagens ============================== */
  function blocoInicio() {
    if (!pode()) return "";
    if (R.estado === "por-carregar") carregarResumo();
    if (!temPendentes() || !aprova()) return "";
    const l = lista("pendente"); if (!l.length) return "";
    return '<section class="cartao-sec prs-inicio" data-marca="twentysix"><h3>Prospeção <span class="mono muted">' + l.length + ' por aprovar</span> <a class="c-link" href="#prospecao" style="font-size:13px;margin-left:8px">Abrir</a></h3><div class="prs-lista prs-lista-mini">' +
      l.slice(0, 3).map(cartao).join("") + "</div></section>";
  }
  const contagem = () => (temPendentes() && aprova() ? lista("pendente").length : 0);
  function reiniciar() { if (desligar) { desligar(); desligar = null; } resumo = "por-carregar"; Object.assign(R, { estado: "por-carregar", cfg: null, propostas: {}, balancos: [], zonas: [], leads: {}, rasc: {}, imp: null, excl: null, ocupado: false, rejeitar: false }); }

  const hashAtual = () => "#prospecao" + (R.tab && R.tab !== "propostas" ? "-" + R.tab : "");
  return { vista, painel, clique, escrever, mudar, submeter: async () => false, carregar, blocoInicio, contagem, reiniciar, estado: () => R.estado, hashAtual };
}
