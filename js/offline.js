// Central 26 — a app continua a funcionar sem rede e não perde alterações.
//  • Guarda no aparelho a última cópia dos dados de cada área (abre logo, mesmo sem rede).
//  • O que se faz sem rede (tarefa feita, nota de visita, encomenda entregue…) fica numa fila «por enviar»
//    e segue sozinho quando a rede volta.
//  • Antes de gravar, confirma se outra pessoa mudou o mesmo campo entretanto; se sim, pergunta o que fazer.
// Não guarda no aparelho o Financeiro, a Auditoria nem o Assistente.

const eventos = new EventTarget();
export const aoEvento = (nome, fn) => eventos.addEventListener(nome, (e) => fn(e.detail));
const emitir = (nome, detalhe) => eventos.dispatchEvent(new CustomEvent(nome, { detail: detalhe }));

/* ------------------------------ armazenamento no aparelho ------------------------------ */
let dbp = null;
function idb() {
  if (!("indexedDB" in window)) return Promise.reject(new Error("sem IndexedDB"));
  if (!dbp) {
    dbp = new Promise((ok, falha) => {
      const r = indexedDB.open("central26-dados", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("cache");
      r.onsuccess = () => ok(r.result);
      r.onerror = () => falha(r.error);
    }).catch((e) => { dbp = null; throw e; });
  }
  return dbp;
}
async function lerCache(k) {
  const db = await idb();
  return new Promise((ok) => { const t = db.transaction("cache").objectStore("cache").get(k); t.onsuccess = () => ok(t.result || null); t.onerror = () => ok(null); });
}
async function gravarCache(k, v) {
  try {
    const db = await idb();
    await new Promise((ok) => { const t = db.transaction("cache", "readwrite"); t.objectStore("cache").put(v, k); t.oncomplete = ok; t.onerror = ok; t.onabort = ok; });
  } catch { /* sem espaço ou modo privado: segue sem cópia */ }
}
async function limparCache() {
  try {
    const db = await idb();
    await new Promise((ok) => { const t = db.transaction("cache", "readwrite"); t.objectStore("cache").clear(); t.oncomplete = ok; t.onerror = ok; });
  } catch { /* nada a limpar */ }
}

/* ------------------------------ estado ------------------------------ */
const E = { uid: null, offline: !navigator.onLine, dadosDe: null, fila: [], aSincronizar: false };
export const estadoRede = () => ({ offline: E.offline, dadosDe: E.dadosDe, porEnviar: E.fila.length, aEnviar: E.aSincronizar });

const chaveFila = () => "central26-fila-" + (E.uid || "anon");
function lerFila() { try { E.fila = JSON.parse(localStorage.getItem(chaveFila()) || "[]"); } catch { E.fila = []; } }
function guardarFila() { try { localStorage.setItem(chaveFila(), JSON.stringify(E.fila)); } catch { /* sem espaço */ } emitir("rede", estadoRede()); }

export const eRede = (e) => !navigator.onLine || /Sem ligação|Failed to fetch|NetworkError|Load failed|network|fetch|tempo esgotado/i.test(String(e?.message || e));

function marcarOffline(em) { const mudou = !E.offline || E.dadosDe !== em; E.offline = true; if (em) E.dadosDe = em; if (mudou) emitir("rede", estadoRede()); }
function marcarOnline() { if (E.offline || E.dadosDe) { E.offline = false; E.dadosDe = null; emitir("rede", estadoRede()); } }

const comTempo = (p, ms) => Promise.race([p, new Promise((_, falha) => setTimeout(() => falha(new Error("tempo esgotado")), ms))]);
const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const caminho = (o, c) => c.split(".").reduce((x, k) => x?.[k], o);
const agoraIso = () => new Date().toISOString();

/* ------------------------------ alterações por enviar por cima dos dados ------------------------------ */
// Que tabela vive em que lista de cada área guardada
const ONDE = { principal: { tarefas: "tarefas" }, crm: { crm_clientes: "clientes", crm_contactos: "contactos" }, log: { log_encomendas: "encomendas" } };
function sobreporFila(nome, dados) {
  const mapa = ONDE[nome];
  if (!mapa || !dados || !E.fila.length) return dados;
  const d = { ...dados };
  for (const [tabela, lista] of Object.entries(mapa)) {
    if (!Array.isArray(d[lista])) continue;
    let arr = d[lista];
    for (const op of E.fila) {
      if (op.tabela !== tabela) continue;
      if (op.op === "atualizar") arr = arr.map((x) => (String(x.id) === String(op.id) ? { ...x, ...op.campos, _pendente: true } : x));
      else if (op.op === "criar" && !arr.some((x) => String(x.id) === String(op.linha.id))) arr = tabela === "crm_contactos" ? [op.linha, ...arr] : [...arr, op.linha];
    }
    d[lista] = arr;
  }
  return d;
}

/* ------------------------------ diálogo de conflito ------------------------------ */
const ROTULOS = {
  titulo: "Título", notas: "Notas", estado: "Estado", prioridade: "Prioridade", responsavel_id: "Responsável", prazo: "Prazo",
  etapa: "Etapa", nome: "Nome", telefone: "Telefone", email: "Email", morada: "Morada", data: "Data", data_prevista: "Data prevista",
  itens: "Artigos", checklist: "Lista", inicio: "Início", fim: "Fim", local: "Local", participantes: "Participantes", tipo: "Tipo",
  marca: "Marca", departamento_id: "Departamento", cliente_nome: "Cliente", contacto: "Contacto", copy: "Texto", minimo: "Mínimo",
  categoria: "Categoria", valor: "Valor", entidade: "Entidade", referencia: "Referência", matricula: "Matrícula", km: "Quilómetros",
};
export const rotuloCampo = (k) => ROTULOS[k] || (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_id$/, "").replace(/_/g, " ");
const escH = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let API = null;
function mostrarValor(k, v) {
  if (v == null || v === "") return "—";
  if (/_id$/.test(k) && typeof v === "string" && API?.nomeDe) return API.nomeDe(v) || "—";
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === "object" ? x.texto || x.nome || x.descricao || JSON.stringify(x) : x)).join(", ") : "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
function perguntarConflito({ mudados, servidor, meus, quem, quando, semRede }) {
  return new Promise((resolver) => {
    const div = document.createElement("div");
    div.className = "conflito";
    const nome = quem ? quem.split(" ")[0] : "Outra pessoa";
    const ha = quando ? " " + quando : "";
    div.innerHTML = '<div class="conflito-caixa" role="alertdialog" aria-modal="true" aria-labelledby="conflito-t">' +
      '<h2 id="conflito-t">' + escH(nome) + " alterou isto" + escH(ha) + "</h2>" +
      "<p>" + (semRede ? "Enquanto estavas sem rede, " + escH(nome) + " mudou os mesmos campos. " : "Enquanto editavas, " + escH(nome) + " mudou os mesmos campos. ") + "Escolhe com que versão ficas.</p>" +
      '<div class="conflito-lista">' + mudados.map((k) => '<div class="conflito-campo"><b>' + escH(rotuloCampo(k)) + "</b>" +
        '<div><small>De ' + escH(nome) + "</small><span>" + escH(mostrarValor(k, servidor[k])).slice(0, 400) + "</span></div>" +
        '<div><small>A tua</small><span>' + escH(mostrarValor(k, meus[k])).slice(0, 400) + "</span></div></div>").join("") + "</div>" +
      '<div class="conflito-acoes"><button class="btn sec" data-c="deles">Ficar com a de ' + escH(nome) + '</button><button class="btn pri" data-c="minha">Gravar a minha</button></div></div>';
    div.addEventListener("click", (e) => { const b = e.target.closest("[data-c]"); if (!b) return; div.remove(); resolver(b.dataset.c); });
    document.body.append(div);
    div.querySelector('[data-c="minha"]').focus();
  });
}
const quandoTexto = (iso) => {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 1 ? "agora mesmo" : m < 60 ? "há " + m + " min" : m < 1440 ? "há " + Math.round(m / 60) + " h" : "há " + Math.round(m / 1440) + " dias";
};

