// Central 26 — Stocks da TwentySix: quantidades, retiradas, entradas e avisos quando chega ao mínimo.
import { ymd, normalizar, haQuanto, eGestor, MES_L, DIA, paginar, paginador } from "./dados.js";
import { carregarXlsx } from "./xlsx.js";
import { CATALOGO_STK } from "./stocks-catalogo.js";

export const podeStocks = (eu) => !!eu && (eGestor(eu) || ["logistica", "comercial"].includes(eu.departamento_id));
const ORDEM_CAT = ["Ceras", "Styling", "Champôs e tratamento", "Barba", "Barbear e corpo", "Têxteis e acessórios", "Equipamento", "Embalagem e envio", "Outros"];
const TIPOS_MOV = { saida: "retirou", entrada: "deu entrada de", acerto: "acertou a contagem para", reposto: "marcou como reposto, com" };
const n = (s) => normalizar(s).replace(/\s+/g, " ").trim();
const fmt = (x) => Number(x || 0).toLocaleString("pt-PT");

export function criarStocks(ctx) {
  const { S, api, esc, I, toast, falha, render, agendarRender, renderPainel, abrir, fechar, nomeDe, ativos, av, $ } = ctx;
  const T = (S.stk = { estado: "por-carregar", produtos: {}, movs: [], config: null, tab: "produtos", cat: "", q: "", pagMov: 1, importacao: null, aImportar: false, modo: "saida", confirmar: false });
  let desligar = null;

  async function carregar() {
    if (T.estado === "a-carregar") return;
    T.estado = "a-carregar";
    try {
      if (!api.stk) throw new Error("A app foi atualizada a meio. Recarrega a página para terminar a atualização.");
      const d = await api.stk.carregar();
      T.produtos = Object.fromEntries(d.produtos.map((p) => [p.id, p]));
      T.movs = d.movimentos; T.config = d.config || { avisar: [], hora_inicio: 8, hora_fim: 21 };
      T.estado = "pronto";
      if (!desligar && api.stk.subscrever) desligar = api.stk.subscrever(aoMudar);
    } catch (e) { T.estado = /PGRST20|stk_produtos|Could not find|does not exist/i.test(String(e?.message)) ? "falta-script" : "erro"; T.erro = e.message; }
    agendarRender();
    if (S.aberto?.tipo === "stock") renderPainel(true);
  }
  function aoMudar(t, ev, novo, antigo) {
    if (t === "produto") { if (ev === "DELETE") delete T.produtos[antigo.id]; else T.produtos[novo.id] = novo; }
    else if (t === "movimento" && !T.movs.some((m) => m.id === novo.id)) {
      const i = T.movs.findIndex((m) => m.local && m.produto_id === novo.produto_id && m.tipo === novo.tipo && m.quantidade === novo.quantidade);
      if (i >= 0) T.movs.splice(i, 1, novo); else T.movs.unshift(novo);
    }
    agendarRender();
    if (S.aberto?.tipo === "stock") renderPainel();
  }
  const pode = () => podeStocks(S.eu);
  const lista = () => Object.values(T.produtos).filter((p) => p.ativo || eGestor(S.eu));
  const emAlerta = (p) => p.alerta !== "ok";
  const categorias = () => {
    const c = [...new Set(lista().map((p) => p.categoria))];
    return c.sort((a, b) => (ORDEM_CAT.indexOf(a) + 1 || 99) - (ORDEM_CAT.indexOf(b) + 1 || 99) || a.localeCompare(b, "pt"));
  };
  const ordenar = (l) => l.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt"));
  function nivel(p) {
    if (p.quantidade == null) return { cls: "por-contar", pct: 0 };
    if (p.minimo == null) return { cls: "ok", pct: 100 };
    const pct = Math.max(4, Math.min(100, (p.quantidade / Math.max(1, p.minimo * 3)) * 100));
    return { cls: p.quantidade <= p.minimo ? "baixo" : p.quantidade <= p.minimo * 1.5 ? "perto" : "ok", pct };
  }

  async function mover(id, tipo, qtd, nota, silencioso) {
    try {
      const r = await api.stk.movimento(id, tipo, qtd, nota);
      T.produtos[r.id] = r;
      T.movs.unshift({ id: "l" + Date.now(), local: true, produto_id: id, tipo, quantidade: qtd, depois: r.quantidade, nota: nota || "", autor_id: S.eu.id, criado_em: new Date().toISOString() });
      render(); if (S.aberto?.tipo === "stock") renderPainel(true);
      if (!silencioso) {
        const msg = { saida: "Retirado: " + qtd + " " + r.unidade, entrada: "Entrada: " + qtd + " " + r.unidade, acerto: "Contagem acertada: " + qtd + " " + r.unidade, reposto: "Reposto: ficam " + qtd + " " + r.unidade }[tipo];
        toast(msg + " · " + r.nome + (r.alerta === "alerta" ? ". Chegou ao mínimo: a Logística vai ser avisada." : ""),
          tipo === "saida" ? { acao: { rotulo: "Anular", fn: () => mover(id, "entrada", qtd, "Anulação de retirada", true).then((x) => x && toast("Retirada anulada")) } } : undefined);
      }
      return r;
    } catch (e) { falha(e); return null; }
  }

  /* ============================== Vistas ============================== */
  function vista(param) {
    if (T.estado === "por-carregar") carregar();
    if (param !== T.ultimoParam) { T.ultimoParam = param; if (["produtos", "movimentos", "importar", "avisos"].includes(param)) T.tab = param; }
    const g = eGestor(S.eu);
    let h = '<div class="cab" data-marca="twentysix"><div><div class="eyebrow">TwentySix</div><h1>Stocks</h1><p class="sub-cab">Produtos da marca. Retira o que sai e dá entrada do que chega: quando um produto chega ao mínimo, a Logística é avisada até ser reposto.</p></div>' +
      (T.estado === "pronto" ? '<div class="acts"><button class="btn pri" data-acao="stk-novo">' + I.plus + "Novo produto</button></div>" : "") + "</div>";
    const tabs = [["produtos", "Produtos"], ["movimentos", "Movimentos"], ["importar", "Importar"]].concat(g ? [["avisos", "Avisos"]] : []);
    h += '<div class="tabs" role="tablist">' + tabs.map(([k, r]) => '<button class="tab" role="tab" data-acao="stk-tab" data-tab="' + k + '" aria-selected="' + (T.tab === k) + '">' + r + "</button>").join("") + "</div>";
    if (T.estado === "falta-script") return h + '<div class="vazio"><h3>Falta instalar os Stocks na base de dados</h3><p>No Supabase, abre o SQL Editor, cola o ficheiro <b>supabase/12-perfil-email-stocks.sql</b> do GitHub e carrega em Run. Depois recarrega esta página.</p></div>';
    if (T.estado === "erro") return h + '<div class="aviso erro">Não foi possível abrir os Stocks: ' + esc(T.erro || "") + "</div>";
    if (T.estado !== "pronto") return h + '<div class="tabela"><div class="esqueleto"><i style="width:50%"></i></div></div>';
    if (T.tab === "movimentos") return h + vistaMovimentos();
    if (T.tab === "importar") return h + vistaImportar();
    if (T.tab === "avisos" && g) return h + vistaAvisos();
    return h + vistaProdutos();
  }

  function cartaoAlerta(p) {
    const ign = p.alerta === "ignorado";
    return '<div class="stk-alerta' + (ign ? " ign" : "") + '"><button class="stk-al-t" data-acao="stk-abrir" data-id="' + p.id + '"><b>' + esc(p.nome) + "</b><small>" +
      (p.quantidade === 0 ? "Esgotado" : "Restam " + fmt(p.quantidade) + " " + esc(p.unidade)) + " · mínimo " + fmt(p.minimo) +
      (ign ? " · ignorado por " + esc((nomeDe(p.ignorado_por) || "alguém").split(" ")[0]) + ", lembra de hora a hora" : " · avisa de 15 em 15 minutos") + "</small></button>" +
      '<span class="acts"><button class="btn pri" data-acao="stk-repor" data-id="' + p.id + '">Reposto</button>' + (ign ? "" : '<button class="btn sec" data-acao="stk-ignorar" data-id="' + p.id + '">Ignorar</button>') + "</span></div>";
  }
  function vistaProdutos() {
    const l = lista(), alertas = l.filter(emAlerta).sort((a, b) => (a.alerta === "alerta" ? 0 : 1) - (b.alerta === "alerta" ? 0 : 1) || a.quantidade - b.quantidade);
    const porContar = l.filter((p) => p.quantidade == null).length, unidades = l.reduce((s, p) => s + (p.quantidade || 0), 0);
    let h = '<div class="resumo-crm resumo-eq"><div class="kpi"><span>Produtos</span><b>' + l.length + '</b></div><div class="kpi' + (alertas.length ? " alerta-kpi" : "") + '"><span>A repor</span><b>' + alertas.length +
      '</b></div><div class="kpi"><span>Por contar</span><b>' + porContar + '</b></div><div class="kpi"><span>Unidades em stock</span><b>' + fmt(unidades) + "</b></div></div>";
    if (porContar === l.length && l.length) h += '<div class="aviso">Ainda não há quantidades. Podes contar produto a produto (abre um e usa «Acertar contagem») ou importar um Excel com as quantidades em <b>Importar</b>.</div>';
    if (alertas.length) {
      const ver = T.verAlertas ? alertas : alertas.slice(0, 3);
      h += '<section class="cartao-sec stk-alertas"><h3>A repor <span class="mono muted">' + alertas.length + '</span></h3><div class="stk-al-lista">' + ver.map(cartaoAlerta).join("") + "</div>" +
        (alertas.length > 3 ? '<button class="mostrar-feitas" data-acao="stk-ver-alertas">' + I.seta + (T.verAlertas ? "Mostrar só os 3 primeiros" : "Ver todos os " + alertas.length) + "</button>" : "") + "</section>";
    }
    const cats = categorias();
    if (!T.cat || !cats.includes(T.cat)) T.cat = cats[0] || "";
    h += '<div class="barra"><div class="ferr ferr-aud"><label class="pesq stk-pesq">' + I.lupa + '<span class="sr">Pesquisar produto</span><input id="stk-q" type="search" placeholder="Procurar produto em todas as categorias…" value="' + esc(T.q) + '"></label></div></div>';
    if (!T.q) h += '<div class="chips-marca stk-cats" role="tablist" aria-label="Categorias">' + cats.map((c) => {
      const lc = l.filter((p) => p.categoria === c), al = lc.filter(emAlerta).length;
      return '<button class="chip-m' + (T.cat === c ? " on" : "") + '" role="tab" aria-selected="' + (T.cat === c) + '" data-acao="stk-cat" data-v="' + esc(c) + '">' + esc(c) + ' <span class="n">' + lc.length + "</span>" + (al ? '<span class="stk-ponto" title="' + al + ' a repor"></span>' : "") + "</button>";
    }).join("") + "</div>";
    const q = n(T.q), mostrar = ordenar(l.filter((p) => (q ? n(p.nome + " " + p.categoria).includes(q) : p.categoria === T.cat)));
    if (!mostrar.length) return h + '<div class="vazio"><h3>Nenhum produto encontrado</h3><p>Experimenta outro nome ou cria o produto em «Novo produto».</p></div>';
    h += '<div class="stk-grelha">' + mostrar.map((p) => {
      const nv = nivel(p);
      return '<div class="stk-card ' + nv.cls + (p.ativo ? "" : " inativo") + '"><button class="stk-card-t" data-acao="stk-abrir" data-id="' + p.id + '"><span class="stk-nome">' + esc(p.nome) + "</span>" +
        (q ? '<small class="muted">' + esc(p.categoria) + "</small>" : "") +
        '<span class="stk-qtd">' + (p.quantidade == null ? '<span class="muted">Por contar</span>' : '<b class="mono">' + fmt(p.quantidade) + "</b><small>" + esc(p.unidade) + "</small>") + "</span>" +
        '<span class="stk-barra"><i style="width:' + nv.pct.toFixed(0) + '%"></i></span><small class="stk-min">' + (p.minimo == null ? "Sem mínimo definido" : "Mínimo " + fmt(p.minimo)) + (emAlerta(p) ? ' · <b class="at">a repor</b>' : "") + "</small></button>" +
        '<span class="stk-bts"><button class="stk-b" data-acao="stk-menos" data-id="' + p.id + '" aria-label="Retirar 1 de ' + esc(p.nome) + '"' + (p.quantidade ? "" : " disabled") + '>−1</button><button class="stk-b" data-acao="stk-mais" data-id="' + p.id + '" aria-label="Dar entrada de 1 de ' + esc(p.nome) + '">+1</button></span></div>';
    }).join("") + "</div>";
    return h;
  }

  function rotDia(ts) {
    const d = new Date(ts), k = ymd(d), hj = ymd(new Date()), ontem = ymd(new Date(Date.now() - 864e5));
    return k === hj ? "Hoje" : k === ontem ? "Ontem" : DIA[d.getDay()].replace(/^./, (c) => c.toUpperCase()) + ", " + d.getDate() + " de " + MES_L[d.getMonth()];
  }
  function linhaMov(m, comProduto = true) {
    const p = T.produtos[m.produto_id];
    return '<div class="feed-item"><span class="feed-ic a-' + (m.tipo === "saida" ? "eliminou" : m.tipo === "acerto" ? "atribuiu" : "concluiu") + '" aria-hidden="true"></span><span class="txt"><b>' + esc((nomeDe(m.autor_id) || "Alguém").split(" ")[0]) + "</b> " + TIPOS_MOV[m.tipo] + " <b>" + fmt(m.quantidade) + "</b>" +
      (comProduto ? ' · <a href="#stock-' + m.produto_id + '">' + esc(p?.nome || "produto eliminado") + "</a>" : "") + (m.antes != null || m.depois != null ? ' <small class="muted">(' + (m.antes == null ? "—" : fmt(m.antes)) + " → " + fmt(m.depois) + ")</small>" : "") +
      (m.nota ? ' <small class="muted">· ' + esc(m.nota) + "</small>" : "") + '</span><span class="q">' + new Date(m.criado_em).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) + "</span></div>";
  }
  function vistaMovimentos() {
    if (!T.movs.length) return '<div class="vazio"><h3>Ainda não há movimentos</h3><p>Cada retirada, entrada ou contagem fica registada aqui, com quem a fez.</p></div>';
    const pg = paginar(T.movs, T.pagMov, 30); T.pagMov = pg.pag;
    let h = "", dia = "";
    for (const m of pg.itens) {
      const k = ymd(new Date(m.criado_em));
      if (k !== dia) { if (dia) h += "</div>"; h += '<div class="feed-dia"><span>' + esc(rotDia(m.criado_em)) + '</span></div><div class="feed">'; dia = k; }
      h += linhaMov(m);
    }
    return '<section class="registo">' + h + "</div>" + paginador(pg, "stk-pag", "movimentos") + "</section>";
  }

  function vistaAvisos() {
    const c = T.config, pessoas = ativos().slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
    const sel = new Set(c.avisar || []);
    const logist = pessoas.filter((p) => p.departamento_id === "logistica").map((p) => p.nome.split(" ")[0]).join(", ") || "ninguém";
    const horas = (id, v, de, ate) => '<select id="' + id + '" class="sel">' + Array.from({ length: ate - de + 1 }, (_, i) => de + i).map((x) => '<option value="' + x + '"' + (x === v ? " selected" : "") + ">" + String(x).padStart(2, "0") + ":00</option>").join("") + "</select>";
    return '<section class="cartao-sec"><h3>Quem recebe os avisos</h3><p>Quando um produto chega ao mínimo, estas pessoas recebem um aviso no telemóvel de 15 em 15 minutos até alguém o marcar como reposto. Quem carregar em «Ignorar» passa os avisos para de hora a hora.</p>' +
      '<p class="muted">Sem ninguém escolhido, recebe o departamento de Logística (' + esc(logist) + ").</p>" +
      '<div class="stk-pessoas">' + pessoas.map((p) => '<label class="chk-txt stk-pessoa"><input type="checkbox" data-stk-avisar="' + p.id + '"' + (sel.has(p.id) ? " checked" : "") + "> " + av(p.id) + "<span>" + esc(p.nome) + "</span></label>").join("") + "</div></section>" +
      '<section class="cartao-sec"><h3>Horário dos avisos</h3><p>Fora deste horário não são enviados lembretes (por exemplo, à noite).</p><div class="campos-3"><div class="campo"><label for="stk-h-ini">Das</label>' + horas("stk-h-ini", c.hora_inicio, 0, 23) +
      '</div><div class="campo"><label for="stk-h-fim">Até às</label>' + horas("stk-h-fim", c.hora_fim, 1, 24) + '</div></div><div class="acts"><button class="btn pri" data-acao="stk-guardar-avisos">Guardar</button></div></section>';
  }

  /* ---------- Importar ---------- */
  function vistaImportar() {
    const imp = T.importacao;
    let h = '<section class="cartao-sec"><h3>Importar quantidades do Excel</h3><p>O ficheiro precisa das colunas <b>Produto</b> e <b>Quantidade</b>; <b>Categoria</b> e <b>Mínimo</b> são opcionais. Os produtos são reconhecidos pelo nome; os que não existirem são criados.</p>' +
      '<p>A forma mais simples: descarrega o modelo com a lista atual, preenche as quantidades e os mínimos, e importa-o aqui.</p>' +
      '<div class="acts"><label class="btn pri" for="stk-ficheiro">' + I.plus + 'Escolher ficheiro</label><input id="stk-ficheiro" type="file" accept=".xlsx,.xls,.csv" hidden><button class="btn sec" data-acao="stk-modelo">Descarregar modelo</button></div></section>';
    if (imp?.erro) h += '<div class="aviso erro">' + esc(imp.erro) + "</div>";
    if (imp?.linhas) {
      const existe = (x) => lista().find((p) => n(p.nome) === n(x.nome));
      const novos = imp.linhas.filter((x) => !existe(x)), mud = imp.linhas.filter((x) => { const p = existe(x); return p && ((x.quantidade != null && x.quantidade !== p.quantidade) || ("minimo" in x && x.minimo !== p.minimo)); });
      h += '<section class="cartao-sec"><h3>' + esc(imp.nome) + '</h3><ul class="sem-tarefas"><li><b>' + imp.linhas.length + "</b> " + (imp.linhas.length === 1 ? "linha lida" : "linhas lidas") + "</li><li><b>" + mud.length + "</b> " + (mud.length === 1 ? "produto com quantidade ou mínimo alterado" : "produtos com quantidade ou mínimo alterado") + "</li><li><b>" + novos.length + "</b> " + (novos.length === 1 ? "produto novo" : "produtos novos") +
        (novos.length ? ": " + esc(novos.slice(0, 8).map((x) => x.nome).join(", ")) + (novos.length > 8 ? "…" : "") : "") + "</li>" + (imp.ignoradas ? "<li>" + imp.ignoradas + " linhas sem nome de produto foram ignoradas</li>" : "") + "</ul>" +
        '<div class="acts"><button class="btn pri" data-acao="stk-importar"' + (T.aImportar ? " disabled" : "") + ">" + (T.aImportar ? "A importar…" : "Importar") + '</button><button class="btn sec" data-acao="stk-imp-cancelar">Cancelar</button></div></section>';
    }
    return h;
  }
  async function lerFicheiro(f) {
    T.importacao = { nome: f.name };
    try {
      const XLSX = await carregarXlsx();
      const wb = XLSX.read(await f.arrayBuffer());
      let linhas = [], ignoradas = 0;
      for (const nomeF of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[nomeF], { header: 1, defval: "" });
        const iCab = rows.findIndex((r) => r.some((c) => /^produto|^nome|^artigo/i.test(String(c).trim())));
        if (iCab < 0) continue;
        const cab = rows[iCab].map((c) => n(c));
        const col = (re) => cab.findIndex((c) => re.test(c));
        const cP = col(/^(produto|nome|artigo)/), cQ = col(/^(quantidade|qtd|stock|existencia)/), cM = col(/^(minimo|min)/), cC = col(/^categoria/), cK = col(/^codigo/);
        for (const r of rows.slice(iCab + 1)) {
          const nome = String(r[cP] ?? "").trim();
          if (!nome) { if (r.some((c) => String(c).trim())) ignoradas++; continue; }
          const num = (v) => { const t = String(v ?? "").trim().replace(",", "."); return t === "" || isNaN(+t) ? null : Math.max(0, Math.round(+t)); };
          const x = { nome };
          if (cQ >= 0) x.quantidade = num(r[cQ]);
          if (cM >= 0) x.minimo = num(r[cM]);
          if (cC >= 0 && String(r[cC]).trim()) x.categoria = String(r[cC]).trim();
          if (cK >= 0 && String(r[cK]).trim()) x.codigo = String(r[cK]).trim();
          linhas.push(x);
        }
      }
      if (!linhas.length) throw new Error("Não encontrei uma coluna «Produto» com linhas preenchidas.");
      T.importacao = { nome: f.name, linhas, ignoradas };
    } catch (e) { T.importacao.erro = e.message; }
    render();
  }
  async function importar() {
    const imp = T.importacao; if (!imp?.linhas) return;
    T.aImportar = true; render();
    try {
      const r = await api.stk.importar(imp.linhas);
      T.aImportar = false; T.importacao = null; T.estado = "por-carregar"; await carregar(); T.tab = "produtos";
      if (S.rota === "stocks" && S.param) location.hash = "stocks"; else render();
      toast(r.atualizados + (r.atualizados === 1 ? " produto atualizado" : " produtos atualizados") + " e " + r.novos + (r.novos === 1 ? " novo" : " novos"));
    } catch (e) { T.aImportar = false; render(); falha(e); }
  }
  async function modelo() {
    try {
      const XLSX = await carregarXlsx(), wb = XLSX.utils.book_new();
      const l = lista().length ? ordenar(lista()).sort((a, b) => (ORDEM_CAT.indexOf(a.categoria) + 1 || 99) - (ORDEM_CAT.indexOf(b.categoria) + 1 || 99))
        : CATALOGO_STK.map(([codigo, nome, categoria]) => ({ codigo, nome, categoria, quantidade: null, minimo: null }));
      const ws = XLSX.utils.aoa_to_sheet([["Produto", "Categoria", "Quantidade", "Mínimo"], ...l.map((p) => [p.nome, p.categoria, p.quantidade ?? "", p.minimo ?? ""])]);
      ws["!cols"] = [{ wch: 42 }, { wch: 24 }, { wch: 12 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws, "Stocks");
      XLSX.writeFile(wb, "stocks-twentysix-central26.xlsx");
    } catch (e) { falha(e); }
  }

  /* ============================== Painel ============================== */
  function painel(a) {
    if (a.tipo === "stk-novo") return painelNovo();
    const p = T.produtos[a.id], g = eGestor(S.eu);
    const mold = (c) => '<div class="veu" data-acao="fechar"></div><aside class="painel largo" role="dialog" aria-label="Produto" data-marca="twentysix"><div class="p-scroll">' + c + "</div></aside>";
    const topo = '<div class="p-topo"><span class="migalha"><i></i>TwentySix / Stocks</span><span class="acts">' + (p && g ? '<button class="ib perigo" data-acao="stk-apagar">' + I.lixo + "Eliminar</button>" : "") + '<button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + "</button></span></div>";
    if (!p) return mold(topo + (T.estado === "pronto" ? '<div class="vazio"><h3>Este produto já não existe</h3></div>' : '<div class="esqueleto"><i style="width:60%"></i></div>'));
    const nv = nivel(p), modo = a.modo || T.modo;
    const rasc = T.rasc && T.rasc.id === p.id && T.rasc.modo === modo ? T.rasc : null; // o que já foi escrito sobrevive a uma atualização do ecrã
    let h = topo;
    if (T.confirmar) h += '<div class="aviso erro aviso-acao"><span>Eliminar «' + esc(p.nome) + "» e todo o histórico? Se só deixou de se vender, desativa-o.</span><span class=\"acts\"><button class=\"btn sec\" data-acao=\"stk-apagar-nao\">Manter</button><button class=\"btn perigo\" data-acao=\"stk-apagar-sim\">Eliminar</button></span></div>";
    h += '<label class="sr" for="sk-nome">Nome</label><textarea id="sk-nome" class="p-titulo" rows="1">' + esc(p.nome) + "</textarea>";
    h += '<div class="stk-p-qtd ' + nv.cls + '"><div><span class="eyebrow neutro">Em stock</span><b class="mono">' + (p.quantidade == null ? "—" : fmt(p.quantidade)) + "</b><small>" + (p.quantidade == null ? "Por contar" : esc(p.unidade)) + "</small></div>" +
      '<span class="stk-barra"><i style="width:' + nv.pct.toFixed(0) + '%"></i></span>' + (emAlerta(p) ? '<p class="stk-p-al">' + (p.alerta === "ignorado" ? "Abaixo do mínimo · avisos de hora a hora (ignorado por " + esc((nomeDe(p.ignorado_por) || "alguém").split(" ")[0]) + ")" : "Abaixo do mínimo · a Logística está a ser avisada de 15 em 15 minutos") + "</p>" : "") + "</div>";
    const modos = [["saida", "Retirar"], ["entrada", "Dar entrada"], ["acerto", "Acertar contagem"]].concat(emAlerta(p) ? [["reposto", "Reposto"]] : []);
    h += '<section class="p-sec"><div class="seg seg-stk" role="group" aria-label="Movimento">' + modos.map(([k, r]) => '<button data-acao="stk-modo" data-v="' + k + '" aria-pressed="' + (modo === k) + '">' + r + "</button>").join("") + "</div>" +
      '<form class="form stk-mov" id="form-stk" novalidate><div class="campos-3"><div class="campo"><label for="sk-qtd">' + ({ saida: "Quantidade a retirar", entrada: "Quantidade que entrou", acerto: "Quantidade contada", reposto: "Quantidade que fica depois de repor" }[modo]) + '</label><input id="sk-qtd" type="number" inputmode="numeric" min="0" step="1" value="' + esc(rasc ? rasc.qtd : modo === "saida" || modo === "entrada" ? 1 : p.quantidade ?? "") + '"></div>' +
      '<div class="campo stk-nota"><label for="sk-nota">Nota (opcional)</label><input id="sk-nota" value="' + esc(rasc?.nota || "") + '" placeholder="' + (modo === "saida" ? "Ex.: encomenda de cliente, montra…" : "Ex.: encomenda ao fornecedor") + '" maxlength="200"></div></div>' +
      '<input type="hidden" id="sk-modo" value="' + modo + '"><div class="acts"><button class="btn pri" type="submit">' + ({ saida: "Retirar", entrada: "Dar entrada", acerto: "Guardar contagem", reposto: "Marcar como reposto" }[modo]) + "</button>" +
      (p.alerta === "alerta" ? '<button class="btn sec" type="button" data-acao="stk-ignorar" data-id="' + p.id + '">Ignorar o aviso</button>' : "") + "</div></form></section>";
    const cats = categorias();
    h += '<div class="props"><label for="sk-min">Mínimo (aviso)</label><input id="sk-min" type="number" inputmode="numeric" min="0" step="1" value="' + (p.minimo ?? "") + '" placeholder="Sem aviso">' +
      '<label for="sk-cat">Categoria</label><input id="sk-cat" list="sk-cats" value="' + esc(p.categoria) + '"><datalist id="sk-cats">' + cats.map((c) => '<option value="' + esc(c) + '">').join("") + "</datalist>" +
      '<label for="sk-uni">Unidade</label><input id="sk-uni" value="' + esc(p.unidade) + '" maxlength="12">' +
      (g ? '<label for="sk-ativo">Estado</label><select id="sk-ativo"><option value="1"' + (p.ativo ? " selected" : "") + '>À venda</option><option value="0"' + (p.ativo ? "" : " selected") + ">Desativado</option></select>" : "") + "</div>";
    const mv = T.movs.filter((m) => m.produto_id === p.id).slice(0, 15);
    h += '<section class="p-sec"><h3>Últimos movimentos</h3>' + (mv.length ? '<div class="feed">' + mv.map((m) => linhaMov(m, false).replace('<span class="q">', '<span class="q">' + esc(haQuanto(m.criado_em)) + " · ")).join("") + "</div>" : '<p class="muted">Ainda sem movimentos.</p>') + "</section>";
    return mold(h);
  }
  function painelNovo() {
    const cats = categorias();
    return '<div class="veu" data-acao="fechar"></div><aside class="painel" role="dialog" aria-label="Novo produto" data-marca="twentysix"><div class="p-scroll"><div class="p-topo"><span class="migalha"><i></i>TwentySix / Stocks</span><button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + '</button></div><h2 style="margin:0">Novo produto</h2>' +
      '<form class="form" id="form-stk-novo" novalidate><div class="campo"><label for="sn-nome">Nome</label><input id="sn-nome" required autocomplete="off" placeholder="Ex.: Spark · Cera 100 ml"></div>' +
      '<div class="campos-3"><div class="campo"><label for="sn-cat">Categoria</label><input id="sn-cat" list="sn-cats" value="' + esc(T.cat || "Outros") + '"><datalist id="sn-cats">' + cats.map((c) => '<option value="' + esc(c) + '">').join("") + "</datalist></div>" +
      '<div class="campo"><label for="sn-min">Mínimo (aviso)</label><input id="sn-min" type="number" inputmode="numeric" min="0" placeholder="Opcional"></div><div class="campo"><label for="sn-qtd">Quantidade atual</label><input id="sn-qtd" type="number" inputmode="numeric" min="0" placeholder="Opcional"></div></div>' +
      '<div class="acts"><button class="btn pri" type="submit">Criar produto</button><button class="btn sec" type="button" data-acao="fechar">Cancelar</button></div></form></div></aside>';
  }

  /* ============================== Início ============================== */
  function blocoInicio() {
    if (!pode()) return "";
    if (T.estado === "por-carregar") carregar();
    if (T.estado !== "pronto") return "";
    const al = lista().filter(emAlerta);
    if (!al.length) return "";
    return '<section class="cartao-sec stk-alertas" data-marca="twentysix"><h3>Stock a repor <span class="mono muted">' + al.length + '</span> <a class="c-link" href="#stocks" style="font-size:13px;margin-left:8px">Abrir os Stocks</a></h3><div class="stk-al-lista">' + al.slice(0, 4).map(cartaoAlerta).join("") + "</div></section>";
  }
  const contagem = () => (T.estado !== "pronto" ? 0 : lista().filter((p) => p.alerta === "alerta").length);

  /* ============================== Ações ============================== */
  function clique(acao, el) {
    const id = el.dataset.id;
    switch (acao) {
      case "stk-tab": T.tab = el.dataset.tab; if (S.rota === "stocks" && S.param) location.hash = "stocks"; else render(); return true;
      case "stk-cat": T.cat = el.dataset.v; render(); return true;
      case "stk-ver-alertas": T.verAlertas = !T.verAlertas; render(); return true;
      case "stk-abrir": T.modo = "saida"; T.confirmar = false; T.rasc = null; abrir({ tipo: "stock", id }); return true;
      case "stk-repor": T.modo = "reposto"; T.confirmar = false; T.rasc = null; abrir({ tipo: "stock", id, modo: "reposto" }); setTimeout(() => $("#sk-qtd")?.select(), 50); return true;
      case "stk-menos": mover(id, "saida", 1, ""); return true;
      case "stk-mais": mover(id, "entrada", 1, ""); return true;
      case "stk-modo": T.modo = el.dataset.v; if (S.aberto) S.aberto = { ...S.aberto, modo: el.dataset.v }; renderPainel(true); setTimeout(() => $("#sk-qtd")?.select(), 0); return true;
      case "stk-ignorar": api.stk.ignorar(id).then((r) => { T.produtos[r.id] = r; render(); if (S.aberto?.tipo === "stock") renderPainel(true); toast("Aviso ignorado: passa a lembrar de hora a hora até ser reposto."); }).catch(falha); return true;
      case "stk-novo": abrir({ tipo: "stk-novo" }); return true;
      case "stk-pag": T.pagMov = +el.dataset.p; render(); return true;
      case "stk-modelo": modelo(); return true;
      case "stk-importar": importar(); return true;
      case "stk-imp-cancelar": T.importacao = null; render(); return true;
      case "stk-apagar": T.confirmar = true; renderPainel(true); return true;
      case "stk-apagar-nao": T.confirmar = false; renderPainel(true); return true;
      case "stk-apagar-sim": { const pid = S.aberto.id, antes = T.produtos[pid]; delete T.produtos[pid]; T.confirmar = false; fechar(); render(); api.stk.apagar(pid).then(() => toast("Produto eliminado")).catch((e) => { T.produtos[pid] = antes; render(); falha(e); }); return true; }
      case "stk-guardar-avisos": {
        const avisar = [...document.querySelectorAll("[data-stk-avisar]")].filter((x) => x.checked).map((x) => x.dataset.stkAvisar);
        const hi = +$("#stk-h-ini").value, hf = +$("#stk-h-fim").value;
        if (hf <= hi) { toast("A hora de fim tem de ser depois da hora de início.", true); return true; }
        api.stk.guardarConfig({ avisar, hora_inicio: hi, hora_fim: hf }).then((c) => { T.config = c; render(); toast("Avisos guardados"); }).catch(falha);
        return true;
      }
    }
    return false;
  }
  const timers = {};
  async function gravarCampo(id, campos) {
    const antes = T.produtos[id]; if (!antes) return;
    try { const r = await api.stk.atualizar(id, campos); T.produtos[id] = r; agendarRender(); renderPainel(); }
    catch (e) { T.produtos[id] = antes; agendarRender(); renderPainel(true); falha(e); }
  }
  function escrever(e) {
    const t = e.target;
    if (t.id === "stk-q") { T.q = t.value; const pos = t.selectionStart; render(); const x = $("#stk-q"); if (x) { x.focus(); x.setSelectionRange(pos, pos); } return true; }
    if (S.aberto?.tipo === "stock" && (t.id === "sk-qtd" || t.id === "sk-nota")) {
      T.rasc = { id: S.aberto.id, modo: $("#sk-modo")?.value, qtd: $("#sk-qtd")?.value ?? "", nota: $("#sk-nota")?.value ?? "" };
      return true;
    }
    if (S.aberto?.tipo === "stock" && t.id === "sk-nome") {
      t.style.height = "auto"; t.style.height = t.scrollHeight + "px";
      const id = S.aberto.id; clearTimeout(timers.nome);
      timers.nome = setTimeout(() => { const v = t.value.trim(); if (v) gravarCampo(id, { nome: v }); }, 900);
      return true;
    }
    return false;
  }
  function mudar(e) {
    const t = e.target;
    if (t.id === "stk-ficheiro" && t.files?.[0]) { lerFicheiro(t.files[0]); t.value = ""; return true; }
    if (S.aberto?.tipo === "stock") {
      const id = S.aberto.id;
      if (t.id === "sk-min") { const v = t.value === "" ? null : Math.max(0, Math.round(+t.value)); gravarCampo(id, { minimo: v }).then(() => { const p = T.produtos[id]; if (p?.alerta === "alerta") toast("Está abaixo do mínimo: a Logística vai ser avisada."); }); return true; }
      if (t.id === "sk-cat") { const v = t.value.trim(); if (v) { gravarCampo(id, { categoria: v }); T.cat = v; } return true; }
      if (t.id === "sk-uni") { gravarCampo(id, { unidade: t.value.trim() || "un." }); return true; }
      if (t.id === "sk-ativo") { gravarCampo(id, { ativo: t.value === "1" }); return true; }
    }
    return false;
  }
  async function submeter(f) {
    if (f.id === "form-stk") {
      const id = S.aberto?.id, modo = $("#sk-modo").value, qtd = Math.round(Number($("#sk-qtd").value));
      if ($("#sk-qtd").value === "" || !Number.isFinite(qtd) || qtd < 0) { toast("Indica a quantidade.", true); $("#sk-qtd").focus(); return true; }
      const r = await mover(id, modo, qtd, $("#sk-nota").value.trim());
      if (r) { T.rasc = null; T.modo = "saida"; if (S.aberto) S.aberto = { ...S.aberto, modo: "saida" }; renderPainel(true); }
      return true;
    }
    if (f.id === "form-stk-novo") {
      const nome = $("#sn-nome").value.trim(); if (!nome) { toast("Dá um nome ao produto.", true); $("#sn-nome").focus(); return true; }
      const num = (s) => ($(s).value === "" ? null : Math.max(0, Math.round(+$(s).value)));
      try {
        const r = await api.stk.criar({ nome, categoria: $("#sn-cat").value.trim() || "Outros", minimo: num("#sn-min"), ordem: 99 });
        T.produtos[r.id] = r; T.cat = r.categoria;
        const q = num("#sn-qtd");
        fechar(); render();
        if (q != null) await mover(r.id, "acerto", q, "Contagem inicial", true);
        toast("Produto criado");
      } catch (e) { falha(e); }
      return true;
    }
    return false;
  }
  function reiniciar() { if (desligar) { desligar(); desligar = null; } Object.assign(T, { estado: "por-carregar", produtos: {}, movs: [], config: null, importacao: null, tab: "produtos", cat: "", q: "" }); }

  // Atualiza em silêncio (por exemplo, depois de uma encomenda mexer no stock)
  function recarregar() { if (T.estado !== "pronto") return; T.estado = "por-carregar"; carregar(); }
  function pesquisar(q) {
    if (!pode() || T.estado !== "pronto") return [];
    return lista().filter((p) => q(p.nome + " " + p.categoria)).slice(0, 6).map((p) => ({ titulo: p.nome, sub: p.categoria + " · " + (p.quantidade == null ? "por contar" : p.quantidade + " " + p.unidade) + (p.alerta !== "ok" ? " · a repor" : ""), href: "#stock-" + p.id }));
  }
  return { vista, painel, clique, escrever, mudar, submeter, carregar, recarregar, pesquisar, blocoInicio, reiniciar, contagem, estado: () => T.estado };
}
