// Central 26 — chat interno: canal Geral, canais de departamento e conversas diretas.
import { MES_L, DIA, ymd, normalizar, iniciais } from "./dados.js";

const hora = (ts) => new Date(ts).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
function rotuloDia(ts) {
  const d = new Date(ts), hoje = new Date(), ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
  if (ymd(d) === ymd(hoje)) return "Hoje";
  if (ymd(d) === ymd(ontem)) return "Ontem";
  return DIA[d.getDay()].replace(/^./, (x) => x.toUpperCase()) + ", " + d.getDate() + " de " + MES_L[d.getMonth()] + (d.getFullYear() !== hoje.getFullYear() ? " de " + d.getFullYear() : "");
}
function quando(ts) {
  if (!ts) return "";
  const d = new Date(ts), hoje = new Date();
  if (ymd(d) === ymd(hoje)) return hora(ts);
  const diff = (hoje - d) / 864e5;
  if (diff < 6) return DIA[d.getDay()].slice(0, 3);
  return d.getDate() + "/" + String(d.getMonth() + 1).padStart(2, "0");
}

export function criarChat(ctx) {
  const { S, api, esc, I, toast, falha, render, agendarRender, nomeDe, ativos, av, $ } = ctx;
  const C = (S.chat = { estado: "por-carregar", resumo: [], ativo: null, msgs: {}, temMais: {}, rascunho: {}, editar: null, nova: false, filtroNova: "", sugestoes: [] });
  let desligar = null, lerT = null;
  // apagar mensagem espera 6 s por «Anular»; se a app fechar antes, apaga logo
  const pendentes = new Set();
  const confirmarTudo = () => [...pendentes].forEach((f) => f());
  window.addEventListener("pagehide", confirmarTudo);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") confirmarTudo(); });

  /* ---------- dados ---------- */
  async function carregar() {
    if (C.estado === "a-carregar") return;
    C.estado = "a-carregar";
    try {
      C.resumo = await api.chat.resumo();
      C.estado = "pronto";
      if (!desligar) desligar = api.chat.subscrever(aoMudar);
    } catch (e) {
      C.estado = /PGRST202|PGRST205|chat_resumo|Could not find/i.test(String(e?.message)) ? "falta-script" : "erro";
      C.erro = e.message;
    }
    agendarRender();
  }
  const canal = (id) => C.resumo.find((c) => c.canal_id === id);
  const naoLidas = () => C.resumo.reduce((s, c) => s + (c.por_ler || 0), 0);
  const nomeCanal = (c) => (!c ? "Conversa" : c.tipo === "direto" ? nomeDe(c.outro_id) || "Conversa" : c.tipo === "geral" ? "Geral" : c.nome);

  async function abrirCanal(id) {
    C.ativo = id; C.editar = null; C.nova = false;
    if (!C.msgs[id]) {
      C.msgs[id] = null; render();
      try { const l = await api.chat.mensagens(id); C.msgs[id] = l; C.temMais[id] = l.length >= 60; }
      catch (e) { C.msgs[id] = []; falha(e); }
    }
    render(); descer(); marcarLido(id);
    setTimeout(() => $("#chat-input")?.focus(), 0);
  }
  function marcarLido(id) {
    const c = canal(id);
    if (c && c.por_ler) { c.por_ler = 0; agendarRender(); }
    S.notifs.forEach((n) => { if (n.link === "#chat-" + id) n.lida = true; });
    clearTimeout(lerT); lerT = setTimeout(() => api.chat.marcarLido(id).catch(() => {}), 400);
  }
  function descer() { requestAnimationFrame(() => { const el = $("#chat-msgs"); if (el) el.scrollTop = el.scrollHeight; }); }
  const visivel = () => document.visibilityState === "visible" && (S.rota === "chat");

  function aoMudar(tabela, ev, novo) {
    if (tabela === "chat_canais") { if (!canal(novo.id)) api.chat.resumo().then((r) => { C.resumo = r; agendarRender(); }).catch(() => {}); return; }
    if (tabela !== "chat_mensagens") return;
    const lista = C.msgs[novo.canal_id];
    if (ev === "INSERT") {
      if (lista && !lista.some((m) => m.id === novo.id)) lista.push(novo);
      const c = canal(novo.canal_id);
      if (!c) { api.chat.resumo().then((r) => { C.resumo = r; agendarRender(); }).catch(() => {}); return; }
      c.ultima_em = novo.criado_em; c.ultima_texto = novo.texto.slice(0, 140); c.ultimo_autor = novo.autor_id;
      if (novo.autor_id !== S.eu.id) {
        if (C.ativo === novo.canal_id && visivel()) marcarLido(novo.canal_id);
        else c.por_ler = (c.por_ler || 0) + 1;
      }
      const el = $("#chat-msgs"), noFundo = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      agendarRender();
      if (C.ativo === novo.canal_id && (noFundo || novo.autor_id === S.eu.id)) descer();
    } else if (ev === "UPDATE" && lista) {
      const i = lista.findIndex((m) => m.id === novo.id);
      if (i >= 0) { lista[i] = novo; agendarRender(); }
    }
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.rota === "chat" && C.ativo) marcarLido(C.ativo); });

  /* ---------- texto ---------- */
  function formatar(t) {
    let h = esc(t);
    h = h.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    h = h.replace(/#(tarefa|cliente|agenda)-([0-9a-f-]{8,})/g, '<a href="#$1-$2">abrir $1</a>');
    for (const p of ativos()) {
      const re = new RegExp("@(" + p.nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "|" + p.nome.split(" ")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")(?![\\p{L}])", "giu");
      h = h.replace(re, '<span class="mencao' + (p.id === S.eu.id ? " eu" : "") + '">@$1</span>');
    }
    return h.replace(/\n/g, "<br>");
  }
  function mencoesDe(texto, c) {
    const t = normalizar(texto), out = new Set(), pessoas = ativos().filter((p) => p.id !== S.eu.id);
    const primeiros = {};
    pessoas.forEach((p) => { const k = normalizar(p.nome.split(" ")[0]); primeiros[k] = (primeiros[k] || 0) + 1; });
    for (const p of pessoas) {
      const completo = normalizar(p.nome), primeiro = normalizar(p.nome.split(" ")[0]);
      if (t.includes("@" + completo) || (primeiros[primeiro] === 1 && new RegExp("@" + primeiro + "(?![a-z])").test(t))) out.add(p.id);
    }
    if (c?.tipo === "departamento") for (const id of [...out]) { const p = S.perfis[id]; if (!(p.papel === "ceo" || p.papel === "admin" || p.departamento_id === c.departamento_id)) out.delete(id); }
    return [...out];
  }

  /* ---------- vista ---------- */
  function vista() {
    if (C.estado === "por-carregar") carregar();
    if (C.estado === "falta-script") return '<div class="cab"><div><h1>Mensagens</h1></div></div><div class="vazio"><h3>Falta instalar o chat na base de dados</h3><p>No Supabase, abre o SQL Editor, cola o ficheiro <b>supabase/04-chat-agenda.sql</b> do GitHub e carrega em Run. Depois recarrega esta página.</p></div>';
    if (C.estado === "erro") return '<div class="cab"><div><h1>Mensagens</h1></div></div><div class="aviso erro">Não foi possível abrir o chat: ' + esc(C.erro || "") + "</div>";
    if (C.estado !== "pronto") return '<div class="cab"><div><h1>Mensagens</h1></div></div><div class="tabela">' + [1, 2, 3].map(() => '<div class="esqueleto"><i style="width:40%"></i></div>').join("") + "</div>";
    if (S.param && S.param !== C.ativo && canal(S.param)) { const id = S.param; setTimeout(() => abrirCanal(id), 0); }
    const aberto = C.ativo && canal(C.ativo);
    return '<div class="chat' + (aberto ? " com-conversa" : "") + '">' + lista() + (aberto ? conversa(canal(C.ativo)) : '<section class="chat-vazio"><div><h2>Mensagens</h2><p>Escolhe uma conversa à esquerda ou começa uma nova.</p></div></section>') + "</div>";
  }

  function lista() {
    const canais = C.resumo.filter((c) => c.tipo !== "direto").sort((a, b) => (a.tipo === "geral" ? -1 : b.tipo === "geral" ? 1 : a.nome.localeCompare(b.nome, "pt")));
    const diretas = C.resumo.filter((c) => c.tipo === "direto").sort((a, b) => String(b.ultima_em || "").localeCompare(String(a.ultima_em || "")));
    const item = (c) => {
      const nome = nomeCanal(c), pre = c.ultima_texto ? (c.ultimo_autor === S.eu.id ? "Tu: " : c.tipo !== "direto" && c.ultimo_autor ? nomeDe(c.ultimo_autor).split(" ")[0] + ": " : "") + c.ultima_texto : "Sem mensagens";
      return '<button class="conv' + (C.ativo === c.canal_id ? " on" : "") + (c.por_ler ? " por-ler" : "") + '" data-acao="chat-abrir" data-id="' + c.canal_id + '">' +
        (c.tipo === "direto" ? av(c.outro_id) : '<span class="av canal" aria-hidden="true">#</span>') +
        '<span class="conv-t"><span class="conv-n">' + esc(nome) + "</span><small>" + esc(pre) + '</small></span><span class="conv-m"><small>' + quando(c.ultima_em) + "</small>" + (c.por_ler ? '<b class="ct">' + (c.por_ler > 99 ? "99+" : c.por_ler) + "</b>" : "") + "</span></button>";
    };
    let h = '<aside class="chat-lista"><div class="chat-lista-cab"><h1>Mensagens</h1><button class="btn sec" data-acao="chat-nova">' + I.plus + "Nova conversa</button></div>";
    if (C.nova) {
      const q = normalizar(C.filtroNova);
      const pessoas = ativos().filter((p) => p.id !== S.eu.id && (!q || normalizar(p.nome).includes(q)));
      h += '<div class="chat-nova"><label class="pesq">' + I.lupa + '<span class="sr">Procurar pessoa</span><input id="chat-pessoa" placeholder="Com quem queres falar?" value="' + esc(C.filtroNova) + '" autocomplete="off"></label>' +
        pessoas.map((p) => '<button class="conv" data-acao="chat-direto" data-id="' + p.id + '">' + av(p.id) + '<span class="conv-t"><span class="conv-n">' + esc(p.nome) + "</span><small>" + esc(p.cargo || "") + "</small></span></button>").join("") +
        '<button class="btn sec" data-acao="chat-nova-fechar">Cancelar</button></div>';
    }
    h += '<div class="chat-sec">Canais</div>' + canais.map(item).join("");
    h += '<div class="chat-sec">Mensagens diretas</div>' + (diretas.length ? diretas.map(item).join("") : '<p class="muted chat-dica">Ainda sem conversas diretas.</p>');
    return h + "</aside>";
  }

  function conversa(c) {
    const msgs = C.msgs[c.canal_id];
    const sub = c.tipo === "direto" ? esc(S.perfis[c.outro_id]?.cargo || "") : c.tipo === "geral" ? "Toda a equipa" : "Departamento " + esc(c.nome) + " e direção";
    let h = '<section class="chat-conv"><header class="chat-cab"><button class="ib chat-voltar" data-acao="chat-voltar" aria-label="Voltar às conversas">' + I.seta + '</button>' +
      (c.tipo === "direto" ? av(c.outro_id) : '<span class="av canal" aria-hidden="true">#</span>') + '<span><b>' + esc(nomeCanal(c)) + "</b><small>" + sub + "</small></span></header>";
    h += '<div class="chat-msgs" id="chat-msgs" role="log" aria-live="polite">';
    if (msgs === null || msgs === undefined) h += '<p class="muted chat-dica">A carregar…</p>';
    else {
      if (C.temMais[c.canal_id]) h += '<button class="btn sec chat-antes" data-acao="chat-antes">Mostrar mensagens anteriores</button>';
      if (!msgs.length) h += '<p class="muted chat-dica">' + (c.tipo === "direto" ? "Escreve a primeira mensagem a " + esc(nomeCanal(c).split(" ")[0]) + "." : "Ainda não há mensagens neste canal.") + "</p>";
      let diaAnt = "", ant = null;
      for (const m of msgs) {
        const dia = ymd(new Date(m.criado_em));
        if (dia !== diaAnt) { h += '<div class="chat-dia"><span>' + rotuloDia(m.criado_em) + "</span></div>"; diaAnt = dia; ant = null; }
        const junta = ant && ant.autor_id === m.autor_id && new Date(m.criado_em) - new Date(ant.criado_em) < 5 * 60000;
        const meu = m.autor_id === S.eu.id;
        h += '<div class="msg' + (junta ? " junta" : "") + (meu ? " minha" : "") + '" data-id="' + m.id + '">' + (junta ? '<span class="msg-h">' + hora(m.criado_em) + "</span>" : av(m.autor_id)) +
          '<div class="msg-c">' + (junta ? "" : '<div class="msg-cab"><b>' + esc(nomeDe(m.autor_id) || "Alguém") + "</b><small>" + hora(m.criado_em) + "</small></div>");
        if (C.editar === m.id) h += '<form id="form-editar-msg" data-id="' + m.id + '"><textarea id="chat-editar" class="chat-ta" rows="2">' + esc(m.texto) + '</textarea><div class="acts"><button class="btn pri" type="submit">Guardar</button><button class="btn sec" type="button" data-acao="chat-editar-cancelar">Cancelar</button></div></form>';
        else if (m.apagado) h += '<p class="msg-t apagada">Mensagem apagada</p>';
        else h += '<p class="msg-t">' + formatar(m.texto) + (m.editado_em ? ' <small class="muted">(editada)</small>' : "") + "</p>";
        h += "</div>" + (meu && !m.apagado && C.editar !== m.id ? '<span class="msg-acts"><button class="ib" data-acao="chat-editar" data-id="' + m.id + '" aria-label="Editar mensagem">Editar</button><button class="ib perigo" data-acao="chat-apagar" data-id="' + m.id + '" aria-label="Apagar mensagem">' + I.lixo + "</button></span>" : "") + "</div>";
        ant = m;
      }
    }
    h += "</div>";
    const sug = C.sugestoes.length ? '<div class="sugestoes" role="listbox">' + C.sugestoes.map((p, i) => '<button role="option" data-acao="chat-mencao" data-id="' + p.id + '"' + (i === 0 ? ' class="on"' : "") + ">" + av(p.id) + esc(p.nome) + "</button>").join("") + "</div>" : "";
    h += '<form class="chat-escrever" id="form-chat" data-canal="' + c.canal_id + '">' + sug + '<label class="sr" for="chat-input">Mensagem</label><textarea id="chat-input" class="chat-ta" rows="1" placeholder="Mensagem · @ para mencionar" enterkeyhint="send">' + esc(C.rascunho[c.canal_id] || "") + '</textarea><button class="btn pri" type="submit" aria-label="Enviar">Enviar</button></form>';
    return h + "</section>";
  }

  /* ---------- ações ---------- */
  async function enviar(f) {
    const id = f.dataset.canal, ta = $("#chat-input"), texto = (ta?.value || "").trim();
    if (!texto) return;
    const c = canal(id);
    C.rascunho[id] = ""; C.sugestoes = []; ta.value = ""; autoAltura(ta);
    try {
      const m = await api.chat.enviar(id, texto, mencoesDe(texto, c));
      const l = C.msgs[id] || (C.msgs[id] = []);
      if (!l.some((x) => x.id === m.id)) l.push(m);
      if (c) { c.ultima_em = m.criado_em; c.ultima_texto = m.texto.slice(0, 140); c.ultimo_autor = S.eu.id; }
      render(); descer(); $("#chat-input")?.focus();
    } catch (e) { C.rascunho[id] = texto; render(); falha(e); }
  }
  function autoAltura(ta) { if (!ta) return; ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 160) + "px"; }
  function atualizarSugestoes(ta) {
    const ate = ta.value.slice(0, ta.selectionStart), m = ate.match(/@([\p{L}]*)$/u);
    const antes = C.sugestoes.length;
    if (!m) C.sugestoes = [];
    else {
      const q = normalizar(m[1]);
      C.sugestoes = ativos().filter((p) => p.id !== S.eu.id && normalizar(p.nome).split(" ").some((w) => w.startsWith(q))).slice(0, 6);
    }
    if (antes || C.sugestoes.length) { const pos = ta.selectionStart; render(); const n = $("#chat-input"); if (n) { n.focus(); n.setSelectionRange(pos, pos); autoAltura(n); } }
  }
  function inserirMencao(pid) {
    const ta = $("#chat-input"); if (!ta) return;
    const p = S.perfis[pid], pos = ta.selectionStart, ate = ta.value.slice(0, pos).replace(/@[\p{L}]*$/u, "@" + p.nome + " ");
    ta.value = ate + ta.value.slice(pos); C.rascunho[C.ativo] = ta.value; C.sugestoes = [];
    render(); const n = $("#chat-input"); if (n) { n.focus(); n.setSelectionRange(ate.length, ate.length); autoAltura(n); }
  }

  function clique(acao, el) {
    const id = el.dataset.id;
    switch (acao) {
      case "chat-abrir": history.replaceState(null, "", "#chat-" + id); S.param = id; abrirCanal(id); return true;
      case "chat-voltar": C.ativo = null; history.replaceState(null, "", "#chat"); S.param = null; render(); return true;
      case "chat-nova": C.nova = !C.nova; C.filtroNova = ""; render(); setTimeout(() => $("#chat-pessoa")?.focus(), 0); return true;
      case "chat-nova-fechar": C.nova = false; render(); return true;
      case "chat-direto": abrirDireto(id); return true;
      case "chat-antes": antes(); return true;
      case "chat-editar": C.editar = +id; render(); setTimeout(() => { const t = $("#chat-editar"); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 0); return true;
      case "chat-editar-cancelar": C.editar = null; render(); return true;
      case "chat-apagar": apagar(+id); return true;
      case "chat-mencao": inserirMencao(id); return true;
    }
    return false;
  }
  async function abrirDireto(pessoa) {
    try {
      const id = await api.chat.direto(pessoa);
      if (!canal(id)) C.resumo = await api.chat.resumo();
      C.nova = false; location.hash = "chat-" + id;
    } catch (e) { falha(e); }
  }
  async function antes() {
    const id = C.ativo, l = C.msgs[id]; if (!l?.length) return;
    const el = $("#chat-msgs"), alt = el?.scrollHeight || 0;
    try {
      const mais = await api.chat.mensagens(id, l[0].criado_em);
      C.msgs[id] = mais.concat(l); C.temMais[id] = mais.length >= 60; render();
      requestAnimationFrame(() => { const e2 = $("#chat-msgs"); if (e2) e2.scrollTop = e2.scrollHeight - alt; });
    } catch (e) { falha(e); }
  }
  async function apagar(mid) {
    const l = C.msgs[C.ativo], m = l?.find((x) => x.id === mid); if (!m) return;
    const antesM = { ...m };
    Object.assign(m, { apagado: true, texto: "" }); render();
    const executar = async () => {
      pendentes.delete(executar); clearTimeout(t);
      try { const r = await api.chat.atualizar(mid, { apagado: true }); Object.assign(m, r); agendarRender(); }
      catch (e) { Object.assign(m, antesM); render(); falha(e); }
    };
    pendentes.add(executar);
    const t = setTimeout(executar, 6000);
    toast("Mensagem apagada", { acao: { rotulo: "Anular", fn: () => { pendentes.delete(executar); clearTimeout(t); Object.assign(m, antesM); render(); toast("Mensagem reposta"); } }, ms: 6000 });
  }
  async function submeter(f) {
    if (f.id === "form-chat") { await enviar(f); return true; }
    if (f.id === "form-editar-msg") {
      const mid = +f.dataset.id, texto = $("#chat-editar").value.trim(), l = C.msgs[C.ativo], m = l?.find((x) => x.id === mid);
      if (!texto) { toast("A mensagem não pode ficar vazia. Para a tirar, usa Apagar.", true); return true; }
      C.editar = null;
      if (m && texto !== m.texto) {
        const antesT = m.texto; m.texto = texto; m.editado_em = new Date().toISOString(); render();
        try { const r = await api.chat.atualizar(mid, { texto }); Object.assign(m, r); render(); } catch (e) { m.texto = antesT; render(); falha(e); }
      } else render();
      return true;
    }
    return false;
  }
  function escrever(e) {
    const t = e.target;
    if (t.id === "chat-input") { C.rascunho[C.ativo] = t.value; autoAltura(t); atualizarSugestoes(t); return true; }
    if (t.id === "chat-pessoa") { C.filtroNova = t.value; const pos = t.selectionStart; render(); const n = $("#chat-pessoa"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } return true; }
    return false;
  }
  function tecla(e) {
    const t = e.target;
    if (t.id === "chat-input" && e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (C.sugestoes.length) inserirMencao(C.sugestoes[0].id);
      else $("#form-chat")?.requestSubmit();
      return true;
    }
    if (t.id === "chat-input" && e.key === "Escape" && C.sugestoes.length) { C.sugestoes = []; render(); $("#chat-input")?.focus(); return true; }
    if (t.id === "chat-editar" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#form-editar-msg")?.requestSubmit(); return true; }
    if (t.id === "chat-editar" && e.key === "Escape") { C.editar = null; render(); return true; }
    return false;
  }
  function aoEntrarNaRota(param) {
    if (C.estado === "pronto" && param && canal(param)) abrirCanal(param);
    else if (!param) { if (window.matchMedia("(max-width:820px)").matches) C.ativo = null; }
  }

  function reiniciar() { if (desligar) { desligar(); desligar = null; } Object.assign(C, { estado: "por-carregar", resumo: [], ativo: null, msgs: {}, temMais: {}, rascunho: {}, editar: null, nova: false, sugestoes: [] }); }
  return { vista, clique, submeter, escrever, tecla, carregar, naoLidas, aoEntrarNaRota, abrirDireto, reiniciar, estado: () => C.estado };
}
