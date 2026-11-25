// Central 26 · leitura-caixa
// Lê a foto da «Leitura de caixa» do Multixop de uma barbearia e devolve os números para o responsável confirmar
// antes de guardar: serviços e valores por barbeiro (secção «Entradas»), total faturado e meios de pagamento.
// Não guarda nada nem a foto: quem guarda é a app, depois de confirmado (tabela bar_leituras).
// Usa a chave do assistente (ANTHROPIC_API_KEY). Só a direção e o responsável da loja a podem usar.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (corpo: unknown, estado = 200) => new Response(JSON.stringify(corpo), { status: estado, headers: { ...cors, "Content-Type": "application/json" } });
const URL_SB = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const MODELO = Deno.env.get("ASSISTENTE_MODELO") || "claude-sonnet-5-5";
const hojeLisboa = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });

const PEDIDO = `Esta é uma foto (ou captura de ecrã) da «Leitura de caixa» do programa Multixop de uma barbearia em Portugal.
Copia os números EXATAMENTE como aparecem. Os valores usam vírgula decimal («112,00» = 112). Não inventes nada: se uma parte estiver cortada ou ilegível, deixa-a de fora e explica em «avisos».

A secção «Entradas» tem uma linha por barbeiro e serviço, no formato «NOME - SERVIÇO   quantidade   valor» (ex.: «JOAO - CABELO 7,00 112,00»). É a fonte principal.
Se não houver secção «Entradas», usa as linhas no mesmo formato da secção «Total Numerario».
O «Total Registado» tem os meios de pagamento (MULTIBANCO, NUMERARIO…). As «Operações» têm as faturas e as faturas simplificadas.

Responde só com este JSON:
{
 "dia": "AAAA-MM-DD (a data da leitura; se for um intervalo, a última data)",
 "intervalo": "texto do intervalo de datas, tal como está",
 "loja": "nome ou morada no cabeçalho",
 "entradas": [{ "barbeiro": "NOME", "servico": "SERVIÇO", "qtd": 0, "valor": 0 }],
 "soma_entradas": { "qtd": 0, "valor": 0 },
 "faturado": 0,
 "operacoes": [{ "tipo": "Facturas", "qtd": 0, "valor": 0 }],
 "pagamentos": { "MULTIBANCO": 0 },
 "avisos": ["o que não se conseguiu ler ou parece estranho"]
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não suportado." }, 405);
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: sessao } = await admin.auth.getUser(token);
    if (!sessao?.user) return json({ erro: "A sessão expirou. Volta a entrar." }, 401);
    const corpo = await req.json().catch(() => ({}));
    const loja = String(corpo.loja_id || "");
    const sb = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: pode } = await sb.rpc("e_resp_loja", { p_loja: loja });
    if (!pode) return json({ erro: "Só a direção e o responsável da loja registam a leitura de caixa." }, 403);

    const tipo = String(corpo.tipo || "image/jpeg");
    const imagem = String(corpo.imagem || "").replace(/^data:[^,]+,/, "");
    if (!/^image\/(jpeg|png|webp)$/.test(tipo) || imagem.length < 1000) return json({ erro: "Envia uma foto da leitura de caixa (JPG ou PNG)." }, 400);
    if (imagem.length > 7_000_000) return json({ erro: "A foto é demasiado grande." }, 400);
    if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ erro: "Falta a chave do assistente (ANTHROPIC_API_KEY): sem ela não é possível ler a foto." }, 400);

    // limite mensal do assistente (o mesmo das outras funções)
    const mes = hojeLisboa().slice(0, 7);
    const [{ data: u }, { data: cfg }] = await Promise.all([
      admin.from("ia_uso").select("pedidos").eq("perfil_id", sessao.user.id).eq("mes", mes).maybeSingle(),
      admin.from("ia_config").select("ativo, limite_mensal").eq("id", 1).maybeSingle(),
    ]);
    if (cfg && !cfg.ativo) return json({ erro: "O assistente está desligado pela direção." }, 403);
    if (cfg && (u?.pedidos || 0) >= cfg.limite_mensal) return json({ erro: "Chegaste ao limite mensal de pedidos ao assistente." }, 429);

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODELO, max_tokens: 2000, system: "Lês documentos de caixa com rigor e respondes só com JSON válido, sem texto antes nem depois.",
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: tipo, data: imagem } }, { type: "text", text: PEDIDO }] }] }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = j?.error?.message || r.statusText;
      if (r.status === 429) throw new Error("A IA está com muitos pedidos. Tenta daqui a um minuto.");
      if (/credit|billing/i.test(msg)) throw new Error("A conta da Anthropic está sem saldo.");
      throw new Error("A IA respondeu com um erro (" + r.status + "): " + msg);
    }
    await admin.rpc("ia_registar_uso", { p_perfil: sessao.user.id, p_mes: mes, p_in: j.usage?.input_tokens || 0, p_out: j.usage?.output_tokens || 0 });
    const texto = (j.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    const a = texto.indexOf("{"), b = texto.lastIndexOf("}");
    let d: any = null; try { d = JSON.parse(texto.slice(a, b + 1)); } catch { /* */ }
    if (!d) throw new Error("Não consegui ler a leitura de caixa. Tira outra foto, direita e com boa luz.");

    const num = (v: unknown) => {
      const s = String(v ?? "").trim();
      const n = typeof v === "number" ? v : /^-?\d+\.\d{1,2}$/.test(s) ? parseFloat(s) : parseFloat(s.replace(/\./g, "").replace(",", "."));
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
    };
    const txt = (v: unknown, m = 60) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, m);
    const entradas = (Array.isArray(d.entradas) ? d.entradas : []).map((e: any) => ({ barbeiro: txt(e.barbeiro, 40).toUpperCase(), servico: txt(e.servico, 40).toUpperCase(), qtd: num(e.qtd), valor: num(e.valor) }))
      .filter((e: any) => e.barbeiro && (e.qtd || e.valor)).slice(0, 80);
    const avisos = (Array.isArray(d.avisos) ? d.avisos : []).map((x: unknown) => txt(x, 200)).filter(Boolean).slice(0, 6);
    const soma = entradas.reduce((s: number, e: any) => s + e.valor, 0), somaLida = num(d.soma_entradas?.valor);
    if (somaLida && Math.abs(somaLida - soma) > 0.5) avisos.push("A soma das linhas (" + soma.toFixed(2).replace(".", ",") + " €) não bate com a soma da leitura (" + somaLida.toFixed(2).replace(".", ",") + " €). Confirma as linhas.");
    const pag: Record<string, number> = {};
    for (const [k, v] of Object.entries(d.pagamentos || {})) { const kk = txt(k, 30).toUpperCase(); if (kk) pag[kk] = num(v); }
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(String(d.dia || "")) ? String(d.dia) : "";
    return json({
      ok: true, dia, intervalo: txt(d.intervalo, 60), loja: txt(d.loja, 120), entradas, soma_entradas: somaLida || soma,
      faturado: d.faturado == null ? null : num(d.faturado), pagamentos: pag,
      operacoes: (Array.isArray(d.operacoes) ? d.operacoes : []).slice(0, 6).map((o: any) => ({ tipo: txt(o.tipo, 40), qtd: num(o.qtd), valor: num(o.valor) })),
      avisos,
    });
  } catch (e) {
    return json({ erro: (e as Error)?.message || String(e) }, 500);
  }
});
