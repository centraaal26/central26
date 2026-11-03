// Ligação à base de dados (Supabase). O modo de demonstração (demo.js) imita esta interface.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm";
import { SUPABASE_URL, SUPABASE_CHAVE } from "./config.js";

const TRADUCOES = [
  [/Invalid login credentials/i, "Email ou palavra-passe errados."],
  [/Email not confirmed/i, "A conta ainda não foi confirmada. Fala com a administração."],
  [/User is banned|banned/i, "Esta conta está desativada. Fala com a administração."],
  [/Password should be at least|weak.password|Password is known/i, "A palavra-passe é demasiado fraca. Usa pelo menos 8 caracteres, com letras e números."],
  [/same_password|New password should be different/i, "A nova palavra-passe tem de ser diferente da atual."],
  [/Failed to fetch|NetworkError|Load failed/i, "Sem ligação à internet. Verifica a rede e tenta outra vez."],
  [/JWT expired|session.*(missing|expired)/i, "A sessão expirou. Volta a entrar."],
  [/row-level security|permission denied/i, "Não tens permissão para fazer esta alteração."],
];
function erroPt(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e || "");
  for (const [re, txt] of TRADUCOES) if (re.test(m)) return new Error(txt);
  return new Error(m || "Ocorreu um erro. Tenta outra vez.");
}
const ok = ({ data, error }) => { if (error) throw erroPt(error); return data; };

