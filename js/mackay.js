// Central 26 — Método Mackay 66 no Comercial: o perfil de cada cliente (66 perguntas adaptadas a barbearias)
// e a lista diária de clientes a abordar, preparada pelo assistente.
// Não se guardam dados sensíveis: saúde, religião, política ou vida familiar privada ficam de fora.

export const GRUPOS_MACKAY = [
  ["O contacto principal", [
    ["m01", "Nome e como gosta de ser tratado"], ["m02", "Cargo na barbearia (dono, gerente, barbeiro)"], ["m03", "Telefone direto ou WhatsApp"], ["m04", "Email"],
    ["m05", "Melhor dia, hora e canal para o contactar"], ["m06", "Data de aniversário"], ["m07", "Terra de origem"], ["m08", "Há quantos anos é barbeiro"],
    ["m09", "Onde aprendeu (academia, mestre)"], ["m10", "Línguas que fala"]]],
  ["A barbearia", [
    ["m11", "Nome comercial e marca"], ["m12", "Localização (rua, bairro, centro comercial)"], ["m13", "Ano de abertura"], ["m14", "Número de cadeiras"],
    ["m15", "Número de barbeiros"], ["m16", "Outras lojas ou planos de abrir"], ["m17", "Horário e dias de mais movimento"], ["m18", "Preço do corte e da barba"],
    ["m19", "Tipo de clientela (idades, estilo)"], ["m20", "Posicionamento (clássica, moderna, premium, económica)"], ["m21", "Redes sociais e seguidores"],
    ["m22", "Avaliação no Google e o que dizem os clientes"]]],
  ["Compras e produtos", [
    ["m23", "Quem decide as compras"], ["m24", "Fornecedores atuais"], ["m25", "Marcas que usa nos serviços"], ["m26", "Marcas que revende ao balcão"],
    ["m27", "Produtos que mais vende"], ["m28", "Consumíveis que mais gasta"], ["m29", "De quanto em quanto tempo encomenda"], ["m30", "Valor médio de cada encomenda"],
    ["m31", "Como prefere pagar e prazos"], ["m32", "O que valoriza num fornecedor"], ["m33", "O que não gosta no fornecedor atual"], ["m34", "Objeções que já levantou à TwentySix"]]],
  ["Equipamento e formação", [
    ["m35", "Cadeiras e equipamento que tem"], ["m36", "Equipamento que precisa de trocar"], ["m37", "Formações feitas pela equipa"], ["m38", "Interesse em formação na 26 Academy"],
    ["m39", "Competições, prémios ou eventos"], ["m40", "Barbeiros ou marcas que admira"]]],
  ["Objetivos e desafios", [
    ["m41", "Objetivo principal para este ano"], ["m42", "Maior problema do negócio hoje"], ["m43", "Dificuldade em contratar ou manter barbeiros"], ["m44", "Planos de expansão ou remodelação"],
    ["m45", "Como atrai clientes novos"], ["m46", "Sistema de marcações que usa"], ["m47", "Como mede o sucesso da barbearia"], ["m48", "O que o faria vender mais produtos ao balcão"]]],
  ["Interesses (só o que a pessoa partilha)", [
    ["m49", "Passatempos"], ["m50", "Desporto e clube"], ["m51", "Música"], ["m52", "Restaurantes ou comida preferida"],
    ["m53", "Viagens e férias"], ["m54", "Temas de conversa de que gosta"], ["m55", "Temas a evitar"], ["m56", "Iniciativas locais em que participa"]]],
  ["A relação connosco", [
    ["m57", "Como conheceu a TwentySix"], ["m58", "Desde quando compra"], ["m59", "Quem da nossa equipa tem melhor relação"], ["m60", "Compromissos que lhe fizemos"],
    ["m61", "Problemas que já teve connosco e como se resolveram"], ["m62", "Concorrentes que o visitam"], ["m63", "Interesse em ser embaixador ou parceiro"],
    ["m64", "Datas importantes do negócio"], ["m65", "O que o faria comprar mais à TwentySix"], ["m66", "Próximo passo combinado"]]],
];
export const PERGUNTAS_MACKAY = Object.fromEntries(GRUPOS_MACKAY.flatMap(([, l]) => l));
const TOTAL = Object.keys(PERGUNTAS_MACKAY).length;
const TIPOS = { seguimento: "Seguimento", recompra: "Hora de encomendar", risco: "Em risco", lead: "Lead", primeiro: "Primeiro contacto" };

