// Central 26 — Tecnológico: registo da auditoria aos sites, plano semanal, referência e importação da folha de acompanhamento.
import { MARCA, MARCAS, MES, ymd, normalizar, haQuanto, eGestor } from "./dados.js";
import { carregarXlsx } from "./xlsx.js";

export const ESTADOS_AUD = { novo: "Novo", confirmado: "Confirmado", em_correcao: "Em correção", a_aguardar: "A aguardar informação", resolvido: "Resolvido", validado: "Validado", aceite: "Aceite pela administração" };
const PASSOS = ["confirmado", "em_correcao", "a_aguardar", "resolvido"];
const FECHADOS = ["validado", "aceite"];
const PRIO = { P0: "P0 · crítico", P1: "P1 · alto", P2: "P2 · médio", P3: "P3 · baixo" };
const PREFIXO = { twentysix: "TS", barbearia: "BB", academy: "AC", tech: "TC", grooms: "GR", grupo: "GP" };
const ESTADO_SEMANA = { "": "Sem estado", por_iniciar: "Por iniciar", em_curso: "Em curso", concluida: "Concluída" };
const n = (s) => normalizar(s).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const dataCurta = (s) => { if (!s) return ""; const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return d + " " + MES[m - 1] + (y !== new Date().getFullYear() ? " " + y : ""); };

export const podeAuditoria = (eu) => !!eu && (eGestor(eu) || eu.departamento_id === "tecnologico");

