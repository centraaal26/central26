// Modo de demonstração: imita a base de dados dentro do navegador (abrir a app com ?demo).
// Serve para mostrar a app e testá-la sem mexer nos dados reais. Nada sai deste aparelho.
import { MODELOS } from "./modelos.js";
import { periodo, ymd, podeVer, podeAtribuirA, eGestor } from "./dados.js";

const CHAVE = "central26-demo-v1";
const CHAVE_EU = "central26-demo-eu";

const DEPS = [
  ["direcao", "Direção", 1], ["administrativo", "Administrativo e Operacional", 2], ["operacional", "Operacional", 3],
  ["comercial", "Comercial", 4], ["marketing", "Marketing e Multimédia", 5], ["logistica", "Logística", 6], ["tecnologico", "Tecnológico", 7],
].map(([id, nome, ordem]) => ({ id, nome, ordem }));

const PESSOAS = [
  ["p-marcos", "Marcos Maia", "CEO", "direcao", "ceo"],
  ["p-samuel", "Samuel Maia", "Diretor Administrativo e Operacional", "administrativo", "admin"],
  ["p-bruno", "Bruno Santos", "Departamento Operacional", "operacional", "chefe"],
  ["p-goncalo", "Gonçalo Monteiro", "Departamento de Marketing", "marketing", "chefe"],
  ["p-wembley", "Wembley Costa", "Departamento Comercial", "comercial", "chefe"],
  ["p-rui", "Rui Neves", "Departamento de Logística", "logistica", "chefe"],
  ["p-isaac", "Isaac Maia", "Departamento Tecnológico", "tecnologico", "admin"],
].map(([id, nome, cargo, departamento_id, papel]) => ({
  id, nome, cargo, departamento_id, papel, email: id.slice(2) + "@exemplo.pt", telefone: "", ativo: true, mudar_password: false, gere_agenda: id === "p-samuel",
  criado_em: new Date(Date.now() - 30 * 864e5).toISOString(),
}));

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "x" + Date.now().toString(36) + Math.random().toString(36).slice(2));
const agora = () => new Date().toISOString();

function semear() {
  const db = { departamentos: DEPS, perfis: PESSOAS, tarefas: [], atividade: [], notificacoes: [], seq: 1 };
  const dono = { grupo: "p-rui", auditorias: "p-isaac", barbearia: "p-bruno", tech: "p-wembley" };
  for (const [chave, mod] of Object.entries(MODELOS)) {
    if (!["grupo", "auditorias", "barbearia", "tech", "twentysix"].includes(chave)) continue;
    mod.tarefas.forEach((t, i) => {
      const resp = dono[chave] || (t.departamento_id === "marketing" ? "p-goncalo" : t.departamento_id === "comercial" ? "p-wembley" : null);
      db.tarefas.push({
        id: uid(), modelo: chave + "-" + i, marca: t.marca || chave === "grupo" ? (t.marca || "grupo") : chave, titulo: t.titulo, freq: t.freq,
        prioridade: t.prioridade, notas: t.notas, checklist: t.checklist, checklist_periodo: "", prazo: t.prazo,
        departamento_id: t.departamento_id || (resp ? PESSOAS.find((p) => p.id === resp).departamento_id : null),
        responsavel_id: resp, estado: "por_fazer", estado_periodo: periodo(t.freq), criado_por: "p-samuel",
        criado_em: new Date(Date.now() - 20 * 864e5 + i * 1000).toISOString(), atualizado_em: agora(), concluido_por: null, concluido_em: null,
      });
    });
  }
  const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
  const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
  const ex = [
    ["Exemplo · Entregar Lather Machine em Santo Ovídio", "p-rui", "logistica", ymd(amanha), "alta", "p-samuel"],
    ["Exemplo · Levar encomenda a Lisboa", "p-rui", "logistica", ymd(ontem), "alta", "p-wembley"],
    ["Exemplo · Preparar campanha de Natal", "p-goncalo", "marketing", "", "media", "p-marcos"],
  ];
  for (const [titulo, resp, dep, prazo, pri, por] of ex) {
    db.tarefas.push({ id: uid(), modelo: null, marca: "grupo", titulo, freq: "unica", prioridade: pri, notas: "", checklist: [], checklist_periodo: "",
      prazo: prazo || null, departamento_id: dep, responsavel_id: resp, estado: "por_fazer", estado_periodo: "unica", criado_por: por,
      criado_em: new Date(Date.now() - 2 * 864e5).toISOString(), atualizado_em: agora(), concluido_por: null, concluido_em: null });
  }
  // Histórico dos últimos 12 dias para a página "Quem fez o quê"
  const diarias = db.tarefas.filter((t) => t.freq === "diaria" && t.responsavel_id);
  for (let d = 12; d >= 1; d--) {
    const dia = new Date(); dia.setDate(dia.getDate() - d); dia.setHours(9 + (d % 7), 15, 0, 0);
    diarias.forEach((t, i) => {
      if ((d + i) % 4 === 0) return; // nem tudo é feito todos os dias
      db.atividade.push({ id: db.seq++, tarefa_id: t.id, titulo: t.titulo, marca: t.marca, departamento_id: t.departamento_id,
        autor_id: t.responsavel_id, responsavel_id: t.responsavel_id, acao: "concluiu", periodo: ymd(dia), detalhe: {},
        criado_em: new Date(dia.getTime() + i * 600000).toISOString() });
    });
  }
  return db;
}

function ler() {
  try { const s = localStorage.getItem(CHAVE); if (s) return JSON.parse(s); } catch { /* sem armazenamento */ }
  const db = semear(); gravar(db); return db;
}
function gravar(db) { try { localStorage.setItem(CHAVE, JSON.stringify(db)); } catch { /* sem armazenamento */ } }