export function criarMackay(ctx) {
  const { S, api, esc, I, toast, falha, render, renderPainel, abrir } = ctx;
  const M = (S.mackay = { estado: "por-carregar", dia: "", lista: [], perfis: {}, aPreparar: new Set(), aPesquisar: new Set(), aberto: {}, grupos: {} });

  const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });
  const nomeCli = (id) => S.crm?.clientes?.[id]?.nome || "Cliente";

  async function carregar() {
    if (M.estado === "a-carregar" || !api.crm?.abordagens) return;
    M.estado = "a-carregar";
    try { const r = await api.crm.abordagens.hoje(); M.lista = r.lista || []; M.dia = r.dia; M.aviso = r.aviso || ""; M.estado = "pronto"; }
    catch (e) { M.estado = /crm_abordagens|crm-abordar|Falta instalar|Falta correr/i.test(e.message) ? "falta" : "erro"; M.erro = e.message; }
    render(); if (S.aberto?.tipo === "cliente") renderPainel();
  }
  // muda de dia com a app aberta: volta a pedir a lista
  const garantir = () => { if (M.estado === "por-carregar" || (M.estado === "pronto" && M.dia && M.dia !== hoje())) { M.estado = "por-carregar"; carregar(); } };
  const pendentes = () => M.lista.filter((a) => a.estado === "sugerida");

  /* ------------------------------ cartões ------------------------------ */
  const linhas = (t) => esc(t || "").split("\n").map((l) => l.replace(/^\s*[-•]\s*/, "")).filter(Boolean);
  function telWhats(c) {
    const n = String(c?.whatsapp || c?.telefone || "").replace(/\D/g, "");
    if (!n) return "";
    return n.length === 9 ? "351" + n : n;
  }
  function cartao(a, compacto) {
    const c = S.crm?.clientes?.[a.cliente_id], prep = M.aPreparar.has(a.id);
    let h = '<article class="mk66-cartao' + (a.estado !== "sugerida" ? " feito" : "") + '"><div class="mk66-cab"><span class="mk66-tipo t-' + esc(a.tipo) + '">' + esc(TIPOS[a.tipo] || "Abordar") + "</span>" +
      (a.estado !== "sugerida" ? '<span class="mk66-est">' + (a.estado === "feita" ? "Feita" : "Ignorada") + "</span>" : "") + "</div>" +
      '<button class="mk66-nome" data-acao="crm-abrir" data-id="' + a.cliente_id + '">' + esc(nomeCli(a.cliente_id)) + "</button>" +
      '<p class="mk66-motivo">' + esc(a.motivo) + "</p>";
    if (compacto) return h + "</article>";
    if (a.preparada_em) {
      const an = a.analise || {};
      if (an.cadeiras || an.barbeiros || (an.necessidades || []).length) {
        const dado = (r, v) => v ? '<div><span>' + r + "</span><b>" + esc(v) + "</b></div>" : "";
        h += '<div class="mk66-bloco"><b>Análise da barbearia' + (an.fotos ? " · " + an.fotos + (an.fotos === 1 ? " foto vista" : " fotos vistas") : "") + '</b><div class="mk66-analise">' +
          dado("Cadeiras", an.cadeiras) + dado("Barbeiros", an.barbeiros) + dado("Google", an.avaliacao) + dado("Perfil", an.perfil) + "</div>" +
          ((an.necessidades || []).length ? '<p class="mk66-rot">Necessidades prováveis</p><ul>' + an.necessidades.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>" : "") +
          ((an.propor || []).length ? '<p class="mk66-rot">O que propor</p><ul>' + an.propor.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>" : "") + "</div>";
      }
      h += (a.resumo ? '<div class="mk66-bloco"><b>O que sabemos</b><p>' + esc(a.resumo) + "</p></div>" : "") +
        (a.abordagem ? '<div class="mk66-bloco"><b>Como abordar</b><ul>' + linhas(a.abordagem).map((l) => "<li>" + l + "</li>").join("") + "</ul></div>" : "") +
        (a.mensagem ? '<div class="mk66-bloco"><b>Primeira mensagem</b><p class="mk66-msg">' + esc(a.mensagem) + '</p><div class="acts"><button class="btn sec" data-acao="mk66-copiar" data-id="' + a.id + '">' + I.copiar + "Copiar</button>" +
          (telWhats(c) ? '<a class="btn sec" href="https://wa.me/' + telWhats(c) + "?text=" + encodeURIComponent(a.mensagem) + '" target="_blank" rel="noopener">' + I.balao + "Abrir no WhatsApp</a>" : "") + "</div></div>" : "") +
        ((a.descobrir || []).length ? '<div class="mk66-bloco"><b>Descobrir nesta conversa</b><ul>' + a.descobrir.map((q) => "<li>" + esc(q) + "</li>").join("") + "</ul></div>" : "") +
        ((a.fontes || []).length ? '<p class="mk66-fontes">Fontes: ' + a.fontes.slice(0, 4).map((f) => '<a href="' + esc(f.url) + '" target="_blank" rel="noopener">' + esc(f.titulo || f.url) + "</a>").join(" · ") + "</p>" : "");
    }
    h += '<div class="acts mk66-acts">' + (a.estado === "sugerida" ? (!a.preparada_em
      ? '<button class="btn pri" data-acao="mk66-preparar" data-id="' + a.id + '"' + (prep ? " disabled" : "") + ">" + I.ia + (prep ? "A preparar (pode levar 1 minuto)…" : ["primeiro", "lead"].includes(a.tipo) ? "Analisar e preparar" : "Preparar abordagem") + "</button>"
      : '<button class="btn sec" data-acao="mk66-preparar" data-id="' + a.id + '"' + (prep ? " disabled" : "") + ">" + (prep ? "A preparar…" : "Preparar de novo") + "</button>") +
      '<button class="btn pri" data-acao="mk66-feita" data-id="' + a.id + '">' + I.tarefas + "Feita</button>" +
      '<button class="btn sec" data-acao="mk66-ignorar" data-id="' + a.id + '">Hoje não</button>'
      : '<button class="btn sec" data-acao="mk66-repor" data-id="' + a.id + '">Voltar a sugerida</button>') + "</div>";
    return h + "</article>";
  }

  function vista() {
    garantir();
    let h = '<div class="mk66-intro"><div><h2>Abordar hoje</h2><p class="muted">Todos os dias o assistente escolhe no CRM quem vale a pena contactar: clientes que já deviam ter encomendado, seguimentos marcados e clientes em risco, mais algumas barbearias para o primeiro contacto de venda. Para cada um prepara a abordagem com o método Mackay 66.</p></div></div>';
    if (M.estado === "falta") return h + '<div class="vazio"><h3>Falta instalar</h3><p>No Supabase, corre <b>supabase/29-mackay-abordagens.sql</b> e publica a função <b>crm-abordar</b> (README, passo 3z-d).</p></div>';
    if (M.estado === "erro") return h + '<div class="aviso erro">Não foi possível preparar a lista: ' + esc(M.erro || "") + ' <button class="btn sec" data-acao="mk66-recarregar">Tentar outra vez</button></div>';
    if (M.estado !== "pronto") return h + '<div class="tabela"><div class="esqueleto"><i style="width:55%"></i></div><div class="esqueleto"><i style="width:40%"></i></div></div>';
    if (M.aviso) h += '<div class="aviso"><span>' + esc(M.aviso) + "</span></div>";
    if (!M.lista.length) return h + '<div class="vazio"><h3>Hoje não há clientes a abordar</h3><p>Ninguém está atrasado nas encomendas nem há seguimentos marcados. Amanhã há uma lista nova.</p></div>';
    const pend = pendentes(), feitos = M.lista.filter((a) => a.estado !== "sugerida");
    const eNovo = (a) => a.tipo === "primeiro" || a.tipo === "lead", cli = pend.filter((a) => !eNovo(a)), novos = pend.filter(eNovo);
    if (cli.length) h += '<h3 class="mk66-sub">Clientes <span class="n">' + cli.length + '</span></h3><div class="mk66-lista">' + cli.map((a) => cartao(a)).join("") + "</div>";
    if (novos.length) h += '<h3 class="mk66-sub">Primeiro contacto de venda <span class="n">' + novos.length + '</span></h3><p class="muted mk66-nota">Barbearias que ainda não são clientes. O assistente analisa cada uma (cadeiras, barbeiros, avaliação, necessidades e o que propor) e escreve a mensagem de apresentação.</p><div class="mk66-lista">' + novos.map((a) => cartao(a)).join("") + "</div>";
    if (!pend.length) h += '<div class="vazio"><h3>Lista de hoje tratada</h3><p>Amanhã há uma lista nova.</p></div>';
    if (feitos.length) h += '<h3 class="mk66-sub">Tratados hoje <span class="n">' + feitos.length + '</span></h3><div class="mk66-lista">' + feitos.map((a) => cartao(a, true)).join("") + "</div>";
    return h;
  }
  function blocoInicio() {
    garantir();
    if (M.estado !== "pronto") return "";
    const l = pendentes(); if (!l.length) return "";
    return '<div class="mk66-inicio"><b>Abordar hoje</b>' + l.slice(0, 3).map((a) => '<button class="seg-linha" data-acao="crm-abrir" data-id="' + a.cliente_id + '"><span><b>' + esc(nomeCli(a.cliente_id)) + "</b><small>" + esc(a.motivo) + '</small></span><small>' + esc(TIPOS[a.tipo] || "") + "</small></button>").join("") +
      (l.length > 3 ? '<a class="c-link" href="#comercial-abordar">Ver os ' + l.length + "</a>" : "") + "</div>";
  }

  /* ------------------------- perfil Mackay do cliente ------------------------- */
  async function carregarPerfil(id) {
    if (M.perfis[id] !== undefined) return;
    M.perfis[id] = null;
    try { M.perfis[id] = (await api.crm.mackay.ler(id)) || { cliente_id: id, respostas: {}, sugestoes: {}, fontes: [] }; }
    catch (e) { M.perfis[id] = { erro: e.message }; }
    if (S.aberto?.tipo === "cliente" && S.aberto.id === id) renderPainel();
  }
  function seccao(c) {
    if (!api.crm?.mackay) return "";
    if (M.perfis[c.id] === undefined) carregarPerfil(c.id);
    const p = M.perfis[c.id];
    let h = '<section class="p-sec mk66-perfil"><h3>Perfil Mackay 66';
    if (!p) return h + '</h3><div class="esqueleto"><i style="width:50%"></i></div></section>';
    if (p.erro) return h + '</h3><p class="muted">' + (/crm_mackay/.test(p.erro) ? "Falta correr o script supabase/29-mackay-abordagens.sql." : esc(p.erro)) + "</p></section>";
    const r = p.respostas || {}, sug = p.sugestoes || {}, feitas = Object.keys(PERGUNTAS_MACKAY).filter((k) => String(r[k] || "").trim()).length;
    const nSug = Object.keys(sug).filter((k) => !String(r[k] || "").trim()).length, aberto = !!M.aberto[c.id], pesq = M.aPesquisar.has(c.id);
    h += ' <span class="mono">' + feitas + " de " + TOTAL + '</span></h3><div class="barra-p mk66-barra"><i style="width:' + Math.round((feitas / TOTAL) * 100) + '%"></i></div>' +
      '<p class="muted">Quanto mais se sabe do cliente, melhor a abordagem. Preenche o que fores descobrindo nas conversas. O assistente pesquisa informação pública da barbearia (site, Google, redes da loja) e deixa sugestões para confirmares.</p>' +
      '<div class="acts"><button class="btn sec" data-acao="mk66-abrir-perfil" data-id="' + c.id + '" aria-expanded="' + aberto + '">' + (aberto ? "Fechar o perfil" : feitas ? "Ver e editar o perfil" : "Começar o perfil") + "</button>" +
      '<button class="btn sec" data-acao="mk66-pesquisar" data-id="' + c.id + '"' + (pesq ? " disabled" : "") + ">" + I.ia + (pesq ? "A pesquisar…" : "Pesquisar com o assistente") + "</button></div>";
    if (nSug) h += '<div class="aviso"><span>O assistente deixou <b>' + nSug + (nSug === 1 ? " sugestão" : " sugestões") + "</b> para confirmares.</span>" + (aberto ? "" : '<button class="btn sec" data-acao="mk66-abrir-perfil" data-id="' + c.id + '">Ver</button>') + "</div>";
    if (aberto) {
      h += GRUPOS_MACKAY.map(([g, l], gi) => {
        const n = l.filter(([k]) => String(r[k] || "").trim()).length, s = l.filter(([k]) => sug[k] && !String(r[k] || "").trim()).length;
        const ab = M.grupos[c.id + gi] ?? (gi === 0 || s > 0);
        return '<details class="mk66-grupo"' + (ab ? " open" : "") + ' data-grupo="' + c.id + gi + '"><summary>' + esc(g) + ' <span class="mono">' + n + "/" + l.length + "</span>" + (s ? '<span class="mk66-s">' + s + " por confirmar</span>" : "") + "</summary>" +
          l.map(([k, q]) => '<div class="mk66-q"><label for="mk66-' + k + '">' + esc(q) + "</label>" +
            '<textarea id="mk66-' + k + '" rows="1" data-mk66="' + k + '" data-cliente="' + c.id + '">' + esc(r[k] || "") + "</textarea>" +
            (sug[k] && !String(r[k] || "").trim() ? '<div class="mk66-sug"><span>' + esc(sug[k].v) + (sug[k].fonte ? ' <a href="' + esc(sug[k].fonte) + '" target="_blank" rel="noopener">fonte</a>' : "") + '</span><button class="ib" data-acao="mk66-aceitar" data-id="' + c.id + '" data-k="' + k + '">Aceitar</button><button class="ib" data-acao="mk66-rejeitar" data-id="' + c.id + '" data-k="' + k + '">Rejeitar</button></div>' : "") +
            "</div>").join("") + "</details>";
      }).join("");
      if ((p.fontes || []).length) h += '<p class="mk66-fontes">Fontes da última pesquisa: ' + p.fontes.slice(0, 6).map((f) => '<a href="' + esc(f.url) + '" target="_blank" rel="noopener">' + esc(f.titulo || f.url) + "</a>").join(" · ") + "</p>";
    }
    return h + "</section>";
  }

  const timers = {};
  async function guardar(id, campos) {
    const p = M.perfis[id]; if (!p) return;
    try { M.perfis[id] = { ...p, ...(await api.crm.mackay.guardar(id, { respostas: p.respostas || {}, sugestoes: p.sugestoes || {}, ...campos })) }; }
    catch (e) { falha(e); }
  }

  /* ------------------------------ ações ------------------------------ */
  async function preparar(id) {
    if (M.aPreparar.has(id)) return;
    M.aPreparar.add(id); render(); renderPainel();
    try {
      const r = await api.crm.abordagens.preparar(id);
      const i = M.lista.findIndex((a) => a.id === id); if (i >= 0) M.lista[i] = r.abordagem;
      if (r.abordagem?.cliente_id) delete M.perfis[r.abordagem.cliente_id];
      toast(r.sugestoes ? "Abordagem preparada · " + r.sugestoes + " sugestões novas no perfil" : "Abordagem preparada");
    } catch (e) { falha(e); }
    M.aPreparar.delete(id); render(); renderPainel();
  }
  async function marcar(id, estado) {
    const a = M.lista.find((x) => x.id === id); if (!a) return;
    const antes = a.estado; a.estado = estado; render();
    try { await api.crm.abordagens.estado(id, estado); if (estado === "feita") { toast("Regista o contacto na ficha do cliente"); abrir({ tipo: "cliente", id: a.cliente_id }); } }
    catch (e) { a.estado = antes; render(); falha(e); }
  }
  async function pesquisar(id) {
    if (M.aPesquisar.has(id)) return;
    M.aPesquisar.add(id); renderPainel();
    try {
      const r = await api.crm.abordagens.pesquisar(id);
      delete M.perfis[id]; M.aberto[id] = true;
      toast(r.sugestoes ? r.sugestoes + (r.sugestoes === 1 ? " sugestão nova" : " sugestões novas") + " para confirmares" : "Não encontrei informação pública nova sobre este cliente");
    } catch (e) { falha(e); }
    M.aPesquisar.delete(id); renderPainel();
  }
  function clique(acao, el) {
    const id = el.dataset.id;
    switch (acao) {
      case "mk66-preparar": preparar(id); return true;
      case "mk66-feita": marcar(id, "feita"); return true;
      case "mk66-ignorar": marcar(id, "ignorada"); return true;
      case "mk66-repor": marcar(id, "sugerida"); return true;
      case "mk66-recarregar": M.estado = "por-carregar"; carregar(); return true;
      case "mk66-copiar": {
        const a = M.lista.find((x) => x.id === id);
        if (a) (navigator.clipboard?.writeText(a.mensagem) || Promise.reject()).then(() => toast("Mensagem copiada")).catch(() => toast("Não foi possível copiar. Seleciona o texto.", true));
        return true;
      }
      case "mk66-abrir-perfil": M.aberto[id] = !M.aberto[id]; renderPainel(); return true;
      case "mk66-pesquisar": pesquisar(id); return true;
      case "mk66-aceitar": case "mk66-rejeitar": {
        const p = M.perfis[id], k = el.dataset.k; if (!p) return true;
        const sug = { ...(p.sugestoes || {}) }, resp = { ...(p.respostas || {}) };
        if (acao === "mk66-aceitar" && sug[k]) resp[k] = sug[k].v;
        delete sug[k];
        M.perfis[id] = { ...p, respostas: resp, sugestoes: sug }; renderPainel();
        guardar(id, { respostas: resp, sugestoes: sug });
        return true;
      }
    }
    return false;
  }
  function escrever(e) {
    const t = e.target; if (!t.dataset?.mk66) return false;
    const id = t.dataset.cliente, k = t.dataset.mk66, p = M.perfis[id]; if (!p) return true;
    p.respostas = { ...(p.respostas || {}), [k]: t.value };
    t.style.height = "auto"; t.style.height = t.scrollHeight + "px";
    clearTimeout(timers[id]); timers[id] = setTimeout(() => guardar(id, {}), 800);
    return true;
  }
  // lembra-se dos grupos abertos ou fechados (o evento «toggle» não sobe, por isso é apanhado na captura)
  document.addEventListener("toggle", (e) => { const d = e.target; if (d?.matches?.("details.mk66-grupo")) M.grupos[d.dataset.grupo] = d.open; }, true);
  const mudar = () => false;
  function reiniciar() { Object.assign(M, { estado: "por-carregar", dia: "", lista: [], perfis: {}, aPreparar: new Set(), aPesquisar: new Set(), aberto: {}, grupos: {} }); }

  return { vista, blocoInicio, seccao, clique, escrever, mudar, reiniciar, carregar, contagem: () => (M.estado === "pronto" ? pendentes().length : 0) };
}
