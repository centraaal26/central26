// Modo de demonstração: imita a base de dados dentro do navegador (abrir a app com ?demo).
// Serve para mostrar a app e testá-la sem mexer nos dados reais. Nada sai deste aparelho.
import { MODELOS } from "./modelos.js";
import { periodo, ymd, podeVer, podeAtribuirA, eGestor, semanaIso, temEuros } from "./dados.js";
import { CATALOGO_STK } from "./stocks-catalogo.js";
import { totais } from "./proformas.js";

const CHAVE = "central26-demo-v1";
const CHAVE_EU = "central26-demo-eu";

const DEPS = [
  ["direcao", "Direção", 1], ["administrativo", "Administrativo e Operacional", 2], ["operacional", "Operacional", 3],
  ["comercial", "Comercial", 4], ["marketing", "Marketing e Multimédia", 5], ["logistica", "Logística", 6], ["tecnologico", "Tecnológico", 7], ["barbearias", "Barbearias", 8],
].map(([id, nome, ordem]) => ({ id, nome, ordem }));

const PESSOAS = [
  ["p-marcos", "Marcos Maia", "CEO", "direcao", "ceo"],
  ["p-samuel", "Samuel Maia", "Diretor Administrativo e Operacional", "administrativo", "admin"],
  ["p-bruno", "Bruno Santos", "Departamento Operacional", "operacional", "chefe"],
  ["p-goncalo", "Gonçalo Monteiro", "Departamento de Marketing", "marketing", "chefe"],
  ["p-wembley", "Wembley Costa", "Departamento Comercial", "comercial", "chefe"],
  ["p-rui", "Rui Neves", "Departamento de Logística", "logistica", "chefe"],
  ["p-isaac", "Isaac Maia", "Departamento Tecnológico", "tecnologico", "admin"],
  ["p-loja", "Responsável de Loja (exemplo)", "Responsável da loja", "operacional", "colaborador"],
  ["p-mkt", "Colaborador de Marketing (exemplo)", "Conteúdos e redes sociais", "marketing", "colaborador"],
  ["p-barbeiro", "Barbeiro (exemplo)", "Barbeiro", "barbearias", "colaborador"],
].map(([id, nome, cargo, departamento_id, papel]) => ({
  id, nome, cargo, departamento_id, papel, email: id.slice(2) + "@exemplo.pt", telefone: "", ativo: true, mudar_password: false, gere_agenda: id === "p-samuel",
  restrito: id === "p-mkt", supervisor_id: id === "p-mkt" ? "p-goncalo" : null,
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
  // dados de demonstração antigos: junta a pessoa com acesso limitado (exemplo) e as propostas do assistente
  ["p-mkt", "p-barbeiro"].forEach((id) => { if (!db.perfis.some((p) => p.id === id)) { db.perfis.push(structuredClone(PESSOAS.find((p) => p.id === id))); gravar(db); } });
  if (!db.departamentos.some((d) => d.id === "barbearias")) { db.departamentos.push(structuredClone(DEPS.find((d) => d.id === "barbearias"))); gravar(db); }
  if (!db.propostas) {
    const dia = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
    db.propostas = [
      ["Gravar stories na loja de Gaia", "Três stories curtos com o antes e depois de um corte.", "barbearia", "alta", dia(2), "Há duas publicações da Barbearia esta semana sem vídeo preparado."],
      ["Preparar as fotos dos produtos novos", "Fundo branco, três ângulos por produto.", "twentysix", "media", dia(5), "A campanha de Natal precisa de fotos e ninguém tem esta tarefa."],
    ].map(([titulo, notas, marca, prioridade, prazo, motivo]) => ({ id: uid(), lote: "l-exemplo", tipo: "nova", destinatario_id: "p-mkt", aprovador_id: "p-goncalo", pedido_por: "p-goncalo",
      tarefa_id: null, publicacao_id: null, titulo: "Exemplo · " + titulo, notas, marca, prioridade, prazo, motivo, estado: "pendente", decidido_por: null, decidido_em: null, criado_em: agora() }));
    gravar(db);
  }
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
  const ganchos = {}; // ligação entre módulos da demonstração (encomendas → stocks)
  function notificar(dest, tipo, titulo, corpo, link) {
    const n = { id: db.seq++, destinatario_id: dest, tipo, titulo, corpo, link, lida: false, criado_em: agora() };
    db.notificacoes.unshift(n);
    if (dest === euId) emitir("notificacoes", "INSERT", n);
  }

  const API = {
    modo: "demo",
    pessoas: () => db.perfis.filter((p) => p.ativo),
    async sessao() { return eu() ? { id: euId, email: eu().email } : null; },
    aoMudarSessao() { /* sem eventos externos */ },
    async entrar(id) { if (!db.perfis.find((p) => p.id === id)) throw new Error("Escolhe uma pessoa."); euId = id; try { localStorage.setItem(CHAVE_EU, id); } catch { /* */ } },
    async sair() { euId = null; try { localStorage.removeItem(CHAVE_EU); } catch { /* */ } },
    async mudarPassword() { const p = eu(); if (p) p.mudar_password = false; gravar(db); },
    async meuPerfil(id) { return db.perfis.find((p) => p.id === id) || null; },
    async nacex(acao, dados) { return ganchos.nacex(acao, dados || {}); },
    // Impressão automática no modo de demonstração: a estação fica só neste aparelho e não imprime nada
    impressao: {
      async estado() { let n = null; try { n = localStorage.getItem("central26-estacao-etiquetas"); } catch {} return { estacao: n }; },
      async batimento() {}, async desligar() {},
      async pedir() { throw new Error("No modo de demonstração não há etiquetas reais para imprimir."); },
      async teste() { ganchos.impTeste = { id: Date.now(), tipo: "teste", por: "Exemplo", pedido_em: new Date().toISOString() }; return true; },
      async reclamar() { const j = ganchos.impTeste || null; ganchos.impTeste = null; return j; }, async concluir() {},
      subscrever() { return () => {}; },
    },
    // Leitura de caixa (exemplo): sem IA, a «leitura» devolve sempre o mesmo exemplo
    caixa: (() => {
      const dia = (n) => ymd(new Date(Date.now() - n * 864e5));
      const ex = (n, f) => [{ barbeiro: "JOAO", servico: "CABELO", qtd: 7 - f, valor: (7 - f) * 16 }, { barbeiro: "JOAO", servico: "COMBO", qtd: 4, valor: 96 }, { barbeiro: "NUNO", servico: "CABELO", qtd: 3 + f, valor: (3 + f) * 16 }, { barbeiro: "NUNO", servico: "COMBO", qtd: 2, valor: 48 }];
      const soma = (e) => e.reduce((t, x) => t + x.valor, 0);
      const w = { leituras: [1, 2, 3, 4].map((n) => { const e = ex(n, n % 3); return { id: uid(), loja_id: "madalena", dia: dia(n), entradas: e, total_entradas: soma(e), total_faturado: Math.round(soma(e) * 0.45), pagamentos: { MULTIBANCO: Math.round(soma(e) * 0.45) }, criado_em: agora() }; }),
        alias: [{ loja_id: "madalena", nome: "JOAO", perfil_id: "p-barbeiro" }] };
      return {
        async carregar(loja) { return structuredClone({ leituras: w.leituras.filter((l) => l.loja_id === loja).sort((a, b) => (a.dia < b.dia ? 1 : -1)), alias: w.alias.filter((a) => a.loja_id === loja) }); },
        async ler() {
          await new Promise((r) => setTimeout(r, 900));
          return { ok: true, dia: dia(0), intervalo: "exemplo", entradas: ex(0, 0), soma_entradas: 304, faturado: 136, pagamentos: { MULTIBANCO: 136 }, avisos: ["Modo de demonstração: esta leitura é sempre o mesmo exemplo, sem ler a foto."] };
        },
        async guardar(r) {
          const l = { ...(w.leituras.find((x) => x.id === r.id || (x.loja_id === r.loja_id && x.dia === r.dia)) || { id: uid(), criado_em: agora() }), ...r, total_entradas: soma(r.entradas) };
          if (!l.id) l.id = uid();
          w.leituras = [l, ...w.leituras.filter((x) => x.id !== l.id && !(x.loja_id === l.loja_id && x.dia === l.dia))]; return structuredClone(l);
        },
        async apagar(id) { w.leituras = w.leituras.filter((x) => x.id !== id); },
        async alias(loja, nome, perfil) { w.alias = w.alias.filter((a) => !(a.loja_id === loja && a.nome === nome)); if (perfil) w.alias.push({ loja_id: loja, nome, perfil_id: perfil }); },
        async meus(de, ate) {
          const a = w.alias.filter((x) => x.perfil_id === euId);
          const linhas = w.leituras.filter((l) => l.dia >= de && l.dia <= ate && a.some((x) => x.loja_id === l.loja_id)).flatMap((l) => l.entradas.map((e) => ({ ...e, loja_id: l.loja_id, dia: l.dia })));
          const minhas = linhas.filter((e) => a.some((x) => x.loja_id === e.loja_id && x.nome === e.barbeiro)).map((e) => ({ loja_id: e.loja_id, dia: e.dia, servico: e.servico, qtd: e.qtd, valor: e.valor }));
          const n = new Set(linhas.map((e) => e.barbeiro)).size || 1;
          return { ligado: a.length > 0, linhas: minhas, lojas: a.length ? [{ loja_id: a[0].loja_id, barbeiros: n, dias: new Set(linhas.map((e) => e.dia)).size, media_valor: soma(linhas) / n, media_servicos: linhas.reduce((t, e) => t + e.qtd, 0) / n }] : [] };
        },
      };
    })(),
    // Loja online (exemplo): vendas fictícias do site, sem ligação real
    woo: (() => {
      let w = null;
      const gerar = () => {
        const prods = [[101, "Cera modeladora 100 ml (exemplo)", 19.5, "E01"], [102, "Óleo para barba 30 ml (exemplo)", 18.9, "E04"], [103, "Pó texturizante (exemplo)", 16.5, null], [104, "Champô 1000 ml (exemplo)", 34.9, null]];
        const locs = ["Vila Nova de Gaia", "Porto", "Lisboa", "Braga", "Maia", "Matosinhos", "Coimbra", "Aveiro"], pags = ["MB WAY", "Multibanco", "Cartão"];
        let seed = 7; const r = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
        const encomendas = [];
        for (let i = 0; i < 140; i++) {
          const d = new Date(Date.now() - Math.floor(r() * 365) * 86400000), itens = [];
          for (let k = 0, n = 1 + Math.floor(r() * 3); k < n; k++) { const p = prods[Math.floor(r() * prods.length)], q = 1 + Math.floor(r() * 2); itens.push({ woo_id: p[0], nome: p[1], qtd: q, total: Math.round(p[2] * q * 100) / 100 }); }
          const portes = r() < 0.6 ? 4.9 : 0, est = r() < 0.06 ? "cancelled" : r() < 0.04 ? "refunded" : "completed";
          encomendas.push({ woo_id: 9000 + i, numero: String(9000 + i), estado: est, criada_em: d.toISOString(), paga_em: d.toISOString(), total: Math.round((itens.reduce((s, x) => s + x.total, 0) + portes) * 100) / 100,
            portes, desconto: 0, pagamento: pags[Math.floor(r() * pags.length)], cp: "", localidade: locs[Math.floor(r() * locs.length)], itens, encomenda_id: null });
        }
        encomendas.sort((a, b) => (a.criada_em < b.criada_em ? 1 : -1));
        return { config: { id: 1, ativo: false, concluir_no_site: true, desde: null, ultima_sinc: agora(), ultimo_ok: agora(), ultimo_erro: "" },
          produtos: prods.map(([woo_id, nome, preco, produto_codigo]) => ({ woo_id, nome, preco, produto_codigo })), encomendas };
      };
      const dados = () => (w || (w = gerar()));
      return {
        async carregar() { return structuredClone(dados()); },
        async configurar(c) { const d = dados(); d.config = { ...d.config, ...c, ...(c.ativo ? { desde: agora() } : {}) }; return structuredClone(d.config); },
        async produto(id, codigo) { const p = dados().produtos.find((x) => x.woo_id === id); p.produto_codigo = codigo; return structuredClone(p); },
        async acao(acao) {
          if (acao === "testar") return { ok: true, encomendas: dados().encomendas.length, produtos: dados().produtos.length };
          if (acao === "produtos") return { ok: true, produtos: dados().produtos.length };
          if (acao === "historico") return { ok: true, vistas: dados().encomendas.length, seguinte: null };
          return { ok: true, vistas: 0, criadas: 0, canceladas: 0, concluidas: 0 };
        },
        subscrever() { return () => {}; },
      };
    })(),
    repor() { try { localStorage.removeItem(CHAVE); } catch { /* */ } db = ler(); },

    async carregar() {
      const e = eu();
      const g = eGestor(e);
      return {
        perfis: structuredClone(db.perfis), departamentos: structuredClone(db.departamentos),
        tarefas: structuredClone(db.tarefas.map((t) => ({ ...t, tem_valores: temEuros(t.titulo + " " + t.notas + " " + JSON.stringify(t.checklist || [])) }))
          .filter((t) => podeVer(e, t, db.perfis.find((p) => p.id === t.responsavel_id)))),
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
      // no modo de demonstração a foto fica guardada no próprio aparelho, em tamanho pequeno
      async aparencia(foto, cor) { const p = eu(); p.foto_path = foto || null; p.cor = cor || ""; gravar(db); emitir("perfis", "UPDATE", p); },
      async enviarFoto(id, blob) { return await new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => falha(new Error("Não foi possível ler a foto.")); r.readAsDataURL(blob); }); },
      async apagarFoto() { /* */ },
      async urlsFotos(caminhos) { return Object.fromEntries(caminhos.map((c) => [c, c])); },
    },
    departamentos: {
      async criar(d) {
        if (db.departamentos.some((x) => x.id === d.id)) throw new Error("Já existe um departamento com este nome.");
        db.departamentos.push(d); gravar(db); return d;
      },
      async atualizar(id, campos) { const d = db.departamentos.find((x) => x.id === id); Object.assign(d, campos); gravar(db); return d; },
    },
    // barbeiros de exemplo da folha da faturação
    async equipaFolha() { return [["Tiago Exemplo", "Madalena"], ["Hugo Exemplo", "Porto"], ["Rafael Exemplo", "Arcozelo"]].map(([barbeiro, loja]) => ({ mes: "2026-10", loja, barbeiro })); },
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
      const ler = () => { if (c) return c; try { c = JSON.parse(localStorage.getItem(K) || "null"); } catch { c = null; } if (!c) { c = semear(); guardar(); } return c; };
      const guardar = () => { try { localStorage.setItem(K, JSON.stringify(c)); } catch { /* sem espaço: fica só em memória */ } };
      // Dados de exemplo (inventados) para o Comercial, a Análise e as margens não aparecerem vazios na demonstração
      function semear() {
        let r = 26; const rnd = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648), esc = (l) => l[Math.floor(rnd() * l.length)];
        const LOC = [["4000", "Porto", "Porto"], ["4400", "Vila Nova de Gaia", "Porto"], ["4450", "Matosinhos", "Porto"], ["4470", "Maia", "Porto"], ["4700", "Braga", "Braga"], ["4800", "Guimarães", "Braga"],
          ["3800", "Aveiro", "Aveiro"], ["4520", "Santa Maria da Feira", "Aveiro"], ["3000", "Coimbra", "Coimbra"], ["2400", "Leiria", "Leiria"], ["1000", "Lisboa", "Lisboa"], ["3500", "Viseu", "Viseu"]];
        const PRE = ["Barbearia Exemplo", "Barber Studio Exemplo", "Salão Exemplo", "Barbearia Clássica Exemplo"];
        const PRODS = [["E01", "Cera modeladora 100 ml (exemplo)", 8.9, 3.1], ["E02", "Cera mate 100 ml (exemplo)", 8.9, 3.3], ["E03", "Pó texturizante (exemplo)", 7.5, 2.4], ["E04", "Óleo para barba 30 ml (exemplo)", 9.8, 3.6],
          ["E05", "After shave 100 ml (exemplo)", 8.4, null], ["E06", "Champô 1000 ml (exemplo)", 16, 6.2], ["E07", "Gola de corte (exemplo)", 4.2, null], ["E08", "Avental de barbeiro (exemplo)", 19.5, 8.5], ["E09", "Lâminas 100 un. (exemplo)", 11, null], ["T01", "Aluguer de equipamento de estética (exemplo)", 390, null]];
        const d = { clientes: [], produtos: PRODS.map(([codigo, descricao]) => ({ codigo, descricao, grupo: "EXEMPLO", linha: codigo.startsWith("T") ? "tech" : "produtos" })), vendas: [], contactos: [], importacoes: [], seq: 1,
          custos: PRODS.filter((x) => x[3] != null).map(([codigo, , , custo]) => ({ produto_codigo: codigo, custo, atualizado_em: agora() })) };
        for (let i = 0; i < 38; i++) {
          const [cp, loc, dist] = esc(LOC);
          d.clientes.push(novoCliente({ codigo_multixop: String(100 + i), nome: esc(PRE) + " " + (i + 1), nif: "", tipo: "empresa", origem: "multixop", etapa: "cliente",
            morada: "Rua Exemplo, " + (1 + Math.floor(rnd() * 200)) + ", " + cp + "-" + String(Math.floor(rnd() * 999)).padStart(3, "0") + " " + loc, concelho: loc, distrito: dist,
            responsavel_id: i % 3 ? "p-wembley" : null }));
        }
        const ETAPAS = ["lead", "lead", "lead", "contactado", "contactado", "proposta"];
        for (let i = 0; i < 24; i++) {
          const [, loc, dist] = esc(LOC);
          d.clientes.push(novoCliente({ chave_lead: "exemplo-" + i, nome: "Lead Exemplo " + (i + 1) + " · " + loc, origem: "base_leads", concelho: loc, distrito: dist, etapa: ETAPAS[i % ETAPAS.length],
            score: [40, 60, 80, 100][i % 4], responsavel_id: i % 2 ? "p-wembley" : null, notas: "Lead de exemplo" }));
        }
        // 14 meses de vendas até hoje, com alguns clientes a deixarem de comprar e umas notas de crédito
        const hoje = new Date(); let doc = 1;
        for (let m = 13; m >= 0; m--) {
          const base = new Date(hoje.getFullYear(), hoje.getMonth() - m, 1), dias = m === 0 ? Math.max(1, hoje.getDate() - 1) : 28;
          const nFat = Math.round(22 + rnd() * 14 + (base.getMonth() === 11 ? 10 : 0));
          for (let f = 0; f < nFat; f++) {
            const ci = Math.floor(Math.pow(rnd(), 1.6) * 38); if (ci % 9 === 4 && m < 5) continue; if (ci % 11 === 7 && m < 3) continue;
            const data = ymd(new Date(base.getFullYear(), base.getMonth(), 1 + Math.floor(rnd() * dias))), nc = rnd() < 0.012, linhas = 1 + Math.floor(rnd() * 3);
            for (let l = 1; l <= linhas; l++) {
              const [codigo, descricao, preco] = PRODS[Math.floor(Math.pow(rnd(), 1.4) * PRODS.length)], qtd = codigo.startsWith("T") ? 1 : [1, 2, 3, 6, 6, 12][Math.floor(rnd() * 6)];
              d.vendas.push({ documento: (nc ? "NC EX/" : "FT EX/") + doc, linha: l, tipo: nc ? "NC" : "FT", data, cliente_codigo: String(100 + ci), produto_codigo: codigo, descricao, qtd, preco, valor: Math.round(preco * qtd * (nc ? -1 : 1) * 100) / 100 });
            }
            doc++;
          }
        }
        d.vendas.sort((a, b) => a.data.localeCompare(b.data));
        return d;
      }
      const novoCliente = (o) => ({ id: uid(), codigo_multixop: null, chave_lead: null, nome: "", nome_corrigido: false, nif: "", tipo: "lead", etapa: "lead", origem: "manual", morada: "", codigo_postal: "",
        freguesia: "", concelho: "", distrito: "", telefone: "", email: "", website: "", instagram: "", data_aniversario: null, responsavel_id: null, score: null, notas: "",
        criado_em: agora(), atualizado_em: agora(), atualizado_por: euId, ...o });
      // Método Mackay 66 na demonstração: lista do dia a partir dos clientes de exemplo e abordagem de exemplo (sem IA)
      const hojeD = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });
      const abordagens = {
        async hoje() {
          const d = ler(); d.abordagens = d.abordagens || [];
          if (!d.abordagens.some((a) => a.dia === hojeD())) {
            const cli = d.clientes.filter((c) => c.etapa === "cliente").slice(0, 3), lead = d.clientes.find((c) => c.etapa === "lead" && c.score >= 80);
            const MOT = [["recompra", "Costuma encomendar a cada 30 dias e a última encomenda foi há 52 dias (exemplo)."], ["risco", "Sem compras há 110 dias, depois de 1 240 € no período (exemplo)."], ["seguimento", "Seguimento marcado para hoje: enviar catálogo das cadeiras (exemplo)."]];
            cli.forEach((c, i) => d.abordagens.push({ id: uid(), dia: hojeD(), cliente_id: c.id, ordem: i, tipo: MOT[i][0], motivo: MOT[i][1], resumo: "", abordagem: "", mensagem: "", descobrir: [], fontes: [], preparada_em: null, estado: "sugerida" }));
            if (lead) d.abordagens.push({ id: uid(), dia: hojeD(), cliente_id: lead.id, ordem: 3, tipo: "primeiro", motivo: "Ainda não é cliente nem foi contactado · pontuação " + lead.score + " (exemplo).", resumo: "", abordagem: "", mensagem: "", descobrir: [], fontes: [], preparada_em: null, estado: "sugerida" });
            guardar();
          }
          return { dia: hojeD(), lista: structuredClone(d.abordagens.filter((a) => a.dia === hojeD())) };
        },
        async preparar(id) {
          await new Promise((r) => setTimeout(r, 700));
          const d = ler(), a = d.abordagens.find((x) => x.id === id); if (!a) throw new Error("Sugestão não encontrada.");
          const c = d.clientes.find((x) => x.id === a.cliente_id);
          if (a.tipo === "tech") a.analise = { servicos: "Depilação com luz pulsada e limpezas de pele; ainda não faz laser (exemplo).", cabines: "3 (exemplo · fotos do Google, certeza média)", equipa: "4 esteticistas (exemplo)", avaliacao: "4,7 (98 avaliações) · exemplo",
            perfil: "Clínica de estética de bairro, preço médio (exemplo).", fotos: 2, necessidades: ["Oferecer depilação a laser, que a concorrência já tem (exemplo)", "Tratamentos de modelação corporal (exemplo)"], propor: ["Laser de díodo de 4 ondas (exemplo)", "Emsculpt para modelação corporal (exemplo)"] };
          if (a.tipo === "primeiro") a.analise = { cadeiras: "4 (exemplo · contadas nas fotos do Google, certeza média)", barbeiros: "3 (exemplo · equipa na página de marcações)", avaliacao: "4,8 (212 avaliações) · exemplo", perfil: "Barbearia moderna, preço médio, clientela jovem (exemplo).", fotos: 3,
            necessidades: ["Ceras e pós com fixação forte para fades (exemplo)", "Consumíveis: golas e lâminas em quantidade (exemplo)", "Produtos de revenda ao balcão (exemplo)"], propor: ["Kit de amostras PRO (exemplo)", "Formação de fade na 26 Academy (exemplo)"] };
          if (a.tipo === "tech") Object.assign(a, { resumo: "Exemplo · " + c.nome + " faz depilação com luz pulsada e limpezas de pele, mas ainda não tem laser. No modo de demonstração não há pesquisa na web nem IA.",
            abordagem: "- Ligar a meio da manhã, entre marcações\n- Pretexto: demonstração do laser de díodo na clínica\n- Levar a ficha técnica e casos de clínicas parecidas",
            mensagem: "Olá! Daqui é o [nome] da 26 Tech. Vi que a clínica já faz depilação e limpezas de pele. Trabalhamos com o laser de díodo de 4 ondas, que muitas clínicas usam para dar o salto na depilação. Faz sentido marcarmos uma demonstração aí na clínica? [nome] · 26 Tech",
            descobrir: ["Que equipamentos usam hoje na depilação?", "Quem decide a compra de equipamentos?", "Que tratamentos querem acrescentar este ano?"], preparada_em: agora() });
          else Object.assign(a, { resumo: "Exemplo · " + c.nome + " compra sobretudo ceras e champô. No modo de demonstração não há pesquisa na web nem IA.",
            abordagem: "- Ligar a meio da manhã, antes do movimento do almoço\n- Pretexto: novidade da cera mate e reposição do champô\n- Propor o patamar PRO, que fica a 300 € desta encomenda",
            mensagem: "Olá! Daqui é o [nome] da TwentySix. Reparei que já está na altura de repor as ceras e o champô. Esta semana temos a cera mate nova: quer que lhe junte umas unidades para experimentar? Abraço, [nome]",
            descobrir: ["Quem decide as compras na barbearia?", "Que marcas revendem ao balcão?", "Qual é o maior desafio da loja este ano?"], preparada_em: agora() });
          guardar(); return { abordagem: structuredClone(a), sugestoes: 0 };
        },
        async pesquisar() { await new Promise((r) => setTimeout(r, 500)); throw new Error("No modo de demonstração não há pesquisa na web."); },
        async clinicas() {
          await new Promise((r) => setTimeout(r, 600));
          const d = ler(), n = d.clientes.filter((c) => c.marca === "tech").length;
          const novos = ["Clínica Exemplo Estética", "Centro Laser Exemplo"].map((nome, i) => ({ id: uid(), nome: nome + " " + (n + i + 1), tipo: "lead", etapa: "lead", origem: "prospecao", marca: "tech", distrito: "Porto", concelho: "Porto",
            morada: "Rua Exemplo, " + (10 + i) + ", Porto", telefone: "22000000" + i, email: "", website: "", instagram: "", score: 80 - i * 5, tipo_negocio: i ? "Depilação a laser" : "Estética e medicina estética", notas: "", criado_em: agora() }));
          d.clientes.push(...novos);
          novos.forEach((c, i) => d.abordagens.push({ id: uid(), dia: hojeD(), cliente_id: c.id, ordem: 10 + i, tipo: "tech", motivo: "Clínica encontrada hoje no Google Maps (" + c.tipo_negocio + ") · pontuação " + c.score + " (exemplo).", resumo: "", abordagem: "", mensagem: "", descobrir: [], fontes: [], preparada_em: null, estado: "sugerida" }));
          guardar(); return { ok: true, vistos: 12, novos: novos.length, acrescentadas: novos.length };
        },
        async estado(id, estado) { const d = ler(), a = d.abordagens.find((x) => x.id === id); if (a) { a.estado = estado; guardar(); } },
      };
      const mackay = {
        async ler(id) { const d = ler(); return structuredClone((d.mackay || {})[id] || null); },
        async guardar(id, campos) { const d = ler(); d.mackay = d.mackay || {}; d.mackay[id] = { cliente_id: id, respostas: {}, sugestoes: {}, fontes: [], ...(d.mackay[id] || {}), ...campos, atualizado_em: agora() }; guardar(); return structuredClone(d.mackay[id]); },
      };
      return {
        abordagens, mackay,
        async carregar() { const d = ler(); return structuredClone({ clientes: d.clientes, produtos: d.produtos, vendas: d.vendas, contactos: d.contactos, importacoes: d.importacoes, custos: d.custos || [] }); },
        async custo(codigo, valor) {
          const d = ler(); if (!eGestor(eu())) throw new Error("Só a direção muda o custo dos produtos.");
          d.custos = (d.custos || []).filter((x) => x.produto_codigo !== codigo);
          if (valor != null) d.custos.push({ produto_codigo: codigo, custo: valor, atualizado_em: agora() });
          guardar(); return valor == null ? null : { produto_codigo: codigo, custo: valor };
        },
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
      const vejo = (cn) => { const e = eu(); return cn.tipo === "geral" || (cn.tipo === "departamento" && (eGestor(e) || cn.departamento_id === e.departamento_id)) || ((cn.tipo === "direto" || cn.tipo === "grupo") && c.membros.some((m) => m.canal_id === cn.id && m.perfil_id === euId)); };
      const audios = {}; // no modo de demonstração os áudios ficam só em memória
      const resumoTexto = (u) => (u.apagado ? "" : u.anexo_path && !u.texto ? "Mensagem de voz" : u.texto.slice(0, 140));
      const lido = (canal) => c.membros.find((m) => m.canal_id === canal && m.perfil_id === euId)?.lido_ate || eu().criado_em;
      return {
        async resumo() {
          ler();
          return c.canais.filter(vejo).map((cn) => {
            const ms = c.mensagens.filter((m) => m.canal_id === cn.id), u = ms[ms.length - 1];
            return { canal_id: cn.id, tipo: cn.tipo, nome: cn.nome, departamento_id: cn.departamento_id, outro_id: cn.tipo === "direto" ? c.membros.find((m) => m.canal_id === cn.id && m.perfil_id !== euId)?.perfil_id || null : null,
              ultima_em: u?.criado_em || null, ultima_texto: u ? resumoTexto(u) : null, ultimo_autor: u?.autor_id || null,
              por_ler: ms.filter((m) => !m.apagado && m.autor_id !== euId && m.criado_em > lido(cn.id)).length };
          });
        },
        async mensagens(canal, antes) { ler(); const l = c.mensagens.filter((m) => m.canal_id === canal && (!antes || m.criado_em < antes)); return structuredClone(l.slice(-60)); },
        async enviar(canal, texto, mencoes, anexo) {
          ler(); const m = { id: c.seq++, canal_id: canal, autor_id: euId, texto: texto.trim(), mencoes, criado_em: agora(), editado_em: null, apagado: false, ...(anexo || {}) };
          c.mensagens.push(m); guardar();
          const cn = c.canais.find((x) => x.id === canal);
          const dest = cn.tipo === "direto" || cn.tipo === "grupo" ? c.membros.filter((x) => x.canal_id === canal && x.perfil_id !== euId).map((x) => x.perfil_id) : mencoes;
          dest.forEach((d) => { const n = db.notificacoes.find((x) => x.destinatario_id === d && x.link === "#chat-" + canal && !x.lida);
            const corpo = texto ? texto.slice(0, 120) : "Mensagem de voz";
            if (n) { n.corpo = corpo; n.criado_em = agora(); } else notificar(d, "mensagem", cn.tipo === "direto" ? "Mensagem de " + nome(euId) : cn.tipo === "grupo" ? nome(euId) + " em «" + cn.nome + "»" : nome(euId) + " mencionou-te em #" + cn.nome, corpo, "#chat-" + canal); });
          gravar(db); return structuredClone(m);
        },
        async atualizar(id, campos) {
          ler(); const m = c.mensagens.find((x) => x.id === id); if (!m || m.autor_id !== euId) throw new Error("Só podes alterar as tuas mensagens.");
          if (campos.apagado) Object.assign(m, { apagado: true, texto: "", anexo_path: null, editado_em: agora() }); else if ("texto" in campos) Object.assign(m, { texto: campos.texto.trim(), editado_em: agora() });
          guardar(); return structuredClone(m);
        },
        async direto(outro) {
          ler(); const chave = [euId, outro].sort().join("|"); let cn = c.canais.find((x) => x.chave === chave);
          if (!cn) { cn = { id: "dm-" + uid(), tipo: "direto", nome: "", departamento_id: null, chave }; c.canais.push(cn);
            c.membros.push({ canal_id: cn.id, perfil_id: euId, lido_ate: agora() }, { canal_id: cn.id, perfil_id: outro, lido_ate: agora() }); guardar(); }
          return cn.id;
        },
        async criarGrupo(nomeG, membros) {
          ler(); if (!String(nomeG || "").trim()) throw new Error("Dá um nome ao grupo."); if (!membros?.length) throw new Error("Escolhe pelo menos uma pessoa.");
          const cn = { id: "gr-" + uid(), tipo: "grupo", nome: nomeG.trim().slice(0, 60), departamento_id: null }; c.canais.push(cn);
          [...new Set([euId, ...membros])].forEach((p) => c.membros.push({ canal_id: cn.id, perfil_id: p, lido_ate: agora() })); guardar(); return cn.id;
        },
        async sairGrupo(canal) { ler(); c.membros = c.membros.filter((m) => !(m.canal_id === canal && m.perfil_id === euId)); guardar(); },
        async membros(canal) { ler(); return c.membros.filter((m) => m.canal_id === canal).map((m) => m.perfil_id); },
        async enviarAudio(canal, blob, tipo, duracao) {
          const caminho = canal + "/" + uid() + ".webm"; audios[caminho] = URL.createObjectURL(blob);
          return this.enviar(canal, "", [], { anexo_path: caminho, anexo_tipo: tipo.split(";")[0], anexo_duracao: Math.round(duracao * 10) / 10 });
        },
        async urlAudio(caminho) { if (!audios[caminho]) throw new Error("No modo de demonstração, os áudios só ficam disponíveis até recarregares a página."); return audios[caminho]; },
        async apagarAudio() { /* */ },
        async marcarLido(canal) {
          ler(); const cnL = c.canais.find((x) => x.id === canal); if (!cnL || !vejo(cnL)) return;
          const m = c.membros.find((x) => x.canal_id === canal && x.perfil_id === euId);
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
              data_prevista: ymd(amanha), responsavel_id: null, rota_id: null, transportadora: "", tracking: "", envio: null, proforma_id: null, criado_por: por, criado_em: agora(), atualizado_em: agora(), atualizado_por: por, entregue_em: null, entregue_por: null }));
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
            const soTransporte = Object.keys(campos).every((c) => ["transportadora", "tracking"].includes(c));
            if (!logi() && !soTransporte) {
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
            const antes = r.estado, trAntes = r.tracking || "";
            if ("tracking" in campos) campos = { ...campos, tracking: String(campos.tracking || "").trim() };
            if ("morada" in campos && campos.morada !== r.morada && !("morada_geo" in campos)) Object.assign(r, { lat: null, lng: null, morada_geo: "" });
            Object.assign(r, campos, { atualizado_em: agora(), atualizado_por: euId });
            if (("estado" in campos || "itens" in campos) && ganchos.stock) ganchos.stock(r);
            if (r.estado === "entregue" && antes !== "entregue") { r.entregue_em = agora(); r.entregue_por = euId; }
            if (r.estado !== antes && ["pronta", "entregue", "cancelada"].includes(r.estado) && r.criado_por !== euId)
              notificar(r.criado_por, "encomenda", "Encomenda E-" + String(r.numero).padStart(4, "0") + " " + ({ pronta: "pronta", entregue: "entregue", cancelada: "cancelada" })[r.estado], r.cliente_nome + " · " + nome(euId), "#encomenda-" + r.id);
            if (r.tracking && r.tracking !== trAntes) {
              const fat = ganchos.faturador?.(), refE = "E-" + String(r.numero).padStart(4, "0");
              if (fat && fat !== euId) notificar(fat, "encomenda", "Etiqueta Nacex para imprimir · " + refE, r.cliente_nome + " · tracking " + r.tracking, "#encomenda-" + r.id);
              if (r.criado_por && r.criado_por !== euId && r.criado_por !== fat) notificar(r.criado_por, "encomenda", "Encomenda " + refE + " com tracking", r.cliente_nome + " · " + r.tracking, "#encomenda-" + r.id);
            }
            guardar(); gravar(db); return structuredClone(r);
          },
          async apagar(id) { const x = ler(); x.encomendas = x.encomendas.filter((e) => e.id !== id); guardar(); },
        },
        _ganchos: (ganchos.novaEncomenda = (o) => {
          const x = ler(), r = { id: uid(), numero: x.seq++, tipo: "encomenda", estado: "nova", prioridade: "media", crm_cliente_id: null, contacto: "", morada: "", lat: null, lng: null, morada_geo: "", itens: [], notas: "",
            fatura_numero: "", fatura_ficheiro: "", fatura_nome: "", data_prevista: null, responsavel_id: null, rota_id: null, transportadora: "", tracking: "", envio: null, proforma_id: null, ...o,
            criado_em: agora(), atualizado_em: agora(), atualizado_por: euId, entregue_em: null, entregue_por: null };
          x.encomendas.push(r); guardar();
          db.perfis.filter((p) => p.ativo && p.id !== euId && p.departamento_id === "logistica")
            .forEach((p) => notificar(p.id, "encomenda", "Nova encomenda E-" + String(r.numero).padStart(4, "0"), nome(euId) + " · " + r.cliente_nome, "#encomenda-" + r.id));
          gravar(db); return r;
        }, null),
        // Envio pela Nacex no modo de demonstração: cria um envio de teste, sem contactar a Nacex
        _nacex: (ganchos.nacex = async (acao, dados) => {
          await new Promise((r) => setTimeout(r, 500));
          const x = ler();
          if (acao === "atualizar") return { ok: true, vistos: 0, mudaram: 0 };
          const r = x.encomendas.find((e) => e.id === dados.id); if (!r) throw new Error("Encomenda não encontrada.");
          if (acao === "criar") {
            const v = r.envio || {};
            const falta = [!(v.morada || r.morada) && "morada", !(v.cp || /\d{4}-\d{3}/.test(r.morada || "")) && "código postal"].filter(Boolean);
            if (falta.length) throw new Error("Faltam dados de envio: " + falta.join(", ") + ". Corrige a ficha do cliente ou a encomenda.");
            const d = new Date(); d.setDate(d.getDate() + 1);
            r.nacex = { expe_codigo: "999999999", albaran: "7440/999999999", servico: "NACEX 19:00H", data_prevista: d.toLocaleDateString("pt-PT"), agencia_entrega: "Exemplo", volumes: +dados.volumes || 1, peso: +dados.peso || 1,
              seguimento: "", teste: true, estado: "DOCUMENTADO", criado_em: agora() };
            r.tracking = r.nacex.albaran; r.transportadora = "nacex"; guardar();
            return { ok: true, nacex: structuredClone(r.nacex), pdf: null };
          }
          if (!r.nacex) throw new Error("Esta encomenda ainda não tem envio criado na Nacex.");
          if (acao === "etiqueta") throw new Error("No modo de demonstração não há etiquetas reais da Nacex.");
          if (acao === "estado") { r.nacex = { ...r.nacex, estado: "TRANSITO", estado_data: new Date().toLocaleString("pt-PT"), estado_em: agora() }; guardar(); return { ok: true, nacex: structuredClone(r.nacex), estado: r.estado }; }
          if (acao === "cancelar") { r.nacex = null; r.tracking = ""; guardar(); return { ok: true }; }
          throw new Error("Ação desconhecida.");
        }, null),
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
      // Barbeiros, responsáveis, pessoal e regras de exemplo (inventados) para o separador Resultados e Barbeiros
      function completar(x) {
        if (x.barbeiros && x.caixa) return x;
        if (x.barbeiros && !x.caixa) { x.caixa = []; return x; }
        x.barbeiros = []; x.responsaveis = []; x.pessoal = []; x.ajustes = [];
        x.config = { id: 1, reparticao: { metodo: "faturacao", pesos: { barbearias: 60, produtos: 25, academia: 10, tech: 5 } }, tesouraria: { saldo: 18000, minimo: 8000 }, caixa_limite: 50 };
        x.caixa = [];
        const LET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let k = 0;
        for (const m of x.meses) {
          const fat = x.faturacao.filter((f) => f.mes === m.mes);
          fat.forEach((f, i) => {
            const n = i === 1 || i === 4 ? 4 : i === 0 ? 3 : 2;
            for (let j = 0; j < n; j++) {
              const vt = Math.round(f.total / n * (1 + (j - 1) * 0.12)), cab = Math.round(vt / 16 * 0.55), com = Math.round(vt / 24 * 0.35), bar = Math.max(0, Math.round((vt - cab * 16 - com * 24) / 16));
              const pc = [0.45, 0.5, 0.4, 0.35][j % 4], liq = vt - 0.5 * (cab + bar + com), rec = Math.round(liq * pc * 100) / 100, extras = j === 0 && i === 1 ? 600 : 0;
              x.barbeiros.push({ mes: m.mes, loja: f.espaco, barbeiro: "Barbeiro " + LET[(i * 4 + j) % 26] + " (exemplo)", dias: "COMPL", cabelos: cab, barbas: bar, combos: com, outro: 0, valor_total: vt, liquido: liq, comissao: pc, a_receber: rec, extras, nota: extras ? "Referente a gestão" : "", total: rec + extras });
            }
            x.responsaveis.push({ mes: m.mes, loja: f.espaco, valor: 50 });
          });
          x.pessoal.push({ mes: m.mes, pessoa: "Pessoa 1 (exemplo)", valor: 1100, pesos: { barbearias: 0.4, academia: 0.3, produtos: 0.3, tech: 0 } },
            { mes: m.mes, pessoa: "Pessoa 2 (exemplo)", valor: 950, pesos: { produtos: 1 } });
          x.ajustes.push({ mes: m.mes, tipo: "autoconsumo", valor: 380 });
          m.precos = { cabelo: 16, barba: 16, combo: 24, desconto: 0.5 };
          fat.forEach((f, i) => { for (let j = 0; j < 2 + ((i + k) % 3); j++) { const falta = (i + j + k) % 3 !== 0; x.caixa.push({ mes: m.mes, loja: f.espaco, dia: String(3 + j * 7 + i).padStart(2, "0") + "/" + m.mes.slice(5), tipo: falta ? "falta" : "sobra", valor: falta ? 5 + ((i * 13 + j * 7 + k * 3) % 40) : 2 + j * 3, texto: (falta ? "FALTA " : "A MAIS ") + "(exemplo)" }); } });
          k++;
        }
        return x;
      }
      // Receita da Academia: preço × formandos que não desistiram, repartida pelos meses da formação (como fin_receita_academia)
      async function receitaAcademia() {
        const a = await API.aca.carregar(), r = new Map();
        for (const p of a.precos || []) {
          const f = a.formacoes.find((x) => x.id === p.formacao_id); if (!f?.inicio || /cancel/i.test(f.estado || "")) continue;
          const ativos = a.inscricoes.filter((x) => x.formacao_id === f.id && !x.desistente).length;
          const ini = new Date(f.inicio.slice(0, 7) + "-01"), fim = new Date(((f.fim && f.fim > f.inicio) ? f.fim : f.inicio).slice(0, 7) + "-01");
          const meses = []; for (let x = new Date(ini); x <= fim; x.setMonth(x.getMonth() + 1)) meses.push(x.toISOString().slice(0, 7));
          for (const m of meses) { const o = r.get(m) || { mes: m, valor: 0, formandos: 0, formacoes: 0 }; o.valor += (p.preco * ativos) / meses.length; o.formandos += ativos; o.formacoes++; r.set(m, o); }
        }
        return [...r.values()].map((o) => ({ ...o, valor: Math.round(o.valor * 100) / 100 }));
      }
      // Vendas por mês a partir do Comercial de exemplo (as mesmas contas que a função fin_vendas_mes faz na base de dados)
      async function vendasMes() {
        const c = await API.crm.carregar(), linha = new Map(c.produtos.map((p) => [p.codigo, p.linha || "produtos"])), r = new Map();
        for (const v of c.vendas) { const k = v.data.slice(0, 7) + "|" + (linha.get(v.produto_codigo) || "produtos"); r.set(k, (r.get(k) || 0) + Number(v.valor)); }
        return [...r].map(([k, valor]) => ({ mes: k.split("|")[0], linha: k.split("|")[1], valor: Math.round(valor * 100) / 100 }));
      }
      return {
        async carregar() {
          if (!pode()) throw new Error("Só a direção tem acesso ao Financeiro.");
          const x = completar(ler()); guardar();
          const { barbeiros, responsaveis, pessoal, ajustes, config, ...resto } = structuredClone(x);
          let prazos = [];
          try { prazos = ((await API.prz.carregar()).prazos || []).filter((p) => p.estado === "ativo" && p.valor != null).map(({ titulo, data, valor, repetir, estado }) => ({ titulo, data, valor, repetir, estado })); } catch { /* sem prazos */ }
          return { ...resto, extra: { barbeiros, responsaveis, pessoal, ajustes, config, vendas: await vendasMes(), receitaAcad: await receitaAcademia(), caixa: structuredClone(x.caixa), prazos } };
        },
        async ajuste(mes, tipo, valor) {
          if (!pode()) throw new Error("Só a direção altera o Financeiro.");
          const x = completar(ler()); x.ajustes = x.ajustes.filter((a) => !(a.mes === mes && a.tipo === tipo)); if (valor != null) x.ajustes.push({ mes, tipo, valor }); guardar(); return valor == null ? null : { mes, tipo, valor };
        },
        async config(reparticao) { if (!pode()) throw new Error("Só a direção altera o Financeiro."); const x = completar(ler()); x.config = { id: 1, reparticao }; guardar(); return x.config; },
        async imputacao(chave, imputacao) {
          if (!pode()) throw new Error("Só a direção altera o Financeiro.");
          const x = ler(), r = x.rubricas.find((y) => y.chave === chave); if (r) r.imputacao = imputacao; else x.rubricas.push({ chave, categoria: null, imputacao }); guardar(); return { chave, imputacao };
        },
        async importar(p) {
          if (!pode()) throw new Error("Só a direção importa os dados financeiros.");
          const x = ler();
          for (const m of p.meses || []) {
            x.meses = x.meses.filter((y) => y.mes !== m.mes).concat([{ mes: m.mes, ficheiro: m.ficheiro, assinatura: m.assinatura, assinatura_custos: m.assinatura_custos, avisos: m.avisos || [], importado_por: euId, importado_em: agora() }]);
            x.linhas = x.linhas.filter((l) => l.mes !== m.mes).concat((m.linhas || []).map((l) => ({ mes: m.mes, ...l })));
            x.faturacao = x.faturacao.filter((f) => f.mes !== m.mes).concat((m.faturacao || []).map((f) => ({ mes: m.mes, ...f })));
            completar(x);
            for (const k of ["barbeiros", "responsaveis", "pessoal", "caixa"]) x[k] = x[k].filter((y) => y.mes !== m.mes).concat((m[k] || []).map((y) => ({ mes: m.mes, ...y })));
            const mm = x.meses.find((y) => y.mes === m.mes); if (mm) mm.precos = m.precos || {};
          }
          x.meses.sort((a, b) => a.mes.localeCompare(b.mes)); guardar(); return { meses: (p.meses || []).length };
        },
        async rubrica(chave, categoria) { if (!pode()) throw new Error("Só a direção altera o Financeiro."); const x = ler(), r = x.rubricas.find((y) => y.chave === chave); if (r) r.categoria = categoria; else x.rubricas.push({ chave, categoria }); guardar(); return { chave, categoria }; },
        async apagarMes(mes) { if (!pode()) throw new Error("Só a direção altera o Financeiro."); const x = ler(); x.meses = x.meses.filter((m) => m.mes !== mes); x.linhas = x.linhas.filter((l) => l.mes !== mes); x.faturacao = x.faturacao.filter((f) => f.mes !== mes); completar(x); for (const k of ["barbeiros", "responsaveis", "pessoal", "caixa"]) x[k] = x[k].filter((y) => y.mes !== mes); guardar(); },
        async configurar(campos) { if (!pode()) throw new Error("Só a direção altera o Financeiro."); const x = completar(ler()); x.config = { ...x.config, ...campos }; guardar(); return x.config; },
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
        async carregar() {
          if (!pode()) return { publicacoes: [], documentos: [] };
          const x = structuredClone(ler()); if (!eu().restrito) return x;
          return { publicacoes: x.publicacoes.filter((p) => !temEuros([p.titulo, p.copy, p.notas, p.inspiracao, p.link].join(" "))), documentos: x.documentos.filter((p) => !temEuros(p.titulo + " " + p.conteudo)) };
        },
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
      async emailTeste() { throw new Error("Os emails não são enviados no modo de demonstração."); },
    },
    ia: (() => {
      const K = "central26-demo-ia-v1";
      const ler = () => { try { return JSON.parse(localStorage.getItem(K) || "null") || { conversas: [], mensagens: [], seq: 1, config: { ativo: true, limite_mensal: 400 } }; } catch { return { conversas: [], mensagens: [], seq: 1, config: { ativo: true, limite_mensal: 400 } }; } };
      const guardar = (d) => { try { localStorage.setItem(K, JSON.stringify(d)); } catch { /* */ } };
      return {
        async conversas() { return ler().conversas.filter((c) => c.perfil_id === euId).sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em)); },
        async mensagens(id) { return ler().mensagens.filter((m) => m.conversa_id === id); },
        async enviar(conversa, mensagem) {
          const d = ler(); let c = d.conversas.find((x) => x.id === conversa);
          if (!c) { c = { id: "ia-" + uid(), perfil_id: euId, titulo: mensagem.slice(0, 60), criado_em: agora(), atualizado_em: agora() }; d.conversas.push(c); }
          d.mensagens.push({ id: d.seq++, conversa_id: c.id, papel: "user", texto: mensagem, ferramentas: [], criado_em: agora() });
          await new Promise((r) => setTimeout(r, 700));
          const minhas = db.tarefas.filter((t) => t.responsavel_id === euId && t.estado !== "concluido");
          const sup = db.perfis.find((p) => p.supervisor_id === euId && p.ativo);
          if (sup && /prop(õe|oe|or) tarefas/i.test(mensagem)) {
            const dia = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return ymd(x); };
            [["Exemplo · Editar o reel da semana", "Cortar para 30 segundos e legendar.", "twentysix", "alta", dia(1), "O reel está planeado para esta semana e ainda não tem responsável."],
             ["Exemplo · Responder aos comentários do Instagram", "Todos os dias ao fim da manhã.", "barbearia", "media", dia(3), "Há comentários por responder desde segunda-feira."]]
              .forEach(([titulo, notas, marca, prioridade, prazo, motivo]) => { if (!db.propostas.some((x) => x.estado === "pendente" && x.titulo === titulo)) db.propostas.unshift({ id: uid(), lote: "l-" + uid(), tipo: "nova", destinatario_id: sup.id, aprovador_id: euId, pedido_por: euId,
                tarefa_id: null, publicacao_id: null, titulo, notas, marca, prioridade, prazo, motivo, estado: "pendente", decidido_por: null, decidido_em: null, criado_em: agora() }); });
            gravar(db);
            const resposta = "**Modo de demonstração.** Analisei as tarefas pendentes e as publicações sem responsável e deixei **2 propostas** para " + sup.nome.split(" ")[0] + ". Nada lhe chega até aprovares cada uma.";
            const m = { id: d.seq++, conversa_id: c.id, papel: "assistant", texto: resposta, ferramentas: ["tarefas", "marketing", "propor_tarefas"], criado_em: agora() };
            d.mensagens.push(m); c.atualizado_em = agora(); guardar(d);
            return { conversa_id: c.id, resposta, ferramentas: m.ferramentas, id: m.id, criado_em: m.criado_em, pedidos_mes: d.mensagens.filter((x) => x.papel === "assistant").length, limite: d.config.limite_mensal };
          }
          const resposta = "**Modo de demonstração.** Aqui o assistente responderia com a IA, consultando os dados a que tens acesso.\n\nPor exemplo, tens neste momento " + minhas.length + (minhas.length === 1 ? " tarefa por fazer" : " tarefas por fazer") +
            (minhas.length ? ":\n" + minhas.slice(0, 5).map((t) => "- " + t.titulo).join("\n") : ".") + "\n\nNa versão real, também escreve descrições, legendas, emails e resumos a partir do que pedires.";
          const m = { id: d.seq++, conversa_id: c.id, papel: "assistant", texto: resposta, ferramentas: ["tarefas"], criado_em: agora() };
          d.mensagens.push(m); c.atualizado_em = agora(); guardar(d);
          return { conversa_id: c.id, resposta, ferramentas: m.ferramentas, id: m.id, criado_em: m.criado_em, pedidos_mes: d.mensagens.filter((x) => x.papel === "assistant").length, limite: d.config.limite_mensal };
        },
        async renomear(id, titulo) { const d = ler(); const c = d.conversas.find((x) => x.id === id); if (c) c.titulo = titulo; guardar(d); },
        async propostas() { const e = eu(); return structuredClone((db.propostas || []).filter((x) => x.aprovador_id === euId || x.pedido_por === euId || eGestor(e))); },
        async decidir(id, aprovar) {
          const x = (db.propostas || []).find((y) => y.id === id); if (!x) throw new Error("Proposta não encontrada.");
          if (x.aprovador_id !== euId && !eGestor(eu())) throw new Error("Só " + nome(x.aprovador_id) + " pode decidir esta proposta.");
          if (x.estado !== "pendente") throw new Error("Esta proposta já foi decidida.");
          x.estado = aprovar ? "aprovada" : "recusada"; x.decidido_por = euId; x.decidido_em = agora();
          if (aprovar) {
            const dest = db.perfis.find((p) => p.id === x.destinatario_id);
            const t = { id: uid(), modelo: null, marca: x.marca, titulo: x.titulo, freq: "unica", prioridade: x.prioridade, notas: x.notas, checklist: [], checklist_periodo: "", prazo: x.prazo,
              departamento_id: dest?.departamento_id || null, responsavel_id: x.destinatario_id, estado: "por_fazer", estado_periodo: "unica", criado_por: euId, criado_em: agora(), atualizado_em: agora(), concluido_por: null, concluido_em: null };
            db.tarefas.push(t); x.tarefa_id = t.id; emitir("tarefas", "INSERT", structuredClone(t));
            notificar(x.destinatario_id, "tarefa_atribuida", "Nova tarefa para ti", nome(euId) + " atribuiu-te: " + t.titulo, "#tarefa-" + t.id);
          }
          gravar(db); return x.tarefa_id;
        },
        subscreverPropostas() { return () => {}; },
        async apagar(id) { const d = ler(); d.conversas = d.conversas.filter((x) => x.id !== id); d.mensagens = d.mensagens.filter((x) => x.conversa_id !== id); guardar(d); },
        async uso() { const d = ler(); const mes = agora().slice(0, 7); const por = {}; d.mensagens.filter((m) => m.papel === "assistant").forEach((m) => { const c = d.conversas.find((x) => x.id === m.conversa_id); if (c) por[c.perfil_id] = (por[c.perfil_id] || 0) + 1; });
          return Object.entries(por).map(([perfil_id, pedidos]) => ({ perfil_id, mes, pedidos, tokens_in: 0, tokens_out: 0 })); },
        async config() { return ler().config; },
        async guardarConfig(c) { if (!eGestor(eu())) throw new Error("Só a direção muda o assistente."); const d = ler(); Object.assign(d.config, c); guardar(d); return d.config; },
      };
    })(),
    async copia() {
      const tabelas = {};
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("central26-demo")) { try { tabelas[k] = JSON.parse(localStorage.getItem(k)); } catch { tabelas[k] = localStorage.getItem(k); } } }
      return { tabelas, avisos: ["Modo de demonstração: a cópia tem só os dados de exemplo deste aparelho."] };
    },
    async registarCopia() { if (!eGestor(eu())) throw new Error("Só a direção faz cópias de segurança."); try { localStorage.setItem("central26-demo-ultima-copia", agora()); } catch { /* */ } return agora(); },
    preferencias: (() => {
      const K = "central26-demo-pref-v1";
      const todas = () => { try { return JSON.parse(localStorage.getItem(K) || "{}"); } catch { return {}; } };
      return {
        async ler(id) { return { perfil_id: id, email_tarefas: true, email_agenda: true, email_mensagens: true, sossego: false, sossego_inicio: 21, sossego_fim: 8, sossego_fds: true, resumo_diario: false, resumo_hora: 8, email_por_ler: true, ...(todas()[id] || {}) }; },
        async guardar(id, campos) { const t = todas(); t[id] = { ...(t[id] || {}), ...campos }; try { localStorage.setItem(K, JSON.stringify(t)); } catch { /* */ } return this.ler(id); },
      };
    })(),
    stk: (() => {
      const K = "central26-demo-stk-v1";
      let d = null, seq = 1;
      const pode = () => { const e = eu(); return !!e && (eGestor(e) || ["logistica", "comercial"].includes(e.departamento_id)); };
      const exemplo = { "spark-100": [34, 30], "mist-100": [58, 25], "clay-100": [12, 20], "fog-100": [40, 15], "blaze-100": [22, 15], "river-salt": [18, 10], "hack-300": [26, 10], "caixa-m": [8, 20], "saco": [140, 50] };
      const ler = () => {
        if (d) return d;
        try { d = JSON.parse(localStorage.getItem(K) || "null"); } catch { d = null; }
        if (!d) {
          d = { produtos: CATALOGO_STK.map(([codigo, nome, categoria, ordem]) => ({ id: "s-" + codigo, codigo, nome, categoria, ordem, quantidade: exemplo[codigo]?.[0] ?? null, minimo: exemplo[codigo]?.[1] ?? null, unidade: "un.", ativo: true,
            alerta: "ok", alerta_desde: null, ultimo_aviso: null, ignorado_por: null, atualizado_por: null, atualizado_em: agora() })), movimentos: [], config: { id: 1, avisar: [], hora_inicio: 8, hora_fim: 21 } };
          d.produtos.forEach(estado);
        }
        seq = Math.max(1, ...d.movimentos.map((m) => m.id + 1));
        return d;
      };
      const guardar = () => { try { localStorage.setItem(K, JSON.stringify(d)); } catch { /* */ } };
      function estado(p) {
        if (p.ativo && p.minimo != null && p.quantidade != null && p.quantidade <= p.minimo) { if (p.alerta === "ok") Object.assign(p, { alerta: "alerta", alerta_desde: agora(), ultimo_aviso: null }); }
        else Object.assign(p, { alerta: "ok", alerta_desde: null, ultimo_aviso: null, ignorado_por: null });
      }
      const destinos = () => (d.config.avisar.length ? d.config.avisar : db.perfis.filter((x) => x.ativo && x.departamento_id === "logistica").map((x) => x.id));
      function avisar(p) {
        destinos().forEach((dest) => {
          db.notificacoes = db.notificacoes.filter((n) => !(n.destinatario_id === dest && n.link === "#stock-" + p.id && !n.lida));
          notificar(dest, "stock", "Repor stock: " + p.nome, "Restam " + p.quantidade + " " + p.unidade + " (mínimo " + p.minimo + "). Abre a Central para marcar como reposto ou ignorar.", "#stock-" + p.id);
        });
        p.ultimo_aviso = agora(); gravar(db);
      }
      // Encomenda pronta → o stock desce; cancelada ou de volta → volta a entrar (igual ao script 13)
      ganchos.stock = (enc) => {
        ler();
        const ref = "E-" + String(enc.numero).padStart(4, "0"), alvo = {};
        if (["pronta", "em_rota", "entregue"].includes(enc.estado)) (enc.itens || []).forEach((i) => { if (i.produto_id) alvo[i.produto_id] = (alvo[i.produto_id] || 0) + Math.max(0, +i.qtd || 1); });
        const atual = enc.stock_movido || {}, novo = {};
        for (const k of new Set([...Object.keys(alvo), ...Object.keys(atual)])) {
          const quer = alvo[k] || 0, tem = atual[k] || 0; let feito = 0;
          const p = d.produtos.find((x) => x.id === k);
          if (quer !== tem && p && p.quantidade != null) {
            const v = Math.max(0, p.quantidade - (quer - tem)); feito = p.quantidade - v;
            if (feito) {
              d.movimentos.unshift({ id: seq++, produto_id: k, tipo: feito > 0 ? "saida" : "entrada", quantidade: Math.abs(feito), antes: p.quantidade, depois: v,
                nota: (quer > tem ? "Encomenda " + ref + " · " + enc.cliente_nome + (quer - tem > p.quantidade ? " · faltavam " + (quer - tem - p.quantidade) : "") : enc.estado === "cancelada" ? "Encomenda " + ref + " cancelada" : "Encomenda " + ref + " alterada"), autor_id: euId, criado_em: agora() });
              p.quantidade = v; estado(p); if (p.alerta === "alerta" && !p.ultimo_aviso) avisar(p); if (p.alerta === "ok") limparAvisos(k);
            }
          }
          if (tem + feito) novo[k] = tem + feito;
        }
        enc.stock_movido = Object.keys(novo).length ? novo : null;
        guardar();
      };
      const limparAvisos = (id) => { db.notificacoes = db.notificacoes.filter((n) => !(n.link === "#stock-" + id && !n.lida)); gravar(db); };
      return {
        async carregar() {
          ler(); if (!pode()) return { produtos: [], movimentos: [], config: null };
          d.config.prazo_fabrico ??= 30; d.config.cobertura ??= 60;
          const desde = Date.now() - 90 * 864e5, vendas = API.crm ? JSON.parse(localStorage.getItem("central26-demo-crm-v1") || "null")?.vendas || [] : [];
          const procura = d.produtos.map((p) => ({ produto_id: p.id, dias: 90,
            vendido: p.codigo_multixop ? vendas.filter((v) => v.produto_codigo === p.codigo_multixop && Date.parse(v.data) > desde).reduce((s, v) => s + (v.tipo === "NC" ? -Math.abs(+v.qtd) : +v.qtd), 0) : 0,
            saidas: d.movimentos.filter((m) => m.produto_id === p.id && m.tipo === "saida" && Date.parse(m.criado_em) > desde).reduce((s, m) => s + m.quantidade, 0) }));
          return structuredClone({ produtos: d.produtos, movimentos: d.movimentos.slice(0, 300), config: d.config, procura });
        },
        async catalogoMultixop() {
          let c = null; try { c = JSON.parse(localStorage.getItem("central26-demo-crm-v1") || "null"); } catch { c = null; }
          return (c?.produtos || []).filter((x) => (x.linha || "produtos") === "produtos").map((x) => ({ codigo: x.codigo, descricao: x.descricao, vendido_ano: 0 }));
        },
        async movimento(id, tipo, qtd, nota) {
          ler(); if (!pode()) throw new Error("Sem acesso aos stocks.");
          const p = d.produtos.find((x) => x.id === id); if (!p) throw new Error("Produto não encontrado.");
          qtd = Number(qtd); if (!Number.isInteger(qtd) || qtd < 0 || (["saida", "entrada"].includes(tipo) && qtd === 0)) throw new Error("Indica uma quantidade válida.");
          let novo;
          if (tipo === "saida") { if (p.quantidade == null) throw new Error("Este produto ainda não foi contado. Acerta primeiro a contagem."); if (qtd > p.quantidade) throw new Error("Só há " + p.quantidade + " " + p.unidade + " de " + p.nome + "."); novo = p.quantidade - qtd; }
          else if (tipo === "entrada") novo = (p.quantidade || 0) + qtd; else novo = qtd;
          d.movimentos.unshift({ id: seq++, produto_id: id, tipo, quantidade: qtd, antes: p.quantidade, depois: novo, nota: nota || "", autor_id: euId, criado_em: agora() });
          p.quantidade = novo; p.atualizado_por = euId; p.atualizado_em = agora(); estado(p);
          if (p.alerta === "alerta" && !p.ultimo_aviso) avisar(p);
          if (p.alerta === "ok") limparAvisos(id);
          guardar(); return structuredClone(p);
        },
        async ignorar(id) { ler(); const p = d.produtos.find((x) => x.id === id); if (p.alerta !== "ok") Object.assign(p, { alerta: "ignorado", ignorado_por: euId, ultimo_aviso: agora() }); limparAvisos(id); guardar(); return structuredClone(p); },
        async criar(c) { ler(); const p = { id: "s-" + uid(), codigo: null, ordem: 99, quantidade: null, minimo: null, unidade: "un.", ativo: true, alerta: "ok", ...c, quantidade: null, atualizado_em: agora() }; estado(p); d.produtos.push(p); guardar(); return structuredClone(p); },
        async atualizar(id, campos) { ler(); const p = d.produtos.find((x) => x.id === id); const { quantidade, alerta, ...resto } = campos; Object.assign(p, resto, { atualizado_por: euId, atualizado_em: agora() }); estado(p); guardar(); return structuredClone(p); },
        async apagar(id) { ler(); if (!eGestor(eu())) throw new Error("Só a direção elimina produtos."); d.produtos = d.produtos.filter((x) => x.id !== id); guardar(); },
        async importar(lista) {
          ler(); let novos = 0, atualizados = 0;
          for (const x of lista) {
            if (!String(x.nome || "").trim()) continue;
            let p = d.produtos.find((y) => (x.codigo && y.codigo === x.codigo) || y.nome.trim().toLowerCase() === String(x.nome).trim().toLowerCase());
            const q = x.quantidade === "" || x.quantidade == null ? null : Math.round(Number(x.quantidade)), m = x.minimo === "" || x.minimo == null ? null : Math.round(Number(x.minimo));
            if (!p) { p = { id: "s-" + uid(), codigo: x.codigo || null, nome: String(x.nome).trim(), categoria: x.categoria || "Outros", ordem: 99, quantidade: q, minimo: m, unidade: "un.", ativo: true, alerta: "ok" }; d.produtos.push(p); novos++; }
            else { if (q != null && q !== p.quantidade) d.movimentos.unshift({ id: seq++, produto_id: p.id, tipo: "acerto", quantidade: q, antes: p.quantidade, depois: q, nota: "Importação", autor_id: euId, criado_em: agora() });
              if (q != null) p.quantidade = q; if ("minimo" in x) p.minimo = m; if (x.categoria) p.categoria = x.categoria; atualizados++; }
            estado(p); if (p.alerta === "alerta" && !p.ultimo_aviso) avisar(p);
          }
          guardar(); return { novos, atualizados };
        },
        async guardarConfig(campos) { ler(); if (!eGestor(eu())) throw new Error("Só a direção muda os avisos."); Object.assign(d.config, campos); guardar(); return structuredClone(d.config); },
        subscrever() { return () => {}; },
      };
    })(),
    // Prospeção (igual ao script 16): o agente é simulado com os guiões (sem IA no modo de demonstração)
    prs: (() => {
      const K = "central26-demo-prs-v2";
      let d = null;
      const GUIOES = [
        { tipo: "Mensagem WhatsApp", texto: "Olá, {Nome}. Falo da TwentySix, marca portuguesa de produtos profissionais para barbearias. Gostávamos de passar aí com umas amostras e apresentar a linha. Que dia vos dá mais jeito?" },
        { tipo: "Mensagem Instagram DM", texto: "Olá, {Nome}! Somos a TwentySix, marca portuguesa de grooming. Podemos passar aí com amostras para conhecerem os produtos?" },
        { tipo: "Email profissional de apresentação", texto: "Assunto: TwentySix | apresentação para a {Nome}\n\nOlá,\n\nSomos a TwentySix, marca portuguesa de produtos profissionais de grooming. Gostávamos de marcar uma visita curta para mostrar a linha e deixar amostras.\n\nObrigado," },
        { tipo: "Follow-up 1", texto: "Olá, {Nome}. Só para confirmar se viram a nossa mensagem. Continuamos com vontade de passar aí com amostras da TwentySix. Que dia vos dá jeito?" },
        { tipo: "Follow-up 2", texto: "Olá, {Nome}. Última mensagem da nossa parte, para não insistir. Se fizer sentido conhecer a TwentySix, é só responder e combinamos a visita. Obrigado." },
      ];
      const L = (nome, concelho, distrito, extra) => ({ id: "l-" + uid(), nome, concelho, distrito, morada: "", telefone: "", email: "", website: "", instagram: "", whatsapp: "", link_marcacao: "", link_mapa: "",
        tipo_negocio: "Barbearia", confianca: "Alta", prioridade: "alta", estado_prospecao: "Pronto a contactar", score: 80, motivo: "Exemplo", canal_recomendado: "WhatsApp / Telefone", nivel_visita: "B - visita normal",
        proximo_passo: "Pré-contactar antes da visita", zona_codigo: "Z01", origem: "prospecao", etapa: "lead", tipo: "lead", responsavel_id: null, recolhido_em: hoje(), criado_em: agora(), ...extra });
      const ler = () => {
        if (d) return d;
        try { d = JSON.parse(localStorage.getItem(K) || "null"); } catch { d = null; }
        if (!d) {
          const leads = [
            L("Barbearia Exemplo Norte", "Porto", "Porto", { telefone: "+351 910 000 001", score: 95 }),
            L("Studio Exemplo Fade", "Matosinhos", "Porto", { telefone: "+351 910 000 002", instagram: "https://www.instagram.com/exemplo.fade", zona_codigo: "Z02" }),
            L("Barber Exemplo Centro", "Braga", "Braga", { email: "geral@exemplo.pt", telefone: "+351 253 000 003", zona_codigo: "Z06", canal_recomendado: "" }),
            L("Barbearia Exemplo Sul", "Coimbra", "Coimbra", { instagram: "https://www.instagram.com/exemplo.sul", canal_recomendado: "Instagram DM", zona_codigo: "Z12", prioridade: "média", estado_prospecao: "Bom lead digital", score: 70 }),
            L("Exemplo Barber Club", "Viseu", "Viseu", { telefone: "+351 910 000 005", zona_codigo: "Z15", estado_prospecao: "A validar", prioridade: "baixa", score: 45 }),
          ];
          d = { cfg: { id: 1, ativo: true, por_semana: 25, dia_semana: 1, hora: 8, aprovadores: ["p-marcos", "p-wembley", "p-samuel"], comercial_id: "p-wembley", assinatura: "Wembley Costa · TwentySix", email_resposta: "",
            oferta: "Linha profissional TwentySix e formações da 26 Academy. A primeira abordagem serve para marcar uma visita do comercial com amostras.",
            perguntas_internas: ["Levamos amostras nesta visita? De que produtos?", "Em que dia propomos a visita (dentro da rota da zona)?", "Apresentamos também a 26 Academy?", "Há alguma condição para a primeira encomenda?"],
            perguntas_barbearia: ["Quantas cadeiras e barbeiros têm?", "Que marcas usam hoje, e onde compram?", "Vendem produtos aos clientes?", "Quem decide as compras, e qual o melhor dia para uma visita?", "Têm interesse em formação para a equipa?"],
            guioes: GUIOES, seguimentos: true, seguimento1_dias: 4, seguimento2_dias: 5, pesquisa_auto: true, distritos: [], max_novos: 40, plano_inicio: null, ultima_semana: "", ultima_pesquisa: null },
            leads, propostas: [], balancos: [], excluidos: [{ chave: "exemplo posto de parte|lisboa", nome: "Exemplo posto de parte", distrito: "Lisboa", concelho: "Lisboa", motivo: "distrito fora do reforço prioritário", morada: "", telefone: "", email: "", website: "", instagram: "" }],
            zonas: [{ codigo: "Z01", nome: "Porto Centro", semana: 1, dia: 1, distritos: "Porto", concelhos: "Porto", visitas: 12, remotos: 12, recursos: "1 comercial", objetivo: "Visitar as contas prioritárias", observacoes: "", estado: "Por executar" },
              { codigo: "Z02", nome: "Matosinhos", semana: 1, dia: 2, distritos: "Porto", concelhos: "Matosinhos", visitas: 8, remotos: 10, recursos: "1 comercial", objetivo: "", observacoes: "", estado: "Por executar" }] };
          leads.slice(0, 4).forEach((c) => d.propostas.push(gerar(nova(c))));
          // uma barbearia já abordada há 5 dias, sem resposta: dá origem a um seguimento
          const antes = new Date(Date.now() - 5 * 864e5).toISOString(), c5 = leads[4]; c5.etapa = "contactado";
          d.propostas.push({ ...gerar(nova(c5)), estado: "enviada", aprovada_por: "p-wembley", aprovada_em: antes, enviada_por: "p-wembley", enviada_em: antes, criado_em: antes });
        }
        seguimentos();
        return d;
      };
      // igual a prs_seguimentos() do script 17
      function seguimentos() {
        if (!d.cfg.ativo || d.cfg.seguimentos === false) return;
        let n = 0;
        for (const pr of d.propostas.slice()) {
          if (pr.estado !== "enviada" || pr.respondeu_em || !["inicial", "seguimento1", undefined].includes(pr.tipo)) continue;
          const tipo = (pr.tipo || "inicial") === "inicial" ? "seguimento1" : "seguimento2", dias = tipo === "seguimento1" ? d.cfg.seguimento1_dias ?? 4 : d.cfg.seguimento2_dias ?? 5;
          const c = d.leads.find((x) => x.id === pr.cliente_id);
          if (!c || c.etapa !== "contactado" || Date.now() - new Date(pr.enviada_em) < dias * 864e5) continue;
          if (d.propostas.some((x) => x.anterior_id === pr.id || (x.cliente_id === pr.cliente_id && x.respondeu_em))) continue;
          const g = (d.cfg.guioes || []).find((x) => new RegExp("^(follow.?up|seguimento)\\s*" + tipo.slice(-1) + "\\b", "i").test(x.tipo));
          if (!g) continue;
          let msg = g.texto.replace(/\{Nome\}/gi, c.nome); if (d.cfg.assinatura && !msg.includes(d.cfg.assinatura)) msg += "\n\n" + d.cfg.assinatura;
          const assunto = pr.canal === "email" ? ("Re: " + (pr.assunto || "TwentySix")).slice(0, 120) : "";
          d.propostas.push({ ...nova(c), canal: pr.canal, destino: pr.destino, assunto, mensagem: msg, mensagens: pr.canal === "email" ? { email: { assunto, corpo: msg } } : { [pr.canal]: msg },
            resumo: "Sem resposta desde " + new Date(pr.enviada_em).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" }) + " (" + (tipo === "seguimento1" ? "primeira abordagem" : "primeiro seguimento") + " por " + pr.canal + ").",
            estado: "pendente", tipo, anterior_id: pr.id, modelo: "guião", gerada_em: agora() });
          n++;
        }
        if (n) { guardar(); avisar("Prospeção: " + n + (n === 1 ? " seguimento por aprovar" : " seguimentos por aprovar"), "Barbearias que ainda não responderam. Revê a mensagem, aprova e envia.", "#prospecao"); }
      }
      const hoje = () => ymd(new Date());
      const guardar = () => { try { localStorage.setItem(K, JSON.stringify(d)); } catch { /* */ } };
      const semana = () => { const [a, w] = semanaIso(new Date()); return a + "-S" + String(w).padStart(2, "0"); };
      const canais = (c) => { const o = {}; const t = String(c.telefone || "").split(/[\/;,]| ou /i)[0].replace(/\D/g, ""); const n9 = t.length === 9 ? "351" + t : t;
        if (/^3519\d{8}$/.test(n9)) o.whatsapp = n9; if (c.email) o.email = c.email; const ig = (c.instagram || "").match(/instagram\.com\/([A-Za-z0-9_.]+)/); if (ig) o.instagram = ig[1]; if (n9.length === 12) o.telefone = n9; return o; };
      const canal = (c) => { const k = canais(c); if (/instagram/i.test(c.canal_recomendado) && k.instagram) return "instagram"; return ["whatsapp", "email", "instagram", "telefone"].find((x) => k[x]) || ""; };
      const nova = (c) => ({ id: "pr-" + uid(), cliente_id: c.id, semana: semana(), canal: canal(c), destino: canais(c)[canal(c)] || "", assunto: "", mensagem: "", mensagens: {}, resumo: "", fontes: [], perguntas: [], perguntas_visita: [],
        estado: "a_gerar", tipo: "inicial", anterior_id: null, respondeu_em: null, respondeu_por: null, resposta: "", tentativas: 0, erro: "", motivo: "", modelo: "", gerada_em: null, aprovada_por: null, aprovada_em: null, enviada_por: null, enviada_em: null, envio_detalhe: "", criado_em: agora(), atualizado_em: agora() });
      function gerar(p, respostas = []) {
        const c = (d?.leads || []).find((x) => x.id === p.cliente_id) || {}, cfg = d?.cfg || { guioes: GUIOES, perguntas_internas: [], perguntas_barbearia: [], assinatura: "Wembley Costa · TwentySix" };
        const g = (t) => ((cfg.guioes || []).find((x) => new RegExp(t, "i").test(x.tipo))?.texto || "").replace(/\{Nome\}/g, c.nome || "");
        const extra = respostas.filter((r) => r.resposta).map((r) => r.resposta).join(". ");
        const assin = "\n\n" + (cfg.assinatura || "Equipa TwentySix");
        const ms = {}; const k = canais(c);
        if (k.whatsapp) ms.whatsapp = g("whatsapp") + (extra ? " " + extra + "." : "") + assin;
        if (k.instagram) ms.instagram = g("instagram") + assin;
        if (k.email) { const t = g("email"); const m = t.match(/^Assunto:\s*(.+)\n+/); ms.email = { assunto: m ? m[1] : "TwentySix | apresentação", corpo: (m ? t.slice(m[0].length) : t) + assin + "\n\nSe preferir não receber mais mensagens nossas, basta responder a dizer e não voltamos a contactar." }; }
        if (k.telefone) ms.telefone = "Apresentar: TwentySix, marca portuguesa de produtos para barbearias.\nMotivo: mostrar a linha e deixar amostras.\nPerguntar: que marcas usam hoje?\nPropor: visita do Wembley esta semana.\nAgradecer.";
        const can = p.canal && ms[p.canal] ? p.canal : Object.keys(ms)[0] || p.canal;
        return { ...p, estado: "pendente", erro: "", canal: can, destino: k[can] || "", mensagens: ms, assunto: can === "email" ? ms.email.assunto : "", mensagem: can === "email" ? ms.email?.corpo || "" : ms[can] || "",
          resumo: "Exemplo do modo de demonstração: " + (c.tipo_negocio || "barbearia") + " em " + (c.concelho || "—") + ", " + (c.estado_prospecao || "") + ". Na app real, o agente lê o site da barbearia e escreve a proposta com IA.",
          perguntas: (cfg.perguntas_internas || []).slice(0, 4).map((t) => ({ texto: t, resposta: (respostas.find((r) => r.texto === t) || {}).resposta || "" })), perguntas_visita: (cfg.perguntas_barbearia || []).slice(0, 6), fontes: c.website ? [c.website] : [], modelo: "demo", gerada_em: agora() };
      }
      const aprova = () => { const e = eu(); return !!e && (eGestor(e) || (d.cfg.aprovadores || []).includes(e.id)); };
      const avisar = (titulo, corpo, link) => { (d.cfg.aprovadores.length ? d.cfg.aprovadores : db.perfis.filter((x) => ["ceo", "admin"].includes(x.papel)).map((x) => x.id)).forEach((id) => notificar(id, "prospecao", titulo, corpo, link)); gravar(db); };
      const prop = (id) => { const p = d.propostas.find((x) => x.id === id); if (!p) throw new Error("Esta proposta já não existe."); return p; };
      return {
        async carregar() { ler(); return structuredClone({ config: d.cfg, propostas: d.propostas, balancos: d.balancos.slice().reverse(), zonas: d.zonas, leads: d.leads, excluidos: d.excluidos.length }); },
        async resumo() { ler(); const propostas = d.propostas.filter((p) => p.estado === "pendente"), ids = new Set(propostas.map((p) => p.cliente_id)); return structuredClone({ config: d.cfg, propostas, leads: d.leads.filter((c) => ids.has(c.id)) }); },
        async importar(p) {
          ler(); const e = eu(); if (!e || !(eGestor(e) || (e.papel === "chefe" && e.departamento_id === "comercial"))) throw new Error("Só a direção e o chefe do Comercial podem importar a base de prospeção.");
          let novos = 0, atualizados = 0;
          for (const l of p.leads || []) {
            const x = d.leads.find((y) => y.chave === l.chave || (y.nome === l.nome && y.concelho === l.concelho));
            const campos = { nome: l.nome, distrito: l.distrito, concelho: l.concelho, morada: l.morada, telefone: l.telefone, email: l.email, website: l.website, instagram: l.instagram, whatsapp: l.whatsapp,
              link_marcacao: l.link_marcacao, link_mapa: l.link_mapa, tipo_negocio: l.tipo_negocio, confianca: l.confianca, prioridade: l.prioridade, estado_prospecao: l.estado, score: l.score, motivo: l.motivo,
              canal_recomendado: l.canal, nivel_visita: l.nivel, proximo_passo: l.proximo, zona_codigo: l.zona, recolhido_em: l.recolhido_em, chave: l.chave };
            if (x) { Object.assign(x, campos); atualizados++; } else { d.leads.push(L(l.nome, l.concelho, l.distrito, { ...campos, origem: "prospecao" })); novos++; }
          }
          for (const z of p.zonas || []) { const i = d.zonas.findIndex((y) => y.codigo === z.codigo); const zz = { estado: "Por executar", ...z }; if (i >= 0) d.zonas[i] = { ...d.zonas[i], ...z }; else d.zonas.push(zz); }
          const ch = new Set(d.excluidos.map((x) => x.chave)); for (const x of p.excluidos || []) if (!ch.has(x.chave)) { d.excluidos.push(x); ch.add(x.chave); }
          if ((p.guioes || []).length) d.cfg.guioes = p.guioes;
          if (p.registo) { d.balancos.push({ id: d.balancos.length + 1, semana: semana(), tipo: "importacao", titulo: "Base de prospeção importada: " + (p.registo.ficheiro || "Excel"), resumo: p.registo, criado_em: agora() });
            avisar("Prospeção: " + p.registo.total + " barbearias na base", p.registo.novos + " novas no CRM e " + p.registo.atualizados + " atualizadas. Vê o balanço na Prospeção.", "#prospecao-balancos"); }
          guardar(); return { novos, atualizados, zonas: (p.zonas || []).length, excluidos: (p.excluidos || []).length };
        },
        async decidir(id, acao, c = {}) {
          ler(); if (!aprova()) throw new Error("Só quem aprova a prospeção pode decidir as propostas."); const p = prop(id);
          if (acao === "guardar" || acao === "aprovar") Object.assign(p, { canal: c.canal ?? p.canal, assunto: c.assunto ?? p.assunto, mensagem: c.mensagem ?? p.mensagem, perguntas: c.perguntas ?? p.perguntas });
          if (acao === "aprovar") Object.assign(p, { estado: "aprovada", aprovada_por: euId, aprovada_em: agora() });
          if (acao === "rejeitar") Object.assign(p, { estado: "rejeitada", motivo: c.motivo || "", aprovada_por: euId, aprovada_em: agora() });
          if (acao === "reabrir") Object.assign(p, { estado: "pendente", motivo: "" });
          guardar(); return structuredClone(p);
        },
        async registarEnvio(id, detalhe) {
          ler(); const p = prop(id); if (p.estado !== "aprovada" && p.estado !== "enviada") throw new Error("A proposta tem de estar aprovada antes de ser enviada.");
          const c = d.leads.find((x) => x.id === p.cliente_id) || {};
          Object.assign(p, { estado: "enviada", enviada_em: agora(), enviada_por: euId, envio_detalhe: detalhe || "" }); if (c.etapa === "lead") c.etapa = "contactado";
          if (d.cfg.comercial_id && (p.tipo || "inicial") === "inicial") notificar(d.cfg.comercial_id, "prospecao", "Barbearia contactada: " + c.nome, "A primeira abordagem foi enviada por " + p.canal + ". Próximo passo: marcar a visita com amostras.", "#prospecao-barbearias");
          gravar(db); guardar(); return structuredClone(p);
        },
        async respondeu(id, nota) {
          ler(); const p = prop(id); if (p.estado !== "enviada") throw new Error("Só se marca a resposta depois de a mensagem ser enviada.");
          if (p.respondeu_em) return structuredClone(p);
          Object.assign(p, { respondeu_em: agora(), respondeu_por: euId, resposta: String(nota || "").slice(0, 1000) });
          d.propostas.forEach((x) => { if (x.cliente_id === p.cliente_id && x.tipo && x.tipo !== "inicial" && ["pendente", "aprovada", "a_gerar", "erro"].includes(x.estado)) Object.assign(x, { estado: "rejeitada", motivo: "A barbearia respondeu", aprovada_por: euId, aprovada_em: agora() }); });
          const c = d.leads.find((x) => x.id === p.cliente_id) || {};
          if (d.cfg.comercial_id && d.cfg.comercial_id !== euId) notificar(d.cfg.comercial_id, "prospecao", "Respondeu: " + c.nome, (String(nota || "").trim().slice(0, 140) || "A barbearia respondeu à mensagem da prospeção.") + " Próximo passo: marcar a visita.", "#prospecao-barbearias");
          gravar(db); guardar(); return structuredClone(p);
        },
        async gerar(id, respostas) { ler(); const i = d.propostas.findIndex((x) => x.id === id); if (i < 0) throw new Error("Esta proposta já não existe."); if ((d.propostas[i].tipo || "inicial") !== "inicial") throw new Error("Os seguimentos usam o guião da empresa: edita a mensagem diretamente."); await new Promise((r) => setTimeout(r, 600)); d.propostas[i] = gerar(d.propostas[i], respostas || []); guardar(); return structuredClone(d.propostas[i]); },
        async enviarEmail(id) { ler(); const p = prop(id); if (p.canal !== "email") throw new Error("Só os emails saem da app."); return this.registarEnvio(id, "email (demonstração: não foi enviado nenhum email)"); },
        async pesquisarAgora() {
          ler(); const novos = ["Barbearia Exemplo Nova A", "Exemplo Barber Lab", "Barbearia Exemplo Nova B"].map((n, i) => L(n, ["Gondomar", "Maia", "Valongo"][i], "Porto", { origem: "auto", telefone: "+351 910 000 1" + i + "0", score: 70 - i * 5, estado_prospecao: "Pronto a contactar", motivo: "Encontrada pela pesquisa automática (exemplo)" }));
          d.leads.push(...novos); d.cfg.ultima_pesquisa = agora();
          d.balancos.push({ id: d.balancos.length + 1, semana: semana(), tipo: "pesquisa", titulo: "Pesquisa de barbearias novas", criado_em: agora(), resumo: { novos: 3, encontrados: 3, distritos: ["Porto"], por_distrito: { Porto: 3 },
            destaques: novos.map((c) => ({ id: c.id, nome: c.nome, concelho: c.concelho, distrito: c.distrito, canal: "whatsapp", contacto: canais(c).whatsapp })) } });
          avisar("Prospeção: 3 barbearias novas", "Encontradas em Porto. Vê o balanço na Prospeção.", "#prospecao-balancos"); guardar();
          return { novos: 3, distritos: ["Porto"], encontrados: 3 };
        },
        async semanaAgora() {
          ler(); const com = new Set(d.propostas.map((p) => p.cliente_id));
          const esc = d.leads.filter((c) => c.etapa === "lead" && !com.has(c.id) && canal(c)).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, d.cfg.por_semana);
          esc.forEach((c) => d.propostas.push(gerar(nova(c)))); d.cfg.ultima_semana = semana();
          d.balancos.push({ id: d.balancos.length + 1, semana: semana(), tipo: "semana", titulo: "Prospeção da semana " + semana().slice(-2), criado_em: agora(),
            resumo: { novos: 0, propostas: esc.length, distritos: [], por_distrito: {}, escolhidas: esc.map((c) => ({ id: c.id, nome: c.nome, concelho: c.concelho, distrito: c.distrito, canal: canal(c), contacto: canais(c)[canal(c)] })) } });
          if (esc.length) avisar(esc.length + " propostas prontas para aprovar", "Revê a mensagem e as questões a definir de cada barbearia, aprova e envia.", "#prospecao");
          guardar(); return { feito: true, propostas: esc.length };
        },
        async guardarConfig(c) { ler(); if (!eGestor(eu())) throw new Error("Só a direção muda as definições."); Object.assign(d.cfg, c); guardar(); return structuredClone(d.cfg); },
        async guardarZona(codigo, c) { ler(); const z = d.zonas.find((x) => x.codigo === codigo); Object.assign(z, c); guardar(); return structuredClone(z); },
        async excluidos(q, de, ate) { ler(); const n = (s) => String(s || "").toLowerCase(); const l = d.excluidos.filter((x) => !q || n(x.nome + " " + x.concelho + " " + x.distrito).includes(n(q))).sort((a, b) => a.nome.localeCompare(b.nome, "pt")); return { itens: structuredClone(l.slice(de, ate + 1)), total: l.length }; },
        async recuperar(chave) { ler(); const x = d.excluidos.find((y) => y.chave === chave); if (!x) throw new Error("Esta barbearia já não está na lista."); d.excluidos = d.excluidos.filter((y) => y !== x);
          const c = L(x.nome, x.concelho, x.distrito, { telefone: x.telefone, email: x.email, instagram: x.instagram, estado_prospecao: "A validar", prioridade: "", score: null, zona_codigo: "", motivo: "Recuperada: " + x.motivo }); d.leads.push(c); guardar(); return c.id; },
        subscrever() { return () => {}; },
      };
    })(),

    // Seguros e viaturas (igual ao script 15): os avisos são simulados ao abrir a página
    prz: (() => {
      const K = "central26-demo-prz-v1";
      let d = null;
      const pode = () => { const e = eu(); return !!e && (eGestor(e) || ["administrativo", "logistica"].includes(e.departamento_id)); };
      const dia = (n) => ymd(new Date(Date.now() + n * 864e5));
      const ler = () => {
        if (d) return d;
        try { d = JSON.parse(localStorage.getItem(K) || "null"); } catch { d = null; }
        if (!d) {
          const v1 = { id: "v-" + uid(), nome: "Carrinha de entregas", matricula: "AA-00-AA", modelo: "Exemplo · carrinha", km: 84200, responsavel_id: "p-rui", notas: "", ativo: true, criado_em: agora(), atualizado_em: agora() };
          const v2 = { id: "v-" + uid(), nome: "Carro da direção", matricula: "BB-11-BB", modelo: "Exemplo · ligeiro", km: 41500, responsavel_id: "p-marcos", notas: "", ativo: true, criado_em: agora(), atualizado_em: agora() };
          const P = (tipo, titulo, v, data, extra = {}) => ({ id: "z-" + uid(), tipo, titulo, viatura_id: v ? v.id : null, entidade: "", referencia: "", data, valor: null, repetir: "anual", avisar_dias: 30, km_limite: null, responsavel_id: null, notas: "",
            estado: "ativo", tratado_em: null, tratado_por: null, tratado_nota: "", anterior_id: null, criado_por: "p-samuel", criado_em: agora(), atualizado_em: agora(), ...extra });
          d = { viaturas: [v1, v2], prazos: [
            P("seguro", "Seguro automóvel · Carrinha de entregas", v1, dia(12), { entidade: "Seguradora (exemplo)", referencia: "AP-0001", valor: 640, responsavel_id: "p-samuel" }),
            P("revisao", "Revisão · Carrinha de entregas", v1, dia(-3), { entidade: "Oficina (exemplo)", km_limite: 90000, avisar_dias: 15 }),
            P("iuc", "IUC · Carrinha de entregas", v1, dia(20), { avisar_dias: 15, valor: 52 }),
            P("inspecao", "Inspeção · Carro da direção", v2, dia(45), { entidade: "Centro de inspeção (exemplo)" }),
            P("seguro", "Seguro automóvel · Carro da direção", v2, dia(130), { entidade: "Seguradora (exemplo)", referencia: "AP-0002", valor: 520 }),
            P("revisao", "Revisão · Carro da direção", v2, dia(160), { avisar_dias: 15 }),
            P("seguro", "Seguro multirriscos · sede", null, dia(75), { entidade: "Seguradora (exemplo)", referencia: "MR-0003", valor: 410, responsavel_id: "p-samuel" }),
            P("seguro", "Seguro de acidentes de trabalho", null, dia(200), { entidade: "Seguradora (exemplo)", referencia: "AT-0004", valor: 980, responsavel_id: "p-samuel" }),
          ], avisos: [], config: { id: 1, avisar: [], hora: 9 } };
        }
        return d;
      };
      const guardar = () => { try { localStorage.setItem(K, JSON.stringify(d)); } catch { /* */ } };
      const vejo = (p) => pode() || p.responsavel_id === euId || d.viaturas.find((v) => v.id === p.viatura_id)?.responsavel_id === euId;
      const dias = (s) => { const [a, m, x] = s.split("-").map(Number); const h = new Date(); h.setHours(0, 0, 0, 0); return Math.round((new Date(a, m - 1, x) - h) / 864e5); };
      function destinos(p) {
        const v = d.viaturas.find((x) => x.id === p.viatura_id);
        const l = [...new Set([p.responsavel_id, v?.responsavel_id, ...d.config.avisar].filter(Boolean))].filter((id) => db.perfis.find((x) => x.id === id && x.ativo));
        return l.length ? l : db.perfis.filter((x) => x.ativo && ["ceo", "admin"].includes(x.papel)).map((x) => x.id);
      }
      function lembretes() {
        for (const p of d.prazos.filter((x) => x.estado === "ativo")) {
          const n = dias(p.data);
          const marco = n < 0 ? "atraso-" + Math.floor((-n - 1) / 7) : n === 0 ? "dia" : n === 1 ? "vespera" : n > p.avisar_dias ? null : n <= 7 ? "semana" : "antes";
          if (!marco || d.avisos.includes(p.id + "|" + marco)) continue;
          d.avisos.push(p.id + "|" + marco);
          const v = d.viaturas.find((x) => x.id === p.viatura_id);
          const tit = n < 0 ? "Em atraso: " + p.titulo : n === 0 ? "Hoje: " + p.titulo : n === 1 ? "Amanhã: " + p.titulo : p.titulo + " · daqui a " + n + " dias";
          const corpo = [(n < 0 ? "Passou a " : "Data: ") + p.data.split("-").reverse().join("/"), v ? v.nome + (v.matricula ? " (" + v.matricula + ")" : "") : "", p.entidade, p.referencia ? "Ref. " + p.referencia : ""].filter(Boolean).join(" · ") +
            ". Quando estiver tratado, marca-o como " + ({ seguro: "renovado", iuc: "pago" }[p.tipo] || "feito") + " na Central.";
          destinos(p).forEach((dest) => { db.notificacoes = db.notificacoes.filter((x) => !(x.destinatario_id === dest && x.link === "#prazo-" + p.id && !x.lida)); notificar(dest, "prazo", tit, corpo, "#prazo-" + p.id); });
        }
        gravar(db); guardar();
      }
      const limpar = (id) => { d.avisos = d.avisos.filter((x) => !x.startsWith(id + "|")); db.notificacoes = db.notificacoes.filter((x) => !(x.link === "#prazo-" + id && !x.lida)); gravar(db); };
      const somar = (s, meses) => { const [a, m, x] = s.split("-").map(Number); const t = new Date(a, m - 1 + meses, 1); t.setDate(Math.min(x, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate())); return ymd(t); };
      const MESES = { mensal: 1, trimestral: 3, semestral: 6, anual: 12, bienal: 24 };
      const exigir = () => { if (!pode()) throw new Error("Sem acesso aos seguros e viaturas."); };
      return {
        async carregar() {
          ler(); lembretes();
          const ps = d.prazos.filter(vejo), vs = d.viaturas.filter((v) => pode() || v.responsavel_id === euId || ps.some((p) => p.viatura_id === v.id));
          return structuredClone({ viaturas: vs, prazos: ps, config: pode() ? d.config : null });
        },
        async criarPrazo(c) { ler(); exigir(); const p = { id: "z-" + uid(), entidade: "", referencia: "", valor: null, repetir: "anual", avisar_dias: 30, km_limite: null, responsavel_id: null, notas: "", estado: "ativo", tratado_em: null, tratado_por: null, tratado_nota: "", anterior_id: null, criado_por: euId, criado_em: agora(), atualizado_em: agora(), ...c };
          d.prazos.push(p); guardar(); lembretes(); return structuredClone(p); },
        async atualizarPrazo(id, campos) { ler(); exigir(); const p = d.prazos.find((x) => x.id === id); if (!p) throw new Error("Este prazo já não existe.");
          if (("data" in campos && campos.data !== p.data) || ("avisar_dias" in campos && campos.avisar_dias !== p.avisar_dias)) limpar(id);
          Object.assign(p, campos, { atualizado_em: agora() }); guardar(); return structuredClone(p); },
        async apagarPrazo(id) { ler(); if (!eGestor(eu())) throw new Error("Só a direção elimina prazos."); limpar(id); d.prazos = d.prazos.filter((x) => x.id !== id); guardar(); },
        async tratar(id, proxima, nota) {
          ler(); const p = d.prazos.find((x) => x.id === id); if (!p || !vejo(p)) throw new Error("Este prazo já não existe."); if (p.estado !== "ativo") throw new Error("Este prazo já foi tratado.");
          Object.assign(p, { estado: "tratado", tratado_em: agora(), tratado_por: euId, tratado_nota: nota || "" }); limpar(id);
          const data = proxima || (MESES[p.repetir] ? somar(p.data, MESES[p.repetir]) : null);
          if (!data) { guardar(); return structuredClone(p); }
          const novo = { ...p, id: "z-" + uid(), data, km_limite: null, estado: "ativo", tratado_em: null, tratado_por: null, tratado_nota: "", anterior_id: p.id, criado_por: euId, criado_em: agora(), atualizado_em: agora() };
          d.prazos.push(novo); guardar(); return structuredClone(novo);
        },
        async reabrir(id) { ler(); exigir(); d.prazos = d.prazos.filter((x) => !(x.anterior_id === id && x.estado === "ativo")); const p = d.prazos.find((x) => x.id === id); if (!p) throw new Error("Este prazo já não existe.");
          Object.assign(p, { estado: "ativo", tratado_em: null, tratado_por: null, tratado_nota: "" }); limpar(id); guardar(); return structuredClone(p); },
        async criarViatura(c) { ler(); exigir(); const v = { id: "v-" + uid(), matricula: "", modelo: "", km: null, responsavel_id: null, notas: "", ativo: true, criado_em: agora(), atualizado_em: agora(), ...c }; d.viaturas.push(v); guardar(); return structuredClone(v); },
        async atualizarViatura(id, campos) { ler(); exigir(); const v = d.viaturas.find((x) => x.id === id); Object.assign(v, campos, { atualizado_em: agora() }); guardar(); return structuredClone(v); },
        async apagarViatura(id) { ler(); if (!eGestor(eu())) throw new Error("Só a direção elimina viaturas."); d.prazos.filter((p) => p.viatura_id === id).forEach((p) => limpar(p.id)); d.prazos = d.prazos.filter((p) => p.viatura_id !== id); d.viaturas = d.viaturas.filter((x) => x.id !== id); guardar(); },
        async guardarConfig(campos) { ler(); if (!eGestor(eu())) throw new Error("Só a direção muda os avisos."); Object.assign(d.config, campos); guardar(); return structuredClone(d.config); },
        subscrever() { return () => {}; },
      };
    })(),

    // 26 Academy (igual ao script 19), com formandos e formações de exemplo
    // Estatísticas das barbearias (exemplo: começa vazio; importa-se um ficheiro .Booknetic)
    bar: (() => {
      const K = "central26-demo-bar-v1";
      const ler = () => { try { return JSON.parse(localStorage.getItem(K) || "null"); } catch { return null; } };
      return {
        async carregar() { const d = ler(); return d ? structuredClone(d) : { stats: [], horas: [], imp: null }; },
        async importar(p) {
          if (!eGestor(eu())) throw new Error("Só a direção importa as estatísticas das barbearias.");
          const d = { stats: p.linhas, horas: p.horas, imp: { id: 1, resumo: p.resumo, ficheiro: p.ficheiro, importado_em: agora(), importado_por: euId } };
          try { localStorage.setItem(K, JSON.stringify(d)); } catch { /* sem espaço */ }
          return { linhas: p.linhas.length, horas: p.horas.length };
        },
      };
    })(),
    // Lojas (exemplo)
    loj: (() => {
      const K = "central26-demo-loj-v1";
      let d = null;
      const ler = () => {
        if (d) return d;
        try { d = JSON.parse(localStorage.getItem(K) || "null"); } catch { d = null; }
        if (!d) {
          const nomes = ["Luvas de látex|caixa", "Papel higiénico|rolo", "Rolo de papel de cozinha|rolo", "Esfregona|un.", "Líquido de chão|garrafa", "WC Pato|un.", "Bloco sanitário (pendurar na sanita)|un.", "Multiusos|garrafa",
            "Líquido de vidros|garrafa", "Ambientador (Ambipur)|un.", "Água de colónia|garrafa", "Sacos do lixo 50 L|rolo", "Sacos do lixo 10 L|rolo", "Rebuçados|saco"];
          d = { seq: 1, lojas: [["morro", "Jardim do Morro"], ["santo-ovidio", "Santo Ovídio"], ["porto", "Porto"], ["arcozelo", "Arcozelo"], ["madalena", "Madalena"]].map(([id, nome], i) => ({ id, nome, responsavel_id: id === "madalena" ? "p-loja" : null, ativo: true, ordem: i + 1 })),
            itens: nomes.map((x, i) => { const [nome, unidade] = x.split("|"); return { id: uid(), nome, categoria: "consumivel", unidade, ativo: true, ordem: i + 1, criado_em: agora() }; }),
            stock: [], pedidos: [], cadeiras: [], meses: [], config: { id: 1, recebe_semanal: [], recebe_trocos: [], recebe_manutencao: [] } };
          d.itens.slice(0, 6).forEach((it, i) => d.stock.push({ loja_id: "madalena", item_id: it.id, quantidade: [1, 8, 3, 2, 1, 4][i], minimo: [2, 6, 4, 1, 2, 2][i], atualizado_em: agora(), atualizado_por: "p-loja" }));
        }
        return d;
      };
      const guardar = () => { try { localStorage.setItem(K, JSON.stringify(d)); } catch { /* */ } };
      const gestor = () => eGestor(eu()), logi = () => gestor() || eu()?.departamento_id === "logistica";
      const resp = (loja) => ler().lojas.some((l) => l.id === loja && l.responsavel_id === euId);
      const dest = (tipo) => { const c = ler().config, l = { semanal: c.recebe_semanal, trocos: c.recebe_trocos, manutencao: c.recebe_manutencao }[tipo] || [];
        return db.perfis.filter((p) => p.ativo && (l.length ? l.includes(p.id) : tipo === "semanal" ? p.departamento_id === "logistica" || ["ceo", "admin"].includes(p.papel) : ["ceo", "admin"].includes(p.papel))).map((p) => p.id); };
      const trata = (tipo) => gestor() || (tipo === "semanal" && logi()) || dest(tipo).includes(euId);
      const TIP = { semanal: "Pedido da semana", trocos: "Pedido de trocos", manutencao: "Pedido de manutenção" };
      return {
        async carregar() {
          const x = ler();
          const pode = logi() || x.lojas.some((l) => l.responsavel_id === euId);
          return structuredClone({ lojas: x.lojas, itens: pode ? x.itens : [], stock: x.stock.filter((s) => logi() || resp(s.loja_id)),
            pedidos: x.pedidos.filter((p) => resp(p.loja_id) || p.criado_por === euId || trata(p.tipo)), config: pode ? x.config : null });
        },
        async loja(id, campos) { if (!gestor()) throw new Error("Só a direção muda as lojas."); const l = ler().lojas.find((y) => y.id === id); Object.assign(l, campos); guardar(); return structuredClone(l); },
        async criarItem(o) { if (!logi()) throw new Error("Sem permissão."); const r = { id: uid(), categoria: "consumivel", unidade: "un.", ativo: true, ordem: 99, criado_em: agora(), ...o }; ler().itens.push(r); guardar(); return structuredClone(r); },
        async item(id, campos) { if (!logi()) throw new Error("Sem permissão."); const r = ler().itens.find((y) => y.id === id); Object.assign(r, campos); guardar(); return structuredClone(r); },
        async stock(loja_id, item_id, campos) {
          if (!logi() && !resp(loja_id)) throw new Error("Sem permissão para mexer no stock desta loja.");
          const x = ler(); let r = x.stock.find((y) => y.loja_id === loja_id && y.item_id === item_id);
          if (!r) { r = { loja_id, item_id, quantidade: null, minimo: null }; x.stock.push(r); }
          Object.assign(r, campos, { atualizado_em: agora(), atualizado_por: euId }); guardar(); return structuredClone(r);
        },
        async criarPedido(o) {
          if (!gestor() && !resp(o.loja_id)) throw new Error("Só o responsável da loja (ou a direção) faz pedidos para esta loja.");
          const x = ler(), r = { itens: [], trocos: {}, descricao: "", urgente: false, ...o, id: uid(), numero: x.seq++, estado: "pedido", resposta: "", criado_por: euId, criado_em: agora(), atualizado_em: agora(), tratado_por: null, feito_em: null, stock_somado: false };
          x.pedidos.push(r); guardar();
          const loja = x.lojas.find((l) => l.id === r.loja_id)?.nome;
          dest(r.tipo).filter((p) => p !== euId).forEach((p) => notificar(p, "loja", (r.urgente ? "Urgente · " : "") + TIP[r.tipo] + " · " + loja, nome(euId), "#lojas-pedidos"));
          gravar(db); return structuredClone(r);
        },
        async pedido(id, campos) {
          const x = ler(), r = x.pedidos.find((y) => y.id === id); if (!r) throw new Error("O pedido já não existe.");
          if (!trata(r.tipo)) {
            if (r.estado !== "pedido") throw new Error("O pedido já está a ser tratado. Fala com quem o está a tratar.");
            if (campos.estado && !["pedido", "cancelado"].includes(campos.estado)) throw new Error("Só quem trata os pedidos muda o estado.");
          }
          const antes = r.estado;
          Object.assign(r, campos, { atualizado_em: agora() });
          if (r.estado !== antes && ["em_curso", "feito"].includes(r.estado)) r.tratado_por = euId;
          if (r.estado === "feito" && antes !== "feito") r.feito_em = agora();
          if (r.tipo === "semanal" && r.estado === "feito" && !r.stock_somado) {
            r.itens.filter((i) => i.item_id).forEach((i) => { let s = x.stock.find((y) => y.loja_id === r.loja_id && y.item_id === i.item_id); if (!s) { s = { loja_id: r.loja_id, item_id: i.item_id, quantidade: 0, minimo: null }; x.stock.push(s); } s.quantidade = (s.quantidade || 0) + (+i.qtd || 0); s.atualizado_em = agora(); });
            r.stock_somado = true;
          }
          if (r.estado !== antes && r.criado_por !== euId && ["em_curso", "feito", "cancelado"].includes(r.estado))
            notificar(r.criado_por, "loja", TIP[r.tipo] + " " + ({ em_curso: "a ser tratado", feito: "feito", cancelado: "cancelado" })[r.estado], (x.lojas.find((l) => l.id === r.loja_id)?.nome || "") + (r.resposta ? " · " + r.resposta : ""), "#lojas-pedidos");
          guardar(); gravar(db); return structuredClone(r);
        },
        async configurar(campos) { if (!gestor()) throw new Error("Só a direção muda as definições."); Object.assign(ler().config, campos); guardar(); return structuredClone(ler().config); },
        async cadeiras(mes) { if (!gestor()) throw new Error("Só a direção vê o aluguer de cadeiras."); const x = ler(); return structuredClone({ cadeiras: x.cadeiras, meses: x.meses.filter((m) => m.mes === mes), folha: [] }); },
        async criarCadeira(o) { const r = { id: uid(), ativo: true, criado_em: agora(), nif: "", loja_id: null, fixo: 300, percentagem: 5, ...o }; ler().cadeiras.push(r); guardar(); return structuredClone(r); },
        async cadeira(id, campos) { const r = ler().cadeiras.find((y) => y.id === id); Object.assign(r, campos); guardar(); return structuredClone(r); },
        async cadeiraMes(o) { const x = ler(); x.meses = x.meses.filter((m) => !(m.cadeira_id === o.cadeira_id && m.mes === o.mes)).concat([{ ...o }]); guardar(); return structuredClone(o); },
        subscrever() { return () => {}; },
      };
    })(),
    // Proformas (exemplo): preços inventados para os produtos de exemplo
    com: (() => {
      const K = "central26-demo-com-v1";
      let d = null;
      const ler = () => {
        if (d) return d;
        try { d = JSON.parse(localStorage.getItem(K) || "null"); } catch { d = null; }
        if (!d) {
          const P = [["E01", 8.9, 15.9], ["E02", 8.9, 15.9], ["E03", 7.5, 13.5], ["E04", 9.8, 16.9], ["E05", 8.4, 14.5], ["E06", 16, 27.9]];
          d = { seq: 1, proformas: [],
            precos: P.map(([c, b, prvp], i) => ({ produto_codigo: c, base: b, pro6: Math.round(b * 87) / 100, pro12: Math.round(b * 72) / 100, pvd30: Math.round(b * 70) / 100, pvd40: Math.round(b * 60) / 100, pvd50: Math.round(b * 50) / 100, prvp, ordem: i, atualizado_em: agora(), atualizado_por: null })),
            config: { id: 1, empresa: { nome: "Empresa Exemplo, Lda.", nif: "500000000", morada: "Rua Exemplo, 1", cp: "4400-000 Vila Nova de Gaia", telefone: "", email: "", iban: "" }, iva: 23, validade_dias: 15, desconto_embaixador: 0, desconto_influencer: 5,
              faturador: "p-samuel", patamares: { pro6: 6000, pro12: 12000, pvd40: 3000, pvd50: 5000 }, patamar_por: "encomenda", nacex_servico: "27", atualizado_em: agora() } };
          const it = [{ codigo: "E01", descricao: "Cera modeladora 100 ml (exemplo)", qtd: 12, preco: 8.9 }, { codigo: "E04", descricao: "Óleo para barba 30 ml (exemplo)", qtd: 6, preco: 9.8 }];
          d.proformas.push(calc({ id: uid(), numero: d.seq++, cliente_id: null, cliente: { nome: "Barbearia Exemplo 2", nif: "", morada: "Rua Exemplo, 10", cp: "4400-100", localidade: "Vila Nova de Gaia", telefone: "910000000", telemovel: "", email: "" },
            escalao: "base", embaixador: false, desc_embaixador: 0, desconto: 0, itens: it, iva: 23, envio: "nacex", notas: "", estado: "enviada", validade: ymd(new Date(Date.now() + 10 * 864e5)),
            fatura_numero: "", tarefa_id: null, encomenda_id: null, criado_por: "p-wembley", criado_em: agora(), atualizado_em: agora(), atualizado_por: "p-wembley", aceite_em: null, faturada_em: null, faturada_por: null }));
        }
        ganchos.faturador = () => d.config.faturador;
        return d;
      };
      const guardar = () => { try { localStorage.setItem(K, JSON.stringify(d)); } catch { /* */ } };
      function calc(p) { const t = totais(p); p.subtotal = t.sub; p.total_sem_iva = t.base; return p; }
      const podeCrmD = () => { const e = eu(); return !!e && (eGestor(e) || e.departamento_id === "comercial"); };
      const eFat = () => ler().config.faturador === euId;
      const refP = (p) => "PF-" + String(p.numero).padStart(4, "0");
      const achar = (id) => { const p = ler().proformas.find((x) => x.id === id); if (!p) throw new Error("A proforma já não existe."); return p; };
      setTimeout(() => ler(), 0);
      return {
        async carregar() {
          const x = ler();
          if (!podeCrmD() && !eFat()) return structuredClone({ precos: [], config: x.config, proformas: [] });
          const custos = [["E01", 3.1], ["E02", 3.3], ["E03", 2.4], ["E04", 3.6]].map(([c, v]) => ({ produto_codigo: c, custo: v }));
          return structuredClone({ precos: x.precos, config: x.config, proformas: x.proformas, custos });
        },
        async precos(lote) {
          if (!eGestor(eu())) throw new Error("Só a direção muda a tabela de preços.");
          const x = ler();
          const out = lote.map((n) => { let r = x.precos.find((y) => y.produto_codigo === n.produto_codigo); if (!r) { r = { produto_codigo: n.produto_codigo, ordem: x.precos.length }; x.precos.push(r); } Object.assign(r, n, { atualizado_em: agora(), atualizado_por: euId }); return structuredClone(r); });
          guardar(); return out;
        },
        async configurar(campos) { if (!eGestor(eu())) throw new Error("Só a direção muda as definições."); const x = ler(); Object.assign(x.config, campos, { atualizado_em: agora() }); guardar(); return structuredClone(x.config); },
        async criar(o) {
          if (!podeCrmD()) throw new Error("Sem permissão.");
          const x = ler(), r = calc({ escalao: "base", embaixador: false, desc_embaixador: 0, desconto: 0, itens: [], iva: 23, envio: "nacex", notas: "", validade: null, cliente: {}, cliente_id: null, ...o,
            id: uid(), numero: x.seq++, estado: "rascunho", fatura_numero: "", tarefa_id: null, encomenda_id: null, criado_por: euId, criado_em: agora(), atualizado_em: agora(), atualizado_por: euId, aceite_em: null, faturada_em: null, faturada_por: null });
          x.proformas.unshift(r); guardar(); return structuredClone(r);
        },
        async atualizar(id, campos) {
          if (!podeCrmD()) throw new Error("Sem permissão.");
          const p = achar(id);
          if (!["rascunho", "enviada"].includes(p.estado)) throw new Error("A proforma " + refP(p) + " já foi " + (p.estado === "aceite" ? "aceite e está à espera da fatura" : p.estado) + ". Já não pode ser alterada.");
          if (campos.estado && !["rascunho", "enviada"].includes(campos.estado)) throw new Error("Usa os botões da proforma para a aceitar, faturar ou cancelar.");
          Object.assign(p, campos, { atualizado_em: agora(), atualizado_por: euId }); calc(p); guardar(); return structuredClone(p);
        },
        async apagar(id) { const x = ler(); x.proformas = x.proformas.filter((p) => p.id !== id); guardar(); },
        async aceitar(id) {
          if (!podeCrmD()) throw new Error("Sem permissão.");
          const x = ler(), p = achar(id);
          if (!["rascunho", "enviada"].includes(p.estado)) throw new Error("A proforma " + refP(p) + " não está à espera do cliente.");
          if (!(p.subtotal > 0)) throw new Error("A proforma " + refP(p) + " não tem artigos.");
          if (!x.config.faturador) throw new Error("Falta escolher quem fatura as proformas: Comercial → Proformas → Definições.");
          const linhas = p.itens.filter((i) => i.qtd > 0).map((i) => i.qtd + "× " + i.descricao + " a " + i.preco.toFixed(2).replace(".", ",") + " €").join("\n");
          const t = { id: uid(), modelo: null, titulo: "Faturar " + refP(p) + " · " + (p.cliente.nome || "cliente"), marca: "twentysix", departamento_id: null, freq: "unica", estado: "por_fazer", estado_periodo: "unica", prioridade: "alta",
            responsavel_id: x.config.faturador, prazo: ymd(new Date()), checklist: [], checklist_periodo: "",
            notas: "Criar a fatura no Multixop e escrever o número na Central (Comercial → Proformas → " + refP(p) + ").\n\nCliente: " + (p.cliente.nome || "") + "\n" + linhas + "\nTotal sem IVA: " + p.total_sem_iva.toFixed(2).replace(".", ",") + " €",
            criado_por: euId, criado_em: agora(), atualizado_em: agora(), concluido_por: null, concluido_em: null };
          db.tarefas.push(t); registar(t, "criou");
          if (t.responsavel_id !== euId) { registar(t, "atribuiu"); notificar(t.responsavel_id, "tarefa_atribuida", "Nova tarefa para ti", nome(euId) + " atribuiu-te: " + t.titulo, "#tarefa-" + t.id); }
          if (t.responsavel_id === euId) emitir("tarefas", "INSERT", structuredClone(t));
          gravar(db);
          Object.assign(p, { estado: "aceite", aceite_em: agora(), tarefa_id: t.id, atualizado_em: agora(), atualizado_por: euId }); guardar(); return structuredClone(p);
        },
        async faturar(id, fatura) {
          if (!eGestor(eu()) && !eFat()) throw new Error("Só quem fatura as proformas (ou a direção) pode marcar a fatura.");
          if (!String(fatura || "").trim()) throw new Error("Escreve o número da fatura do Multixop.");
          const x = ler(), p = achar(id);
          if (p.estado !== "aceite") throw new Error("A proforma " + refP(p) + " não está à espera da fatura.");
          const c = p.cliente || {};
          const enc = ganchos.novaEncomenda({ cliente_nome: c.nome || "Cliente", crm_cliente_id: p.cliente_id, contacto: c.telefone || c.telemovel || "", morada: [c.morada, [c.cp, c.localidade].filter(Boolean).join(" ")].filter(Boolean).join(", "),
            itens: p.itens.filter((i) => i.qtd > 0).map((i, n) => ({ id: "i" + (n + 1), descricao: i.descricao, qtd: i.qtd, preparado: false })), notas: refP(p) + (p.notas ? "\n" + p.notas : ""), fatura_numero: String(fatura).trim(),
            criado_por: p.criado_por, transportadora: p.envio === "nacex" ? "nacex" : p.envio === "levanta" ? "levanta" : "", envio: { ...c, servico: x.config.nacex_servico }, proforma_id: p.id });
          const t = db.tarefas.find((y) => y.id === p.tarefa_id);
          if (t && t.estado !== "concluido") { Object.assign(t, { estado: "concluido", concluido_por: euId, concluido_em: agora(), atualizado_em: agora() }); registar(t, "concluiu"); if (t.criado_por !== euId) notificar(t.criado_por, "tarefa_concluida", "Tarefa concluída", nome(euId) + " concluiu: " + t.titulo, "#tarefa-" + t.id); emitir("tarefas", "UPDATE", structuredClone(t)); gravar(db); }
          Object.assign(p, { estado: "faturada", fatura_numero: String(fatura).trim(), encomenda_id: enc.id, faturada_em: agora(), faturada_por: euId, atualizado_em: agora() }); guardar(); return structuredClone(p);
        },
        async cancelar(id) {
          const p = achar(id);
          if (p.estado === "faturada") throw new Error("A proforma já foi faturada: cancela a encomenda na Logística e faz a nota de crédito no Multixop.");
          if (p.tarefa_id) { db.tarefas = db.tarefas.filter((t) => t.id !== p.tarefa_id); gravar(db); }
          Object.assign(p, { estado: "cancelada", tarefa_id: null, atualizado_em: agora() }); guardar(); return structuredClone(p);
        },
        async reabrir(id) {
          const p = achar(id);
          if (!["aceite", "cancelada"].includes(p.estado)) throw new Error("Só se volta a abrir uma proforma aceite (ainda sem fatura) ou cancelada.");
          if (p.tarefa_id) { db.tarefas = db.tarefas.filter((t) => t.id !== p.tarefa_id); gravar(db); }
          Object.assign(p, { estado: "enviada", tarefa_id: null, aceite_em: null, atualizado_em: agora() }); guardar(); return structuredClone(p);
        },
        subscrever() { return () => {}; },
      };
    })(),
    aca: (() => {
      const K = "central26-demo-aca-v2";
      let d = null;
      const pode = () => { const e = eu(); return !!e && (eGestor(e) || e.departamento_id === "administrativo"); };
      const so = () => { if (!pode()) throw new Error("Sem acesso à Academy."); };
      const dia = (n) => ymd(new Date(Date.now() + n * 864e5));
      const ler = () => {
        if (d) return d;
        try { d = JSON.parse(localStorage.getItem(K) || "null"); } catch { d = null; }
        if (!d) {
          // [concelho, código, região] de exemplo
          const L = [["Porto", "1312", "Norte"], ["Vila Nova de Gaia", "1317", "Norte"], ["Gondomar", "1304", "Norte"], ["Braga", "0303", "Norte"], ["Penafiel", "1311", "Norte"], ["Santa Maria da Feira", "0109", "Norte"],
            ["Aveiro", "0105", "Centro"], ["Coimbra", "0603", "Centro"], ["Viseu", "1823", "Centro"], ["Leiria", "1009", "Centro"], ["Santarém", "1416", "Oeste e Vale do Tejo"], ["Lisboa", "1106", "Grande Lisboa"],
            ["Setúbal", "1512", "Península de Setúbal"], ["Faro", "0805", "Algarve"], ["Évora", "0705", "Alentejo"], ["Ponta Delgada", "4203", "Açores"], ["Funchal", "3103", "Madeira"]];
          const pesos = [8, 7, 5, 3, 4, 4, 3, 2, 2, 1, 1, 2, 1, 1, 1, 1, 1];
          const sorteio = pesos.flatMap((p, i) => Array(p).fill(i));
          const formacoes = [["Ação 1", -700, "Concluída"], ["Ação 2", -560, "Concluída"], ["Ação 3", -420, "Concluída"], ["Ação 4", -280, "Concluída"], ["Ação 5", -140, "Em avaliação"], ["Ação 6", -20, "A decorrer"]]
            .map(([nome, dd, estado], i) => ({ id: "af-" + uid(), externo_id: null, nome, curso: "Barbeiro · Formação inicial (exemplo)", ano: dia(dd).slice(0, 4), local: ["Vila Nova de Gaia", "Gondomar", "Vila Nova de Gaia", "Vila do Conde", "Vila Nova de Gaia", "Gondomar"][i], inicio: dia(dd), fim: null, estado, estado_em: dia(dd + 90), notas: "",
              assiduidade: [96.4, 92.1, 98.7, 94.3, 97.2, null][i], assid_sessoes: [41, 41, 40, 41, 41, null][i], criado_em: agora(), atualizado_em: agora(), atualizado_por: null, _n: [7, 9, 8, 10, 8, 9][i] }));
          const formandos = [], inscricoes = [];
          let k = 0;
          for (const f of formacoes) {
            for (let j = 0; j < f._n; j++) {
              k++;
              const [conc, cod, reg] = k % 23 === 0 ? ["", "", ""] : L[sorteio[(k * 7 + j * 3) % sorteio.length]];
              const t = { id: "at-" + uid(), externo_id: null, nome: "Formando " + String(k).padStart(2, "0"), pais: "Portugal", cp4: "", localidade: "", concelho: conc, distrito: "", concelho_codigo: cod, regiao: reg, regiao_aprox: false, notas: "", criado_em: agora(), atualizado_em: agora(), atualizado_por: null };
              formandos.push(t);
              inscricoes.push({ formacao_id: f.id, formando_id: t.id, desistente: k % 9 === 4, idade: 18 + ((k * 7 + j * 5) % 23), criado_em: agora() });
            }
            delete f._n;
          }
          // um formando que fez duas formações
          inscricoes.push({ formacao_id: formacoes[4].id, formando_id: formandos[3].id, desistente: false, criado_em: agora() });
          d = { formacoes, formandos, inscricoes, config: { id: 1, zonas: { Norte: "Norte", Centro: "Centro", "Oeste e Vale do Tejo": "Centro", "Grande Lisboa": "Sul", "Península de Setúbal": "Sul", Alentejo: "Sul", Algarve: "Sul", "Açores": "Açores", Madeira: "Madeira", Estrangeiro: "Estrangeiro" }, ultima_importacao: null, ultima_fonte: "", sinc_ativa: true, sinc_em: null, sinc_ok: null, sinc_msg: "" } };
        }
        return d;
      };
      const guardar = () => { try { localStorage.setItem(K, JSON.stringify(d)); } catch { /* */ } };
      const linha = (l, id) => { const x = l.find((y) => y.id === id); if (!x) throw new Error("Já não existe."); return x; };
      const limpo = (o, campos) => Object.fromEntries(Object.entries(o).filter(([c]) => campos.includes(c)));
      const CF = ["nome", "curso", "ano", "local", "inicio", "fim", "estado", "estado_em", "notas", "assiduidade", "assid_sessoes"], CT = ["nome", "pais", "cp4", "localidade", "concelho", "distrito", "concelho_codigo", "regiao", "regiao_aprox", "notas", "residencia_manual", "cliente_id", "clientes_rejeitados"];
      return {
        async carregar() { so(); ler(); if (!d.precos) d.precos = d.formacoes.filter((f) => /^Ação [1-5]$/.test(f.nome)).map((f, n) => ({ formacao_id: f.id, preco: [2490, 2690, 2790, 2990, 2990][n] ?? 2990 })); return structuredClone({ precos: eGestor(eu()) ? d.precos : null, formacoes: d.formacoes, formandos: d.formandos, inscricoes: d.inscricoes.map(({ formacao_id, formando_id, desistente, idade }) => ({ formacao_id, formando_id, desistente, idade: idade ?? null })), config: d.config }); },
        async preco(formacao_id, preco) {
          if (!eGestor(eu())) throw new Error("Só a direção define o preço das formações.");
          ler(); d.precos = (d.precos || []).filter((x) => x.formacao_id !== formacao_id); if (preco != null) d.precos.push({ formacao_id, preco }); guardar(); return preco == null ? null : { formacao_id, preco };
        },
        async importar(p) {
          so(); ler();
          const r = { formacoes_novas: 0, formacoes_atualizadas: 0, formandos_novos: 0, formandos_atualizados: 0, inscricoes: 0 };
          for (const x of p.formacoes || []) {
            const ja = d.formacoes.find((y) => y.externo_id && y.externo_id === x.externo_id);
            if (ja) { Object.assign(ja, limpo({ ...x, inicio: x.inicio || null, estado_em: x.estado_em || null }, CF), { atualizado_em: agora() }); r.formacoes_atualizadas++; }
            else { d.formacoes.push({ id: "af-" + uid(), externo_id: x.externo_id, fim: null, notas: "", ...limpo({ ...x, inicio: x.inicio || null, estado_em: x.estado_em || null }, CF), criado_em: agora(), atualizado_em: agora(), atualizado_por: euId }); r.formacoes_novas++; }
          }
          for (const x of p.formandos || []) {
            const ja = d.formandos.find((y) => y.externo_id && y.externo_id === x.externo_id);
            if (ja) { Object.assign(ja, limpo(x, ja.residencia_manual ? ["nome"] : CT), { atualizado_em: agora() }); r.formandos_atualizados++; }
            else { d.formandos.push({ id: "at-" + uid(), externo_id: x.externo_id, notas: "", ...limpo(x, CT), criado_em: agora(), atualizado_em: agora(), atualizado_por: euId }); r.formandos_novos++; }
          }
          for (const x of p.inscricoes || []) {
            const f = d.formacoes.find((y) => y.externo_id === x.formacao), t = d.formandos.find((y) => y.externo_id === x.formando);
            if (!f || !t) continue;
            const ja = d.inscricoes.find((i) => i.formacao_id === f.id && i.formando_id === t.id);
            if (ja) { ja.desistente = !!x.desistente; if (x.idade != null) ja.idade = x.idade; } else d.inscricoes.push({ formacao_id: f.id, formando_id: t.id, desistente: !!x.desistente, idade: x.idade ?? null, criado_em: agora() });
            r.inscricoes++;
          }
          d.config.ultima_importacao = agora(); d.config.ultima_fonte = String(p.fonte || "").slice(0, 200);
          guardar(); return r;
        },
        async criarFormacao(f) { so(); ler(); const x = { id: "af-" + uid(), externo_id: null, nome: "", curso: "", ano: "", local: "", inicio: null, fim: null, estado: "", estado_em: null, notas: "", ...limpo(f, CF), criado_em: agora(), atualizado_em: agora(), atualizado_por: euId }; d.formacoes.push(x); guardar(); return structuredClone(x); },
        async atualizarFormacao(id, c) { so(); ler(); const x = linha(d.formacoes, id); Object.assign(x, limpo(c, CF), { atualizado_em: agora(), atualizado_por: euId }); guardar(); return structuredClone(x); },
        async apagarFormacao(id) { so(); ler(); d.formacoes = d.formacoes.filter((x) => x.id !== id); d.inscricoes = d.inscricoes.filter((i) => i.formacao_id !== id); guardar(); },
        async criarFormando(t) { so(); ler(); const x = { id: "at-" + uid(), externo_id: null, nome: "", pais: "Portugal", cp4: "", localidade: "", concelho: "", distrito: "", concelho_codigo: "", regiao: "", regiao_aprox: false, notas: "", ...limpo(t, CT), criado_em: agora(), atualizado_em: agora(), atualizado_por: euId }; d.formandos.push(x); guardar(); return structuredClone(x); },
        async atualizarFormando(id, c) { so(); ler(); const x = linha(d.formandos, id); Object.assign(x, limpo(c, CT), { atualizado_em: agora(), atualizado_por: euId }); guardar(); return structuredClone(x); },
        async apagarFormando(id) { so(); ler(); d.formandos = d.formandos.filter((x) => x.id !== id); d.inscricoes = d.inscricoes.filter((i) => i.formando_id !== id); guardar(); },
        async inscrever(formacao_id, formando_id) {
          so(); ler();
          let i = d.inscricoes.find((x) => x.formacao_id === formacao_id && x.formando_id === formando_id);
          if (!i) { i = { formacao_id, formando_id, desistente: false, criado_em: agora() }; d.inscricoes.push(i); guardar(); }
          return { formacao_id, formando_id, desistente: i.desistente };
        },
        async desinscrever(formacao_id, formando_id) { so(); ler(); d.inscricoes = d.inscricoes.filter((x) => !(x.formacao_id === formacao_id && x.formando_id === formando_id)); guardar(); },
        async marcarDesistente(formacao_id, formando_id, v) { so(); ler(); const i = d.inscricoes.find((x) => x.formacao_id === formacao_id && x.formando_id === formando_id); if (i) i.desistente = !!v; guardar(); },
        async guardarConfig(c) { ler(); if (!eGestor(eu())) throw new Error("Só a direção muda esta divisão."); Object.assign(d.config, limpo(c, ["zonas", "sinc_ativa"])); guardar(); return structuredClone(d.config); },
        async sincronizar() {
          so(); ler(); await new Promise((r) => setTimeout(r, 900));
          Object.assign(d.config, { sinc_em: agora(), sinc_ok: true, sinc_msg: "Demonstração: no modo real, a Central lê aqui as ações e os formandos da Secretaria Online." }); guardar();
          return { accoes: d.formacoes.length, lidas: 0, formandos_novos: 0, formandos_atualizados: 0, inscricoes: 0, inscricoes_removidas: 0 };
        },
        subscrever() { return () => {}; },
      };
    })(),
  };
  // relatório mensal: números de exemplo
  API.relatorio = {
    async dados(mes) {
      if (!eGestor(eu())) throw new Error("Só a direção vê o relatório mensal.");
      return { mes, vendas: { mes: 9840, anterior: 8720, ano_passado: 7310, clientes: 38, faturas: 52, notas_credito: 120, ofertas: 6 }, ultima_venda: mes + "-28",
        margem: { vendas: 9840, vendas_com_custo: 8200, custo: 3120 },
        produtos: [{ nome: "Produto A", qtd: 210, valor: 2090 }, { nome: "Produto B", qtd: 160, valor: 1600 }, { nome: "Produto C", qtd: 95, valor: 1250 }],
        clientes_novos: [{ nome: "Barbearia (exemplo) 1", valor: 320 }], clientes_parados: [{ nome: "Barbearia (exemplo) 2", ultima: mes + "-02", valor_ano: 1450 }],
        barbearias: [{ espaco: "Loja 1 (exemplo)", total: 11200, anterior: 10400 }, { espaco: "Loja 2 (exemplo)", total: 9100, anterior: 9500 }], financeiro_avisos: [], financeiro_importado: true,
        stock_minimo: [], encomendar: [{ nome: "Produto A", quantidade: 120, dias_restantes: 40, prazo: 30, sugerido: 300 }],
        academy: { a_decorrer: 2, formandos_novos: 9, formacoes_novas: 1, assiduidade: 96.1 }, prazos: [], tarefas: { em_atraso: 3, concluidas: 41 } };
    },
    async enviar() { throw new Error("No modo de demonstração não se enviam emails."); },
  };
  fiabilidadeDemo(API);
  return API;

  // Histórico, reciclagem e comentários do modo de demonstração (na base real faz-se no servidor, script 18)
  function fiabilidadeDemo(api) {
    const KF = "central26-demo-fia-v1";
    let fd = null;
    const lerF = () => { if (!fd) { try { fd = JSON.parse(localStorage.getItem(KF) || "null"); } catch { fd = null; } fd = fd || { hist: [], coment: [], seq: 1 }; } return fd; };
    const guardarF = () => { try { localStorage.setItem(KF, JSON.stringify(fd)); } catch { /* sem espaço */ } };
    const ouvC = new Set();
    const LINK = { tarefas: "#tarefa-", crm_clientes: "#cliente-", agenda_eventos: "#agenda-", log_encomendas: "#encomenda-", op_fornecedores: "#fornecedor-", op_pedidos: "#pedido-", mk_publicacoes: "#publicacao-", stk_produtos: "#stock-", prz_prazos: "#prazo-", prz_viaturas: "#viatura-" };
    const IGNORAR = new Set(["atualizado_em", "atualizado_por", "estado_periodo", "checklist_periodo", "lat", "lng", "_pendente"]);
    const dono = (cam) => { const p = cam.split("."), f = p.pop(); return [p.reduce((x, k) => x?.[k], api), f]; };
    const antesDe = (tabela, id) => (tabela === "tarefas" ? db.tarefas.find((t) => t.id === id) : null) || api.conhecido?.(tabela, id) || null;
    const ATUALIZAR = [["tarefas.atualizar", "tarefas"], ["crm.atualizar", "crm_clientes"], ["log.encomendas.atualizar", "log_encomendas"], ["agenda.atualizar", "agenda_eventos"],
      ["op.fornecedores.atualizar", "op_fornecedores"], ["op.pedidos.atualizar", "op_pedidos"], ["mk.pub.atualizar", "mk_publicacoes"], ["stk.atualizar", "stk_produtos"],
      ["prz.atualizarPrazo", "prz_prazos"], ["prz.atualizarViatura", "prz_viaturas"]];
    for (const [cam, tabela] of ATUALIZAR) {
      const [o, f] = dono(cam); if (!o || typeof o[f] !== "function") continue;
      const orig = o[f].bind(o);
      o[f] = async (id, campos, ...resto) => {
        const antes = structuredClone(antesDe(tabela, id));
        const r = await orig(id, campos, ...resto);
        if (antes && r) {
          const a = {}, d = {};
          for (const k of Object.keys(campos)) if (!IGNORAR.has(k) && JSON.stringify(antes[k] ?? null) !== JSON.stringify(r[k] ?? null)) { a[k] = antes[k] ?? null; d[k] = r[k] ?? null; }
          if (Object.keys(d).length) {
            const F = lerF(), ult = F.hist.find((h) => h.tabela === tabela && h.registo_id === String(id) && h.acao === "alterado");
            if (ult && ult.autor_id === euId && Date.now() - new Date(ult.criado_em) < 600000) { ult.antes = { ...a, ...ult.antes }; ult.depois = { ...ult.depois, ...d }; ult.criado_em = agora(); }
            else F.hist.unshift({ id: F.seq++, tabela, registo_id: String(id), acao: "alterado", antes: a, depois: d, autor_id: euId, criado_em: agora(), lote: F.seq });
            guardarF();
          }
        }
        return r;
      };
    }
    const APAGAR = [["tarefas.apagar", "tarefas", "tarefas.criar"], ["crm.apagar", "crm_clientes", "crm.criar"], ["log.encomendas.apagar", "log_encomendas", "log.encomendas.criar"],
      ["agenda.apagar", "agenda_eventos", "agenda.criar"], ["op.fornecedores.apagar", "op_fornecedores", "op.fornecedores.criar"], ["op.pedidos.apagar", "op_pedidos", "op.pedidos.criar"],
      ["prz.apagarPrazo", "prz_prazos", "prz.criarPrazo"], ["prz.apagarViatura", "prz_viaturas", "prz.criarViatura"]];
    const criarDe = {};
    for (const [cam, tabela, criar] of APAGAR) {
      criarDe[tabela] = criar;
      const [o, f] = dono(cam); if (!o || typeof o[f] !== "function") continue;
      const orig = o[f].bind(o);
      o[f] = async (id, ...resto) => {
        const antes = structuredClone(antesDe(tabela, id));
        const r = await orig(id, ...resto);
        if (antes) { const F = lerF(); F.hist.unshift({ id: F.seq++, tabela, registo_id: String(id), acao: "apagado", antes, autor_id: euId, criado_em: agora(), lote: F.seq }); guardarF(); }
        return r;
      };
    }
    api.hist = {
      async de(tabela, id) { return structuredClone(lerF().hist.filter((h) => h.tabela === tabela && h.registo_id === String(id))); },
      async reciclagem() {
        const g = eGestor(eu()), desde = Date.now() - 30 * 864e5;
        return structuredClone(lerF().hist.filter((h) => h.acao === "apagado" && !h.recuperado_em && new Date(h.criado_em) > desde && (g || h.autor_id === euId)));
      },
      async recuperar(hid) {
        const F = lerF(), h = F.hist.find((x) => x.id === hid);
        if (!h || h.recuperado_em) throw new Error("Este registo já não está na reciclagem.");
        const [o, f] = dono(criarDe[h.tabela] || ""); if (!o || typeof o[f] !== "function") throw new Error("Não foi possível recuperar este registo.");
        const dados = { ...h.antes }; ["id", "criado_em", "atualizado_em", "numero", "_pendente"].forEach((k) => delete dados[k]);
        await o[f](dados);
        h.recuperado_em = agora(); h.recuperado_por = euId; guardarF();
        return 1;
      },
    };
    api.coment = {
      async de(tabela, id) { return structuredClone(lerF().coment.filter((c) => c.tabela === tabela && c.registo_id === String(id))); },
      async criar(tabela, id, texto, mencoes) {
        const F = lerF(), c = { id: F.seq++, tabela, registo_id: String(id), autor_id: euId, texto, mencoes: mencoes || [], criado_em: agora() };
        F.coment.push(c); guardarF();
        (mencoes || []).forEach((p) => { if (p !== euId) notificar(p, "comentario", nome(euId).split(" ")[0] + " mencionou-te", texto.slice(0, 160), (LINK[tabela] || "#") + id); });
        return structuredClone(c);
      },
      async apagar(cid) { const F = lerF(); F.coment = F.coment.filter((c) => c.id !== cid); guardarF(); ouvC.forEach((cb) => cb("DELETE", null, { id: cid })); },
      subscrever(cb) { ouvC.add(cb); return () => ouvC.delete(cb); },
    };
    api.pesquisar = async () => null;
    api.copias = {
      async listar() { return []; },
      async agora() { throw new Error("No modo de demonstração não há cópias automáticas."); },
      async descarregar() { throw new Error("No modo de demonstração não há cópias automáticas."); },
    };
  }
}
