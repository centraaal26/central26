// Central 26 — Assistente (IA): conversa com acesso ao que cada pessoa pode ver na Central.
import { eGestor, haQuanto } from "./dados.js";
import { markdown } from "./marketing.js";

const SUGESTOES = {
  marketing: ["Tive uma ideia de publicação: ajuda-me a escrever a descrição", "Sugere 5 publicações para a próxima semana da Barbearia 26 de Junho", "Escreve a legenda para a próxima publicação da TwentySix", "Que publicações estão atrasadas?"],
  comercial: ["Que clientes devo contactar esta semana?", "Escreve uma mensagem de seguimento para um cliente que deixou de comprar", "Quais são os produtos mais vendidos este ano?", "Resume os contactos que fiz com a Barbearia…"],
  logistica: ["Que encomendas estão por preparar?", "Que produtos estão a acabar no stock?", "Organiza as entregas de amanhã por zona", "Escreve uma mensagem a avisar um cliente que a encomenda vai a caminho"],
  operacional: ["Compara as propostas dos pedidos de orçamento em aberto", "Escreve um pedido de orçamento para golas pretas (500 unidades)", "Que fornecedores tenho de contactar esta semana?", "Que fornecedores temos de embalagens?"],
  tecnologico: ["Que itens P0 da auditoria estão por fechar?", "Explica como corrigir o SPF e o DMARC do 26tech.pt", "Faz o plano da próxima semana da auditoria", "Escreve uma nota para a direção sobre o estado da auditoria"],
  direcao: ["Resume como está a semana da equipa", "Que tarefas estão em atraso e de quem?", "Como correu a faturação das barbearias este ano?", "Que produtos estão a acabar no stock?"],
  administrativo: ["Resume como está a semana da equipa", "Que tarefas estão em atraso e de quem?", "O que tenho na agenda nos próximos dias?", "Compara as propostas dos pedidos de orçamento em aberto"],
};
const NOMES_FERR = { tarefas: "tarefas", equipa: "equipa", agenda: "agenda", clientes: "clientes", vendas: "vendas", encomendas: "encomendas", stocks: "stocks", fornecedores: "fornecedores", marketing: "marketing", auditoria: "auditoria", financeiro: "financeiro" };

