// Central 26 · crm-abordar
// Método Mackay 66 no Comercial. Todos os dias escolhe no CRM os clientes a abordar (o primeiro a abrir o Comercial
// no dia gera a lista) e, a pedido, prepara cada abordagem com a IA: o que sabemos do cliente, como abordar,
// a primeira mensagem e o que descobrir na conversa. A IA pode pesquisar na web informação PÚBLICA da barbearia
// (site, ficha no Google, redes da loja, notícias); nunca dados pessoais sensíveis.
// Usa as mesmas chaves do assistente (ANTHROPIC_API_KEY ou GROQ_API_KEY). Só quem tem acesso ao CRM a pode usar.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (corpo: unknown, estado = 200) => new Response(JSON.stringify(corpo), { status: estado, headers: { ...cors, "Content-Type": "application/json" } });
const URL_SB = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const FORNECEDOR = (Deno.env.get("IA_FORNECEDOR") || (Deno.env.get("ANTHROPIC_API_KEY") ? "anthropic" : Deno.env.get("GROQ_API_KEY") ? "groq" : "")).toLowerCase();
const MODELO = Deno.env.get("ASSISTENTE_MODELO") || (FORNECEDOR === "groq" ? "openai/gpt-oss-120b" : "claude-sonnet-5-5");
const POR_DIA = 5;       // clientes (seguimentos, recompra, risco)
const PRIMEIROS_DIA = 3; // leads para o primeiro contacto de venda

const PERGUNTAS: Record<string, string> = {
  m01: "Nome e como gosta de ser tratado", m02: "Cargo na barbearia", m03: "Telefone direto ou WhatsApp", m04: "Email", m05: "Melhor dia, hora e canal para o contactar",
  m06: "Data de aniversário", m07: "Terra de origem", m08: "Há quantos anos é barbeiro", m09: "Onde aprendeu", m10: "Línguas que fala",
  m11: "Nome comercial e marca", m12: "Localização", m13: "Ano de abertura", m14: "Número de cadeiras", m15: "Número de barbeiros", m16: "Outras lojas ou planos de abrir",
  m17: "Horário e dias de mais movimento", m18: "Preço do corte e da barba", m19: "Tipo de clientela", m20: "Posicionamento", m21: "Redes sociais e seguidores",
  m22: "Avaliação no Google e o que dizem os clientes", m23: "Quem decide as compras", m24: "Fornecedores atuais", m25: "Marcas que usa nos serviços",
  m26: "Marcas que revende ao balcão", m27: "Produtos que mais vende", m28: "Consumíveis que mais gasta", m29: "De quanto em quanto tempo encomenda",
  m30: "Valor médio de cada encomenda", m31: "Como prefere pagar e prazos", m32: "O que valoriza num fornecedor", m33: "O que não gosta no fornecedor atual",
  m34: "Objeções que já levantou à TwentySix", m35: "Cadeiras e equipamento que tem", m36: "Equipamento que precisa de trocar", m37: "Formações feitas pela equipa",
  m38: "Interesse em formação na 26 Academy", m39: "Competições, prémios ou eventos", m40: "Barbeiros ou marcas que admira", m41: "Objetivo principal para este ano",
  m42: "Maior problema do negócio hoje", m43: "Dificuldade em contratar ou manter barbeiros", m44: "Planos de expansão ou remodelação", m45: "Como atrai clientes novos",
  m46: "Sistema de marcações que usa", m47: "Como mede o sucesso da barbearia", m48: "O que o faria vender mais produtos ao balcão", m49: "Passatempos",
  m50: "Desporto e clube", m51: "Música", m52: "Restaurantes ou comida preferida", m53: "Viagens e férias", m54: "Temas de conversa de que gosta", m55: "Temas a evitar",
  m56: "Iniciativas locais em que participa", m57: "Como conheceu a TwentySix", m58: "Desde quando compra", m59: "Quem da nossa equipa tem melhor relação",
  m60: "Compromissos que lhe fizemos", m61: "Problemas que já teve connosco", m62: "Concorrentes que o visitam", m63: "Interesse em ser embaixador ou parceiro",
  m64: "Datas importantes do negócio", m65: "O que o faria comprar mais à TwentySix", m66: "Próximo passo combinado",
};
// perguntas que se podem responder com fontes públicas da barbearia (nunca as pessoais)
const PUBLICAS = ["m11", "m12", "m13", "m14", "m15", "m16", "m17", "m18", "m19", "m20", "m21", "m22", "m25", "m26", "m35", "m39", "m44", "m45", "m46", "m56", "m64"];

