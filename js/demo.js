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
  id, nome, cargo, departamento_id, papel, email: id.slice(2) + "@exemplo.pt", telefone: "", ativo: true, mudar_password: false,
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
    push: {
      async chave() { throw new Error("As notificações no telemóvel não funcionam no modo de demonstração."); },
      async registar() { /* */ },
      async teste() { throw new Error("As notificações no telemóvel não funcionam no modo de demonstração."); },
    },
  };
}
