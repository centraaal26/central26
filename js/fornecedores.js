// Central 26 — Operacional: fornecedores, contactos com empresas e pedidos de orçamento.
import { MARCA, MARCAS, MES, ymd, normalizar, haQuanto, eGestor, paginar, paginador } from "./dados.js";
import { carregarXlsx } from "./xlsx.js";

export const CATEGORIAS = ["Produtos para revenda", "Matérias-primas e embalagens", "Consumíveis das barbearias", "Equipamentos e mobiliário", "Transportes e envios",
  "Telecomunicações", "Energia e água", "Pagamentos e banca", "Software e alojamento", "Viaturas", "Seguros", "Serviços", "Formação", "Outros"];
const ESTADOS_F = { potencial: "Potencial", contactado: "Contactado", proposta: "Proposta recebida", negociacao: "Em negociação", ativo: "Ativo", inativo: "Inativo" };
const ESTADOS_P = { aberto: "A pedir propostas", a_comparar: "A comparar", decidido: "Decidido", cancelado: "Cancelado" };
const ESTADOS_PR = { pedida: "Pedida", recebida: "Recebida", recusada: "Recusada", escolhida: "Escolhida" };
const TIPOS_C = { chamada: "Chamada", email: "Email", reuniao: "Reunião", visita: "Visita", orcamento: "Pedido de orçamento", outro: "Outro" };
const n = (s) => normalizar(s).replace(/[^a-z0-9@. ]+/g, " ").replace(/\s+/g, " ").trim();
const dataCurta = (s) => { if (!s) return ""; const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return d + " " + MES[m - 1] + (y !== new Date().getFullYear() ? " " + y : ""); };
const eur = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €");
const ref = (p) => "P-" + String(p.numero).padStart(3, "0");
const urlOk = (u) => (!u ? "" : /^https?:\/\//i.test(u) ? u : "https://" + u);

export const podeOperacional = (eu) => !!eu && (eGestor(eu) || eu.departamento_id === "operacional");

export function criarFornecedores(ctx) {
  const { S, api, esc, I, toast, falha, render, agendarRender, renderPainel, abrir, fechar, nomeDe, ativos, $ } = ctx;
  const O = (S.op = { estado: "por-carregar", forn: {}, pedidos: {}, propostas: {}, contactos: {}, tab: "fornecedores",
    f: { q: "", cat: "", estado: "", marca: "" }, fp: { q: "", estado: "ativos" }, importacao: null, aImportar: false });
  let desligar = null;

  async function carregar() {
    if (O.estado === "a-carregar") return;
    O.estado = "a-carregar";
    try {
      if (!api.op) throw new Error("A app foi atualizada a meio. Recarrega a página para terminar a atualização.");
      const d = await api.op.carregar();
      O.forn = Object.fromEntries(d.fornecedores.map((x) => [x.id, x]));
      O.pedidos = Object.fromEntries(d.pedidos.map((x) => [x.id, x]));
      O.propostas = Object.fromEntries(d.propostas.map((x) => [x.id, x]));
      O.estado = "pronto";
      if (!desligar && api.op.subscrever) desligar = api.op.subscrever(aoMudar);
    } catch (e) { O.estado = /PGRST20|op_fornecedores|Could not find/i.test(String(e?.message)) ? "falta-script" : "erro"; O.erro = e.message; }
    agendarRender();
    if (["fornecedor", "pedido"].includes(S.aberto?.tipo)) renderPainel(true);
  }
  function aoMudar(t, ev, novo, antigo) {
    const m = { fornecedores: O.forn, pedidos: O.pedidos, propostas: O.propostas }[t];
    if (ev === "DELETE") delete m[antigo.id]; else m[novo.id] = novo;
    agendarRender();
    if (["fornecedor", "pedido"].includes(S.aberto?.tipo)) renderPainel();
  }
  const pode = () => podeOperacional(S.eu);
  const forn = () => Object.values(O.forn);
  const pedidos = () => Object.values(O.pedidos);
  const propostasDe = (pid) => Object.values(O.propostas).filter((p) => p.pedido_id === pid);
  const hoje = () => ymd(new Date());
  const categorias = () => [...new Set(CATEGORIAS.concat(forn().map((f) => f.categoria).filter(Boolean)))];
  const pessoasOp = () => ativos().filter((p) => p.departamento_id === "operacional" || eGestor(p));
  const abertoP = (p) => ["aberto", "a_comparar"].includes(p.estado);

  async function gravarF(id, campos, silencioso) {
    const antes = O.forn[id]; if (!antes) return null;
    O.forn[id] = { ...antes, ...campos }; agendarRender();
    try { const r = await api.op.fornecedores.atualizar(id, campos); O.forn[id] = r; agendarRender(); if (!silencioso) renderPainel(true); return r; }
    catch (e) { O.forn[id] = antes; agendarRender(); renderPainel(true); falha(e); return null; }
  }
  async function gravarP(id, campos, silencioso) {
    const antes = O.pedidos[id]; if (!antes) return null;
    O.pedidos[id] = { ...antes, ...campos }; agendarRender();
    try { const r = await api.op.pedidos.atualizar(id, campos); O.pedidos[id] = r; agendarRender(); if (!silencioso) renderPainel(true); return r; }
    catch (e) { O.pedidos[id] = antes; agendarRender(); renderPainel(true); falha(e); return null; }
  }
  async function gravarPr(id, campos) {
    const antes = O.propostas[id]; if (!antes) return null;
    O.propostas[id] = { ...antes, ...campos };
    try { const r = await api.op.propostas.atualizar(id, campos); O.propostas[id] = r; agendarRender(); return r; }
    catch (e) { O.propostas[id] = antes; renderPainel(true); falha(e); return null; }
  }

  /* ============================== Vistas ============================== */
  const pillF = (e) => '<span class="est-op f-' + esc(e) + '">' + esc(ESTADOS_F[e] || e) + "</span>";
  const pillP = (e) => '<span class="est-op p-' + esc(e) + '">' + esc(ESTADOS_P[e] || e) + "</span>";
  const estrelas = (v) => (v ? '<span class="estrelas" aria-label="Avaliação ' + v + ' em 5">' + "★".repeat(v) + '<i>' + "★".repeat(5 - v) + "</i></span>" : "");

  function vista(param) {
    if (O.estado === "por-carregar") carregar();
    if (param !== O.ultimoParam) { O.ultimoParam = param; if (["fornecedores", "pedidos", "importar"].includes(param)) O.tab = param; }
    let h = '<div class="cab"><div><div class="eyebrow neutro">Departamento Operacional</div><h1>Fornecedores</h1><p class="sub-cab">Quem nos fornece, os contactos feitos e os pedidos de orçamento.</p></div>' +
      (O.estado === "pronto" ? '<div class="acts"><button class="btn sec" data-acao="op-pedido-novo">' + I.plus + 'Pedido de orçamento</button><button class="btn pri" data-acao="op-forn-novo">' + I.plus + "Novo fornecedor</button></div>" : "") + "</div>";
    const abertos = pedidos().filter(abertoP).length;
    const tabs = [["fornecedores", "Fornecedores", forn().length], ["pedidos", "Pedidos de orçamento", abertos], ["importar", "Importar"]];
    h += '<div class="tabs" role="tablist">' + tabs.map(([k, r, c]) => '<button class="tab" role="tab" data-acao="op-tab" data-tab="' + k + '" aria-selected="' + (O.tab === k) + '">' + r + (c != null ? '<span class="n">' + c + "</span>" : "") + "</button>").join("") + "</div>";
    if (O.estado === "falta-script") return h + '<div class="vazio"><h3>Falta instalar o Operacional na base de dados</h3><p>No Supabase, abre o SQL Editor, cola o ficheiro <b>supabase/08-operacional.sql</b> do GitHub e carrega em Run. Depois recarrega esta página.</p></div>';
    if (O.estado === "erro") return h + '<div class="aviso erro">Não foi possível abrir os fornecedores: ' + esc(O.erro || "") + "</div>";
    if (O.estado !== "pronto") return h + '<div class="tabela"><div class="esqueleto"><i style="width:50%"></i></div></div>';
    if (O.tab === "importar") return h + vistaImportar();
    if (O.tab === "pedidos") return h + vistaPedidos();
    return h + vistaForn();
  }

  function vistaForn() {
    const todos = forn(), f = O.f, hj = hoje();
    if (!todos.length) return '<div class="vazio"><h3>Ainda não há fornecedores</h3><p>Importa a lista inicial (fornecedores do SAF-T e das folhas de despesas) ou cria o primeiro à mão.</p><div class="acts"><button class="btn pri" data-acao="op-tab" data-tab="importar">Importar a lista</button><button class="btn sec" data-acao="op-forn-novo">Novo fornecedor</button></div></div>';
    const c = (fn) => todos.filter(fn).length;
    const kpis = [["ativo", "Ativos", c((x) => x.estado === "ativo")], ["potenciais", "Em prospeção", c((x) => ["potencial", "contactado", "proposta", "negociacao"].includes(x.estado))],
      ["contactar", "Contactos para hoje", c((x) => x.proximo_contacto && x.proximo_contacto <= hj && x.estado !== "inativo"), "alerta"], ["sem-contacto", "Sem telefone nem email", c((x) => !x.telefone && !x.email && x.estado !== "inativo")]];
    let h = '<div class="resumo-crm resumo-op">' + kpis.map(([k, r, v, cls]) => '<button class="kpi' + (f.estado === k ? " on" : "") + (cls && v ? " alerta-kpi" : "") + '" data-acao="op-fest" data-v="' + k + '"><span>' + r + "</span><b>" + v + "</b></button>").join("") + "</div>";
    const sel = (id, rot, v, ops) => '<label class="sr" for="' + id + '">' + rot + '</label><select id="' + id + '" class="sel">' + ops.map(([k, r]) => '<option value="' + esc(k) + '"' + (v === k ? " selected" : "") + ">" + esc(r) + "</option>").join("") + "</select>";
    h += '<div class="barra"><div class="ferr ferr-aud"><label class="pesq">' + I.lupa + '<span class="sr">Pesquisar</span><input id="op-q" type="search" placeholder="Nome, produto, localidade, NIF…" value="' + esc(f.q) + '"></label>' +
      sel("op-fcat", "Categoria", f.cat, [["", "Todas as categorias"]].concat(categorias().filter((k) => todos.some((x) => x.categoria === k)).map((k) => [k, k])).concat(todos.some((x) => !x.categoria) ? [["sem", "Sem categoria"]] : [])) +
      sel("op-fest", "Estado", ["ativo", "potenciais", "contactar", "sem-contacto"].includes(f.estado) ? "" : f.estado, [["", "Todos os estados"]].concat(Object.entries(ESTADOS_F))) +
      sel("op-fmarca", "Marca", f.marca, [["", "Todas as marcas"]].concat(MARCAS.map((m) => [m.id, m.nome]))) +
      (f.q || f.cat || f.estado || f.marca ? '<button class="btn sec" data-acao="op-limpar">Limpar filtros</button>' : "") + "</div></div>";
    const q = n(f.q);
    let l = todos;
    if (f.cat) l = l.filter((x) => (f.cat === "sem" ? !x.categoria : x.categoria === f.cat));
    if (f.marca) l = l.filter((x) => (x.marcas || []).includes(f.marca));
    if (f.estado === "potenciais") l = l.filter((x) => ["potencial", "contactado", "proposta", "negociacao"].includes(x.estado));
    else if (f.estado === "contactar") l = l.filter((x) => x.proximo_contacto && x.proximo_contacto <= hj && x.estado !== "inativo");
    else if (f.estado === "sem-contacto") l = l.filter((x) => !x.telefone && !x.email && x.estado !== "inativo");
    else if (f.estado) l = l.filter((x) => x.estado === f.estado);
    if (q) l = l.filter((x) => n([x.nome, x.nif, x.categoria, x.produtos, x.localidade, x.contacto_nome, x.email, x.telefone, x.notas].join(" ")).includes(q));
    l.sort((a, b) => Number(a.estado === "inativo") - Number(b.estado === "inativo") || String(a.proximo_contacto || "9999").localeCompare(String(b.proximo_contacto || "9999")) || a.nome.localeCompare(b.nome, "pt"));
    if (!l.length) return h + '<div class="vazio"><h3>Nada com estes filtros</h3><p>Muda ou limpa os filtros.</p></div>';
    const assin = JSON.stringify(f); if (assin !== O.pagAssin) { O.pagAssin = assin; O.pag = 1; }
    const pg = paginar(l, O.pag, 20); O.pag = pg.pag;
    return h + '<div class="aud-lista">' + pg.itens.map(linhaForn).join("") + "</div>" + paginador(pg, "op-pag", "fornecedores");
  }
  function linhaForn(x) {
    const hj = hoje(), atr = x.proximo_contacto && x.proximo_contacto < hj, hojeC = x.proximo_contacto === hj;
    return '<button class="op-linha' + (x.estado === "inativo" ? " fechado" : "") + '" data-acao="op-forn-abrir" data-id="' + x.id + '"><span class="aud-t"><b>' + esc(x.nome) + "</b><small>" +
      [esc(x.categoria || "Sem categoria"), x.produtos ? esc(x.produtos.slice(0, 80)) : "", x.localidade ? esc(x.localidade) : ""].filter(Boolean).join(" · ") + "</small></span>" +
      '<span class="op-c">' + (x.telefone ? '<span title="Telefone">' + I.tel + "</span>" : "") + (x.email ? '<span title="Email">' + I.mail + "</span>" : "") + estrelas(x.avaliacao) + "</span>" +
      '<span class="aud-m">' + pillF(x.estado) + "</span>" +
      '<span class="aud-r">' + (x.proximo_contacto ? '<small class="' + (atr || hojeC ? "at" : "") + '">' + (atr ? "Contacto atrasado · " : hojeC ? "Contactar hoje" : "Contactar a ") + (hojeC ? "" : esc(dataCurta(x.proximo_contacto))) + "</small>" : "") +
      (x.responsavel_id ? "<small>" + esc((nomeDe(x.responsavel_id) || "").split(" ")[0]) + "</small>" : "") + "</span></button>";
  }

  function vistaPedidos() {
    const todos = pedidos(), fp = O.fp, hj = hoje();
    if (!todos.length) return '<div class="vazio"><h3>Sem pedidos de orçamento</h3><p>Quando precisares de comprar alguma coisa, cria um pedido, junta os fornecedores a contactar e compara as propostas lado a lado.</p><div class="acts"><button class="btn pri" data-acao="op-pedido-novo">Novo pedido de orçamento</button></div></div>';
    let h = '<div class="barra"><div class="ferr ferr-aud"><label class="pesq">' + I.lupa + '<span class="sr">Pesquisar</span><input id="op-pq" type="search" placeholder="Pesquisar pedidos…" value="' + esc(fp.q) + '"></label>' +
      '<label class="sr" for="op-pest">Estado</label><select id="op-pest" class="sel">' + [["ativos", "Por decidir"], ["", "Todos"]].concat(Object.entries(ESTADOS_P)).map(([k, r]) => '<option value="' + k + '"' + (fp.estado === k ? " selected" : "") + ">" + r + "</option>").join("") + "</select></div></div>";
    const q = n(fp.q);
    let l = todos;
    if (fp.estado === "ativos") l = l.filter(abertoP); else if (fp.estado) l = l.filter((p) => p.estado === fp.estado);
    if (q) l = l.filter((p) => n([ref(p), p.titulo, p.descricao, p.categoria].join(" ")).includes(q));
    l.sort((a, b) => Number(!abertoP(a)) - Number(!abertoP(b)) || String(a.prazo || "9999").localeCompare(String(b.prazo || "9999")) || b.numero - a.numero);
    if (!l.length) return h + '<div class="vazio"><h3>Nada por decidir</h3><p>Muda o filtro para ver os pedidos decididos.</p></div>';
    return h + '<div class="aud-lista">' + l.map((p) => {
      const pr = propostasDe(p.id), rec = pr.filter((x) => ["recebida", "escolhida"].includes(x.estado)), melhor = melhorProposta(pr);
      const esc2 = p.escolhida_id && O.propostas[p.escolhida_id];
      const atr = p.prazo && p.prazo < hj && abertoP(p);
      return '<button class="op-linha" data-acao="op-pedido-abrir" data-id="' + p.id + '"><span class="aud-t"><b><span class="mono muted">' + ref(p) + "</span> " + esc(p.titulo) + "</b><small>" +
        [esc(MARCA[p.marca]?.nome || ""), esc(p.categoria), p.quantidade ? esc(p.quantidade) : ""].filter(Boolean).join(" · ") + "</small></span>" +
        '<span class="op-c"><small class="mono">' + rec.length + "/" + pr.length + " propostas</small></span>" +
        '<span class="aud-m">' + pillP(p.estado) + "</span>" +
        '<span class="aud-r">' + (esc2 ? "<small>" + esc(O.forn[esc2.fornecedor_id]?.nome || "") + " · " + eur(esc2.preco) + "</small>" : melhor ? "<small>Melhor: " + eur(melhor.preco) + "</small>" : "") +
        (p.prazo ? '<small class="' + (atr ? "at" : "") + '">' + (atr ? "Prazo passou · " : "Decidir até ") + esc(dataCurta(p.prazo)) + "</small>" : "") + "</span></button>";
    }).join("") + "</div>";
  }
  function melhorProposta(pr) {
    const v = pr.filter((x) => ["recebida", "escolhida"].includes(x.estado) && x.preco != null);
    if (!v.length || new Set(v.map((x) => x.preco_base)).size > 1) return null; // só compara preços na mesma base
    return v.reduce((a, b) => (+b.preco < +a.preco ? b : a));
  }

  /* ---------- Importar ---------- */
  function vistaImportar() {
    const imp = O.importacao;
    let h = '<section class="cartao-sec"><h3>Importar uma lista de fornecedores</h3><p>Ficheiro Excel ou CSV com uma linha por fornecedor. Colunas reconhecidas: Nome, NIF, Categoria, Estado, Marcas, Produtos, Contacto, Telefone, Email, Site, Morada, Localidade, País e Notas. Só o Nome é obrigatório.</p>' +
      "<p>Os fornecedores que já existem (mesmo nome) não são duplicados: só se completam os campos que estão vazios.</p>" +
      '<div class="acts"><label class="btn pri" for="op-ficheiro">' + I.plus + 'Escolher ficheiro</label><input id="op-ficheiro" type="file" accept=".xlsx,.xls,.csv" hidden><button class="btn sec" data-acao="op-modelo">Descarregar o modelo</button></div></section>';
    if (imp?.erro) h += '<div class="aviso erro">' + esc(imp.erro) + "</div>";
    if (imp?.lista) {
      const existe = (nm) => forn().some((x) => x.nome.toLowerCase() === nm.toLowerCase());
      const novos = imp.lista.filter((x) => !existe(x.nome));
      h += '<section class="cartao-sec"><h3>' + esc(imp.nome) + '</h3><p><b>' + novos.length + "</b> fornecedores novos e <b>" + (imp.lista.length - novos.length) + "</b> que já existem." + (imp.ignorados ? " " + imp.ignorados + " linhas sem nome foram ignoradas." : "") + "</p>" +
        '<div class="tabela-scroll"><table class="crm-tabela ref-tab"><thead><tr><th>Nome</th><th>Categoria</th><th>Produtos</th><th>Notas</th></tr></thead><tbody>' +
        imp.lista.slice(0, 15).map((x) => "<tr><td>" + esc(x.nome) + (existe(x.nome) ? ' <span class="tag-tipo">já existe</span>' : "") + "</td><td>" + esc(x.categoria) + "</td><td>" + esc(x.produtos) + "</td><td>" + esc(x.notas) + "</td></tr>").join("") +
        "</tbody></table></div>" + (imp.lista.length > 15 ? '<p class="muted">E mais ' + (imp.lista.length - 15) + ".</p>" : "") +
        '<div class="acts"><button class="btn pri" data-acao="op-importar"' + (O.aImportar ? " disabled" : "") + ">" + (O.aImportar ? "A importar…" : "Importar") + '</button><button class="btn sec" data-acao="op-imp-cancelar">Cancelar</button></div></section>';
    }
    return h;
  }
  const COLS = { nome: /^nome|fornecedor|empresa/, nif: /^nif|contribuinte/, categoria: /categoria/, estado: /^estado/, marcas: /marca/, produtos: /produto|fornece|servico/, contacto_nome: /^contacto$|pessoa/,
    telefone: /telefone|telemovel|tel$/, email: /e ?mail/, site: /site|web/, morada: /morada/, localidade: /localidade|cidade/, pais: /pais/, notas: /nota|observa/, origem: /origem/ };
  async function lerFicheiro(f) {
    O.importacao = { nome: f.name }; render();
    try {
      const XLSX = await carregarXlsx();
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false });
      if (!linhas.length) throw new Error("O ficheiro está vazio.");
      const cab = linhas[0].map((c) => n(c)), idx = Object.fromEntries(Object.entries(COLS).map(([k, re]) => [k, cab.findIndex((c) => re.test(c))]));
      if (idx.nome < 0) throw new Error("Não encontrei a coluna «Nome» na primeira linha.");
      const estadoDe = (v) => Object.entries(ESTADOS_F).find(([k, r]) => n(r) === n(v) || k === n(v))?.[0] || "";
      const marcasDe = (v) => String(v || "").split(/[,;/]+/).map((x) => n(x)).map((x) => MARCAS.find((m) => n(m.nome) === x || m.id === x || n(m.curto) === x)?.id).filter(Boolean);
      const lista = []; let ignorados = 0;
      for (const l of linhas.slice(1)) {
        const g = (k) => (idx[k] >= 0 ? String(l[idx[k]] ?? "").trim() : "");
        if (!g("nome")) { if (l.some((v) => String(v).trim())) ignorados++; continue; }
        lista.push({ nome: g("nome"), nif: g("nif"), categoria: g("categoria"), estado: estadoDe(g("estado")), marcas: marcasDe(g("marcas")), produtos: g("produtos"), contacto_nome: g("contacto_nome"),
          telefone: g("telefone"), email: g("email"), site: g("site"), morada: g("morada"), localidade: g("localidade"), pais: g("pais"), notas: g("notas"), origem: ["saft", "despesas"].includes(n(g("origem"))) ? n(g("origem")) : "importacao" });
      }
      O.importacao.lista = lista; O.importacao.ignorados = ignorados;
    } catch (e) { O.importacao.erro = e.message || "Não foi possível ler o ficheiro."; }
    render();
  }
  async function importar() {
    const l = O.importacao?.lista; if (!l) return;
    O.aImportar = true; render();
    try {
      const r = await api.op.importar({ fornecedores: l });
      O.aImportar = false; O.importacao = null; O.estado = "por-carregar"; await carregar(); O.tab = "fornecedores"; render();
      toast("Importação concluída: " + r.novos + (r.novos === 1 ? " fornecedor novo" : " fornecedores novos") + (r.existentes ? ", " + r.existentes + " já existiam" : ""));
    } catch (e) { O.aImportar = false; render(); falha(e); }
  }
  async function modelo() {
    try {
      const XLSX = await carregarXlsx(), wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([["Nome", "NIF", "Categoria", "Estado", "Marcas", "Produtos", "Contacto", "Telefone", "Email", "Site", "Morada", "Localidade", "País", "Notas"],
        ["Exemplo, Lda.", "500000000", "Matérias-primas e embalagens", "Potencial", "TwentySix", "Caixas de cartão", "Ana Silva", "220 000 000", "geral@exemplo.pt", "exemplo.pt", "Rua Exemplo, 1", "Porto", "Portugal", "Apagar esta linha"]]);
      ws["!cols"] = [26, 12, 26, 14, 18, 30, 16, 14, 24, 18, 26, 14, 10, 24].map((w) => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, "Fornecedores");
      const wc = XLSX.utils.aoa_to_sheet([["Categorias sugeridas"]].concat(CATEGORIAS.map((c) => [c])).concat([[""], ["Estados"]]).concat(Object.values(ESTADOS_F).map((e) => [e])));
      XLSX.utils.book_append_sheet(wb, wc, "Listas");
      XLSX.writeFile(wb, "modelo-fornecedores-central26.xlsx");
    } catch (e) { falha(e); }
  }

  /* ============================== Painéis ============================== */
  function painel(a) {
    if (a.tipo === "fornecedor") return painelForn(a);
    if (a.tipo === "pedido") return painelPedido(a);
    if (a.tipo === "op-forn-novo") return painelFornNovo();
    if (a.tipo === "op-pedido-novo") return painelPedidoNovo();
    return "";
  }
  const mold = (label, c, pe, largo = true) => '<div class="veu" data-acao="fechar"></div><aside class="painel' + (largo ? " largo" : "") + '" role="dialog" aria-label="' + esc(label) + '" data-marca="grupo"><div class="p-scroll">' + c + "</div>" + (pe ? '<div class="p-pe">' + pe + "</div>" : "") + "</aside>";
  const topo = (mig, apagar) => '<div class="p-topo"><span class="migalha"><i></i>' + mig + '</span><span class="acts">' + (apagar ? '<button class="ib perigo" data-acao="' + apagar + '">' + I.lixo + "Eliminar</button>" : "") + '<button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + "</button></span></div>";
  const indisponivel = (t) => mold(t, topo(esc(t)) + (O.estado === "pronto" ? '<div class="vazio"><h3>Já não existe</h3><p>Foi eliminado ou não tens acesso.</p></div>' : '<div class="esqueleto"><i style="width:60%"></i></div>'));

  function painelForn(a) {
    const x = O.forn[a.id]; if (!x) return indisponivel("Fornecedor");
    if (!O.contactos[x.id]) { O.contactos[x.id] = "a-carregar"; api.op.contactos(x.id).then((l) => { O.contactos[x.id] = l; if (S.aberto?.id === x.id) renderPainel(); }).catch(() => { O.contactos[x.id] = []; }); }
    let h = topo("Fornecedores", "op-forn-apagar");
    if (a.confirmar) h += '<div class="aviso erro aviso-acao"><span>Eliminar «' + esc(x.nome) + "», os contactos registados e as propostas? Se deixou de trabalhar connosco, muda o estado para «Inativo».</span>" +
      '<span class="acts"><button class="btn sec" data-acao="op-apagar-nao">Manter</button><button class="btn perigo" data-acao="op-forn-apagar-sim">Eliminar</button></span></div>';
    h += '<label class="sr" for="of-nome">Nome</label><textarea id="of-nome" class="p-titulo" rows="1">' + esc(x.nome) + "</textarea>";
    h += '<div class="chips">' + pillF(x.estado) + (x.categoria ? "<span>" + esc(x.categoria) + "</span>" : "") + estrelas(x.avaliacao) + (x.origem === "saft" ? "<span>Do SAF-T</span>" : x.origem === "despesas" ? "<span>Das folhas de despesas</span>" : "") + "</div>";
    const acoes = [x.telefone ? '<a class="btn sec" href="tel:' + esc(x.telefone.replace(/\s+/g, "")) + '">' + I.tel + esc(x.telefone) + "</a>" : "", x.email ? '<a class="btn sec" href="mailto:' + esc(x.email) + '">' + I.mail + esc(x.email) + "</a>" : "",
      x.site ? '<a class="btn sec" href="' + esc(urlOk(x.site)) + '" target="_blank" rel="noopener">Site</a>' : ""].filter(Boolean);
    if (acoes.length) h += '<div class="acts op-acoes">' + acoes.join("") + "</div>";
    const sel = (id, rot, v, ops) => '<label for="' + id + '">' + rot + '</label><select id="' + id + '">' + ops.map(([k, r]) => '<option value="' + esc(k) + '"' + (String(v ?? "") === String(k) ? " selected" : "") + ">" + esc(r) + "</option>").join("") + "</select>";
    const inp = (id, rot, v, tipo = "text", extra = "") => '<label for="' + id + '">' + rot + '</label><input id="' + id + '" type="' + tipo + '" value="' + esc(v ?? "") + '"' + extra + ">";
    h += '<div class="props">' + sel("of-estado", "Estado", x.estado, Object.entries(ESTADOS_F)) +
      '<label for="of-cat">Categoria</label><input id="of-cat" list="op-cats" value="' + esc(x.categoria) + '" placeholder="Escolhe ou escreve"><datalist id="op-cats">' + categorias().map((c) => '<option value="' + esc(c) + '">').join("") + "</datalist>" +
      sel("of-resp", "Responsável", x.responsavel_id || "", [["", "Sem responsável"]].concat(pessoasOp().map((p) => [p.id, p.nome]))) +
      inp("of-prox", "Próximo contacto", x.proximo_contacto, "date") +
      sel("of-aval", "Avaliação", x.avaliacao || "", [["", "Sem avaliação"], ["5", "★★★★★ Excelente"], ["4", "★★★★ Bom"], ["3", "★★★ Razoável"], ["2", "★★ Fraco"], ["1", "★ Mau"]]) +
      inp("of-contacto", "Pessoa de contacto", x.contacto_nome, "text", ' autocomplete="off"') + inp("of-tel", "Telefone", x.telefone, "tel", ' autocomplete="off"') + inp("of-email", "Email", x.email, "email", ' autocomplete="off"') +
      inp("of-site", "Site", x.site, "url", ' placeholder="https://…"') + inp("of-nif", "NIF", x.nif, "text", ' inputmode="numeric"') + inp("of-morada", "Morada", x.morada) + inp("of-loc", "Localidade", x.localidade) + inp("of-pais", "País", x.pais) +
      inp("of-pag", "Prazo de pagamento", x.prazo_pagamento, "text", ' placeholder="Ex.: 30 dias"') + inp("of-ent", "Prazo de entrega", x.prazo_entrega, "text", ' placeholder="Ex.: 48 horas"') + inp("of-min", "Encomenda mínima", x.encomenda_minima, "text", ' placeholder="Ex.: 150 €"') + "</div>";
    h += '<section class="p-sec"><h3>Marcas que serve</h3><div class="chips-sel">' + MARCAS.map((m) => '<label class="chk-txt"><input type="checkbox" data-op-marca="' + m.id + '"' + ((x.marcas || []).includes(m.id) ? " checked" : "") + "> " + esc(m.nome) + "</label>").join("") + "</div></section>";
    h += '<section class="p-sec"><h3>O que fornece</h3><textarea id="of-prod" class="notas" placeholder="Produtos ou serviços, referências, marcas…">' + esc(x.produtos) + "</textarea></section>";
    h += '<section class="p-sec"><h3>Notas</h3><textarea id="of-notas" class="notas" placeholder="Condições especiais, histórico, cuidados…">' + esc(x.notas) + "</textarea></section>";
    // contactos
    const cs = O.contactos[x.id];
    h += '<section class="p-sec"><h3>Contactos</h3><form class="form-contacto" id="form-op-contacto" novalidate><div class="linha-form"><label class="sr" for="oc-tipo">Tipo</label><select id="oc-tipo" class="sel">' + Object.entries(TIPOS_C).map(([k, r]) => '<option value="' + k + '">' + r + "</option>").join("") + "</select>" +
      '<label class="sr" for="oc-resumo">Resumo</label><input id="oc-resumo" class="inp" placeholder="O que foi falado ou combinado" autocomplete="off"></div>' +
      '<div class="linha-form"><label class="sr" for="oc-prox">Próximo passo</label><input id="oc-prox" class="inp" placeholder="Próximo passo (opcional)" autocomplete="off"><label class="sr" for="oc-data">Voltar a contactar a</label><input id="oc-data" class="inp" type="date" title="Voltar a contactar a"><button class="btn pri" type="submit">Registar</button></div></form>' +
      (cs === "a-carregar" ? '<div class="esqueleto"><i style="width:40%"></i></div>' : cs?.length ? '<ul class="hist-aud">' + cs.map((c) => "<li><b>" + esc(TIPOS_C[c.tipo]) + "</b> · " + esc(nomeDe(c.autor_id) || "—") + ' <small class="muted">' + esc(haQuanto(c.data)) + "</small><br>" + esc(c.resumo) +
        (c.proximo_passo ? '<br><small>Próximo passo: ' + esc(c.proximo_passo) + "</small>" : "") + ' <button class="c-link" data-acao="op-contacto-apagar" data-id="' + c.id + '" aria-label="Apagar contacto">apagar</button></li>').join("") + "</ul>" : '<p class="muted">Ainda não há contactos registados.</p>') + "</section>";
    // propostas
    const prs = Object.values(O.propostas).filter((p) => p.fornecedor_id === x.id);
    if (prs.length) h += '<section class="p-sec"><h3>Pedidos de orçamento</h3><ul class="hist-aud">' + prs.map((p) => { const pd = O.pedidos[p.pedido_id]; return pd ? '<li><button class="c-link" data-acao="op-pedido-abrir" data-id="' + pd.id + '">' + ref(pd) + " · " + esc(pd.titulo) + "</button> · " + esc(ESTADOS_PR[p.estado]) + (p.preco != null ? " · " + eur(p.preco) : "") + "</li>" : ""; }).join("") + "</ul></section>";
    return mold("Fornecedor", h, "<span>" + (x.atualizado_por ? "Alterado por " + esc(nomeDe(x.atualizado_por) || "—") + " " + esc(haQuanto(x.atualizado_em)) : "") + "</span>");
  }

  function textoPedido(p, f) {
    const eu = S.eu, marca = p.marca && p.marca !== "grupo" ? MARCA[p.marca]?.nome : "Grupo 26";
    const emNome = p.marca && p.marca !== "grupo" ? "da " + marca : "do Grupo 26";
    return "Bom dia" + (f?.contacto_nome ? ", " + f.contacto_nome.split(" ")[0] : "") + ",\n\n" +
      "Escrevo em nome " + emNome + ". Estamos a pedir propostas para o seguinte:\n\n" + p.titulo + (p.descricao ? "\n" + p.descricao : "") + (p.quantidade ? "\nQuantidade: " + p.quantidade : "") + "\n\n" +
      "Podem enviar-nos o preço (com indicação de IVA e portes), o prazo de entrega, as condições de pagamento e a validade da proposta" + (p.prazo ? ", se possível até " + dataCurta(p.prazo) : "") + "?\n\n" +
      "Com os melhores cumprimentos,\n" + eu.nome + (eu.cargo ? "\n" + eu.cargo : "") + "\n" + marca + (eu.telefone ? "\n" + eu.telefone : "");
  }
  function painelPedido(a) {
    const p = O.pedidos[a.id]; if (!p) return indisponivel("Pedido de orçamento");
    const prs = propostasDe(p.id).sort((x, y) => (x.preco ?? 1e12) - (y.preco ?? 1e12)), melhor = melhorProposta(prs);
    let h = topo("Pedidos de orçamento / <span class=\"mono\">" + ref(p) + "</span>", "op-pedido-apagar");
    if (a.confirmar) h += '<div class="aviso erro aviso-acao"><span>Eliminar o pedido ' + ref(p) + " e as propostas registadas? Se já não é preciso, muda o estado para «Cancelado».</span>" +
      '<span class="acts"><button class="btn sec" data-acao="op-apagar-nao">Manter</button><button class="btn perigo" data-acao="op-pedido-apagar-sim">Eliminar</button></span></div>';
    h += '<label class="sr" for="op-titulo">Título</label><textarea id="op-titulo" class="p-titulo" rows="1">' + esc(p.titulo) + "</textarea>";
    h += '<div class="chips">' + pillP(p.estado) + '<span class="tag-marca" data-marca="' + esc(p.marca) + '">' + esc(MARCA[p.marca]?.nome || "") + "</span>" + (p.prazo ? "<span>Decidir até " + esc(dataCurta(p.prazo)) + "</span>" : "") + "</div>";
    if (p.estado === "decidido" && p.escolhida_id && O.propostas[p.escolhida_id]) {
      const e = O.propostas[p.escolhida_id];
      h += '<div class="aviso ok aviso-acao"><span><b>Escolhido: ' + esc(O.forn[e.fornecedor_id]?.nome || "") + "</b> · " + eur(e.preco) + (e.prazo_entrega ? " · " + esc(e.prazo_entrega) : "") + (p.decisao ? ". Motivo: " + esc(p.decisao) : "") + "</span>" +
        '<button class="btn sec" data-acao="op-reabrir">Reabrir</button></div>';
    }
    const sel = (id, rot, v, ops) => '<label for="' + id + '">' + rot + '</label><select id="' + id + '">' + ops.map(([k, r]) => '<option value="' + esc(k) + '"' + (String(v ?? "") === String(k) ? " selected" : "") + ">" + esc(r) + "</option>").join("") + "</select>";
    h += '<div class="props">' + sel("op-estado", "Estado", p.estado, Object.entries(ESTADOS_P)) + sel("op-resp", "Responsável", p.responsavel_id || "", [["", "Sem responsável"]].concat(pessoasOp().map((x) => [x.id, x.nome]))) +
      '<label for="op-prazo">Decidir até</label><input id="op-prazo" type="date" value="' + esc(p.prazo || "") + '">' + sel("op-marca", "Marca", p.marca, MARCAS.map((m) => [m.id, m.nome])) +
      '<label for="op-cat">Categoria</label><input id="op-cat" list="op-cats2" value="' + esc(p.categoria) + '"><datalist id="op-cats2">' + categorias().map((c) => '<option value="' + esc(c) + '">').join("") + "</datalist>" +
      '<label for="op-qtd">Quantidade</label><input id="op-qtd" value="' + esc(p.quantidade) + '" placeholder="Ex.: 500 unidades"></div>';
    h += '<section class="p-sec"><h3>O que é preciso</h3><textarea id="op-desc" class="notas" placeholder="Especificações, medidas, marca preferida, local de entrega…">' + esc(p.descricao) + "</textarea></section>";
    // propostas
    h += '<section class="p-sec"><h3>Propostas <span class="mono muted">' + prs.filter((x) => ["recebida", "escolhida"].includes(x.estado)).length + "/" + prs.length + " recebidas</span></h3>";
    if (prs.length) {
      h += '<div class="tabela-scroll"><table class="crm-tabela prop-tab"><thead><tr><th>Fornecedor</th><th>Estado</th><th class="n">Preço</th><th>Base</th><th>Entrega</th><th>Condições</th><th>Validade</th><th></th></tr></thead><tbody>' +
        prs.map((x) => {
          const f = O.forn[x.fornecedor_id], lid = x.id;
          return '<tr class="' + (x.estado === "escolhida" ? "escolhida" : x.estado === "recusada" ? "recusada" : "") + (melhor?.id === lid && p.estado !== "decidido" ? " melhor" : "") + '"><td><button class="c-link" data-acao="op-forn-abrir" data-id="' + esc(x.fornecedor_id) + '">' + esc(f?.nome || "—") + "</button>" + (melhor?.id === lid && p.estado !== "decidido" ? ' <span class="tag-tipo">mais barata</span>' : "") + "</td>" +
            '<td><label class="sr" for="pr-e-' + lid + '">Estado</label><select class="sel mini" id="pr-e-' + lid + '" data-prop="' + lid + '" data-campo="estado">' + Object.entries(ESTADOS_PR).filter(([k]) => k !== "escolhida" || x.estado === "escolhida").map(([k, r]) => '<option value="' + k + '"' + (x.estado === k ? " selected" : "") + ">" + r + "</option>").join("") + "</select></td>" +
            '<td class="n"><label class="sr" for="pr-p-' + lid + '">Preço</label><input class="inp mini n" id="pr-p-' + lid + '" type="number" step="0.01" min="0" inputmode="decimal" data-prop="' + lid + '" data-campo="preco" value="' + (x.preco ?? "") + '" placeholder="€"></td>' +
            '<td><label class="sr" for="pr-b-' + lid + '">Base do preço</label><select class="sel mini" id="pr-b-' + lid + '" data-prop="' + lid + '" data-campo="preco_base"><option value="total"' + (x.preco_base === "total" ? " selected" : "") + ">Total</option><option value=\"unidade\"" + (x.preco_base === "unidade" ? " selected" : "") + ">Por unidade</option></select>" +
            '<label class="chk-txt mini"><input type="checkbox" data-prop="' + lid + '" data-campo="iva_incluido"' + (x.iva_incluido ? " checked" : "") + "> c/ IVA</label></td>" +
            '<td><label class="sr" for="pr-z-' + lid + '">Prazo de entrega</label><input class="inp mini" id="pr-z-' + lid + '" data-prop="' + lid + '" data-campo="prazo_entrega" value="' + esc(x.prazo_entrega) + '" placeholder="Ex.: 10 dias"></td>' +
            '<td><label class="sr" for="pr-c-' + lid + '">Condições</label><input class="inp mini" id="pr-c-' + lid + '" data-prop="' + lid + '" data-campo="condicoes" value="' + esc(x.condicoes) + '" placeholder="Pagamento, portes…"></td>' +
            '<td><label class="sr" for="pr-v-' + lid + '">Validade</label><input class="inp mini" id="pr-v-' + lid + '" type="date" data-prop="' + lid + '" data-campo="validade" value="' + esc(x.validade || "") + '"></td>' +
            '<td class="acts-tab">' + (p.estado !== "decidido" && ["recebida"].includes(x.estado) ? '<button class="btn sec mini" data-acao="op-escolher" data-id="' + lid + '">Escolher</button>' : "") +
            (f?.email && x.estado === "pedida" ? '<a class="btn sec mini" href="mailto:' + esc(f.email) + "?subject=" + encodeURIComponent("Pedido de orçamento · " + p.titulo) + "&body=" + encodeURIComponent(textoPedido(p, f)) + '">Enviar email</a>' : "") +
            '<button class="ib x" data-acao="op-prop-apagar" data-id="' + lid + '" aria-label="Retirar ' + esc(f?.nome || "") + ' do pedido">' + I.x + "</button></td></tr>";
        }).join("") + "</tbody></table></div>";
      if (prs.some((x) => x.preco != null) && new Set(prs.filter((x) => x.preco != null).map((x) => x.preco_base)).size > 1) h += '<p class="muted">Há preços totais e preços por unidade: para comparar, usa a mesma base em todas as propostas.</p>';
    } else h += '<p class="muted">Junta os fornecedores a quem vais pedir proposta.</p>';
    if (a.escolher) {
      const e = O.propostas[a.escolher];
      h += '<div class="aviso aviso-acao"><span>Escolher <b>' + esc(O.forn[e?.fornecedor_id]?.nome || "") + "</b>. As outras propostas ficam recusadas.</span>" +
        '<label class="sr" for="op-decisao">Motivo da escolha</label><input id="op-decisao" class="inp" placeholder="Motivo (ex.: melhor preço com entrega em 48 h)"><span class="acts"><button class="btn sec" data-acao="op-escolher-nao">Cancelar</button><button class="btn pri" data-acao="op-escolher-sim" data-id="' + esc(a.escolher) + '">Confirmar escolha</button></span></div>';
    }
    // juntar fornecedores
    const ja = new Set(prs.map((x) => x.fornecedor_id));
    const cand = forn().filter((f) => !ja.has(f.id) && f.estado !== "inativo").sort((x, y) => Number(y.categoria === p.categoria) - Number(x.categoria === p.categoria) || x.nome.localeCompare(y.nome, "pt"));
    if (p.estado !== "decidido" && cand.length) {
      h += '<details class="p-sec aceitar"' + (!prs.length ? " open" : "") + "><summary>Juntar fornecedores ao pedido</summary>" +
        (p.categoria ? '<p class="muted">Primeiro aparecem os da categoria «' + esc(p.categoria) + "».</p>" : "") +
        '<div class="ev-pessoas op-cand">' + cand.slice(0, 60).map((f) => '<label class="chk-txt"><input type="checkbox" name="op-cand" value="' + f.id + '"> ' + esc(f.nome) + (f.categoria ? ' <small class="muted">· ' + esc(f.categoria) + "</small>" : "") + "</label>").join("") + "</div>" +
        '<div class="acts"><button class="btn pri" data-acao="op-juntar">' + I.plus + "Juntar selecionados</button></div></details>";
    }
    // texto do pedido
    h += '<details class="p-sec aceitar"><summary>Texto para pedir a proposta</summary><p class="muted">Para enviar por email ou WhatsApp. O botão «Enviar email» de cada fornecedor já abre a mensagem preenchida.</p><textarea id="op-texto" class="notas texto-pedido" readonly>' + esc(textoPedido(p, null)) + '</textarea><div class="acts"><button class="btn sec" data-acao="op-copiar">' + I.copiar + "Copiar texto</button></div></details>";
    return mold("Pedido de orçamento", h, "<span>Criado por " + esc(nomeDe(p.criado_por) || "—") + " " + esc(haQuanto(p.criado_em)) + "</span>");
  }

  function painelFornNovo() {
    const c = topo("Fornecedores") + '<h2 style="margin:0">Novo fornecedor</h2><form class="form" id="form-op-forn" novalidate>' +
      '<div class="campo"><label for="nf-nome">Nome</label><input id="nf-nome" required autocomplete="off" placeholder="Ex.: Embalagens do Norte, Lda."></div>' +
      '<div class="campos-2"><div class="campo"><label for="nf-cat">Categoria</label><input id="nf-cat" list="op-cats3" autocomplete="off"><datalist id="op-cats3">' + categorias().map((x) => '<option value="' + esc(x) + '">').join("") + "</datalist></div>" +
      '<div class="campo"><label for="nf-estado">Estado</label><select id="nf-estado">' + Object.entries(ESTADOS_F).map(([k, r]) => '<option value="' + k + '"' + (k === "potencial" ? " selected" : "") + ">" + r + "</option>").join("") + "</select></div></div>" +
      '<div class="campos-2"><div class="campo"><label for="nf-tel">Telefone</label><input id="nf-tel" type="tel" autocomplete="off"></div><div class="campo"><label for="nf-email">Email</label><input id="nf-email" type="email" autocomplete="off"></div></div>' +
      '<div class="campos-2"><div class="campo"><label for="nf-contacto">Pessoa de contacto</label><input id="nf-contacto" autocomplete="off"></div><div class="campo"><label for="nf-loc">Localidade</label><input id="nf-loc" autocomplete="off"></div></div>' +
      '<div class="campo"><label for="nf-site">Site</label><input id="nf-site" type="url" placeholder="https://…" autocomplete="off"></div>' +
      '<div class="campo"><label for="nf-prod">O que fornece</label><textarea id="nf-prod" placeholder="Produtos ou serviços"></textarea></div>' +
      '<div class="acts"><button class="btn pri" type="submit">Criar fornecedor</button><button class="btn sec" type="button" data-acao="fechar">Cancelar</button></div></form>';
    return mold("Novo fornecedor", c, "", true);
  }
  function painelPedidoNovo() {
    const c = topo("Pedidos de orçamento") + '<h2 style="margin:0">Novo pedido de orçamento</h2><p class="muted" style="margin:0">Descreve o que é preciso. Depois juntas os fornecedores e vais registando as propostas.</p><form class="form" id="form-op-pedido" novalidate>' +
      '<div class="campo"><label for="np-titulo">O que é preciso</label><input id="np-titulo" required autocomplete="off" placeholder="Ex.: Caixas de envio para a loja online"></div>' +
      '<div class="campo"><label for="np-desc">Detalhes</label><textarea id="np-desc" placeholder="Especificações, medidas, local de entrega…"></textarea></div>' +
      '<div class="campos-3"><div class="campo"><label for="np-qtd">Quantidade</label><input id="np-qtd" autocomplete="off" placeholder="Ex.: 500 unidades"></div>' +
      '<div class="campo"><label for="np-marca">Marca</label><select id="np-marca">' + MARCAS.map((m) => '<option value="' + m.id + '"' + (m.id === "grupo" ? " selected" : "") + ">" + esc(m.nome) + "</option>").join("") + "</select></div>" +
      '<div class="campo"><label for="np-prazo">Decidir até</label><input id="np-prazo" type="date"></div></div>' +
      '<div class="campos-2"><div class="campo"><label for="np-cat">Categoria</label><input id="np-cat" list="op-cats4" autocomplete="off"><datalist id="op-cats4">' + categorias().map((x) => '<option value="' + esc(x) + '">').join("") + "</datalist></div>" +
      '<div class="campo"><label for="np-resp">Responsável</label><select id="np-resp"><option value="">Eu</option>' + pessoasOp().filter((x) => x.id !== S.eu.id).map((x) => '<option value="' + x.id + '">' + esc(x.nome) + "</option>").join("") + "</select></div></div>" +
      '<div class="acts"><button class="btn pri" type="submit">Criar pedido</button><button class="btn sec" type="button" data-acao="fechar">Cancelar</button></div></form>';
    return mold("Novo pedido de orçamento", c, "", true);
  }

  /* ============================== Início ============================== */
  function blocoInicio() {
    if (!pode()) return "";
    if (O.estado === "por-carregar") carregar();
    if (O.estado !== "pronto") return "";
    const hj = hoje(), sem = ymd(new Date(Date.now() + 7 * 864e5));
    const cont = forn().filter((x) => x.proximo_contacto && x.proximo_contacto <= hj && x.estado !== "inativo" && (!x.responsavel_id || x.responsavel_id === S.eu.id || eGestor(S.eu)));
    const peds = pedidos().filter((p) => abertoP(p) && p.prazo && p.prazo <= sem);
    if (!cont.length && !peds.length) return "";
    return '<section class="cartao-sec"><h3>Fornecedores <a class="c-link" href="#operacional" style="font-size:13px;margin-left:8px">Abrir</a></h3><div class="aud-lista">' +
      cont.slice(0, 3).map(linhaForn).join("") + peds.slice(0, 3).map((p) => '<button class="op-linha" data-acao="op-pedido-abrir" data-id="' + p.id + '"><span class="aud-t"><b><span class="mono muted">' + ref(p) + "</span> " + esc(p.titulo) + "</b><small>" +
        propostasDe(p.id).filter((x) => ["recebida", "escolhida"].includes(x.estado)).length + " propostas recebidas</small></span><span class=\"op-c\"></span><span class=\"aud-m\">" + pillP(p.estado) + '</span><span class="aud-r"><small class="' + (p.prazo < hj ? "at" : "") + '">Decidir até ' + esc(dataCurta(p.prazo)) + "</small></span></button>").join("") + "</div></section>";
  }
  const contagem = () => (O.estado !== "pronto" || !pode() ? 0 : forn().filter((x) => x.proximo_contacto && x.proximo_contacto <= hoje() && x.estado !== "inativo").length);

  /* ============================== Ações ============================== */
  function clique(acao, el) {
    const id = el.dataset.id;
    switch (acao) {
      case "op-pag": O.pag = +el.dataset.p; render(); document.querySelector(".aud-lista")?.scrollIntoView({ block: "start", behavior: "smooth" }); return true;
      case "op-tab": O.tab = el.dataset.tab; if (S.rota === "operacional" && S.param) location.hash = "operacional"; else render(); return true;
      case "op-fest": O.f.estado = O.f.estado === el.dataset.v ? "" : el.dataset.v; render(); return true;
      case "op-limpar": O.f = { q: "", cat: "", estado: "", marca: "" }; render(); return true;
      case "op-forn-abrir": abrir({ tipo: "fornecedor", id }); return true;
      case "op-pedido-abrir": abrir({ tipo: "pedido", id }); return true;
      case "op-forn-novo": abrir({ tipo: "op-forn-novo" }); return true;
      case "op-pedido-novo": abrir({ tipo: "op-pedido-novo" }); return true;
      case "op-modelo": modelo(); return true;
      case "op-importar": importar(); return true;
      case "op-imp-cancelar": O.importacao = null; render(); return true;
      case "op-forn-apagar": case "op-pedido-apagar": S.aberto = { ...S.aberto, confirmar: true }; renderPainel(true); return true;
      case "op-apagar-nao": S.aberto = { ...S.aberto, confirmar: false }; renderPainel(true); return true;
      case "op-forn-apagar-sim": { const fid = S.aberto.id, antes = O.forn[fid]; delete O.forn[fid]; fechar(); render(); api.op.fornecedores.apagar(fid).then(() => { Object.values(O.propostas).forEach((p) => p.fornecedor_id === fid && delete O.propostas[p.id]); toast("Fornecedor eliminado"); }).catch((e) => { O.forn[fid] = antes; render(); falha(e); }); return true; }
      case "op-pedido-apagar-sim": { const pid = S.aberto.id, antes = O.pedidos[pid]; delete O.pedidos[pid]; fechar(); render(); api.op.pedidos.apagar(pid).then(() => toast("Pedido eliminado")).catch((e) => { O.pedidos[pid] = antes; render(); falha(e); }); return true; }
      case "op-contacto-apagar": { const fid = S.aberto?.id; api.op.contacto.apagar(id).then(() => { if (Array.isArray(O.contactos[fid])) O.contactos[fid] = O.contactos[fid].filter((c) => c.id !== id); renderPainel(true); toast("Contacto apagado"); }).catch(falha); return true; }
      case "op-juntar": {
        const p = O.pedidos[S.aberto?.id]; if (!p) return true;
        const ids = [...document.querySelectorAll('input[name="op-cand"]:checked')].map((x) => x.value);
        if (!ids.length) { toast("Escolhe pelo menos um fornecedor.", true); return true; }
        Promise.all(ids.map((fid) => api.op.propostas.criar({ pedido_id: p.id, fornecedor_id: fid }))).then(async (l) => {
          l.forEach((r) => (O.propostas[r.id] = r));
          for (const fid of ids) { const f = O.forn[fid]; if (f && f.estado === "potencial") await gravarF(fid, { estado: "contactado" }, true); }
          renderPainel(true); toast(l.length === 1 ? "1 fornecedor junto ao pedido" : l.length + " fornecedores juntos ao pedido");
        }).catch(falha);
        return true;
      }
      case "op-prop-apagar": { const antes = O.propostas[id]; delete O.propostas[id]; renderPainel(true); api.op.propostas.apagar(id).catch((e) => { O.propostas[id] = antes; renderPainel(true); falha(e); }); return true; }
      case "op-escolher": S.aberto = { ...S.aberto, escolher: id }; renderPainel(true); setTimeout(() => $("#op-decisao")?.focus(), 0); return true;
      case "op-escolher-nao": S.aberto = { ...S.aberto, escolher: null }; renderPainel(true); return true;
      case "op-escolher-sim": {
        const pid = S.aberto.id, motivo = ($("#op-decisao")?.value || "").trim();
        api.op.escolher(id, motivo).then(async () => { O.estado = "por-carregar"; await carregar(); S.aberto = { tipo: "pedido", id: pid }; renderPainel(true); toast("Proposta escolhida"); }).catch(falha);
        return true;
      }
      case "op-reabrir": {
        const p = O.pedidos[S.aberto?.id]; if (!p) return true;
        const esc2 = p.escolhida_id;
        gravarP(p.id, { estado: "a_comparar", escolhida_id: null, decisao: "" }).then(async (r) => { if (r && esc2 && O.propostas[esc2]) await gravarPr(esc2, { estado: "recebida" }); renderPainel(true); });
        return true;
      }
      case "op-copiar": {
        const t = $("#op-texto"); if (!t) return true;
        navigator.clipboard?.writeText(t.value).then(() => toast("Texto copiado")).catch(() => { t.select(); toast("Seleciona e copia o texto"); });
        return true;
      }
    }
    return false;
  }
  const timers = {};
  const CF = { "of-nome": "nome", "of-cat": "categoria", "of-contacto": "contacto_nome", "of-tel": "telefone", "of-email": "email", "of-site": "site", "of-nif": "nif", "of-morada": "morada", "of-loc": "localidade",
    "of-pais": "pais", "of-pag": "prazo_pagamento", "of-ent": "prazo_entrega", "of-min": "encomenda_minima", "of-prod": "produtos", "of-notas": "notas" };
  const CP = { "op-titulo": "titulo", "op-cat": "categoria", "op-qtd": "quantidade", "op-desc": "descricao" };
  function escrever(e) {
    const t = e.target;
    if (t.id === "op-q" || t.id === "op-pq") { if (t.id === "op-q") O.f.q = t.value; else O.fp.q = t.value; const pos = t.selectionStart; render(); const x = $("#" + t.id); if (x) { x.focus(); x.setSelectionRange(pos, pos); } return true; }
    const sid = S.aberto?.id;
    if (S.aberto?.tipo === "fornecedor" && CF[t.id]) {
      if (t.id === "of-nome") { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }
      clearTimeout(timers[t.id]); timers[t.id] = setTimeout(() => { const v = ["of-prod", "of-notas"].includes(t.id) ? t.value : t.value.trim(); if (t.id === "of-nome" && !v) return; gravarF(sid, { [CF[t.id]]: v }, true); }, 900);
      return true;
    }
    if (S.aberto?.tipo === "pedido" && CP[t.id]) {
      if (t.id === "op-titulo") { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }
      clearTimeout(timers[t.id]); timers[t.id] = setTimeout(() => { const v = t.id === "op-desc" ? t.value : t.value.trim(); if (t.id === "op-titulo" && !v) return; gravarP(sid, { [CP[t.id]]: v }, true); }, 900);
      return true;
    }
    if (t.dataset.prop && ["preco", "prazo_entrega", "condicoes"].includes(t.dataset.campo)) {
      const pid = t.dataset.prop, campo = t.dataset.campo;
      clearTimeout(timers[t.id]); timers[t.id] = setTimeout(() => {
        const v = campo === "preco" ? (t.value === "" ? null : Math.max(0, +t.value)) : t.value.trim();
        const pr = O.propostas[pid]; const extra = campo === "preco" && v != null && pr?.estado === "pedida" ? { estado: "recebida" } : {};
        gravarPr(pid, { [campo]: v, ...extra }).then((r) => { if (r && extra.estado) { const p = O.pedidos[r.pedido_id]; if (p?.estado === "aberto") gravarP(p.id, { estado: "a_comparar" }, true); renderPainel(true); } });
      }, 900);
      return true;
    }
    return false;
  }
  function mudar(e) {
    const t = e.target;
    if (t.id === "op-fcat") { O.f.cat = t.value; render(); return true; }
    if (t.id === "op-fest") { O.f.estado = t.value; render(); return true; }
    if (t.id === "op-fmarca") { O.f.marca = t.value; render(); return true; }
    if (t.id === "op-pest") { O.fp.estado = t.value; render(); return true; }
    if (t.id === "op-ficheiro" && t.files?.[0]) { lerFicheiro(t.files[0]); t.value = ""; return true; }
    const sid = S.aberto?.id;
    if (S.aberto?.tipo === "fornecedor") {
      const m = { "of-estado": "estado", "of-resp": "responsavel_id", "of-prox": "proximo_contacto", "of-aval": "avaliacao" };
      if (m[t.id]) { const v = t.id === "of-aval" ? (t.value ? +t.value : null) : t.value || null; gravarF(sid, { [m[t.id]]: v }); return true; }
      if (t.dataset.opMarca) { const f = O.forn[sid]; const set = new Set(f.marcas || []); if (t.checked) set.add(t.dataset.opMarca); else set.delete(t.dataset.opMarca); gravarF(sid, { marcas: [...set] }, true); return true; }
    }
    if (S.aberto?.tipo === "pedido") {
      const m = { "op-estado": "estado", "op-resp": "responsavel_id", "op-prazo": "prazo", "op-marca": "marca" };
      if (m[t.id]) { gravarP(sid, { [m[t.id]]: t.value || null }); return true; }
      if (t.dataset.prop && ["estado", "preco_base", "validade", "iva_incluido"].includes(t.dataset.campo)) {
        const v = t.dataset.campo === "iva_incluido" ? t.checked : t.value || null;
        gravarPr(t.dataset.prop, { [t.dataset.campo]: v }).then(() => renderPainel(true));
        return true;
      }
    }
    return false;
  }
  async function submeter(f) {
    if (f.id === "form-op-forn") {
      const nome = $("#nf-nome").value.trim(); if (!nome) { toast("Indica o nome do fornecedor.", true); $("#nf-nome").focus(); return true; }
      if (forn().some((x) => x.nome.toLowerCase() === nome.toLowerCase())) { toast("Já existe um fornecedor com este nome.", true); return true; }
      try {
        const r = await api.op.fornecedores.criar({ nome, categoria: $("#nf-cat").value.trim(), estado: $("#nf-estado").value, telefone: $("#nf-tel").value.trim(), email: $("#nf-email").value.trim(),
          contacto_nome: $("#nf-contacto").value.trim(), localidade: $("#nf-loc").value.trim(), site: $("#nf-site").value.trim(), produtos: $("#nf-prod").value, origem: "manual" });
        O.forn[r.id] = r; abrir({ tipo: "fornecedor", id: r.id }); render(); toast("Fornecedor criado");
      } catch (e) { falha(/duplicate|unique/i.test(e.message) ? new Error("Já existe um fornecedor com este nome.") : e); }
      return true;
    }
    if (f.id === "form-op-pedido") {
      const titulo = $("#np-titulo").value.trim(); if (!titulo) { toast("Diz o que é preciso.", true); $("#np-titulo").focus(); return true; }
      try {
        const r = await api.op.pedidos.criar({ titulo, descricao: $("#np-desc").value, quantidade: $("#np-qtd").value.trim(), marca: $("#np-marca").value, prazo: $("#np-prazo").value || null,
          categoria: $("#np-cat").value.trim(), responsavel_id: $("#np-resp").value || S.eu.id });
        O.pedidos[r.id] = r; O.tab = "pedidos"; abrir({ tipo: "pedido", id: r.id }); render(); toast("Pedido " + ref(r) + " criado");
      } catch (e) { falha(e); }
      return true;
    }
    if (f.id === "form-op-contacto") {
      const fid = S.aberto?.id, resumo = $("#oc-resumo").value.trim(); if (!resumo) { toast("Escreve um resumo do contacto.", true); $("#oc-resumo").focus(); return true; }
      try {
        const r = await api.op.contacto.criar({ fornecedor_id: fid, tipo: $("#oc-tipo").value, resumo, proximo_passo: $("#oc-prox").value.trim() });
        O.contactos[fid] = [r].concat(Array.isArray(O.contactos[fid]) ? O.contactos[fid] : []);
        const data = $("#oc-data").value, x = O.forn[fid];
        const campos = { proximo_contacto: data || null };
        if (x && x.estado === "potencial") campos.estado = "contactado";
        await gravarF(fid, campos, true);
        renderPainel(true); toast("Contacto registado" + (data ? " · voltar a contactar a " + dataCurta(data) : ""));
      } catch (e) { falha(e); }
      return true;
    }
    return false;
  }
  function reiniciar() { if (desligar) { desligar(); desligar = null; } Object.assign(O, { estado: "por-carregar", forn: {}, pedidos: {}, propostas: {}, contactos: {}, importacao: null, tab: "fornecedores" }); }

  return { vista, painel, clique, escrever, mudar, submeter, carregar, blocoInicio, reiniciar, contagem, estado: () => O.estado };
}
