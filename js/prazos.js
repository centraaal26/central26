// Central 26 — Seguros e viaturas: datas dos seguros, revisões, inspeções e IUC, com avisos antes de cada data.
import { ymd, normalizar, eGestor, MES, MES_L, paginar, paginador, haQuanto } from "./dados.js";

export const podePrazos = (eu) => !!eu && (eGestor(eu) || ["administrativo", "logistica"].includes(eu.departamento_id));

export const TIPOS_PRZ = {
  seguro: { nome: "Seguro", pl: "Seguros", feito: "Renovado", ent: "Seguradora", ref: "N.º da apólice", repetir: "anual", avisar: 30 },
  revisao: { nome: "Revisão", pl: "Revisões", feito: "Feita", ent: "Oficina", ref: "N.º do processo", repetir: "anual", avisar: 15 },
  inspecao: { nome: "Inspeção", pl: "Inspeções", feito: "Feita", ent: "Centro de inspeção", ref: "Referência", repetir: "anual", avisar: 30 },
  iuc: { nome: "IUC", pl: "IUC", feito: "Pago", ent: "Entidade", ref: "Referência", repetir: "anual", avisar: 15 },
  outro: { nome: "Outro", pl: "Outros", feito: "Feito", ent: "Entidade", ref: "Referência", repetir: "nao", avisar: 15 },
};
const REPETIR = { nao: "Não se repete", mensal: "Todos os meses", trimestral: "De 3 em 3 meses", semestral: "De 6 em 6 meses", anual: "Todos os anos", bienal: "De 2 em 2 anos" };
const MESES_REP = { mensal: 1, trimestral: 3, semestral: 6, anual: 12, bienal: 24 };
const AVISAR = [0, 3, 7, 15, 30, 45, 60, 90];
const n = (s) => normalizar(s).replace(/\s+/g, " ").trim();
const euros = (v) => Number(v).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
const fmtKm = (v) => Number(v).toLocaleString("pt-PT") + " km";

// Datas sempre no dia local (sem horas)
const dataDe = (s) => { const [a, m, d] = String(s).split("-").map(Number); return new Date(a, m - 1, d); };
const hojeD = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const diasAte = (s) => Math.round((dataDe(s) - hojeD()) / 864e5);
const fmtData = (s) => { const d = dataDe(s); return d.getDate() + " " + MES[d.getMonth()] + " " + d.getFullYear(); };
const fmtDataL = (s) => { const d = dataDe(s); return d.getDate() + " de " + MES_L[d.getMonth()] + " de " + d.getFullYear(); };
function somarMeses(s, meses) {
  const d = dataDe(s), dia = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + meses);
  d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return ymd(d);
}
export function rotDias(x) {
  if (x < -1) return "há " + -x + " dias";
  if (x === -1) return "ontem";
  if (x === 0) return "hoje";
  if (x === 1) return "amanhã";
  if (x < 60) return "daqui a " + x + " dias";
  const m = Math.round(x / 30.4);
  return "daqui a " + m + " meses";
}

