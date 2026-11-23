// Central 26 — Criar várias contas de uma vez (direção): cola a lista de nomes e emails (por exemplo, a lista de utilizadores
// do site de marcações) e a Central cruza-a com os barbeiros da folha da faturação, mostra quem ainda não tem conta,
// cria as contas e prepara os cartões de acesso para imprimir.
import { normalizar } from "./dados.js";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const chave = (n) => normalizar(n).replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length > 1);
// mesmo nome: primeiro nome igual e último nome igual (ou um contido no outro, para «Nuno Bessa Bessa»)
function mesmoNome(a, b) {
  const x = chave(a), y = chave(b); if (!x.length || !y.length) return false;
  return x[0] === y[0] && (x.length === 1 || y.length === 1 || x[x.length - 1] === y[y.length - 1] || y.includes(x[x.length - 1]) || x.includes(y[y.length - 1]));
}
const titulo = (s) => s.toLowerCase().split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

export function lerLista(txt) {
  const out = new Map();
  for (const l of String(txt).split(/\r?\n/)) {
    const m = l.match(EMAIL); if (!m) continue;
    let nome = l.slice(0, m.index).replace(/\t/g, " ").replace(/^(Seleccionar|Selecionar)\s+/i, "").replace(/[;,|]+\s*$/, "").trim();
    if (!nome || EMAIL.test(nome)) nome = l.slice(m.index + m[0].length).split("\t").map((x) => x.trim()).find((x) => x && !EMAIL.test(x)) || "";
    const email = m[0].toLowerCase();
    if (nome && !/^(barbearia|admin)/i.test(nome)) out.set(email, { nome: /^[A-ZÀ-Ú\s]+$/.test(nome) ? titulo(nome) : nome, email });
  }
  return [...out.values()];
}

