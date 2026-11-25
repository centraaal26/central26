// Central 26 — Lojas (barbearias): responsáveis, stock de consumíveis e produtos, pedidos da semana, trocos, manutenção
// e aluguer de cadeiras (valor fixo + percentagem da faturação bruta; a fatura sai do Multixop).
import { eGestor, normalizar, haQuanto, ymd, MES_L } from "./dados.js";

const TIPOS = { semanal: "Pedido da semana", trocos: "Trocos", manutencao: "Manutenção" };
const ESTADOS = { pedido: ["Pedido", "e-proposta"], em_curso: ["A ser tratado", "e-contactado"], feito: ["Feito", "e-cliente"], cancelado: ["Cancelado", "e-perdido"] };
const MOEDAS = [["2", "2 €", 2], ["1", "1 €", 1], ["0.5", "0,50 €", 0.5]];
const CAT = { consumivel: "Consumível", produto: "Produto" };
const eur2 = (v) => (Number(v) || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const lerNum = (t) => { const s = String(t ?? "").replace(/\s|€|%/g, "").replace(",", "."); if (s === "") return null; const n = Number(s); return Number.isFinite(n) ? n : NaN; };
const refP = (p) => "P-" + String(p.numero).padStart(4, "0");

export function criarLojas(ctx) {
  const { S, api, esc, I, toast, falha, render, renderPainel, abrir, nomeDe, ativos, podeFinanceiro } = ctx;
  const L = (S.loj = { estado: "por-carregar", lojas: {}, itens: {}, stock: {}, pedidos: {}, config: null, tab: "stock", loja: null, verFeitos: false, cad: null });
  let desligar = null;

  const eu = () => S.eu;
  const eLog = () => !!eu() && (eGestor(eu()) || eu().departamento_id === "logistica");
  const minhas = () => Object.values(L.lojas).filter((l) => l.ativo && (eLog() || l.responsavel_id === eu()?.id)).sort((a, b) => a.ordem - b.ordem);
  const visivel = () => { if (L.estado === "por-carregar" && eu()) carregar(); return eLog() || (L.estado === "pronto" && minhas().length > 0); };
  const podeTratar = (tipo) => { const c = L.config || {}; const l = { semanal: c.recebe_semanal, trocos: c.recebe_trocos, manutencao: c.recebe_manutencao }[tipo] || [];
    return eGestor(eu()) || (tipo === "semanal" && eLog()) || l.includes(eu()?.id); };
  const lojaAtual = () => { const m = minhas(); if (!m.length) return null; if (!L.loja || !m.some((l) => l.id === L.loja)) L.loja = m[0].id; return L.lojas[L.loja]; };
  const chaveS = (loja, item) => loja + "|" + item;

  async function carregar() {
    if (L.estado === "a-carregar") return;
    L.estado = "a-carregar";
    try {
      const d = await api.loj.carregar();
      L.lojas = Object.fromEntries(d.lojas.map((x) => [x.id, x]));
      L.itens = Object.fromEntries(d.itens.map((x) => [x.id, x]));
      L.stock = Object.fromEntries(d.stock.map((x) => [chaveS(x.loja_id, x.item_id), x]));
      L.pedidos = Object.fromEntries(d.pedidos.map((x) => [x.id, x]));
      L.config = d.config; L.estado = "pronto";
      if (!desligar && api.loj.subscrever) desligar = api.loj.subscrever(aoMudar);
    } catch (e) {
      L.estado = "erro";
      L.erro = /PGRST205|Could not find the table|loj_|does not exist/i.test(String(e?.message)) ? "falta-script" : e.message;
    }
    render(); if (S.aberto?.tipo?.startsWith("loj-")) renderPainel(true);
  }
  function aoMudar(tabela, ev, novo, antigo) {
    if (tabela === "loj_pedidos") { if (ev === "DELETE") delete L.pedidos[antigo.id]; else L.pedidos[novo.id] = novo; }
    if (tabela === "loj_stock" && novo?.loja_id) L.stock[chaveS(novo.loja_id, novo.item_id)] = novo;
    render(); if (S.aberto?.tipo?.startsWith("loj-")) renderPainel();
  }

  const itensAtivos = () => Object.values(L.itens).filter((i) => i.ativo).sort((a, b) => (a.categoria === b.categoria ? 0 : a.categoria === "consumivel" ? -1 : 1) || a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt"));
  const emFalta = (loja) => itensAtivos().filter((i) => { const s = L.stock[chaveS(loja, i.id)]; return s && s.minimo != null && s.quantidade != null && s.quantidade < s.minimo; });
  const abertos = () => Object.values(L.pedidos).filter((p) => ["pedido", "em_curso"].includes(p.estado));
  // pedidos que esta pessoa tem de tratar
  const contagem = () => (L.estado === "pronto" ? abertos().filter((p) => p.estado === "pedido" && podeTratar(p.tipo)).length : 0);

  /* ============================== Vista ============================== */
  function vista(param) {
    if (param && ["stock", "pedidos", "caixa", "marcacoes", "cadeiras", "definicoes"].includes(param)) L.tab = param;
    if (L.estado === "por-carregar") carregar();
    let h = '<div class="cab"><div><div class="eyebrow neutro">Barbearias</div><h1>Lojas</h1><p class="sub-cab">Stock de consumíveis e produtos, pedidos da semana, trocos e manutenção.</p></div></div>';
    if (L.estado === "erro") {
      if (L.erro === "falta-script") return h + (eGestor(eu()) ? '<div class="vazio"><h3>Falta instalar as lojas na base de dados</h3><p>No Supabase, abre o SQL Editor, cola o ficheiro <b>supabase/25-lojas-parcerias.sql</b> do GitHub e carrega em Run. Depois recarrega esta página.</p></div>' : '<div class="vazio"><h3>Ainda não disponível</h3><p>A direção ainda está a preparar esta página.</p></div>');
      return h + '<div class="aviso erro">Não foi possível carregar as lojas: ' + esc(L.erro) + ' <button class="btn sec" data-acao="loj-recarregar">Tentar outra vez</button></div>';
    }
    if (L.estado !== "pronto") return h + '<div class="tabela">' + [1, 2, 3].map((i) => '<div class="esqueleto"><i style="width:' + (30 + i * 14) + '%"></i></div>').join("") + "</div>";
    const tabs = [["stock", "Stock"], ["pedidos", "Pedidos"]];
    if (ctx.vistaCaixa && ctx.podeCaixa?.(minhas())) tabs.push(["caixa", "Leitura de caixa"]);
    if (podeFinanceiro(eu())) tabs.push(["marcacoes", "Marcações"], ["cadeiras", "Aluguer de cadeiras"]);
    if (eGestor(eu())) tabs.push(["definicoes", "Definições"]);
    if (!tabs.some(([k]) => k === L.tab)) L.tab = "stock";
    const nAbertos = abertos().filter((p) => p.estado === "pedido" && podeTratar(p.tipo)).length;
    h += '<div class="tabs" role="tablist">' + tabs.map(([k, r]) => '<button class="tab" role="tab" data-acao="loj-tab" data-tab="' + k + '" aria-selected="' + (L.tab === k) + '">' + r + (k === "pedidos" && nAbertos ? ' <span class="mono">' + nAbertos + "</span>" : "") + "</button>").join("") + "</div>";
    if (L.tab === "definicoes") return h + vistaDefinicoes();
    if (L.tab === "cadeiras") return h + vistaCadeiras();
    if (L.tab === "marcacoes" && ctx.vistaEstat) return h + ctx.vistaEstat();
    const m = minhas();
    if (!m.length) return h + '<div class="vazio"><h3>Ainda não há lojas atribuídas</h3><p>' + (eGestor(eu()) ? "Escolhe os responsáveis em <b>Definições</b>." : "Pede à direção para te pôr como responsável da tua loja.") + "</p></div>";
    const atual = lojaAtual();
    if (m.length > 1) h += '<div class="barra"><div class="seg loj-seg" role="group" aria-label="Loja">' + m.map((l) => { const f = emFalta(l.id).length;
      return '<button data-acao="loj-loja" data-v="' + l.id + '" aria-pressed="' + (atual.id === l.id) + '">' + esc(l.nome) + (f ? ' <span class="pill-at">' + f + "</span>" : "") + "</button>"; }).join("") + "</div></div>";
    if (L.tab === "caixa" && ctx.vistaCaixa) {
      const resp = eGestor(eu()) ? m : m.filter((l) => l.responsavel_id === eu()?.id), loja = resp.find((l) => l.id === atual.id) || resp[0];
      return h + ctx.vistaCaixa(loja);
    }
    return h + (L.tab === "pedidos" ? vistaPedidos(atual) : vistaStock(atual));
  }

  function vistaStock(loja) {
    const it = itensAtivos(), falta = emFalta(loja.id);
    const pode = eLog() || loja.responsavel_id === eu()?.id, pedir = eGestor(eu()) || loja.responsavel_id === eu()?.id;
    let h = '<div class="loj-topo"><div><b>' + esc(loja.nome) + "</b>" + (loja.responsavel_id ? '<small>Responsável: ' + esc(nomeDe(loja.responsavel_id) || "—") + "</small>" : '<small class="at">Sem responsável</small>') + "</div>" +
      '<div class="acts">' + (pedir ? '<button class="btn pri" data-acao="loj-pedir" data-tipo="semanal">' + I.plus + (falta.length ? "Pedir o que falta (" + falta.length + ")" : "Pedido da semana") + "</button>" +
      '<button class="btn sec" data-acao="loj-pedir" data-tipo="trocos">Pedir trocos</button><button class="btn sec" data-acao="loj-pedir" data-tipo="manutencao">Pedir manutenção</button>' : "") + "</div></div>";
    if (falta.length) h += '<div class="aviso erro"><span><b>Abaixo do mínimo:</b> ' + falta.map((i) => esc(i.nome)).join(", ") + ".</span></div>";
    if (!it.length) return h + '<div class="vazio"><h3>Ainda não há artigos</h3><p>A direção acrescenta os artigos em Definições.</p></div>';
    h += '<p class="muted loj-ajuda">Conta o que tens na loja e escreve o número. Quando ficar abaixo do mínimo, aparece aqui e no pedido da semana.</p>';
    h += '<div class="tabela-scroll"><table class="crm-tabela loj-stock"><thead><tr><th>Artigo</th><th class="n">Tenho</th><th class="n">Mínimo</th><th>Estado</th></tr></thead><tbody>';
    let cat = "";
    for (const i of it) {
      if (i.categoria !== cat) { cat = i.categoria; h += '<tr class="loj-cat"><td colspan="4">' + (cat === "consumivel" ? "Consumíveis" : "Produtos") + "</td></tr>"; }
      const s = L.stock[chaveS(loja.id, i.id)] || {}, baixo = s.minimo != null && s.quantidade != null && s.quantidade < s.minimo;
      const inp = (campo, v) => pode ? '<label class="sr" for="ls-' + campo + "-" + i.id + '">' + (campo === "quantidade" ? "Quantidade" : "Mínimo") + " de " + esc(i.nome) + '</label><input class="inp mini n" id="ls-' + campo + "-" + i.id + '" data-loj-stock="' + i.id + '" data-campo="' + campo + '" inputmode="numeric" value="' + (v ?? "") + '" placeholder="—">' : v ?? "—";
      h += '<tr class="' + (baixo ? "baixo" : "") + '"><td>' + esc(i.nome) + "<small>" + esc(i.unidade) + (s.atualizado_em ? " · contado " + haQuanto(s.atualizado_em) : "") + '</small></td><td class="n">' + inp("quantidade", s.quantidade) + '</td><td class="n">' + inp("minimo", s.minimo) + "</td><td>" +
        (s.quantidade == null ? '<span class="muted">Por contar</span>' : baixo ? '<span class="pill-at">Abaixo do mínimo</span>' : s.minimo == null ? '<span class="muted">Sem mínimo</span>' : '<span class="rec r-ativo"><i></i>OK</span>') + "</td></tr>";
    }
    return h + "</tbody></table></div>";
  }

  function linhaPedido(p) {
    const loja = L.lojas[p.loja_id]?.nome || p.loja_id;
    const resumo = p.tipo === "semanal" ? (p.itens || []).map((x) => (x.qtd || 1) + "× " + x.nome).join(", ")
      : p.tipo === "trocos" ? MOEDAS.filter(([k]) => +p.trocos?.[k] > 0).map(([k, r]) => p.trocos[k] + " moedas de " + r).join(", ") + " · " + eur2(MOEDAS.reduce((s, [k, , v]) => s + (+p.trocos?.[k] || 0) * v, 0))
      : p.descricao;
    return '<button class="loj-ped" data-acao="loj-abrir" data-id="' + p.id + '"><span class="mono">' + refP(p) + '</span><span class="t"><b>' + esc(TIPOS[p.tipo]) + " · " + esc(loja) + "</b>" + (p.urgente ? ' <span class="pill-at">Urgente</span>' : "") +
      "<small>" + esc(resumo || "—") + "</small><small>" + esc(nomeDe(p.criado_por) || "—") + " · " + haQuanto(p.criado_em) + (p.resposta ? " · " + esc(p.resposta) : "") + '</small></span><span class="etapa ' + ESTADOS[p.estado][1] + '">' + ESTADOS[p.estado][0] + "</span></button>";
  }
  function vistaPedidos(loja) {
    const pode = eGestor(eu()) || loja.responsavel_id === eu()?.id;
    const tratar = abertos().filter((p) => podeTratar(p.tipo)).sort((a, b) => (b.urgente - a.urgente) || a.criado_em.localeCompare(b.criado_em));
    let h = "";
    if (tratar.length) h += '<section class="loj-sec"><h3>Para tratar <span class="mono">' + tratar.length + "</span></h3>" + tratar.map(linhaPedido).join("") + "</section>";
    const daLoja = Object.values(L.pedidos).filter((p) => p.loja_id === loja.id && !tratar.includes(p)).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
    const ab = daLoja.filter((p) => ["pedido", "em_curso"].includes(p.estado)), fe = daLoja.filter((p) => !["pedido", "em_curso"].includes(p.estado));
    h += '<section class="loj-sec"><div class="loj-sec-cab"><h3>' + esc(loja.nome) + "</h3>" + (pode ? '<span class="acts"><button class="btn pri" data-acao="loj-pedir" data-tipo="semanal">' + I.plus + 'Pedido da semana</button><button class="btn sec" data-acao="loj-pedir" data-tipo="trocos">Trocos</button><button class="btn sec" data-acao="loj-pedir" data-tipo="manutencao">Manutenção</button></span>' : "") + "</div>" +
      (ab.length ? ab.map(linhaPedido).join("") : '<p class="muted">Sem pedidos em aberto.</p>') +
      (fe.length ? '<button class="mostrar-feitas" data-acao="loj-feitos">' + I.seta + (L.verFeitos ? "Esconder" : "Ver") + " os " + fe.length + " anteriores</button>" + (L.verFeitos ? fe.slice(0, 40).map(linhaPedido).join("") : "") : "") + "</section>";
    return h;
  }

  /* ---------- aluguer de cadeiras ---------- */
  function mesAnterior() { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return ymd(d).slice(0, 7); }
  async function carregarCadeiras(mes) {
    L.cad = { ...(L.cad || {}), mes, estado: "a-carregar" }; render();
    try { const d = await api.loj.cadeiras(mes); L.cad = { mes, estado: "pronto", ...d }; }
    catch (e) { L.cad = { mes, estado: "erro", erro: e.message }; }
    render();
  }
  function brutoFolha(c) {
    const n = normalizar(c.nome).trim(); if (!n || !L.cad?.folha) return null;
    const r = L.cad.folha.filter((x) => normalizar(x.barbeiro).trim() === n);
    return r.length ? r.reduce((s, x) => s + +x.valor_total, 0) : null;
  }
  function vistaCadeiras() {
    if (!podeFinanceiro(eu())) return "";
    if (!L.cad || L.cad.estado === "por-carregar") { carregarCadeiras(L.cad?.mes || mesAnterior()); return '<div class="esqueleto"><i style="width:50%"></i></div>'; }
    const c = L.cad, [y, mm] = c.mes.split("-").map(Number);
    let h = '<div class="barra"><label for="loj-cad-mes" class="muted">Mês</label><input id="loj-cad-mes" class="inp" type="month" value="' + c.mes + '"><span class="muted">' + esc(MES_L[mm - 1] + " de " + y) + "</span></div>";
    if (c.estado === "a-carregar") return h + '<div class="esqueleto"><i style="width:50%"></i></div>';
    if (c.estado === "erro") return h + '<div class="aviso erro">Não foi possível carregar: ' + esc(c.erro) + "</div>";
    h += '<div class="aviso"><span>Valor de cada cadeira = <b>valor fixo + percentagem da faturação bruta</b> do barbeiro no mês. A fatura é emitida no Multixop para o NIF do barbeiro; aqui escreves o número da fatura para ficar registado.</span></div>';
    const lista = (c.cadeiras || []).filter((x) => x.ativo).sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
    let total = 0;
    if (lista.length) {
      h += '<div class="tabela-scroll"><table class="crm-tabela loj-cad"><thead><tr><th>Barbeiro</th><th>Loja</th><th class="n">Fixo</th><th class="n">%</th><th class="n">Faturação bruta</th><th class="n">A faturar</th><th>N.º da fatura</th><th></th></tr></thead><tbody>' +
        lista.map((x) => {
          const m = (c.meses || []).find((k) => k.cadeira_id === x.id) || {}, folha = brutoFolha(x), bruto = m.bruto ?? null;
          const val = bruto == null ? null : +x.fixo + (+x.percentagem / 100) * bruto; if (val != null) total += val;
          return "<tr><td><b>" + esc(x.nome) + "</b><small>NIF " + esc(x.nif || "em falta") + "</small></td><td>" + esc(L.lojas[x.loja_id]?.nome || "—") + '</td><td class="n">' + eur2(x.fixo) + '</td><td class="n">' + String(+x.percentagem).replace(".", ",") + "%</td>" +
            '<td class="n"><label class="sr" for="cad-b-' + x.id + '">Faturação bruta de ' + esc(x.nome) + '</label><input class="crm-custo" id="cad-b-' + x.id + '" data-loj-cad="' + x.id + '" data-campo="bruto" inputmode="decimal" value="' + (bruto == null ? "" : String(bruto).replace(".", ",")) + '" placeholder="—">' +
            (folha != null && bruto == null ? '<button class="c-link" data-acao="loj-cad-folha" data-id="' + x.id + '" data-v="' + folha + '">Folha: ' + eur2(folha) + "</button>" : "") + "</td>" +
            '<td class="n"><b>' + (val == null ? "—" : eur2(val)) + "</b></td>" +
            '<td><label class="sr" for="cad-f-' + x.id + '">N.º da fatura</label><input class="inp mini" id="cad-f-' + x.id + '" data-loj-cad="' + x.id + '" data-campo="fatura_numero" value="' + esc(m.fatura_numero || "") + '" placeholder="Ex.: FT 26/100"></td>' +
            '<td><button class="ib" data-acao="loj-cad-apagar" data-id="' + x.id + '" aria-label="Remover ' + esc(x.nome) + '">' + I.x + "</button></td></tr>";
        }).join("") + '</tbody><tfoot><tr><td colspan="5">Total a faturar</td><td class="n"><b>' + eur2(total) + '</b></td><td colspan="2"><button class="btn sec" data-acao="loj-cad-copiar">Copiar a lista</button></td></tr></tfoot></table></div>';
    } else h += '<p class="muted">Ainda não há barbeiros com aluguer de cadeira.</p>';
    h += '<form class="loj-cad-novo" id="form-loj-cad"><h3>Acrescentar barbeiro com aluguer</h3><div class="campos-2">' +
      '<div class="campo"><label for="cad-nome">Nome (igual ao da folha da faturação)</label><input id="cad-nome" autocomplete="off" required></div><div class="campo"><label for="cad-nif">NIF</label><input id="cad-nif" inputmode="numeric" autocomplete="off"></div>' +
      '<div class="campo"><label for="cad-loja">Loja</label><select id="cad-loja"><option value="">—</option>' + Object.values(L.lojas).sort((a, b) => a.ordem - b.ordem).map((l) => '<option value="' + l.id + '">' + esc(l.nome) + "</option>").join("") + "</select></div>" +
      '<div class="campos-2"><div class="campo"><label for="cad-fixo">Fixo (€)</label><input id="cad-fixo" inputmode="decimal" value="300"></div><div class="campo"><label for="cad-pct">% da faturação bruta</label><input id="cad-pct" inputmode="decimal" value="5"></div></div>' +
      '</div><div class="acts"><button class="btn pri" type="submit">Acrescentar</button></div></form>';
    return h;
  }

  /* ---------- definições ---------- */
  function vistaDefinicoes() {
    const pessoas = ativos(), cfg = L.config || {};
    let h = '<div class="pf-def"><section class="p-sec"><h3>Lojas e responsáveis</h3><div class="loj-def-lojas">' +
      Object.values(L.lojas).sort((a, b) => a.ordem - b.ordem).map((l) => '<div class="loj-def-linha"><label for="ld-nome-' + l.id + '" class="sr">Nome da loja</label><input class="inp" id="ld-nome-' + l.id + '" data-loj-loja="' + l.id + '" data-campo="nome" value="' + esc(l.nome) + '">' +
        '<label for="ld-resp-' + l.id + '" class="sr">Responsável de ' + esc(l.nome) + '</label><select class="sel" id="ld-resp-' + l.id + '" data-loj-loja="' + l.id + '" data-campo="responsavel_id"><option value="">Sem responsável</option>' +
        pessoas.map((p) => '<option value="' + p.id + '"' + (l.responsavel_id === p.id ? " selected" : "") + ">" + esc(p.nome) + "</option>").join("") + "</select>" +
        '<label class="chk-txt"><input type="checkbox" data-loj-loja="' + l.id + '" data-campo="ativo"' + (l.ativo ? " checked" : "") + "> Ativa</label></div>").join("") +
      '</div><p class="muted">O responsável vê e pede só para a sua loja. Se ainda não tem conta, cria-a primeiro em <b>Equipa</b>.</p></section>';
    const quem = (campo, rot, ajuda) => '<div class="campo"><span class="rot">' + rot + '</span><div class="loj-quem">' + pessoas.map((p) => '<label class="chk-txt"><input type="checkbox" data-loj-cfg="' + campo + '" value="' + p.id + '"' + ((cfg[campo] || []).includes(p.id) ? " checked" : "") + "> " + esc(p.nome) + "</label>").join("") + '</div><span class="ajuda">' + ajuda + "</span></div>";
    h += '<section class="p-sec"><h3>Quem recebe os pedidos</h3>' + quem("recebe_semanal", "Pedidos da semana", "Sem ninguém escolhido: a Logística e a direção.") +
      quem("recebe_trocos", "Trocos", "Sem ninguém escolhido: a direção.") + quem("recebe_manutencao", "Manutenção", "Sem ninguém escolhido: a direção.") + "</section>";
    h += '<section class="p-sec"><h3>Artigos das lojas</h3><div class="loj-def-itens">' + Object.values(L.itens).sort((a, b) => (a.categoria === b.categoria ? 0 : a.categoria === "consumivel" ? -1 : 1) || a.ordem - b.ordem).map((i) =>
      '<div class="loj-def-linha"><label class="sr" for="li-n-' + i.id + '">Nome</label><input class="inp" id="li-n-' + i.id + '" data-loj-item="' + i.id + '" data-campo="nome" value="' + esc(i.nome) + '">' +
      '<label class="sr" for="li-u-' + i.id + '">Unidade</label><input class="inp mini" id="li-u-' + i.id + '" data-loj-item="' + i.id + '" data-campo="unidade" value="' + esc(i.unidade) + '">' +
      '<select class="sel mini" data-loj-item="' + i.id + '" data-campo="categoria" aria-label="Tipo">' + Object.entries(CAT).map(([k, r]) => '<option value="' + k + '"' + (i.categoria === k ? " selected" : "") + ">" + r + "</option>").join("") + "</select>" +
      '<label class="chk-txt"><input type="checkbox" data-loj-item="' + i.id + '" data-campo="ativo"' + (i.ativo ? " checked" : "") + "> Ativo</label></div>").join("") + "</div>" +
      '<form class="loj-def-linha" id="form-loj-item"><label class="sr" for="li-novo">Novo artigo</label><input class="inp" id="li-novo" placeholder="Novo artigo (ex.: Toalhas de papel)" autocomplete="off"><select class="sel mini" id="li-novo-cat" aria-label="Tipo"><option value="consumivel">Consumível</option><option value="produto">Produto</option></select><button class="btn sec" type="submit">' + I.plus + "Acrescentar</button></form></section></div>";
    return h;
  }

  /* ============================== Painéis ============================== */
  function painel(a) {
    const mold = (c, pe) => '<div class="veu" data-acao="fechar"></div><aside class="painel" role="dialog" aria-label="Pedido" data-marca="barbearia"><div class="p-scroll">' + c + "</div>" + (pe ? '<div class="p-pe">' + pe + "</div>" : "") + "</aside>";
    const topo = (m) => '<div class="p-topo"><span class="migalha"><i></i>' + m + '</span><button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + "</button></div>";
    if (a.tipo === "loj-novo") {
      const loja = L.lojas[a.loja]; if (!loja) return mold(topo("Lojas"));
      let h = topo("Lojas / " + esc(loja.nome)) + '<h2 style="margin:0">' + esc(TIPOS[a.pedido]) + '</h2><form class="form" id="form-loj-pedido" data-loja="' + loja.id + '" data-tipo="' + a.pedido + '" novalidate>';
      if (a.pedido === "semanal") {
        h += '<p class="muted" style="margin:0">Escreve a quantidade de cada artigo que precisas. Os que estão abaixo do mínimo já vêm preenchidos.</p><div class="loj-pedir">' + itensAtivos().map((i) => {
          const s = L.stock[chaveS(loja.id, i.id)] || {}, suger = s.minimo != null && s.quantidade != null && s.quantidade < s.minimo ? Math.max(1, s.minimo * 2 - s.quantidade) : "";
          return '<label class="loj-pedir-l" for="lp-' + i.id + '"><span>' + esc(i.nome) + "<small>" + esc(i.unidade) + (s.quantidade != null ? " · tens " + s.quantidade : "") + '</small></span><input class="inp mini n" id="lp-' + i.id + '" data-loj-pedir="' + i.id + '" inputmode="numeric" value="' + suger + '" placeholder="0"></label>'; }).join("") +
          '</div><div class="campo"><label for="lp-outro">Outra coisa que não está na lista</label><input id="lp-outro" autocomplete="off" placeholder="Ex.: 2 pentes grandes"></div>';
      } else if (a.pedido === "trocos") {
        h += '<div class="campos-2">' + MOEDAS.map(([k, r]) => '<div class="campo"><label for="lt-' + k.replace(".", "") + '">Moedas de ' + r + '</label><input id="lt-' + k.replace(".", "") + '" data-loj-moeda="' + k + '" inputmode="numeric" placeholder="0"></div>').join("") + '</div><p class="muted" id="lt-total">Total: 0,00 €</p>';
      } else {
        h += '<div class="campo"><label for="lm-desc">O que precisa de manutenção?</label><textarea id="lm-desc" rows="4" placeholder="Ex.: a torneira do lavatório 2 está a pingar"></textarea></div>';
      }
      h += (a.pedido !== "semanal" ? "" : "") + '<label class="chk-txt"><input type="checkbox" id="lp-urgente"> Urgente</label><div class="campo"><label for="lp-nota">Nota (opcional)</label><input id="lp-nota" autocomplete="off"></div>' +
        '<div class="acts"><button class="btn pri" type="submit">Enviar pedido</button><button class="btn sec" type="button" data-acao="fechar">Cancelar</button></div></form>';
      return mold(h);
    }
    const p = L.pedidos[a.id];
    if (!p) return mold(topo("Lojas") + '<div class="vazio"><h3>Pedido indisponível</h3><p>Foi eliminado ou não tens acesso.</p></div>');
    const trata = podeTratar(p.tipo), meu = p.criado_por === eu()?.id || L.lojas[p.loja_id]?.responsavel_id === eu()?.id;
    let h = topo("Lojas / " + refP(p)) + '<h2 style="margin:0">' + esc(TIPOS[p.tipo]) + " · " + esc(L.lojas[p.loja_id]?.nome || "") + "</h2>" +
      '<div class="chips"><span class="etapa ' + ESTADOS[p.estado][1] + '">' + ESTADOS[p.estado][0] + "</span>" + (p.urgente ? '<span class="pill-at">Urgente</span>' : "") + "<span>Pedido por " + esc(nomeDe(p.criado_por) || "—") + " " + haQuanto(p.criado_em) + "</span></div>";
    if (p.tipo === "semanal") h += '<section class="p-sec"><h3>Artigos</h3><div class="hist">' + (p.itens || []).map((x) => "<div><span>" + esc(x.nome) + '</span><span class="mono">' + esc(x.qtd) + "</span></div>").join("") + "</div>" +
      (p.estado === "feito" ? '<p class="muted">Os artigos da lista entraram no stock da loja.</p>' : trata ? '<p class="muted">Quando marcares como feito, os artigos entram no stock da loja.</p>' : "") + "</section>";
    if (p.tipo === "trocos") h += '<section class="p-sec"><h3>Moedas</h3><div class="hist">' + MOEDAS.map(([k, r, v]) => "<div><span>" + r + '</span><span class="mono">' + (+p.trocos?.[k] || 0) + " moedas · " + eur2((+p.trocos?.[k] || 0) * v) + "</span></div>").join("") +
      '<div><b>Total</b><b class="mono">' + eur2(MOEDAS.reduce((s, [k, , v]) => s + (+p.trocos?.[k] || 0) * v, 0)) + "</b></div></div></section>";
    if (p.descricao) h += '<section class="p-sec"><h3>' + (p.tipo === "manutencao" ? "O que se passa" : "Nota") + "</h3><p style=\"margin:0;white-space:pre-wrap\">" + esc(p.descricao) + "</p></section>";
    if (trata && !["feito", "cancelado"].includes(p.estado)) {
      h += '<div class="campo"><label for="lp-resp">Resposta para a loja (opcional)</label><input id="lp-resp" value="' + esc(p.resposta || "") + '" placeholder="Ex.: vai na carrinha de quinta-feira" autocomplete="off"></div>' +
        '<div class="acts">' + (p.estado === "pedido" ? '<button class="btn sec" data-acao="loj-estado" data-v="em_curso">A tratar</button>' : "") + '<button class="btn pri" data-acao="loj-estado" data-v="feito">' + I.check + "Feito</button></div>";
    } else if (p.resposta) h += '<div class="aviso"><span><b>Resposta:</b> ' + esc(p.resposta) + "</span></div>";
    if (p.estado === "pedido" && (meu || trata)) h += '<div class="acts"><button class="btn perigo-sec" data-acao="loj-estado" data-v="cancelado">Cancelar pedido</button></div>';
    const pe = "<span>" + (p.feito_em ? "Feito por " + esc(nomeDe(p.tratado_por) || "—") + " " + haQuanto(p.feito_em) : p.tratado_por ? "A ser tratado por " + esc(nomeDe(p.tratado_por) || "—") : "") + "</span>";
    return mold(h, pe);
  }

  /* ============================== Ações ============================== */
  async function mudarPedido(id, campos, msg) {
    const antes = L.pedidos[id]; if (!antes) return;
    L.pedidos[id] = { ...antes, ...campos }; render(); renderPainel(true);
    try { const r = await api.loj.pedido(id, campos); L.pedidos[id] = r; render(); renderPainel(true); if (msg) toast(msg); }
    catch (e) { L.pedidos[id] = antes; render(); renderPainel(true); falha(e); }
  }
  function textoCadeiras() {
    const c = L.cad, [y, m] = c.mes.split("-").map(Number);
    const l = (c.cadeiras || []).filter((x) => x.ativo).map((x) => { const k = (c.meses || []).find((z) => z.cadeira_id === x.id) || {}; if (k.bruto == null) return null;
      return x.nome + " (NIF " + (x.nif || "—") + "): " + eur2(+x.fixo + (+x.percentagem / 100) * k.bruto) + " = " + eur2(x.fixo) + " + " + String(+x.percentagem).replace(".", ",") + "% de " + eur2(k.bruto); }).filter(Boolean);
    return "Aluguer de cadeiras · " + MES_L[m - 1] + " de " + y + "\n" + l.join("\n");
  }

  function clique(acao, el) {
    if (!acao.startsWith("loj-")) return false;
    switch (acao) {
      case "loj-recarregar": L.estado = "por-carregar"; carregar(); return true;
      case "loj-tab": location.hash = "lojas-" + el.dataset.tab; return true;
      case "loj-loja": L.loja = el.dataset.v; render(); return true;
      case "loj-feitos": L.verFeitos = !L.verFeitos; render(); return true;
      case "loj-pedir": { const loja = lojaAtual(); if (loja) abrir({ tipo: "loj-novo", loja: loja.id, pedido: el.dataset.tipo }); return true; }
      case "loj-abrir": abrir({ tipo: "loj-pedido", id: el.dataset.id }); return true;
      case "loj-estado": {
        const id = S.aberto?.id, v = el.dataset.v, resp = document.getElementById("lp-resp")?.value.trim();
        mudarPedido(id, { estado: v, ...(resp != null ? { resposta: resp } : {}) }, v === "feito" ? "Pedido feito" : v === "cancelado" ? "Pedido cancelado" : "A tratar");
        return true;
      }
      case "loj-cad-folha": guardarCad(el.dataset.id, "bruto", +el.dataset.v); return true;
      case "loj-cad-apagar": {
        const id = el.dataset.id; const antes = L.cad.cadeiras;
        L.cad.cadeiras = antes.map((x) => (x.id === id ? { ...x, ativo: false } : x)); render();
        api.loj.cadeira(id, { ativo: false }).then(() => toast("Removido da lista")).catch((e) => { L.cad.cadeiras = antes; render(); falha(e); });
        return true;
      }
      case "loj-cad-copiar": { const t = textoCadeiras(); (navigator.clipboard?.writeText(t) || Promise.reject()).then(() => toast("Lista copiada")).catch(() => toast("Não foi possível copiar.", true)); return true; }
    }
    return false;
  }
  function guardarCad(id, campo, v) {
    const c = L.cad; const antes = (c.meses || []).find((k) => k.cadeira_id === id);
    const novo = { cadeira_id: id, mes: c.mes, bruto: antes?.bruto ?? null, fatura_numero: antes?.fatura_numero || "", [campo]: v };
    c.meses = (c.meses || []).filter((k) => k.cadeira_id !== id).concat([novo]); render();
    api.loj.cadeiraMes(novo).then(() => toast("Guardado")).catch((e) => { c.meses = (c.meses || []).filter((k) => k.cadeira_id !== id).concat(antes ? [antes] : []); render(); falha(e); });
  }

  function mudar(e) {
    const t = e.target;
    if (t.dataset?.lojStock) {
      const loja = lojaAtual(); if (!loja) return true;
      const v = lerNum(t.value); if (Number.isNaN(v) || (v != null && v < 0)) { toast("Escreve um número.", true); return true; }
      const k = chaveS(loja.id, t.dataset.lojStock), antes = L.stock[k];
      const campos = { [t.dataset.campo]: v == null ? null : Math.round(v) };
      L.stock[k] = { loja_id: loja.id, item_id: t.dataset.lojStock, ...(antes || {}), ...campos, atualizado_em: new Date().toISOString() }; render();
      api.loj.stock(loja.id, t.dataset.lojStock, campos).then((r) => { if (r) L.stock[k] = r; render(); }).catch((err) => { if (antes) L.stock[k] = antes; else delete L.stock[k]; render(); falha(err); });
      return true;
    }
    if (t.id === "loj-cad-mes" && t.value) { carregarCadeiras(t.value); return true; }
    if (t.dataset?.lojCad) {
      const campo = t.dataset.campo;
      if (campo === "bruto") { const v = lerNum(t.value); if (Number.isNaN(v) || (v != null && v < 0)) { toast("Escreve o valor em euros.", true); return true; } guardarCad(t.dataset.lojCad, "bruto", v); }
      else guardarCad(t.dataset.lojCad, campo, t.value.trim());
      return true;
    }
    if (t.dataset?.lojLoja) {
      const id = t.dataset.lojLoja, campo = t.dataset.campo, v = campo === "ativo" ? t.checked : campo === "responsavel_id" ? t.value || null : t.value.trim();
      if (campo === "nome" && !v) return true;
      const antes = L.lojas[id]; L.lojas[id] = { ...antes, [campo]: v }; render();
      api.loj.loja(id, { [campo]: v }).then(() => toast("Guardado")).catch((err) => { L.lojas[id] = antes; render(); falha(err); });
      return true;
    }
    if (t.dataset?.lojItem) {
      const id = t.dataset.lojItem, campo = t.dataset.campo, v = campo === "ativo" ? t.checked : t.value.trim();
      if (campo === "nome" && !v) return true;
      const antes = L.itens[id]; L.itens[id] = { ...antes, [campo]: v }; render();
      api.loj.item(id, { [campo]: v }).then(() => toast("Guardado")).catch((err) => { L.itens[id] = antes; render(); falha(err); });
      return true;
    }
    if (t.dataset?.lojCfg) {
      const campo = t.dataset.lojCfg, l = new Set(L.config?.[campo] || []);
      if (t.checked) l.add(t.value); else l.delete(t.value);
      const antes = L.config; L.config = { ...antes, [campo]: [...l] };
      api.loj.configurar({ [campo]: [...l] }).then(() => toast("Guardado")).catch((err) => { L.config = antes; render(); falha(err); });
      return true;
    }
    return false;
  }
  function escrever(e) {
    const t = e.target;
    if (t.dataset?.lojMoeda) {
      const tot = [...document.querySelectorAll("[data-loj-moeda]")].reduce((s, x) => s + (Math.max(0, Math.round(lerNum(x.value) || 0)) * +x.dataset.lojMoeda), 0);
      const el = document.getElementById("lt-total"); if (el) el.textContent = "Total: " + eur2(tot);
      return true;
    }
    return false;
  }

  async function submeter(f) {
    if (f.id === "form-loj-pedido") {
      const loja = f.dataset.loja, tipo = f.dataset.tipo, nota = document.getElementById("lp-nota")?.value.trim() || "", urgente = !!document.getElementById("lp-urgente")?.checked;
      const o = { loja_id: loja, tipo, urgente, descricao: nota };
      if (tipo === "semanal") {
        o.itens = [...f.querySelectorAll("[data-loj-pedir]")].map((x) => ({ item_id: x.dataset.lojPedir, nome: L.itens[x.dataset.lojPedir]?.nome, qtd: Math.round(lerNum(x.value) || 0) })).filter((x) => x.qtd > 0);
        const outro = document.getElementById("lp-outro")?.value.trim(); if (outro) o.itens.push({ nome: outro, qtd: 1 });
        if (!o.itens.length) { toast("Escreve a quantidade de pelo menos um artigo.", true); return true; }
      } else if (tipo === "trocos") {
        o.trocos = Object.fromEntries([...f.querySelectorAll("[data-loj-moeda]")].map((x) => [x.dataset.lojMoeda, Math.max(0, Math.round(lerNum(x.value) || 0))]));
        if (!Object.values(o.trocos).some((n) => n > 0)) { toast("Escreve quantas moedas precisas.", true); return true; }
      } else {
        const d = document.getElementById("lm-desc")?.value.trim(); if (!d) { toast("Descreve o que precisa de manutenção.", true); return true; }
        o.descricao = d + (nota ? "\n" + nota : "");
      }
      try { const r = await api.loj.criarPedido(o); L.pedidos[r.id] = r; S.aberto = null; renderPainel(true); L.tab = "pedidos"; location.hash = "lojas-pedidos"; render(); toast("Pedido enviado"); }
      catch (e) { falha(e); }
      return true;
    }
    if (f.id === "form-loj-item") {
      const nome = document.getElementById("li-novo")?.value.trim(); if (!nome) return true;
      try { const r = await api.loj.criarItem({ nome, categoria: document.getElementById("li-novo-cat").value, ordem: Object.keys(L.itens).length + 1 }); L.itens[r.id] = r; render(); toast("Artigo acrescentado"); }
      catch (e) { falha(e); }
      return true;
    }
    if (f.id === "form-loj-cad") {
      const nome = document.getElementById("cad-nome").value.trim(); if (!nome) { toast("Indica o nome.", true); return true; }
      const fixo = lerNum(document.getElementById("cad-fixo").value), pct = lerNum(document.getElementById("cad-pct").value);
      if ([fixo, pct].some((v) => v == null || Number.isNaN(v) || v < 0)) { toast("Confirma o valor fixo e a percentagem.", true); return true; }
      try { const r = await api.loj.criarCadeira({ nome, nif: document.getElementById("cad-nif").value.trim(), loja_id: document.getElementById("cad-loja").value || null, fixo, percentagem: pct });
        L.cad.cadeiras = (L.cad.cadeiras || []).concat([r]); render(); toast("Acrescentado"); }
      catch (e) { falha(e); }
      return true;
    }
    return false;
  }

  function reiniciar() { if (desligar) { desligar(); desligar = null; } Object.assign(L, { estado: "por-carregar", lojas: {}, itens: {}, stock: {}, pedidos: {}, config: null, tab: "stock", loja: null, cad: null }); }
  // responsável de loja que não é da direção nem da Logística (tem a loja na barra de baixo do telemóvel)
  const eResponsavel = () => !eLog() && L.estado === "pronto" && minhas().length > 0;
  return { vista, painel, clique, mudar, escrever, submeter, reiniciar, carregar, visivel, contagem, eResponsavel };
}