export function criarAuditoria(ctx) {
  const { S, api, esc, I, toast, falha, render, agendarRender, renderPainel, abrir, fechar, nomeDe, ativos, av, $ } = ctx;
  const A = (S.aud = { estado: "por-carregar", itens: {}, plano: [], referencias: [], config: { inicio: null }, tab: "registo",
    f: { q: "", marca: "", prio: "", estado: "", semana: "", resp: "", meus: false, fechados: false }, hist: {}, importacao: null, aImportar: false });
  let desligar = null;

  async function carregar() {
    if (A.estado === "a-carregar") return;
    A.estado = "a-carregar";
    try {
      if (!api.aud) throw new Error("A app foi atualizada a meio. Recarrega a página para terminar a atualização.");
      const d = await api.aud.carregar();
      A.itens = Object.fromEntries(d.itens.map((x) => [x.id, x]));
      A.plano = d.plano; A.referencias = d.referencias; A.config = d.config || { inicio: null };
      A.estado = "pronto";
      if (!desligar && api.aud.subscrever) desligar = api.aud.subscrever(aoMudar);
    } catch (e) { A.estado = /PGRST20|tec_itens|Could not find/i.test(String(e?.message)) ? "falta-script" : "erro"; A.erro = e.message; }
    agendarRender();
    if (S.aberto?.tipo === "aud-item") renderPainel(true);
  }
  function aoMudar(t, ev, novo, antigo) {
    if (t === "itens") { if (ev === "DELETE") delete A.itens[antigo.id]; else A.itens[novo.id] = novo; delete A.hist[(novo || antigo).id]; }
    if (t === "plano" && novo) { A.plano = A.plano.filter((s) => s.semana !== novo.semana).concat([novo]).sort((a, b) => a.semana - b.semana); }
    agendarRender();
    if (S.aberto?.tipo === "aud-item") renderPainel();
  }
  const pode = () => podeAuditoria(S.eu);
  const itens = () => Object.values(A.itens);
  const fechado = (i) => FECHADOS.includes(i.estado);
  const meus = () => itens().filter((i) => i.responsavel_id === S.eu.id);
  function semanaAtual() {
    if (!A.config?.inicio) return null;
    const ini = new Date(A.config.inicio + "T00:00:00"), hoje = new Date(ymd(new Date()) + "T00:00:00");
    return Math.floor((hoje - ini) / (7 * 864e5)) + 1;
  }
  const atrasado = (i) => { const sa = semanaAtual(); return !!(sa && i.semana && i.semana < sa && !["resolvido", ...FECHADOS].includes(i.estado)); };
  const ordem = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const ordenar = (l) => l.sort((a, b) => Number(fechado(a)) - Number(fechado(b)) || ordem[a.prioridade] - ordem[b.prioridade] || (a.semana || 99) - (b.semana || 99) || a.id.localeCompare(b.id, "pt", { numeric: true }));

  async function gravar(id, campos, silencioso) {
    const antes = A.itens[id]; if (!antes) return null;
    A.itens[id] = { ...antes, ...campos }; agendarRender();
    try { const r = await api.aud.itens.atualizar(id, campos); A.itens[id] = r; delete A.hist[id]; agendarRender(); if (!silencioso) renderPainel(true); return r; }
    catch (e) { A.itens[id] = antes; agendarRender(); renderPainel(true); falha(e); return null; }
  }

  /* ============================== Vistas ============================== */
  const tagMarca = (m) => '<span class="tag-marca" data-marca="' + esc(m) + '">' + esc(MARCA[m]?.nome || "Grupo 26") + "</span>";
  const tagPrio = (p) => '<span class="prio-aud ' + esc(p.toLowerCase()) + '" title="' + esc(PRIO[p]) + '">' + esc(p) + "</span>";
  const tagEstado = (e) => '<span class="est-aud e-' + esc(e) + '">' + esc(ESTADOS_AUD[e]) + "</span>";

  function vista(param) {
    if (A.estado === "por-carregar") carregar();
    if (param !== A.ultimoParam) { A.ultimoParam = param; if (["registo", "plano", "referencia", "importar"].includes(param)) A.tab = param; }
    if (!pode() && ["referencia", "importar"].includes(A.tab)) A.tab = "registo";
    const sa = semanaAtual(), sem = A.plano.find((s) => s.semana === sa);
    let h = '<div class="cab"><div><div class="eyebrow neutro">Departamento Tecnológico' + (sa && sa >= 1 && sem ? " · semana " + sa + " do plano: " + esc(sem.tema) : "") + "</div><h1>Auditoria dos sites</h1>" +
      '<p class="sub-cab">' + (pode() ? "Registo dos problemas encontrados, do responsável e da prova de que ficaram corrigidos." : "Os itens da auditoria que estão atribuídos a ti.") + "</p></div>" +
      (A.estado === "pronto" && pode() ? '<div class="acts">' + (itens().length ? '<button class="btn sec" data-acao="aud-exportar">Exportar para Excel</button>' : "") + '<button class="btn pri" data-acao="aud-novo">' + I.plus + "Novo item</button></div>" : "") + "</div>";
    const abertos = itens().filter((i) => !fechado(i)).length;
    const tabs = [["registo", "Registo", abertos], ["plano", "Plano semanal"]].concat(pode() ? [["referencia", "Referência"], ["importar", "Importar"]] : []);
    h += '<div class="tabs" role="tablist">' + tabs.map(([k, r, c]) => '<button class="tab" role="tab" data-acao="aud-tab" data-tab="' + k + '" aria-selected="' + (A.tab === k) + '">' + r + (c != null ? '<span class="n">' + c + "</span>" : "") + "</button>").join("") + "</div>";
    if (A.estado === "falta-script") return h + '<div class="vazio"><h3>Falta instalar a auditoria na base de dados</h3><p>No Supabase, abre o SQL Editor, cola o ficheiro <b>supabase/07-auditoria.sql</b> do GitHub e carrega em Run. Depois recarrega esta página.</p></div>';
    if (A.estado === "erro") return h + '<div class="aviso erro">Não foi possível abrir a auditoria: ' + esc(A.erro || "") + "</div>";
    if (A.estado !== "pronto") return h + '<div class="tabela"><div class="esqueleto"><i style="width:50%"></i></div></div>';
    if (A.tab === "importar") return h + vistaImportar();
    if (!itens().length) {
      return h + '<div class="vazio"><h3>' + (pode() ? "O registo ainda está vazio" : "Não tens itens da auditoria") + "</h3><p>" +
        (pode() ? "Importa a folha de acompanhamento (Central-Grupo26.xlsx). Os achados de segurança ficam guardados só na base de dados, nunca no GitHub." : "Quando a direção ou o Tecnológico te atribuírem um item, ele aparece aqui e recebes um aviso.") + "</p>" +
        (pode() ? '<div class="acts"><button class="btn pri" data-acao="aud-tab" data-tab="importar">Importar a folha</button></div>' : "") + "</div>";
    }
    if (A.tab === "plano") return h + vistaPlano();
    if (A.tab === "referencia") return h + vistaReferencia();
    return h + vistaRegisto();
  }

  function filtrar() {
    const f = A.f, q = n(f.q);
    let l = itens();
    if (f.meus) l = l.filter((i) => i.responsavel_id === S.eu.id);
    if (f.marca) l = l.filter((i) => i.marca === f.marca);
    if (f.prio) l = l.filter((i) => i.prioridade === f.prio);
    if (f.semana) l = l.filter((i) => String(i.semana || "") === f.semana);
    if (f.resp) l = l.filter((i) => (f.resp === "ninguem" ? !i.responsavel_id : i.responsavel_id === f.resp));
    if (f.estado === "p0") l = l.filter((i) => i.prioridade === "P0" && !fechado(i));
    else if (f.estado === "tratar") l = l.filter((i) => ["novo", "confirmado"].includes(i.estado));
    else if (f.estado === "atraso") l = l.filter(atrasado);
    else if (f.estado === "fechados") l = l.filter(fechado);
    else if (f.estado) l = l.filter((i) => i.estado === f.estado);
    else if (!f.fechados) l = l.filter((i) => !fechado(i));
    if (q) l = l.filter((i) => n([i.id, i.problema, i.categoria, i.evidencia, i.correcao, i.dominio, i.notas, MARCA[i.marca]?.nome].join(" ")).includes(q));
    return ordenar(l);
  }

  function vistaRegisto() {
    const todos = itens(), f = A.f, sa = semanaAtual();
    const c = (fn) => todos.filter(fn).length;
    const kpis = [["p0", "P0 por fechar", c((i) => i.prioridade === "P0" && !fechado(i)), "alerta"], ["tratar", "Por tratar", c((i) => ["novo", "confirmado"].includes(i.estado))],
      ["em_correcao", "Em correção", c((i) => i.estado === "em_correcao")], ["a_aguardar", "A aguardar informação", c((i) => i.estado === "a_aguardar")],
      ["resolvido", "Por validar", c((i) => i.estado === "resolvido")], ["fechados", "Fechados", c(fechado)]].concat(sa ? [["atraso", "Fora da semana prevista", c(atrasado), "alerta"]] : []);
    let h = '<div class="resumo-crm resumo-aud">' + kpis.map(([k, r, v, cls]) => '<button class="kpi' + (f.estado === k ? " on" : "") + (cls && v ? " alerta-kpi" : "") + '" data-acao="aud-fest" data-v="' + k + '"><span>' + r + "</span><b>" + v + "</b></button>").join("") + "</div>";
    const p0Atraso = todos.filter((i) => i.prioridade === "P0" && atrasado(i));
    if (p0Atraso.length) h += '<div class="aviso erro aviso-acao"><span><b>' + p0Atraso.length + (p0Atraso.length === 1 ? " item P0 passou" : " itens P0 passaram") + " da semana prevista.</b> Pela regra do plano, um P0 só segue para a semana seguinte depois de resolvido ou aceite pela administração.</span>" +
      '<button class="btn sec" data-acao="aud-fest" data-v="atraso">Ver</button></div>';
    const pessoas = ativos();
    const sel = (id, rot, v, ops) => '<label class="sr" for="' + id + '">' + rot + '</label><select id="' + id + '" class="sel">' + ops.map(([k, r]) => '<option value="' + esc(k) + '"' + (v === k ? " selected" : "") + ">" + esc(r) + "</option>").join("") + "</select>";
    const semanas = [...new Set(todos.map((i) => i.semana).filter(Boolean))].sort((a, b) => a - b);
    h += '<div class="barra"><div class="ferr ferr-aud">' +
      '<label class="pesq">' + I.lupa + '<span class="sr">Pesquisar</span><input id="aud-q" type="search" placeholder="Código, problema, evidência…" value="' + esc(f.q) + '"></label>' +
      sel("aud-fmarca", "Marca", f.marca, [["", "Todas as marcas"]].concat(MARCAS.map((m) => [m.id, m.nome]))) +
      sel("aud-fprio", "Prioridade", f.prio, [["", "Todas as prioridades"]].concat(Object.entries(PRIO))) +
      sel("aud-fsem", "Semana", f.semana, [["", "Todas as semanas"]].concat(semanas.map((s) => [String(s), "Semana " + s + (s === sa ? " (atual)" : "")]))) +
      (pode() ? sel("aud-fresp", "Responsável", f.resp, [["", "Todos os responsáveis"], ["ninguem", "Sem responsável"]].concat(pessoas.map((p) => [p.id, p.nome]))) : "") +
      (pode() ? '<label class="chk-txt"><input type="checkbox" id="aud-fmeus"' + (f.meus ? " checked" : "") + "> Só os meus</label>" : "") +
      '<label class="chk-txt"><input type="checkbox" id="aud-ffech"' + (f.fechados ? " checked" : "") + "> Mostrar fechados</label>" +
      (f.q || f.marca || f.prio || f.semana || f.resp || f.estado || f.meus ? '<button class="btn sec" data-acao="aud-limpar">Limpar filtros</button>' : "") + "</div></div>";
    const l = filtrar();
    if (!l.length) return h + '<div class="vazio"><h3>Nada com estes filtros</h3><p>Muda os filtros ou mostra também os itens fechados.</p></div>';
    h += '<div class="aud-lista">' + l.map(linha).join("") + "</div>";
    return h;
  }
  function linha(i) {
    const at = atrasado(i);
    return '<button class="aud-linha' + (fechado(i) ? " fechado" : "") + '" data-acao="aud-abrir" data-id="' + esc(i.id) + '" data-marca="' + esc(i.marca) + '">' +
      '<span class="aud-id mono">' + esc(i.id) + "</span>" + '<span class="aud-t"><b>' + esc(i.problema) + "</b><small>" + [tagMarca(i.marca), esc(i.categoria), i.origem === "seguranca" ? "Segurança aprofundada" : ""].filter(Boolean).join(" · ") + "</small></span>" +
      '<span class="aud-m">' + tagPrio(i.prioridade) + tagEstado(i.estado) + "</span>" +
      '<span class="aud-r">' + (i.responsavel_id ? av(i.responsavel_id) + "<small>" + esc((nomeDe(i.responsavel_id) || "").split(" ")[0]) + "</small>" : '<small class="muted">Sem responsável</small>') +
      (i.semana ? '<small class="' + (at ? "at" : "") + '">' + (at ? "Atrasado · " : "") + "Semana " + i.semana + "</small>" : "") + "</span></button>";
  }

  /* ---------- Plano semanal ---------- */
  function vistaPlano() {
    const sa = semanaAtual();
    let h = '<div class="barra"><div class="periodo"><b>' + (sa == null ? "Plano de " + A.plano.length + " semanas" : sa < 1 ? "O plano ainda não começou" : sa > A.plano.length ? "O plano já terminou" : "Estamos na semana " + sa + " de " + A.plano.length) + "</b><span>" +
      "Segunda de manhã: triagem e atribuição. Quarta: execução. Sexta: verificação e registo da evidência.</span></div>" +
      (pode() ? '<div class="ferr"><label class="lbl-inline" for="aud-inicio">A semana 1 começa a</label><input id="aud-inicio" class="sel" type="date" value="' + esc(A.config?.inicio || "") + '"></div>' : "") + "</div>";
    if (!A.plano.length) return h + '<div class="vazio"><h3>Sem plano semanal</h3><p>' + (pode() ? "O plano entra com a importação da folha de acompanhamento." : "O Tecnológico ainda não carregou o plano.") + "</p></div>";
    h += '<div class="plano-grid">' + A.plano.map((s) => {
      const l = itens().filter((i) => i.semana === s.semana), fe = l.filter(fechado).length, res = l.filter((i) => i.estado === "resolvido").length;
      const p0 = l.filter((i) => i.prioridade === "P0" && !fechado(i)).length, pct = l.length ? Math.round(((fe + res * 0.5) / l.length) * 100) : 0;
      const tarefas = String(s.tarefas || "").split(/;\s*/).map((x) => x.trim()).filter(Boolean);
      return '<section class="cartao-sec semana' + (s.semana === sa ? " atual" : "") + '"><div class="sem-cab"><span class="mono">Semana ' + s.semana + "</span>" +
        (pode() ? '<label class="sr" for="aud-sest-' + s.semana + '">Estado da semana</label><select class="sel" id="aud-sest-' + s.semana + '" data-semana="' + s.semana + '">' + Object.entries(ESTADO_SEMANA).map(([k, r]) => '<option value="' + k + '"' + ((s.estado || "") === k ? " selected" : "") + ">" + r + "</option>").join("") + "</select>"
          : s.estado ? "<small>" + esc(ESTADO_SEMANA[s.estado]) + "</small>" : "") + "</div>" +
        "<h3>" + esc(s.tema) + (s.semana === sa ? ' <span class="tag-tipo">esta semana</span>' : "") + "</h3>" + (s.objetivo ? "<p>" + esc(s.objetivo) + "</p>" : "") +
        (tarefas.length ? '<ul class="sem-tarefas">' + tarefas.map((t) => "<li>" + esc(t) + "</li>").join("") + "</ul>" : "") +
        (s.entregavel ? '<p class="sem-ent"><b>Entregável:</b> ' + esc(s.entregavel) + "</p>" : "") +
        '<div class="sem-prog"><span class="barra-prog" role="img" aria-label="' + pct + '% concluído"><i style="width:' + pct + '%"></i></span><small class="mono">' + fe + "/" + l.length + " fechados" + (res ? " · " + res + " por validar" : "") + "</small></div>" +
        (p0 ? '<small class="at">' + p0 + " P0 por fechar</small>" : "") +
        (l.length ? '<button class="btn sec" data-acao="aud-ver-semana" data-v="' + s.semana + '">Ver os ' + l.length + " itens</button>" : '<small class="muted">Sem itens atribuídos a esta semana.</small>') + "</section>";
    }).join("") + "</div>";
    return h;
  }

  /* ---------- Referência ---------- */
  function vistaReferencia() {
    if (!A.referencias.length) return '<div class="vazio"><h3>Sem tabelas de referência</h3><p>O inventário técnico, as redes sociais e os KPIs entram com a importação da folha.</p></div>';
    return A.referencias.map((r) => '<section class="cartao-sec"><h3>' + esc(r.titulo) + "</h3>" +
      (r.tipo === "kpis" ? "<p>As metas são propostas iniciais da auditoria. Os valores finais são definidos pela direção.</p>" : "") +
      (r.tipo === "controlos" ? "<p>Controlos que já estão bem feitos e devem ser mantidos.</p>" : "") +
      '<div class="tabela-scroll"><table class="crm-tabela ref-tab"><thead><tr>' + r.colunas.map((c) => "<th>" + esc(c) + "</th>").join("") + "</tr></thead><tbody>" +
      r.linhas.map((l) => "<tr>" + l.map((v) => "<td>" + esc(v == null ? "" : typeof v === "number" ? v.toLocaleString("pt-PT") : v) + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>" +
      (r.atualizado_em ? '<p class="nota-tab">Atualizado ' + esc(haQuanto(r.atualizado_em)) + ".</p>" : "") + "</section>").join("");
  }

  /* ---------- Importar ---------- */
  function vistaImportar() {
    const imp = A.importacao;
    let h = '<section class="cartao-sec"><h3>Importar a folha de acompanhamento</h3><p>Escolhe o ficheiro Excel da auditoria (folhas Registo, Plano Semanal, Segurança Aprofundada, Inventário Técnico, Redes Sociais e KPIs). ' +
      "Os itens novos entram no registo. Os que já existem mantêm o estado, o responsável, a prioridade e a semana que foram trabalhados aqui; só se completam campos vazios.</p>" +
      '<p>Os achados da folha «Segurança Aprofundada» que já correspondem a um item do registo (coluna «Relacionado») ficam ligados a esse item em vez de duplicarem. Os controlos positivos vão para a Referência.</p>' +
      '<div class="acts"><label class="btn pri" for="aud-ficheiro">' + I.plus + 'Escolher ficheiro</label><input id="aud-ficheiro" type="file" accept=".xlsx,.xlsm,.xls" hidden></div></section>';
    if (imp?.erro) h += '<div class="aviso erro">' + esc(imp.erro) + "</div>";
    if (imp?.dados) {
      const d = imp.dados, existe = (id) => !!A.itens[id];
      const novos = d.itens.filter((i) => !existe(i.id)), velhos = d.itens.filter((i) => existe(i.id));
      h += '<section class="cartao-sec"><h3>' + esc(imp.nome) + "</h3><ul class=\"sem-tarefas\">" +
        "<li><b>" + novos.length + "</b> itens novos e <b>" + velhos.length + "</b> que já existem (mantêm-se como estão na app)</li>" +
        "<li>Do registo: " + d.resumo.registo + " · da segurança aprofundada: " + d.resumo.seguranca + " novos e " + d.resumo.ligados + " ligados a itens do registo</li>" +
        "<li>Plano semanal: " + d.plano.length + " semanas · referência: " + d.referencias.map((r) => esc(r.titulo) + " (" + r.linhas.length + ")").join(", ") + "</li>" +
        (d.resumo.semResp.length ? "<li>Responsáveis da folha que não existem na equipa (ficam sem responsável): " + esc(d.resumo.semResp.join(", ")) + "</li>" : "") +
        (d.resumo.ignorados ? "<li>" + d.resumo.ignorados + " linhas ignoradas por não terem código ou descrição</li>" : "") + "</ul>" +
        (novos.length ? '<div class="tabela-scroll"><table class="crm-tabela ref-tab"><thead><tr><th>Código</th><th>Problema</th><th>Marca</th><th>Prioridade</th><th>Semana</th></tr></thead><tbody>' +
          novos.slice(0, 12).map((i) => "<tr><td class=\"mono\">" + esc(i.id) + "</td><td>" + esc(i.problema) + "</td><td>" + esc(MARCA[i.marca]?.nome || "") + "</td><td>" + esc(i.prioridade) + "</td><td>" + (i.semana || "—") + "</td></tr>").join("") +
          "</tbody></table></div>" + (novos.length > 12 ? '<p class="muted">E mais ' + (novos.length - 12) + ".</p>" : "") : "") +
        '<div class="acts"><button class="btn pri" data-acao="aud-importar"' + (A.aImportar ? " disabled" : "") + ">" + (A.aImportar ? "A importar…" : "Importar") + '</button><button class="btn sec" data-acao="aud-imp-cancelar">Cancelar</button></div></section>';
    }
    return h;
  }

  const ESTADO_FOLHA = { novo: "novo", confirmado: "confirmado", "em correcao": "em_correcao", "a aguardar informacao": "a_aguardar", "a aguardar": "a_aguardar", resolvido: "resolvido", validado: "validado", "aceite pela administracao": "aceite", "aceite pela direcao": "aceite", aceite: "aceite" };
  function marcaDe(txt) {
    const t = n(txt);
    if (!t || t.includes("/") || /todos|dominios|grupo/.test(t)) return "grupo";
    if (t.includes("twentysix")) return "twentysix";
    if (t.includes("barbearia")) return "barbearia";
    if (t.includes("academy")) return "academy";
    if (t.includes("26tech") || t.includes("26 tech")) return "tech";
    if (t.includes("grooms")) return "grooms";
    return "grupo";
  }
  function lerFolha(XLSX, wb) {
    const folha = (re) => { const k = wb.SheetNames.find((s) => re.test(n(s))); return k ? XLSX.utils.sheet_to_json(wb.Sheets[k], { header: 1, defval: "", raw: true }) : null; };
    const tabela = (linhas) => { if (!linhas || !linhas.length) return null; const cab = linhas[0].map((c) => String(c).trim()); return { cab, idx: (re) => cab.findIndex((c) => re.test(n(c))), linhas: linhas.slice(1).filter((l) => l.some((v) => String(v).trim() !== "")) }; };
    const pessoas = ativos(), porNome = new Map();
    for (const p of pessoas) { porNome.set(n(p.nome), p.id); const pn = n(p.nome).split(" ")[0]; porNome.set(pn, porNome.has(pn) ? null : p.id); }
    const semResp = new Set(); let ignorados = 0;
    const txt = (v) => (v == null ? "" : String(v).trim());
    const semana = (v) => { const x = parseInt(v, 10); return x >= 1 && x <= 12 ? x : null; };
    const prio = (v) => (/^P[0-3]$/.test(txt(v).toUpperCase()) ? txt(v).toUpperCase() : "P2");
    const rel = (v) => txt(v).split(/[,;\s]+/).map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{2,4}-\d{2,3}$/.test(x));
    const resp = (v) => { const k = n(v); if (!k) return null; const id = porNome.get(k) ?? null; if (!id) semResp.add(txt(v)); return id; };
    const itens = [], porId = new Map();
    const reg = tabela(folha(/^registo/));
    if (!reg) throw new Error("Não encontrei a folha «Registo» neste ficheiro.");
    const c = { id: reg.idx(/^id$|codigo/), marca: reg.idx(/^marca/), cat: reg.idx(/categoria/), prob: reg.idx(/problema|descricao/), evid: reg.idx(/evidencia/), prio: reg.idx(/prioridade/),
      imp: reg.idx(/impacto/), esf: reg.idx(/esforco/), resp: reg.idx(/responsavel/), est: reg.idx(/^estado/), sem: reg.idx(/semana/), rel: reg.idx(/relacionad/), cor: reg.idx(/correcao/) };
    for (const l of reg.linhas) {
      const id = txt(l[c.id]).toUpperCase(), problema = txt(l[c.prob]);
      if (!/^[A-Z]{2,4}-\d{2,3}$/.test(id) || !problema) { ignorados++; continue; }
      const it = { id, marca: marcaDe(l[c.marca]), categoria: txt(l[c.cat]), problema, evidencia: txt(l[c.evid]), correcao: c.cor >= 0 ? txt(l[c.cor]) : "", dominio: "", origem: "registo",
        prioridade: prio(l[c.prio]), impacto: txt(l[c.imp]), esforco: txt(l[c.esf]), estado: ESTADO_FOLHA[n(l[c.est])] || "novo", semana: semana(l[c.sem]),
        relacionado: c.rel >= 0 ? rel(l[c.rel]) : [], responsavel_id: c.resp >= 0 ? resp(l[c.resp]) : null };
      itens.push(it); porId.set(id, it);
    }
    const resumo = { registo: itens.length, seguranca: 0, ligados: 0, semResp: [], ignorados };
    const referencias = [];
    const seg = tabela(folha(/seguranca/));
    if (seg) {
      const s = { id: seg.idx(/^id$|codigo/), dom: seg.idx(/dominio/), ach: seg.idx(/achado|problema/), est: seg.idx(/^estado/), sev: seg.idx(/severidade|prioridade/), evid: seg.idx(/evidencia/),
        cor: seg.idx(/correcao/), esf: seg.idx(/esforco/), sem: seg.idx(/semana/), rel: seg.idx(/relacionad/) };
      const positivos = [];
      for (const l of seg.linhas) {
        const id = txt(l[s.id]).toUpperCase(), achado = txt(l[s.ach]);
        if (!/^[A-Z]{2,4}-\d{2,3}$/.test(id) || !achado) { resumo.ignorados++; continue; }
        if (/controlo positivo/i.test(achado) || /^manter$/i.test(txt(l[s.cor]))) { positivos.push([id, txt(l[s.dom]), achado.replace(/\s*\(controlo positivo\)/i, ""), txt(l[s.evid])]); continue; }
        const ligados = s.rel >= 0 ? rel(l[s.rel]).filter((x) => porId.has(x)) : [];
        if (ligados.length) {
          for (const x of ligados) { const it = porId.get(x); it.relacionado = [...new Set(it.relacionado.concat(id))]; if (!it.correcao) it.correcao = txt(l[s.cor]); if (!it.dominio) it.dominio = txt(l[s.dom]); }
          resumo.ligados++; continue;
        }
        const it = { id, marca: marcaDe(l[s.dom]), categoria: "Segurança", problema: achado, evidencia: txt(l[s.evid]), correcao: txt(l[s.cor]), dominio: txt(l[s.dom]), origem: "seguranca",
          prioridade: prio(l[s.sev]), impacto: "", esforco: txt(l[s.esf]).replace(/^—$/, ""), estado: ESTADO_FOLHA[n(l[s.est])] || "confirmado", semana: s.sem >= 0 ? semana(l[s.sem]) : null, relacionado: [], responsavel_id: null };
        itens.push(it); porId.set(id, it); resumo.seguranca++;
      }
      if (positivos.length) referencias.push({ tipo: "controlos", titulo: "Controlos positivos", colunas: ["Código", "Domínio", "Controlo", "Evidência"], linhas: positivos, ordem: 4 });
    }
    // as ligações valem nos dois sentidos
    for (const it of itens) for (const x of it.relacionado) { const o = porId.get(x); if (o && !o.relacionado.includes(it.id)) o.relacionado.push(it.id); }
    const plano = [];
    const pl = tabela(folha(/^plano/));
    if (pl) {
      const p = { sem: pl.idx(/semana/), tema: pl.idx(/tema/), obj: pl.idx(/objetivo/), tar: pl.idx(/tarefa/), ent: pl.idx(/entregavel/) };
      for (const l of pl.linhas) { const sm = semana(l[p.sem]); if (sm) plano.push({ semana: sm, tema: txt(l[p.tema]), objetivo: txt(l[p.obj]), tarefas: txt(l[p.tar]), entregavel: txt(l[p.ent]) }); }
    }
    [[/inventario/, "inventario", "Inventário técnico", 1], [/redes/, "redes", "Redes sociais", 2], [/^kpi/, "kpis", "KPIs", 3]].forEach(([re, tipo, titulo, ordem]) => {
      const t = tabela(folha(re)); if (t) referencias.push({ tipo, titulo, colunas: t.cab, linhas: t.linhas.map((l) => l.slice(0, t.cab.length).map((v) => (typeof v === "number" ? v : txt(v)))), ordem });
    });
    resumo.semResp = [...semResp];
    return { itens, plano, referencias, resumo };
  }
  async function lerFicheiro(f) {
    A.importacao = { nome: f.name }; render();
    try {
      const XLSX = await carregarXlsx();
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      A.importacao.dados = lerFolha(XLSX, wb);
    } catch (e) { A.importacao.erro = e.message || "Não foi possível ler o ficheiro."; }
    render();
  }
  async function importar() {
    const d = A.importacao?.dados; if (!d) return;
    A.aImportar = true; render();
    try {
      const r = await api.aud.importar({ itens: d.itens, plano: d.plano, referencias: d.referencias });
      A.aImportar = false; A.importacao = null; A.estado = "por-carregar"; await carregar(); A.tab = "registo"; render();
      toast("Importação concluída: " + r.novos + (r.novos === 1 ? " item novo" : " itens novos") + (r.existentes ? ", " + r.existentes + " já existiam" : ""));
    } catch (e) { A.aImportar = false; render(); falha(e); }
  }
  async function exportar() {
    try {
      const XLSX = await carregarXlsx();
      const wb = XLSX.utils.book_new();
      const cab = ["ID", "Marca", "Categoria", "Problema", "Evidência", "Correção recomendada", "Prioridade", "Impacto", "Esforço", "Responsável", "Estado", "Semana", "Evidência da verificação", "Data validação", "Relacionado", "Notas", "Atualizado"];
      const linhas = ordenar(itens()).map((i) => [i.id, MARCA[i.marca]?.nome || "", i.categoria, i.problema, i.evidencia, i.correcao, i.prioridade, i.impacto, i.esforco, i.responsavel_id ? nomeDe(i.responsavel_id) : "",
        ESTADOS_AUD[i.estado], i.semana || "", i.estado === "aceite" ? "Risco aceite: " + i.aceite_motivo : i.verificacao, i.data_validacao || "", (i.relacionado || []).join(", "), i.notas, String(i.atualizado_em || "").slice(0, 10)]);
      const ws = XLSX.utils.aoa_to_sheet([cab, ...linhas]);
      ws["!cols"] = [9, 16, 16, 48, 40, 34, 10, 10, 10, 18, 20, 8, 40, 13, 14, 30, 12].map((w) => ({ wch: w }));
      ws["!autofilter"] = { ref: "A1:Q" + (linhas.length + 1) };
      XLSX.utils.book_append_sheet(wb, ws, "Registo");
      if (A.plano.length) {
        const wp = XLSX.utils.aoa_to_sheet([["Semana", "Tema", "Objetivo", "Tarefas-chave", "Entregável verificável", "Estado", "Itens", "Fechados"]].concat(A.plano.map((s) => {
          const l = itens().filter((i) => i.semana === s.semana);
          return [s.semana, s.tema, s.objetivo, s.tarefas, s.entregavel, s.estado ? ESTADO_SEMANA[s.estado] : "", l.length, l.filter(fechado).length];
        })));
        wp["!cols"] = [8, 20, 40, 60, 44, 12, 8, 10].map((w) => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, wp, "Plano Semanal");
      }
      XLSX.writeFile(wb, "Central-Grupo26-registo-" + ymd(new Date()) + ".xlsx");
    } catch (e) { falha(e); }
  }

  /* ============================== Painéis ============================== */
  function painel(a) {
    if (a.tipo === "aud-novo") return painelNovo();
    const i = A.itens[a.id];
    const mold = (c, pe) => '<div class="veu" data-acao="fechar"></div><aside class="painel largo" role="dialog" aria-label="Item da auditoria" data-marca="' + esc(i?.marca || "grupo") + '"><div class="p-scroll">' + c + "</div>" + (pe ? '<div class="p-pe">' + pe + "</div>" : "") + "</aside>";
    if (!i) return mold('<div class="p-topo"><span class="migalha">Auditoria</span><button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + "</button></div>" +
      (A.estado === "pronto" ? '<div class="vazio"><h3>Item indisponível</h3><p>Foi eliminado ou não está atribuído a ti.</p></div>' : '<div class="esqueleto"><i style="width:60%"></i></div>'));
    const p = pode(), gestor = eGestor(S.eu), meu = i.responsavel_id === S.eu.id, ed = p || meu, dis = p ? "" : " disabled";
    if (!A.hist[i.id]) { A.hist[i.id] = "a-carregar"; api.aud.historico(i.id).then((h) => { A.hist[i.id] = h; if (S.aberto?.id === i.id) renderPainel(); }).catch(() => { A.hist[i.id] = []; }); }
    let h = '<div class="p-topo"><span class="migalha"><i></i>Auditoria / <span class="mono">' + esc(i.id) + "</span></span><span class=\"acts\">" + (p ? '<button class="ib perigo" data-acao="aud-apagar">' + I.lixo + "Eliminar</button>" : "") +
      '<button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + "</button></span></div>";
    if (a.confirmar) h += '<div class="aviso erro aviso-acao"><span>Eliminar o item ' + esc(i.id) + " e o histórico? Se foi um engano de registo, elimina; se o problema ficou resolvido, valida-o em vez de eliminar.</span>" +
      '<span class="acts"><button class="btn sec" data-acao="aud-apagar-nao">Manter</button><button class="btn perigo" data-acao="aud-apagar-sim">Eliminar</button></span></div>';
    h += p ? '<label class="sr" for="au-problema">Problema</label><textarea id="au-problema" class="p-titulo" rows="1">' + esc(i.problema) + "</textarea>" : '<h2 style="margin:0">' + esc(i.problema) + "</h2>";
    h += '<div class="chips">' + tagMarca(i.marca) + tagPrio(i.prioridade) + tagEstado(i.estado) + (i.origem === "seguranca" ? "<span>Segurança aprofundada</span>" : "") +
      (atrasado(i) ? '<span class="pill-at">Fora da semana ' + i.semana + "</span>" : "") + "</div>";
    if (fechado(i)) {
      h += '<div class="aviso ok aviso-acao"><span>' + (i.estado === "validado" ? "<b>Validado</b> por " + esc(nomeDe(i.validado_por) || "—") + (i.data_validacao ? " a " + esc(dataCurta(i.data_validacao)) : "") + ". Evidência: " + esc(i.verificacao)
        : "<b>Risco aceite pela administração</b> (" + esc(nomeDe(i.aceite_por) || "—") + "). Motivo: " + esc(i.aceite_motivo)) + "</span>" +
        (p ? '<button class="btn sec" data-acao="aud-estado" data-v="em_correcao">Reabrir</button>' : "") + "</div>";
    } else if (ed) {
      h += '<div class="passos" role="group" aria-label="Estado">' + (p ? ["novo"] : []).concat(PASSOS).map((k) => '<button data-acao="aud-estado" data-v="' + k + '" aria-pressed="' + (i.estado === k) + '">' + ESTADOS_AUD[k] + "</button>").join("") + "</div>";
    }
    if (!fechado(i) && p) {
      const corpoValida = '<p class="muted">Só se fecha com prova: o que foi testado, quando e com que resultado (por exemplo, «a página /cursos/ já não tem texto provisório, verificado no telemóvel e no computador a 12/11»).</p>' +
        '<label class="sr" for="au-verif">Evidência da verificação</label><textarea id="au-verif" class="notas" placeholder="Evidência da verificação">' + esc(i.verificacao) + "</textarea>" +
        '<div class="acts"><button class="btn pri" data-acao="aud-validar">' + I.check + "Validar com esta evidência</button></div>";
      h += i.estado === "resolvido" ? '<section class="p-sec valida"><h3>Por validar</h3>' + (i.resolvido_por ? '<p>Marcado como resolvido por ' + esc(nomeDe(i.resolvido_por) || "—") + " " + esc(haQuanto(i.resolvido_em)) + ".</p>" : "") + corpoValida + "</section>"
        : '<details class="p-sec aceitar"><summary>Validar já (com evidência)</summary>' + corpoValida + "</details>";
      if (gestor) h += '<details class="p-sec aceitar"' + (a.aceitar ? " open" : "") + "><summary>Aceitar o risco (decisão da administração)</summary>" +
        '<label class="sr" for="au-motivo">Motivo</label><textarea id="au-motivo" class="notas" placeholder="Porque é que este item não vai ser corrigido agora">' + esc(i.aceite_motivo) + "</textarea>" +
        '<div class="acts"><button class="btn sec" data-acao="aud-aceitar">Aceitar o risco</button></div></details>';
    }
    const pessoas = ativos();
    const sel = (id, rot, v, ops) => '<label for="' + id + '">' + rot + '</label><select id="' + id + '"' + dis + ">" + ops.map(([k, r]) => '<option value="' + esc(k) + '"' + (String(v ?? "") === String(k) ? " selected" : "") + ">" + esc(r) + "</option>").join("") + "</select>";
    const nivel = [["", "—"], ["Crítico", "Crítico"], ["Alto", "Alto"], ["Médio", "Médio"], ["Baixo", "Baixo"]];
    h += '<div class="props">' +
      sel("au-resp", "Responsável", i.responsavel_id || "", [["", "Sem responsável"]].concat(pessoas.map((x) => [x.id, x.nome]))) +
      sel("au-sem", "Semana", i.semana || "", [["", "Sem semana"]].concat(Array.from({ length: Math.max(8, A.plano.length) }, (_, k) => [String(k + 1), "Semana " + (k + 1) + (A.plano.find((s) => s.semana === k + 1) ? " · " + A.plano.find((s) => s.semana === k + 1).tema : "")]))) +
      sel("au-prio", "Prioridade", i.prioridade, Object.entries(PRIO)) +
      sel("au-marca", "Marca", i.marca, MARCAS.map((m) => [m.id, m.nome])) +
      '<label for="au-cat">Categoria</label><input id="au-cat" value="' + esc(i.categoria) + '"' + dis + ">" +
      sel("au-imp", "Impacto", i.impacto, nivel.some(([k]) => k === i.impacto) ? nivel : nivel.concat([[i.impacto, i.impacto]])) +
      sel("au-esf", "Esforço", i.esforco, [["", "—"], ["Alto", "Alto"], ["Médio", "Médio"], ["Baixo", "Baixo"]].concat(["", "Alto", "Médio", "Baixo"].includes(i.esforco) ? [] : [[i.esforco, i.esforco]])) +
      '<label for="au-dom">Domínio</label><input id="au-dom" value="' + esc(i.dominio) + '" placeholder="Ex.: 26tech.pt"' + dis + ">" + "</div>";
    const area = (id, rot, v, ph, edita) => '<section class="p-sec"><h3>' + rot + "</h3>" + (edita ? '<label class="sr" for="' + id + '">' + rot + '</label><textarea id="' + id + '" class="notas" placeholder="' + ph + '">' + esc(v) + "</textarea>" : v ? '<p class="texto-pre">' + esc(v) + "</p>" : '<p class="muted">—</p>') + "</section>";
    h += area("au-evid", "Evidência", i.evidencia, "O que foi observado e onde", p) + area("au-corr", "Correção recomendada", i.correcao, "O que fazer para corrigir", p) +
      area("au-notas", "Notas de trabalho", i.notas, "O que já foi feito, dúvidas, contactos…", ed);
    const rel = (i.relacionado || []);
    if (rel.length || p) h += '<section class="p-sec"><h3>Relacionado</h3><div class="chips">' + (rel.length ? rel.map((r) => A.itens[r] ? '<button class="c-link mono" data-acao="aud-abrir" data-id="' + esc(r) + '">' + esc(r) + "</button>" : '<span class="mono">' + esc(r) + "</span>").join("") : '<span class="muted">Nenhum</span>') + "</div>" +
      (p ? '<label class="sr" for="au-rel">Códigos relacionados</label><input id="au-rel" class="inp-rel" value="' + esc(rel.join(", ")) + '" placeholder="Códigos separados por vírgulas, ex.: SEG-07, TS-11">' : "") + "</section>";
    const hi = A.hist[i.id];
    h += '<section class="p-sec"><h3>Histórico</h3>' + (hi === "a-carregar" || !hi ? '<div class="esqueleto"><i style="width:40%"></i></div>' : hi.length ? '<ul class="hist-aud">' + hi.map((x) => "<li><b>" + esc(nomeDe(x.autor_id) || "Sistema") + "</b> " + esc(descHist(x)) + ' <small class="muted">' + esc(haQuanto(x.criado_em)) + "</small>" + (x.nota ? "<br><small>" + esc(x.nota) + "</small>" : "") + "</li>").join("") + "</ul>" : '<p class="muted">Sem registos.</p>') + "</section>";
    const pe = "<span>" + (i.atualizado_por ? "Alterado por " + esc(nomeDe(i.atualizado_por) || "—") + " " + esc(haQuanto(i.atualizado_em)) : "") + "</span>";
    return mold(h, pe);
  }
  function descHist(x) {
    if (x.campo === "criado") return "registou o item";
    if (x.campo === "estado") return "mudou o estado: " + (ESTADOS_AUD[x.de] || x.de || "—") + " → " + (ESTADOS_AUD[x.para] || x.para);
    if (x.campo === "responsavel") return x.para ? "atribuiu a " + x.para : "retirou o responsável";
    if (x.campo === "prioridade") return "mudou a prioridade: " + x.de + " → " + x.para;
    if (x.campo === "semana") return "mudou a semana: " + (x.de || "—") + " → " + (x.para || "—");
    return x.campo;
  }
  function proximoId(marca) {
    const pre = PREFIXO[marca] || "GP";
    const max = itens().filter((i) => i.id.startsWith(pre + "-")).reduce((m, i) => Math.max(m, parseInt(i.id.split("-")[1], 10) || 0), 0);
    return pre + "-" + String(max + 1).padStart(2, "0");
  }
  function painelNovo() {
    const pessoas = ativos(), m = A.novoMarca || "grupo";
    const c = '<div class="p-topo"><span class="migalha"><i></i>Auditoria</span><button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + '</button></div><h2 style="margin:0">Novo item</h2>' +
      '<form class="form" id="form-aud" novalidate><div class="campos-2"><div class="campo"><label for="an-marca">Marca</label><select id="an-marca">' + MARCAS.map((x) => '<option value="' + x.id + '"' + (x.id === m ? " selected" : "") + ">" + esc(x.nome) + "</option>").join("") + "</select></div>" +
      '<div class="campo"><label for="an-id">Código</label><input id="an-id" value="' + esc(proximoId(m)) + '" autocomplete="off" spellcheck="false"><span class="ajuda">Prefixo da marca e número, ex.: ' + esc(proximoId(m)) + ".</span></div></div>" +
      '<div class="campo"><label for="an-prob">Problema</label><input id="an-prob" required autocomplete="off" placeholder="Ex.: Formulário de contacto não envia"></div>' +
      '<div class="campos-3"><div class="campo"><label for="an-prio">Prioridade</label><select id="an-prio">' + Object.entries(PRIO).map(([k, r]) => '<option value="' + k + '"' + (k === "P2" ? " selected" : "") + ">" + r + "</option>").join("") + "</select></div>" +
      '<div class="campo"><label for="an-cat">Categoria</label><input id="an-cat" autocomplete="off" placeholder="Ex.: SEO, Segurança"></div>' +
      '<div class="campo"><label for="an-sem">Semana</label><select id="an-sem"><option value="">Sem semana</option>' + Array.from({ length: Math.max(8, A.plano.length) }, (_, k) => '<option value="' + (k + 1) + '"' + (k + 1 === semanaAtual() ? " selected" : "") + ">Semana " + (k + 1) + "</option>").join("") + "</select></div></div>" +
      '<div class="campo"><label for="an-resp">Responsável</label><select id="an-resp"><option value="">Sem responsável</option>' + pessoas.map((x) => '<option value="' + x.id + '">' + esc(x.nome) + "</option>").join("") + "</select></div>" +
      '<div class="campo"><label for="an-evid">Evidência</label><textarea id="an-evid" placeholder="O que foi observado e onde"></textarea></div>' +
      '<div class="campo"><label for="an-corr">Correção recomendada</label><textarea id="an-corr" placeholder="O que fazer para corrigir"></textarea></div>' +
      '<div class="acts"><button class="btn pri" type="submit">Criar item</button><button class="btn sec" type="button" data-acao="fechar">Cancelar</button></div></form>';
    return '<div class="veu" data-acao="fechar"></div><aside class="painel largo" role="dialog" aria-label="Novo item da auditoria" data-marca="grupo"><div class="p-scroll">' + c + "</div></aside>";
  }

  /* ============================== Início e navegação ============================== */
  function blocoInicio() {
    if (!S.eu) return "";
    if (A.estado === "por-carregar") carregar();
    if (A.estado !== "pronto") return "";
    const meusAbertos = ordenar(meus().filter((i) => !fechado(i)));
    if (pode()) {
      const p0 = itens().filter((i) => i.prioridade === "P0" && !fechado(i)).length, val = itens().filter((i) => i.estado === "resolvido").length;
      if (!p0 && !val && !meusAbertos.length) return "";
      return '<section class="cartao-sec"><h3>Auditoria dos sites <a class="c-link" href="#auditoria" style="font-size:13px;margin-left:8px">Abrir o registo</a></h3><div class="resumo-crm resumo-aud">' +
        '<button class="kpi' + (p0 ? " alerta-kpi" : "") + '" data-acao="aud-ir" data-v="p0"><span>P0 por fechar</span><b>' + p0 + '</b></button><button class="kpi" data-acao="aud-ir" data-v="resolvido"><span>Por validar</span><b>' + val +
        '</b></button><button class="kpi" data-acao="aud-ir" data-v="meus"><span>Atribuídos a ti</span><b>' + meusAbertos.length + "</b></button></div></section>";
    }
    if (!meusAbertos.length) return "";
    return '<section class="cartao-sec"><h3>Itens da auditoria atribuídos a ti <span class="mono" style="color:var(--faint);font-weight:400">' + meusAbertos.length + '</span> <a class="c-link" href="#auditoria" style="font-size:13px;margin-left:8px">Ver todos</a></h3><div class="aud-lista">' + meusAbertos.slice(0, 4).map(linha).join("") + "</div></section>";
  }
  const visivel = () => pode() || (A.estado === "pronto" && meus().length > 0);
  const contagem = () => (A.estado !== "pronto" ? 0 : pode() ? itens().filter((i) => i.estado === "resolvido").length : meus().filter((i) => !fechado(i)).length);

  /* ============================== Ações ============================== */
  function clique(acao, el) {
    switch (acao) {
      case "aud-tab": A.tab = el.dataset.tab; if (S.rota === "auditoria" && S.param) location.hash = "auditoria"; else render(); return true;
      case "aud-fest": A.f.estado = A.f.estado === el.dataset.v ? "" : el.dataset.v; A.tab = "registo"; render(); return true;
      case "aud-limpar": A.f = { q: "", marca: "", prio: "", estado: "", semana: "", resp: "", meus: false, fechados: A.f.fechados }; render(); return true;
      case "aud-ver-semana": A.f = { ...A.f, semana: el.dataset.v, estado: "", fechados: true }; A.tab = "registo"; render(); return true;
      case "aud-ir": A.tab = "registo"; A.f = { q: "", marca: "", prio: "", estado: "", semana: "", resp: "", meus: false, fechados: false };
        if (el.dataset.v === "meus") A.f.meus = true; else A.f.estado = el.dataset.v; location.hash = "auditoria"; render(); return true;
      case "aud-abrir": abrir({ tipo: "aud-item", id: el.dataset.id }); return true;
      case "aud-novo": A.novoMarca = "grupo"; abrir({ tipo: "aud-novo" }); return true;
      case "aud-exportar": exportar(); return true;
      case "aud-importar": importar(); return true;
      case "aud-imp-cancelar": A.importacao = null; render(); return true;
      case "aud-estado": { const i = A.itens[S.aberto?.id]; if (i) gravar(i.id, { estado: el.dataset.v }).then((r) => r && toast(r.id + " · " + ESTADOS_AUD[r.estado])); return true; }
      case "aud-validar": {
        const i = A.itens[S.aberto?.id]; if (!i) return true;
        const v = ($("#au-verif")?.value || "").trim();
        if (!v) { toast("Escreve a evidência da verificação antes de validar.", true); $("#au-verif")?.focus(); return true; }
        gravar(i.id, { estado: "validado", verificacao: v }).then((r) => r && toast(r.id + " validado"));
        return true;
      }
      case "aud-aceitar": {
        const i = A.itens[S.aberto?.id]; if (!i) return true;
        const m = ($("#au-motivo")?.value || "").trim();
        if (!m) { toast("Indica o motivo pelo qual a administração aceita este risco.", true); $("#au-motivo")?.focus(); return true; }
        gravar(i.id, { estado: "aceite", aceite_motivo: m }).then((r) => r && toast(r.id + " · risco aceite"));
        return true;
      }
      case "aud-apagar": S.aberto = { ...S.aberto, confirmar: true }; renderPainel(true); return true;
      case "aud-apagar-nao": S.aberto = { ...S.aberto, confirmar: false }; renderPainel(true); return true;
      case "aud-apagar-sim": {
        const id = S.aberto.id, antes = A.itens[id]; delete A.itens[id]; fechar(); render();
        api.aud.itens.apagar(id).then(() => toast("Item " + id + " eliminado")).catch((e) => { A.itens[id] = antes; render(); falha(e); });
        return true;
      }
    }
    return false;
  }
  const timers = {};
  const CAMPOS_TXT = { "au-problema": "problema", "au-evid": "evidencia", "au-corr": "correcao", "au-notas": "notas", "au-cat": "categoria", "au-dom": "dominio" };
  function escrever(e) {
    const t = e.target;
    if (t.id === "aud-q") { A.f.q = t.value; const pos = t.selectionStart; render(); const x = $("#aud-q"); if (x) { x.focus(); x.setSelectionRange(pos, pos); } return true; }
    if (S.aberto?.tipo === "aud-item" && (CAMPOS_TXT[t.id] || t.id === "au-rel")) {
      const id = S.aberto.id;
      if (t.id === "au-problema") { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }
      clearTimeout(timers[t.id]);
      timers[t.id] = setTimeout(() => {
        if (t.id === "au-rel") gravar(id, { relacionado: [...new Set(t.value.split(/[,;\s]+/).map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{2,4}-\d{2,3}$/.test(x) && x !== id))] }, true);
        else if (t.id === "au-problema" && !t.value.trim()) return;
        else gravar(id, { [CAMPOS_TXT[t.id]]: t.id === "au-notas" || t.id === "au-evid" || t.id === "au-corr" ? t.value : t.value.trim() }, true);
      }, 900);
      return true;
    }
    return false;
  }
  function mudar(e) {
    const t = e.target;
    const filtros = { "aud-fmarca": "marca", "aud-fprio": "prio", "aud-fsem": "semana", "aud-fresp": "resp" };
    if (filtros[t.id]) { A.f[filtros[t.id]] = t.value; render(); return true; }
    if (t.id === "aud-fmeus") { A.f.meus = t.checked; render(); return true; }
    if (t.id === "aud-ffech") { A.f.fechados = t.checked; if (A.f.estado === "fechados" && !t.checked) A.f.estado = ""; render(); return true; }
    if (t.id === "aud-ficheiro" && t.files?.[0]) { lerFicheiro(t.files[0]); t.value = ""; return true; }
    if (t.id === "aud-inicio") {
      api.aud.inicio(t.value).then((c) => { A.config = c; render(); toast(t.value ? "Início do plano: " + dataCurta(t.value) : "Data de início retirada"); }).catch(falha);
      return true;
    }
    if (t.dataset.semana && t.id.startsWith("aud-sest-")) {
      const sm = +t.dataset.semana;
      api.aud.plano(sm, { estado: t.value }).then((r) => { A.plano = A.plano.map((s) => (s.semana === sm ? r : s)); render(); }).catch(falha);
      return true;
    }
    if (t.id === "an-marca") { A.novoMarca = t.value; const x = $("#an-id"); if (x) x.value = proximoId(t.value); return true; }
    if (S.aberto?.tipo === "aud-item") {
      const id = S.aberto.id;
      const m = { "au-resp": "responsavel_id", "au-sem": "semana", "au-prio": "prioridade", "au-marca": "marca", "au-imp": "impacto", "au-esf": "esforco" };
      if (m[t.id]) {
        const v = t.id === "au-sem" ? (t.value ? +t.value : null) : t.id === "au-resp" ? t.value || null : t.value;
        gravar(id, { [m[t.id]]: v }).then((r) => r && t.id === "au-resp" && toast(r.responsavel_id ? r.id + " atribuído a " + nomeDe(r.responsavel_id) : r.id + " sem responsável"));
        return true;
      }
    }
    return false;
  }
  async function submeter(f) {
    if (f.id !== "form-aud") return false;
    const id = $("#an-id").value.trim().toUpperCase(), problema = $("#an-prob").value.trim();
    if (!/^[A-Z]{2,4}-\d{2,3}$/.test(id)) { toast("O código tem de ter o formato XX-00 (por exemplo, GP-12).", true); $("#an-id").focus(); return true; }
    if (A.itens[id]) { toast("Já existe o item " + id + ".", true); $("#an-id").focus(); return true; }
    if (!problema) { toast("Descreve o problema.", true); $("#an-prob").focus(); return true; }
    try {
      const r = await api.aud.itens.criar({ id, marca: $("#an-marca").value, problema, categoria: $("#an-cat").value.trim(), prioridade: $("#an-prio").value, semana: $("#an-sem").value ? +$("#an-sem").value : null,
        responsavel_id: $("#an-resp").value || null, evidencia: $("#an-evid").value, correcao: $("#an-corr").value, origem: "manual" });
      A.itens[r.id] = r; fechar(); render(); toast("Item " + r.id + " criado");
    } catch (e) { falha(/duplicate|unique/i.test(e.message) ? new Error("Já existe um item com este código.") : e); }
    return true;
  }
  function reiniciar() { if (desligar) { desligar(); desligar = null; } Object.assign(A, { estado: "por-carregar", itens: {}, plano: [], referencias: [], config: { inicio: null }, hist: {}, importacao: null, tab: "registo" }); }

  return { vista, painel, clique, escrever, mudar, submeter, carregar, blocoInicio, reiniciar, contagem, visivel, estado: () => A.estado };
}
