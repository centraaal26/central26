// Central 26 · copia-seguranca
// Cópia de segurança automática de todos os dados, guardada no armazenamento privado «copias» (só a direção a descarrega).
// - Chamada pela base de dados todos os domingos às 3h (acao "tique", com o segredo partilhado).
// - Chamada pela app (direção): "agora" faz uma cópia já; "link" devolve uma ligação de 10 minutos para descarregar.
// Ficam as últimas 12 cópias. Se falhar, a direção recebe um aviso.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-segredo",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (corpo: unknown, estado = 200) =>
  new Response(JSON.stringify(corpo), { status: estado, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// As mesmas tabelas da cópia feita na app (Definições → Cópia de segurança)
const TABELAS: Record<string, string> = {
  perfis: "id", departamentos: "id", tarefas: "id", atividade: "id", notificacoes: "id", configuracao: "chave", preferencias: "perfil_id",
  crm_clientes: "id", crm_produtos: "codigo", crm_vendas: "documento,linha", crm_contactos: "id", crm_importacoes: "id",
  chat_canais: "id", chat_membros: "canal_id,perfil_id", chat_mensagens: "id", agenda_eventos: "id",
  log_locais: "id", log_encomendas: "id", log_rotas: "id", stk_produtos: "id", stk_movimentos: "id", stk_config: "id",
  prz_viaturas: "id", prz_prazos: "id", prz_config: "id", prs_propostas: "id", prs_zonas: "codigo", prs_balancos: "id", prs_config: "id", prs_excluidos: "chave",
  tec_itens: "id", tec_historico: "id", tec_plano: "semana", tec_referencia: "tipo", tec_config: "id",
  op_fornecedores: "id", op_contactos: "id", op_pedidos: "id", op_propostas: "id",
  fin_meses: "mes", fin_linhas: "id", fin_faturacao: "mes,espaco", fin_rubricas: "chave", fin_barbeiros: "mes,loja,barbeiro", fin_responsaveis: "mes,loja", fin_pessoal: "mes,pessoa", fin_ajustes: "mes,tipo", fin_config: "id", mk_publicacoes: "id", mk_documentos: "id", comentarios: "id",
  aca_formacoes: "id", aca_formandos: "id", aca_inscricoes: "formacao_id,formando_id", aca_config: "id", aca_precos: "formacao_id", crm_custos: "produto_codigo",
};
const MANTER = 12;

async function todas(tabela: string, ordem: string) {
  const out: unknown[] = [];
  for (let de = 0; ; de += 1000) {
    let q = admin.from(tabela).select("*");
    for (const c of ordem.split(",")) q = q.order(c);
    const { data, error } = await q.range(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

async function avisarDirecao(titulo: string, corpo: string) {
  const { data } = await admin.from("perfis").select("id").in("papel", ["ceo", "admin"]).eq("ativo", true);
  if (data?.length) await admin.from("notificacoes").insert(data.map((p) => ({ destinatario_id: p.id, tipo: "copia", titulo, corpo, link: "#copia" })));
}

async function fazerCopia(por: string) {
  const inicio = new Date();
  try {
    const tabelas: Record<string, unknown[]> = {}, avisos: string[] = [];
    let registos = 0;
    for (const [t, ordem] of Object.entries(TABELAS)) {
      try { tabelas[t] = await todas(t, ordem); registos += tabelas[t].length; }
      catch (e) { if (!/does not exist|Could not find|PGRST205/i.test(String((e as Error).message))) avisos.push(t + ": " + (e as Error).message); }
    }
    const texto = JSON.stringify({ formato: "central26-copia", automatica: true, criado_em: inicio.toISOString(), por, avisos, tabelas });
    const gz = new Uint8Array(await new Response(new Blob([texto]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
    const carimbo = inicio.toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const caminho = "central26-copia-" + carimbo + ".json.gz";
    const up = await admin.storage.from("copias").upload(caminho, gz, { contentType: "application/gzip", upsert: true });
    if (up.error) throw new Error("Armazenamento: " + up.error.message);
    const { data: linha, error } = await admin.from("copias").insert({ caminho, tamanho: gz.byteLength, registos, ok: true, erro: avisos.join("; ").slice(0, 500) }).select().single();
    if (error) throw new Error(error.message);
    // limpa as antigas
    const { data: antigas } = await admin.from("copias").select("id, caminho").eq("ok", true).order("criado_em", { ascending: false }).range(MANTER, MANTER + 50);
    if (antigas?.length) {
      await admin.storage.from("copias").remove(antigas.map((x) => x.caminho).filter(Boolean));
      await admin.from("copias").delete().in("id", antigas.map((x) => x.id));
    }
    await admin.from("copias").delete().eq("ok", false).lt("criado_em", new Date(Date.now() - 60 * 864e5).toISOString());
    if (avisos.length) await avisarDirecao("Cópia de segurança feita com avisos", avisos.slice(0, 3).join(" · "));
    return linha;
  } catch (e) {
    const msg = String((e as Error)?.message || e).slice(0, 500);
    await admin.from("copias").insert({ ok: false, erro: msg });
    await avisarDirecao("A cópia de segurança automática falhou", msg.slice(0, 160));
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não suportado." }, 405);
  try {
    const corpo = await req.json().catch(() => ({}));

    if (corpo.acao === "tique") {
      const { data } = await admin.from("configuracao_privada").select("valor").eq("chave", "segredo_webhook").maybeSingle();
      if (!data || req.headers.get("x-segredo") !== data.valor) return json({ erro: "Não autorizado." }, 401);
      const r = await fazerCopia("Central (automática)");
      return json({ ok: true, id: r.id });
    }

    // Pedidos da app: só a direção
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: sessao } = await admin.auth.getUser(token);
    if (!sessao?.user) return json({ erro: "A sessão expirou. Volta a entrar." }, 401);
    const { data: eu } = await admin.from("perfis").select("id, nome, papel, ativo").eq("id", sessao.user.id).maybeSingle();
    if (!eu?.ativo || !["ceo", "admin"].includes(eu.papel)) return json({ erro: "Só a direção pode fazer e descarregar cópias de segurança." }, 403);

    if (corpo.acao === "agora") {
      const r = await fazerCopia(eu.nome || "Direção");
      return json({ ok: true, id: r.id });
    }
    if (corpo.acao === "link") {
      const { data: c } = await admin.from("copias").select("caminho, ok").eq("id", Number(corpo.id)).maybeSingle();
      if (!c?.ok || !c.caminho) return json({ erro: "Esta cópia já não existe." }, 404);
      const { data, error } = await admin.storage.from("copias").createSignedUrl(c.caminho, 600, { download: c.caminho });
      if (error || !data?.signedUrl) return json({ erro: "Não foi possível preparar a ligação para descarregar." }, 500);
      return json({ url: data.signedUrl });
    }
    return json({ erro: "Ação desconhecida." }, 400);
  } catch (e) {
    return json({ erro: "Não foi possível fazer a cópia: " + String((e as Error)?.message || e).slice(0, 300) }, 500);
  }
});
