// Central 26 — agenda do CEO: vista do mês e próximos eventos, com participantes, visibilidade e lembretes.
import { MES_L, DIA, ymd, concluida, rotuloPrazo } from "./dados.js";

const DIAS_CURTOS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const LEMBRETES = [["", "Sem lembrete"], ["0", "Na hora"], ["15", "15 minutos antes"], ["30", "30 minutos antes"], ["60", "1 hora antes"], ["120", "2 horas antes"], ["1440", "1 dia antes"]];
const hora = (ts) => new Date(ts).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
const pad = (n) => String(n).padStart(2, "0");
const horaLocal = (ts) => { const d = new Date(ts); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
function rotuloDia(s) {
  const d = new Date(s + "T12:00:00"), hoje = ymd(new Date()), am = new Date(); am.setDate(am.getDate() + 1);
  const base = DIA[d.getDay()].replace(/^./, (x) => x.toUpperCase()) + ", " + d.getDate() + " de " + MES_L[d.getMonth()];
  return s === hoje ? "Hoje · " + base : s === ymd(am) ? "Amanhã · " + base : base;
}

export const podeGerirAgenda = (eu) => !!eu && eu.ativo !== false && (eu.papel === "ceo" || !!eu.gere_agenda);

export function criarAgenda(ctx) {
  const { S, api, esc, I, toast, falha, render, agendarRender, renderPainel, abrir, fechar, nomeDe, ativos, av, abrirTarefa, $ } = ctx;
  const hoje0 = new Date();
  const A = (S.agenda = { estado: "por-carregar", eventos: {}, vista: window.matchMedia("(max-width:820px)").matches ? "lista" : "mes",
    mes: new Date(hoje0.getFullYear(), hoje0.getMonth(), 1), tarefas: true });
  let desligar = null;

  async function carregar() {
    if (A.estado === "a-carregar") return;
    A.estado = "a-carregar";
    try {
      const l = await api.agenda.listar();
      A.eventos = Object.fromEntries(l.map((e) => [e.id, e]));
      A.estado = "pronto";
      if (!desligar) desligar = api.agenda.subscrever(aoMudar);
    } catch (e) {
      A.estado = /PGRST205|agenda_eventos|Could not find/i.test(String(e?.message)) ? "falta-script" : "erro"; A.erro = e.message;
    }
    agendarRender();
    if (S.aberto?.tipo === "evento") renderPainel(true);
  }
  function aoMudar(ev, novo, antigo) {
    if (ev === "DELETE") delete A.eventos[antigo.id]; else A.eventos[novo.id] = novo;
    agendarRender();
  }
  const dono = () => Object.values(S.perfis).find((p) => p.papel === "ceo" && p.ativo);
  const pode = () => podeGerirAgenda(S.eu);
  const diaDe = (e) => ymd(new Date(e.inicio));
  const eventosDoDia = (dia) => Object.values(A.eventos).filter((e) => diaDe(e) === dia).sort((a, b) => (b.dia_inteiro - a.dia_inteiro) || a.inicio.localeCompare(b.inicio));
  const tarefasDoDia = (dia) => (A.tarefas ? Object.values(S.tarefas).filter((t) => t.prazo === dia && t.responsavel_id === S.eu.id && !concluida(t)) : []);
  const hojeLista = () => eventosDoDia(ymd(new Date()));

  /* ---------- vistas ---------- */
  function vista() {
    if (A.estado === "por-carregar") carregar();
    const d = dono();
    let h = '<div class="cab"><div><div class="eyebrow neutro">' + (pode() ? (S.eu.papel === "ceo" ? "A tua agenda" : "Geres esta agenda") : "Eventos para os quais foste convidado e os visíveis para a equipa") + "</div><h1>" +
      (d ? "Agenda de " + esc(d.nome.split(" ")[0]) : "Agenda do CEO") + "</h1></div>" + (pode() && A.estado === "pronto" ? '<div class="acts"><button class="btn pri" data-acao="ag-novo">' + I.plus + "Novo evento</button></div>" : "") + "</div>";
    if (A.estado === "falta-script") return h + '<div class="vazio"><h3>Falta instalar a agenda na base de dados</h3><p>No Supabase, abre o SQL Editor, cola o ficheiro <b>supabase/04-chat-agenda.sql</b> do GitHub e carrega em Run. Depois recarrega esta página.</p></div>';
    if (A.estado === "erro") return h + '<div class="aviso erro">Não foi possível abrir a agenda: ' + esc(A.erro || "") + "</div>";
    if (A.estado !== "pronto") return h + '<div class="tabela"><div class="esqueleto"><i style="width:50%"></i></div></div>';
    const m = A.mes;
    h += '<div class="barra"><div class="ag-nav"><button class="ib" data-acao="ag-mes" data-d="-1" aria-label="Mês anterior">' + I.seta + '</button><b>' + MES_L[m.getMonth()].replace(/^./, (x) => x.toUpperCase()) + " " + m.getFullYear() +
      '</b><button class="ib" data-acao="ag-mes" data-d="1" aria-label="Mês seguinte">' + I.seta + '</button><button class="btn sec" data-acao="ag-hoje">Hoje</button></div><div class="ferr">' +
      '<label class="chk-txt"><input type="checkbox" id="ag-tarefas"' + (A.tarefas ? " checked" : "") + "> As minhas tarefas com prazo</label>" +
      '<div class="seg" role="group" aria-label="Vista"><button data-acao="ag-vista" data-v="mes" aria-pressed="' + (A.vista === "mes") + '">Mês</button><button data-acao="ag-vista" data-v="lista" aria-pressed="' + (A.vista === "lista") + '">Próximos</button></div></div></div>';
    if (!pode() && !Object.keys(A.eventos).length) h += '<div class="aviso">Ainda não há eventos visíveis para ti. Quando fores convidado para um evento, ele aparece aqui e recebes uma notificação.</div>';
    return h + (A.vista === "mes" ? mes() : proximos());
  }

  function chipEvento(e) {
    return '<button class="ag-chip' + (e.visivel_equipa ? " equipa" : "") + '" data-acao="ag-abrir" data-id="' + e.id + '" title="' + esc(e.titulo) + '">' + (e.dia_inteiro ? "" : '<span class="mono">' + hora(e.inicio) + "</span> ") + esc(e.titulo) + "</button>";
  }
  function chipTarefa(t) {
    return '<button class="ag-chip tarefa" data-acao="abrir" data-id="' + t.id + '" title="Tarefa: ' + esc(t.titulo) + '">' + I.tarefas + esc(t.titulo) + "</button>";
  }
  function mes() {
    const m = A.mes, primeiro = new Date(m.getFullYear(), m.getMonth(), 1);
    const inicio = new Date(primeiro); inicio.setDate(1 - ((primeiro.getDay() + 6) % 7));
    const hoje = ymd(new Date());
    let h = '<div class="ag-mes"><div class="ag-cab">' + DIAS_CURTOS.map((d) => "<span>" + d + "</span>").join("") + "</div><div class=\"ag-grelha\">";
    for (let i = 0; i < 42; i++) {
      const d = new Date(inicio); d.setDate(inicio.getDate() + i);
      if (i === 35 && d.getMonth() !== m.getMonth()) break;
      const s = ymd(d), ev = eventosDoDia(s), ta = tarefasDoDia(s), itens = ev.map(chipEvento).concat(ta.map(chipTarefa));
      h += '<div class="ag-dia' + (d.getMonth() !== m.getMonth() ? " fora" : "") + (s === hoje ? " hoje" : "") + '" data-dia="' + s + '">' +
        '<div class="ag-n">' + (pode() ? '<button class="ag-novo-dia" data-acao="ag-novo" data-dia="' + s + '" aria-label="Novo evento a ' + d.getDate() + '">' + d.getDate() + "</button>" : "<span>" + d.getDate() + "</span>") + "</div>" +
        itens.slice(0, 3).join("") + (itens.length > 3 ? '<button class="ag-mais" data-acao="ag-ver-dia" data-dia="' + s + '">+' + (itens.length - 3) + "</button>" : "") + "</div>";
    }
    return h + "</div></div>";
  }
  function proximos() {
    const hoje = ymd(new Date()), fim = new Date(); fim.setDate(fim.getDate() + 90);
    const dias = new Set();
    Object.values(A.eventos).forEach((e) => { const s = diaDe(e); if (s >= hoje && s <= ymd(fim)) dias.add(s); });
    if (A.tarefas) Object.values(S.tarefas).forEach((t) => { if (t.prazo && t.prazo >= hoje && t.prazo <= ymd(fim) && t.responsavel_id === S.eu.id && !concluida(t)) dias.add(t.prazo); });
    const lista = [...dias].sort();
    if (!lista.length) return '<div class="vazio"><h3>Nada marcado nos próximos 90 dias</h3>' + (pode() ? '<p>Carrega em «Novo evento» para marcar o primeiro.</p>' : "") + "</div>";
    return '<div class="ag-lista">' + lista.map((s) => '<section><h3>' + esc(rotuloDia(s)) + "</h3>" +
      eventosDoDia(s).map((e) => '<button class="ag-item" data-acao="ag-abrir" data-id="' + e.id + '"><span class="ag-hora mono">' + (e.dia_inteiro ? "Todo o dia" : hora(e.inicio) + (e.fim ? "–" + hora(e.fim) : "")) + '</span><span class="ag-txt"><b>' + esc(e.titulo) + "</b><small>" +
        [e.local, e.participantes?.length ? e.participantes.map((p) => nomeDe(p).split(" ")[0]).join(", ") : "", e.visivel_equipa ? "visível para a equipa" : ""].filter(Boolean).map(esc).join(" · ") + "</small></span></button>").join("") +
      tarefasDoDia(s).map((t) => '<button class="ag-item tarefa" data-acao="abrir" data-id="' + t.id + '"><span class="ag-hora mono">Prazo</span><span class="ag-txt"><b>' + esc(t.titulo) + "</b><small>Tarefa tua</small></span></button>").join("") +
      "</section>").join("") + "</div>";
  }

  // Bloco «Agenda de hoje» no início
  function blocoHoje() {
    if (A.estado === "por-carregar") carregar();
    if (A.estado !== "pronto") return "";
    const l = hojeLista();
    if (!l.length && !pode()) return "";
    return '<section class="cartao-sec ag-hoje-bloco"><h3>Agenda de hoje <a class="c-link" href="#agenda" style="font-size:13px;margin-left:8px">Ver agenda</a></h3>' +
      (l.length ? l.map((e) => '<button class="ag-item" data-acao="ag-abrir" data-id="' + e.id + '"><span class="ag-hora mono">' + (e.dia_inteiro ? "Todo o dia" : hora(e.inicio)) + '</span><span class="ag-txt"><b>' + esc(e.titulo) + "</b><small>" + esc(e.local || "") + "</small></span></button>").join("") : '<p class="muted">Nada marcado para hoje.</p>') + "</section>";
  }

  /* ---------- painel do evento ---------- */
  function painel(a) {
    const e = a.id ? A.eventos[a.id] : null, novo = !a.id, editar = pode();
    const mold = (c) => '<div class="veu" data-acao="fechar"></div><aside class="painel" role="dialog" aria-label="Evento" data-marca="grupo"><div class="p-scroll">' + c + "</div></aside>";
    const topo = '<div class="p-topo"><span class="migalha"><i></i>Agenda</span><span class="acts">' + (e && editar ? '<button class="ib perigo" data-acao="ag-apagar">' + I.lixo + "Eliminar</button>" : "") + '<button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + "</button></span></div>";
    if (!novo && !e) return mold(topo + (A.estado === "pronto" ? '<div class="vazio"><h3>Evento indisponível</h3><p>Foi cancelado ou não tens acesso.</p></div>' : '<div class="esqueleto"><i style="width:60%"></i></div>'));
    if (!editar) {
      return mold(topo + '<h2 style="margin:0">' + esc(e.titulo) + "</h2>" +
        '<div class="hist"><div><span>Quando</span><span>' + esc(rotuloDia(diaDe(e))) + (e.dia_inteiro ? " · todo o dia" : " · " + hora(e.inicio) + (e.fim ? "–" + hora(e.fim) : "")) + "</span></div>" +
        (e.local ? "<div><span>Local</span><span>" + esc(e.local) + "</span></div>" : "") +
        (e.participantes?.length ? "<div><span>Participantes</span><span>" + e.participantes.map((p) => esc(nomeDe(p))).join(", ") + "</span></div>" : "") + "</div>" +
        (e.notas ? '<section class="p-sec"><h3>Notas</h3><p style="margin:0;white-space:pre-wrap">' + esc(e.notas) + "</p></section>" : "") +
        '<p class="muted">Só o CEO e quem gere a agenda podem alterar este evento.</p>');
    }
    const base = e || { titulo: "", inicio: a.dia ? a.dia + "T10:00:00" : null, fim: null, dia_inteiro: false, local: "", notas: "", participantes: [], visivel_equipa: false, lembrete_min: 30 };
    const inicio = base.inicio ? new Date(base.inicio) : (() => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d; })();
    const fim = base.fim ? new Date(base.fim) : new Date(inicio.getTime() + 60 * 60000);
    const pessoas = ativos().filter((p) => p.papel !== "ceo");
    let c = topo + '<h2 style="margin:0">' + (novo ? "Novo evento" : "Editar evento") + "</h2>";
    if (a.confirmar) c += '<div class="aviso erro" style="justify-content:space-between;flex-wrap:wrap">Cancelar «' + esc(e.titulo) + '»? Os participantes e o CEO são avisados.<span class="acts"><button class="btn sec" data-acao="ag-apagar-nao">Manter</button><button class="btn perigo" data-acao="ag-apagar-sim">Cancelar evento</button></span></div>';
    c += '<form class="form" id="form-evento" data-id="' + (e?.id || "") + '" novalidate>' +
      '<div class="campo"><label for="ev-titulo">Título</label><input id="ev-titulo" required value="' + esc(base.titulo) + '" placeholder="Ex.: Reunião com fornecedor de cadeiras" autocomplete="off"></div>' +
      '<label class="chk-txt"><input type="checkbox" id="ev-dia"' + (base.dia_inteiro ? " checked" : "") + "> Todo o dia</label>" +
      '<div class="campos-3"><div class="campo"><label for="ev-data">Data</label><input id="ev-data" type="date" required value="' + ymd(inicio) + '"></div>' +
      '<div class="campo"' + (base.dia_inteiro ? " hidden" : "") + ' data-hora><label for="ev-ini">Início</label><input id="ev-ini" type="time" value="' + horaLocal(inicio) + '"></div>' +
      '<div class="campo"' + (base.dia_inteiro ? " hidden" : "") + ' data-hora><label for="ev-fim">Fim</label><input id="ev-fim" type="time" value="' + horaLocal(fim) + '"></div></div>' +
      '<div class="campo"><label for="ev-local">Local</label><input id="ev-local" value="' + esc(base.local) + '" placeholder="Ex.: Escritório de Gaia, Teams, Lisboa" autocomplete="off"></div>' +
      '<div class="campo"><span class="rot">Participantes</span><div class="ev-pessoas">' + pessoas.map((p) => '<label class="chk-txt"><input type="checkbox" name="ev-part" value="' + p.id + '"' + (base.participantes?.includes(p.id) ? " checked" : "") + "> " + esc(p.nome) + "</label>").join("") + '</div><span class="ajuda">Os participantes veem o evento e recebem convite e lembrete.</span></div>' +
      '<label class="chk-txt"><input type="checkbox" id="ev-equipa"' + (base.visivel_equipa ? " checked" : "") + "> Visível para toda a equipa</label>" +
      '<div class="campo"><label for="ev-lembrete">Lembrete</label><select id="ev-lembrete">' + LEMBRETES.map(([v, r]) => '<option value="' + v + '"' + (String(base.lembrete_min ?? "") === v ? " selected" : "") + ">" + r + "</option>").join("") + "</select></div>" +
      '<div class="campo"><label for="ev-notas">Notas</label><textarea id="ev-notas" placeholder="Opcional">' + esc(base.notas) + "</textarea></div>" +
      '<div class="acts"><button class="btn pri" type="submit">' + (novo ? "Criar evento" : "Guardar alterações") + '</button><button class="btn sec" type="button" data-acao="fechar">Cancelar</button></div></form>';
    if (e) c += '<p class="muted" style="font-size:12.5px">Criado por ' + esc(nomeDe(e.criado_por) || "—") + (e.atualizado_por && e.atualizado_por !== e.criado_por ? " · alterado por " + esc(nomeDe(e.atualizado_por)) : "") + "</p>";
    return mold(c);
  }

  async function guardar(f) {
    const titulo = $("#ev-titulo").value.trim(), data = $("#ev-data").value, diaInteiro = $("#ev-dia").checked;
    if (!titulo) { toast("Dá um título ao evento.", true); $("#ev-titulo").focus(); return; }
    if (!data) { toast("Escolhe a data.", true); return; }
    const ini = diaInteiro ? new Date(data + "T00:00:00") : new Date(data + "T" + ($("#ev-ini").value || "09:00") + ":00");
    let fim = diaInteiro ? null : new Date(data + "T" + ($("#ev-fim").value || $("#ev-ini").value || "10:00") + ":00");
    if (fim && fim < ini) { toast("A hora de fim é antes da hora de início.", true); return; }
    const lem = $("#ev-lembrete").value;
    const dados = { titulo, inicio: ini.toISOString(), fim: fim ? fim.toISOString() : null, dia_inteiro: diaInteiro, local: $("#ev-local").value.trim(),
      notas: $("#ev-notas").value, participantes: [...f.querySelectorAll('input[name="ev-part"]:checked')].map((x) => x.value),
      visivel_equipa: $("#ev-equipa").checked, lembrete_min: lem === "" ? null : +lem };
    try {
      const r = f.dataset.id ? await api.agenda.atualizar(f.dataset.id, dados) : await api.agenda.criar(dados);
      A.eventos[r.id] = r;
      const d = new Date(r.inicio); A.mes = new Date(d.getFullYear(), d.getMonth(), 1);
      fechar(); render(); toast(f.dataset.id ? "Evento atualizado" : "Evento criado");
    } catch (e) { falha(e); }
  }

  function clique(acao, el) {
    switch (acao) {
      case "ag-novo": abrir({ tipo: "evento", dia: el.dataset.dia || null }); return true;
      case "ag-abrir": abrir({ tipo: "evento", id: el.dataset.id }); return true;
      case "ag-mes": A.mes = new Date(A.mes.getFullYear(), A.mes.getMonth() + +el.dataset.d, 1); render(); return true;
      case "ag-hoje": { const d = new Date(); A.mes = new Date(d.getFullYear(), d.getMonth(), 1); render(); return true; }
      case "ag-vista": A.vista = el.dataset.v; render(); return true;
      case "ag-ver-dia": { A.vista = "lista"; render(); setTimeout(() => { const s = [...document.querySelectorAll(".ag-lista h3")].find((x) => x.textContent.includes(String(+el.dataset.dia.slice(8)) + " de")); s?.scrollIntoView({ block: "start" }); }, 0); return true; }
      case "ag-apagar": S.aberto = { ...S.aberto, confirmar: true }; renderPainel(true); return true;
      case "ag-apagar-nao": S.aberto = { ...S.aberto, confirmar: false }; renderPainel(true); return true;
      case "ag-apagar-sim": {
        const id = S.aberto.id, antes = A.eventos[id];
        delete A.eventos[id]; fechar(); render();
        api.agenda.apagar(id).then(() => toast("Evento cancelado")).catch((e) => { A.eventos[id] = antes; render(); falha(e); });
        return true;
      }
    }
    return false;
  }
  function mudar(e) {
    const t = e.target;
    if (t.id === "ag-tarefas") { A.tarefas = t.checked; render(); return true; }
    if (t.id === "ev-dia") { document.querySelectorAll("[data-hora]").forEach((x) => { x.hidden = t.checked; }); return true; }
    return false;
  }
  async function submeter(f) { if (f.id === "form-evento") { await guardar(f); return true; } return false; }

  function reiniciar() { if (desligar) { desligar(); desligar = null; } A.estado = "por-carregar"; A.eventos = {}; }
  return { vista, painel, clique, mudar, submeter, carregar, blocoHoje, reiniciar, estado: () => A.estado };
}