/* ------------------------------ envolver a ligação real ------------------------------ */
export function envolverApi(api, extra) {
  API = api;
  const ORIG = {};
  const substituir = (cam, fn) => {
    const partes = cam.split("."), ultimo = partes.pop(), dono = partes.reduce((x, k) => x?.[k], api);
    if (!dono || typeof dono[ultimo] !== "function") return;
    const orig = dono[ultimo].bind(dono);
    ORIG[cam] = orig;
    dono[ultimo] = fn(orig, cam);
  };

  // leituras com cópia no aparelho
  const leitor = (nomeFn, swr) => (orig) => async (...args) => {
    const nome = typeof nomeFn === "function" ? nomeFn(...args) : nomeFn;
    if (!nome || !E.uid) return orig(...args);
    const k = E.uid + ":" + nome;
    const cache = await lerCache(k).catch(() => null);
    const rede = orig(...args).then((d) => { gravarCache(k, { em: Date.now(), d }); return d; });
    if (cache && (swr || !navigator.onLine)) {
      // mostra já o que está guardado e atualiza quando o servidor responder
      rede.then((d) => { marcarOnline(); emitir("dados", { nome, dados: sobreporFila(nome, d) }); }).catch((e) => { if (eRede(e)) marcarOffline(cache.em); });
      if (!navigator.onLine) marcarOffline(cache.em);
      return sobreporFila(nome, cache.d);
    }
    try {
      const d = await (cache ? comTempo(rede, 10000) : rede);
      marcarOnline();
      return sobreporFila(nome, d);
    } catch (e) {
      if (cache && eRede(e)) {
        marcarOffline(cache.em);
        rede.then((d) => { marcarOnline(); emitir("dados", { nome, dados: sobreporFila(nome, d) }); }).catch(() => {});
        return sobreporFila(nome, cache.d);
      }
      throw e;
    }
  };
  substituir("sessao", (orig) => async () => { const u = await orig(); if (u && u.id !== E.uid) { E.uid = u.id; lerFila(); emitir("rede", estadoRede()); } return u; });
  substituir("entrar", (orig) => async (...a) => { await orig(...a); await api.sessao(); });
  substituir("meuPerfil", leitor("perfil"));
  substituir("carregar", leitor("principal", true));
  substituir("crm.carregar", leitor("crm", true));
  substituir("agenda.listar", leitor("agenda"));
  substituir("log.carregar", leitor("log"));
  substituir("op.carregar", leitor("op"));
  substituir("mk.carregar", leitor("mk"));
  substituir("stk.carregar", leitor("stk"));
  substituir("prz.carregar", leitor("prz"));
  substituir("prs.carregar", leitor("prs"));
  substituir("prs.resumo", leitor("prs-resumo"));
  substituir("chat.resumo", leitor("chat-resumo"));
  substituir("chat.mensagens", leitor((canal, antes) => (antes ? null : "chat-" + canal)));
  substituir("preferencias.ler", leitor("pref"));
  substituir("sair", (orig) => async () => {
    if (E.fila.length && navigator.onLine) await sincronizar().catch(() => {});
    await limparCache(); E.uid = null; E.fila = []; return orig();
  });

  // conflitos: o que a pessoa tinha à frente (base) contra o que está agora no servidor
  async function verificar(tabela, id, campos, base, semRede) {
    if (!base || !extra.lerLinha) return { gravar: true };
    const chaves = Object.keys(campos).filter((k) => k in base);
    if (!chaves.length) return { gravar: true };
    const servidor = await extra.lerLinha(tabela, id).catch(() => null);
    if (!servidor) return { gravar: true };
    const mudados = chaves.filter((k) => !igual(servidor[k], base[k]) && !igual(servidor[k], campos[k]));
    if (!mudados.length) return { gravar: true };
    const ult = await extra.ultimaAlteracao?.(tabela, id).catch(() => null);
    const quem = ult?.autor_id ? api.nomeDe?.(ult.autor_id) : servidor.atualizado_por ? api.nomeDe?.(servidor.atualizado_por) : "";
    const escolha = await perguntarConflito({ mudados, servidor, meus: campos, quem, quando: quandoTexto(ult?.criado_em || servidor.atualizado_em), semRede });
    return escolha === "minha" ? { gravar: true } : { gravar: false, linha: servidor };
  }

  // gravações que verificam conflitos e, sem rede, ficam na fila
  const ESCRITAS = [
    ["tarefas.atualizar", "tarefas", true], ["crm.atualizar", "crm_clientes", true], ["log.encomendas.atualizar", "log_encomendas", true],
    ["agenda.atualizar", "agenda_eventos", false], ["op.fornecedores.atualizar", "op_fornecedores", false], ["op.pedidos.atualizar", "op_pedidos", false],
    ["mk.pub.atualizar", "mk_publicacoes", false], ["stk.atualizar", "stk_produtos", false],
    ["prz.atualizarPrazo", "prz_prazos", false], ["prz.atualizarViatura", "prz_viaturas", false],
  ];
  for (const [cam, tabela, emFila] of ESCRITAS) {
    substituir(cam, (orig) => async (id, campos, ...resto) => {
      const base = api.conhecido?.(tabela, id) || null;
      const naFila = () => {
        const antes = {}; if (base) Object.keys(campos).forEach((k) => (antes[k] = base[k]));
        // várias alterações ao mesmo registo juntam-se numa
        const ja = E.fila.find((o) => o.op === "atualizar" && o.tabela === tabela && String(o.id) === String(id));
        if (ja) { ja.campos = { ...ja.campos, ...campos }; ja.antes = { ...antes, ...ja.antes }; } else E.fila.push({ op: "atualizar", cam, tabela, id, campos, antes, em: Date.now() });
        guardarFila();
        return { ...(base || { id }), ...campos, _pendente: true };
      };
      if (emFila && !navigator.onLine) { marcarOffline(); return naFila(); }
      try {
        const v = await verificar(tabela, id, campos, base, false);
        if (!v.gravar) return v.linha;
        const r = await orig(id, campos, ...resto);
        api.gravado?.(tabela, id, r);
        return r;
      } catch (e) {
        if (emFila && eRede(e)) { marcarOffline(); return naFila(); }
        throw e;
      }
    });
  }

  // criações que, sem rede, ficam na fila (com valores por omissão para a app as mostrar já)
  const PADRAO = {
    tarefas: () => ({ estado: "por_fazer", estado_periodo: "unica", prioridade: "media", freq: "unica", marca: "grupo", notas: "", checklist: [], checklist_periodo: "", origem: "", criado_por: E.uid, criado_em: agoraIso(), atualizado_em: agoraIso() }),
    crm_contactos: () => ({ autor_id: E.uid, tipo: "nota", texto: "", proximo_passo: "", data_proximo: null, criado_em: agoraIso() }),
  };
  const CRIAR = [["tarefas.criar", "tarefas", true], ["crm.contacto", "crm_contactos", false]];
  for (const [cam, tabela, comId] of CRIAR) {
    substituir(cam, (orig) => async (obj, ...resto) => {
      const dados = { ...obj };
      if (comId && !dados.id) dados.id = crypto.randomUUID();
      const naFila = () => {
        const linha = { ...PADRAO[tabela](), ...dados, id: dados.id || "por-enviar-" + Date.now(), _pendente: true };
        E.fila.push({ op: "criar", cam, tabela, dados, linha, em: Date.now() });
        guardarFila();
        return linha;
      };
      if (!navigator.onLine) { marcarOffline(); return naFila(); }
      try { return await orig(dados, ...resto); } catch (e) { if (eRede(e)) { marcarOffline(); return naFila(); } throw e; }
    });
  }

  // enviar a fila quando a rede volta
  async function sincronizar() {
    if (E.aSincronizar || !E.fila.length || !navigator.onLine || !E.uid) return;
    E.aSincronizar = true; emitir("rede", estadoRede());
    let feitas = 0; const falhas = [];
    try {
      while (E.fila.length) {
        const op = E.fila[0];
        try {
          if (op.op === "atualizar") {
            const v = await verificar(op.tabela, op.id, op.campos, Object.keys(op.antes || {}).length ? { ...op.antes } : null, true);
            if (v.gravar) await ORIG[op.cam](op.id, op.campos);
          } else {
            try { await ORIG[op.cam](op.dados); }
            catch (e) { if (!/duplicate|23505|já existe/i.test(String(e?.message))) throw e; }
          }
          feitas++;
        } catch (e) {
          if (eRede(e)) break;  // a rede voltou a falhar: tenta mais tarde
          falhas.push({ op, erro: e.message });
        }
        E.fila.shift(); guardarFila();
      }
    } finally {
      E.aSincronizar = false; emitir("rede", estadoRede());
    }
    if (feitas || falhas.length) { marcarOnline(); emitir("sincronizado", { feitas, falhas }); }
  }
  api.sincronizar = sincronizar;

  addEventListener("online", () => { marcarOnline(); setTimeout(sincronizar, 800); });
  addEventListener("offline", () => marcarOffline());
  setInterval(() => { if (navigator.onLine && E.fila.length) sincronizar(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && navigator.onLine && E.fila.length) sincronizar(); });
  return api;
}
