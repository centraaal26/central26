// Central 26 · relatorio-mensal
// Envia por email à direção o relatório do mês anterior: vendas e margem da TwentySix, clientes novos e parados,
// barbearias, stock a encomendar, 26 Academy, prazos e tarefas. Os números vêm da função relatorio_dados (script 20).
// - Chamada pela base de dados no dia 1 de cada mês (acao "tique", com o segredo partilhado).
// - Chamada pela app (direção): acao "enviar" com { mes: "AAAA-MM", so_para_mim: true|false }.
// Precisa do segredo RESEND_API_KEY (o mesmo da função enviar-push).
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-segredo",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (corpo: unknown, estado = 200) =>
  new Response(JSON.stringify(corpo), { status: estado, headers: { ...cors, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const APP_URL = Deno.env.get("APP_URL") || "https://centraaal26.github.io/central26/";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const esc = (t: unknown) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const eur = (v: number) => Number(v || 0).toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const num = (v: number) => Number(v || 0).toLocaleString("pt-PT", { maximumFractionDigits: 1 });
const nomeMes = (m: string) => MESES[+m.slice(5, 7) - 1] + " de " + m.slice(0, 4);
const variacao = (a: number, b: number) => (!b ? "" : (a >= b ? "+" : "−") + Math.abs(Math.round(((a - b) / Math.abs(b)) * 100)) + "%");
const dataPt = (d: string) => (d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) : "");

function mesAnterior() {
  const agora = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Lisbon" }));
  const d = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

// ---------- o email ----------
const sec = (titulo: string, corpo: string) => `<tr><td style="padding:18px 24px 4px"><h2 style="margin:0 0 10px;font-size:16px;color:#1c1a17">${esc(titulo)}</h2>${corpo}</td></tr>`;
const kpis = (l: [string, string, string?][]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${l.map(([r, v, n]) =>
  `<td style="padding:4px 8px 8px 0;vertical-align:top"><div style="font-size:12px;color:#6b665d">${esc(r)}</div><div style="font-size:20px;font-weight:700;color:#1c1a17">${esc(v)}</div>${n ? `<div style="font-size:12px;color:#8b857a">${esc(n)}</div>` : ""}</td>`).join("")}</tr></table>`;
const tabela = (cab: string[], linhas: string[][]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse">
<tr>${cab.map((c, i) => `<td style="padding:6px 4px;color:#8b857a;border-bottom:1px solid #eee8dc;${i ? "text-align:right" : ""}">${esc(c)}</td>`).join("")}</tr>
${linhas.map((l) => `<tr>${l.map((c, i) => `<td style="padding:6px 4px;border-bottom:1px solid #f3efe6;${i ? "text-align:right;white-space:nowrap" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("")}</table>`;
const nota = (t: string) => `<p style="margin:6px 0 8px;font-size:13px;color:#6b665d;line-height:1.5">${esc(t)}</p>`;

export function htmlRelatorio(d: any, nome: string) {
  const v = d.vendas || {}, m = d.margem || {};
  const margem = m.vendas_com_custo ? m.vendas_com_custo - m.custo : null;
  let h = "";
  h += sec("TwentySix", kpis([
    ["Vendas sem IVA", eur(v.mes), [variacao(v.mes, v.anterior) && variacao(v.mes, v.anterior) + " face ao mês anterior", variacao(v.mes, v.ano_passado) && variacao(v.mes, v.ano_passado) + " face ao ano passado"].filter(Boolean).join(" · ")],
    ["Clientes que compraram", num(v.clientes), num(v.faturas) + " faturas"],
    ["Margem bruta", margem == null ? "—" : eur(margem), margem == null ? "falta o custo dos produtos" : Math.round((margem / m.vendas_com_custo) * 100) + "% · " + Math.round((m.vendas_com_custo / Math.max(1, m.vendas)) * 100) + "% das vendas com custo"],
  ]) + (v.notas_credito ? nota("Notas de crédito: " + eur(v.notas_credito) + (v.ofertas ? " · ofertas: " + num(v.ofertas) + " unidades" : "") + ".") : "") +
    (d.produtos?.length ? tabela(["Mais vendidos", "Unidades", "Vendas"], d.produtos.map((p: any) => [p.nome, num(p.qtd), eur(p.valor)])) : nota("Sem vendas importadas neste mês.")) +
    (d.ultima_venda && d.ultima_venda < d.mes + "-28" ? nota("Atenção: as vendas importadas vão só até " + dataPt(d.ultima_venda) + ".") : ""));
  h += sec("Clientes", (d.clientes_novos?.length ? nota("Novos este mês: " + d.clientes_novos.map((c: any) => c.nome).join(", ") + ".") : nota("Nenhum cliente novo este mês.")) +
    (d.clientes_parados?.length ? nota("Deixaram de comprar há 3 a 6 meses (vale a pena ligar):") + tabela(["Cliente", "Última compra", "Último ano"], d.clientes_parados.map((c: any) => [c.nome, dataPt(c.ultima), eur(c.valor_ano)])) : ""));
  if (d.barbearias?.length) {
    const tot = d.barbearias.reduce((s: number, b: any) => s + +b.total, 0), ant = d.barbearias.reduce((s: number, b: any) => s + +(b.anterior || 0), 0);
    h += sec("Barbearias", kpis([["Faturação", eur(tot), variacao(tot, ant) ? variacao(tot, ant) + " face ao mês anterior" : ""]]) +
      tabela(["Loja", "Faturação", "Mês anterior"], d.barbearias.map((b: any) => [b.espaco, eur(b.total), b.anterior == null ? "—" : eur(b.anterior)])) +
      (d.financeiro_avisos?.length ? nota("Avisos da folha: " + d.financeiro_avisos.map((a: any) => (typeof a === "string" ? a : a.texto || a.msg || "")).filter(Boolean).join(" · ")) : ""));
  } else h += sec("Barbearias", nota(d.financeiro_importado ? "A folha deste mês não tem faturação por loja." : "A folha do Financeiro deste mês ainda não foi importada."));
  h += sec("Stock", (d.encomendar?.length ? nota("Encomendar ao laboratório:") + tabela(["Produto", "Dá para", "Encomendar"], d.encomendar.map((p: any) => [p.nome, p.dias_restantes + " dias", num(p.sugerido) + " un."])) : nota("Nada a encomendar ao laboratório nas próximas semanas.")) +
    (d.stock_minimo?.length ? nota("Abaixo do mínimo: " + d.stock_minimo.map((p: any) => p.nome + " (" + p.quantidade + ")").join(", ") + ".") : ""));
  const a = d.academy || {};
  h += sec("26 Academy", kpis([["A decorrer ou em avaliação", num(a.a_decorrer)], ["Formandos novos", num(a.formandos_novos)], ["Assiduidade média (12 meses)", a.assiduidade == null ? "—" : num(a.assiduidade) + "%"]]));
  const t = d.tarefas || {};
  h += sec("Prazos e tarefas", kpis([["Tarefas concluídas no mês", num(t.concluidas)], ["Tarefas em atraso hoje", num(t.em_atraso)]]) +
    (d.prazos?.length ? tabela(["Seguros e viaturas (próximos 30 dias)", "Data"], d.prazos.map((p: any) => [p.titulo, dataPt(p.data)])) : ""));
  return `<!doctype html><html lang="pt-PT"><body style="margin:0;background:#f4f1ea;font-family:Helvetica,Arial,sans-serif;color:#1c1a17">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6e0d4">
<tr><td style="background:#17150f;padding:18px 24px;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:.5px">CENTRAL <span style="color:#c9a35a">26</span></td></tr>
<tr><td style="padding:22px 24px 0"><p style="margin:0 0 4px;font-size:14px;color:#6b665d">Olá, ${esc(nome.split(" ")[0])}</p><h1 style="margin:0;font-size:22px">Relatório de ${esc(nomeMes(d.mes))}</h1></td></tr>
${h}
<tr><td style="padding:16px 24px 24px"><a href="${esc(APP_URL + "#relatorio-" + d.mes)}" style="display:inline-block;background:#8a6a2c;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:9px">Ver na Central 26</a></td></tr>
<tr><td style="padding:14px 24px 20px;font-size:12px;color:#8b857a;border-top:1px solid #eee8dc">Relatório automático do dia 1 de cada mês, só para a direção.</td></tr>
</table></td></tr></table></body></html>`;
}

async function enviar(mes: string, destinatarios: { email: string; nome: string }[]) {
  const chave = Deno.env.get("RESEND_API_KEY");
  if (!chave) throw new Error("Os emails ainda não estão ligados: falta o segredo RESEND_API_KEY no Supabase.");
  const { data, error } = await admin.rpc("relatorio_dados", { p_mes: mes });
  if (error) throw new Error(error.message);
  let enviados = 0;
  for (const p of destinatarios) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("EMAIL_REMETENTE") || "Central 26 <central@avisos.twentysix.pt>",
        to: [p.email], subject: "Relatório de " + nomeMes(mes) + " · Central 26", html: htmlRelatorio(data, p.nome || ""),
        text: "Relatório de " + nomeMes(mes) + ". Abre na Central 26: " + APP_URL + "#relatorio-" + mes,
      }),
    });
    if (r.ok) enviados++; else console.error("Falha no email", r.status, (await r.text()).slice(0, 200));
  }
  return enviados;
}

if (!Deno.env.get("RELATORIO_TESTE")) Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não suportado." }, 405);
  try {
    const corpo = await req.json().catch(() => ({}));
    if (corpo.acao === "tique") {
      const { data } = await admin.from("configuracao_privada").select("valor").eq("chave", "segredo_webhook").maybeSingle();
      if (!data || req.headers.get("x-segredo") !== data.valor) return json({ erro: "Não autorizado." }, 401);
      const { data: dir } = await admin.from("perfis").select("nome, email").in("papel", ["ceo", "admin"]).eq("ativo", true);
      const n = await enviar(mesAnterior(), (dir || []).filter((p: any) => p.email));
      return json({ ok: true, enviados: n });
    }
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: sessao } = await admin.auth.getUser(token);
    if (!sessao?.user) return json({ erro: "A sessão expirou. Volta a entrar." }, 401);
    const { data: eu } = await admin.from("perfis").select("nome, email, papel, ativo").eq("id", sessao.user.id).maybeSingle();
    if (!eu?.ativo || !["ceo", "admin"].includes(eu.papel)) return json({ erro: "Só a direção envia o relatório mensal." }, 403);
    if (corpo.acao === "enviar") {
      const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(corpo.mes || "") ? corpo.mes : mesAnterior();
      let dest: { email: string; nome: string }[];
      if (corpo.so_para_mim) dest = eu.email ? [{ email: eu.email, nome: eu.nome }] : [];
      else { const { data: dir } = await admin.from("perfis").select("nome, email").in("papel", ["ceo", "admin"]).eq("ativo", true); dest = (dir || []).filter((p: any) => p.email); }
      if (!dest.length) return json({ erro: "Não há emails da direção registados nos perfis." }, 400);
      return json({ ok: true, enviados: await enviar(mes, dest), mes });
    }
    return json({ erro: "Ação desconhecida." }, 400);
  } catch (e) {
    return json({ erro: String((e as Error)?.message || e).slice(0, 300) }, 500);
  }
});