const hojeLisboa = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const mediana = (l: number[]) => { const s = [...l].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const eur = (v: number) => Math.round(v).toLocaleString("pt-PT") + " €";
const dataPt = (s: string) => s ? s.slice(8, 10) + "/" + s.slice(5, 7) : "";

async function todas<T>(q: (de: number, ate: number) => any): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) { const { data, error } = await q(de, de + 999); if (error) throw new Error(error.message); out.push(...(data || [])); if (!data || data.length < 1000) break; }
  return out;
}

type Stats = { total: number; datas: string[]; ultima: string; ritmo: number | null; dias: number | null; produtos: Map<string, number> };
function estatisticas(vendas: any[]) {
  let ref = "";
  const por = new Map<string, Stats>();
  for (const v of vendas) {
    if (v.data > ref) ref = v.data;
    let s = por.get(v.cliente_codigo); if (!s) por.set(v.cliente_codigo, (s = { total: 0, datas: [], ultima: "", ritmo: null, dias: null, produtos: new Map() }));
    s.total += +v.valor || 0;
    if (v.tipo === "NC") continue;
    if (!s.datas.includes(v.data)) s.datas.push(v.data);
    if (v.descricao) s.produtos.set(v.descricao, (s.produtos.get(v.descricao) || 0) + (+v.qtd || 0));
  }
  for (const s of por.values()) {
    s.datas.sort(); s.ultima = s.datas[s.datas.length - 1] || "";
    s.dias = s.ultima ? diasEntre(s.ultima, ref) : null;
    const inter = s.datas.slice(1).map((d, i) => diasEntre(s.datas[i], d));
    s.ritmo = s.datas.length >= 3 ? Math.round(mediana(inter)) : null;
  }
  return { por, ref };
}

