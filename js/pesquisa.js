// Central 26 — Pesquisa global: procura em tudo o que a pessoa pode ver (Ctrl/Cmd + K).
import { normalizar, MARCA } from "./dados.js";

export function criarPesquisa(ctx) {
  const { S, esc, I, todas, ativos, nomeDe, modulos, paginas } = ctx;
  const P = { aberta: false, q: "", sel: 0, res: [] };
  let root = null;

  const n = (s) => normalizar(s).replace(/\s+/g, " ").trim();
  function corresponde(q) {
    const termos = n(q).split(" ").filter(Boolean);
    return (texto) => { const t = n(texto); return termos.every((x) => t.includes(x)); };
  }
  function grupo(nome, itens, max = 5) { return itens.slice(0, max).map((x) => ({ ...x, grupo: nome })); }

  function procurar(q) {
    if (!q.trim()) return [];
    const ok = corresponde(q), m = modulos(), r = [];
    r.push(...grupo("Páginas", paginas().filter((p) => ok(p.titulo + " " + (p.chaves || ""))).map((p) => ({ titulo: p.titulo, sub: "Abrir a página", href: p.href, ic: p.ic })), 4));
    r.push(...grupo("Tarefas", todas().filter((t) => ok(t.titulo + " " + (t.notas || ""))).sort((a, b) => (a.estado === "concluido") - (b.estado === "concluido"))
      .map((t) => ({ titulo: t.titulo, sub: [MARCA[t.marca]?.nome, t.responsavel_id ? nomeDe(t.responsavel_id) : "Sem responsável", t.estado === "concluido" ? "concluída" : ""].filter(Boolean).join(" · "), href: "#tarefa-" + t.id, ic: I.check }))));
    r.push(...grupo("Pessoas", ativos().filter((p) => ok(p.nome + " " + (p.cargo || ""))).map((p) => ({ titulo: p.nome, sub: p.cargo || "", href: "#pessoa-" + p.id, av: p.id }))));
    if (m.crm && S.crm?.estado === "pronto") r.push(...grupo("Clientes", Object.values(S.crm.clientes).filter((c) => ok([c.nome, c.nif, c.concelho, c.distrito, c.contacto, c.email].join(" ")))
      .map((c) => ({ titulo: c.nome, sub: [c.etapa === "lead" ? "Lead" : "Cliente", c.concelho, c.nif ? "NIF " + c.nif : ""].filter(Boolean).join(" · "), href: "#cliente-" + c.id, ic: I.loja }))));
    if (m.log && S.log?.estado === "pronto") r.push(...grupo("Encomendas", Object.values(S.log.encomendas).filter((e) => ok(["E-" + String(e.numero).padStart(4, "0"), e.cliente_nome, e.morada, e.fatura_numero, ...(e.itens || []).map((i) => i.descricao)].join(" ")))
      .sort((a, b) => b.numero - a.numero).map((e) => ({ titulo: "E-" + String(e.numero).padStart(4, "0") + " · " + e.cliente_nome, sub: (e.itens || []).slice(0, 3).map((i) => (i.qtd || 1) + "× " + i.descricao).join(", "), href: "#encomenda-" + e.id, ic: I.camiao }))));
    if (m.stk) r.push(...grupo("Stocks", m.stk.pesquisar(ok).map((x) => ({ ...x, ic: I.stock }))));
    if (m.op && S.op?.estado === "pronto") {
      r.push(...grupo("Fornecedores", Object.values(S.op.forn).filter((f) => ok([f.nome, f.categoria, f.contacto_nome, f.email, f.telefone, f.notas].join(" "))).map((f) => ({ titulo: f.nome, sub: f.categoria || "", href: "#fornecedor-" + f.id, ic: I.caixa }))));
      r.push(...grupo("Pedidos de orçamento", Object.values(S.op.pedidos).filter((p) => ok(["P-" + String(p.numero).padStart(3, "0"), p.titulo, p.descricao].join(" "))).map((p) => ({ titulo: "P-" + String(p.numero).padStart(3, "0") + " · " + p.titulo, sub: p.categoria || "", href: "#pedido-" + p.id, ic: I.caixa })), 3));
    }
    if (m.mk && S.mk?.estado === "pronto") {
      r.push(...grupo("Publicações", Object.values(S.mk.pubs).filter((p) => ok([p.titulo, p.copy, p.notas, p.tipo].join(" "))).sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")))
        .map((p) => ({ titulo: p.titulo, sub: [MARCA[p.marca]?.nome, p.data ? p.data.split("-").reverse().join("/") : "sem data"].filter(Boolean).join(" · "), href: "#publicacao-" + p.id, ic: I.megafone }))));
      r.push(...grupo("Documentos", Object.values(S.mk.docs).filter((d) => ok(d.titulo + " " + d.conteudo)).map((d) => ({ titulo: d.titulo, sub: "Documento do Marketing", href: "#marketing-documentos", ic: I.megafone })), 3));
    }
    if (m.aud && S.aud?.estado === "pronto") r.push(...grupo("Auditoria", Object.values(S.aud.itens).filter((x) => ok([x.id, x.problema, x.correcao, x.categoria, x.dominio].join(" "))).map((x) => ({ titulo: x.id + " · " + x.problema, sub: [x.prioridade, x.categoria, x.dominio].filter(Boolean).join(" · "), href: "#auditoria-" + x.id, ic: I.escudo }))));
    if (S.agenda?.estado === "pronto") r.push(...grupo("Agenda", Object.values(S.agenda.eventos).filter((e) => ok([e.titulo, e.local, e.notas].join(" "))).sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)))
      .map((e) => ({ titulo: e.titulo, sub: new Date(e.inicio).toLocaleString("pt-PT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + (e.local ? " · " + e.local : ""), href: "#agenda-" + e.id, ic: I.cal })), 4));
    if (S.chat?.estado === "pronto") r.push(...grupo("Conversas", S.chat.resumo.map((c) => ({ c, nome: c.tipo === "direto" ? nomeDe(c.outro_id) || "" : c.tipo === "geral" ? "Geral" : c.nome })).filter((x) => x.nome && ok(x.nome))
      .map((x) => ({ titulo: x.nome, sub: x.c.tipo === "direto" ? "Mensagem direta" : x.c.tipo === "grupo" ? "Grupo" : "Canal", href: "#chat-" + x.c.canal_id, ic: I.chat })), 3));
    return r;
  }

  // Abrir a pesquisa carrega o que ainda falta (só o que a pessoa pode ver)
  function carregarTudo() {
    const m = modulos();
    Object.values(m).forEach((x) => { if (x && x.estado?.() === "por-carregar") x.carregar(); });
  }

  function htmlResultados() {
    if (!P.q.trim()) return '<div class="pq-vazio"><p>Procura tarefas, pessoas, clientes, encomendas, produtos, fornecedores, publicações…</p><p class="pq-teclas"><kbd>↑</kbd><kbd>↓</kbd> escolher · <kbd>Enter</kbd> abrir · <kbd>Esc</kbd> fechar</p></div>';
    if (!P.res.length) return '<div class="pq-vazio"><p>Nada encontrado para «' + esc(P.q) + "».</p></div>";
    let h = "", g = "";
    P.res.forEach((x, i) => {
      if (x.grupo !== g) { h += '<div class="pq-grupo">' + esc(x.grupo) + "</div>"; g = x.grupo; }
      h += '<a class="pq-item' + (i === P.sel ? " on" : "") + '" href="' + esc(x.href) + '" data-pq="' + i + '" role="option" aria-selected="' + (i === P.sel) + '">' +
        (x.av ? ctx.av(x.av) : '<span class="pq-ic">' + (x.ic || I.lupa) + "</span>") + '<span class="pq-t"><b>' + esc(x.titulo) + "</b>" + (x.sub ? "<small>" + esc(x.sub) + "</small>" : "") + "</span></a>";
    });
    return h;
  }
  function desenhar() {
    if (!root) return;
    if (!P.aberta) { root.innerHTML = ""; return; }
    const lista = root.querySelector(".pq-res");
    if (lista) { lista.innerHTML = htmlResultados(); lista.querySelector(".pq-item.on")?.scrollIntoView({ block: "nearest" }); return; }
    root.innerHTML = '<div class="pq-veu" data-pq-fechar></div><div class="pq-caixa" role="dialog" aria-label="Pesquisar na Central"><label class="pq-campo">' + I.lupa +
      '<span class="sr">Pesquisar</span><input id="pq-input" type="search" placeholder="Pesquisar na Central…" autocomplete="off" value="' + esc(P.q) + '" role="combobox" aria-expanded="true" aria-controls="pq-res"><kbd class="pq-esc" data-pq-fechar>Esc</kbd></label>' +
      '<div class="pq-res" id="pq-res" role="listbox">' + htmlResultados() + "</div></div>";
    const inp = root.querySelector("#pq-input"); inp.focus(); inp.select(); // a pesquisa anterior fica selecionada: escrever substitui-a
  }
  function abrir() {
    if (!root) { root = document.createElement("div"); root.id = "pesquisa-root"; document.body.appendChild(root); ligar(); }
    P.aberta = true; P.sel = 0; P.res = procurar(P.q); carregarTudo(); desenhar();
    document.documentElement.classList.add("pq-aberta");
  }
  function fechar() { P.aberta = false; desenhar(); document.documentElement.classList.remove("pq-aberta"); }
  function atualizar() { if (P.aberta) { P.res = procurar(P.q); P.sel = Math.min(P.sel, Math.max(0, P.res.length - 1)); desenhar(); } }
  function ir(i) { const x = P.res[i]; if (!x) return; fechar(); if (location.hash === x.href) window.dispatchEvent(new HashChangeEvent("hashchange")); else location.hash = x.href; }
  function ligar() {
    root.addEventListener("click", (e) => {
      if (e.target.closest("[data-pq-fechar]")) { fechar(); return; }
      const a = e.target.closest("[data-pq]"); if (a) { e.preventDefault(); ir(+a.dataset.pq); }
    });
    root.addEventListener("input", (e) => { if (e.target.id === "pq-input") { P.q = e.target.value; P.sel = 0; P.res = procurar(P.q); desenhar(); } });
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); fechar(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); P.sel = Math.min(P.res.length - 1, P.sel + 1); desenhar(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); P.sel = Math.max(0, P.sel - 1); desenhar(); }
      else if (e.key === "Enter" && e.target.id === "pq-input") { e.preventDefault(); ir(P.sel); }
    });
  }
  // Atalhos: Ctrl/Cmd + K em qualquer sítio; «/» quando não se está a escrever
  document.addEventListener("keydown", (e) => {
    if (S.fase !== "app") return;
    const escrever = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); P.aberta ? fechar() : abrir(); }
    else if (e.key === "/" && !escrever && !P.aberta) { e.preventDefault(); abrir(); }
  });
  window.addEventListener("hashchange", () => { if (P.aberta) fechar(); });

  return { abrir, fechar, atualizar, aberta: () => P.aberta };
}
