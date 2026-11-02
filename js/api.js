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
        if (r && typeof r.json === "function") { const j = await r.json(); if (j && j.erro) msg = j.erro; }
      } catch { /* mantém a mensagem genérica */ }
      throw new Error(msg);
    }
    if (data && data.erro) throw new Error(data.erro);
    return data;
  }

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
        sb.from("perfis").select("*").order("nome"),
        sb.from("departamentos").select("*").order("ordem"),
        sb.from("tarefas").select("*"),
        sb.from("notificacoes").select("*").order("criado_em", { ascending: false }).limit(100),
        sb.from("atividade").select("*").gte("criado_em", desde).order("criado_em", { ascending: false }).limit(3000),
        sb.from("configuracao").select("*"),
      ]);
      return {
        perfis: ok(perfis), departamentos: ok(deps), tarefas: ok(tarefas),
        notificacoes: ok(notifs), atividade: ok(ativ), configuracao: ok(config),
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
      async obter(id) { return ok(await sb.from("tarefas").select("*").eq("id", id).maybeSingle()); },
    },
    notificacoes: {
      async marcarLidas(ids) { if (ids.length) ok(await sb.from("notificacoes").update({ lida: true }).in("id", ids)); },
    },
    perfis: {
      async atualizar(id, campos) { return ok(await sb.from("perfis").update(campos).eq("id", id).select().single()); },
      async atualizarMeu(nome, telefone) { ok(await sb.rpc("atualizar_meu_perfil", { p_nome: nome, p_telefone: telefone })); },
    },
    departamentos: {
      async criar(d) { return ok(await sb.from("departamentos").insert(d).select().single()); },
      async atualizar(id, campos) { return ok(await sb.from("departamentos").update(campos).eq("id", id).select().single()); },
    },
    async empregados(acao, dados) { return invocar("gerir-empregados", { acao, ...dados }); },
    push: {
      async chave() { const r = await invocar("enviar-push", { acao: "chave" }); return r.chave; },
      async registar(endpoint, p256dh, auth, aparelho) {
        ok(await sb.rpc("registar_push", { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_aparelho: aparelho }));
      },
      async teste() { return invocar("enviar-push", { acao: "teste" }); },
    },
  };
}