// ---------------------------- escolher os clientes do dia ----------------------------
async function gerar(dia: string) {
  const [clientes, vendas, contactos, recentes] = await Promise.all([
    todas<any>((a, b) => admin.from("crm_clientes").select("id, nome, etapa, tipo, codigo_multixop, score, prioridade, responsavel_id, telefone, whatsapp, instagram, email").neq("tipo", "interno").neq("etapa", "perdido").range(a, b)),
    todas<any>((a, b) => admin.from("crm_vendas").select("data, cliente_codigo, valor, tipo, descricao, qtd").range(a, b)),
    todas<any>((a, b) => admin.from("crm_contactos").select("cliente_id, criado_em, data_proximo, proximo_passo").order("criado_em", { ascending: false }).range(a, b)),
    todas<any>((a, b) => admin.from("crm_abordagens").select("cliente_id, dia").gte("dia", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)).range(a, b)),
  ]);
  // leads que já têm proposta na Prospeção não entram (não se contacta a mesma barbearia por dois lados)
  const { data: prs } = await admin.from("prs_propostas").select("cliente_id").limit(5000);
  const naProspecao = new Set((prs || []).map((x: any) => x.cliente_id));
  const { por } = estatisticas(vendas);
  const ultimo = new Map<string, any>();
  for (const c of contactos) if (!ultimo.has(c.cliente_id)) ultimo.set(c.cliente_id, c);
  const lim14 = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  const jaSugerido = new Set(recentes.filter((r) => r.dia >= lim14).map((r) => r.cliente_id)), sugerido30 = new Set(recentes.map((r) => r.cliente_id));
  const primeiros: { id: string; tipo: string; motivo: string; pontos: number }[] = [];
  const cand: { id: string; tipo: string; motivo: string; pontos: number }[] = [];
  for (const c of clientes) {
    if (jaSugerido.has(c.id)) continue;
    const u = ultimo.get(c.id);
    if (u && diasEntre(String(u.criado_em).slice(0, 10), dia) < 7 && !(u.data_proximo && u.data_proximo <= dia)) continue; // contactado esta semana
    const s = c.codigo_multixop ? por.get(c.codigo_multixop) : null;
    if (u?.data_proximo && u.data_proximo <= dia) {
      cand.push({ id: c.id, tipo: "seguimento", pontos: 120 + (s ? Math.min(s.total / 100, 40) : 0), motivo: "Seguimento marcado para " + dataPt(u.data_proximo) + (u.proximo_passo ? ": " + u.proximo_passo : ".") });
    } else if (s && s.datas.length >= 4 && s.ritmo && s.dias != null && s.dias > s.ritmo * 1.5) {
      cand.push({ id: c.id, tipo: "recompra", pontos: 100 + Math.min(s.total / 100, 50), motivo: "Costuma encomendar a cada " + s.ritmo + " dias e a última encomenda foi há " + s.dias + " dias (" + eur(s.total) + " no período)." });
    } else if (s && s.dias != null && s.dias > 90 && s.dias <= 180 && s.total >= 300) {
      cand.push({ id: c.id, tipo: "risco", pontos: 70 + Math.min(s.total / 100, 30), motivo: "Sem compras há " + s.dias + " dias, depois de " + eur(s.total) + " no período." });
    } else if (c.etapa === "lead" && !u && !sugerido30.has(c.id) && !naProspecao.has(c.id) && (c.telefone || c.whatsapp || c.instagram || c.email)) {
      const p = (c.score || 0) + (/alta/i.test(c.prioridade || "") ? 30 : /m[eé]dia/i.test(c.prioridade || "") ? 10 : 0);
      if (p >= 40) primeiros.push({ id: c.id, tipo: "primeiro", pontos: p, motivo: "Ainda não é cliente nem foi contactado" + (c.score != null ? " · pontuação " + c.score : "") + (c.prioridade ? " · prioridade " + String(c.prioridade).toLowerCase() : "") + "." });
    }
  }
  cand.sort((a, b) => b.pontos - a.pontos);
  primeiros.sort((a, b) => b.pontos - a.pontos);
  const escolhidos = [...cand.slice(0, POR_DIA), ...primeiros.slice(0, PRIMEIROS_DIA)];
  if (escolhidos.length) {
    await admin.from("crm_abordagens").upsert(escolhidos.map((x, i) => ({ dia, cliente_id: x.id, ordem: i, tipo: x.tipo, motivo: x.motivo })), { onConflict: "dia,cliente_id", ignoreDuplicates: true });
  }
  return cand.length + primeiros.length;
}

