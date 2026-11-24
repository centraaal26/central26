// Ligação à base de dados (Supabase). O modo de demonstração (demo.js) imita esta interface.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm";
import { SUPABASE_URL, SUPABASE_CHAVE } from "./config.js";
import { envolverApi } from "./offline.js";

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
      // função por instalar: o Supabase responde 404 sem autorização do navegador (CORS), o que chega aqui como falha de rede
      const semFuncaoInstalada = !navigator.onLine ? false : error.name === "FunctionsFetchError" || error.name === "FunctionsRelayError";
      if (semFuncaoInstalada) msg = nome === "enviar-push"
        ? "As notificações no telemóvel ainda não estão ligadas no servidor: falta instalar a função «enviar-push» no Supabase (README, passo 3b). Dentro da app os avisos continuam a funcionar."
        : "Falta instalar a função «" + nome + "» no Supabase.";
      if (!navigator.onLine) msg = "Estás sem ligação à internet.";
      try {
        const r = error.context;
        if (r && r.status === 404) {
          msg = nome === "enviar-push"
            ? "As notificações no telemóvel ainda não estão ligadas no servidor: falta instalar a função «enviar-push» no Supabase (README, passo 3b). Dentro da app os avisos continuam a funcionar."
            : nome === "academy-sincronizar" ? "Falta publicar a função «academy-sincronizar» no Supabase (README, passo 3r)."
            : nome === "relatorio-mensal" ? "Falta publicar a função «relatorio-mensal» no Supabase (README, passo 3s)."
            : "Falta correr o script supabase/02-equipa.sql no Supabase (SQL Editor).";
        } else if (r && typeof r.json === "function") { const j = await r.json(); if (j && j.erro) msg = j.erro; }
      } catch { /* mantém a mensagem genérica */ }
      throw new Error(msg);
    }
    if (data && data.erro) throw new Error(data.erro);
    return data;
  }

  // O Supabase devolve no máximo 1000 linhas por pedido: lê por páginas, três de cada vez
  async function todas(construir, tamanho = 1000) {
    const pagina = async (n) => { const { data, error } = await construir().range(n * tamanho, n * tamanho + tamanho - 1); if (error) throw erroPt(error); return data; };
    const out = await pagina(0);
    if (out.length < tamanho) return out;
    for (let n = 1; ; n += 3) {
      const lote = await Promise.all([pagina(n), pagina(n + 1), pagina(n + 2)]);
      for (const d of lote) { out.push(...d); if (d.length < tamanho) return out; }
    }
  }
  const semFuncao = (e) => /PGRST202|Could not find the function/i.test(String(e?.code) + " " + String(e?.message));

  const objeto = {
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
      async aparencia(foto, cor) { ok(await sb.rpc("definir_aparencia", { p_foto: foto || "", p_cor: cor || "" })); },
      async enviarFoto(eu, blob, ext) {
        const caminho = eu + "/" + crypto.randomUUID() + "." + ext;
        const up = await sb.storage.from("avatares").upload(caminho, blob, { contentType: blob.type, upsert: false });
        if (up.error) throw new Error(/bucket|not found/i.test(up.error.message) ? "As fotos de perfil precisam do script supabase/12-perfil-email-stocks.sql no Supabase." : "Não foi possível enviar a foto: " + up.error.message);
        return caminho;
      },
      async apagarFoto(caminho) { if (caminho) await sb.storage.from("avatares").remove([caminho]).catch(() => {}); },
      async urlsFotos(caminhos) {
        if (!caminhos.length) return {};
        const { data, error } = await sb.storage.from("avatares").createSignedUrls(caminhos, 60 * 60 * 24);
        if (error) return {};
        return Object.fromEntries((data || []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
      },
    },
    preferencias: {
      async ler(eu) { const { data, error } = await sb.from("preferencias").select("*").eq("perfil_id", eu).maybeSingle(); if (error) throw new Error("FALTA_SCRIPT"); return data || { perfil_id: eu, email_tarefas: true, email_agenda: true, email_mensagens: true }; },
      async guardar(eu, campos) { return ok(await sb.from("preferencias").upsert({ perfil_id: eu, ...campos, atualizado_em: new Date().toISOString() }).select().single()); },
    },
    departamentos: {
      async criar(d) { return ok(await sb.from("departamentos").insert(d).select().single()); },
      async atualizar(id, campos) { return ok(await sb.from("departamentos").update(campos).eq("id", id).select().single()); },
    },
    // Gestão da equipa pelas funções SQL do script 02; se ainda não existirem, tenta a função de servidor antiga
    crm: {
      // Método Mackay 66: clientes a abordar hoje (escolhidos e preparados pela função «crm-abordar») e o perfil de cada cliente
      abordagens: {
        async hoje() { return invocar("crm-abordar", { acao: "hoje" }); },
        async preparar(id) { return invocar("crm-abordar", { acao: "preparar", id }); },
        async pesquisar(clienteId) { return invocar("crm-abordar", { acao: "perfil", cliente_id: clienteId }); },
        async estado(id, estado) { ok(await sb.from("crm_abordagens").update({ estado }).eq("id", id)); },
      },
      mackay: {
        async ler(clienteId) { return ok(await sb.from("crm_mackay").select("*").eq("cliente_id", clienteId).maybeSingle()); },
        async guardar(clienteId, campos) { return ok(await sb.from("crm_mackay").upsert({ cliente_id: clienteId, ...campos }).select().single()); },
      },
      async carregar() {
        const [clientes, produtos, vendas, contactos, importacoes] = await Promise.all([
          todas(() => sb.from("crm_clientes").select("*").order("nome")),
          todas(() => sb.from("crm_produtos").select("*").order("codigo")),
          todas(() => sb.from("crm_vendas").select("documento,linha,tipo,data,cliente_codigo,produto_codigo,descricao,qtd,preco,valor").order("data").order("documento").order("linha")),
          todas(() => sb.from("crm_contactos").select("*").order("criado_em", { ascending: false })),
          sb.from("crm_importacoes").select("*").order("criado_em", { ascending: false }).limit(20),
        ]);
        // custo de cada produto (script 20): sem o script, as margens ficam simplesmente por mostrar
        const custos = await sb.from("crm_custos").select("produto_codigo, custo, atualizado_em");
        return { clientes, produtos, vendas, contactos, importacoes: ok(importacoes), custos: custos.error ? null : custos.data };
      },
      async custo(codigo, valor) {
        if (valor == null) { ok(await sb.from("crm_custos").delete().eq("produto_codigo", codigo)); return null; }
        return ok(await sb.from("crm_custos").upsert({ produto_codigo: codigo, custo: valor }).select().single());
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
      async criarGrupo(nome, membros) { return ok(await sb.rpc("chat_criar_grupo", { p_nome: nome, p_membros: membros })); },
      async sairGrupo(canal) { ok(await sb.rpc("chat_sair_grupo", { p_canal: canal })); },
      async membros(canal) { return (ok(await sb.rpc("chat_membros_de", { p_canal: canal })) || []).map((x) => (typeof x === "string" ? x : x.chat_membros_de)); },
      async enviarAudio(canal, blob, tipo, duracao) {
        const ext = /mp4|m4a|aac/.test(tipo) ? "m4a" : /ogg/.test(tipo) ? "ogg" : /mpeg/.test(tipo) ? "mp3" : "webm";
        const caminho = canal + "/" + crypto.randomUUID() + "." + ext, base = tipo.split(";")[0];
        const up = await sb.storage.from("chat").upload(caminho, blob, { contentType: base, upsert: false });
        if (up.error) throw new Error(/bucket|not found/i.test(up.error.message) ? "As mensagens de voz precisam do script supabase/11-mensagens.sql no Supabase." : "Não foi possível enviar o áudio: " + up.error.message);
        try { return ok(await sb.from("chat_mensagens").insert({ canal_id: canal, texto: "", anexo_path: caminho, anexo_tipo: base, anexo_duracao: Math.round(duracao * 10) / 10 }).select().single()); }
        catch (e) { await sb.storage.from("chat").remove([caminho]); throw e; }
      },
      async urlAudio(caminho) { const { data, error } = await sb.storage.from("chat").createSignedUrl(caminho, 3600); if (error) throw new Error("Não foi possível abrir o áudio."); return data.signedUrl; },
      async apagarAudio(caminho) { await sb.storage.from("chat").remove([caminho]).catch(() => {}); },
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
    aud: {
      async carregar() {
        const [itens, plano, referencias, config] = await Promise.all([
          todas(() => sb.from("tec_itens").select("*").order("id")),
          ok(await sb.from("tec_plano").select("*").order("semana")),
          ok(await sb.from("tec_referencia").select("*").order("ordem")),
          ok(await sb.from("tec_config").select("*").eq("id", 1).maybeSingle()),
        ]);
        return { itens, plano, referencias, config: config || { inicio: null } };
      },
      async historico(id) { return ok(await sb.from("tec_historico").select("*").eq("item_id", id).order("criado_em", { ascending: false }).limit(60)); },
      itens: {
        async criar(i) { return ok(await sb.from("tec_itens").insert(i).select().single()); },
        async atualizar(id, campos) { return ok(await sb.from("tec_itens").update(campos).eq("id", id).select().single()); },
        async apagar(id) { ok(await sb.from("tec_itens").delete().eq("id", id)); },
      },
      async plano(semana, campos) { return ok(await sb.from("tec_plano").update(campos).eq("semana", semana).select().single()); },
      async inicio(data) { return ok(await sb.from("tec_config").update({ inicio: data || null, atualizado_em: new Date().toISOString() }).eq("id", 1).select().single()); },
      async importar(p) { return ok(await sb.rpc("tec_importar", { p })); },
      subscrever(cb) {
        const canal = sb.channel("central26-aud")
          .on("postgres_changes", { event: "*", schema: "public", table: "tec_itens" }, (p) => cb("itens", p.eventType, p.new, p.old))
          .on("postgres_changes", { event: "*", schema: "public", table: "tec_plano" }, (p) => cb("plano", p.eventType, p.new, p.old))
          .subscribe();
        return () => sb.removeChannel(canal);
      },
    },
    // barbeiros das folhas da faturação dos últimos 3 meses importados (script 21), para «Criar várias contas»
    async equipaFolha() {
      const r = await sb.from("fin_barbeiros").select("mes, loja, barbeiro").order("mes", { ascending: false }).limit(600);
      if (r.error || !r.data.length) return [];
      const meses = [...new Set(r.data.map((x) => x.mes))].slice(0, 3), vistos = new Map();
      for (const x of r.data) if (meses.includes(x.mes) && !vistos.has(x.barbeiro.toLowerCase())) vistos.set(x.barbeiro.toLowerCase(), x);
      return [...vistos.values()];
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
    op: {
      async carregar() {
        const [fornecedores, pedidos, propostas] = await Promise.all([
          todas(() => sb.from("op_fornecedores").select("*").order("nome")),
          todas(() => sb.from("op_pedidos").select("*").order("criado_em", { ascending: false })),
          todas(() => sb.from("op_propostas").select("*").order("pedida_em")),
        ]);
        return { fornecedores, pedidos, propostas };
      },
      async contactos(fornId) { return ok(await sb.from("op_contactos").select("*").eq("fornecedor_id", fornId).order("data", { ascending: false }).limit(100)); },
      fornecedores: {
        async criar(f) { return ok(await sb.from("op_fornecedores").insert(f).select().single()); },
        async atualizar(id, campos) { return ok(await sb.from("op_fornecedores").update(campos).eq("id", id).select().single()); },
        async apagar(id) { ok(await sb.from("op_fornecedores").delete().eq("id", id)); },
      },
      contacto: {
        async criar(c) { return ok(await sb.from("op_contactos").insert(c).select().single()); },
        async apagar(id) { ok(await sb.from("op_contactos").delete().eq("id", id)); },
      },
      pedidos: {
        async criar(p) { return ok(await sb.from("op_pedidos").insert(p).select().single()); },
        async atualizar(id, campos) { return ok(await sb.from("op_pedidos").update(campos).eq("id", id).select().single()); },
        async apagar(id) { ok(await sb.from("op_pedidos").delete().eq("id", id)); },
      },
      propostas: {
        async criar(p) { return ok(await sb.from("op_propostas").insert(p).select().single()); },
        async atualizar(id, campos) { return ok(await sb.from("op_propostas").update(campos).eq("id", id).select().single()); },
        async apagar(id) { ok(await sb.from("op_propostas").delete().eq("id", id)); },
      },
      async escolher(id, decisao) { ok(await sb.rpc("op_escolher", { p_proposta: id, p_decisao: decisao || "" })); },
      async importar(p) { return ok(await sb.rpc("op_importar", { p })); },
      subscrever(cb) {
        const canal = sb.channel("central26-op");
        for (const [t, k] of [["op_fornecedores", "fornecedores"], ["op_pedidos", "pedidos"], ["op_propostas", "propostas"]])
          canal.on("postgres_changes", { event: "*", schema: "public", table: t }, (p) => cb(k, p.eventType, p.new, p.old));
        canal.subscribe();
        return () => sb.removeChannel(canal);
      },
    },
    fin: {
      async carregar() {
        const [meses, linhas, faturacao, rubricas] = await Promise.all([
          ok(await sb.from("fin_meses").select("*").order("mes")),
          todas(() => sb.from("fin_linhas").select("mes,area,grupo,rubrica,base,iva,sem").order("mes").order("id")),
          todas(() => sb.from("fin_faturacao").select("*").order("mes")),
          ok(await sb.from("fin_rubricas").select("*")),
        ]);
        // Resultados por área e por barbeiro (script 21): se ainda não foi corrido, o resto do Financeiro funciona na mesma
        let extra = null;
        try {
          const [barbeiros, responsaveis, pessoal, ajustes, config, vendas] = await Promise.all([
            todas(() => sb.from("fin_barbeiros").select("*").order("mes").order("loja").order("barbeiro")),
            ok(await sb.from("fin_responsaveis").select("*")),
            ok(await sb.from("fin_pessoal").select("*")),
            ok(await sb.from("fin_ajustes").select("mes,tipo,valor")),
            ok(await sb.from("fin_config").select("*").eq("id", 1).maybeSingle()),
            ok(await sb.rpc("fin_vendas_mes")),
          ]);
          extra = { barbeiros, responsaveis, pessoal, ajustes, config, vendas, receitaAcad: null };
          const ra = await sb.rpc("fin_receita_academia"); if (!ra.error) extra.receitaAcad = ra.data;
          // faltas de caixa (script 23) e prazos com valor (seguros e viaturas) para a previsão de tesouraria
          const cx = await todas(() => sb.from("fin_caixa").select("mes,loja,dia,tipo,valor,texto").order("mes").order("id")).catch(() => null);
          extra.caixa = cx;
          const pz = await sb.from("prz_prazos").select("titulo,data,valor,repetir,estado").eq("estado", "ativo").not("valor", "is", null);
          extra.prazos = pz.error ? [] : pz.data;
        } catch (e) { if (!/fin_barbeiros|fin_vendas_mes|PGRST20|Could not find|does not exist/i.test(String(e?.message))) throw e; }
        return { meses, linhas, faturacao, rubricas, extra };
      },
      async ajuste(mes, tipo, valor) {
        if (valor == null) { ok(await sb.from("fin_ajustes").delete().eq("mes", mes).eq("tipo", tipo)); return null; }
        return ok(await sb.from("fin_ajustes").upsert({ mes, tipo, valor, atualizado_em: new Date().toISOString() }).select().single());
      },
      async config(reparticao) { return ok(await sb.from("fin_config").upsert({ id: 1, reparticao, atualizado_em: new Date().toISOString() }).select().single()); },
      async configurar(campos) { return ok(await sb.from("fin_config").upsert({ id: 1, ...campos, atualizado_em: new Date().toISOString() }).select().single()); },
      async imputacao(chave, imputacao) { return ok(await sb.from("fin_rubricas").upsert({ chave, imputacao, atualizado_em: new Date().toISOString() }).select().single()); },
      async importar(p) { return ok(await sb.rpc("fin_importar", { p })); },
      async rubrica(chave, categoria) { return ok(await sb.from("fin_rubricas").upsert({ chave, categoria, atualizado_em: new Date().toISOString() }).select().single()); },
      async apagarMes(mes) { ok(await sb.from("fin_meses").delete().eq("mes", mes)); },
    },
    mk: {
      async carregar() {
        const [publicacoes, documentos] = await Promise.all([
          todas(() => sb.from("mk_publicacoes").select("*").order("data", { ascending: true, nullsFirst: false })),
          ok(await sb.from("mk_documentos").select("*").order("titulo")),
        ]);
        return { publicacoes, documentos };
      },
      pub: {
        async criar(x) { return ok(await sb.from("mk_publicacoes").insert(x).select().single()); },
        async atualizar(id, campos) { return ok(await sb.from("mk_publicacoes").update(campos).eq("id", id).select().single()); },
        async apagar(id) { ok(await sb.from("mk_publicacoes").delete().eq("id", id)); },
      },
      doc: {
        async criar(x) { return ok(await sb.from("mk_documentos").insert(x).select().single()); },
        async atualizar(id, campos) { return ok(await sb.from("mk_documentos").update(campos).eq("id", id).select().single()); },
        async apagar(id) { ok(await sb.from("mk_documentos").delete().eq("id", id)); },
      },
      async importar(p) { return ok(await sb.rpc("mk_importar", { p })); },
      subscrever(cb) {
        const canal = sb.channel("central26-mk")
          .on("postgres_changes", { event: "*", schema: "public", table: "mk_publicacoes" }, (p) => cb("pub", p.eventType, p.new, p.old))
          .on("postgres_changes", { event: "*", schema: "public", table: "mk_documentos" }, (p) => cb("doc", p.eventType, p.new, p.old))
          .subscribe();
        return () => sb.removeChannel(canal);
      },
    },
    push: {
      async chave() { const r = await invocar("enviar-push", { acao: "chave" }); return r.chave; },
      async registar(endpoint, p256dh, auth, aparelho) {
        ok(await sb.rpc("registar_push", { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_aparelho: aparelho }));
      },
      async teste() { return invocar("enviar-push", { acao: "teste" }); },
      async emailTeste() { return invocar("enviar-push", { acao: "email-teste" }); },
    },

    // Envios pela Nacex (função «nacex» no servidor; as credenciais nunca chegam ao navegador)
    async nacex(acao, dados) { return invocar("nacex", { acao, ...(dados || {}) }); },
    ia: {
      async conversas() { const { data, error } = await sb.from("ia_conversas").select("*").order("atualizado_em", { ascending: false }).limit(100); if (error) throw new Error(/ia_conversas|PGRST20/.test(error.message + error.code) ? "FALTA_SCRIPT" : error.message); return data; },
      async mensagens(id) { return ok(await sb.from("ia_mensagens").select("*").eq("conversa_id", id).order("id")); },
      async enviar(conversa, mensagem) { return invocar("assistente", { conversa_id: conversa || undefined, mensagem }); },
      async renomear(id, titulo) { ok(await sb.from("ia_conversas").update({ titulo }).eq("id", id)); },
      async apagar(id) { ok(await sb.from("ia_conversas").delete().eq("id", id)); },
      async uso() { return ok(await sb.from("ia_uso").select("*").order("mes", { ascending: false }).limit(500)); },
      async config() { return ok(await sb.from("ia_config").select("*").eq("id", 1).maybeSingle()); },
      async guardarConfig(c) { return ok(await sb.from("ia_config").update({ ...c, atualizado_em: new Date().toISOString() }).eq("id", 1).select().single()); },
      // Propostas de tarefas do assistente (só o responsável direto as aprova)
      async propostas() {
        const { data, error } = await sb.from("ia_propostas").select("*").order("criado_em", { ascending: false }).limit(200);
        if (error) throw new Error(/ia_propostas|PGRST20|42P01/.test(error.message + error.code) ? "FALTA_SCRIPT" : error.message);
        return data;
      },
      async decidir(id, aprovar) { return ok(await sb.rpc("ia_proposta_decidir", { p_id: id, p_aprovar: aprovar })); },
      subscreverPropostas(cb) {
        const canal = sb.channel("central26-propostas")
          .on("postgres_changes", { event: "*", schema: "public", table: "ia_propostas" }, (p) => cb(p.eventType, p.new, p.old))
          .subscribe();
        return () => sb.removeChannel(canal);
      },
    },
    // Cópia de segurança: lê todas as tabelas a que a pessoa tem acesso (a direção vê quase tudo)
    async copia(progresso) {
      const TABELAS = { perfis: "id", departamentos: "id", tarefas: "id", atividade: "id", notificacoes: "id", configuracao: "chave", preferencias: "perfil_id",
        crm_clientes: "id", crm_produtos: "codigo", crm_vendas: "documento,linha", crm_contactos: "id", crm_importacoes: "id",
        chat_canais: "id", chat_membros: "canal_id,perfil_id", chat_mensagens: "id", agenda_eventos: "id",
        log_locais: "id", log_encomendas: "id", log_rotas: "id", stk_produtos: "id", stk_movimentos: "id", stk_config: "id", prz_viaturas: "id", prz_prazos: "id", prz_config: "id", prs_propostas: "id", prs_zonas: "codigo", prs_balancos: "id", prs_config: "id", prs_excluidos: "chave",
        tec_itens: "id", tec_historico: "id", tec_plano: "semana", tec_referencia: "tipo", tec_config: "id",
        op_fornecedores: "id", op_contactos: "id", op_pedidos: "id", op_propostas: "id",
        fin_meses: "mes", fin_linhas: "id", fin_faturacao: "mes,espaco", fin_rubricas: "chave", fin_barbeiros: "mes,loja,barbeiro", fin_responsaveis: "mes,loja", fin_pessoal: "mes,pessoa", fin_ajustes: "mes,tipo", fin_config: "id", fin_caixa: "id", mk_publicacoes: "id", mk_documentos: "id", comentarios: "id",
        aca_formacoes: "id", aca_formandos: "id", aca_inscricoes: "formacao_id,formando_id", aca_config: "id", aca_precos: "formacao_id", com_precos: "produto_codigo", com_config: "id", com_proformas: "id", loj_lojas: "id", loj_itens: "id", loj_stock: "loja_id,item_id", loj_pedidos: "id", loj_config: "id", loj_cadeiras: "id", loj_cadeiras_mes: "cadeira_id,mes", bar_stats: "nivel,mes,loja,chave", bar_horas: "loja,dow,hora", bar_importacao: "id", crm_custos: "produto_codigo" };
      const tabelas = {}, avisos = [];
      let i = 0;
      for (const [t, ordem] of Object.entries(TABELAS)) {
        progresso?.(++i, Object.keys(TABELAS).length, t);
        try {
          tabelas[t] = await todas(() => { let q = sb.from(t).select("*"); ordem.split(",").forEach((c) => (q = q.order(c))); return q; });
        } catch (e) { avisos.push(t + ": " + (e?.message || e)); }
      }
      return { tabelas, avisos };
    },
    async registarCopia() { return ok(await sb.rpc("registar_copia")); },

    stk: {
      async carregar() {
        const [produtos, movimentos, config] = await Promise.all([
          todas(() => sb.from("stk_produtos").select("*").order("categoria").order("ordem").order("nome")),
          sb.from("stk_movimentos").select("*").order("criado_em", { ascending: false }).limit(300),
          sb.from("stk_config").select("*").eq("id", 1).maybeSingle(),
        ]);
        // procura dos últimos 90 dias (script 20), para saber quando encomendar ao laboratório
        const procura = await sb.rpc("stk_procura", { p_dias: 90 });
        return { produtos, movimentos: ok(movimentos), config: ok(config), procura: procura.error ? null : procura.data };
      },
      async catalogoMultixop() { return ok(await sb.rpc("stk_catalogo_multixop")); },
      async movimento(id, tipo, qtd, nota) { return ok(await sb.rpc("stk_movimento", { p_produto: id, p_tipo: tipo, p_qtd: qtd, p_nota: nota || "" })); },
      async ignorar(id) { return ok(await sb.rpc("stk_ignorar", { p_produto: id })); },
      async criar(p) { return ok(await sb.from("stk_produtos").insert(p).select().single()); },
      async atualizar(id, campos) { return ok(await sb.from("stk_produtos").update(campos).eq("id", id).select().single()); },
      async apagar(id) { ok(await sb.from("stk_produtos").delete().eq("id", id)); },
      async importar(produtos) { return ok(await sb.rpc("stk_importar", { p: { produtos } })); },
      async guardarConfig(campos) { return ok(await sb.from("stk_config").update({ ...campos, atualizado_em: new Date().toISOString() }).eq("id", 1).select().single()); },
      subscrever(cb) {
        const canal = sb.channel("central26-stk")
          .on("postgres_changes", { event: "*", schema: "public", table: "stk_produtos" }, (p) => cb("produto", p.eventType, p.new, p.old))
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "stk_movimentos" }, (p) => cb("movimento", p.eventType, p.new, p.old))
          .subscribe();
        return () => sb.removeChannel(canal);
      },
    },

    // Prospeção de barbearias: base, propostas do agente, aprovação e envio (script 16 + função «prospecao»)
    prs: {
      async carregar() {
        const COLS = "id, nome, distrito, concelho, morada, telefone, email, website, instagram, whatsapp, link_marcacao, link_mapa, tipo_negocio, confianca, prioridade, estado_prospecao, score, motivo, canal_recomendado, nivel_visita, proximo_passo, zona_codigo, origem, etapa, tipo, responsavel_id, recolhido_em, criado_em";
        const [config, propostas, balancos, zonas, leads, excl] = await Promise.all([
          sb.from("prs_config").select("*").eq("id", 1).maybeSingle(),
          todas(() => sb.from("prs_propostas").select("*").order("criado_em", { ascending: false })),
          sb.from("prs_balancos").select("*").order("criado_em", { ascending: false }).limit(40),
          sb.from("prs_zonas").select("*").order("codigo"),
          todas(() => sb.from("crm_clientes").select(COLS).or("origem.in.(prospecao,auto,base_leads),tipo.eq.lead").order("nome")),
          sb.from("prs_excluidos").select("chave", { count: "exact", head: true }),
        ]);
        if (config.error) throw config.error;
        return { config: config.data, propostas, balancos: ok(balancos), zonas: ok(zonas), leads, excluidos: excl.count || 0 };
      },
      // versão leve para o Início e a contagem do menu: só as propostas por aprovar e as barbearias delas
      async resumo() {
        const COLS = "id, nome, distrito, concelho, telefone, email, website, instagram, whatsapp, canal_recomendado, origem, etapa";
        const [config, pend] = await Promise.all([
          sb.from("prs_config").select("*").eq("id", 1).maybeSingle(),
          sb.from("prs_propostas").select("*").eq("estado", "pendente").order("criado_em", { ascending: false }).limit(60),
        ]);
        if (config.error) throw config.error;
        const propostas = ok(pend), ids = [...new Set(propostas.map((p) => p.cliente_id))];
        const leads = ids.length ? ok(await sb.from("crm_clientes").select(COLS).in("id", ids)) : [];
        return { config: config.data, propostas, leads };
      },
      async importar(parte) { return ok(await sb.rpc("prs_importar", { p: parte })); },
      async decidir(id, acao, campos = {}) {
        return ok(await sb.rpc("prs_decidir", { p_id: id, p_acao: acao, p_canal: campos.canal ?? null, p_assunto: campos.assunto ?? null, p_mensagem: campos.mensagem ?? null, p_perguntas: campos.perguntas ?? null, p_motivo: campos.motivo || "" }));
      },
      async respondeu(id, nota) { return ok(await sb.rpc("prs_respondeu", { p_id: id, p_nota: nota || "" })); },
      async registarEnvio(id, detalhe) { return ok(await sb.rpc("prs_registar_envio", { p_id: id, p_detalhe: detalhe || "" })); },
      async gerar(id, respostas) { return (await invocar("prospecao", { acao: "gerar", id, respostas })).proposta; },
      async enviarEmail(id) { return (await invocar("prospecao", { acao: "enviar", id })).proposta; },
      async pesquisarAgora() { return invocar("prospecao", { acao: "pesquisar" }); },
      async semanaAgora() { return invocar("prospecao", { acao: "semana" }); },
      async guardarConfig(campos) { return ok(await sb.from("prs_config").update(campos).eq("id", 1).select().single()); },
      async guardarZona(codigo, campos) { return ok(await sb.from("prs_zonas").update(campos).eq("codigo", codigo).select().single()); },
      async excluidos(q, de, ate) {
        let x = sb.from("prs_excluidos").select("*", { count: "exact" }).order("nome").range(de, ate);
        if (q) x = x.or("nome.ilike.%" + q.replace(/[%,()]/g, " ") + "%,concelho.ilike.%" + q.replace(/[%,()]/g, " ") + "%,distrito.ilike.%" + q.replace(/[%,()]/g, " ") + "%");
        const r = await x; if (r.error) throw r.error; return { itens: r.data, total: r.count || 0 };
      },
      async recuperar(chave) { return ok(await sb.rpc("prs_recuperar", { p_chave: chave })); },
      subscrever(cb) {
        const canal = sb.channel("central26-prs")
          .on("postgres_changes", { event: "*", schema: "public", table: "prs_propostas" }, (p) => cb("proposta", p.eventType, p.new, p.old))
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "prs_balancos" }, (p) => cb("balanco", p.eventType, p.new, p.old))
          .subscribe();
        return () => sb.removeChannel(canal);
      },
    },

    // Seguros e viaturas: datas com avisos antes do dia (script 15)
    prz: {
      async carregar() {
        const [viaturas, prazos, config] = await Promise.all([
          todas(() => sb.from("prz_viaturas").select("*").order("nome")),
          todas(() => sb.from("prz_prazos").select("*").order("data")),
          sb.from("prz_config").select("*").eq("id", 1).maybeSingle(),
        ]);
        return { viaturas, prazos, config: config.error ? null : config.data };
      },
      async criarPrazo(p) { return ok(await sb.from("prz_prazos").insert(p).select().single()); },
      async atualizarPrazo(id, campos) { return ok(await sb.from("prz_prazos").update(campos).eq("id", id).select().single()); },
      async apagarPrazo(id) { ok(await sb.from("prz_prazos").delete().eq("id", id)); },
      async tratar(id, proxima, nota) { return ok(await sb.rpc("prz_tratar", { p_prazo: id, p_proxima: proxima || null, p_nota: nota || "" })); },
      async reabrir(id) { return ok(await sb.rpc("prz_reabrir", { p_prazo: id })); },
      async criarViatura(v) { return ok(await sb.from("prz_viaturas").insert(v).select().single()); },
      async atualizarViatura(id, campos) { return ok(await sb.from("prz_viaturas").update(campos).eq("id", id).select().single()); },
      async apagarViatura(id) { ok(await sb.from("prz_viaturas").delete().eq("id", id)); },
      async guardarConfig(campos) { return ok(await sb.from("prz_config").update({ ...campos, atualizado_em: new Date().toISOString() }).eq("id", 1).select().single()); },
      subscrever(cb) {
        const canal = sb.channel("central26-prz")
          .on("postgres_changes", { event: "*", schema: "public", table: "prz_prazos" }, (p) => cb("prazo", p.eventType, p.new, p.old))
          .on("postgres_changes", { event: "*", schema: "public", table: "prz_viaturas" }, (p) => cb("viatura", p.eventType, p.new, p.old))
          .subscribe();
        return () => sb.removeChannel(canal);
      },
    },
    // 26 Academy: formações, formandos e inscrições (script 19)
    // Estatísticas das barbearias (script 26)
    bar: {
      async carregar() {
        const [stats, horas, imp] = await Promise.all([
          todas(() => sb.from("bar_stats").select("*").order("mes").order("nivel").order("loja").order("chave")),
          todas(() => sb.from("bar_horas").select("*").order("loja").order("dow").order("hora")),
          sb.from("bar_importacao").select("*").eq("id", 1).maybeSingle(),
        ]);
        return { stats, horas, imp: ok(imp) };
      },
      async importar(p) { return ok(await sb.rpc("bar_importar", { p })); },
    },
    // Lojas (script 25)
    loj: {
      async carregar() {
        const desde = new Date(Date.now() - 120 * 864e5).toISOString();
        const [lojas, itens, stock, pedAbertos, pedAntigos, config] = await Promise.all([
          todas(() => sb.from("loj_lojas").select("*").order("ordem")),
          todas(() => sb.from("loj_itens").select("*").order("ordem")),
          todas(() => sb.from("loj_stock").select("*").order("loja_id").order("item_id")),
          todas(() => sb.from("loj_pedidos").select("*").in("estado", ["pedido", "em_curso"]).order("criado_em")),
          todas(() => sb.from("loj_pedidos").select("*").in("estado", ["feito", "cancelado"]).gte("criado_em", desde).order("criado_em", { ascending: false })),
          sb.from("loj_config").select("*").eq("id", 1).maybeSingle(),
        ]);
        return { lojas, itens, stock, pedidos: pedAbertos.concat(pedAntigos), config: config.error ? null : config.data };
      },
      async loja(id, campos) { return ok(await sb.from("loj_lojas").update(campos).eq("id", id).select().single()); },
      async criarItem(o) { return ok(await sb.from("loj_itens").insert(o).select().single()); },
      async item(id, campos) { return ok(await sb.from("loj_itens").update(campos).eq("id", id).select().single()); },
      async stock(loja_id, item_id, campos) { return ok(await sb.from("loj_stock").upsert({ loja_id, item_id, ...campos }, { onConflict: "loja_id,item_id" }).select().single()); },
      async criarPedido(o) { return ok(await sb.from("loj_pedidos").insert(o).select().single()); },
      async pedido(id, campos) { return ok(await sb.from("loj_pedidos").update(campos).eq("id", id).select().single()); },
      async configurar(campos) { return ok(await sb.from("loj_config").update(campos).eq("id", 1).select().single()); },
      async cadeiras(mes) {
        const [cadeiras, meses] = await Promise.all([
          todas(() => sb.from("loj_cadeiras").select("*").order("nome")),
          todas(() => sb.from("loj_cadeiras_mes").select("*").eq("mes", mes).order("cadeira_id")),
        ]);
        // faturação bruta de cada barbeiro na folha do mês (script 21), para sugerir o valor
        const f = await sb.from("fin_barbeiros").select("loja, barbeiro, valor_total").eq("mes", mes);
        return { cadeiras, meses, folha: f.error ? [] : f.data };
      },
      async criarCadeira(o) { return ok(await sb.from("loj_cadeiras").insert(o).select().single()); },
      async cadeira(id, campos) { return ok(await sb.from("loj_cadeiras").update(campos).eq("id", id).select().single()); },
      async cadeiraMes(o) { return ok(await sb.from("loj_cadeiras_mes").upsert({ ...o, atualizado_em: new Date().toISOString() }, { onConflict: "cadeira_id,mes" }).select().single()); },
      subscrever(cb) {
        const canal = sb.channel("central26-lojas")
          .on("postgres_changes", { event: "*", schema: "public", table: "loj_pedidos" }, (p) => cb("loj_pedidos", p.eventType, p.new, p.old))
          .on("postgres_changes", { event: "*", schema: "public", table: "loj_stock" }, (p) => cb("loj_stock", p.eventType, p.new, p.old))
          .subscribe();
        return () => sb.removeChannel(canal);
      },
    },
    // Proformas da TwentySix (script 24)
    com: {
      async carregar() {
        const [precos, config, proformas] = await Promise.all([
          todas(() => sb.from("com_precos").select("*").order("produto_codigo")),
          sb.from("com_config").select("*").eq("id", 1).maybeSingle(),
          todas(() => sb.from("com_proformas").select("*").order("numero", { ascending: false })),
        ]);
        return { precos, config: ok(config), proformas };
      },
      async precos(lote) { return ok(await sb.from("com_precos").upsert(lote, { onConflict: "produto_codigo" }).select()); },
      async configurar(campos) { return ok(await sb.from("com_config").update(campos).eq("id", 1).select().single()); },
      async criar(o) { return ok(await sb.from("com_proformas").insert(o).select().single()); },
      async atualizar(id, campos) { return ok(await sb.from("com_proformas").update(campos).eq("id", id).select().single()); },
      async apagar(id) { ok(await sb.from("com_proformas").delete().eq("id", id)); },
      async aceitar(id) { return ok(await sb.rpc("com_proforma_aceitar", { p_id: id })); },
      async faturar(id, fatura) { return ok(await sb.rpc("com_proforma_faturar", { p_id: id, p_fatura: fatura })); },
      async cancelar(id) { return ok(await sb.rpc("com_proforma_cancelar", { p_id: id })); },
      async reabrir(id) { return ok(await sb.rpc("com_proforma_reabrir", { p_id: id })); },
      subscrever(cb) {
        const canal = sb.channel("central26-proformas")
          .on("postgres_changes", { event: "*", schema: "public", table: "com_proformas" }, (p) => cb(p.eventType, p.new, p.old))
          .subscribe();
        return () => sb.removeChannel(canal);
      },
    },
    aca: {
      async carregar() {
        const [formacoes, formandos, inscricoes, config] = await Promise.all([
          todas(() => sb.from("aca_formacoes").select("*").order("inicio", { ascending: false }).order("id")),
          todas(() => sb.from("aca_formandos").select("*").order("nome").order("id")),
          todas(() => sb.from("aca_inscricoes").select("formacao_id, formando_id, desistente, idade").order("formacao_id").order("formando_id")),
          sb.from("aca_config").select("*").eq("id", 1).maybeSingle(),
        ]);
        // preços das formações (script 22, só a direção): sem o script ou sem permissão, fica sem preços
        const pr = await sb.from("aca_precos").select("formacao_id, preco");
        return { formacoes, formandos, inscricoes, config: config.error ? null : config.data, precos: pr.error ? null : pr.data };
      },
      async preco(formacao_id, preco) {
        if (preco == null) { ok(await sb.from("aca_precos").delete().eq("formacao_id", formacao_id)); return null; }
        return ok(await sb.from("aca_precos").upsert({ formacao_id, preco, atualizado_em: new Date().toISOString() }).select().single());
      },
      async importar(p) { return ok(await sb.rpc("aca_importar", { p })); },
      async criarFormacao(f) { return ok(await sb.from("aca_formacoes").insert(f).select().single()); },
      async atualizarFormacao(id, campos) { return ok(await sb.from("aca_formacoes").update(campos).eq("id", id).select().single()); },
      async apagarFormacao(id) { ok(await sb.from("aca_formacoes").delete().eq("id", id)); },
      async criarFormando(f) { return ok(await sb.from("aca_formandos").insert(f).select().single()); },
      async atualizarFormando(id, campos) { return ok(await sb.from("aca_formandos").update(campos).eq("id", id).select().single()); },
      async apagarFormando(id) { ok(await sb.from("aca_formandos").delete().eq("id", id)); },
      async inscrever(formacao_id, formando_id) {
        return ok(await sb.from("aca_inscricoes").upsert({ formacao_id, formando_id }, { onConflict: "formacao_id,formando_id" }).select("formacao_id, formando_id, desistente").single());
      },
      async desinscrever(formacao_id, formando_id) { ok(await sb.from("aca_inscricoes").delete().eq("formacao_id", formacao_id).eq("formando_id", formando_id)); },
      async marcarDesistente(formacao_id, formando_id, desistente) {
        ok(await sb.from("aca_inscricoes").update({ desistente }).eq("formacao_id", formacao_id).eq("formando_id", formando_id));
      },
      async guardarConfig(campos) { return ok(await sb.from("aca_config").update(campos).eq("id", 1).select().single()); },
      // ligação à Secretaria Online: "agora" (o que mudou) ou "completa" (tudo); continua onde ficou se o tempo não chegar
      async sincronizar(acao, continuar_de) { return invocar("academy-sincronizar", { acao, continuar_de: continuar_de || undefined }); },
      subscrever(cb) {
        let canal = sb.channel("central26-aca");
        for (const t of ["aca_formacoes", "aca_formandos", "aca_inscricoes", "aca_config"]) canal = canal.on("postgres_changes", { event: "*", schema: "public", table: t }, (p) => cb(t, p.eventType, p.new, p.old));
        canal.subscribe();
        return () => sb.removeChannel(canal);
      },
    },
    // relatório mensal da direção (script 20 + função relatorio-mensal)
    relatorio: {
      async dados(mes) { return ok(await sb.rpc("relatorio_dados", { p_mes: mes })); },
      async enviar(mes, soParaMim) { return invocar("relatorio-mensal", { acao: "enviar", mes, so_para_mim: !!soParaMim }); },
    },
    // histórico e reciclagem (script 18)
    hist: {
      async de(tabela, id) {
        const { data, error } = await sb.from("historico").select("*").eq("tabela", tabela).eq("registo_id", String(id)).order("criado_em", { ascending: false }).limit(60);
        if (error) { if (/historico|PGRST205|does not exist/i.test(error.message)) throw new Error("FALTA_SCRIPT"); throw erroPt(error); }
        return data;
      },
      async reciclagem() {
        const desde = new Date(Date.now() - 30 * 864e5).toISOString();
        const { data, error } = await sb.from("historico").select("*").eq("acao", "apagado").is("recuperado_em", null).gte("criado_em", desde).order("criado_em", { ascending: false }).limit(300);
        if (error) { if (/historico|PGRST205|does not exist/i.test(error.message)) throw new Error("FALTA_SCRIPT"); throw erroPt(error); }
        return data;
      },
      async recuperar(id) { return ok(await sb.rpc("recuperar", { p_id: id })); },
    },
    coment: {
      async de(tabela, id) {
        const { data, error } = await sb.from("comentarios").select("*").eq("tabela", tabela).eq("registo_id", String(id)).order("criado_em");
        if (error) { if (/comentarios|PGRST205|does not exist/i.test(error.message)) throw new Error("FALTA_SCRIPT"); throw erroPt(error); }
        return data;
      },
      async criar(tabela, id, texto, mencoes) { return ok(await sb.from("comentarios").insert({ tabela, registo_id: String(id), texto, mencoes: mencoes || [] }).select().single()); },
      async apagar(id) { ok(await sb.from("comentarios").delete().eq("id", id)); },
      subscrever(cb) {
        const canal = sb.channel("central26-comentarios")
          .on("postgres_changes", { event: "*", schema: "public", table: "comentarios" }, (p) => cb(p.eventType, p.new, p.old))
          .subscribe();
        return () => sb.removeChannel(canal);
      },
    },
    async pesquisar(q) {
      const { data, error } = await sb.rpc("pesquisar", { p_q: q });
      if (error) { if (semFuncao(error)) return null; throw erroPt(error); }
      return data || [];
    },
    copias: {
      async listar() {
        const { data, error } = await sb.from("copias").select("*").order("criado_em", { ascending: false }).limit(20);
        if (error) { if (/copias|PGRST205|does not exist/i.test(error.message)) throw new Error("FALTA_SCRIPT"); throw erroPt(error); }
        return data;
      },
      async agora() { return invocar("copia-seguranca", { acao: "agora" }); },
      async descarregar(id) { return invocar("copia-seguranca", { acao: "link", id }); },
    },
  };
  // usado pela camada sem rede (offline.js) para detetar alterações de outras pessoas
  const extras = {
    async lerLinha(tabela, id) { return ok(await sb.from(tabela).select("*").eq("id", id).maybeSingle()); },
    async ultimaAlteracao(tabela, id) {
      const { data, error } = await sb.from("historico").select("autor_id, criado_em").eq("tabela", tabela).eq("registo_id", String(id)).order("criado_em", { ascending: false }).limit(1);
      return error ? null : data?.[0] || null;
    },
  };
  return envolverApi(objeto, extras);
}