export function criarEquipaLote(ctx) {
  const { S, api, esc, I, toast, renderPainel, recarregar } = ctx;

  async function abrirLote() {
    S.aberto = { tipo: "lote", passo: "lista", texto: "", folha: null, linhas: [] };
    renderPainel(true);
    try {
      // barbeiros da folha da faturação mais recente (script 21); sem acesso ou sem dados, segue sem a folha
      const f = await api.equipaFolha?.();
      if (S.aberto?.tipo === "lote") { S.aberto.folha = f || []; renderPainel(true); }
    } catch { if (S.aberto?.tipo === "lote") { S.aberto.folha = []; renderPainel(true); } }
  }

  const temConta = (nome, email) => Object.values(S.perfis).find((p) => (email && p.email?.toLowerCase() === email) || mesmoNome(p.nome, nome));

  function cruzar(a) {
    const lista = lerLista(a.texto);
    const folha = a.folha || [];
    const linhas = lista.map((x) => {
      const f = folha.find((b) => mesmoNome(b.barbeiro, x.nome));
      const conta = temConta(x.nome, x.email);
      return { ...x, loja: f?.loja || "", naFolha: !!f, conta: conta ? conta.nome : "", criar: !conta };
    });
    // barbeiros da folha que não aparecem na lista colada (faltam no site de marcações ou não têm email)
    const semEmail = folha.filter((b) => !lista.some((x) => mesmoNome(b.barbeiro, x.nome)) && !temConta(b.barbeiro, ""))
      .map((b) => ({ nome: titulo(b.barbeiro), email: "", loja: b.loja, naFolha: true, conta: "", criar: false, semEmail: true }));
    a.linhas = linhas.concat(semEmail);
  }

  function painel(a) {
    const mold = (c) => '<div class="veu" data-acao="fechar"></div><aside class="painel largo" role="dialog" aria-label="Criar várias contas" data-marca="twentysix"><div class="p-scroll">' + c + "</div></aside>";
    let c = '<div class="p-topo"><span class="migalha"><i></i>Equipa</span><button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + '</button></div><h2 style="margin:0">Criar várias contas</h2>';
    if (a.passo === "feito") {
      const ok = a.resultados.filter((r) => r.password), erro = a.resultados.filter((r) => !r.password);
      c += '<div class="aviso ok"><span>' + ok.length + " conta" + (ok.length === 1 ? " criada" : "s criadas") + ". As palavras-passe temporárias só aparecem agora: imprime os cartões antes de fechar.</span></div>" +
        '<div class="acts"><button class="btn pri" data-acao="lote-imprimir">' + I.nota + 'Imprimir cartões de acesso</button><button class="btn sec" data-acao="lote-copiar">' + I.copiar + "Copiar lista</button></div>" +
        '<div class="tabela-scroll"><table class="crm-tabela lote-tab"><thead><tr><th>Nome</th><th>Email</th><th>Palavra-passe temporária</th></tr></thead><tbody>' +
        a.resultados.map((r) => "<tr><td><b>" + esc(r.nome) + "</b>" + (r.loja ? "<small>" + esc(r.loja) + "</small>" : "") + "</td><td>" + esc(r.email) + "</td><td>" + (r.password ? '<span class="mono">' + esc(r.password) + "</span>" : '<span class="at">' + esc(r.erro || "Falhou") + "</span>") + "</td></tr>").join("") + "</tbody></table></div>" +
        (erro.length ? '<p class="muted">As contas que falharam podem ser criadas uma a uma em «Adicionar empregado».</p>' : "") +
        '<div class="acts"><button class="btn sec" data-acao="fechar">Fechar</button></div>';
      return mold(c);
    }
    const deps = Object.values(S.deps).sort((x, y) => x.ordem - y.ordem);
    const depBarb = deps.find((d) => /barbearia/i.test(d.nome))?.id || "";
    c += '<p class="muted" style="margin:0">Cola uma lista com nomes e emails, uma pessoa por linha. Serve a lista de utilizadores do WordPress do site de marcações, tal como a copias. A Central cruza-a com os barbeiros da folha da faturação e com quem já tem conta.</p>' +
      '<div class="campo"><label for="lote-txt">Lista</label><textarea id="lote-txt" rows="7" placeholder="André Silva	andre@exemplo.pt">' + esc(a.texto) + "</textarea></div>" +
      '<div class="campos-2"><div class="campo"><label for="lote-dep">Departamento</label><select id="lote-dep"><option value="">—</option>' + deps.map((d) => '<option value="' + d.id + '"' + ((a.dep ?? depBarb) === d.id ? " selected" : "") + ">" + esc(d.nome) + "</option>").join("") + "</select>" +
      (depBarb ? "" : '<span class="ajuda">Cria primeiro o departamento Barbearias em Equipa.</span>') + '</div><div class="campo"><label for="lote-cargo">Cargo</label><input id="lote-cargo" value="' + esc(a.cargo ?? "Barbeiro") + '"></div></div>' +
      '<div class="acts"><button class="btn sec" data-acao="lote-ler">Ler lista</button></div>';
    if (a.folha === null) c += '<p class="muted">A ler os barbeiros da folha da faturação…</p>';
    if (a.linhas.length) {
      const n = a.linhas.filter((l) => l.criar).length;
      c += '<div class="tabela-scroll"><table class="crm-tabela lote-tab"><thead><tr><th>Criar</th><th>Nome</th><th>Email</th><th>Situação</th></tr></thead><tbody>' +
        a.linhas.map((l, i) => '<tr><td><input type="checkbox" data-lote-i="' + i + '"' + (l.criar ? " checked" : "") + (l.conta || !l.email ? " disabled" : "") + ' aria-label="Criar conta de ' + esc(l.nome) + '"></td><td><b>' + esc(l.nome) + "</b>" + (l.loja ? "<small>" + esc(l.loja) + "</small>" : "") + "</td><td>" + (l.email ? esc(l.email) : '<span class="at">sem email</span>') + "</td><td>" +
          (l.conta ? '<span class="muted">Já tem conta (' + esc(l.conta) + ")</span>" : l.semEmail ? '<span class="at">Está na folha da faturação mas não na lista</span>' : l.naFolha ? '<span class="rec r-ativo"><i></i>Está na folha da faturação</span>' : '<span class="muted">Não está na última folha</span>') + "</td></tr>").join("") +
        "</tbody></table></div>" +
        '<div class="acts"><button class="btn pri" data-acao="lote-criar"' + (n && !a.aCriar ? "" : " disabled") + ">" + (a.aCriar ? "A criar " + a.feitas + " de " + n + "…" : "Criar " + n + " conta" + (n === 1 ? "" : "s")) + "</button></div>";
    }
    return mold(c);
  }

  function imprimir(a) {
    const e = (s) => String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
    const url = location.host + location.pathname.replace(/index\.html$/, "").replace(/\/$/, "");
    const cartao = (r) => '<div class="c"><div class="top"><b>Central 26</b><span>' + e(r.cargo || "Barbeiro") + (r.loja ? " · " + e(r.loja) : "") + "</span></div><h2>" + e(r.nome) + '</h2><div class="l"><span>Endereço</span><b>' + e(url) + '</b></div><div class="l"><span>Email</span><b>' + e(r.email) +
      '</b></div><div class="l"><span>Palavra-passe temporária</span><b class="pw">' + e(r.password) + "</b></div><p>No primeiro acesso a app pede-te uma palavra-passe nova, só tua. Depois instala a app no telemóvel: no Android, menu ⋮ → Instalar app; no iPhone (Safari), Partilhar → Adicionar ao ecrã principal.</p></div>";
    const html = '<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><title>Acessos à Central 26</title><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:9.5pt/1.4 system-ui,-apple-system,Segoe UI,sans-serif;color:#1d1b18;margin:0}' +
      "h1{font-size:15pt;margin:0 0 2px}.sub{color:#6b665f;margin:0 0 10px;font-size:9pt}.g{display:grid;grid-template-columns:1fr 1fr}.c{border:1px dashed #b8b2a7;padding:12px 14px;break-inside:avoid;min-height:84mm}" +
      ".top{display:flex;justify-content:space-between;border-bottom:2px solid #8a6a2f;padding-bottom:5px;color:#8a6a2f;font-size:8.5pt;text-transform:uppercase;letter-spacing:.08em}.top b{color:#1d1b18}h2{font-size:14pt;margin:10px 0 8px}" +
      ".l{display:flex;flex-direction:column;margin:0 0 7px}.l span{font-size:7.8pt;color:#6b665f;text-transform:uppercase;letter-spacing:.06em}.l b{font-size:10pt;overflow-wrap:anywhere}.l b.pw{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14pt}p{font-size:8.3pt;color:#4a463f;margin:8px 0 0}</style></head><body>" +
      "<h1>Acessos à Central 26</h1><p class=\"sub\">Confidencial. Recorta e entrega cada cartão em mão. Depois de entregues, destrói esta folha.</p><div class=\"g\">" + a.resultados.filter((r) => r.password).map(cartao).join("") + "</div><script>setTimeout(()=>print(),300)<\/script></body></html>";
    const w = window.open("", "_blank");
    if (!w) { toast("O navegador bloqueou a janela. Permite janelas para esta app e tenta de novo.", true); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  async function criarTodos(a) {
    const dep = document.getElementById("lote-dep")?.value || null, cargo = document.getElementById("lote-cargo")?.value.trim() || "";
    const lista = a.linhas.filter((l) => l.criar);
    a.aCriar = true; a.feitas = 0; a.resultados = []; renderPainel(true);
    for (const l of lista) {
      try { const r = await api.empregados("criar", { nome: l.nome, email: l.email, cargo, departamento_id: dep, papel: "colaborador" }); a.resultados.push({ ...l, cargo, password: r.password }); }
      catch (e) { a.resultados.push({ ...l, cargo, erro: /already|registered|existe|duplicate/i.test(e.message) ? "Este email já tem conta" : e.message }); }
      a.feitas++; if (S.aberto === a) renderPainel(true);
    }
    a.passo = "feito"; a.aCriar = false; renderPainel(true); recarregar();
  }

  function clique(acao, el) {
    const a = S.aberto?.tipo === "lote" ? S.aberto : null;
    switch (acao) {
      case "lote-abrir": abrirLote(); return true;
      case "lote-ler": if (a) { a.texto = document.getElementById("lote-txt").value; a.dep = document.getElementById("lote-dep").value; a.cargo = document.getElementById("lote-cargo").value; cruzar(a);
        if (!a.linhas.length) toast("Não encontrei linhas com nome e email.", true); renderPainel(true); } return true;
      case "lote-criar": if (a && !a.aCriar) criarTodos(a); return true;
      case "lote-imprimir": if (a) imprimir(a); return true;
      case "lote-copiar": if (a) { const t = a.resultados.filter((r) => r.password).map((r) => r.nome + " · " + r.email + " · " + r.password).join("\n");
        (navigator.clipboard?.writeText(t) || Promise.reject()).then(() => toast("Lista copiada")).catch(() => toast("Não foi possível copiar.", true)); } return true;
    }
    return false;
  }
  function mudar(e) {
    const a = S.aberto?.tipo === "lote" ? S.aberto : null;
    if (a && e.target.dataset?.loteI != null) { a.linhas[+e.target.dataset.loteI].criar = e.target.checked; renderPainel(true); return true; }
    return false;
  }
  return { painel, clique, mudar };
}
