// Central 26 — Loja online da TwentySix (WooCommerce): vendas do site no Comercial e ligação ao site.
// As encomendas pagas passam sozinhas para a Logística (função «woo»); aqui vê-se o resumo e, para a direção,
// a ligação ao site e a correspondência entre os produtos do site e os da Central.
import { eGestor, haQuanto, normalizar, ymd } from "./dados.js";

const PAGAS = ["processing", "completed"];
const EST = { processing: "Em processamento", completed: "Concluída", "on-hold": "Em espera", pending: "Pagamento pendente", cancelled: "Cancelada", refunded: "Reembolsada", failed: "Falhada" };
const PERIODOS = [["12m", "Últimos 12 meses"], ["ano", "Este ano"], ["tudo", "Tudo"]];

export function criarLojaOnline(ctx) {
  const { S, api, esc, I, toast, falha, render } = ctx;
  const W = (S.woo = { estado: "por-carregar", config: null, produtos: {}, encomendas: [], periodo: "12m", ocupado: "", historico: null, qp: "" });
  let desligar = null;

  async function carregar() {
    if (W.estado === "a-carregar") return;
    W.estado = "a-carregar";
    try {
      const d = await api.woo.carregar();
      W.config = d.config; W.produtos = Object.fromEntries(d.produtos.map((p) => [p.woo_id, p])); W.encomendas = d.encomendas;
      W.estado = "pronto";
      if (!desligar) desligar = api.woo.subscrever(aoMudar);
    } catch (e) { W.estado = /woo_|PGRST205|Could not find|does not exist/i.test(String(e?.message)) ? "falta-script" : "erro"; W.erro = e.message; }
    render();
  }
  function aoMudar(t, ev, novo) {
    if (t === "woo_config" && novo) W.config = novo;
    if (t === "woo_encomendas" && novo) { const i = W.encomendas.findIndex((x) => x.woo_id === novo.woo_id); if (i >= 0) W.encomendas[i] = novo; else W.encomendas.unshift(novo); }
    if (S.rota === "comercial") render();
  }

  const eur = (v) => (Number(v) || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const eur0 = (v) => (Number(v) || 0).toLocaleString("pt-PT", { maximumFractionDigits: 0 }) + " €";
  const num = (v) => (Number(v) || 0).toLocaleString("pt-PT");

  function noPeriodo() {
    const hoje = new Date(), lim = W.periodo === "ano" ? hoje.getFullYear() + "-01-01" : W.periodo === "12m" ? ymd(new Date(hoje.getFullYear() - 1, hoje.getMonth() + 1, 1)) : "";
    return W.encomendas.filter((e) => !lim || (e.criada_em || "").slice(0, 10) >= lim);
  }

  /* ---------- vista (separador «Loja online» do Comercial) ---------- */
  function vista(aux) {
    if (W.estado === "por-carregar") carregar();
    if (W.estado === "falta-script") return '<div class="vazio"><h3>Falta instalar a loja online na base de dados</h3><p>No Supabase, abre o SQL Editor, cola o ficheiro <b>supabase/33-loja-online.sql</b> do GitHub e carrega em Run.</p></div>';
    if (W.estado === "erro") return '<div class="aviso erro">Não foi possível abrir a loja online: ' + esc(W.erro || "") + "</div>";
    if (W.estado !== "pronto") return '<div class="tabela"><div class="esqueleto"><i style="width:50%"></i></div></div>';
    const g = eGestor(S.eu), cfg = W.config || {};
    let h = "";
    if (g) h += blocoLigacao(cfg);
    else if (!cfg.ativo) h += '<div class="aviso"><span>A ligação ao site ainda não está ativa. A direção liga-a aqui, neste separador.</span></div>';

    const l = noPeriodo(), pagas = l.filter((e) => PAGAS.includes(e.estado)), perdidas = l.filter((e) => ["cancelled", "refunded", "failed"].includes(e.estado));
    const total = pagas.reduce((s, e) => s + +e.total, 0), portes = pagas.reduce((s, e) => s + +e.portes, 0);
    h += '<div class="barra"><div class="seg" role="group" aria-label="Período">' + PERIODOS.map(([k, r]) => '<button data-acao="woo-periodo" data-p="' + k + '" aria-pressed="' + (W.periodo === k) + '">' + r + "</button>").join("") + "</div>" +
      '<span class="muted">' + (cfg.ultimo_ok ? "Atualizado " + haQuanto(cfg.ultimo_ok) : "Ainda sem dados do site") + "</span></div>";
    if (!W.encomendas.length) return h + '<div class="vazio"><h3>Ainda não há vendas do site</h3><p>' + (g ? "Liga o site acima e importa o histórico para veres as vendas dos meses anteriores." : "Quando a direção ligar o site, as vendas aparecem aqui.") + "</p></div>";
    h += '<div class="dados">' + aux.dado("Encomendas pagas", num(pagas.length)) + aux.dado("Vendas (com IVA)", eur0(total), "", "inclui " + eur0(portes) + " de portes") +
      aux.dado("Valor médio", pagas.length ? eur(total / pagas.length) : "—", "", "por encomenda paga") +
      aux.dado("Canceladas ou reembolsadas", num(perdidas.length), perdidas.length ? "at" : "", perdidas.length ? eur0(perdidas.reduce((s, e) => s + +e.total, 0)) : "nenhuma") + "</div>";
    // por mês
    const porMes = {}; for (const e of pagas) { const m = (e.criada_em || "").slice(0, 7); if (m) porMes[m] = (porMes[m] || 0) + +e.total; }
    h += '<section class="cartao-sec"><h3>Vendas do site por mês</h3>' + aux.barrasMes(Object.entries(porMes).sort()) + '<p class="nota-tab">Valores com IVA e portes, tal como o cliente pagou. As faturas destas encomendas entram também no SAF-T do Multixop.</p></section>';
    // produtos e localidades
    const porProd = new Map(), porLoc = new Map(), porPag = new Map();
    for (const e of pagas) {
      for (const i of e.itens || []) { const k = W.produtos[i.woo_id]?.nome || i.nome; porProd.set(k, (porProd.get(k) || 0) + (+i.total || 0)); }
      const loc = (e.localidade || "").trim(); if (loc) { const k = loc.toLocaleLowerCase("pt").split(" ").map((w, i) => (i && /^(de|do|da|dos|das|e)$/.test(w) ? w : w.charAt(0).toLocaleUpperCase("pt") + w.slice(1))).join(" "); porLoc.set(k, (porLoc.get(k) || 0) + 1); }
      if (e.pagamento) porPag.set(e.pagamento, (porPag.get(e.pagamento) || 0) + 1);
    }
    const top = (m, n = 10) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
    h += '<div class="duas"><section class="cartao-sec"><h3>Produtos que mais vendem</h3>' + (porProd.size ? aux.barrasH(top(porProd), total - portes) : '<p class="muted">Sem dados.</p>') + "</section>" +
      '<section class="cartao-sec"><h3>De onde são os clientes</h3>' + (porLoc.size ? aux.barrasH(top(porLoc), pagas.length, true) : '<p class="muted">Sem dados.</p>') + "</section></div>";
    if (porPag.size) h += '<section class="cartao-sec"><h3>Como pagam</h3>' + aux.barrasH(top(porPag, 6), pagas.length, true) + "</section>";
    // últimas encomendas
    const ult = W.encomendas.slice(0, 12);
    h += '<section class="cartao-sec"><h3>Últimas encomendas do site</h3><div class="tabela-scroll"><table class="crm-tabela woo-ult"><thead><tr><th>N.º</th><th>Data</th><th>Estado</th><th>Localidade</th><th class="n">Total</th><th>Central</th></tr></thead><tbody>' +
      ult.map((e) => "<tr><td class=\"mono\">#" + esc(e.numero) + "</td><td>" + esc((e.criada_em || "").slice(0, 10).split("-").reverse().join("/")) + '</td><td><span class="woo-est w-' + esc(e.estado) + '">' + esc(EST[e.estado] || e.estado) + "</span></td><td>" + esc(e.localidade || "—") +
        '</td><td class="n">' + eur(e.total) + "</td><td>" + (e.encomenda_id ? '<a href="#encomenda-' + esc(e.encomenda_id) + '">Ver encomenda</a>' : '<span class="muted">—</span>') + "</td></tr>").join("") + "</tbody></table></div></section>";
    if (g) h += blocoProdutos();
    return h;
  }

  function blocoLigacao(cfg) {
    const oc = W.ocupado, dis = oc ? " disabled" : "";
    let h = '<section class="cartao-sec woo-lig"><h3>Ligação ao site <span class="mono">twentysix.pt</span></h3>';
    h += '<div class="woo-estado ' + (cfg.ultimo_erro ? "erro" : cfg.ativo ? "ok" : "") + '"><i></i><span><b>' + (cfg.ultimo_erro ? "Com erro" : cfg.ativo ? "Ligada" : "Desligada") + "</b>" +
      (cfg.ultimo_erro ? " · " + esc(cfg.ultimo_erro) : cfg.ativo ? " · as encomendas pagas desde " + esc(new Date(cfg.desde).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })) + " passam para a Logística, de 10 em 10 minutos" : " · nada passa para a Logística") +
      (cfg.ultima_sinc ? '<small>Última leitura do site ' + haQuanto(cfg.ultima_sinc) + "</small>" : "") + "</span></div>";
    h += '<label class="woo-opc"><input type="checkbox" id="woo-ativo"' + (cfg.ativo ? " checked" : "") + dis + "><span><b>Passar as encomendas pagas para a Logística</b><small>Cada encomenda paga entra na Logística com a Nacex como transporte e quem fatura recebe a tarefa de faturar. Só contam as pagas depois de ligares.</small></span></label>" +
      '<label class="woo-opc"><input type="checkbox" id="woo-concluir"' + (cfg.concluir_no_site ? " checked" : "") + dis + "><span><b>Concluir no site e mandar o seguimento ao cliente</b><small>Com o envio criado na Nacex, a encomenda passa a «Concluída» no site e o cliente recebe por email o link para acompanhar a entrega.</small></span></label>";
    h += '<div class="acts"><button class="btn sec" data-acao="woo-testar"' + dis + ">" + (oc === "testar" ? "A testar…" : "Testar ligação") + "</button>" +
      '<button class="btn sec" data-acao="woo-sinc"' + dis + ">" + (oc === "sinc" ? "A ler o site…" : "Sincronizar agora") + "</button>" +
      '<button class="btn sec" data-acao="woo-produtos"' + dis + ">" + (oc === "produtos" ? "A ler os produtos…" : "Atualizar produtos") + "</button></div>";
    const hi = W.historico;
    h += '<div class="woo-hist"><label for="woo-desde">Importar o histórico de vendas desde</label><input type="date" id="woo-desde" value="' + esc(hi?.desde || new Date().getFullYear() - 1 + "-01-01") + '"' + dis + '><button class="btn sec" data-acao="woo-historico"' + dis + ">" +
      (oc === "historico" ? "A importar… " + num(hi?.vistas || 0) : "Importar") + "</button><small>Só para estes números: não cria encomendas na Logística.</small></div>";
    return h + "</section>";
  }

  function blocoProdutos() {
    const prods = Object.values(W.produtos).sort((a, b) => (a.produto_codigo ? 1 : 0) - (b.produto_codigo ? 1 : 0) || a.nome.localeCompare(b.nome, "pt"));
    if (!prods.length) return '<section class="cartao-sec"><h3>Produtos do site</h3><p class="muted">Carrega em <b>Atualizar produtos</b> para ler os produtos do site.</p></section>';
    const cat = Object.values(S.crm?.produtos || {}), sem = prods.filter((p) => !p.produto_codigo).length;
    const q = normalizar(W.qp || ""), ver = q ? prods.filter((p) => normalizar(p.nome).includes(q)) : prods;
    let h = '<section class="cartao-sec"><h3>Produtos do site</h3>' +
      "<p>Diz a que produto da Central corresponde cada produto do site. Serve para o stock sair sozinho quando a encomenda fica pronta. " + num(prods.length) + " produtos" + (sem ? " · <b>" + num(sem) + " sem correspondência</b>" : " · todos com correspondência") + ".</p>" +
      (prods.length > 10 ? '<label class="pesq">' + I.lupa + '<span class="sr">Procurar produto do site</span><input id="woo-qp" type="search" placeholder="Procurar produto do site" value="' + esc(W.qp || "") + '" autocomplete="off"></label>' : "") +
      '<datalist id="woo-lista-prod">' + cat.map((p) => '<option value="' + esc(p.codigo + " · " + p.descricao) + '">').join("") + "</datalist>" +
      '<div class="tabela-scroll"><table class="crm-tabela woo-prod"><thead><tr><th>Produto no site</th><th class="n">Preço</th><th>Produto na Central</th></tr></thead><tbody>';
    for (const p of ver) {
      const c = p.produto_codigo ? S.crm?.produtos?.[p.produto_codigo] : null;
      h += "<tr><td>" + esc(p.nome || "#" + p.woo_id) + '</td><td class="n">' + (p.preco != null ? eur(p.preco) : "—") + "</td><td>" +
        '<label class="sr" for="woo-p-' + p.woo_id + '">Produto da Central para ' + esc(p.nome) + '</label><input class="inp woo-map' + (p.produto_codigo ? "" : " falta") + '" id="woo-p-' + p.woo_id + '" data-woo-prod="' + p.woo_id + '" list="woo-lista-prod" placeholder="Código ou nome" value="' +
        esc(p.produto_codigo ? p.produto_codigo + (c ? " · " + c.descricao : "") : "") + '" autocomplete="off"></td></tr>';
    }
    return h + "</tbody></table></div></section>";
  }

  /* ---------- ações ---------- */
  async function correr(chave, fn) {
    if (W.ocupado) return;
    W.ocupado = chave; render();
    try { await fn(); } catch (e) { falha(e); } finally { W.ocupado = ""; render(); }
  }
  function clique(acao, el) {
    switch (acao) {
      case "woo-periodo": W.periodo = el.dataset.p; render(); return true;
      case "woo-testar": correr("testar", async () => { const r = await api.woo.acao("testar"); toast("Ligação ao site a funcionar: " + num(r.encomendas) + " encomendas e " + num(r.produtos) + " produtos."); }); return true;
      case "woo-sinc": correr("sinc", async () => {
        const r = await api.woo.acao("sincronizar");
        toast("Site lido: " + num(r.vistas) + (r.vistas === 1 ? " encomenda" : " encomendas") + " atualizadas" + (r.criadas ? " · " + num(r.criadas) + " novas na Logística" : "") + (r.concluidas ? " · " + num(r.concluidas) + " concluídas no site" : "") + ".");
        await recarregar();
      }); return true;
      case "woo-produtos": correr("produtos", async () => { const r = await api.woo.acao("produtos"); toast(num(r.produtos) + " produtos lidos do site."); await recarregar(); }); return true;
      case "woo-historico": correr("historico", async () => {
        const desde = document.getElementById("woo-desde")?.value || "";
        W.historico = { desde, vistas: 0 };
        let pagina = 1;
        while (pagina) {
          const r = await api.woo.acao("historico", { desde, pagina });
          W.historico.vistas += r.vistas || 0; pagina = r.seguinte; render();
        }
        toast("Histórico importado: " + num(W.historico.vistas) + " encomendas.");
        await recarregar();
      }); return true;
    }
    return false;
  }
  async function recarregar() { const d = await api.woo.carregar(); W.config = d.config; W.produtos = Object.fromEntries(d.produtos.map((p) => [p.woo_id, p])); W.encomendas = d.encomendas; }

  function mudar(e) {
    const t = e.target;
    if (t.id === "woo-ativo" || t.id === "woo-concluir") {
      const campo = t.id === "woo-ativo" ? "ativo" : "concluir_no_site", antes = W.config?.[campo];
      W.config = { ...W.config, [campo]: t.checked };
      api.woo.configurar({ [campo]: t.checked }).then((r) => { W.config = r; render(); toast(campo === "ativo" ? (r.ativo ? "Ligação ativa: as encomendas pagas a partir de agora passam para a Logística." : "Ligação desligada.") : "Guardado."); })
        .catch((err) => { W.config = { ...W.config, [campo]: antes }; render(); falha(err); });
      return true;
    }
    if (t.dataset?.wooProd) {
      const id = +t.dataset.wooProd, v = t.value.trim(), cod = v ? v.split(" · ")[0].trim() : null;
      if (cod && !S.crm?.produtos?.[cod]) { toast("Escolhe um produto da lista (código · nome).", true); return true; }
      const antes = W.produtos[id];
      W.produtos[id] = { ...antes, produto_codigo: cod };
      api.woo.produto(id, cod).then((r) => { W.produtos[id] = r; render(); toast(cod ? "Correspondência guardada." : "Correspondência retirada."); })
        .catch((err) => { W.produtos[id] = antes; render(); falha(err); });
      return true;
    }
    return false;
  }
  function escrever(e) {
    if (e.target.id === "woo-qp") {
      W.qp = e.target.value; const q = normalizar(W.qp);
      document.querySelectorAll(".woo-prod tbody tr").forEach((tr) => { tr.hidden = q && !normalizar(tr.cells[0].textContent).includes(q); });
      return true;
    }
    return false;
  }
  function reiniciar() { if (desligar) { desligar(); desligar = null; } Object.assign(W, { estado: "por-carregar", config: null, produtos: {}, encomendas: [], ocupado: "", historico: null, qp: "" }); }

  return { vista, clique, mudar, escrever, reiniciar };
}