export function criarPrazos(ctx) {
  const { S, api, esc, I, toast, falha, render, agendarRender, renderPainel, abrir, fechar, nomeDe, ativos, av, $ } = ctx;
  const P = (S.prz = { estado: "por-carregar", viaturas: {}, prazos: {}, config: null, tab: "prazos", tipo: "", q: "", pagMais: 1, pagHist: 1, confirmar: false });
  let desligar = null;

  async function carregar() {
    if (P.estado === "a-carregar") return;
    P.estado = "a-carregar";
    try {
      if (!api.prz) throw new Error("A app foi atualizada a meio. Recarrega a página para terminar a atualização.");
      const d = await api.prz.carregar();
      P.viaturas = Object.fromEntries(d.viaturas.map((v) => [v.id, v]));
      P.prazos = Object.fromEntries(d.prazos.map((p) => [p.id, p]));
      P.config = d.config || { avisar: [], hora: 9 };
      P.estado = "pronto";
      if (!desligar && api.prz.subscrever) desligar = api.prz.subscrever(aoMudar);
    } catch (e) { P.estado = /PGRST20|prz_|Could not find|does not exist/i.test(String(e?.message)) ? "falta-script" : "erro"; P.erro = e.message; }
    agendarRender();
    if (["prazo", "viatura"].includes(S.aberto?.tipo)) renderPainel(true);
  }
  function aoMudar(t, ev, novo, antigo) {
    const col = t === "prazo" ? P.prazos : P.viaturas;
    if (ev === "DELETE") delete col[antigo.id]; else col[novo.id] = novo;
    agendarRender();
    if (["prazo", "viatura"].includes(S.aberto?.tipo)) renderPainel();
  }

  const pode = () => podePrazos(S.eu);
  const ativos_ = () => Object.values(P.prazos).filter((p) => p.estado === "ativo" && (!p.viatura_id || P.viaturas[p.viatura_id]?.ativo !== false));
  const ordenarData = (l) => l.sort((a, b) => a.data.localeCompare(b.data) || a.titulo.localeCompare(b.titulo, "pt"));
  const viaturasL = (todas) => Object.values(P.viaturas).filter((v) => todas || v.ativo).sort((a, b) => (b.ativo - a.ativo) || a.nome.localeCompare(b.nome, "pt"));
  const nomeViatura = (id) => { const v = P.viaturas[id]; return v ? v.nome + (v.matricula ? " (" + v.matricula + ")" : "") : ""; };
  const precisaAtencao = (p) => { const d = diasAte(p.data); return d <= Math.max(7, p.avisar_dias); };
  const nivel = (p) => { const d = diasAte(p.data); return d < 0 ? "atraso" : d <= 7 ? "perto" : d <= p.avisar_dias ? "aviso" : "ok"; };
  // «Revisão · Carrinha de entregas» dentro da própria viatura fica só «Revisão»
  const tituloCurto = (p) => { const v = P.viaturas[p.viatura_id]; return v && p.titulo.endsWith(" · " + v.nome) ? p.titulo.slice(0, -(" · " + v.nome).length) : p.titulo; };
  const subViatura = (p) => { const v = P.viaturas[p.viatura_id]; if (!v) return ""; return p.titulo.includes(v.nome) ? v.matricula || "" : nomeViatura(p.viatura_id); };
  const pill = (tipo) => '<span class="prz-pill t-' + tipo + '">' + esc(TIPOS_PRZ[tipo]?.nome || tipo) + "</span>";
  const matricula = (m) => (m ? '<span class="prz-mat">' + esc(m) + "</span>" : "");

  /* ============================== Vistas ============================== */
  function vista(param) {
    if (P.estado === "por-carregar") carregar();
    if (param !== P.ultimoParam) { P.ultimoParam = param; P.tab = ["viaturas", "historico", "avisos"].includes(param) ? param : "prazos"; }
    const g = eGestor(S.eu);
    const acao = P.estado !== "pronto" || !pode() ? "" : P.tab === "viaturas" ? '<button class="btn pri" data-acao="prz-viatura-nova">' + I.plus + "Nova viatura</button>" : '<button class="btn pri" data-acao="prz-novo">' + I.plus + "Novo prazo</button>";
    let h = '<div class="cab" data-marca="grupo"><div><div class="eyebrow">Grupo 26</div><h1>Seguros e viaturas</h1><p class="sub-cab">As datas dos seguros, das revisões, das inspeções e do IUC. A Central avisa no telemóvel antes de cada data e volta a avisar até alguém a marcar como tratada.</p></div>' +
      (acao ? '<div class="acts">' + acao + "</div>" : "") + "</div>";
    const tabs = [["prazos", "Prazos"], ["viaturas", "Viaturas"], ["historico", "Histórico"]].concat(g ? [["avisos", "Avisos"]] : []);
    h += '<div class="tabs" role="tablist">' + tabs.map(([k, r]) => '<button class="tab" role="tab" data-acao="prz-tab" data-tab="' + k + '" aria-selected="' + (P.tab === k) + '">' + r + "</button>").join("") + "</div>";
    if (P.estado === "falta-script") return h + '<div class="vazio"><h3>Falta instalar os Seguros e viaturas na base de dados</h3><p>No Supabase, abre o SQL Editor, cola o ficheiro <b>supabase/15-seguros-viaturas.sql</b> do GitHub e carrega em Run. Depois recarrega esta página.</p></div>';
    if (P.estado === "erro") return h + '<div class="aviso erro">Não foi possível abrir os Seguros e viaturas: ' + esc(P.erro || "") + "</div>";
    if (P.estado !== "pronto") return h + '<div class="tabela"><div class="esqueleto"><i style="width:50%"></i></div></div>';
    if (P.tab === "viaturas") return h + vistaViaturas();
    if (P.tab === "historico") return h + vistaHistorico();
    if (P.tab === "avisos" && g) return h + vistaAvisos();
    return h + vistaPrazos();
  }

  function linhaPrazo(p, compacta) {
    const d = diasAte(p.data), nv = nivel(p), dt = dataDe(p.data), tp = TIPOS_PRZ[p.tipo] || TIPOS_PRZ.outro;
    const sub = [compacta === "viatura" ? "" : subViatura(p), p.entidade, p.referencia ? tp.ref.replace(/^N\.º d[ao] /, "") + " " + p.referencia : "", p.valor != null && !compacta ? euros(p.valor) : ""].filter(Boolean);
    return '<div class="prz-linha n-' + nv + '"><button class="prz-t" data-acao="prz-abrir" data-id="' + p.id + '">' +
      '<span class="prz-data" aria-hidden="true"><b>' + dt.getDate() + "</b><small>" + MES[dt.getMonth()] + (dt.getFullYear() !== new Date().getFullYear() ? " " + String(dt.getFullYear()).slice(2) : "") + "</small></span>" +
      '<span class="prz-txt"><b>' + esc(compacta === "viatura" ? tituloCurto(p) : p.titulo) + "</b><small>" + pill(p.tipo) + (sub.length ? " " + esc(sub.join(" · ")) : "") + "</small></span>" +
      '<span class="prz-quando"><b>' + esc(rotDias(d)) + "</b><small>" + (d < 0 ? "em atraso" : fmtData(p.data)) + "</small></span>" +
      (p.responsavel_id && !compacta ? '<span class="prz-resp" title="' + esc(nomeDe(p.responsavel_id) || "") + '">' + av(p.responsavel_id) + "</span>" : "") +
      '</button><button class="btn ' + (d <= 7 ? "pri" : "sec") + ' prz-feito" data-acao="prz-tratar" data-id="' + p.id + '">' + I.check + tp.feito + "</button></div>";
  }

  function vistaPrazos() {
    const todos = ativos_(), q = n(P.q);
    const atraso = todos.filter((p) => diasAte(p.data) < 0).length, prox = todos.filter((p) => { const d = diasAte(p.data); return d >= 0 && d <= 30; }).length;
    let h = '<div class="resumo-crm resumo-eq"><div class="kpi' + (atraso ? " alerta-kpi" : "") + '"><span>Em atraso</span><b>' + atraso + '</b></div><div class="kpi"><span>Próximos 30 dias</span><b>' + prox +
      '</b></div><div class="kpi"><span>Seguros ativos</span><b>' + todos.filter((p) => p.tipo === "seguro").length + '</b></div><div class="kpi"><span>Viaturas</span><b>' + viaturasL().length + "</b></div></div>";
    if (!todos.length) {
      return h + '<div class="vazio"><h3>Ainda não há prazos</h3><p>Começa por registar as viaturas (com as datas do seguro, da revisão, da inspeção e do IUC) e depois os outros seguros da empresa, como o multirriscos ou o de acidentes de trabalho.</p>' +
        (pode() ? '<div class="acts"><button class="btn pri" data-acao="prz-viatura-nova">' + I.plus + 'Nova viatura</button><button class="btn sec" data-acao="prz-novo">' + I.plus + "Novo seguro ou prazo</button></div>" : "") + "</div>";
    }
    const conta = (t) => todos.filter((p) => p.tipo === t).length;
    h += '<div class="barra"><div class="ferr ferr-aud"><label class="pesq stk-pesq">' + I.lupa + '<span class="sr">Procurar</span><input id="prz-q" type="search" placeholder="Procurar por nome, viatura, matrícula, seguradora…" value="' + esc(P.q) + '"></label></div></div>';
    h += '<div class="chips-marca" role="tablist" aria-label="Tipo">' + [["", "Todos", todos.length]].concat(Object.keys(TIPOS_PRZ).filter(conta).map((t) => [t, TIPOS_PRZ[t].pl, conta(t)]))
      .map(([k, r, c]) => '<button class="chip-m' + (P.tipo === k ? " on" : "") + '" role="tab" aria-selected="' + (P.tipo === k) + '" data-acao="prz-tipo" data-v="' + k + '">' + esc(r) + ' <span class="n">' + c + "</span></button>").join("") + "</div>";
    const l = ordenarData(todos.filter((p) => (!P.tipo || p.tipo === P.tipo) && (!q || n([p.titulo, p.entidade, p.referencia, p.notas, nomeViatura(p.viatura_id), TIPOS_PRZ[p.tipo]?.nome].join(" ")).includes(q))));
    if (!l.length) return h + '<div class="vazio"><h3>Nada encontrado</h3><p>Experimenta outro nome ou outro tipo.</p></div>';
    const grupos = [["Em atraso", l.filter((p) => diasAte(p.data) < 0)], ["Próximos 30 dias", l.filter((p) => { const d = diasAte(p.data); return d >= 0 && d <= 30; })], ["Mais tarde", l.filter((p) => diasAte(p.data) > 30)]];
    for (const [tit, g] of grupos) {
      if (!g.length) continue;
      let itens = g, pag = "";
      if (tit === "Mais tarde") { const pg = paginar(g, P.pagMais, 15); P.pagMais = pg.pag; itens = pg.itens; pag = paginador(pg, "prz-pag", "prazos"); }
      h += '<section class="prz-sec"><h2>' + tit + ' <span class="n">' + g.length + '</span></h2><div class="prz-lista">' + itens.map((p) => linhaPrazo(p)).join("") + "</div>" + pag + "</section>";
    }
    return h;
  }

  function vistaViaturas() {
    const l = viaturasL(true);
    if (!l.length) return '<div class="vazio"><h3>Ainda não há viaturas</h3><p>Regista cada carro ou carrinha da empresa com a matrícula e as datas do seguro, da revisão, da inspeção e do IUC. A Central avisa antes de cada uma.</p>' +
      (pode() ? '<div class="acts"><button class="btn pri" data-acao="prz-viatura-nova">' + I.plus + "Nova viatura</button></div>" : "") + "</div>";
    return '<div class="prz-viaturas">' + l.map((v) => {
      const pz = ordenarData(Object.values(P.prazos).filter((p) => p.viatura_id === v.id && p.estado === "ativo"));
      const pior = pz.some((p) => diasAte(p.data) < 0) ? "atraso" : pz.some((p) => diasAte(p.data) <= 7) ? "perto" : "";
      return '<article class="prz-vcard' + (v.ativo ? "" : " inativo") + (pior ? " n-" + pior : "") + '"><button class="prz-v-cab" data-acao="prz-viatura" data-id="' + v.id + '"><span class="prz-v-nome"><b>' + esc(v.nome) + "</b><small>" +
        esc([v.modelo, v.km != null ? fmtKm(v.km) : "", v.ativo ? "" : "já não é da empresa"].filter(Boolean).join(" · ") || "Sem modelo registado") + "</small></span>" + matricula(v.matricula) + "</button>" +
        '<div class="prz-v-lista">' + (pz.length ? pz.map((p) => { const d = diasAte(p.data); return '<button class="prz-v-item n-' + nivel(p) + '" data-acao="prz-abrir" data-id="' + p.id + '">' + pill(p.tipo) + '<span class="t">' + esc(tituloCurto(p)) + '</span><span class="q">' + esc(fmtData(p.data)) + "<small>" + esc(rotDias(d)) + "</small></span></button>"; }).join("")
          : '<p class="muted">Sem datas registadas.</p>') + "</div>" +
        '<div class="prz-v-pe">' + (v.responsavel_id ? '<span class="prz-v-resp">' + av(v.responsavel_id) + esc((nomeDe(v.responsavel_id) || "").split(" ")[0]) + "</span>" : '<span class="muted">Sem responsável</span>') +
        (pode() ? '<button class="btn sec" data-acao="prz-novo" data-viatura="' + v.id + '">' + I.plus + "Data</button>" : "") + "</div></article>";
    }).join("") + "</div>";
  }

  function vistaHistorico() {
    const l = Object.values(P.prazos).filter((p) => p.estado === "tratado").sort((a, b) => String(b.tratado_em).localeCompare(String(a.tratado_em)));
    if (!l.length) return '<div class="vazio"><h3>Ainda não há histórico</h3><p>Cada seguro renovado, revisão ou inspeção feita fica registado aqui, com quem a marcou e quando.</p></div>';
    const pg = paginar(l, P.pagHist, 25); P.pagHist = pg.pag;
    return '<div class="prz-lista">' + pg.itens.map((p) => {
      const tp = TIPOS_PRZ[p.tipo] || TIPOS_PRZ.outro;
      return '<div class="prz-linha n-feito"><button class="prz-t" data-acao="prz-abrir" data-id="' + p.id + '"><span class="prz-txt"><b>' + esc(p.titulo) + "</b><small>" + pill(p.tipo) + " " +
        esc([p.viatura_id ? nomeViatura(p.viatura_id) : "", "data " + fmtData(p.data), p.entidade, p.valor != null ? euros(p.valor) : ""].filter(Boolean).join(" · ")) + "</small>" +
        (p.tratado_nota ? '<small class="prz-nota">«' + esc(p.tratado_nota) + "»</small>" : "") + "</span>" +
        '<span class="prz-quando"><b>' + esc(tp.feito) + "</b><small>" + esc((nomeDe(p.tratado_por) || "alguém").split(" ")[0]) + " · " + esc(haQuanto(p.tratado_em)) + "</small></span></button>" +
        (pode() ? '<button class="btn sec prz-feito" data-acao="prz-reabrir" data-id="' + p.id + '">Reabrir</button>' : "") + "</div>";
    }).join("") + "</div>" + paginador(pg, "prz-pag-hist", "registos");
  }

  function vistaAvisos() {
    const c = P.config, pessoas = ativos().slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt")), sel = new Set(c.avisar || []);
    const horas = Array.from({ length: 24 }, (_, i) => '<option value="' + i + '"' + (i === c.hora ? " selected" : "") + ">" + String(i).padStart(2, "0") + ":00</option>").join("");
    return '<section class="cartao-sec"><h3>Quando avisa</h3><ul class="sem-tarefas"><li>Quando faltam os dias escolhidos em cada prazo (por exemplo, 30 dias antes de um seguro).</li><li>Na última semana, na véspera e no próprio dia.</li><li>Se a data passar, uma vez por semana até alguém o marcar como tratado.</li></ul>' +
      '<div class="campos-3"><div class="campo"><label for="prz-hora">Hora dos avisos</label><select id="prz-hora" class="sel">' + horas + "</select></div></div></section>" +
      '<section class="cartao-sec"><h3>Quem recebe</h3><p>O responsável de cada prazo e o responsável da viatura recebem sempre. Escolhe aqui quem recebe também todos os avisos. Se não houver ninguém (nem responsável), recebe a direção e a administração.</p>' +
      '<div class="stk-pessoas">' + pessoas.map((p) => '<label class="chk-txt stk-pessoa"><input type="checkbox" data-prz-avisar="' + p.id + '"' + (sel.has(p.id) ? " checked" : "") + "> " + av(p.id) + "<span>" + esc(p.nome) + "</span></label>").join("") + "</div>" +
      '<div class="acts"><button class="btn pri" data-acao="prz-guardar-avisos">Guardar</button></div></section>';
  }

  /* ============================== Painéis ============================== */
  const mold = (label, c) => '<div class="veu" data-acao="fechar"></div><aside class="painel" role="dialog" aria-label="' + esc(label) + '" data-marca="grupo"><div class="p-scroll">' + c + "</div></aside>";
  const topo = (apagar) => '<div class="p-topo"><span class="migalha"><i></i>Seguros e viaturas</span><span class="acts">' + (apagar && eGestor(S.eu) ? '<button class="ib perigo" data-acao="' + apagar + '">' + I.lixo + "Eliminar</button>" : "") + '<button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + "</button></span></div>";
  const opcoesPessoas = (atual, vazio) => '<option value="">' + vazio + "</option>" + ativos().slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt")).map((p) => '<option value="' + p.id + '"' + (p.id === atual ? " selected" : "") + ">" + esc(p.nome) + "</option>").join("");
  const opcoesViaturas = (atual) => '<option value="">Nenhuma (seguro ou prazo da empresa)</option>' + viaturasL(true).filter((v) => v.ativo || v.id === atual).map((v) => '<option value="' + v.id + '"' + (v.id === atual ? " selected" : "") + ">" + esc(v.nome + (v.matricula ? " · " + v.matricula : "")) + "</option>").join("");
  const opcoes = (obj, atual) => Object.entries(obj).map(([k, r]) => '<option value="' + k + '"' + (k === atual ? " selected" : "") + ">" + esc(r) + "</option>").join("");
  const opcoesAvisar = (atual) => [...new Set([...AVISAR, atual])].sort((a, b) => a - b).map((d) => '<option value="' + d + '"' + (d === atual ? " selected" : "") + ">" + (d === 0 ? "Só no próprio dia" : d + " dias antes") + "</option>").join("");

  function proximaSugerida(p) {
    const m = MESES_REP[p.repetir];
    if (!m) return "";
    // revisões e inspeções contam a partir de quando se fazem; seguros e IUC mantêm o dia do vencimento
    const base = ["revisao", "inspecao"].includes(p.tipo) && diasAte(p.data) < 0 ? ymd(new Date()) : p.data;
    return somarMeses(base, m);
  }

  function painel(a) {
    if (a.tipo === "prz-novo") return painelNovo(a);
    if (a.tipo === "prz-viatura-nova") return painelViaturaNova();
    if (a.tipo === "viatura") return painelViatura(a);
    const p = P.prazos[a.id];
    if (!p) return mold("Prazo", topo() + (P.estado === "pronto" || P.estado === "falta-script" ? '<div class="vazio"><h3>Este prazo já não existe</h3><p>Pode ter sido eliminado, ou não tens acesso a ele.</p></div>' : '<div class="esqueleto"><i style="width:60%"></i></div>'));
    const tp = TIPOS_PRZ[p.tipo] || TIPOS_PRZ.outro, d = diasAte(p.data), ed = pode(), dis = ed ? "" : " disabled";
    let h = topo("prz-apagar");
    if (P.confirmar) h += '<div class="aviso erro aviso-acao"><span>Eliminar «' + esc(p.titulo) + "»? Deixa de haver avisos para esta data.</span><span class=\"acts\"><button class=\"btn sec\" data-acao=\"prz-apagar-nao\">Manter</button><button class=\"btn perigo\" data-acao=\"prz-apagar-sim\">Eliminar</button></span></div>";
    h += '<label class="sr" for="pz-titulo">Nome</label><textarea id="pz-titulo" class="p-titulo" rows="1"' + dis + ">" + esc(p.titulo) + "</textarea>";
    h += '<div class="prz-p-estado n-' + (p.estado === "ativo" ? nivel(p) : "feito") + '"><div>' + pill(p.tipo) + "<b>" + esc(fmtDataL(p.data)) + "</b><small>" +
      (p.estado === "ativo" ? esc(d < 0 ? "Em atraso: passou " + rotDias(d) : cap1(rotDias(d))) + (p.viatura_id ? " · " + esc(nomeViatura(p.viatura_id)) : "")
        : esc(tp.feito) + " por " + esc((nomeDe(p.tratado_por) || "alguém").split(" ")[0]) + " · " + esc(haQuanto(p.tratado_em)) + (p.tratado_nota ? " · «" + esc(p.tratado_nota) + "»" : "")) + "</small></div></div>";
    if (p.estado === "ativo") {
      const prox = proximaSugerida(p), modo = a.modo === "tratar";
      h += '<section class="p-sec prz-tratar' + (modo ? " foco" : "") + '"><h3>Marcar como ' + esc(tp.feito.toLowerCase()) + '</h3><form class="form" id="form-prz-tratar" novalidate><div class="campos-3 prz-campos-tratar">' +
        '<div class="campo"><label for="pz-prox">Próxima data</label><input id="pz-prox" type="date" value="' + esc(P.rascT?.id === p.id ? P.rascT.prox : prox) + '"></div>' +
        '<div class="campo stk-nota"><label for="pz-tnota">Nota (opcional)</label><input id="pz-tnota" maxlength="300" value="' + esc(P.rascT?.id === p.id ? P.rascT.nota : "") + '" placeholder="' + (p.tipo === "seguro" ? "Ex.: renovado na mesma seguradora, novo valor 650 €" : "Ex.: feita na oficina do costume, 1200 €") + '"></div></div>' +
        '<p class="muted prz-ajuda">' + (prox ? "A data seguinte fica logo criada, com os mesmos avisos. Podes mudá-la ou apagá-la se não houver próxima." : "Este prazo não se repete: escolhe uma data só se houver uma próxima.") + "</p>" +
        '<div class="acts"><button class="btn pri" type="submit">' + I.check + "Marcar como " + esc(tp.feito.toLowerCase()) + "</button></div></form></section>";
    } else if (ed) h += '<div class="acts"><button class="btn sec" data-acao="prz-reabrir" data-id="' + p.id + '">Reabrir (foi engano)</button></div>';
    h += '<div class="props">' +
      '<label for="pz-tipo">Tipo</label><select id="pz-tipo"' + dis + ">" + opcoes(Object.fromEntries(Object.entries(TIPOS_PRZ).map(([k, t]) => [k, t.nome])), p.tipo) + "</select>" +
      '<label for="pz-data">Data</label><input id="pz-data" type="date" value="' + esc(p.data) + '"' + dis + ">" +
      '<label for="pz-viatura">Viatura</label><select id="pz-viatura"' + dis + ">" + opcoesViaturas(p.viatura_id) + "</select>" +
      '<label for="pz-entidade">' + esc(tp.ent) + '</label><input id="pz-entidade" value="' + esc(p.entidade) + '" maxlength="120"' + dis + ">" +
      '<label for="pz-ref">' + esc(tp.ref) + '</label><input id="pz-ref" value="' + esc(p.referencia) + '" maxlength="80"' + dis + ">" +
      '<label for="pz-valor">Valor</label><input id="pz-valor" type="number" inputmode="decimal" min="0" step="0.01" value="' + (p.valor ?? "") + '" placeholder="Opcional, em euros"' + dis + ">" +
      (p.tipo === "revisao" ? '<label for="pz-km">Até aos km</label><input id="pz-km" type="number" inputmode="numeric" min="0" step="1" value="' + (p.km_limite ?? "") + '" placeholder="Opcional"' + dis + ">" : "") +
      '<label for="pz-repetir">Repete</label><select id="pz-repetir"' + dis + ">" + opcoes(REPETIR, p.repetir) + "</select>" +
      '<label for="pz-avisar">Avisar</label><select id="pz-avisar"' + dis + ">" + opcoesAvisar(p.avisar_dias) + "</select>" +
      '<label for="pz-resp">Responsável</label><select id="pz-resp"' + dis + ">" + opcoesPessoas(p.responsavel_id, "Sem responsável") + "</select></div>";
    h += '<section class="p-sec"><h3>Notas</h3><textarea id="pz-notas" class="prz-notas" rows="3" placeholder="Coberturas, contactos, onde está a apólice…"' + dis + ">" + esc(p.notas) + "</textarea></section>";
    const hist = historicoDe(p);
    if (hist.length) h += '<section class="p-sec"><h3>Anteriores</h3><div class="feed">' + hist.map((x) => '<div class="feed-item"><span class="feed-ic a-concluiu" aria-hidden="true"></span><span class="txt"><a href="#prazo-' + x.id + '">' + esc(fmtData(x.data)) + "</a> · " + esc(TIPOS_PRZ[x.tipo]?.feito || "Feito") + " por " + esc((nomeDe(x.tratado_por) || "alguém").split(" ")[0]) +
      (x.valor != null ? " · " + esc(euros(x.valor)) : "") + (x.tratado_nota ? ' <small class="muted">· ' + esc(x.tratado_nota) + "</small>" : "") + '</span><span class="q">' + esc(x.tratado_em ? haQuanto(x.tratado_em) : "") + "</span></div>").join("") + "</div></section>";
    return mold("Prazo", h);
  }
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function historicoDe(p) {
    const out = []; let x = p.anterior_id ? P.prazos[p.anterior_id] : null, guarda = 0;
    while (x && guarda++ < 20) { out.push(x); x = x.anterior_id ? P.prazos[x.anterior_id] : null; }
    return out;
  }

  function painelNovo(a) {
    const tipo = P.novoTipo || (a.viatura ? "revisao" : "seguro"), tp = TIPOS_PRZ[tipo], v = a.viatura || "";
    return mold("Novo prazo", topo() + '<h2 style="margin:0">Nova data a lembrar</h2><form class="form" id="form-prz-novo" novalidate>' +
      '<div class="seg seg-stk prz-seg" role="group" aria-label="Tipo">' + Object.entries(TIPOS_PRZ).map(([k, t]) => '<button type="button" data-acao="prz-novo-tipo" data-v="' + k + '" aria-pressed="' + (k === tipo) + '">' + esc(t.nome) + "</button>").join("") + "</div>" +
      '<input type="hidden" id="pn-tipo" value="' + tipo + '">' +
      '<div class="campo"><label for="pn-viatura">Viatura</label><select id="pn-viatura">' + opcoesViaturas(v) + "</select></div>" +
      '<div class="campo"><label for="pn-titulo">Nome</label><input id="pn-titulo" autocomplete="off" maxlength="120" placeholder="' + esc(tipo === "seguro" ? (v ? "Seguro automóvel" : "Ex.: Seguro multirriscos da sede") : tp.nome + (v ? "" : " · ex.: Licença, contrato…")) + '"></div>' +
      '<div class="campos-3 campos-iguais"><div class="campo"><label for="pn-data">Data</label><input id="pn-data" type="date" required></div>' +
      '<div class="campo"><label for="pn-repetir">Repete</label><select id="pn-repetir" class="sel">' + opcoes(REPETIR, tp.repetir) + "</select></div>" +
      '<div class="campo"><label for="pn-avisar">Avisar</label><select id="pn-avisar" class="sel">' + opcoesAvisar(tp.avisar) + "</select></div></div>" +
      '<div class="campos-3 campos-iguais"><div class="campo"><label for="pn-entidade">' + esc(tp.ent) + '</label><input id="pn-entidade" maxlength="120" placeholder="Opcional"></div>' +
      '<div class="campo"><label for="pn-ref">' + esc(tp.ref) + '</label><input id="pn-ref" maxlength="80" placeholder="Opcional"></div>' +
      '<div class="campo"><label for="pn-valor">Valor (€)</label><input id="pn-valor" type="number" inputmode="decimal" min="0" step="0.01" placeholder="Opcional"></div></div>' +
      '<div class="campo"><label for="pn-resp">Responsável</label><select id="pn-resp" class="sel">' + opcoesPessoas(v ? P.viaturas[v]?.responsavel_id : "", "Sem responsável (avisa a direção e a administração)") + "</select></div>" +
      '<div class="acts"><button class="btn pri" type="submit">Guardar</button><button class="btn sec" type="button" data-acao="fechar">Cancelar</button></div></form>');
  }

  function painelViaturaNova() {
    const campoData = (tipo) => '<div class="campo"><label for="vn-' + tipo + '">' + esc(TIPOS_PRZ[tipo].nome) + (tipo === "seguro" ? " (vence a)" : tipo === "iuc" ? " (pagar até)" : " (próxima)") + '</label><input id="vn-' + tipo + '" type="date"></div>';
    return mold("Nova viatura", topo() + '<h2 style="margin:0">Nova viatura</h2><form class="form" id="form-prz-viatura" novalidate>' +
      '<div class="campo"><label for="vn-nome">Nome</label><input id="vn-nome" required autocomplete="off" maxlength="80" placeholder="Ex.: Carrinha de entregas"></div>' +
      '<div class="campos-3 campos-iguais"><div class="campo"><label for="vn-mat">Matrícula</label><input id="vn-mat" maxlength="12" placeholder="AA-00-AA" autocapitalize="characters"></div>' +
      '<div class="campo"><label for="vn-modelo">Marca e modelo</label><input id="vn-modelo" maxlength="80" placeholder="Opcional"></div>' +
      '<div class="campo"><label for="vn-km">Quilómetros</label><input id="vn-km" type="number" inputmode="numeric" min="0" placeholder="Opcional"></div></div>' +
      '<div class="campo"><label for="vn-resp">Responsável</label><select id="vn-resp" class="sel">' + opcoesPessoas("", "Sem responsável") + "</select></div>" +
      '<fieldset class="prz-datas"><legend>Datas que já sabes <small>(podes deixar em branco e juntar depois)</small></legend><div class="campos-3 campos-4">' + ["seguro", "revisao", "inspecao", "iuc"].map(campoData).join("") + "</div>" +
      '<div class="campo"><label for="vn-seguradora">Seguradora</label><input id="vn-seguradora" maxlength="120" placeholder="Opcional"></div></fieldset>' +
      '<div class="acts"><button class="btn pri" type="submit">Criar viatura</button><button class="btn sec" type="button" data-acao="fechar">Cancelar</button></div></form>');
  }

  function painelViatura(a) {
    const v = P.viaturas[a.id];
    if (!v) return mold("Viatura", topo() + (P.estado === "pronto" ? '<div class="vazio"><h3>Esta viatura já não existe</h3></div>' : '<div class="esqueleto"><i style="width:60%"></i></div>'));
    const dis = pode() ? "" : " disabled";
    let h = topo("prz-v-apagar");
    if (P.confirmar) h += '<div class="aviso erro aviso-acao"><span>Eliminar «' + esc(v.nome) + "» e todas as datas dela? Se foi vendida, muda o estado para «Já não é da empresa».</span><span class=\"acts\"><button class=\"btn sec\" data-acao=\"prz-apagar-nao\">Manter</button><button class=\"btn perigo\" data-acao=\"prz-v-apagar-sim\">Eliminar</button></span></div>";
    h += '<label class="sr" for="vz-nome">Nome</label><textarea id="vz-nome" class="p-titulo" rows="1"' + dis + ">" + esc(v.nome) + "</textarea>";
    h += '<div class="props"><label for="vz-mat">Matrícula</label><input id="vz-mat" value="' + esc(v.matricula) + '" maxlength="12"' + dis + ">" +
      '<label for="vz-modelo">Marca e modelo</label><input id="vz-modelo" value="' + esc(v.modelo) + '" maxlength="80"' + dis + ">" +
      '<label for="vz-km">Quilómetros</label><input id="vz-km" type="number" inputmode="numeric" min="0" value="' + (v.km ?? "") + '" placeholder="Último registo"' + dis + ">" +
      '<label for="vz-resp">Responsável</label><select id="vz-resp"' + dis + ">" + opcoesPessoas(v.responsavel_id, "Sem responsável") + "</select>" +
      (eGestor(S.eu) ? '<label for="vz-ativo">Estado</label><select id="vz-ativo"><option value="1"' + (v.ativo ? " selected" : "") + '>Da empresa</option><option value="0"' + (v.ativo ? "" : " selected") + ">Já não é da empresa</option></select>" : "") + "</div>";
    const pz = ordenarData(Object.values(P.prazos).filter((p) => p.viatura_id === v.id && p.estado === "ativo"));
    h += '<section class="p-sec"><h3>Datas</h3>' + (pz.length ? '<div class="prz-lista">' + pz.map((p) => linhaPrazo(p, "viatura")).join("") + "</div>" : '<p class="muted">Ainda sem datas para esta viatura.</p>') +
      (pode() ? '<div class="acts"><button class="btn sec" data-acao="prz-novo" data-viatura="' + v.id + '">' + I.plus + "Juntar data</button></div>" : "") + "</section>";
    h += '<section class="p-sec"><h3>Notas</h3><textarea id="vz-notas" class="prz-notas" rows="3" placeholder="Onde estão os documentos, a chave suplente…"' + dis + ">" + esc(v.notas) + "</textarea></section>";
    return mold("Viatura", h);
  }

  /* ============================== Início ============================== */
  function blocoInicio() {
    if (P.estado === "por-carregar") carregar();
    if (P.estado !== "pronto") return "";
    const l = ordenarData(ativos_().filter((p) => (pode() || p.responsavel_id === S.eu.id || P.viaturas[p.viatura_id]?.responsavel_id === S.eu.id) && precisaAtencao(p)));
    if (!l.length) return "";
    return '<section class="cartao-sec prz-inicio" data-marca="grupo"><h3>Seguros e viaturas <span class="mono muted">' + l.length + "</span>" + (pode() ? ' <a class="c-link" href="#prazos" style="font-size:13px;margin-left:8px">Abrir</a>' : "") + '</h3><div class="prz-lista">' +
      l.slice(0, 4).map((p) => linhaPrazo(p, true)).join("") + "</div>" + (l.length > 4 && pode() ? '<a class="mostrar-feitas" href="#prazos">' + I.seta + "Ver todos os " + l.length + "</a>" : "") + "</section>";
  }
  const contagem = () => (P.estado !== "pronto" ? 0 : ativos_().filter((p) => diasAte(p.data) <= 7).length);

  /* ============================== Ações ============================== */
  async function tratar(id) {
    const p = P.prazos[id]; if (!p) return;
    const prox = $("#pz-prox")?.value || "", nota = $("#pz-tnota")?.value.trim() || "";
    if (prox && prox <= p.data && !confirmarData) { confirmarData = true; toast("A próxima data é antes da data atual. Carrega outra vez para confirmar.", true); return; }
    confirmarData = false;
    try {
      const r = await api.prz.tratar(id, prox, nota);
      P.rascT = null;
      P.prazos[id] = { ...p, estado: "tratado", tratado_em: new Date().toISOString(), tratado_por: S.eu.id, tratado_nota: nota };
      if (r && r.id !== id) P.prazos[r.id] = r;
      const tp = TIPOS_PRZ[p.tipo] || TIPOS_PRZ.outro;
      if (r && r.id !== id) { S.aberto = { tipo: "prazo", id: r.id }; history.replaceState(null, "", "#prazo-" + r.id); S.param = r.id; } else fechar();
      render(); renderPainel(true);
      toast(tp.feito + ": " + p.titulo + (r && r.id !== id ? ". Próxima data: " + fmtData(r.data) + "." : "."), pode() ? { acao: { rotulo: "Anular", fn: () => reabrir(id) } } : undefined);
    } catch (e) { falha(e); }
  }
  let confirmarData = false;
  async function reabrir(id) {
    try {
      const r = await api.prz.reabrir(id);
      Object.values(P.prazos).filter((x) => x.anterior_id === id && x.estado === "ativo").forEach((x) => delete P.prazos[x.id]);
      P.prazos[r.id] = r;
      if (S.aberto?.tipo === "prazo" && !P.prazos[S.aberto.id]) { S.aberto = { tipo: "prazo", id: r.id }; history.replaceState(null, "", "#prazo-" + r.id); S.param = r.id; }
      render(); renderPainel(true); toast("Reaberto: " + r.titulo);
    } catch (e) { falha(e); }
  }

  function clique(acao, el) {
    const id = el.dataset.id;
    switch (acao) {
      case "prz-tab": P.tab = el.dataset.tab; location.hash = P.tab === "prazos" ? "prazos" : "prazos-" + P.tab; return true;
      case "prz-tipo": P.tipo = el.dataset.v; P.pagMais = 1; render(); return true;
      case "prz-pag": P.pagMais = +el.dataset.p; render(); return true;
      case "prz-pag-hist": P.pagHist = +el.dataset.p; render(); return true;
      case "prz-abrir": P.confirmar = false; abrir({ tipo: "prazo", id }); return true;
      case "prz-tratar": P.confirmar = false; abrir({ tipo: "prazo", id, modo: "tratar" }); setTimeout(() => { const f = $(".prz-tratar"); f?.scrollIntoView({ block: "nearest" }); $("#pz-tnota")?.focus(); }, 60); return true;
      case "prz-reabrir": reabrir(id); return true;
      case "prz-viatura": P.confirmar = false; abrir({ tipo: "viatura", id }); return true;
      case "prz-novo": P.novoTipo = null; abrir({ tipo: "prz-novo", viatura: el.dataset.viatura || "" }); setTimeout(() => $("#pn-data")?.focus(), 60); return true;
      case "prz-novo-tipo": {
        const guardado = { v: $("#pn-viatura")?.value, t: $("#pn-titulo")?.value, d: $("#pn-data")?.value, e: $("#pn-entidade")?.value, r: $("#pn-ref")?.value, val: $("#pn-valor")?.value, resp: $("#pn-resp")?.value };
        P.novoTipo = el.dataset.v; S.aberto = { ...S.aberto, viatura: guardado.v || "" }; renderPainel(true);
        [["#pn-titulo", guardado.t], ["#pn-data", guardado.d], ["#pn-entidade", guardado.e], ["#pn-ref", guardado.r], ["#pn-valor", guardado.val], ["#pn-resp", guardado.resp]].forEach(([s, v]) => { if (v && $(s)) $(s).value = v; });
        return true;
      }
      case "prz-viatura-nova": abrir({ tipo: "prz-viatura-nova" }); setTimeout(() => $("#vn-nome")?.focus(), 60); return true;
      case "prz-apagar": case "prz-v-apagar": P.confirmar = true; renderPainel(true); return true;
      case "prz-apagar-nao": P.confirmar = false; renderPainel(true); return true;
      case "prz-apagar-sim": { const pid = S.aberto.id, antes = P.prazos[pid]; delete P.prazos[pid]; P.confirmar = false; fechar(); render(); api.prz.apagarPrazo(pid).then(() => toast("Eliminado")).catch((e) => { P.prazos[pid] = antes; render(); falha(e); }); return true; }
      case "prz-v-apagar-sim": {
        const vid = S.aberto.id, antes = P.viaturas[vid], pzs = Object.values(P.prazos).filter((p) => p.viatura_id === vid);
        delete P.viaturas[vid]; pzs.forEach((p) => delete P.prazos[p.id]); P.confirmar = false; fechar(); render();
        api.prz.apagarViatura(vid).then(() => toast("Viatura eliminada")).catch((e) => { P.viaturas[vid] = antes; pzs.forEach((p) => (P.prazos[p.id] = p)); render(); falha(e); });
        return true;
      }
      case "prz-guardar-avisos": {
        const avisar = [...document.querySelectorAll("[data-prz-avisar]")].filter((x) => x.checked).map((x) => x.dataset.przAvisar);
        api.prz.guardarConfig({ avisar, hora: +$("#prz-hora").value }).then((c) => { P.config = c; render(); toast("Avisos guardados"); }).catch(falha);
        return true;
      }
    }
    return false;
  }

  const timers = {};
  async function gravarPrazo(id, campos) {
    const antes = P.prazos[id]; if (!antes) return;
    P.prazos[id] = { ...antes, ...campos };
    try { P.prazos[id] = await api.prz.atualizarPrazo(id, campos); agendarRender(); renderPainel(); }
    catch (e) { P.prazos[id] = antes; agendarRender(); renderPainel(true); falha(e); }
  }
  async function gravarViatura(id, campos) {
    const antes = P.viaturas[id]; if (!antes) return;
    P.viaturas[id] = { ...antes, ...campos };
    try { P.viaturas[id] = await api.prz.atualizarViatura(id, campos); agendarRender(); renderPainel(); }
    catch (e) { P.viaturas[id] = antes; agendarRender(); renderPainel(true); falha(e); }
  }
  function adiar(chave, fn) { clearTimeout(timers[chave]); timers[chave] = setTimeout(fn, 800); }

  function escrever(e) {
    const t = e.target;
    if (t.id === "prz-q") { P.q = t.value; P.pagMais = 1; const pos = t.selectionStart; render(); const x = $("#prz-q"); if (x) { x.focus(); x.setSelectionRange(pos, pos); } return true; }
    const a = S.aberto;
    if (a?.tipo === "prazo") {
      const id = a.id;
      if (t.id === "pz-prox" || t.id === "pz-tnota") { P.rascT = { id, prox: $("#pz-prox")?.value || "", nota: $("#pz-tnota")?.value || "" }; return true; }
      if (t.id === "pz-titulo") { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; adiar("pt", () => { const v = t.value.trim(); if (v) gravarPrazo(id, { titulo: v }); }); return true; }
      if (t.id === "pz-entidade" || t.id === "pz-ref" || t.id === "pz-notas") { const campo = { "pz-entidade": "entidade", "pz-ref": "referencia", "pz-notas": "notas" }[t.id]; adiar(t.id, () => gravarPrazo(id, { [campo]: t.value.trim() })); return true; }
      return true;
    }
    if (a?.tipo === "viatura") {
      const id = a.id;
      if (t.id === "vz-nome") { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; adiar("vn", () => { const v = t.value.trim(); if (v) gravarViatura(id, { nome: v }); }); return true; }
      if (t.id === "vz-mat" || t.id === "vz-modelo" || t.id === "vz-notas") { const campo = { "vz-mat": "matricula", "vz-modelo": "modelo", "vz-notas": "notas" }[t.id]; adiar(t.id, () => gravarViatura(id, { [campo]: campo === "matricula" ? t.value.trim().toUpperCase() : t.value.trim() })); return true; }
      return true;
    }
    return false;
  }
  function mudar(e) {
    const t = e.target, a = S.aberto;
    if (a?.tipo === "prazo" && t.id?.startsWith("pz-")) {
      const id = a.id, num = (v, dec) => (v === "" ? null : Math.max(0, dec ? Math.round(+v * 100) / 100 : Math.round(+v)));
      const mapa = { "pz-tipo": () => ({ tipo: t.value }), "pz-data": () => (t.value ? { data: t.value } : null), "pz-viatura": () => ({ viatura_id: t.value || null }), "pz-valor": () => ({ valor: num(t.value, true) }),
        "pz-km": () => ({ km_limite: num(t.value) }), "pz-repetir": () => ({ repetir: t.value }), "pz-avisar": () => ({ avisar_dias: +t.value }), "pz-resp": () => ({ responsavel_id: t.value || null }) };
      const c = mapa[t.id]?.();
      if (c) { P.rascT = null; gravarPrazo(id, c).then(() => { if (t.id === "pz-tipo") renderPainel(true); }); return true; }
      return !!mapa[t.id];
    }
    if (a?.tipo === "viatura" && t.id?.startsWith("vz-")) {
      const id = a.id;
      if (t.id === "vz-km") { gravarViatura(id, { km: t.value === "" ? null : Math.max(0, Math.round(+t.value)) }); return true; }
      if (t.id === "vz-resp") { gravarViatura(id, { responsavel_id: t.value || null }); return true; }
      if (t.id === "vz-ativo") { gravarViatura(id, { ativo: t.value === "1" }); return true; }
      return false;
    }
    if (t.id === "prz-hora") return true;
    return false;
  }

  async function submeter(f) {
    if (f.id === "form-prz-tratar") { await tratar(S.aberto?.id); return true; }
    if (f.id === "form-prz-novo") {
      const tipo = $("#pn-tipo").value, data = $("#pn-data").value, viatura_id = $("#pn-viatura").value || null;
      if (!data) { toast("Escolhe a data.", true); $("#pn-data").focus(); return true; }
      const v = viatura_id ? P.viaturas[viatura_id] : null;
      const titulo = $("#pn-titulo").value.trim() || (tipo === "seguro" ? (v ? "Seguro automóvel" : "Seguro") : TIPOS_PRZ[tipo].nome) + (v ? " · " + v.nome : "");
      const val = $("#pn-valor").value;
      try {
        const r = await api.prz.criarPrazo({ tipo, titulo, viatura_id, data, repetir: $("#pn-repetir").value, avisar_dias: +$("#pn-avisar").value, entidade: $("#pn-entidade").value.trim(),
          referencia: $("#pn-ref").value.trim(), valor: val === "" ? null : Math.max(0, Math.round(+val * 100) / 100), responsavel_id: $("#pn-resp").value || null });
        P.prazos[r.id] = r; P.novoTipo = null; fechar(); render();
        const d = diasAte(r.data);
        toast("Guardado: " + r.titulo + (d <= r.avisar_dias ? ". Já está dentro do prazo de aviso: o primeiro lembrete sai na próxima hora." : ". A Central avisa " + (r.avisar_dias ? r.avisar_dias + " dias antes." : "no próprio dia.")));
      } catch (e) { falha(e); }
      return true;
    }
    if (f.id === "form-prz-viatura") {
      const nome = $("#vn-nome").value.trim();
      if (!nome) { toast("Dá um nome à viatura.", true); $("#vn-nome").focus(); return true; }
      const km = $("#vn-km").value, resp = $("#vn-resp").value || null;
      try {
        const v = await api.prz.criarViatura({ nome, matricula: $("#vn-mat").value.trim().toUpperCase(), modelo: $("#vn-modelo").value.trim(), km: km === "" ? null : Math.max(0, Math.round(+km)), responsavel_id: resp });
        P.viaturas[v.id] = v;
        let criados = 0;
        for (const tipo of ["seguro", "revisao", "inspecao", "iuc"]) {
          const data = $("#vn-" + tipo)?.value; if (!data) continue;
          const tp = TIPOS_PRZ[tipo];
          const r = await api.prz.criarPrazo({ tipo, titulo: (tipo === "seguro" ? "Seguro automóvel" : tp.nome) + " · " + v.nome, viatura_id: v.id, data, repetir: tp.repetir, avisar_dias: tp.avisar,
            entidade: tipo === "seguro" ? $("#vn-seguradora").value.trim() : "", responsavel_id: resp });
          P.prazos[r.id] = r; criados++;
        }
        fechar(); P.tab = "viaturas"; if (location.hash !== "#prazos-viaturas") location.hash = "prazos-viaturas"; else render();
        toast("Viatura criada" + (criados ? " com " + criados + (criados === 1 ? " data" : " datas") + " a lembrar." : ". Junta as datas quando as souberes."));
      } catch (e) { falha(e); }
      return true;
    }
    return false;
  }

  function reiniciar() { if (desligar) { desligar(); desligar = null; } Object.assign(P, { estado: "por-carregar", viaturas: {}, prazos: {}, config: null, tab: "prazos", tipo: "", q: "", confirmar: false, rascT: null }); }
  function pesquisar(q) {
    if (P.estado !== "pronto") return [];
    const vs = viaturasL(true).filter((v) => q([v.nome, v.matricula, v.modelo].join(" "))).slice(0, 3).map((v) => ({ titulo: v.nome + (v.matricula ? " · " + v.matricula : ""), sub: "Viatura" + (v.modelo ? " · " + v.modelo : ""), href: "#viatura-" + v.id }));
    const ps = ordenarData(ativos_().filter((p) => q([p.titulo, p.entidade, p.referencia, nomeViatura(p.viatura_id), TIPOS_PRZ[p.tipo]?.nome].join(" ")))).slice(0, 5)
      .map((p) => ({ titulo: p.titulo, sub: (TIPOS_PRZ[p.tipo]?.nome || "") + " · " + fmtData(p.data) + " (" + rotDias(diasAte(p.data)) + ")", href: "#prazo-" + p.id }));
    return [...ps, ...vs];
  }
  return { vista, painel, clique, escrever, mudar, submeter, carregar, pesquisar, blocoInicio, reiniciar, contagem, estado: () => P.estado, pode };
}