export function criarApi() {
  const sb = createClient(SUPABASE_URL, SUPABASE_CHAVE, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "central26-sessao" },
  });

  async function invocar(nome, corpo) {
    const { data, error } = await sb.functions.invoke(nome, { body: corpo });
    if (error) {
      let msg = "Não foi possível contactar o servidor. Tenta outra vez.";
      try {
        const r = error.context;
        if (r && r.status === 404) {
          msg = nome === "enviar-push"
            ? "As notificações no telemóvel precisam da função «enviar-push» instalada no Supabase (ver README, passo 3)."
            : "Falta correr o script supabase/02-equipa.sql no Supabase (SQL Editor).";
        } else if (r && typeof r.json === "function") { const j = await r.json(); if (j && j.erro) msg = j.erro; }
      } catch { /* mantém a mensagem genérica */ }
      throw new Error(msg);
    }
    if (data && data.erro) throw new Error(data.erro);
    return data;
  }

  // O Supabase devolve no máximo 1000 linhas por pedido: lê por páginas
  async function todas(construir, tamanho = 1000) {
    const out = [];
    for (let de = 0; ; de += tamanho) {
      const { data, error } = await construir().range(de, de + tamanho - 1);
      if (error) throw erroPt(error);
      out.push(...data);
      if (data.length < tamanho) return out;
    }
  }
  const semFuncao = (e) => /PGRST202|Could not find the function/i.test(String(e?.code) + " " + String(e?.message));

  return {
    modo: "real",

    async sessao() { const { data } = await sb.auth.getSession(); return data.session?.user || null; },
    aoMudarSessao(cb) { sb.auth.onAuthStateChange((ev, s) => cb(ev, s?.user || null)); },
    async entrar(email, password) { ok(await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })); },
    async sair() { await sb.auth.signOut(); },
    async mudarPassword(password) { ok(await sb.auth.updateUser({ password })); ok(await sb.rpc("password_mudada")); },

    async meuPerfil(id) { return ok(await sb.from("perfis").select("*").eq("id", id).maybeSingle()); },

    async carregar() {
      const desde = new Date(Date.now() - 120 * 864e5).toISOString();
      const [perfis, deps, tarefas, notifs, ativ, config] = await Promise.all([
        todas(() => sb.from("perfis").select("*").order("nome")),
        todas(() => sb.from("departamentos").select("*").order("ordem")),
        todas(() => sb.from("tarefas").select("*").order("criado_em")),
        sb.from("notificacoes").select("*").order("criado_em", { ascending: false }).limit(100),
        todas(() => sb.from("atividade").select("*").gte("criado_em", desde).order("criado_em", { ascending: false })),
        sb.from("configuracao").select("*"),
      ]);
      return {
        perfis, departamentos: deps, tarefas,
        notificacoes: ok(notifs), atividade: ativ, configuracao: ok(config),
      };
    },

    subscrever(eu, cb) {
      const canal = sb.channel("central26-" + eu)
        .on("postgres_changes", { event: "*", schema: "public", table: "tarefas" }, (p) => cb("tarefas", p.eventType, p.new, p.old))
        .on("postgres_changes", { event: "*", schema: "public", table: "perfis" }, (p) => cb("perfis", p.eventType, p.new, p.old))
        .on("postgres_changes", { event: "*", schema: "public", table: "departamentos" }, (p) => cb("departamentos", p.eventType, p.new, p.old))
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "atividade" }, (p) => cb("atividade", p.eventType, p.new, p.old))
        .on("postgres_changes", { event: "*", schema: "public", table: "notificacoes", filter: "destinatario_id=eq." + eu }, (p) => cb("notificacoes", p.eventType, p.new, p.old))
        .subscribe();
      return () => sb.removeChannel(canal);
    },

    tarefas: {
      async criar(t) { return ok(await sb.from("tarefas").insert(t).select().single()); },
      async criarVarias(lista) { return ok(await sb.from("tarefas").upsert(lista, { onConflict: "modelo", ignoreDuplicates: true }).select()); },
      async atualizar(id, campos) { return ok(await sb.from("tarefas").update(campos).eq("id", id).select().single()); },
      async apagar(id) { ok(await sb.from("tarefas").delete().eq("id", id)); },
      // Devolve os ids que foram mesmo apagados (as regras da base de dados ignoram os que não podes apagar)
      async apagarVarias(ids) {
        const out = [];
        for (let i = 0; i < ids.length; i += 100) out.push(...ok(await sb.from("tarefas").delete().in("id", ids.slice(i, i + 100)).select("id")).map((r) => r.id));
        return out;
      },
      async obter(id) { return ok(await sb.from("tarefas").select("*").eq("id", id).maybeSingle()); },
    },
    notificacoes: {
      async marcarLidas(ids) { if (ids.length) ok(await sb.from("notificacoes").update({ lida: true }).in("id", ids)); },
      async apagar(ids) { if (ids.length) ok(await sb.from("notificacoes").delete().in("id", ids)); },
    },
    perfis: {
      async atualizar(id, campos) { return ok(await sb.from("perfis").update(campos).eq("id", id).select().single()); },
      async atualizarMeu(nome, telefone) { ok(await sb.rpc("atualizar_meu_perfil", { p_nome: nome, p_telefone: telefone })); },
    },
    departamentos: {
      async criar(d) { return ok(await sb.from("departamentos").insert(d).select().single()); },
      async atualizar(id, campos) { return ok(await sb.from("departamentos").update(campos).eq("id", id).select().single()); },
    },
    // Gestão da equipa pelas funções SQL do script 02; se ainda não existirem, tenta a função de servidor antiga
    crm: {
      async carregar() {
        const [clientes, produtos, vendas, contactos, importacoes] = await Promise.all([
          todas(() => sb.from("crm_clientes").select("*").order("nome")),
          todas(() => sb.from("crm_produtos").select("*").order("codigo")),
          todas(() => sb.from("crm_vendas").select("documento,linha,tipo,data,cliente_codigo,produto_codigo,descricao,qtd,preco,valor").order("data").order("documento").order("linha")),
          todas(() => sb.from("crm_contactos").select("*").order("criado_em", { ascending: false })),
          sb.from("crm_importacoes").select("*").order("criado_em", { ascending: false }).limit(20),
        ]);
        return { clientes, produtos, vendas, contactos, importacoes: ok(importacoes) };
      },
      async criar(c) { return ok(await sb.from("crm_clientes").insert(c).select().single()); },
      async atualizar(id, campos) { return ok(await sb.from("crm_clientes").update(campos).eq("id", id).select().single()); },
      async apagar(id) { ok(await sb.from("crm_clientes").delete().eq("id", id)); },
      async contacto(c) { return ok(await sb.from("crm_contactos").insert(c).select().single()); },
      async importar(lote) { return ok(await sb.rpc("crm_importar", { p: lote })); },
      subscrever(cb) {
        const canal = sb.channel("central26-crm")
          .on("postgres_changes", { event: "*", schema: "public", table: "crm_clientes" }, (p) => cb("crm_clientes", p.eventType, p.new, p.old))
          .on("postgres_changes", { event: "*", schema: "public", table: "crm_contactos" }, (p) => cb("crm_contactos", p.eventType, p.new, p.old))
          .subscribe();
        return () => sb.removeChannel(canal);
      },
    },
    chat: {
      async resumo() { return ok(await sb.rpc("chat_resumo")) || []; },
      async mensagens(canal, antes) {
        let q = sb.from("chat_mensagens").select("*").eq("canal_id", canal).order("criado_em", { ascending: false }).limit(60);
        if (antes) q = q.lt("criado_em", antes);
        return ok(await q).reverse();
      },
      async enviar(canal, texto, mencoes) { return ok(await sb.from("chat_mensagens").insert({ canal_id: canal, texto, mencoes }).select().single()); },
      async atualizar(id, campos) { return ok(await sb.from("chat_mensagens").update(campos).eq("id", id).select().single()); },
      async direto(outro) { return ok(await sb.rpc("chat_canal_direto", { p_outro: outro })); },
      async marcarLido(canal) { ok(await sb.rpc("chat_marcar_lido", { p_canal: canal })); },
      subscrever(cb) {
        const canal = sb.channel("central26-chat")
          .on("postgres_changes", { event: "*", schema: "public", table: "chat_mensagens" }, (p) => cb("chat_mensagens", p.eventType, p.new, p.old))
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_canais" }, (p) => cb("chat_canais", p.eventType, p.new, p.old))
          .subscribe();
        return () => sb.removeChannel(canal);
      },
    },
    agenda: {
      async listar() {
        const desde = new Date(Date.now() - 120 * 864e5).toISOString();
        return todas(() => sb.from("agenda_eventos").select("*").gte("inicio", desde).order("inicio"));
      },
      async criar(e) { return ok(await sb.from("agenda_eventos").insert(e).select().single()); },
      async atualizar(id, campos) { return ok(await sb.from("agenda_eventos").update(campos).eq("id", id).select().single()); },
      async apagar(id) { ok(await sb.from("agenda_eventos").delete().eq("id", id)); },
      subscrever(cb) {
        const canal = sb.channel("central26-agenda")
          .on("postgres_changes", { event: "*", schema: "public", table: "agenda_eventos" }, (p) => cb(p.eventType, p.new, p.old))
          .subscribe();
        return () => sb.removeChannel(canal);
      },
    },
    log: {
      async carregar() {
        const desde = new Date(Date.now() - 90 * 864e5).toISOString();
        const [locais, ativas, antigas, rotas] = await Promise.all([
          todas(() => sb.from("log_locais").select("*").eq("ativo", true).order("ordem").order("nome")),
          todas(() => sb.from("log_encomendas").select("*").not("estado", "in", "(entregue,cancelada)").order("criado_em")),
          todas(() => sb.from("log_encomendas").select("*").in("estado", ["entregue", "cancelada"]).gte("atualizado_em", desde).order("atualizado_em", { ascending: false })),
          todas(() => sb.from("log_rotas").select("*").gte("data", desde.slice(0, 10)).order("data", { ascending: false })),
        ]);
        return { locais, encomendas: ativas.concat(antigas), rotas };
      },
      encomendas: {
        async criar(e) { return ok(await sb.from("log_encomendas").insert(e).select().single()); },
        async atualizar(id, campos) { return ok(await sb.from("log_encomendas").update(campos).eq("id", id).select().single()); },
        async apagar(id) { ok(await sb.from("log_encomendas").delete().eq("id", id)); },
      },
      rotas: {
        async criar(r) { return ok(await sb.from("log_rotas").insert(r).select().single()); },
        async atualizar(id, campos) { return ok(await sb.from("log_rotas").update(campos).eq("id", id).select().single()); },
        async apagar(id) { ok(await sb.from("log_rotas").delete().eq("id", id)); },
      },
      locais: {
        async criar(l) { return ok(await sb.from("log_locais").insert(l).select().single()); },
        async atualizar(id, campos) { return ok(await sb.from("log_locais").update(campos).eq("id", id).select().single()); },
      },
      async enviarFatura(encId, ficheiro) {
        const nome = ficheiro.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);
        const caminho = "encomendas/" + encId + "/" + Date.now() + "-" + nome;
        const { error } = await sb.storage.from("faturas").upload(caminho, ficheiro, { contentType: ficheiro.type || "application/octet-stream", upsert: false });
        if (error) throw new Error(/bucket|not found/i.test(error.message) ? "Falta criar o armazenamento das faturas: corre o script supabase/05-logistica.sql." : /size|large/i.test(error.message) ? "A fatura tem mais de 10 MB." : /mime|type/i.test(error.message) ? "Só são aceites faturas em PDF ou imagem." : error.message);
        return caminho;
      },
      async urlFatura(caminho) { const { data, error } = await sb.storage.from("faturas").createSignedUrl(caminho, 3600); if (error) throw erroPt(error); return data.signedUrl; },
      subscrever(cb) {
        const canal = sb.channel("central26-log")
          .on("postgres_changes", { event: "*", schema: "public", table: "log_encomendas" }, (p) => cb("encomendas", p.eventType, p.new, p.old))
          .on("postgres_changes", { event: "*", schema: "public", table: "log_rotas" }, (p) => cb("rotas", p.eventType, p.new, p.old))
          .on("postgres_changes", { event: "*", schema: "public", table: "log_locais" }, (p) => cb("locais", p.eventType, p.new, p.old))
          .subscribe();
        return () => sb.removeChannel(canal);
      },
    },
    async empregados(acao, dados) {
      const chamada = {
        criar: ["admin_criar_empregado", { p_nome: dados.nome, p_email: dados.email, p_cargo: dados.cargo || "", p_telefone: dados.telefone || "",
          p_departamento: dados.departamento_id || null, p_papel: dados.papel || "colaborador" }],
        repor_password: ["admin_repor_password", { p_id: dados.id }],
        definir_ativo: ["admin_definir_ativo", { p_id: dados.id, p_ativo: !!dados.ativo }],
      }[acao];
      if (!chamada) throw new Error("Ação desconhecida.");
      const { data, error } = await sb.rpc(chamada[0], chamada[1]);
      if (!error) return data;
      if (semFuncao(error)) return invocar("gerir-empregados", { acao, ...dados });
      throw erroPt(error);
    },
    push: {
      async chave() { const r = await invocar("enviar-push", { acao: "chave" }); return r.chave; },
      async registar(endpoint, p256dh, auth, aparelho) {
        ok(await sb.rpc("registar_push", { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_aparelho: aparelho }));
      },
      async teste() { return invocar("enviar-push", { acao: "teste" }); },
    },
  };
}