export function criarAssistente(ctx) {
  const { S, api, esc, I, toast, falha, render, nomeDe, ativos, $ } = ctx;
  const A = (S.ia = { estado: "por-carregar", conversas: [], msgs: {}, ativa: null, rascunho: "", aEnviar: false, uso: [], config: null, tab: "conversa", confirmar: null });

  async function carregar() {
    if (A.estado === "a-carregar") return;
    A.estado = "a-carregar";
    try {
      if (!api.ia) throw new Error("A app foi atualizada a meio. Recarrega a página para terminar a atualização.");
      const [c, cfg, uso] = await Promise.all([api.ia.conversas(), api.ia.config().catch(() => null), api.ia.uso().catch(() => [])]);
      A.conversas = c; A.config = cfg; A.uso = uso; A.estado = "pronto";
    } catch (e) { A.estado = e.message === "FALTA_SCRIPT" ? "falta-script" : "erro"; A.erro = e.message; }
    render();
  }
  async function abrirConversa(id) {
    A.ativa = id || null; A.confirmar = null;
    if (id && !A.msgs[id]) { try { A.msgs[id] = await api.ia.mensagens(id); } catch (e) { falha(e); } }
    render(); descer();
  }
  const descer = () => setTimeout(() => { const l = $(".ia-msgs"); if (l) l.scrollTop = l.scrollHeight; }, 0);
  const mes = () => new Date().toISOString().slice(0, 7);
  const usoMeu = () => A.uso.find((u) => u.perfil_id === S.eu.id && u.mes === mes())?.pedidos || 0;

  async function enviar(texto) {
    texto = (texto || "").trim();
    if (!texto || A.aEnviar) return;
    const id = A.ativa;
    A.aEnviar = true; A.rascunho = "";
    const temp = { id: "t" + Date.now(), papel: "user", texto, criado_em: new Date().toISOString() };
    const chave = id || "nova";
    A.msgs[chave] = (A.msgs[chave] || []).concat([temp]);
    render(); descer();
    try {
      const r = await api.ia.enviar(id, texto);
      const lista = (A.msgs[chave] || []).concat([{ id: r.id || "r" + Date.now(), papel: "assistant", texto: r.resposta, ferramentas: r.ferramentas || [], criado_em: r.criado_em || new Date().toISOString() }]);
      if (!id) { delete A.msgs.nova; A.conversas = await api.ia.conversas().catch(() => A.conversas); }
      else { const c = A.conversas.find((x) => x.id === id); if (c) { c.atualizado_em = new Date().toISOString(); A.conversas.sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em)); } }
      A.msgs[r.conversa_id] = lista; A.ativa = r.conversa_id;
      const u = A.uso.find((x) => x.perfil_id === S.eu.id && x.mes === mes()); if (u) u.pedidos = r.pedidos_mes; else A.uso.push({ perfil_id: S.eu.id, mes: mes(), pedidos: r.pedidos_mes });
      A.aEnviar = false;
      if (S.rota === "assistente" && S.param !== r.conversa_id) history.replaceState(null, "", "#assistente-" + r.conversa_id), (S.param = r.conversa_id);
      render(); descer();
    } catch (e) {
      A.msgs[chave] = (A.msgs[chave] || []).filter((m) => m !== temp); A.rascunho = texto; A.aEnviar = false; render(); falha(e);
    }
  }

  /* ============================== Vista ============================== */
  function vista(param) {
    if (A.estado === "por-carregar") carregar();
    if (param !== A.ultimoParam) {
      A.ultimoParam = param;
      if (param === "uso") A.tab = "uso";
      else { A.tab = "conversa"; if (param && param !== "nova" && param !== A.ativa) abrirConversa(param); else if (!param || param === "nova") A.ativa = null; }
    }
    if (S.iaPre) { A.rascunho = S.iaPre; S.iaPre = null; A.ativa = null; setTimeout(() => { const t = $("#ia-input"); if (t) { t.focus(); autoAltura(t); } }, 50); }
    const g = eGestor(S.eu);
    if (A.estado === "falta-script") return cab(g) + '<div class="vazio"><h3>Falta instalar o assistente</h3><p>No Supabase, corre o ficheiro <b>supabase/14-assistente.sql</b> e instala a função <b>assistente</b> (README, passo 3n).</p></div>';
    if (A.estado === "erro") return cab(g) + '<div class="aviso erro">Não foi possível abrir o assistente: ' + esc(A.erro || "") + "</div>";
    if (A.estado !== "pronto") return cab(g) + '<div class="tabela"><div class="esqueleto"><i style="width:50%"></i></div></div>';
    if (A.tab === "uso" && g) return cab(g) + vistaUso();
    return '<div class="ia-wrap' + (A.ativa || (A.msgs.nova || []).length || A.rascunho || param === "nova" || !A.conversas.length ? " com-conversa" : "") + '">' + lista(g) + conversa() + "</div>";
  }
  function cab(g) {
    return '<div class="cab"><div><div class="eyebrow neutro">Inteligência artificial</div><h1>Assistente</h1></div></div>' +
      (g ? '<div class="tabs" role="tablist"><button class="tab" role="tab" data-acao="ia-tab" data-tab="conversa" aria-selected="' + (A.tab === "conversa") + '">Conversas</button><button class="tab" role="tab" data-acao="ia-tab" data-tab="uso" aria-selected="' + (A.tab === "uso") + '">Utilização</button></div>' : "");
  }
  function lista(g) {
    let h = '<aside class="ia-lista"><div class="ia-lista-cab"><h1>Assistente</h1><button class="btn-mais" data-acao="ia-nova" aria-label="Nova conversa" title="Nova conversa">' + I.plus + "</button></div>";
    if (A.config && !A.config.ativo) h += '<div class="aviso">O assistente está desligado pela direção.</div>';
    h += A.conversas.length ? '<div class="ia-convs">' + A.conversas.map((c) => '<div class="ia-conv' + (c.id === A.ativa ? " on" : "") + '"><a href="#assistente-' + c.id + '"><b>' + esc(c.titulo) + "</b><small>" + esc(haQuanto(c.atualizado_em)) + "</small></a>" +
      (A.confirmar === c.id ? '<span class="acts"><button class="ib" data-acao="ia-apagar-nao">Manter</button><button class="ib perigo" data-acao="ia-apagar-sim" data-id="' + c.id + '">Apagar</button></span>' : '<button class="ib x" data-acao="ia-apagar" data-id="' + c.id + '" aria-label="Apagar conversa">' + I.lixo + "</button>") + "</div>").join("") + "</div>"
      : '<p class="muted ia-dica">As tuas conversas aparecem aqui. Só tu as vês.</p>';
    const lim = A.config?.limite_mensal;
    h += '<div class="ia-pe">' + (lim ? '<span class="barra-p"><i style="width:' + Math.min(100, (usoMeu() / lim) * 100).toFixed(0) + '%"></i></span><small>' + usoMeu() + " de " + lim + " pedidos este mês</small>" : "") +
      (g ? '<a class="c-link" href="#assistente-uso">Utilização da equipa</a>' : "") + "</div>";
    return h + "</aside>";
  }
  function bolha(m) {
    if (m.papel === "user") return '<div class="ia-msg eu"><div class="ia-b">' + esc(m.texto).replace(/\n/g, "<br>") + "</div></div>";
    const fs = (m.ferramentas || []).map((f) => NOMES_FERR[f] || f);
    return '<div class="ia-msg ia"><span class="ia-av" aria-hidden="true">' + I.ia + '</span><div class="ia-b"><div class="md">' + markdown(m.texto, esc) + "</div>" +
      '<div class="ia-b-pe">' + (fs.length ? '<small class="muted">Consultou: ' + esc(fs.join(", ")) + "</small>" : "") + '<button class="ib" data-acao="ia-copiar" data-id="' + esc(String(m.id)) + '">' + I.copiar + "Copiar</button></div></div></div>";
  }
  function conversa() {
    const msgs = A.msgs[A.ativa || "nova"] || [];
    const conv = A.conversas.find((c) => c.id === A.ativa);
    let h = '<section class="ia-conversa">';
    h += '<header class="ia-cab"><button class="ib ia-voltar" data-acao="ia-voltar" aria-label="Voltar às conversas">' + I.seta + '</button><span class="ia-av" aria-hidden="true">' + I.ia + "</span><span><b>" + esc(conv?.titulo || "Nova conversa") + '</b><small>Vê o mesmo que tu vês na Central · as conversas são privadas</small></span></header>';
    h += '<div class="ia-msgs">';
    if (!msgs.length) {
      const sug = SUGESTOES[S.eu.departamento_id] || SUGESTOES.direcao;
      h += '<div class="ia-vazio"><span class="ia-av grande" aria-hidden="true">' + I.ia + "</span><h2>Olá, " + esc(S.eu.nome.split(" ")[0]) + '</h2><p>Pergunta o que quiseres sobre o teu trabalho ou pede ajuda para escrever: descrições, legendas, emails, resumos. Uso os dados da Central a que tens acesso.</p><div class="ia-sug">' +
        sug.map((x) => '<button class="ia-chip" data-acao="ia-sugestao" data-v="' + esc(x) + '">' + esc(x) + "</button>").join("") + "</div></div>";
    } else h += msgs.map(bolha).join("");
    if (A.aEnviar) h += '<div class="ia-msg ia"><span class="ia-av" aria-hidden="true">' + I.ia + '</span><div class="ia-b ia-pensar"><i></i><i></i><i></i><span>A consultar a Central…</span></div></div>';
    h += "</div>";
    h += '<form class="chat-escrever ia-escrever" id="form-ia"><label class="sr" for="ia-input">Mensagem para o assistente</label><textarea id="ia-input" class="chat-ta" rows="1" placeholder="Escreve aqui o que precisas…" enterkeyhint="send"' + (A.aEnviar ? " disabled" : "") + ">" + esc(A.rascunho) + "</textarea>" +
      '<button class="btn pri btn-redondo" type="submit" aria-label="Enviar"' + (A.aEnviar ? " disabled" : "") + ">" + I.enviar + "</button></form>";
    return h + "</section>";
  }
  function vistaUso() {
    const m = mes(), cfg = A.config || { ativo: true, limite_mensal: 400 };
    const doMes = A.uso.filter((u) => u.mes === m), total = doMes.reduce((x, u) => x + u.pedidos, 0);
    const linhas = ativos().map((p) => ({ p, u: doMes.find((u) => u.perfil_id === p.id) })).sort((a, b) => (b.u?.pedidos || 0) - (a.u?.pedidos || 0));
    return '<section class="cartao-sec"><h3>Definições</h3><div class="prefs"><label class="interruptor"><input type="checkbox" id="ia-ativo"' + (cfg.ativo ? " checked" : "") + '><span class="int-t"></span>Assistente ligado para toda a equipa</label></div>' +
      '<div class="campos-3"><div class="campo"><label for="ia-limite">Limite por pessoa (pedidos por mês)</label><input id="ia-limite" type="number" min="0" max="100000" step="10" value="' + cfg.limite_mensal + '"></div></div>' +
      '<div class="acts"><button class="btn pri" data-acao="ia-guardar-config">Guardar</button></div><p class="nota-tab">Com a versão gratuita (Groq) há um limite diário para toda a equipa: quando acaba, volta a funcionar no dia seguinte. Com a versão paga (Claude), o custo depende do uso e o teto de gasto define-se na consola da Anthropic. As conversas são privadas: aqui só aparece quantos pedidos cada pessoa fez.</p></section>' +
      '<section class="cartao-sec"><h3>Este mês <span class="mono muted">' + total + " pedidos</span></h3>" + '<div class="ia-uso">' + linhas.map(({ p, u }) => '<div class="ia-uso-l">' + ctx.av(p.id) + "<span>" + esc(p.nome) + '</span><span class="barra-p"><i style="width:' + Math.min(100, ((u?.pedidos || 0) / Math.max(1, cfg.limite_mensal)) * 100).toFixed(0) + '%"></i></span><b class="mono">' + (u?.pedidos || 0) + "</b></div>").join("") + "</div></section>";
  }

  /* ============================== Ações ============================== */
  const autoAltura = (t) => { t.style.height = "auto"; t.style.height = Math.min(220, t.scrollHeight) + "px"; };
  function clique(acao, el) {
    switch (acao) {
      case "ia-nova": A.ativa = null; delete A.msgs.nova; A.rascunho = ""; A.novaAberta = true; if (S.param !== "nova") location.hash = "assistente-nova"; else render(); setTimeout(() => $("#ia-input")?.focus(), 50); return true;
      case "ia-voltar": A.ativa = null; A.rascunho = ""; delete A.msgs.nova; location.hash = "assistente"; return true;
      case "ia-sugestao": { const v = el.dataset.v; if (v.endsWith("…") || /ideia|legenda|mensagem de seguimento|pedido de orçamento para/i.test(v)) { A.rascunho = v.replace(/…$/, "") + (v.endsWith("…") ? "" : ": "); render(); const t = $("#ia-input"); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); autoAltura(t); } } else enviar(v); return true; }
      case "ia-copiar": { const m = (A.msgs[A.ativa] || []).find((x) => String(x.id) === el.dataset.id); if (m) navigator.clipboard?.writeText(m.texto).then(() => toast("Texto copiado")).catch(() => toast("Não foi possível copiar.", true)); return true; }
      case "ia-apagar": A.confirmar = el.dataset.id; render(); return true;
      case "ia-apagar-nao": A.confirmar = null; render(); return true;
      case "ia-apagar-sim": { const id = el.dataset.id; api.ia.apagar(id).then(() => { A.conversas = A.conversas.filter((c) => c.id !== id); delete A.msgs[id]; A.confirmar = null; if (A.ativa === id) { A.ativa = null; location.hash = "assistente"; } else render(); toast("Conversa apagada"); }).catch(falha); return true; }
      case "ia-tab": location.hash = el.dataset.tab === "uso" ? "assistente-uso" : "assistente"; return true;
      case "ia-guardar-config": {
        const lim = Math.max(0, Math.round(+$("#ia-limite").value || 0));
        api.ia.guardarConfig({ ativo: $("#ia-ativo").checked, limite_mensal: lim }).then((c) => { A.config = c; render(); toast("Definições do assistente guardadas"); }).catch(falha);
        return true;
      }
    }
    return false;
  }
  function escrever(e) {
    const t = e.target;
    if (t.id === "ia-input") { A.rascunho = t.value; autoAltura(t); return true; }
    return false;
  }
  function tecla(e) {
    const t = e.target;
    if (t.id === "ia-input" && e.key === "Enter" && !e.shiftKey && !e.isComposing && window.matchMedia("(hover:hover)").matches) { e.preventDefault(); enviar(t.value); return true; }
    return false;
  }
  async function submeter(f) { if (f.id !== "form-ia") return false; enviar($("#ia-input")?.value); return true; }
  function reiniciar() { Object.assign(A, { estado: "por-carregar", conversas: [], msgs: {}, ativa: null, rascunho: "", aEnviar: false, uso: [], config: null }); }

  return { vista, clique, escrever, tecla, submeter, carregar, reiniciar, estado: () => A.estado };
}

// Texto pronto a enviar ao assistente a partir de outros ecrãs (publicação, tarefa…)
export function pedidoPublicacao(p, marcaNome) {
  return "Ajuda-me com esta publicação de " + marcaNome + ":\n- Título: " + p.titulo + (p.data ? "\n- Data: " + p.data.split("-").reverse().join("/") : "") + (p.tipo ? "\n- Tipo: " + p.tipo : "") +
    (p.plataformas?.length ? "\n- Plataformas: " + p.plataformas.join(", ") : "") + (p.notas ? "\n- Ideia/notas: " + p.notas : "") + (p.copy ? "\n- Texto atual: " + p.copy : "") +
    "\n\nEscreve uma descrição clara da ideia e uma legenda pronta a publicar, com hashtags.";
}
export function pedidoTarefa(t, marcaNome) {
  return "Ajuda-me com esta tarefa (" + marcaNome + "):\n- " + t.titulo + (t.prazo ? "\n- Prazo: " + t.prazo.split("-").reverse().join("/") : "") + (t.notas ? "\n- Notas: " + t.notas : "") +
    "\n\nDiz-me por onde começar e divide-a em passos concretos.";
}
