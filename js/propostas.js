// Central 26 — Propostas de tarefas do assistente. O assistente analisa as tarefas pendentes e propõe tarefas
// para uma pessoa; nada é atribuído até o responsável direto dessa pessoa aprovar cada proposta.
import { MARCA, PRIORIDADES, eGestor, rotuloPrazo, haQuanto } from "./dados.js";

const TIPOS = { nova: "Tarefa nova", tarefa: "Tarefa que já existe", publicacao: "Publicação do Marketing" };

export function criarPropostas(ctx) {
  const { S, api, esc, I, toast, falha, render, nomeDe, ativos } = ctx;
  const P = (S.prop = { estado: "por-carregar", lista: [], ocupado: new Set(), verDecididas: false });
  let desligar = null;

  async function carregar(silencioso) {
    if (P.estado === "a-carregar" || P.aAtualizar || !api.ia?.propostas) return;
    if (silencioso) P.aAtualizar = true; else P.estado = "a-carregar";
    try {
      P.lista = await api.ia.propostas();
      P.estado = "pronto"; P.em = Date.now();
      if (!desligar && api.ia.subscreverPropostas) desligar = api.ia.subscreverPropostas(aoMudar);
    } catch (e) { if (!silencioso) { P.estado = e.message === "FALTA_SCRIPT" ? "falta-script" : "erro"; P.erro = e.message; } }
    P.aAtualizar = false;
    render();
  }
  function aoMudar(ev, novo, antigo) {
    if (ev === "DELETE") P.lista = P.lista.filter((x) => x.id !== antigo.id);
    else { const i = P.lista.findIndex((x) => x.id === novo.id); if (i >= 0) P.lista[i] = novo; else P.lista.unshift(novo); }
    render();
  }
  function reiniciar() { if (desligar) { desligar(); desligar = null; } Object.assign(P, { estado: "por-carregar", lista: [], ocupado: new Set(), verDecididas: false }); }

  const supervisionados = () => ativos().filter((p) => p.supervisor_id === S.eu?.id);
  const pendentes = () => P.lista.filter((x) => x.estado === "pendente" && (x.aprovador_id === S.eu.id || eGestor(S.eu)));
  const minhas = () => P.lista.filter((x) => x.estado === "pendente" && x.aprovador_id === S.eu.id);
  const contagem = () => (P.estado === "pronto" ? minhas().length : 0);
  // O menu mostra «Propostas» a quem tem alguém a seu cargo ou propostas para decidir
  const visivel = () => {
    if (!S.eu || S.eu.restrito) return false;
    if (P.estado === "por-carregar") carregar();
    return supervisionados().length > 0 || contagem() > 0;
  };

  function pedido(p) {
    const n = p.nome.split(" ")[0];
    return "Analisa as tarefas pendentes (as minhas, as do departamento sem responsável e as de " + n + ") e as publicações do Marketing que ainda não têm responsável. " +
      "Depois propõe tarefas concretas para " + p.nome + ", adequadas às funções de " + n + (p.cargo ? " (" + p.cargo + ")" : "") + ", com prazos realistas. Usa a ferramenta de propostas: eu aprovo cada uma antes de lhe chegar.";
  }

  /* ---------------------------- cartões ---------------------------- */
  function cartao(x) {
    const ocupado = P.ocupado.has(x.id), m = MARCA[x.marca];
    const ligacao = x.tipo === "tarefa" && x.tarefa_id ? '<a class="c-link" href="#tarefa-' + x.tarefa_id + '">Abrir tarefa</a>'
      : x.tipo === "publicacao" && x.publicacao_id ? '<a class="c-link" href="#publicacao-' + x.publicacao_id + '">Abrir publicação</a>' : "";
    const meta = ['<span class="pri-tag ' + x.prioridade + '">' + PRIORIDADES[x.prioridade] + "</span>"];
    if (x.prazo) meta.push("<span>" + I.cal + esc(rotuloPrazo(x.prazo)) + "</span>");
    if (m && x.marca !== "grupo") meta.push('<span class="tag-marca" data-marca="' + x.marca + '">' + esc(m.curto) + "</span>");
    return '<article class="prop-cartao" data-marca="' + esc(x.marca) + '"><div class="prop-cab"><span class="prop-tipo">' + esc(TIPOS[x.tipo] || "") + "</span>" + ligacao + "</div>" +
      '<h4>' + esc(x.titulo || "Sem título") + "</h4>" +
      (x.notas ? '<p class="prop-notas">' + esc(x.notas.length > 220 ? x.notas.slice(0, 220) + "…" : x.notas) + "</p>" : "") +
      '<div class="prop-meta">' + meta.join("") + "</div>" +
      (x.motivo ? '<p class="prop-motivo"><b>Porquê:</b> ' + esc(x.motivo) + "</p>" : "") +
      '<div class="prop-acts"><button class="btn pri" data-acao="prop-aprovar" data-id="' + x.id + '"' + (ocupado ? " disabled" : "") + ">" + I.tarefas + "Aprovar e atribuir</button>" +
      '<button class="btn sec" data-acao="prop-recusar" data-id="' + x.id + '"' + (ocupado ? " disabled" : "") + ">Recusar</button></div></article>";
  }
  function grupos(lista) {
    const por = {};
    lista.forEach((x) => (por[x.destinatario_id] = por[x.destinatario_id] || []).push(x));
    return Object.entries(por).map(([dest, l]) =>
      '<section class="prop-grupo"><h2>Para ' + esc(nomeDe(dest)) + ' <span class="n">' + l.length + (l.length === 1 ? " proposta" : " propostas") + "</span>" +
      (l.length > 1 ? '<button class="btn sec prop-todas" data-acao="prop-todas" data-dest="' + dest + '">Aprovar todas</button>' : "") + "</h2>" +
      '<div class="prop-lista">' + l.map(cartao).join("") + "</div></section>").join("");
  }

  /* ------------------------------ vistas ------------------------------ */
  function vista() {
    if (P.estado === "por-carregar") carregar();
    else if (P.estado === "pronto" && Date.now() - (P.em || 0) > 8000) carregar(true); // ao voltar à página, atualiza sem piscar
    const sup = supervisionados();
    let h = '<div class="cab"><div><div class="eyebrow neutro">Assistente</div><h1>Propostas de tarefas</h1>' +
      '<p class="sub-cab">O assistente analisa as tarefas pendentes e propõe tarefas. Nada é atribuído sem a tua aprovação.</p></div>' +
      (sup.length ? '<div class="acts">' + sup.map((p) => '<button class="btn pri" data-acao="prop-pedir" data-id="' + p.id + '">' + I.ia + "Pedir propostas para " + esc(p.nome.split(" ")[0]) + "</button>").join("") + "</div>" : "") + "</div>";
    if (P.estado === "falta-script") return h + '<div class="vazio"><h3>Falta instalar as propostas na base de dados</h3><p>No Supabase, corre o ficheiro <b>supabase/27-acessos-propostas.sql</b> e recarrega esta página.</p></div>';
    if (P.estado === "erro") return h + '<div class="aviso erro">Não foi possível abrir as propostas: ' + esc(P.erro || "") + "</div>";
    if (P.estado !== "pronto") return h + '<div class="tabela"><div class="esqueleto"><i style="width:50%"></i></div></div>';
    const pend = pendentes();
    if (pend.length) h += grupos(pend);
    else h += '<div class="vazio"><h3>Não há propostas por aprovar</h3><p>' + (sup.length ? "Carrega em «Pedir propostas» e o assistente analisa as tarefas pendentes. As propostas aparecem aqui para aprovares ou recusares." : "Quando o assistente propuser tarefas para alguém da tua equipa, aparecem aqui.") + "</p></div>";
    const feitas = P.lista.filter((x) => x.estado !== "pendente").slice(0, 30);
    if (feitas.length) {
      h += '<button class="mostrar-feitas" data-acao="prop-decididas" aria-expanded="' + P.verDecididas + '">' + I.seta + "Já decididas (" + feitas.length + ")</button>";
      if (P.verDecididas) h += '<div class="tabela">' + feitas.map((x) => '<div class="linha compacta prop-feita"><span class="prop-est ' + x.estado + '">' + (x.estado === "aprovada" ? "Aprovada" : "Recusada") + '</span><span class="ttl"><span class="t">' + esc(x.titulo) + '</span><span class="sub"><span>Para ' + esc(nomeDe(x.destinatario_id)) + "</span><span>" + esc(haQuanto(x.decidido_em || x.criado_em)) + "</span></span></span></div>").join("") + "</div>";
    }
    return h;
  }
  function blocoInicio() {
    if (!visivel()) return "";
    const l = minhas(); if (!l.length) return "";
    return '<section class="cartao-sec prop-inicio"><h3>Propostas do assistente <span class="mono muted">' + l.length + ' por aprovar</span> <a class="c-link" href="#propostas" style="font-size:13px;margin-left:8px">Ver todas</a></h3>' +
      '<div class="prop-lista">' + l.slice(0, 2).map(cartao).join("") + "</div></section>";
  }

  /* ------------------------------ ações ------------------------------ */
  async function decidir(ids, aprovar) {
    ids = ids.filter((id) => !P.ocupado.has(id)); if (!ids.length) return;
    ids.forEach((id) => P.ocupado.add(id)); render();
    let ok = 0, erro = null;
    for (const id of ids) {
      try {
        await api.ia.decidir(id, aprovar); ok++;
        const x = P.lista.find((y) => y.id === id); if (x) { x.estado = aprovar ? "aprovada" : "recusada"; x.decidido_em = new Date().toISOString(); }
      } catch (e) { erro = erro || e; }
      P.ocupado.delete(id);
    }
    render();
    if (ok) {
      const dest = nomeDe(P.lista.find((y) => y.id === ids[0])?.destinatario_id).split(" ")[0];
      toast(aprovar ? (ok === 1 ? "Tarefa atribuída a " + dest : ok + " tarefas atribuídas a " + dest) : ok === 1 ? "Proposta recusada" : ok + " propostas recusadas");
    }
    if (erro) falha(erro);
  }
  function clique(acao, el) {
    if (acao === "prop-aprovar") { decidir([el.dataset.id], true); return true; }
    if (acao === "prop-recusar") { decidir([el.dataset.id], false); return true; }
    if (acao === "prop-todas") { decidir(pendentes().filter((x) => x.destinatario_id === el.dataset.dest).map((x) => x.id), true); return true; }
    if (acao === "prop-decididas") { P.verDecididas = !P.verDecididas; render(); return true; }
    if (acao === "prop-pedir") {
      const p = S.perfis[el.dataset.id]; if (!p) return true;
      S.iaAuto = pedido(p); P.em = 0; location.hash = "#assistente-nova"; return true;
    }
    return false;
  }

  return { vista, blocoInicio, clique, carregar, reiniciar, visivel, contagem, supervisionados, estado: () => P.estado };
}
