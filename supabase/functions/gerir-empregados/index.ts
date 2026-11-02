// Central 26 · gerir-empregados
// Cria contas de empregados, repõe palavras-passe e ativa/desativa contas.
// Só o CEO e a administração (papel "admin") podem usar.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (corpo: unknown, estado = 200) =>
  new Response(JSON.stringify(corpo), { status: estado, headers: { ...cors, "Content-Type": "application/json" } });

const PAPEIS = ["ceo", "admin", "chefe", "colaborador"];

// Palavra-passe temporária fácil de ditar: Central-4821-kqmt
function gerarPassword(): string {
  const letras = "abcdefghjkmnpqrstuvwxyz";
  const r = crypto.getRandomValues(new Uint32Array(8));
  const num = Array.from(r.slice(0, 4), (x) => String(x % 10)).join("");
  const let_ = Array.from(r.slice(4), (x) => letras[x % letras.length]).join("");
  return `Central-${num}-${let_}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não suportado." }, 405);

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: sessao, error: erroSessao } = await admin.auth.getUser(token);
    if (erroSessao || !sessao?.user) return json({ erro: "A sessão expirou. Volta a entrar." }, 401);

    const { data: eu } = await admin.from("perfis").select("id, papel, ativo").eq("id", sessao.user.id).maybeSingle();
    if (!eu || !eu.ativo || !["ceo", "admin"].includes(eu.papel)) {
      return json({ erro: "Só o CEO e a administração podem gerir a equipa." }, 403);
    }

    const corpo = await req.json().catch(() => ({}));
    const acao = corpo.acao;

    // ---------- Criar empregado ----------
    if (acao === "criar") {
      const nome = String(corpo.nome || "").trim();
      const email = String(corpo.email || "").trim().toLowerCase();
      if (!nome) return json({ erro: "Indica o nome do empregado." }, 400);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ erro: "O email não é válido." }, 400);

      const papel = PAPEIS.includes(corpo.papel) ? corpo.papel : "colaborador";
      if (papel === "ceo" && eu.papel !== "ceo") {
        const { count } = await admin.from("perfis").select("id", { count: "exact", head: true }).eq("papel", "ceo");
        if (count && count > 0) return json({ erro: "Só o CEO pode dar o papel de CEO." }, 403);
      }

      const password = gerarPassword();
      const { data: criado, error: e1 } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { nome },
      });
      if (e1 || !criado?.user) {
        const ja = /already|registered|exists/i.test(e1?.message || "");
        return json({ erro: ja ? "Já existe uma conta com este email." : `Não foi possível criar a conta: ${e1?.message}` }, 400);
      }

      const { error: e2 } = await admin.from("perfis").insert({
        id: criado.user.id,
        nome,
        email,
        cargo: String(corpo.cargo || "").trim(),
        departamento_id: corpo.departamento_id || null,
        papel,
        telefone: String(corpo.telefone || "").trim(),
        criado_por: eu.id,
        mudar_password: true,
      });
      if (e2) {
        await admin.auth.admin.deleteUser(criado.user.id);
        return json({ erro: `Não foi possível guardar o perfil: ${e2.message}` }, 400);
      }
      return json({ ok: true, id: criado.user.id, password });
    }

    // ---------- Repor palavra-passe ----------
    if (acao === "repor_password") {
      const { data: alvo } = await admin.from("perfis").select("id, papel").eq("id", corpo.id).maybeSingle();
      if (!alvo) return json({ erro: "Empregado não encontrado." }, 404);
      if (alvo.papel === "ceo" && eu.papel !== "ceo") return json({ erro: "Só o CEO pode repor a palavra-passe do CEO." }, 403);

      const password = gerarPassword();
      const { error } = await admin.auth.admin.updateUserById(alvo.id, { password });
      if (error) return json({ erro: `Não foi possível repor a palavra-passe: ${error.message}` }, 400);
      await admin.from("perfis").update({ mudar_password: true }).eq("id", alvo.id);
      return json({ ok: true, password });
    }

    // ---------- Ativar / desativar conta ----------
    if (acao === "definir_ativo") {
      const ativo = !!corpo.ativo;
      if (corpo.id === eu.id) return json({ erro: "Não podes desativar a tua própria conta." }, 400);
      const { data: alvo } = await admin.from("perfis").select("id, papel").eq("id", corpo.id).maybeSingle();
      if (!alvo) return json({ erro: "Empregado não encontrado." }, 404);
      if (alvo.papel === "ceo" && eu.papel !== "ceo") return json({ erro: "Só o CEO pode desativar a conta do CEO." }, 403);

      const { error } = await admin.auth.admin.updateUserById(alvo.id, { ban_duration: ativo ? "none" : "876000h" });
      if (error) return json({ erro: `Não foi possível alterar a conta: ${error.message}` }, 400);
      await admin.from("perfis").update({ ativo }).eq("id", alvo.id);
      return json({ ok: true });
    }

    return json({ erro: "Ação desconhecida." }, 400);
  } catch (e) {
    return json({ erro: `Erro inesperado: ${(e as Error)?.message || e}` }, 500);
  }
});
