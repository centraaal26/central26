// Central 26 — comentários e histórico dentro das fichas, Reciclagem, avisos (sossego e resumo) e cópias automáticas.
import { rotuloCampo } from "./offline.js";

// Que painel corresponde a que tabela da base de dados
export const TIPO_TABELA = {
  tarefa: "tarefas", cliente: "crm_clientes", encomenda: "log_encomendas", evento: "agenda_eventos", fornecedor: "op_fornecedores",
  pedido: "op_pedidos", publicacao: "mk_publicacoes", stock: "stk_produtos", prazo: "prz_prazos", viatura: "prz_viaturas",
  formacao: "aca_formacoes", formando: "aca_formandos",
};
const NOME_TABELA = {
  tarefas: "Tarefa", crm_clientes: "Cliente", crm_contactos: "Contacto do cliente", agenda_eventos: "Evento", log_encomendas: "Encomenda", log_rotas: "Rota",
  op_fornecedores: "Fornecedor", op_pedidos: "Pedido de orçamento", mk_publicacoes: "Publicação", stk_produtos: "Produto", prz_prazos: "Prazo", prz_viaturas: "Viatura",
  aca_formacoes: "Formação da Academy", aca_formandos: "Formando da Academy",
};
const PRIORIDADE_LOTE = ["crm_clientes", "log_encomendas", "tarefas", "agenda_eventos", "op_fornecedores", "op_pedidos", "mk_publicacoes", "stk_produtos", "prz_viaturas", "prz_prazos", "log_rotas", "crm_contactos", "aca_formacoes", "aca_formandos"];
const VALORES = {
  estado: { por_fazer: "Por fazer", em_curso: "Em curso", concluido: "Concluída", ativo: "Ativo", tratado: "Tratado", nova: "Nova", em_preparacao: "Em preparação", pronta: "Pronta", em_rota: "Em rota", entregue: "Entregue", cancelada: "Cancelada" },
  prioridade: { alta: "Alta", media: "Média", baixa: "Baixa", urgente: "Urgente", normal: "Normal" },
  etapa: { lead: "Lead", contactado: "Contactado", proposta: "Proposta", cliente: "Cliente", perdido: "Perdido" },
};