export function criarDemo() {
  let db = ler();
  let euId = null;
  try { euId = localStorage.getItem(CHAVE_EU); } catch { /* */ }
  const ouvintes = new Set();
  const eu = () => db.perfis.find((p) => p.id === euId && p.ativo) || null;
  const nome = (id) => db.perfis.find((p) => p.id === id)?.nome || "A direção";
  const emitir = (tab, ev, novo, antigo) => ouvintes.forEach((cb) => cb(tab, ev, novo, antigo));

  function registar(r, acao) {
    const a = { id: db.seq++, tarefa_id: r.id, titulo: r.titulo, marca: r.marca, departamento_id: r.departamento_id, autor_id: euId,
      responsavel_id: r.responsavel_id, acao, periodo: r.estado_periodo, detalhe: {}, criado_em: agora() };
    db.atividade.unshift(a); emitir("atividade", "INSERT", a);
  }
  function notificar(dest, tipo, titulo, corpo, link) {
    const n = { id: db.seq++, destinatario_id: dest, tipo, titulo, corpo, link, lida: false, criado_em: agora() };
    db.notificacoes.unshift(n);
    if (dest === euId) emitir("notificacoes", "INSERT", n);
  }

  return {
    modo: "demo",
    pessoas: () => db.perfis.filter((p) => p.ativo),
    async sessao() { return eu() ? { id: euId, email: eu().email } : null; },
    aoMudarSessao() { /* sem eventos externos */ },
    async entrar(id) { if (!db.perfis.find((p) => p.id === id)) throw new Error("Escolhe uma pessoa."); euId = id; try { localStorage.setItem(CHAVE_EU, id); } catch { /* */ } },
    async sair() { euId = null; try { localStorage.removeItem(CHAVE_EU); } catch { /* */ } },
    async mudarPassword() { const p = eu(); if (p) p.mudar_password = false; gravar(db); },
    async meuPerfil(id) { return db.perfis.find((p) => p.id === id) || null; },
    repor() { try { localStorage.removeItem(CHAVE); } catch { /* */ } db = ler(); },

    async carregar() {
      const e = eu();
      const g = eGestor(e);
      return {
        perfis: structuredClone(db.perfis), departamentos: structuredClone(db.departamentos),
        tarefas: structuredClone(db.tarefas.filter((t) => podeVer(e, t))),
        notificacoes: structuredClone(db.notificacoes.filter((n) => n.destinatario_id === euId).slice(0, 100)),
        atividade: structuredClone(db.atividade.filter((a) => g || a.autor_id === euId || a.responsavel_id === euId ||
          (e.papel === "chefe" && a.departamento_id === e.departamento_id))),
        configuracao: [],
      };
    },
    subscrever(_eu, cb) { ouvintes.add(cb); return () => ouvintes.delete(cb); },

    tarefas: {
      async criar(t) {
        const e = eu();
        if (!podeAtribuirA(e, db.perfis.find((p) => p.id === t.responsavel_id))) throw new Error("Não tens permissão para atribuir tarefas a esta pessoa.");
        const r = { id: uid(), modelo: null, marca: "grupo", freq: "unica", estado: "por_fazer", estado_periodo: "unica", prioridade: "media",
          responsavel_id: null, departamento_id: null, prazo: null, notas: "", checklist: [], checklist_periodo: "", ...t,
          criado_por: euId, criado_em: agora(), atualizado_em: agora(), concluido_por: null, concluido_em: null };
        db.tarefas.push(r); registar(r, "criou");
        if (r.responsavel_id && r.responsavel_id !== euId) { registar(r, "atribuiu"); notificar(r.responsavel_id, "tarefa_atribuida", "Nova tarefa para ti", nome(euId) + " atribuiu-te: " + (r.titulo || "Sem título"), "#tarefa-" + r.id); }
        gravar(db); return structuredClone(r);
      },
      async criarVarias(lista) {
        const out = [];
        for (const t of lista) { if (t.modelo && db.tarefas.some((x) => x.modelo === t.modelo)) continue; out.push(await this.criar(t)); }
        return out;
      },
      async atualizar(id, campos) {
        const e = eu();
        const t = db.tarefas.find((x) => x.id === id);
        if (!t) throw new Error("A tarefa já não existe.");
        const antes = { ...t };
        if ("responsavel_id" in campos && campos.responsavel_id !== t.responsavel_id &&
          !podeAtribuirA(e, db.perfis.find((p) => p.id === campos.responsavel_id))) throw new Error("Não tens permissão para atribuir tarefas a esta pessoa.");
        Object.assign(t, campos, { atualizado_em: agora() });
        if (t.estado === "concluido" && (antes.estado !== "concluido" || antes.estado_periodo !== t.estado_periodo)) { t.concluido_por = euId; t.concluido_em = agora(); }
        else if (t.estado !== "concluido") { t.concluido_por = null; t.concluido_em = null; }
        if (t.responsavel_id !== antes.responsavel_id && t.responsavel_id) {
          registar(t, "atribuiu");
          if (t.responsavel_id !== euId) notificar(t.responsavel_id, "tarefa_atribuida", "Nova tarefa para ti", nome(euId) + " atribuiu-te: " + (t.titulo || "Sem título"), "#tarefa-" + t.id);
        }
        if (t.estado !== antes.estado || t.estado_periodo !== antes.estado_periodo) {
          const acao = t.estado === "concluido" ? "concluiu" : antes.estado === "concluido" && t.estado_periodo === antes.estado_periodo ? "reabriu" : t.estado === "em_curso" ? "iniciou" : null;
          if (acao) registar(t, acao);
          if (acao === "concluiu" && t.freq === "unica" && t.criado_por && t.criado_por !== euId)
            notificar(t.criado_por, "tarefa_concluida", "Tarefa concluída", nome(euId) + " concluiu: " + (t.titulo || "Sem título"), "#tarefa-" + t.id);
        }
        gravar(db); return structuredClone(t);
      },
      async apagar(id) {
        const i = db.tarefas.findIndex((x) => x.id === id);
        if (i < 0) return;
        const [t] = db.tarefas.splice(i, 1); registar(t, "eliminou"); gravar(db);
      },
      async obter(id) { return structuredClone(db.tarefas.find((x) => x.id === id) || null); },
      async apagarVarias(ids) {
        const e = eu(), out = [];
        for (const id of ids) {
          const t = db.tarefas.find((x) => x.id === id);
          if (t && (eGestor(e) || t.criado_por === euId || (e.papel === "chefe" && t.departamento_id === e.departamento_id))) { await this.apagar(id); out.push(id); }
        }
        return out;
      },
    },
    notificacoes: {
      async marcarLidas(ids) { db.notificacoes.forEach((n) => { if (ids.includes(n.id)) n.lida = true; }); gravar(db); },
      async apagar(ids) { db.notificacoes = db.notificacoes.filter((n) => !ids.includes(n.id)); gravar(db); },
    },
    perfis: {
      async atualizar(id, campos) {
        const p = db.perfis.find((x) => x.id === id);
        if (p.papel === "ceo" && eu().papel !== "ceo") throw new Error("Só o CEO pode alterar o perfil de CEO.");
        Object.assign(p, campos); gravar(db); emitir("perfis", "UPDATE", p); return structuredClone(p);
      },
      async atualizarMeu(nome, telefone) { const p = eu(); if (nome.trim()) p.nome = nome.trim(); p.telefone = telefone.trim(); gravar(db); },
    },
    departamentos: {
      async criar(d) {
        if (db.departamentos.some((x) => x.id === d.id)) throw new Error("Já existe um departamento com este nome.");
        db.departamentos.push(d); gravar(db); return d;
      },
      async atualizar(id, campos) { const d = db.departamentos.find((x) => x.id === id); Object.assign(d, campos); gravar(db); return d; },
    },
    async empregados(acao, dados) {
      const pass = "Central-" + Math.floor(1000 + Math.random() * 9000) + "-demo";
      if (acao === "criar") {
        if (db.perfis.some((p) => p.email === dados.email.trim().toLowerCase())) throw new Error("Já existe uma conta com este email.");
        const p = { id: uid(), nome: dados.nome.trim(), email: dados.email.trim().toLowerCase(), cargo: dados.cargo || "", departamento_id: dados.departamento_id || null,
          papel: dados.papel || "colaborador", telefone: dados.telefone || "", ativo: true, mudar_password: true, criado_em: agora() };
        db.perfis.push(p); gravar(db); emitir("perfis", "INSERT", p); return { ok: true, id: p.id, password: pass };
      }
      if (acao === "repor_password") return { ok: true, password: pass };
      if (acao === "definir_ativo") { const p = db.perfis.find((x) => x.id === dados.id); p.ativo = !!dados.ativo; gravar(db); emitir("perfis", "UPDATE", p); return { ok: true }; }
      throw new Error("Ação desconhecida.");
    },
    crm: (() => {
      const K = "central26-demo-crm-v1";
      let c = null;
      const ler = () => { if (c) return c; try { c = JSON.parse(localStorage.getItem(K) || "null"); } catch { c = null; } return (c ||= { clientes: [], produtos: [], vendas: [], contactos: [], importacoes: [], seq: 1 }); };
      const guardar = () => { try { localStorage.setItem(K, JSON.stringify(c)); } catch { /* sem espaço: fica só em memória */ } };
      const novoCliente = (o) => ({ id: uid(), codigo_multixop: null, chave_lead: null, nome: "", nome_corrigido: false, nif: "", tipo: "lead", etapa: "lead", origem: "manual", morada: "", codigo_postal: "",
        freguesia: "", concelho: "", distrito: "", telefone: "", email: "", website: "", instagram: "", data_aniversario: null, responsavel_id: null, score: null, notas: "",
        criado_em: agora(), atualizado_em: agora(), atualizado_por: euId, ...o });
      return {
        async carregar() { const d = ler(); return structuredClone({ clientes: d.clientes, produtos: d.produtos, vendas: d.vendas, contactos: d.contactos, importacoes: d.importacoes }); },
        async criar(o) { const d = ler(), r = novoCliente(o); d.clientes.push(r); guardar(); return structuredClone(r); },
        async atualizar(id, campos) {
          const d = ler(), r = d.clientes.find((x) => x.id === id); if (!r) throw new Error("O cliente já não existe.");
          if ("nome" in campos && campos.nome !== r.nome) r.nome_corrigido = true;
          Object.assign(r, campos, { atualizado_em: agora(), atualizado_por: euId }); guardar(); return structuredClone(r);
        },
        async apagar(id) { const d = ler(); d.clientes = d.clientes.filter((x) => x.id !== id); d.contactos = d.contactos.filter((x) => x.cliente_id !== id); guardar(); },
        async contacto(o) { const d = ler(), r = { id: d.seq++, autor_id: euId, criado_em: agora(), ...o }; d.contactos.unshift(r); guardar(); return structuredClone(r); },
        async importar(p) {
          const d = ler(), por = (campo) => new Map(d.clientes.filter((x) => x[campo]).map((x) => [x[campo], x]));
          if (p.produtos) { const m = new Map(d.produtos.map((x) => [x.codigo, x])); p.produtos.forEach((x) => m.set(x.codigo, { ...m.get(x.codigo), ...x })); d.produtos = [...m.values()]; }
          if (p.clientes) { const m = por("codigo_multixop"); p.clientes.forEach((x) => { const e = m.get(x.codigo);
            if (e) { if (!e.nome_corrigido) e.nome = x.nome; e.nif = x.nif; if (e.tipo === "lead") e.tipo = x.tipo; if (!e.morada) e.morada = x.morada || ""; }
            else d.clientes.push(novoCliente({ codigo_multixop: x.codigo, nome: x.nome, nif: x.nif || "", tipo: x.tipo || "particular", morada: x.morada || "", origem: "multixop", etapa: "cliente" })); }); }
          if (p.leads) { const m = por("chave_lead"); p.leads.forEach((x) => { if (m.has(x.chave)) return;
            d.clientes.push(novoCliente({ chave_lead: x.chave, nome: x.nome, origem: "base_leads", distrito: x.distrito || "", concelho: x.concelho || "", morada: x.morada || "",
              telefone: x.telefone || "", email: x.email || "", website: x.website || "", instagram: x.instagram || "", score: x.score ?? null, notas: x.notas || "" })); }); }
          if (p.limpar_de) d.vendas = d.vendas.filter((v) => v.data < p.limpar_de || v.data > p.limpar_ate);
          if (p.vendas) { const k = (v) => v.documento + "#" + v.linha, m = new Map(d.vendas.map((v) => [k(v), v]));
            p.vendas.forEach((v) => m.set(k(v), { documento: v.documento, linha: v.linha, tipo: v.tipo, data: v.data, cliente_codigo: v.cliente, produto_codigo: v.produto, descricao: v.descricao, qtd: v.qtd, preco: v.preco, valor: v.valor }));
            d.vendas = [...m.values()].sort((a, b) => a.data.localeCompare(b.data)); }
          if (p.registo) d.importacoes.unshift({ id: d.seq++, autor_id: euId, ficheiro: p.registo.ficheiro, periodo_de: p.registo.de, periodo_ate: p.registo.ate,
            clientes: p.registo.clientes, leads: p.registo.leads, produtos: p.registo.produtos, vendas: p.registo.vendas, total: p.registo.total, criado_em: agora() });
          guardar(); return { ok: true };
        },
      };
    })(),
    chat: (() => {
      const K = "central26-demo-chat-v1";
      let c = null;
      const ler = () => {
        if (c) return c;
        try { c = JSON.parse(localStorage.getItem(K) || "null"); } catch { c = null; }
        if (!c) {
          c = { canais: [{ id: "geral", tipo: "geral", nome: "Geral", departamento_id: null }].concat(db.departamentos.map((d) => ({ id: "dep-" + d.id, tipo: "departamento", nome: d.nome, departamento_id: d.id }))),
            membros: [], mensagens: [], seq: 1 };
          const t0 = Date.now() - 3 * 3600e3;
          [["p-samuel", "geral", "Bom dia a todos. Exemplo: a reunião de equipa passa para quinta às 10h."], ["p-rui", "geral", "Exemplo: amanhã de manhã levo a Lather Machine a Santo Ovídio."],
           ["p-wembley", "dep-comercial", "Exemplo: tenho 8 clientes regulares atrasados no CRM, vou ligar hoje."]].forEach(([a, canal, texto], i) =>
            c.mensagens.push({ id: c.seq++, canal_id: canal, autor_id: a, texto, mencoes: [], criado_em: new Date(t0 + i * 600e3).toISOString(), editado_em: null, apagado: false }));
        }
        return c;
      };
      const guardar = () => { try { localStorage.setItem(K, JSON.stringify(c)); } catch { /* */ } };
      const vejo = (cn) => { const e = eu(); return cn.tipo === "geral" || (cn.tipo === "departamento" && (eGestor(e) || cn.departamento_id === e.departamento_id)) || (cn.tipo === "direto" && c.membros.some((m) => m.canal_id === cn.id && m.perfil_id === euId)); };
      const lido = (canal) => c.membros.find((m) => m.canal_id === canal && m.perfil_id === euId)?.lido_ate || eu().criado_em;
      return {
        async resumo() {
          ler();
          return c.canais.filter(vejo).map((cn) => {
            const ms = c.mensagens.filter((m) => m.canal_id === cn.id), u = ms[ms.length - 1];
            return { canal_id: cn.id, tipo: cn.tipo, nome: cn.nome, departamento_id: cn.departamento_id, outro_id: c.membros.find((m) => m.canal_id === cn.id && m.perfil_id !== euId)?.perfil_id || null,
              ultima_em: u?.criado_em || null, ultima_texto: u ? (u.apagado ? "" : u.texto.slice(0, 140)) : null, ultimo_autor: u?.autor_id || null,
              por_ler: ms.filter((m) => !m.apagado && m.autor_id !== euId && m.criado_em > lido(cn.id)).length };
          });
        },
        async mensagens(canal, antes) { ler(); const l = c.mensagens.filter((m) => m.canal_id === canal && (!antes || m.criado_em < antes)); return structuredClone(l.slice(-60)); },
        async enviar(canal, texto, mencoes) {
          ler(); const m = { id: c.seq++, canal_id: canal, autor_id: euId, texto: texto.trim(), mencoes, criado_em: agora(), editado_em: null, apagado: false };
          c.mensagens.push(m); guardar();
          const cn = c.canais.find((x) => x.id === canal);
          const dest = cn.tipo === "direto" ? c.membros.filter((x) => x.canal_id === canal && x.perfil_id !== euId).map((x) => x.perfil_id) : mencoes;
          dest.forEach((d) => { const n = db.notificacoes.find((x) => x.destinatario_id === d && x.link === "#chat-" + canal && !x.lida);
            if (n) { n.corpo = texto.slice(0, 120); n.criado_em = agora(); } else notificar(d, "mensagem", cn.tipo === "direto" ? "Mensagem de " + nome(euId) : nome(euId) + " mencionou-te em #" + cn.nome, texto.slice(0, 120), "#chat-" + canal); });
          gravar(db); return structuredClone(m);
        },
        async atualizar(id, campos) {
          ler(); const m = c.mensagens.find((x) => x.id === id); if (!m || m.autor_id !== euId) throw new Error("Só podes alterar as tuas mensagens.");
          if (campos.apagado) Object.assign(m, { apagado: true, texto: "", editado_em: agora() }); else if ("texto" in campos) Object.assign(m, { texto: campos.texto.trim(), editado_em: agora() });
          guardar(); return structuredClone(m);
        },
        async direto(outro) {
          ler(); const chave = [euId, outro].sort().join("|"); let cn = c.canais.find((x) => x.chave === chave);
          if (!cn) { cn = { id: "dm-" + uid(), tipo: "direto", nome: "", departamento_id: null, chave }; c.canais.push(cn);
            c.membros.push({ canal_id: cn.id, perfil_id: euId, lido_ate: agora() }, { canal_id: cn.id, perfil_id: outro, lido_ate: agora() }); guardar(); }
          return cn.id;
        },
        async marcarLido(canal) {
          ler(); const m = c.membros.find((x) => x.canal_id === canal && x.perfil_id === euId);
          if (m) m.lido_ate = agora(); else c.membros.push({ canal_id: canal, perfil_id: euId, lido_ate: agora() });
          db.notificacoes.forEach((n) => { if (n.destinatario_id === euId && n.link === "#chat-" + canal) n.lida = true; }); gravar(db); guardar();
        },
        subscrever() { return () => {}; },
      };
    })(),
    agenda: (() => {
      const K = "central26-demo-agenda-v1";
      let a = null;
      const ler = () => {
        if (a) return a;
        try { a = JSON.parse(localStorage.getItem(K) || "null"); } catch { a = null; }
        if (!a) {
          const em = (dias, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() + dias); d.setHours(h, m, 0, 0); return d.toISOString(); };
          a = [["Exemplo · Reunião com fornecedor de cadeiras", 1, 10, 11, "Escritório de Gaia", ["p-samuel", "p-wembley"], false],
               ["Exemplo · Visita à barbearia de Arcozelo", 2, 15, 16, "Arcozelo", ["p-bruno"], false],
               ["Exemplo · Reunião geral de equipa", 4, 9, 10, "Escritório de Gaia", [], true]].map(([titulo, d, h1, h2, local, participantes, visivel_equipa]) => ({
            id: uid(), titulo, inicio: em(d, h1), fim: em(d, h2), dia_inteiro: false, local, notas: "", participantes, visivel_equipa, lembrete_min: 30, lembrete_enviado: false,
            criado_por: "p-samuel", criado_em: agora(), atualizado_em: agora(), atualizado_por: "p-samuel" }));
        }
        return a;
      };
      const guardar = () => { try { localStorage.setItem(K, JSON.stringify(a)); } catch { /* */ } };
      const gere = () => { const e = eu(); return e.papel === "ceo" || !!e.gere_agenda; };
      return {
        async listar() { const e = eu(); return structuredClone(ler().filter((x) => gere() || x.visivel_equipa || x.participantes.includes(euId))); },
        async criar(o) { if (!gere()) throw new Error("Só o CEO e quem gere a agenda podem criar eventos."); const r = { id: uid(), criado_por: euId, criado_em: agora(), atualizado_em: agora(), atualizado_por: euId, lembrete_enviado: false, ...o };
          ler().push(r); guardar(); r.participantes.filter((p) => p !== euId).forEach((p) => notificar(p, "agenda", "Convite para um evento", r.titulo, "#agenda-" + r.id));
          const ceo = db.perfis.find((p) => p.papel === "ceo"); if (ceo && ceo.id !== euId) notificar(ceo.id, "agenda", "Novo evento na tua agenda", nome(euId) + " marcou: " + r.titulo, "#agenda-" + r.id);
          gravar(db); return structuredClone(r); },
        async atualizar(id, campos) { if (!gere()) throw new Error("Só o CEO e quem gere a agenda podem alterar eventos."); const r = ler().find((x) => x.id === id); Object.assign(r, campos, { atualizado_em: agora(), atualizado_por: euId }); guardar(); return structuredClone(r); },
        async apagar(id) { if (!gere()) throw new Error("Só o CEO e quem gere a agenda podem cancelar eventos."); a = ler().filter((x) => x.id !== id); guardar(); },
        subscrever() { return () => {}; },
      };
    })(),
    log: (() => {
      const K = "central26-demo-log-v1", ficheiros = {};
      let d = null;
      const ler = () => {
        if (d) return d;
        try { d = JSON.parse(localStorage.getItem(K) || "null"); } catch { d = null; }
        if (!d) {
          const L = (nome, morada, tipo, ordem, lat = null, lng = null) => ({ id: uid(), nome, morada, tipo, ordem, lat, lng, ativo: true, criado_em: agora() });
          d = { seq: 1, rotas: [], locais: [
            L("Sede · Ondina e Maia", "Rua do Crasto, 123, 4405-742 Vila Nova de Gaia", "sede", 1), L("26 Tech · Serzedo", "Rua Santa Apolónia, 307, 4410-022 Serzedo, Vila Nova de Gaia", "armazem", 2),
            L("Av. da República, 370 (26 Academy e Grooms)", "Avenida da República, 370, 4430-188 Vila Nova de Gaia", "academia", 3),
            ...["Jardim do Morro", "Madalena", "Santo Ovídio", "Praça da República", "Arcozelo"].map((n, i) => L("Barbearia · " + n, "", "barbearia", 10 + i))], encomendas: [] };
          const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
          [["Exemplo · Barbearia do Zela", "Rua Dom António Barroso, 120, Barcelos", "encomenda", [["MIST", 12], ["CLAY", 6], ["BOOSTER", 4]], "p-wembley", "nova"],
           ["Exemplo · Clínica Estética Coimbra", "Praça 8 de Maio, Coimbra", "maquina", [["Máquina Dioso Laser - 4 Ondas", 1], ["Case Máq. Laser", 1]], "p-samuel", "pronta"],
           ["Exemplo · Barbearia Arcozelo (reposição)", "Arcozelo, Vila Nova de Gaia", "interna", [["Toalhas", 40], ["SPARK", 10]], "p-marcos", "em_preparacao"]].forEach(([cliente_nome, morada, tipo, itens, por, estado], i) =>
            d.encomendas.push({ id: uid(), numero: d.seq++, tipo, estado, prioridade: i === 1 ? "alta" : "media", cliente_nome, crm_cliente_id: null, contacto: "", morada, lat: null, lng: null, morada_geo: "",
              itens: itens.map(([descricao, qtd], j) => ({ id: "i" + j, descricao, qtd, preparado: estado !== "nova" && j === 0 })), notas: "", fatura_numero: "Fac 26DNT/" + (510 + i), fatura_ficheiro: "", fatura_nome: "",
              data_prevista: ymd(amanha), responsavel_id: null, rota_id: null, criado_por: por, criado_em: agora(), atualizado_em: agora(), atualizado_por: por, entregue_em: null, entregue_por: null }));
        }
        return d;
      };
      const guardar = () => { try { localStorage.setItem(K, JSON.stringify(d)); } catch { /* */ } };
      const logi = () => { const e = eu(); return eGestor(e) || e.departamento_id === "logistica"; };
      const podeVer = () => { const e = eu(); return logi() || e.departamento_id === "comercial"; };
      return {
        async carregar() { const x = ler(); if (!podeVer()) return { locais: [], encomendas: [], rotas: [] }; return structuredClone({ locais: x.locais.filter((l) => l.ativo), encomendas: x.encomendas, rotas: x.rotas }); },
        encomendas: {
          async criar(o) {
            if (!podeVer()) throw new Error("Sem permissão para criar encomendas.");
            const x = ler(), r = { id: uid(), numero: x.seq++, tipo: "encomenda", estado: "nova", prioridade: "media", crm_cliente_id: null, contacto: "", morada: "", lat: null, lng: null, morada_geo: "", itens: [], notas: "",
              fatura_numero: "", fatura_ficheiro: "", fatura_nome: "", data_prevista: null, responsavel_id: null, rota_id: null, ...o, criado_por: euId, criado_em: agora(), atualizado_em: agora(), atualizado_por: euId, entregue_em: null, entregue_por: null };
            x.encomendas.push(r); guardar();
            db.perfis.filter((p) => p.ativo && p.id !== euId && (r.responsavel_id ? p.id === r.responsavel_id : p.departamento_id === "logistica"))
              .forEach((p) => notificar(p.id, "encomenda", "Nova encomenda E-" + String(r.numero).padStart(4, "0"), nome(euId) + " · " + r.cliente_nome, "#encomenda-" + r.id));
            gravar(db); return structuredClone(r);
          },
          async atualizar(id, campos) {
            const x = ler(), r = x.encomendas.find((e) => e.id === id); if (!r) throw new Error("A encomenda já não existe.");
            if (!logi()) {
              const so = (k) => Object.keys(campos).every((c) => k.includes(c));
              const ENT = ["pronta", "em_rota", "entregue"];
              const entrega = ENT.includes(r.estado) && ENT.includes(campos.estado ?? r.estado) && so(["estado", "rota_id", "lat", "lng", "morada_geo"]);
              const juntar = !("estado" in campos && campos.estado !== r.estado) && so(["rota_id", "lat", "lng", "morada_geo"]);
              if (!entrega && !juntar) {
                if (["em_rota", "entregue"].includes(campos.estado) && !ENT.includes(r.estado)) throw new Error("A encomenda E-" + String(r.numero).padStart(4, "0") + " ainda não está pronta. Só pode ser entregue depois de a Logística a preparar.");
                if (r.criado_por !== euId) throw new Error("Só a Logística e a direção alteram encomendas de outras pessoas.");
                if (r.estado !== "nova" && campos.estado !== "cancelada") throw new Error("Esta encomenda já está com a Logística. Pede as alterações à Logística ou cancela-a.");
                if (campos.estado && !["nova", "cancelada"].includes(campos.estado)) throw new Error("Só a Logística prepara a encomenda. Podes entregá-la quando estiver pronta.");
              }
            }
            const antes = r.estado;
            if ("morada" in campos && campos.morada !== r.morada && !("morada_geo" in campos)) Object.assign(r, { lat: null, lng: null, morada_geo: "" });
            Object.assign(r, campos, { atualizado_em: agora(), atualizado_por: euId });
            if (r.estado === "entregue" && antes !== "entregue") { r.entregue_em = agora(); r.entregue_por = euId; }
            if (r.estado !== antes && ["pronta", "entregue", "cancelada"].includes(r.estado) && r.criado_por !== euId)
              notificar(r.criado_por, "encomenda", "Encomenda E-" + String(r.numero).padStart(4, "0") + " " + ({ pronta: "pronta", entregue: "entregue", cancelada: "cancelada" })[r.estado], r.cliente_nome + " · " + nome(euId), "#encomenda-" + r.id);
            guardar(); gravar(db); return structuredClone(r);
          },
          async apagar(id) { const x = ler(); x.encomendas = x.encomendas.filter((e) => e.id !== id); guardar(); },
        },
        rotas: {
          async criar(o) { if (!podeVer()) throw new Error("Sem permissão para gerir rotas."); const x = ler(), r = { id: uid(), estado: "planeada", criado_por: euId, criado_em: agora(), atualizado_em: agora(), ...o }; x.rotas.unshift(r); guardar(); return structuredClone(r); },
          async atualizar(id, campos) { const x = ler(), r = x.rotas.find((e) => e.id === id); Object.assign(r, campos, { atualizado_em: agora() }); guardar(); return structuredClone(r); },
          async apagar(id) { const x = ler(); x.rotas = x.rotas.filter((e) => e.id !== id); guardar(); },
        },
        locais: {
          async criar(o) { const x = ler(), r = { id: uid(), tipo: "outro", ordem: 100, ativo: true, lat: null, lng: null, criado_em: agora(), ...o }; x.locais.push(r); guardar(); return structuredClone(r); },
          async atualizar(id, campos) { const x = ler(), r = x.locais.find((e) => e.id === id); Object.assign(r, campos); guardar(); return structuredClone(r); },
        },
        async enviarFatura(encId, f) { const c = "demo/" + encId + "/" + f.name; ficheiros[c] = URL.createObjectURL(f); return c; },
        async urlFatura(c) { if (ficheiros[c]) return ficheiros[c]; throw new Error("No modo de demonstração, a fatura só fica disponível até recarregar a página."); },
        subscrever() { return () => {}; },
      };
    })(),
    aud: (() => {
      const K = "central26-demo-aud-v1";
      let d = null;
      const ler = () => {
        if (d) return d;
        try { d = JSON.parse(localStorage.getItem(K) || "null"); } catch { d = null; }
        if (!d) {
          const segunda = new Date(); segunda.setDate(segunda.getDate() - ((segunda.getDay() + 6) % 7) - 7);
          const I = (id, marca, categoria, problema, prioridade, semana, estado = "novo", responsavel_id = null) => ({ id, marca, categoria, problema, evidencia: "Exemplo para demonstração.", correcao: "", dominio: "",
            origem: "registo", prioridade, impacto: "", esforco: "", responsavel_id, estado, semana, relacionado: [], notas: "", verificacao: "", data_validacao: null, aceite_motivo: "",
            resolvido_por: null, resolvido_em: null, validado_por: null, validado_em: null, aceite_por: null, aceite_em: null, criado_por: "p-isaac", criado_em: agora(), atualizado_por: "p-isaac", atualizado_em: agora() });
          d = {
            config: { inicio: ymd(segunda) },
            itens: [I("EX-01", "academy", "Conteúdo", "Exemplo · Texto provisório na página de cursos", "P0", 1, "em_correcao", "p-isaac"),
              I("EX-02", "twentysix", "SEO", "Exemplo · Link do rodapé devolve erro 404", "P1", 2, "resolvido", "p-isaac"),
              I("EX-03", "grupo", "Continuidade", "Exemplo · Cópias de segurança por testar", "P1", 1, "a_aguardar", "p-samuel"),
              I("EX-04", "barbearia", "SEO", "Exemplo · Meta description vazia na página inicial", "P2", 4, "novo", "p-goncalo"),
              I("EX-05", "academy", "Conformidade", "Exemplo · Política de cookies desatualizada", "P1", 5),
              I("EX-06", "tech", "Acessibilidade", "Exemplo · Imagens sem texto alternativo", "P3", 4)],
            plano: [["Conter", "Eliminar o que está a prejudicar a marca agora"], ["Fechar percursos", "Garantir que nenhum caminho de conversão termina em erro"], ["Performance", "Reduzir peso e tempo de resposta"],
              ["SEO estrutural", "Tornar o site legível para o Google"], ["Conformidade", "Fechar o risco legal e de confiança"], ["Redes sociais", "Transformar audiência em procura"],
              ["Medição", "Passar a decidir com dados"], ["Consolidação", "Deixar o sistema a funcionar com rotina"]].map(([tema, objetivo], i) => ({ semana: i + 1, tema, objetivo, tarefas: "", entregavel: "", estado: "" })),
            referencias: [], historico: [], seq: 1,
          };
        }
        return d;
      };
      const guardar = () => { try { localStorage.setItem(K, JSON.stringify(d)); } catch { /* */ } };
      const pode = () => { const e = eu(); return eGestor(e) || e.departamento_id === "tecnologico"; };
      const hist = (item_id, campo, de, para, nota = "") => ler().historico.unshift({ id: d.seq++, item_id, autor_id: euId, campo, de, para, nota, criado_em: agora() });
      const LIVRES = ["estado", "notas", "verificacao"];
      function aplicar(r, campos) {
        const antes = { ...r }, novo = { ...r, ...campos };
        if (!pode()) {
          if (Object.keys(campos).some((k) => !LIVRES.includes(k))) throw new Error("Só o Tecnológico e a direção alteram os dados do item. Podes mudar o estado e escrever notas.");
          if (["validado", "aceite"].includes(novo.estado) || ["validado", "aceite"].includes(antes.estado)) throw new Error("Só o Tecnológico e a direção validam ou reabrem itens fechados.");
        }
        if (novo.estado === "validado" && antes.estado !== "validado") {
          if (!String(novo.verificacao || "").trim()) throw new Error("Para validar, descreve a evidência da verificação (o que foi testado, quando e com que resultado).");
          Object.assign(novo, { validado_por: euId, validado_em: agora(), data_validacao: novo.data_validacao || ymd(new Date()) });
        } else if (novo.estado !== "validado") Object.assign(novo, { validado_por: null, validado_em: null, ...(antes.estado === "validado" ? { data_validacao: null } : {}) });
        if (novo.estado === "aceite" && antes.estado !== "aceite") {
          if (!eGestor(eu())) throw new Error("Só a direção (CEO ou administração) pode aceitar um risco.");
          if (!String(novo.aceite_motivo || "").trim()) throw new Error("Indica o motivo pelo qual a direção aceita este risco.");
          Object.assign(novo, { aceite_por: euId, aceite_em: agora() });
        } else if (novo.estado !== "aceite") Object.assign(novo, { aceite_por: null, aceite_em: null });
        if (novo.estado === "resolvido" && antes.estado !== "resolvido") Object.assign(novo, { resolvido_por: euId, resolvido_em: agora() });
        Object.assign(r, novo, { atualizado_por: euId, atualizado_em: agora() });
        if (antes.estado !== r.estado) {
          hist(r.id, "estado", antes.estado, r.estado, r.estado === "validado" ? r.verificacao : r.estado === "aceite" ? r.aceite_motivo : "");
          if (r.estado === "resolvido") db.perfis.filter((p) => p.ativo && p.departamento_id === "tecnologico" && p.id !== euId).forEach((p) => notificar(p.id, "auditoria", "Por validar · " + r.id, nome(euId) + " marcou como resolvido: " + r.problema, "#auditoria-" + r.id));
          if (["validado", "aceite"].includes(r.estado) && r.responsavel_id && r.responsavel_id !== euId) notificar(r.responsavel_id, "auditoria", r.id + (r.estado === "validado" ? " · Validado" : " · Aceite pela administração"), r.problema, "#auditoria-" + r.id);
        }
        if (antes.responsavel_id !== r.responsavel_id) {
          hist(r.id, "responsavel", antes.responsavel_id ? nome(antes.responsavel_id) : null, r.responsavel_id ? nome(r.responsavel_id) : null);
          if (r.responsavel_id && r.responsavel_id !== euId) notificar(r.responsavel_id, "auditoria", "Item da auditoria atribuído a ti · " + r.id, r.problema, "#auditoria-" + r.id);
        }
        if (antes.prioridade !== r.prioridade) hist(r.id, "prioridade", antes.prioridade, r.prioridade);
        if (antes.semana !== r.semana) hist(r.id, "semana", String(antes.semana ?? ""), String(r.semana ?? ""));
      }
      return {
        async carregar() {
          const x = ler(), p = pode();
          const itens = x.itens.filter((i) => p || i.responsavel_id === euId);
          return structuredClone({ itens, plano: p || itens.length ? x.plano : [], referencias: p ? x.referencias : [], config: x.config });
        },
        async historico(id) { return structuredClone(ler().historico.filter((h) => h.item_id === id)); },
        itens: {
          async criar(i) {
            if (!pode()) throw new Error("Só o Tecnológico e a direção criam itens no registo.");
            const x = ler(); if (x.itens.some((y) => y.id === i.id)) throw new Error("Já existe um item com o código " + i.id + ".");
            const r = { marca: "grupo", categoria: "", evidencia: "", correcao: "", dominio: "", origem: "manual", prioridade: "P2", impacto: "", esforco: "", responsavel_id: null, estado: "novo", semana: null, relacionado: [], notas: "",
              verificacao: "", data_validacao: null, aceite_motivo: "", ...i, criado_por: euId, criado_em: agora(), atualizado_por: euId, atualizado_em: agora() };
            x.itens.push(r); hist(r.id, "criado", null, r.estado);
            if (r.responsavel_id && r.responsavel_id !== euId) notificar(r.responsavel_id, "auditoria", "Item da auditoria atribuído a ti · " + r.id, r.problema, "#auditoria-" + r.id);
            guardar(); gravar(db); return structuredClone(r);
          },
          async atualizar(id, campos) {
            const x = ler(), r = x.itens.find((i) => i.id === id); if (!r) throw new Error("O item já não existe.");
            if (!pode() && r.responsavel_id !== euId) throw new Error("Este item não está atribuído a ti.");
            aplicar(r, campos); guardar(); gravar(db); return structuredClone(r);
          },
          async apagar(id) { if (!pode()) throw new Error("Só o Tecnológico e a direção eliminam itens."); const x = ler(); x.itens = x.itens.filter((i) => i.id !== id); guardar(); },
        },
        async plano(semana, campos) { if (!pode()) throw new Error("Só o Tecnológico e a direção alteram o plano."); const r = ler().plano.find((s) => s.semana === semana); Object.assign(r, campos); guardar(); return structuredClone(r); },
        async inicio(data) { if (!pode()) throw new Error("Só o Tecnológico e a direção alteram o plano."); ler().config.inicio = data || null; guardar(); return structuredClone(d.config); },
        async importar(p) {
          if (!pode()) throw new Error("Só o Tecnológico e a direção importam o registo da auditoria.");
          const x = ler(); let novos = 0, existentes = 0;
          for (const i of p.itens || []) {
            const r = x.itens.find((y) => y.id === i.id);
            if (r) {
              for (const k of ["categoria", "evidencia", "correcao", "dominio", "impacto", "esforco"]) if (!r[k] && i[k]) r[k] = i[k];
              r.relacionado = [...new Set([...(r.relacionado || []), ...(i.relacionado || [])])].sort(); existentes++;
            } else {
              const estado = ["validado", "aceite"].includes(i.estado) ? "resolvido" : i.estado || "novo";
              x.itens.push({ marca: "grupo", categoria: "", evidencia: "", correcao: "", dominio: "", origem: "registo", prioridade: "P2", impacto: "", esforco: "", responsavel_id: null, semana: null, relacionado: [], notas: "",
                verificacao: "", data_validacao: null, aceite_motivo: "", ...i, estado, criado_por: euId, criado_em: agora(), atualizado_por: euId, atualizado_em: agora() });
              hist(i.id, "criado", null, estado); novos++;
            }
          }
          for (const s of p.plano || []) { const r = x.plano.find((y) => y.semana === s.semana); if (r) Object.assign(r, s); else x.plano.push({ estado: "", ...s }); }
          x.plano.sort((a, b) => a.semana - b.semana);
          for (const ref of p.referencias || []) { x.referencias = x.referencias.filter((y) => y.tipo !== ref.tipo).concat([{ ...ref, atualizado_em: agora() }]); }
          x.referencias.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
          guardar(); return { novos, existentes, semanas: (p.plano || []).length, referencias: (p.referencias || []).length };
        },
        subscrever() { return () => {}; },
      };
    })(),
    op: (() => {
      const K = "central26-demo-op-v1";
      let d = null;
      const F = (nome, categoria, estado, extra = {}) => ({ id: uid(), nome, nif: "", categoria, estado, marcas: [], produtos: "", contacto_nome: "", telefone: "", email: "", site: "", morada: "", localidade: "", pais: "Portugal",
        prazo_pagamento: "", prazo_entrega: "", encomenda_minima: "", avaliacao: null, responsavel_id: null, proximo_contacto: null, notas: "", origem: "manual", criado_por: "p-bruno", criado_em: agora(), atualizado_por: "p-bruno", atualizado_em: agora(), ...extra });
      const ler = () => {
        if (d) return d;
        try { d = JSON.parse(localStorage.getItem(K) || "null"); } catch { d = null; }
        if (!d) {
          const hoje = ymd(new Date());
          const a = F("Exemplo · Transportadora expresso", "Transportes e envios", "ativo", { marcas: ["twentysix", "tech"], produtos: "Envios nacionais em 24 horas", localidade: "Maia", avaliacao: 4, prazo_entrega: "24 horas" });
          const b = F("Exemplo · Embalagens e cartão", "Matérias-primas e embalagens", "potencial", { marcas: ["twentysix"], produtos: "Caixas de cartão e etiquetas", localidade: "Santa Maria da Feira", responsavel_id: "p-bruno", proximo_contacto: hoje });
          const c = F("Exemplo · Gráfica digital", "Serviços", "contactado", { marcas: ["barbearia", "academy"], produtos: "Cartões, flyers e lonas", localidade: "Porto" });
          const p = { id: uid(), numero: 1, titulo: "Exemplo · Caixas de envio para a loja online", descricao: "Caixas de cartão com a marca, dois tamanhos.", categoria: "Matérias-primas e embalagens", marca: "twentysix", quantidade: "500 unidades",
            prazo: ymd(new Date(Date.now() + 5 * 864e5)), estado: "a_comparar", responsavel_id: "p-bruno", escolhida_id: null, decisao: "", criado_por: "p-bruno", criado_em: agora(), atualizado_em: agora() };
          const P = (forn, estado, preco, prazo) => ({ id: uid(), pedido_id: p.id, fornecedor_id: forn.id, estado, preco, preco_base: "total", iva_incluido: false, prazo_entrega: prazo, condicoes: "", validade: null, notas: "", pedida_em: agora(), recebida_em: estado === "recebida" ? agora() : null, atualizado_em: agora() });
          d = { fornecedores: [a, b, c], contactos: [{ id: uid(), fornecedor_id: b.id, tipo: "email", resumo: "Pedido de catálogo e preços enviado.", proximo_passo: "Ligar se não responderem", data: agora(), autor_id: "p-bruno", criado_em: agora() }],
            pedidos: [p], propostas: [P(b, "recebida", 410, "10 dias úteis"), P(c, "pedida", null, "")], seq: 2 };
        }
        return d;
      };
      const guardar = () => { try { localStorage.setItem(K, JSON.stringify(d)); } catch { /* */ } };
      const pode = () => { const e = eu(); return eGestor(e) || e.departamento_id === "operacional"; };
      const exige = () => { if (!pode()) throw new Error("Só o Operacional e a direção gerem os fornecedores."); };
      const upd = (lista, id, campos) => { const r = lista.find((x) => x.id === id); if (!r) throw new Error("O registo já não existe."); Object.assign(r, campos, { atualizado_em: agora() }); return r; };
      return {
        async carregar() { if (!pode()) return { fornecedores: [], pedidos: [], propostas: [] }; const x = ler(); return structuredClone({ fornecedores: x.fornecedores, pedidos: x.pedidos, propostas: x.propostas }); },
        async contactos(fid) { exige(); return structuredClone(ler().contactos.filter((c) => c.fornecedor_id === fid).sort((a, b) => b.data.localeCompare(a.data))); },
        fornecedores: {
          async criar(f) { exige(); const x = ler(); if (x.fornecedores.some((y) => y.nome.toLowerCase() === f.nome.trim().toLowerCase())) throw new Error("Já existe um fornecedor com este nome."); const r = F(f.nome.trim(), "", "ativo", { ...f, criado_por: euId, atualizado_por: euId }); x.fornecedores.push(r); guardar(); return structuredClone(r); },
          async atualizar(id, campos) { exige(); const r = upd(ler().fornecedores, id, { ...campos, atualizado_por: euId }); guardar(); return structuredClone(r); },
          async apagar(id) { exige(); const x = ler(); x.fornecedores = x.fornecedores.filter((f) => f.id !== id); x.propostas = x.propostas.filter((p) => p.fornecedor_id !== id); x.contactos = x.contactos.filter((c) => c.fornecedor_id !== id); guardar(); },
        },
        contacto: {
          async criar(c) { exige(); const r = { id: uid(), tipo: "chamada", proximo_passo: "", data: agora(), autor_id: euId, criado_em: agora(), ...c }; ler().contactos.push(r); guardar(); return structuredClone(r); },
          async apagar(id) { exige(); d.contactos = ler().contactos.filter((c) => c.id !== id); guardar(); },
        },
        pedidos: {
          async criar(p) {
            exige(); const x = ler(); const r = { id: uid(), numero: x.seq++, descricao: "", categoria: "", marca: "grupo", quantidade: "", prazo: null, estado: "aberto", responsavel_id: null, escolhida_id: null, decisao: "", criado_por: euId, criado_em: agora(), atualizado_em: agora(), ...p };
            x.pedidos.unshift(r);
            if (r.responsavel_id && r.responsavel_id !== euId) notificar(r.responsavel_id, "operacional", "Pedido de orçamento atribuído a ti · P-" + String(r.numero).padStart(3, "0"), r.titulo, "#pedido-" + r.id);
            guardar(); gravar(db); return structuredClone(r);
          },
          async atualizar(id, campos) {
            exige(); const antes = ler().pedidos.find((p) => p.id === id)?.responsavel_id; const r = upd(d.pedidos, id, campos);
            if (r.responsavel_id && r.responsavel_id !== antes && r.responsavel_id !== euId) notificar(r.responsavel_id, "operacional", "Pedido de orçamento atribuído a ti · P-" + String(r.numero).padStart(3, "0"), r.titulo, "#pedido-" + r.id);
            guardar(); gravar(db); return structuredClone(r);
          },
          async apagar(id) { exige(); const x = ler(); x.pedidos = x.pedidos.filter((p) => p.id !== id); x.propostas = x.propostas.filter((p) => p.pedido_id !== id); guardar(); },
        },
        propostas: {
          async criar(p) {
            exige(); const x = ler(); if (x.propostas.some((y) => y.pedido_id === p.pedido_id && y.fornecedor_id === p.fornecedor_id)) throw new Error("Este fornecedor já está no pedido.");
            const r = { id: uid(), estado: "pedida", preco: null, preco_base: "total", iva_incluido: false, prazo_entrega: "", condicoes: "", validade: null, notas: "", pedida_em: agora(), recebida_em: null, atualizado_em: agora(), ...p };
            x.propostas.push(r); guardar(); return structuredClone(r);
          },
          async atualizar(id, campos) { exige(); const r = upd(ler().propostas, id, campos); if (["recebida", "escolhida"].includes(r.estado) && !r.recebida_em) r.recebida_em = agora(); guardar(); return structuredClone(r); },
          async apagar(id) { exige(); d.propostas = ler().propostas.filter((p) => p.id !== id); guardar(); },
        },
        async escolher(id, decisao) {
          exige(); const x = ler(), pr = x.propostas.find((p) => p.id === id); if (!pr) throw new Error("A proposta já não existe.");
          x.propostas.filter((p) => p.pedido_id === pr.pedido_id).forEach((p) => { p.estado = p.id === id ? "escolhida" : "recusada"; if (p.id === id && !p.recebida_em) p.recebida_em = agora(); });
          Object.assign(x.pedidos.find((p) => p.id === pr.pedido_id), { estado: "decidido", escolhida_id: id, decisao: decisao || "", atualizado_em: agora() });
          const f = x.fornecedores.find((y) => y.id === pr.fornecedor_id); if (f) f.estado = "ativo";
          guardar();
        },
        async importar(p) {
          exige(); const x = ler(); let novos = 0, existentes = 0;
          for (const f of p.fornecedores || []) {
            const nome = String(f.nome || "").trim(); if (!nome) continue;
            const r = x.fornecedores.find((y) => y.nome.toLowerCase() === nome.toLowerCase());
            if (r) { for (const k of ["nif", "categoria", "produtos", "telefone", "email", "site"]) if (!r[k] && f[k]) r[k] = f[k]; r.marcas = [...new Set([...r.marcas, ...(f.marcas || [])])]; existentes++; }
            else { x.fornecedores.push(F(nome, f.categoria || "", f.estado || "ativo", { ...f, nome, origem: f.origem || "importacao", criado_por: euId, atualizado_por: euId })); novos++; }
          }
          guardar(); return { novos, existentes };
        },
        subscrever() { return () => {}; },
      };
    })(),
    fin: (() => {
      const K = "central26-demo-fin-v1";
      let d = null;
      const ler = () => {
        if (d) return d;
        try { d = JSON.parse(localStorage.getItem(K) || "null"); } catch { d = null; }
        if (!d) {
          // valores inventados, só para mostrar o funcionamento
          const espacos = [["Madalena", 9000, 450], ["Avenida", 10000, 1500], ["Porto", 3500, 1200], ["Santo Ovídio", 4000, 400], ["Arcozelo", 10500, 550]];
          d = { meses: [], linhas: [], faturacao: [], rubricas: [] };
          ["2026-01", "2026-02", "2026-03"].forEach((mes, k) => {
            d.meses.push({ mes, ficheiro: "Exemplo - " + mes + ".xlsx", assinatura: mes, assinatura_custos: mes, avisos: [], importado_por: "p-samuel", importado_em: agora() });
            espacos.forEach(([e, fat, renda], i) => {
              d.faturacao.push({ mes, espaco: e, total: fat + k * 400 + i * 50, numerario: Math.round(fat * 0.2), mb: Math.round(fat * 0.8), ft: Math.round(fat * 0.15), vencimentos: Math.round(fat * 0.48) });
              d.linhas.push({ mes, area: "barbearias", grupo: e, rubrica: "RENDA", base: renda, iva: 0, sem: 0 }, { mes, area: "barbearias", grupo: e, rubrica: "ÁGUA", base: 30 + i * 4, iva: 0, sem: 0 },
                { mes, area: "barbearias", grupo: e, rubrica: "ELETRICIDADE", base: 80 + i * 12 + k * 5, iva: 0, sem: 0 });
            });
            [["MEO", 310], ["ARMAZÉM", 1800], ["ELETRICIDADE ARMAZÉM", 250 + k * 20], ["ZURICH", 600], ["VIA VERDE", 120 + k * 10], ["NACEX", 180], ["SEGURANÇA SOCIAL", 515]].forEach(([r, v]) =>
              d.linhas.push({ mes, area: r === "SEGURANÇA SOCIAL" ? "impostos" : "partilhadas", grupo: "", rubrica: r, base: v, iva: 0, sem: 0 }));
          });
        }
        return d;
      };
      const guardar = () => { try { localStorage.setItem(K, JSON.stringify(d)); } catch { /* */ } };
      const pode = () => eGestor(eu());
      return {
        async carregar() { if (!pode()) throw new Error("Só a direção tem acesso ao Financeiro."); return structuredClone(ler()); },
        async importar(p) {
          if (!pode()) throw new Error("Só a direção importa os dados financeiros.");
          const x = ler();
          for (const m of p.meses || []) {
            x.meses = x.meses.filter((y) => y.mes !== m.mes).concat([{ mes: m.mes, ficheiro: m.ficheiro, assinatura: m.assinatura, assinatura_custos: m.assinatura_custos, avisos: m.avisos || [], importado_por: euId, importado_em: agora() }]);
            x.linhas = x.linhas.filter((l) => l.mes !== m.mes).concat((m.linhas || []).map((l) => ({ mes: m.mes, ...l })));
            x.faturacao = x.faturacao.filter((f) => f.mes !== m.mes).concat((m.faturacao || []).map((f) => ({ mes: m.mes, ...f })));
          }
          x.meses.sort((a, b) => a.mes.localeCompare(b.mes)); guardar(); return { meses: (p.meses || []).length };
        },
        async rubrica(chave, categoria) { if (!pode()) throw new Error("Só a direção altera o Financeiro."); const x = ler(); x.rubricas = x.rubricas.filter((r) => r.chave !== chave).concat([{ chave, categoria }]); guardar(); return { chave, categoria }; },
        async apagarMes(mes) { if (!pode()) throw new Error("Só a direção altera o Financeiro."); const x = ler(); x.meses = x.meses.filter((m) => m.mes !== mes); x.linhas = x.linhas.filter((l) => l.mes !== mes); x.faturacao = x.faturacao.filter((f) => f.mes !== mes); guardar(); },
      };
    })(),
    mk: (() => {
      const K = "central26-demo-mk-v1";
      let d = null;
      const P = (marca, titulo, dias, estado, tipo, extra = {}) => { const dt = dias == null ? null : ymd(new Date(Date.now() + dias * 864e5));
        return { id: uid(), origem_id: null, marca, titulo, data: dt, hora: "", tipo, plataformas: ["Instagram"], estado, link: "", copy: "", notas: "", inspiracao: "", responsavel_id: "p-goncalo",
          criado_por: "p-goncalo", criado_em: agora(), atualizado_por: "p-goncalo", atualizado_em: agora(), ...extra }; };
      const ler = () => {
        if (d) return d;
        try { d = JSON.parse(localStorage.getItem(K) || "null"); } catch { d = null; }
        if (!d) d = {
          publicacoes: [P("barbearia", "Exemplo · Detalhes do espaço", -3, "publicado", "Foto", { copy: "Cada detalhe conta. #barbearia26dejunho" }), P("academy", "Exemplo · Entrega de diplomas", 1, "pronto", "Vídeo"),
            P("twentysix", "Exemplo · Produto em destaque", 2, "em_producao", "Reel"), P("grooms", "Exemplo · Preparação do noivo", 5, "planeado", "Carrossel"),
            P("barbearia", "Exemplo · Ideia: antes e depois", null, "ideia", "Foto")],
          documentos: [{ id: uid(), origem_id: null, marca: "twentysix", titulo: "Exemplo · Guião de vídeo", conteudo: "**Cena 1**\n\n- Close do produto\n- Aplicação\n\n**Cena 2**\n\nVoz-off: «O detalhe é tudo.»", criado_por: "p-goncalo", criado_em: agora(), atualizado_por: "p-goncalo", atualizado_em: agora() }],
        };
        return d;
      };
      const guardar = () => { try { localStorage.setItem(K, JSON.stringify(d)); } catch { /* */ } };
      const pode = () => { const e = eu(); return eGestor(e) || e.departamento_id === "marketing"; };
      const exige = () => { if (!pode()) throw new Error("Só o Marketing e a direção gerem o calendário."); };
      const upd = (l, id, c) => { const r = l.find((x) => x.id === id); if (!r) throw new Error("Já não existe."); Object.assign(r, c, { atualizado_por: euId, atualizado_em: agora() }); return r; };
      return {
        async carregar() { if (!pode()) return { publicacoes: [], documentos: [] }; return structuredClone(ler()); },
        pub: {
          async criar(x) { exige(); const r = { ...P("grupo", "", null, "ideia", ""), responsavel_id: null, plataformas: [], ...x, criado_por: euId, atualizado_por: euId }; ler().publicacoes.push(r);
            if (r.responsavel_id && r.responsavel_id !== euId) notificar(r.responsavel_id, "marketing", "Publicação atribuída a ti", r.titulo, "#publicacao-" + r.id); guardar(); gravar(db); return structuredClone(r); },
          async atualizar(id, c) { exige(); const antes = ler().publicacoes.find((x) => x.id === id)?.responsavel_id; const r = upd(d.publicacoes, id, c);
            if (r.responsavel_id && r.responsavel_id !== antes && r.responsavel_id !== euId) notificar(r.responsavel_id, "marketing", "Publicação atribuída a ti", r.titulo, "#publicacao-" + r.id); guardar(); gravar(db); return structuredClone(r); },
          async apagar(id) { exige(); d.publicacoes = ler().publicacoes.filter((x) => x.id !== id); guardar(); },
        },
        doc: {
          async criar(x) { exige(); const r = { id: uid(), origem_id: null, marca: "grupo", conteudo: "", ...x, criado_por: euId, criado_em: agora(), atualizado_por: euId, atualizado_em: agora() }; ler().documentos.push(r); guardar(); return structuredClone(r); },
          async atualizar(id, c) { exige(); const r = upd(ler().documentos, id, c); guardar(); return structuredClone(r); },
          async apagar(id) { exige(); d.documentos = ler().documentos.filter((x) => x.id !== id); guardar(); },
        },
        async importar(p) {
          exige(); const x = ler(); let a = 0, b = 0;
          for (const i of p.publicacoes || []) { if (!i.titulo || x.publicacoes.some((y) => y.origem_id && y.origem_id === i.origem_id)) continue; x.publicacoes.push({ ...P("grupo", "", null, "ideia", ""), responsavel_id: null, plataformas: [], ...i, criado_por: euId }); a++; }
          for (const i of p.documentos || []) { if (!i.titulo || x.documentos.some((y) => y.origem_id && y.origem_id === i.origem_id)) continue; x.documentos.push({ id: uid(), ...i, criado_por: euId, criado_em: agora(), atualizado_por: euId, atualizado_em: agora() }); b++; }
          guardar(); return { publicacoes: a, documentos: b };
        },
        subscrever() { return () => {}; },
      };
    })(),
    push: {
      async chave() { throw new Error("As notificações no telemóvel não funcionam no modo de demonstração."); },
      async registar() { /* */ },
      async teste() { throw new Error("As notificações no telemóvel não funcionam no modo de demonstração."); },
    },
  };
}