// ------------------------------- Google Maps (opcional) -------------------------------
// Com GOOGLE_PLACES_KEY: avaliação, horário, comentários e até 3 fotos da barbearia (para a IA estimar as cadeiras).
type Imagem = { type: "image"; source: { type: "base64"; media_type: string; data: string } };
async function dadosGoogle(c: any): Promise<{ texto: string; imagens: Imagem[]; fonte: Fonte | null }> {
  const chave = Deno.env.get("GOOGLE_PLACES_KEY"); if (!chave) return { texto: "", imagens: [], fonte: null };
  try {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": chave, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.regularOpeningHours.weekdayDescriptions,places.reviews,places.photos,places.websiteUri" },
      body: JSON.stringify({ textQuery: c.nome + " " + (c.concelho || c.morada || ""), languageCode: "pt-PT", regionCode: "PT", maxResultCount: 1 }),
    });
    const p = (await r.json().catch(() => ({})))?.places?.[0];
    if (!r.ok || !p) return { texto: "", imagens: [], fonte: null };
    const linhas = [
      "Nome no Google: " + (p.displayName?.text || ""), p.formattedAddress && "Morada: " + p.formattedAddress,
      p.rating && "Avaliação: " + p.rating + " (" + (p.userRatingCount || 0) + " avaliações)", p.websiteUri && "Site: " + p.websiteUri,
      p.regularOpeningHours?.weekdayDescriptions?.length && "Horário: " + p.regularOpeningHours.weekdayDescriptions.join("; "),
      (p.reviews || []).length && "Comentários de clientes (excertos, sem nomes):\n" + (p.reviews || []).slice(0, 5).map((x: any) => "- " + String(x.originalText?.text || x.text?.text || "").replace(/\s+/g, " ").slice(0, 280)).join("\n"),
    ].filter(Boolean).join("\n");
    const imagens: Imagem[] = [];
    for (const f of (p.photos || []).slice(0, 3)) {
      try {
        const im = await fetch("https://places.googleapis.com/v1/" + f.name + "/media?maxWidthPx=1000&key=" + chave);
        if (!im.ok) continue;
        const tipo = (im.headers.get("content-type") || "image/jpeg").split(";")[0];
        if (!/^image\/(jpeg|png|webp|gif)$/.test(tipo)) continue;
        const b = new Uint8Array(await im.arrayBuffer()); if (b.length > 3_500_000) continue;
        let bin = ""; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
        imagens.push({ type: "image", source: { type: "base64", media_type: tipo, data: btoa(bin) } });
      } catch { /* segue sem esta foto */ }
    }
    return { texto: linhas, imagens, fonte: p.googleMapsUri ? { titulo: "Google Maps", url: p.googleMapsUri } : null };
  } catch { return { texto: "", imagens: [], fonte: null }; }
}