export function criarFiabilidade(ctx) {
  const { S, api, esc, I, toast, falha, nomeDe, ativos, av, $, eGestor, recarregarTabela, normalizar } = ctx;
  const F = (S.fia = { coment: {}, hist: {}, histAberto: {}, rascunho: {}, recic: null, copias: null, aEnviar: false, aRecuperar: null });
  let desligar = null;
  const k = (t, id) => t + ":" + id;

  const quando = (iso) => {
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (m < 1) return "agora mesmo";
    if (m < 60) return "há " + m + " min";
    if (m < 1440) return "há " + Math.round(m / 60) + " h";
    const d = Math.round(m / 1440);
    return d === 1 ? "ontem" : d < 30 ? "há " + d + " dias" : new Date(iso).toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
  };
  function valor(campo, v) {
    if (v == null || v === "") return "—";
    if (VALORES[campo]?.[v]) return VALORES[campo][v];
    if (/_id$/.test(campo) && typeof v === "string") return nomeDe(v) || (campo === "departamento_id" ? S.deps?.[v]?.nome || v : "—");
    if (typeof v === "boolean") return v ? "Sim" : "Não";
    if (Array.isArray(v)) {
      if (!v.length) return "—";
      if (campo === "checklist") return v.filter((x) => x.feito).length + " de " + v.length + " feitos";
      if (campo === "itens") return v.map((x) => (x.qtd ? x.qtd + "× " : "") + (x.descricao || x.nome || "")).join(", ");
      return v.map((x) => (typeof x === "string" && /^[0-9a-f-]{36}$|^p-/.test(x) ? nomeDe(x) || x : typeof x === "object" ? x.nome || x.texto || "" : x)).join(", ");
    }
    if (typeof v === "object") return "alterado";
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + "T12:00").toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString("pt-PT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const s = String(v);
    return s.length > 140 ? s.slice(0, 137) + "…" : s;
  }

  /* ------------------------------ painéis: comentários e histórico ------------------------------ */
  function alvo() {
    const a = S.aberto;
    if (!a || a.id == null || a.confirmar) return null;
    const t = TIPO_TABELA[a.tipo];
    return t ? { tabela: t, id: String(a.id) } : null;
  }
  function subscrever() {
    if (desligar || !api.coment?.subscrever) return;
    desligar = api.coment.subscrever((ev, novo, antigo) => {
      const r = ev === "DELETE" ? antigo : novo, chave = r && r.tabela ? k(r.tabela, r.registo_id) : null;
      if (ev === "DELETE") { for (const kk of Object.keys(F.coment)) if (Array.isArray(F.coment[kk])) F.coment[kk] = F.coment[kk].filter((c) => c.id !== antigo.id); }
      else if (chave && Array.isArray(F.coment[chave]) && !F.coment[chave].some((c) => c.id === novo.id)) F.coment[chave].push(novo);
      atualizarSecoes();
    });
  }
  async function carregarComent(a) {
    const kk = k(a.tabela, a.id);
    F.coment[kk] = "a-carregar";
    try { F.coment[kk] = await api.coment.de(a.tabela, a.id); subscrever(); }
    catch (e) { F.coment[kk] = e.message === "FALTA_SCRIPT" ? "falta" : "erro"; }
    atualizarSecoes();
  }
  async function carregarHist(a) {
    const kk = k(a.tabela, a.id);
    F.hist[kk] = "a-carregar"; atualizarSecoes();
    try { F.hist[kk] = await api.hist.de(a.tabela, a.id); }
    catch (e) { F.hist[kk] = e.message === "FALTA_SCRIPT" ? "falta" : "erro"; }
    atualizarSecoes();
  }

  function htmlComent(a) {
    const kk = k(a.tabela, a.id), l = F.coment[kk];
    if (l === "falta") return "";
    let h = '<section class="p-sec fia-coment" data-fia="coment"><h3>Comentários' + (Array.isArray(l) && l.length ? " <small>" + l.length + "</small>" : "") + "</h3>";
    if (l === "a-carregar" || l == null) h += '<p class="muted">A carregar…</p>';
    else if (l === "erro") h += '<p class="muted">Não foi possível carregar os comentários.</p>';
    else {
      if (!l.length) h += '<p class="muted fia-vazio">Ainda sem comentários. Escreve aqui decisões e combinações sobre isto, para ficarem junto do registo.</p>';
      h += '<ul class="fia-lista">' + l.map((c) => '<li class="fia-c">' + av(c.autor_id) + '<div><div class="fia-c-cab"><b>' + esc(nomeDe(c.autor_id) || "Alguém") + "</b><small>" + esc(quando(c.criado_em)) + "</small>" +
        (c.autor_id === S.eu.id || eGestor(S.eu) ? '<button class="ib fia-apagar" data-acao="fia-coment-apagar" data-id="' + esc(c.id) + '" aria-label="Apagar comentário">' + I.lixo + "</button>" : "") +
        '</div><p>' + esc(c.texto).replace(/@([\p{L}][\p{L} ]{1,40}?)(?=[\s,.!?:;]|$)/gu, (m) => "<b>" + m + "</b>").replace(/\n/g, "<br>") + "</p></div></li>").join("") + "</ul>";
      h += '<form class="fia-form" id="form-coment"><textarea id="fia-texto" rows="2" maxlength="4000" placeholder="Escreve um comentário. Para avisar alguém, escreve @ e o nome.">' + esc(F.rascunho[kk] || "") + "</textarea>" +
        '<button class="btn sec" type="submit"' + (F.aEnviar ? " disabled" : "") + ">" + (F.aEnviar ? "A enviar…" : "Comentar") + "</button></form>";
    }
    return h + "</section>";
  }
  function htmlHist(a) {
    const kk = k(a.tabela, a.id), l = F.hist[kk], aberto = !!F.histAberto[kk];
    if (l === "falta" || F.coment[kk] === "falta") return "";  // sem o script 18 no Supabase
    let h = '<details class="p-sec fia-hist" data-fia="hist"' + (aberto ? " open" : "") + '><summary data-acao="fia-hist">Histórico de alterações</summary>';
    if (aberto) {
      if (l === "a-carregar" || l == null) h += '<p class="muted">A carregar…</p>';
      else if (l === "erro") h += '<p class="muted">Não foi possível carregar o histórico.</p>';
      else if (!l.length) h += '<p class="muted">Ainda sem alterações registadas.</p>';
      else h += '<ul class="fia-hl">' + l.filter((x) => x.acao === "alterado").map((x) => {
        const campos = Object.keys(x.depois || {});
        return "<li>" + '<div class="fia-c-cab">' + (x.autor_id ? av(x.autor_id) : "") + "<b>" + esc(x.autor_id ? nomeDe(x.autor_id) || "Alguém" : "Central") + "</b><small>" + esc(quando(x.criado_em)) + "</small></div>" +
          "<ul>" + campos.map((c) => "<li><span>" + esc(rotuloCampo(c)) + "</span> " + (c === "notas" || c === "copy" || c === "texto"
            ? "<em>texto alterado</em>"
            : "<s>" + esc(valor(c, x.antes?.[c])) + "</s> → <b>" + esc(valor(c, x.depois[c])) + "</b>") + "</li>").join("") + "</ul></li>";
      }).join("") + "</ul>";
    }
    return h + "</details>";
  }
  function secoes(a) { return htmlComent(a) + htmlHist(a); }

  // depois de cada desenho do painel
  function injetar(root) {
    const a = alvo();
    if (!a || !api.coment) return;
    const sc = root.querySelector(".painel .p-scroll");
    if (!sc) return;
    const kk = k(a.tabela, a.id);
    if (F.ultimo !== kk) { F.ultimo = kk; if (F.hist[kk] !== "falta") delete F.hist[kk]; F.histAberto[kk] = false; delete F.coment[kk]; }
    if (F.coment[kk] == null) carregarComent(a);
    sc.insertAdjacentHTML("beforeend", secoes(a));
  }
  // só troca as secções (não mexe no resto do painel, onde a pessoa pode estar a escrever)
  function atualizarSecoes() {
    const a = alvo(), sc = document.querySelector("#painel-root .painel .p-scroll");
    if (!a || !sc) return;
    const foco = document.activeElement?.id === "fia-texto" ? { s: document.activeElement.selectionStart } : null;
    sc.querySelectorAll("[data-fia]").forEach((x) => x.remove());
    sc.insertAdjacentHTML("beforeend", secoes(a));
    if (foco) { const t = $("#fia-texto"); if (t) { t.focus(); try { t.setSelectionRange(foco.s, foco.s); } catch { /* */ } } }
  }

  function mencoesDe(texto) {
    const t = normalizar(texto);
    return ativos().filter((p) => p.id !== S.eu.id && (t.includes("@" + normalizar(p.nome)) || t.includes("@" + normalizar(p.nome.split(" ")[0])))).map((p) => p.id);
  }

  /* ------------------------------ Reciclagem ------------------------------ */
  async function carregarRecic() {
    F.recic = "a-carregar"; ctx.agendarRender();
    try { F.recic = await api.hist.reciclagem(); } catch (e) { F.recic = e.message === "FALTA_SCRIPT" ? "falta" : { erro: e.message }; }
    ctx.agendarRender();
  }
  const tituloDe = (x) => {
    const a = x.antes || {};
    return a.titulo || a.nome || (a.cliente_nome ? "E-" + String(a.numero || "").padStart(4, "0") + " · " + a.cliente_nome : "") || (a.texto ? String(a.texto).slice(0, 80) : "") || NOME_TABELA[x.tabela] || "Registo";
  };
  function grupos(lista) {
    const porLote = new Map();
    for (const x of lista) { const g = x.lote != null ? "l" + x.lote : "i" + x.id; if (!porLote.has(g)) porLote.set(g, []); porLote.get(g).push(x); }
    return [...porLote.values()].map((g) => {
      g.sort((a, b) => PRIORIDADE_LOTE.indexOf(a.tabela) - PRIORIDADE_LOTE.indexOf(b.tabela));
      return { principal: g[0], outros: g.slice(1) };
    }).sort((a, b) => String(b.principal.criado_em).localeCompare(String(a.principal.criado_em)));
  }
  function vistaReciclagem() {
    if (F.recic == null) carregarRecic();
    let h = '<div class="cab"><div><div class="eyebrow">Grupo 26</div><h1>Reciclagem</h1><p class="sub-cab">O que foi apagado nos últimos 30 dias. Podes recuperar com um toque; ao fim de 30 dias deixa de aparecer aqui.' +
      (eGestor(S.eu) ? " Como direção, vês tudo o que a equipa apagou." : " Vês o que tu apagaste.") + "</p></div></div>";
    const r = F.recic;
    if (r === "a-carregar" || r == null) return h + '<p class="muted">A carregar…</p>';
    if (r === "falta") return h + '<div class="aviso">A reciclagem precisa do script <b>supabase/18-fiabilidade.sql</b> no Supabase.</div>';
    if (r.erro) return h + '<div class="aviso">' + esc(r.erro) + '</div><div class="acts"><button class="btn sec" data-acao="fia-recic-recarregar">Tentar outra vez</button></div>';
    const gs = grupos(r);
    if (!gs.length) return h + '<div class="vazio"><b>Nada apagado nos últimos 30 dias.</b><p>Quando alguém apagar uma tarefa, um cliente, uma encomenda ou outro registo, fica aqui durante 30 dias.</p></div>';
    h += '<ul class="recic">' + gs.map(({ principal: x, outros }) => {
      const fim = new Date(new Date(x.criado_em).getTime() + 30 * 864e5).toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
      const extra = outros.length ? " · com " + outros.length + (outros.length === 1 ? " registo ligado" : " registos ligados") : "";
      return '<li class="recic-i"><div><span class="tag-tipo">' + esc(NOME_TABELA[x.tabela] || x.tabela) + "</span><b>" + esc(tituloDe(x)) + "</b>" +
        "<small>Apagado por " + esc(x.autor_id ? nomeDe(x.autor_id) || "alguém" : "Central") + " " + esc(quando(x.criado_em)) + extra + " · fica até " + esc(fim) + "</small></div>" +
        '<button class="btn sec" data-acao="fia-recuperar" data-id="' + esc(x.id) + '"' + (F.aRecuperar ? " disabled" : "") + ">" + (F.aRecuperar === x.id ? "A recuperar…" : "Recuperar") + "</button></li>";
    }).join("") + "</ul>";
    return h;
  }

  /* ------------------------------ Definições: avisos e cópias automáticas ------------------------------ */
  const horas = (atual) => Array.from({ length: 24 }, (_, i) => '<option value="' + i + '"' + (+atual === i ? " selected" : "") + ">" + String(i).padStart(2, "0") + ":00</option>").join("");
  function secaoAvisos(pr) {
    if (!pr || pr.aCarregar || pr.falta) return "";
    if (!("sossego" in pr)) return '<section class="cartao-sec"><h3>Quando recebo avisos</h3><p class="muted">As horas de sossego e o resumo diário precisam do script supabase/18-fiabilidade.sql no Supabase.</p></section>';
    const int = (campo, rot, sub) => '<label class="interruptor"><input type="checkbox" data-pref="' + campo + '"' + (pr[campo] ? " checked" : "") + '><span class="int-t"></span><span>' + rot + (sub ? "<small>" + sub + "</small>" : "") + "</span></label>";
    return '<section class="cartao-sec fia-avisos"><h3>Quando recebo avisos</h3><div class="prefs">' +
      int("sossego", "Horas de sossego", "Nestas horas os avisos não tocam no telemóvel: ficam guardados e chegam todos juntos num só aviso quando o sossego acaba.") +
      (pr.sossego ? '<div class="campos-2 fia-horas"><div class="campo"><label for="fia-s-ini">Desde as</label><select id="fia-s-ini" data-pref-n="sossego_inicio">' + horas(pr.sossego_inicio) + '</select></div>' +
        '<div class="campo"><label for="fia-s-fim">Até às</label><select id="fia-s-fim" data-pref-n="sossego_fim">' + horas(pr.sossego_fim) + "</select></div></div>" +
        int("sossego_fds", "Também ao fim de semana") : "") +
      int("resumo_diario", "Resumo diário em vez de avisos soltos", "Um só aviso por dia útil com o que ficou por ler e as tarefas com prazo nesse dia.") +
      (pr.resumo_diario ? '<div class="campo fia-horas"><label for="fia-r-h">Hora do resumo</label><select id="fia-r-h" data-pref-n="resumo_hora">' + horas(pr.resumo_hora) + "</select></div>" : "") +
      int("email_por_ler", "Email quando um aviso importante fica 4 horas por ler", "Tarefas atribuídas, prazos, mensagens e comentários. Só se esse aviso não tiver ido logo por email.") +
      '</div><p class="nota-tab">Os lembretes de eventos e as datas de seguros e viaturas do próprio dia (ou em atraso) chegam sempre, mesmo nas horas de sossego.</p></section>';
  }
  async function carregarCopias() {
    F.copias = "a-carregar";
    try { F.copias = await api.copias.listar(); } catch (e) { F.copias = e.message === "FALTA_SCRIPT" ? "falta" : { erro: e.message }; }
    ctx.agendarRender();
  }
  function secaoCopias() {
    if (!eGestor(S.eu) || !api.copias) return "";
    if (F.copias == null) carregarCopias();
    const c = F.copias;
    let h = '<div class="fia-copias"><h4>Cópias automáticas</h4>';
    if (c === "falta") return h + '<p class="muted">As cópias automáticas precisam do script supabase/18-fiabilidade.sql e da função «copia-seguranca» no Supabase (README, passo 3q).</p></div>';
    if (c === "a-carregar" || c == null) return h + '<p class="muted">A carregar…</p></div>';
    if (c.erro) return h + '<p class="muted">' + esc(c.erro) + "</p></div>";
    h += '<p class="muted">Todos os domingos às 3h a Central guarda uma cópia completa num armazenamento privado, só acessível à direção. Ficam as últimas 12.</p>';
    if (!c.length) h += '<p class="aviso-txt">Ainda não há cópias automáticas.</p>';
    else h += '<ul class="fia-copias-l">' + c.slice(0, 6).map((x) => '<li><span>' + (x.ok ? I.check : "⚠") + " " + esc(new Date(x.criado_em).toLocaleString("pt-PT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })) +
      "<small>" + (x.ok ? esc((x.tamanho / 1048576).toFixed(1).replace(".", ",")) + " MB · " + esc(Number(x.registos).toLocaleString("pt-PT")) + " registos" : "Falhou: " + esc(x.erro)) + "</small></span>" +
      (x.ok ? '<button class="btn sec" data-acao="fia-copia-link" data-id="' + esc(x.id) + '">Descarregar</button>' : "") + "</li>").join("") + "</ul>";
    if (c.length && !c[0].ok) h += '<p class="aviso-txt">A última cópia automática falhou. Confirma a função «copia-seguranca» no Supabase.</p>';
    else if (c.length && Date.now() - new Date(c[0].criado_em) > 9 * 864e5) h += '<p class="aviso-txt">A última cópia automática tem mais de uma semana. Confirma o relógio (pg_cron) no Supabase.</p>';
    return h + '<div class="acts"><button class="btn sec" data-acao="fia-copia-agora"' + (F.aCopiar ? " disabled" : "") + ">" + (F.aCopiar ? "A fazer a cópia…" : "Fazer uma cópia agora") + "</button></div></div>";
  }

  /* ------------------------------ eventos ------------------------------ */
  function clique(acao, el, e) {
    const id = el.dataset.id;
    switch (acao) {
      case "fia-hist": {
        const a = alvo(); if (!a) return true;
        const kk = k(a.tabela, a.id);
        F.histAberto[kk] = !F.histAberto[kk];
        if (F.histAberto[kk]) { e?.preventDefault(); if (!Array.isArray(F.hist[kk])) carregarHist(a); else atualizarSecoes(); }
        return true;
      }
      case "fia-coment-apagar": {
        const a = alvo(); if (!a) return true;
        const kk = k(a.tabela, a.id);
        api.coment.apagar(+id || id).then(() => { if (Array.isArray(F.coment[kk])) F.coment[kk] = F.coment[kk].filter((c) => String(c.id) !== String(id)); atualizarSecoes(); }).catch(falha);
        return true;
      }
      case "fia-recuperar": {
        if (F.aRecuperar || !Array.isArray(F.recic)) return true;
        const x = F.recic.find((r) => String(r.id) === String(id)); if (!x) return true;
        const grupo = grupos(F.recic).find((g) => g.principal.id === x.id);
        F.aRecuperar = x.id; ctx.agendarRender();
        api.hist.recuperar(x.id).then(() => {
          const ids = new Set([x.id, ...(grupo?.outros || []).map((o) => o.id)]);
          F.recic = F.recic.filter((r) => !ids.has(r.id));
          toast("Recuperado: " + tituloDe(x));
          new Set([x.tabela, ...(grupo?.outros || []).map((o) => o.tabela)]).forEach((t) => recarregarTabela(t));
        }).catch(falha).finally(() => { F.aRecuperar = null; ctx.agendarRender(); });
        return true;
      }
      case "fia-recic-recarregar": carregarRecic(); return true;
      case "fia-copia-agora":
        F.aCopiar = true; ctx.agendarRender();
        api.copias.agora().then(() => { toast("Cópia feita e guardada."); return carregarCopias(); }).catch(falha).finally(() => { F.aCopiar = false; ctx.agendarRender(); });
        return true;
      case "fia-copia-link":
        api.copias.descarregar(+id).then((r) => { if (r?.url) location.href = r.url; }).catch(falha);
        return true;
    }
    return false;
  }
  function escrever(e) {
    if (e.target.id !== "fia-texto") return false;
    const a = alvo(); if (a) F.rascunho[k(a.tabela, a.id)] = e.target.value;
    return true;
  }
  function mudar(e) {
    const t = e.target;
    if (!t.dataset?.prefN || !S.prefs) return false;
    const campo = t.dataset.prefN, v = +t.value;
    S.prefs = { ...S.prefs, [campo]: v };
    api.preferencias.guardar(S.eu.id, { [campo]: v }).then((x) => { S.prefs = x; toast("Guardado"); }).catch(falha);
    return true;
  }
  async function submeter(f) {
    if (f.id !== "form-coment") return false;
    const a = alvo(), t = $("#fia-texto"), texto = (t?.value || "").trim();
    if (!a || !texto || F.aEnviar) return true;
    const kk = k(a.tabela, a.id);
    F.aEnviar = true; atualizarSecoes();
    try {
      const c = await api.coment.criar(a.tabela, a.id, texto, mencoesDe(texto));
      if (Array.isArray(F.coment[kk]) && !F.coment[kk].some((x) => x.id === c.id)) F.coment[kk].push(c);
      F.rascunho[kk] = "";
      const n = c.mencoes?.length || 0;
      if (n) toast(n === 1 ? nomeDe(c.mencoes[0]).split(" ")[0] + " recebe um aviso." : n + " pessoas recebem um aviso.");
    } catch (err) { falha(err); }
    F.aEnviar = false; atualizarSecoes();
    return true;
  }
  function reiniciar() {
    if (desligar) { desligar(); desligar = null; }
    Object.assign(F, { coment: {}, hist: {}, histAberto: {}, rascunho: {}, recic: null, copias: null, aEnviar: false, aRecuperar: null });
  }
  // a reciclagem vem sempre fresca quando se volta a abrir
  function aoEntrarReciclagem() { F.recic = null; }

  return { injetar, clique, escrever, mudar, submeter, reiniciar, vistaReciclagem, secaoAvisos, secaoCopias, aoEntrarReciclagem };
}