// ------------------------------------- IA -------------------------------------
type Fonte = { titulo: string; url: string };
async function pedirIA(sistema: string, pedido: string, pesquisar: boolean, imagens: Imagem[] = []): Promise<{ texto: string; fontes: Fonte[]; tin: number; tout: number }> {
  if (FORNECEDOR === "anthropic") {
    const conteudo = imagens.length ? [...imagens, { type: "text", text: pedido }] : pedido;
    const corpo: Record<string, unknown> = { model: MODELO, max_tokens: 3000, system: sistema, messages: [{ role: "user", content: conteudo }] };
    if (pesquisar) corpo.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 4, user_location: { type: "approximate", country: "PT", timezone: "Europe/Lisbon" } }];
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = j?.error?.message || r.statusText;
      if (pesquisar && r.status === 400 && /web_search|tool/i.test(msg)) return pedirIA(sistema, pedido + "\n\n(A pesquisa na web não está disponível: usa só os dados que tens.)", false, imagens);
      if (r.status === 429) throw new Error("A IA está com muitos pedidos. Tenta daqui a um minuto.");
      if (/credit|billing/i.test(msg)) throw new Error("A conta da Anthropic está sem saldo.");
      throw new Error("A IA respondeu com um erro (" + r.status + "): " + msg);
    }
    const blocos = j.content || [], fontes: Fonte[] = [];
    for (const b of blocos) {
      for (const c of b.citations || []) if (c.url && !fontes.some((f) => f.url === c.url)) fontes.push({ titulo: c.title || "", url: c.url });
    }
    if (!fontes.length) for (const b of blocos) if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const x of b.content.slice(0, 3)) if (x.url && !fontes.some((f) => f.url === x.url)) fontes.push({ titulo: x.title || "", url: x.url });
    return { texto: blocos.filter((b: any) => b.type === "text").map((b: any) => b.text).join(""), fontes, tin: j.usage?.input_tokens || 0, tout: j.usage?.output_tokens || 0 };
  }
  if (FORNECEDOR === "groq") {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + Deno.env.get("GROQ_API_KEY"), "content-type": "application/json" },
      body: JSON.stringify({ model: MODELO, max_tokens: 1800, temperature: 0.4, messages: [{ role: "system", content: sistema }, { role: "user", content: pedido + "\n\n(Sem pesquisa na web: usa só os dados do CRM.)" }] }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 429 ? "A IA gratuita chegou ao limite. Tenta mais tarde." : "A IA respondeu com um erro (" + r.status + ").");
    return { texto: j.choices?.[0]?.message?.content || "", fontes: [], tin: j.usage?.prompt_tokens || 0, tout: j.usage?.completion_tokens || 0 };
  }
  throw new Error("O assistente ainda não está ligado: falta a chave ANTHROPIC_API_KEY ou GROQ_API_KEY.");
}
function lerJson(t: string): any {
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

const SISTEMA = `És o assistente comercial da TwentySix (produtos de barbearia portugueses: ceras, pomadas, champôs, óleos, consumíveis e cadeiras; marca do Grupo 26, de Vila Nova de Gaia, com a 26 Academy de formação de barbeiros).
Usas o método Mackay 66 (Harvey Mackay): conhecer o cliente como pessoa e como negócio para criar uma relação de confiança e vender com relevância.
Regras:
- Escreve SEMPRE em português de Portugal, nunca do Brasil. Nunca uses «você»: trata a pessoa pelo nome e usa formas neutras. Nada de «time», «celular», «tela», «usuário».
- Se pesquisares na web, procura só informação PÚBLICA do negócio: site, ficha no Google (avaliações, horário), página da barbearia nas redes sociais, notícias. Nunca procures nem guardes dados pessoais sensíveis (saúde, religião, política, família, vida privada) nem perfis pessoais.
- Nunca inventes factos. Se não encontrares, não preenchas. Cada facto público vem com a fonte (URL).
- Responde só com um objeto JSON válido, sem texto antes nem depois.`;

async function contexto(clienteId: string) {
  const { data: c } = await admin.from("crm_clientes").select("*").eq("id", clienteId).maybeSingle();
  if (!c) throw new Error("Cliente não encontrado.");
  const [{ data: vendas }, { data: cont }, { data: mk }] = await Promise.all([
    c.codigo_multixop ? admin.from("crm_vendas").select("data, cliente_codigo, valor, tipo, descricao, qtd").eq("cliente_codigo", c.codigo_multixop).limit(2000) : Promise.resolve({ data: [] }),
    admin.from("crm_contactos").select("tipo, texto, proximo_passo, data_proximo, criado_em").eq("cliente_id", clienteId).order("criado_em", { ascending: false }).limit(8),
    admin.from("crm_mackay").select("*").eq("cliente_id", clienteId).maybeSingle(),
  ]);
  const { por } = estatisticas(vendas || []);
  const s = c.codigo_multixop ? por.get(c.codigo_multixop) : null;
  const respostas = (mk?.respostas || {}) as Record<string, string>;
  const conhecido = Object.entries(respostas).filter(([, v]) => String(v || "").trim()).map(([k, v]) => "- " + (PERGUNTAS[k] || k) + ": " + v).join("\n");
  const emFalta = Object.keys(PERGUNTAS).filter((k) => !String(respostas[k] || "").trim());
  const ficha = [
    "Nome: " + c.nome, "Etapa: " + c.etapa, c.tipo_negocio && "Tipo de negócio: " + c.tipo_negocio,
    [c.morada, c.codigo_postal, c.concelho, c.distrito].filter(Boolean).length && "Localização: " + [c.morada, c.codigo_postal, c.freguesia, c.concelho, c.distrito].filter(Boolean).join(", "),
    c.website && "Site: " + c.website, c.instagram && "Instagram: " + c.instagram, c.link_mapa && "Google Maps: " + c.link_mapa,
    c.escalao && "Escalão de preço: " + c.escalao, c.parceria && "Parceria: " + c.parceria, c.notas && "Notas: " + String(c.notas).slice(0, 600),
    s && "Compras: " + eur(s.total) + " no período, " + s.datas.length + " encomendas, última em " + s.ultima + (s.ritmo ? ", costuma encomendar a cada " + s.ritmo + " dias" : ""),
    s && s.produtos.size && "Produtos que compra: " + [...s.produtos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([d, q]) => d + " (" + q + ")").join(", "),
    (cont || []).length && "Últimos contactos:\n" + (cont || []).map((x: any) => "- " + String(x.criado_em).slice(0, 10) + " " + x.tipo + ": " + x.texto + (x.proximo_passo ? " → " + x.proximo_passo : "")).join("\n"),
  ].filter(Boolean).join("\n");
  return { c, mk, ficha, conhecido, emFalta };
}
// guarda as sugestões novas no perfil (só perguntas públicas ainda sem resposta), sem apagar as que lá estão
async function guardarSugestoes(clienteId: string, mk: any, sug: Record<string, any>, fontes: Fonte[]) {
  const resp = (mk?.respostas || {}) as Record<string, string>, atuais = { ...(mk?.sugestoes || {}) };
  let n = 0;
  for (const [k, v] of Object.entries(sug || {})) {
    const val = typeof v === "string" ? v : (v as any)?.v, fonte = typeof v === "object" ? (v as any)?.fonte : "";
    if (!PUBLICAS.includes(k) || !val || String(resp[k] || "").trim() || !fonte) continue;
    atuais[k] = { v: String(val).slice(0, 300), fonte: String(fonte).slice(0, 500) }; n++;
  }
  await admin.from("crm_mackay").upsert({ cliente_id: clienteId, respostas: resp, sugestoes: atuais, fontes: fontes.slice(0, 8), pesquisado_em: new Date().toISOString() });
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não suportado." }, 405);
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: sessao } = await admin.auth.getUser(token);
    if (!sessao?.user) return json({ erro: "A sessão expirou. Volta a entrar." }, 401);
    const sb = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: pode } = await sb.rpc("pode_crm");
    if (!pode) return json({ erro: "Só o Comercial e a direção têm acesso." }, 403);
    const corpo = await req.json().catch(() => ({}));
    const acao = String(corpo.acao || ""), dia = hojeLisboa();

    if (acao === "hoje") {
      let { data: lista } = await admin.from("crm_abordagens").select("*").eq("dia", dia).order("ordem");
      if (!lista?.length) {
        await gerar(dia);
        ({ data: lista } = await admin.from("crm_abordagens").select("*").eq("dia", dia).order("ordem"));
      }
      return json({ dia, lista: lista || [] });
    }

    if (acao === "preparar" || acao === "perfil") {
      const { data: u } = await admin.from("ia_uso").select("pedidos").eq("perfil_id", sessao.user.id).eq("mes", dia.slice(0, 7)).maybeSingle();
      const { data: cfg } = await admin.from("ia_config").select("ativo, limite_mensal").eq("id", 1).maybeSingle();
      if (cfg && !cfg.ativo) return json({ erro: "O assistente está desligado pela direção." }, 403);
      if (cfg && (u?.pedidos || 0) >= cfg.limite_mensal) return json({ erro: "Chegaste ao limite mensal de pedidos ao assistente." }, 429);
    }

    if (acao === "preparar") {
      const { data: a } = await admin.from("crm_abordagens").select("*").eq("id", String(corpo.id || "")).maybeSingle();
      if (!a) return json({ erro: "Sugestão não encontrada." }, 404);
      const { c, mk, ficha, conhecido, emFalta } = await contexto(a.cliente_id);
      const primeiro = a.tipo === "primeiro" || a.tipo === "lead";
      const g = primeiro ? await dadosGoogle(c) : { texto: "", imagens: [] as Imagem[], fonte: null };
      const pedido = primeiro ? `Prepara o PRIMEIRO contacto de venda da TwentySix com esta barbearia (ainda não é cliente e nunca foi contactada).
Primeiro analisa o negócio, depois escreve a mensagem de apresentação. O objetivo do primeiro contacto é apresentar a marca e conseguir uma conversa ou visita, não vender logo.

FICHA NO CRM
${ficha}
${g.texto ? "\nGOOGLE MAPS\n" + g.texto : ""}
${g.imagens.length ? "\nEm cima tens " + g.imagens.length + " fotos públicas da barbearia (Google Maps): conta as cadeiras de barbeiro que se veem e repara no estilo da loja e nos produtos à vista." : ""}

Pesquisa na web a barbearia «${c.nome}»${c.concelho ? " (" + c.concelho + ")" : ""}: site, página de marcações (Booksy, Fresha, Buk… mostram a equipa e os serviços), redes da loja e Google. Só informação pública do negócio.
Responde com este JSON:
{
 "analise": {
   "cadeiras": "número ou intervalo + como chegaste lá (fotos, equipa na página de marcações…) + certeza (alta, média, baixa); se não souberes, «não se sabe»",
   "barbeiros": "quantos e de onde vem a informação, ou «não se sabe»",
   "avaliacao": "nota e número de avaliações no Google, se houver",
   "perfil": "1 frase: estilo, posicionamento e preço",
   "necessidades": ["3 a 5 necessidades prováveis desta barbearia, ligadas ao que vimos"],
   "propor": ["2 a 4 coisas concretas da TwentySix a propor: produtos, consumíveis, cadeiras, formação 26 Academy ou condições PRO"]
 },
 "resumo": "2 ou 3 frases com o essencial para quem vai contactar",
 "abordagem": "3 a 5 linhas começadas por «- »: canal, melhor altura, pretexto e o que levar",
 "mensagem": "mensagem de apresentação para WhatsApp ou Instagram (máximo 550 caracteres), personalizada com o que encontraste, sem «você», sem links, assinada com [nome] · TwentySix",
 "descobrir": ["3 perguntas Mackay para a primeira conversa"],
 "sugestoes": { "id da pergunta": { "v": "resposta curta", "fonte": "URL" } }
}
Em «sugestoes» só entram perguntas destes ids: ${PUBLICAS.join(", ")}, e só com factos de fontes públicas (com URL).` : `Prepara a abordagem de hoje a este cliente da TwentySix, com o método Mackay 66.
Porquê hoje: ${a.motivo}

FICHA NO CRM
${ficha}

O QUE JÁ SABEMOS (perfil Mackay)
${conhecido || "(ainda nada)"}

PERGUNTAS MACKAY SEM RESPOSTA (id: pergunta)
${emFalta.map((k) => k + ": " + PERGUNTAS[k]).join("\n")}

Se puderes, pesquisa na web a barbearia «${c.nome}»${c.concelho ? " (" + c.concelho + ")" : ""} para conhecer o negócio (só informação pública da loja).
Responde com este JSON:
{
 "resumo": "2 a 4 frases: quem é, o que compra, o que sabemos de relevante",
 "abordagem": "3 a 5 linhas começadas por «- »: como abordar hoje, com que pretexto e que produto ou oferta faz sentido",
 "mensagem": "primeira mensagem curta para WhatsApp (máximo 450 caracteres), pessoal, sem «você», assinada por quem vai enviar com [nome]",
 "descobrir": ["3 perguntas Mackay a descobrir nesta conversa, escritas como perguntas naturais"],
 "sugestoes": { "id da pergunta": { "v": "resposta curta", "fonte": "URL" } }
}
Em «sugestoes» só entram perguntas sem resposta destes ids: ${PUBLICAS.join(", ")}, e só com factos encontrados em fontes públicas (com URL).`;
      const r = await pedirIA(SISTEMA, pedido, FORNECEDOR === "anthropic", g.imagens);
      if (g.fonte && !r.fontes.some((f) => f.url === g.fonte!.url)) r.fontes.unshift(g.fonte);
      const j = lerJson(r.texto);
      if (!j) throw new Error("A IA não devolveu uma resposta válida. Tenta outra vez.");
      const n = await guardarSugestoes(a.cliente_id, mk, j.sugestoes || {}, r.fontes);
      const { data: nova } = await admin.from("crm_abordagens").update({
        resumo: String(j.resumo || "").slice(0, 1500), abordagem: String(j.abordagem || "").slice(0, 2000), mensagem: String(j.mensagem || "").slice(0, 900),
        descobrir: (Array.isArray(j.descobrir) ? j.descobrir : []).slice(0, 5).map((x: unknown) => String(x).slice(0, 200)), fontes: r.fontes.slice(0, 8), preparada_em: new Date().toISOString(),
        analise: primeiro && j.analise && typeof j.analise === "object" ? {
          cadeiras: String(j.analise.cadeiras || "").slice(0, 300), barbeiros: String(j.analise.barbeiros || "").slice(0, 300), avaliacao: String(j.analise.avaliacao || "").slice(0, 120),
          perfil: String(j.analise.perfil || "").slice(0, 300), fotos: g.imagens.length,
          necessidades: (Array.isArray(j.analise.necessidades) ? j.analise.necessidades : []).slice(0, 6).map((x: unknown) => String(x).slice(0, 200)),
          propor: (Array.isArray(j.analise.propor) ? j.analise.propor : []).slice(0, 5).map((x: unknown) => String(x).slice(0, 200)),
        } : {},
      }).eq("id", a.id).select("*").single();
      await admin.rpc("ia_registar_uso", { p_perfil: sessao.user.id, p_mes: dia.slice(0, 7), p_in: r.tin, p_out: r.tout });
      return json({ abordagem: nova, sugestoes: n });
    }

    if (acao === "perfil") {
      const id = String(corpo.cliente_id || "");
      const { c, mk, ficha, emFalta } = await contexto(id);
      const faltam = emFalta.filter((k) => PUBLICAS.includes(k));
      if (!faltam.length) return json({ sugestoes: 0 });
      if (FORNECEDOR !== "anthropic") return json({ erro: "A pesquisa na web só funciona com o Claude (ANTHROPIC_API_KEY)." }, 400);
      const pedido = `Pesquisa na web informação PÚBLICA sobre a barbearia «${c.nome}»${c.concelho ? " (" + c.concelho + ")" : ""} para preencher o perfil Mackay 66.
FICHA NO CRM
${ficha}

Perguntas por responder (id: pergunta):
${faltam.map((k) => k + ": " + PERGUNTAS[k]).join("\n")}

Responde com {"sugestoes": { "id": { "v": "resposta curta", "fonte": "URL" } } } só com o que encontraste mesmo, cada um com a fonte. Se a barbearia não aparecer na web, responde {"sugestoes": {}}.`;
      const r = await pedirIA(SISTEMA, pedido, true);
      const j = lerJson(r.texto) || { sugestoes: {} };
      const n = await guardarSugestoes(id, mk, j.sugestoes || {}, r.fontes);
      await admin.rpc("ia_registar_uso", { p_perfil: sessao.user.id, p_mes: dia.slice(0, 7), p_in: r.tin, p_out: r.tout });
      return json({ sugestoes: n });
    }
    return json({ erro: "Ação desconhecida." }, 400);
  } catch (e) {
    return json({ erro: (e as Error)?.message || String(e) }, 500);
  }
});
