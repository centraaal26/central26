// Central 26 — Financeiro: faturação das barbearias e custos por mês, a partir das folhas mensais da Ondina & Maia.
// Só a direção vê. Os valores entram pela importação na app; a folha RH (vencimentos individuais) não é lida.
import { MES, MES_L, ymd, normalizar, haQuanto, eGestor } from "./dados.js";
import { carregarXlsx } from "./xlsx.js";

const n = (s) => normalizar(s).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const num = (v) => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && /^-?\d+([.,]\d+)?$/.test(v.trim()) ? +v.replace(",", ".") : 0);
const eur = (v, d = 0) => (Number(v) || 0).toLocaleString("pt-PT", { minimumFractionDigits: d, maximumFractionDigits: d }) + " €";
const pct = (v) => (v == null || !isFinite(v) ? "—" : (v * 100).toLocaleString("pt-PT", { maximumFractionDigits: 0 }) + "%");
const MESES_N = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeMes = (m) => { const [y, k] = m.split("-").map(Number); return MES_L[k - 1] + (y !== new Date().getFullYear() ? " " + y : ""); };
const curtoMes = (m) => MES[+m.split("-")[1] - 1];

// Espaços: nomes das folhas → nome a mostrar
const ESPACOS = { madalena: "Madalena", avenida: "Avenida", porto: "Porto", "sto ovidio": "Santo Ovídio", "st ovidio": "Santo Ovídio", "st ovi": "Santo Ovídio", "sto ovideo": "Santo Ovídio", "santo ovidio": "Santo Ovídio",
  arcozelo: "Arcozelo", matosinhos: "Matosinhos", "despesas gerais a todas as barbearias": "Todas as barbearias", "26academy": "26 Academy", "26 academy": "26 Academy", hairshop: "Hairshop", tech: "26 Tech" };
const espaco = (s) => ESPACOS[n(s)] || String(s || "").trim().replace(/\s+/g, " ").toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase());
// Rubricas: corrige gralhas das folhas para agrupar bem entre meses
const GRALHAS = [[/publicdade/g, "publicidade"], [/ajbcardoso/g, "ajb cardoso"], [/conetividade/g, "conectividade"], [/^100metros$/, "100 metros"]];
export const chaveRubrica = (s) => GRALHAS.reduce((t, [a, b]) => t.replace(a, b), n(s));
const SIGLAS = new Set(["meo", "nos", "edp", "ctt", "iva", "irs", "irc", "imi", "bcm", "cr2a", "cto", "miio", "bmw", "sgm", "wap", "hpcp", "hp", "ajb", "spa", "getnet", "nacex", "insia", "80k"]);
const PEQ = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "p", "para", "of"]);
// Nome a mostrar: a partir do texto original da folha (mantém os acentos), com as gralhas corrigidas
export function rotuloRubrica(chave, original) {
  const esp = { "agua": "Água", "aguas armazem": "Águas do armazém", "eletricidade armazem": "Eletricidade do armazém", armazem: "Armazém", "comissao conta": "Comissão de conta", "seguranca social": "Segurança Social",
    "condominio": "Condomínio", "comunicacoes": "Comunicações", "restauracao": "Restauração", "l oreal": "L'Oréal", "amen pt": "Amen.pt", "garantia mutua": "Garantia mútua", "emprestimo 80k": "Empréstimo 80K",
    "gestor de formacao": "Gestor de formação", "acessoria paula": "Assessoria (Paula)", "pagamento formador": "Pagamento a formador", "bizic eu pago": "Bizic (Eupago)", "avenca extrajudicial": "Avença extrajudicial" };
  if (esp[chave]) return esp[chave];
  const base = original ? String(original).trim().replace(/\s+/g, " ").replace(/publicdade/i, "Publicidade").replace(/ajbcardoso/i, "AJB Cardoso").replace(/conetividade/i, "Conectividade").toLowerCase() : chave;
  return base.split(" ").map((w, i) => (SIGLAS.has(n(w)) ? w.toUpperCase() : i && PEQ.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}
export const CATEGORIAS_FIN = ["Rendas e espaços", "Energia e água", "Telecomunicações", "Viaturas", "Banca e pagamentos", "Seguros", "Publicidade", "Compras e mercadoria", "Transportes e envios",
  "Software e serviços", "Formação", "Impostos e Segurança Social", "Refeições e deslocações", "Pessoas e avenças", "Outros"];
const AUTO = [
  ["Impostos e Segurança Social", /^(seguranca social|irs|irc|iva|imi|impostos)$/],
  ["Viaturas", /tesla|bmw|mazda|peugeot|via verde|prio/],
  ["Rendas e espaços", /^(armazem|renda|condominio|gaiurb)$/],
  ["Energia e água", /edp|eletricidade|agua|energia/],
  ["Telecomunicações", /^(meo|nos|vodafone|comunicacoes)$/],
  ["Banca e pagamentos", /santander|comissao conta|getnet|eupago|garantia mutua|emprestimo|confirming|bizic|credibom/],
  ["Seguros", /zurich|seguro|multirisco/],
  ["Publicidade", /publicidade/],
  ["Transportes e envios", /^(nacex|ctt)$/],
  ["Compras e mercadoria", /makro|extract beauty|gift of life|^prova$|santos beleza|pluriscosmetica|guibox|^prom$|eurostil|l oreal|instaan|eikon|cores do sal|^action$|ikea|worten|tedi|staples|maxmat|dstore|^hp$|hpcp/],
  ["Software e serviços", /amen pt|miio|multimac|bizay|cr2a|^cto$|spautores|avenca|^wap$/],
  ["Formação", /formador|formacao|formandos|insia|acessoria|inscricoes/],
  ["Refeições e deslocações", /restaura|supermercado|estadia|francesinhas|continente|mercadona/],
];
export const categoriaAuto = (chave, area) => (area === "impostos" ? "Impostos e Segurança Social" : area === "formacao" ? "Formação" : (AUTO.find(([, re]) => re.test(chave)) || ["Outros"])[0]);

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

// ---------- leitura de uma folha mensal ----------
export function lerLivro(XLSX, wb, ficheiro) {
  const folha = (re) => { const k = wb.SheetNames.find((s) => re.test(n(s))); return k ? XLSX.utils.sheet_to_json(wb.Sheets[k], { header: 1, raw: true, defval: null }) : null; };
  const txt = (v) => (typeof v === "string" ? v.trim() : "");
  const avisos = [];
  // mês: pelo nome do ficheiro
  const nf = n(ficheiro).replace(/ /g, "");
  let k = MESES_N.findIndex((m) => nf.includes(m) || (m === "marco" && /mar(c|_)?o/.test(nf)));
  if (k < 0 && /maro/.test(nf)) k = 2;
  const ano = (String(ficheiro).match(/[_\- ](\d{2})(?=[_.\- ]|$)/) || [])[1];
  const y = ano ? 2000 + +ano : new Date().getFullYear();
  const linhas = [];
  function blocos(rows, areaPadrao, areaDe, grupoDe) {
    if (!rows) return 0;
    let baseCol = null, grupo = "", area = areaPadrao, conta = 0;
    const temBase = (r) => (r || []).findIndex((v) => txt(v).toUpperCase() === "BASE");
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || [];
      const jb = temBase(r);
      if (jb >= 0) { baseCol = jb; continue; }
      const a = txt(r[0]); if (!a) continue;
      const vazia = r.slice(1).every((v) => v == null || v === "" || v === 0);
      const proxBase = [1, 2, 3].some((d) => temBase(rows[i + d]) >= 0);
      if (vazia && proxBase) { grupo = grupoDe(a); area = areaDe(a); continue; }
      if (n(a) === "impostos") { area = "impostos"; grupo = ""; baseCol = baseCol ?? 1; continue; }
      if (baseCol == null) continue;
      const base = num(r[baseCol]), iva = num(r[baseCol + 1]), sem = num(r[baseCol + 2]);
      if (!base && !iva && !sem) continue;
      linhas.push({ area, grupo, rubrica: a.replace(/\s+/g, " "), base: +base.toFixed(2), iva: +iva.toFixed(2), sem: +sem.toFixed(2) });
      conta++;
    }
    return conta;
  }
  const nBarb = blocos(folha(/^barb/), "barbearias", () => "barbearias", (a) => espaco(a));
  const nPart = blocos(folha(/partilhad/), "partilhadas", () => "partilhadas", () => "");
  const nHair = blocos(folha(/hairshop/), "hairshopping", (a) => (/tech/i.test(a) ? "tech" : "hairshopping"), (a) => (/compras/i.test(a) ? "Compras para revenda" : "Despesas gerais"));
  const nForm = blocos(folha(/formac/), "formacao", () => "formacao", () => "");
  // faturação por espaço
  const fat = [], fr = folha(/faturac/);
  const datas = {};
  if (fr) {
    const hi = fr.findIndex((r) => (r || []).some((v) => n(v) === "total vendas"));
    if (hi >= 0) {
      const h = fr[hi].map((v) => n(v)), col = (re) => h.findIndex((v) => re.test(v));
      const c = { total: col(/^total vendas$/), numerario: col(/^numerario$/), mb: col(/^mb$/), ft: col(/^ft$/), venc: col(/^vencimentos$/) };
      for (let i = hi + 1; i < Math.min(fr.length, hi + 24); i++) {
        const r = fr[i] || [], a = txt(r[0]); if (!a) continue;
        const v = { espaco: espaco(a), total: num(r[c.total]), numerario: num(r[c.numerario]), mb: num(r[c.mb]), ft: num(r[c.ft]), vencimentos: num(r[c.venc]) };
        if (v.total || v.numerario || v.mb || v.ft || v.vencimentos) fat.push(Object.fromEntries(Object.entries(v).map(([kk, x]) => [kk, typeof x === "number" ? +x.toFixed(2) : x])));
      }
    }
    for (const r of fr) for (const v of r || []) { const m = txt(v).match(/^(\d{2})\/(\d{2})$/); if (m && +m[1] <= 31) datas[+m[2]] = (datas[+m[2]] || 0) + 1; }
  }
  const mesDatas = Object.entries(datas).sort((a, b) => b[1] - a[1])[0];
  if (k < 0 && mesDatas) k = +mesDatas[0] - 1;
  const mes = k >= 0 ? y + "-" + String(k + 1).padStart(2, "0") : null;
  if (mes && mesDatas && +mesDatas[0] !== k + 1 && mesDatas[1] >= 5) avisos.push({ tipo: "datas", texto: "As datas diárias da folha Faturação são de " + MES_L[+mesDatas[0] - 1] + ", mas o ficheiro diz " + MES_L[k] + "." });
  // cabeçalhos com outro mês
  if (mes) {
    const errados = new Set();
    for (const [re, rot] of [[/partilhad/, "Despesas partilhadas"], [/formac/, "Formação"], [/hairshop/, "Hairshopping"]]) {
      const rows = folha(re); if (!rows) continue;
      for (const r of rows.slice(0, 4)) for (const v of r || []) { const j = MESES_N.indexOf(n(v).replace("marco", "marco")); if (j >= 0 && j !== k) errados.add(rot + " diz «" + MES_L[j] + "»"); }
    }
    if (errados.size) avisos.push({ tipo: "cabecalho", texto: "O cabeçalho não foi atualizado: " + [...errados].join(", ") + "." });
  }
  if (!nHair) avisos.push({ tipo: "vazio", texto: "A folha Hairshopping não tem compras nem despesas preenchidas (só as do Tech/rentings, se existirem)." });
  if (!nForm) avisos.push({ tipo: "vazio", texto: "A folha Formação está vazia." });
  if (!nBarb) avisos.push({ tipo: "vazio", texto: "A folha das barbearias (BARB) não tem custos." });
  if (!fat.length) avisos.push({ tipo: "vazio", texto: "A folha Faturação não tem totais de vendas." });
  else if (!fat.some((f) => f.vencimentos)) avisos.push({ tipo: "vazio", texto: "A folha Faturação não tem a coluna dos vencimentos (pagamentos aos barbeiros) preenchida." });
  const custos = linhas.map((l) => [l.area, l.grupo, chaveRubrica(l.rubrica), l.base, l.iva, l.sem].join("|")).sort().join("\n");
  const faturas = fat.map((f) => [f.espaco, f.total, f.numerario, f.mb, f.ft, f.vencimentos].join("|")).sort().join("\n");
  return { mes, ficheiro, linhas, faturacao: fat, avisos, assinatura: hash(custos + "#" + faturas), assinatura_custos: linhas.length ? hash(custos) : "", contagem: { nBarb, nPart, nHair, nForm } };
}

export const podeFinanceiro = (eu) => eGestor(eu);

export function criarFinanceiro(ctx) {
  const { S, api, esc, I, toast, falha, render, agendarRender, $ } = ctx;
  const F = (S.fin = { estado: "por-carregar", meses: [], linhas: [], faturacao: [], rubricas: {}, tab: "resumo", ano: null, mesSel: null, importacao: null, aImportar: false, q: "" });

  async function carregar() {
    if (F.estado === "a-carregar") return;
    F.estado = "a-carregar";
    try {
      if (!api.fin) throw new Error("A app foi atualizada a meio. Recarrega a página para terminar a atualização.");
      const d = await api.fin.carregar();
      F.meses = d.meses; F.linhas = d.linhas.map((l) => ({ ...l, base: +l.base, iva: +l.iva, sem: +l.sem, chave: chaveRubrica(l.rubrica) }));
      F.faturacao = d.faturacao.map((f) => ({ ...f, total: +f.total, numerario: +f.numerario, mb: +f.mb, ft: +f.ft, vencimentos: +f.vencimentos }));
      F.rubricas = Object.fromEntries(d.rubricas.map((r) => [r.chave, r.categoria]));
      F.estado = "pronto";
    } catch (e) { F.estado = /PGRST20|fin_meses|Could not find/i.test(String(e?.message)) ? "falta-script" : "erro"; F.erro = e.message; }
    agendarRender();
  }

  /* ---------- contas ---------- */
  const custo = (l) => l.base + l.sem;   // custo sem IVA (o IVA das faturas é dedutível)
  const mesesCom = () => F.meses.map((m) => m.mes);
  // meses cujos custos são iguais aos de outro mês anterior (cópia da folha)
  function copias() {
    const r = {};
    const ord = F.meses.slice().sort((a, b) => a.mes.localeCompare(b.mes));
    ord.forEach((m, i) => { if (!m.assinatura_custos) return; const o = ord.slice(0, i).find((x) => x.assinatura_custos === m.assinatura_custos); if (o) r[m.mes] = o.mes; });
    return r;
  }
  const categoria = (l) => F.rubricas[l.chave] || categoriaAuto(l.chave, l.area);
  function resumoMes(mes) {
    const L = F.linhas.filter((l) => l.mes === mes), Fa = F.faturacao.filter((f) => f.mes === mes);
    const barbFat = Fa.filter((f) => !["26 Academy", "Hairshop", "26 Tech"].includes(f.espaco));
    return {
      faturacao: barbFat.reduce((s, f) => s + f.total, 0), vencimentos: barbFat.reduce((s, f) => s + f.vencimentos, 0),
      custosBarb: L.filter((l) => l.area === "barbearias").reduce((s, l) => s + custo(l), 0),
      partilhadas: L.filter((l) => l.area === "partilhadas").reduce((s, l) => s + custo(l), 0),
      impostos: L.filter((l) => l.area === "impostos").reduce((s, l) => s + custo(l), 0),
      outras: L.filter((l) => ["hairshopping", "tech", "formacao"].includes(l.area)).reduce((s, l) => s + custo(l), 0),
      temFat: barbFat.length > 0, temCustos: L.length > 0,
    };
  }
  const anos = () => [...new Set(mesesCom().map((m) => m.slice(0, 4)))].sort();

  /* ============================== Vistas ============================== */
  function vista(param) {
    if (F.estado === "por-carregar") carregar();
    if (param !== F.ultimoParam) { F.ultimoParam = param; if (["resumo", "barbearias", "despesas", "importar"].includes(param)) F.tab = param; }
    let h = '<div class="cab"><div><div class="eyebrow neutro">Ondina &amp; Maia, Lda. · só a direção vê esta página</div><h1>Financeiro</h1><p class="sub-cab">Faturação das barbearias e custos de cada mês, a partir das folhas mensais.</p></div>' +
      (F.estado === "pronto" ? '<div class="acts"><button class="btn pri" data-acao="fin-tab" data-tab="importar">' + I.plus + "Importar folhas</button></div>" : "") + "</div>";
    const tabs = [["resumo", "Resumo"], ["barbearias", "Barbearias"], ["despesas", "Despesas"], ["importar", "Importar"]];
    h += '<div class="tabs" role="tablist">' + tabs.map(([k, r]) => '<button class="tab" role="tab" data-acao="fin-tab" data-tab="' + k + '" aria-selected="' + (F.tab === k) + '">' + r + "</button>").join("") + "</div>";
    if (F.estado === "falta-script") return h + '<div class="vazio"><h3>Falta instalar o Financeiro na base de dados</h3><p>No Supabase, abre o SQL Editor, cola o ficheiro <b>supabase/09-financeiro.sql</b> do GitHub e carrega em Run. Depois recarrega esta página.</p></div>';
    if (F.estado === "erro") return h + '<div class="aviso erro">Não foi possível abrir o Financeiro: ' + esc(F.erro || "") + "</div>";
    if (F.estado !== "pronto") return h + '<div class="tabela"><div class="esqueleto"><i style="width:50%"></i></div></div>';
    if (F.tab === "importar") return h + vistaImportar();
    if (!F.meses.length) return h + '<div class="vazio"><h3>Ainda não há meses importados</h3><p>Importa as folhas mensais da Ondina &amp; Maia (podes escolher vários ficheiros de uma vez). A app lê a faturação das barbearias e os custos, e assinala os meses em falta ou copiados.</p><div class="acts"><button class="btn pri" data-acao="fin-tab" data-tab="importar">Importar folhas</button></div></div>';
    if (!F.ano || !anos().includes(F.ano)) F.ano = anos()[anos().length - 1];
    if (F.tab === "barbearias") return h + vistaBarbearias();
    if (F.tab === "despesas") return h + vistaDespesas();
    return h + vistaResumo();
  }

  function cobertura() {
    const cp = copias(), hojeM = ymd(new Date()).slice(0, 7), y = F.ano;
    return Array.from({ length: 12 }, (_, i) => {
      const mes = y + "-" + String(i + 1).padStart(2, "0"), m = F.meses.find((x) => x.mes === mes);
      const estado = m ? (cp[mes] ? "copia" : (m.avisos || []).some((a) => a.tipo === "datas") ? "aviso" : "ok") : mes > hojeM ? "futuro" : mes === hojeM ? "curso" : "falta";
      return { mes, m, estado, copia: cp[mes] };
    });
  }
  const ROT_ESTADO = { ok: "Importado", copia: "Custos copiados", aviso: "A rever", falta: "Em falta", curso: "Mês em curso", futuro: "" };

  function vistaResumo() {
    const cob = cobertura(), cp = copias();
    let h = '<div class="barra"><div class="periodo"><b>' + esc(F.ano) + "</b><span>Cada mês mostra se a folha foi importada e se os valores parecem fiáveis.</span></div>" +
      (anos().length > 1 ? '<div class="ferr"><label class="sr" for="fin-ano">Ano</label><select id="fin-ano" class="sel">' + anos().map((a) => '<option' + (a === F.ano ? " selected" : "") + ">" + a + "</option>").join("") + "</select></div>" : "") + "</div>";
    h += '<div class="fin-meses" role="list">' + cob.map((c) => '<div class="fin-mes e-' + c.estado + '" role="listitem"><b>' + esc(MES[+c.mes.slice(5) - 1]) + "</b><small>" + esc(ROT_ESTADO[c.estado]) + (c.copia ? " de " + esc(curtoMes(c.copia)) : "") + "</small></div>").join("") + "</div>";
    const validos = cob.filter((c) => c.m).map((c) => ({ ...c, r: resumoMes(c.mes) }));
    const comFat = validos.filter((c) => c.r.temFat), comCustos = validos.filter((c) => c.r.temCustos && !cp[c.mes]);
    const media = (l, f) => (l.length ? l.reduce((s, c) => s + f(c.r), 0) / l.length : null);
    const kp = [["Faturação das barbearias", media(comFat, (r) => r.faturacao), comFat.length, "média por mês"], ["Pagamentos aos barbeiros", media(comFat.filter((c) => c.r.vencimentos), (r) => r.vencimentos), comFat.filter((c) => c.r.vencimentos).length, "média por mês"],
      ["Custos fixos das barbearias", media(comCustos, (r) => r.custosBarb), comCustos.length, "média por mês"], ["Despesas partilhadas", media(comCustos, (r) => r.partilhadas), comCustos.length, "média por mês"]];
    h += '<div class="kpis-mapa">' + kp.map(([r, v, k, s]) => '<div class="kpi"><span>' + r + "</span><b>" + (v == null ? "—" : eur(v)) + "</b><small>" + (k ? s + " · " + k + (k === 1 ? " mês" : " meses") : "sem meses válidos") + "</small></div>").join("") + "</div>";
    h += grafico(cob.map((c) => ({ ...c, r: c.m ? resumoMes(c.mes) : null })), cp);
    // avisos
    const av = [];
    for (const c of cob) {
      if (c.estado === "falta") av.push({ mes: c.mes, texto: "Falta a folha de " + MES_L[+c.mes.slice(5) - 1] + ".", grave: true });
      if (c.copia) av.push({ mes: c.mes, texto: "Os custos de " + MES_L[+c.mes.slice(5) - 1] + " são iguais aos de " + MES_L[+c.copia.slice(5) - 1] + ", ao cêntimo: a folha foi copiada e não foi atualizada. A faturação deste mês conta; os custos ficam de fora das médias.", grave: true });
      for (const a of c.m?.avisos || []) av.push({ mes: c.mes, texto: a.texto, grave: a.tipo === "datas" });
    }
    if (av.length) {
      const graves = av.filter((a) => a.grave), leves = av.filter((a) => !a.grave);
      h += '<section class="cartao-sec"><h3>O que é preciso corrigir nas folhas</h3><ul class="fin-avisos">' + graves.map((a) => '<li class="grave"><b>' + esc(nomeMes(a.mes)) + "</b> · " + esc(a.texto) + "</li>").join("") + "</ul>" +
        (leves.length ? '<details class="fin-leves"><summary>Mais ' + leves.length + " observações</summary><ul class=\"fin-avisos\">" + leves.map((a) => "<li><b>" + esc(nomeMes(a.mes)) + "</b> · " + esc(a.texto) + "</li>").join("") + "</ul></details>" : "") + "</section>";
    }
    return h;
  }

  function grafico(cob, cp) {
    const vals = cob.filter((c) => c.r).flatMap((c) => [c.r.faturacao, c.r.custosBarb + c.r.partilhadas + c.r.impostos + c.r.vencimentos]);
    const bruto = Math.max(1, ...vals), W = 760, H = 240, pad = { l: 56, r: 8, t: 12, b: 34 }, cw = (W - pad.l - pad.r) / 12, bw = Math.min(22, cw / 2 - 4);
    const ordem = Math.pow(10, Math.floor(Math.log10(bruto))), passo = ordem * (bruto / ordem > 5 ? 2 : bruto / ordem > 2 ? 1 : 0.5);
    const max = Math.ceil(bruto / passo) * passo;
    const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
    let g = "";
    for (let v = 0; v <= max; v += passo) g += '<line x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="gl"/><text x="' + (pad.l - 6) + '" y="' + (y(v) + 4) + '" class="gy">' + (v >= 1000 ? (v / 1000).toLocaleString("pt-PT") + " mil" : v) + "</text>";
    cob.forEach((c, i) => {
      const x0 = pad.l + i * cw + cw / 2;
      g += '<text x="' + x0 + '" y="' + (H - 14) + '" class="gx">' + esc(MES[i]) + "</text>";
      if (!c.r) { if (c.estado === "falta") g += '<text x="' + x0 + '" y="' + (H - 2) + '" class="gx falta">em falta</text>'; return; }
      const custos = c.r.custosBarb + c.r.partilhadas + c.r.impostos + c.r.vencimentos;
      if (c.r.temFat) g += '<rect class="b1" x="' + (x0 - bw - 1) + '" y="' + y(c.r.faturacao) + '" width="' + bw + '" height="' + (y(0) - y(c.r.faturacao)) + '" rx="3"><title>' + esc(MES_L[i] + " · faturação " + eur(c.r.faturacao)) + "</title></rect>";
      if (c.r.temCustos) g += '<rect class="b2' + (cp[c.mes] ? " copia" : "") + '" x="' + (x0 + 1) + '" y="' + y(custos) + '" width="' + bw + '" height="' + (y(0) - y(custos)) + '" rx="3"><title>' + esc(MES_L[i] + " · custos " + eur(custos) + (cp[c.mes] ? " (copiados de " + MES_L[+cp[c.mes].slice(5) - 1] + ")" : "")) + "</title></rect>";
      if (cp[c.mes]) g += '<text x="' + x0 + '" y="' + (H - 2) + '" class="gx falta">cópia</text>';
    });
    return '<section class="cartao-sec"><h3>Faturação e custos por mês</h3><div class="legenda-mapa"><span><i class="sw-fin b1"></i>Faturação das barbearias</span><span><i class="sw-fin b2"></i>Custos (barbearias, partilhadas, impostos e barbeiros)</span><span><i class="sw-fin b2 copia"></i>Custos copiados de outro mês</span></div>' +
      '<div class="fin-graf"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Faturação e custos por mês"><defs><pattern id="fin-tracado" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" class="tr-fundo"/><line x1="0" y1="0" x2="0" y2="6" class="tr-linha"/></pattern></defs>' + g + "</svg></div></section>";
  }

  function vistaBarbearias() {
    const cp = copias(), meses = mesesCom().filter((m) => m.startsWith(F.ano) && F.faturacao.some((f) => f.mes === m));
    if (!meses.length) return '<div class="vazio"><h3>Sem faturação em ' + esc(F.ano) + "</h3></div>";
    if (!F.mesSel || !meses.includes(F.mesSel)) F.mesSel = meses[meses.length - 1];
    const mes = F.mesSel, copia = cp[mes];
    let h = '<div class="barra"><div class="periodo"><b>' + esc(nomeMes(mes).replace(/^./, (x) => x.toUpperCase())) + "</b><span>Resultado = faturação − pagamentos aos barbeiros − custos fixos do espaço. Não inclui despesas partilhadas nem impostos. Valores sem IVA.</span></div>" +
      '<div class="ferr"><label class="sr" for="fin-mes">Mês</label><select id="fin-mes" class="sel">' + meses.map((m) => '<option value="' + m + '"' + (m === mes ? " selected" : "") + ">" + esc(nomeMes(m)) + "</option>").join("") + "</select></div></div>";
    if (copia) h += '<div class="aviso erro">Os custos deste mês são iguais aos de ' + esc(MES_L[+copia.slice(5) - 1]) + ": a coluna «Custos fixos» não é fiável até chegar a folha corrigida.</div>";
    const fat = F.faturacao.filter((f) => f.mes === mes), L = F.linhas.filter((l) => l.mes === mes && l.area === "barbearias");
    if (fat.length && !fat.some((f) => f.vencimentos)) h += '<div class="aviso erro">A folha deste mês não tem os pagamentos aos barbeiros: o resultado aparece mais alto do que o real.</div>';
    const espacos = [...new Set(fat.map((f) => f.espaco).concat(L.map((l) => l.grupo)))].filter((e) => e !== "Todas as barbearias");
    const linhas = espacos.map((e) => {
      const f = fat.find((x) => x.espaco === e) || { total: 0, numerario: 0, mb: 0, ft: 0, vencimentos: 0 };
      const cf = L.filter((l) => l.grupo === e).reduce((s, l) => s + custo(l), 0);
      return { e, f, cf, res: f.total - f.vencimentos - cf, rubs: L.filter((l) => l.grupo === e) };
    }).filter((x) => x.f.total || x.cf).sort((a, b) => b.f.total - a.f.total);
    const geral = L.filter((l) => l.grupo === "Todas as barbearias").reduce((s, l) => s + custo(l), 0);
    const t = linhas.reduce((s, x) => ({ total: s.total + x.f.total, num: s.num + x.f.numerario, mb: s.mb + x.f.mb, venc: s.venc + x.f.vencimentos, cf: s.cf + x.cf }), { total: 0, num: 0, mb: 0, venc: 0, cf: 0 });
    h += '<section class="cartao-sec"><div class="tabela-scroll"><table class="crm-tabela fin-tab"><thead><tr><th>Espaço</th><th class="n">Faturação</th><th class="n">Barbeiros</th><th class="n">Custos fixos</th><th class="n">Resultado</th><th class="n">Margem</th></tr></thead><tbody>' +
      linhas.map((x) => '<tr><td><details class="fin-det"><summary>' + esc(x.e) + "</summary>" + (x.rubs.length ? '<ul>' + x.rubs.map((l) => "<li>" + esc(rotuloRubrica(l.chave, l.rubrica)) + " <span class=\"mono\">" + eur(custo(l), 2) + "</span></li>").join("") + "</ul>" : '<small class="muted">Sem custos na folha.</small>') + "</details></td>" +
        '<td class="n">' + eur(x.f.total) + '</td><td class="n">' + (x.f.vencimentos ? eur(x.f.vencimentos) : "—") + '</td><td class="n' + (copia ? " duvida" : "") + '">' + eur(x.cf) + "</td>" +
        '<td class="n ' + (x.res < 0 ? "neg" : "") + '"><b>' + eur(x.res) + '</b></td><td class="n">' + (x.f.total ? pct(x.res / x.f.total) : "—") + "</td></tr>").join("") +
      '</tbody><tfoot><tr><td>Total</td><td class="n">' + eur(t.total) + '</td><td class="n">' + eur(t.venc) + '</td><td class="n">' + eur(t.cf) + '</td><td class="n"><b>' + eur(t.total - t.venc - t.cf) + '</b></td><td class="n">' + (t.total ? pct((t.total - t.venc - t.cf) / t.total) : "—") + "</td></tr>" +
      (geral ? '<tr class="sub"><td colspan="3">Despesas gerais a todas as barbearias (publicidade, terminais…)</td><td class="n">' + eur(geral) + '</td><td class="n"><b>' + eur(t.total - t.venc - t.cf - geral) + '</b></td><td class="n">' + (t.total ? pct((t.total - t.venc - t.cf - geral) / t.total) : "—") + "</td></tr>" : "") +
      "</tfoot></table></div></section>";
    // evolução
    const todosM = mesesCom().filter((m) => m.startsWith(F.ano) && F.faturacao.some((f) => f.mes === m));
    const esps = [...new Set(F.faturacao.filter((f) => f.mes.startsWith(F.ano)).map((f) => f.espaco))].filter((e) => F.faturacao.some((f) => f.espaco === e && f.total));
    h += '<section class="cartao-sec"><h3>Faturação por espaço e por mês</h3><div class="tabela-scroll"><table class="crm-tabela fin-tab"><thead><tr><th>Espaço</th>' + todosM.map((m) => '<th class="n">' + esc(curtoMes(m)) + "</th>").join("") + '<th class="n">Média</th></tr></thead><tbody>' +
      esps.map((e) => { const v = todosM.map((m) => F.faturacao.find((f) => f.mes === m && f.espaco === e)?.total || 0); const md = v.reduce((a, b) => a + b, 0) / (v.length || 1);
        return "<tr><td>" + esc(e) + "</td>" + v.map((x) => '<td class="n">' + (x ? eur(x) : "—") + "</td>").join("") + '<td class="n"><b>' + eur(md) + "</b></td></tr>"; }).join("") +
      '</tbody><tfoot><tr><td>Total</td>' + todosM.map((m) => '<td class="n">' + eur(F.faturacao.filter((f) => f.mes === m && esps.includes(f.espaco)).reduce((s, f) => s + f.total, 0)) + "</td>").join("") + "<td></td></tr></tfoot></table></div>" +
      (cobertura().some((c) => c.estado === "falta") ? '<p class="nota-tab">Os meses sem folha não aparecem nesta tabela.</p>' : "") + "</section>";
    return h;
  }

  function vistaDespesas() {
    const cp = copias(), meses = mesesCom().filter((m) => m.startsWith(F.ano));
    const L = F.linhas.filter((l) => l.mes.startsWith(F.ano) && l.area !== "barbearias");
    const q = n(F.q);
    const porChave = new Map();
    for (const l of L) { const k = l.area + "|" + l.chave; const x = porChave.get(k) || { chave: l.chave, area: l.area, rot: rotuloRubrica(l.chave, l.rubrica), cat: categoria(l), v: {} }; x.v[l.mes] = (x.v[l.mes] || 0) + custo(l); porChave.set(k, x); }
    let lista = [...porChave.values()];
    if (q) lista = lista.filter((x) => n(x.rot + " " + x.cat).includes(q));
    const validos = meses.filter((m) => !cp[m]);
    const media = (x) => { const v = validos.map((m) => x.v[m] || 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
    const cats = CATEGORIAS_FIN.filter((c) => lista.some((x) => x.cat === c));
    let h = '<div class="barra"><div class="periodo"><b>Despesas partilhadas, impostos, Hairshopping, Tech e Formação</b><span>Valores sem IVA. A média usa só os meses com custos fiáveis' + (Object.keys(cp).length ? " (sem " + Object.keys(cp).map((m) => MES[+m.slice(5) - 1]).join(", ") + ")" : "") + ". A categoria de cada rubrica pode ser mudada.</span></div>" +
      '<div class="ferr"><label class="pesq">' + I.lupa + '<span class="sr">Pesquisar</span><input id="fin-q" type="search" placeholder="Rubrica ou categoria…" value="' + esc(F.q) + '"></label></div></div>';
    h += '<section class="cartao-sec"><div class="tabela-scroll"><table class="crm-tabela fin-tab desp"><thead><tr><th>Rubrica</th><th>Categoria</th>' + meses.map((m) => '<th class="n' + (cp[m] ? " duvida" : "") + '"' + (cp[m] ? ' title="Custos iguais aos de ' + esc(MES_L[+cp[m].slice(5) - 1]) + '"' : "") + ">" + esc(curtoMes(m)) + (cp[m] ? " *" : "") + "</th>").join("") + '<th class="n">Média</th></tr></thead><tbody>';
    for (const c of cats) {
      const it = lista.filter((x) => x.cat === c).sort((a, b) => media(b) - media(a));
      h += '<tr class="grupo"><td colspan="2">' + esc(c) + "</td>" + meses.map((m) => '<td class="n">' + eur(it.reduce((s, x) => s + (x.v[m] || 0), 0)) + "</td>").join("") + '<td class="n">' + eur(it.reduce((s, x) => s + media(x), 0)) + "</td></tr>";
      h += it.map((x) => { const md = media(x);
        return "<tr><td>" + esc(x.rot) + (x.area !== "partilhadas" && x.area !== "impostos" ? ' <small class="muted">· ' + esc({ hairshopping: "Hairshopping", tech: "Tech", formacao: "Formação" }[x.area]) + "</small>" : "") + "</td>" +
          '<td><label class="sr" for="fin-cat-' + esc(x.area + "-" + x.chave) + '">Categoria</label><select class="sel mini" id="fin-cat-' + esc(x.area + "-" + x.chave) + '" data-rubrica="' + esc(x.chave) + '">' + CATEGORIAS_FIN.map((k) => "<option" + (k === x.cat ? " selected" : "") + ">" + esc(k) + "</option>").join("") + "</select></td>" +
          meses.map((m) => { const v = x.v[m] || 0, alto = md && v > md * 1.5 && v - md > 100 && !cp[m]; return '<td class="n' + (alto ? " alto" : "") + (cp[m] ? " duvida" : "") + '"' + (alto ? ' title="Muito acima da média"' : "") + ">" + (v ? eur(v) : "—") + "</td>"; }).join("") +
          '<td class="n"><b>' + eur(md) + "</b></td></tr>"; }).join("");
    }
    h += "</tbody></table></div>" + (Object.keys(cp).length ? '<p class="nota-tab">* Meses com custos iguais aos de outro mês (cópia da folha).</p>' : "") + '<p class="nota-tab">Valores muito acima da média aparecem destacados.</p></section>';
    return h;
  }

  /* ---------- Importar ---------- */
  function vistaImportar() {
    const imp = F.importacao;
    let h = '<section class="cartao-sec"><h3>Importar as folhas mensais</h3><p>Escolhe um ou vários ficheiros (por exemplo, «Ondina &amp; Maia - JULHO 26.xlsx»). O mês é lido do nome do ficheiro e confirmado pelas datas da folha Faturação.</p>' +
      "<p>Um mês que já existe é substituído pela versão nova. Ficheiros repetidos são ignorados. A folha RH, com os vencimentos de cada pessoa, não é lida: só entra o total pago aos barbeiros de cada espaço.</p>" +
      '<div class="acts"><label class="btn pri" for="fin-ficheiros">' + I.plus + 'Escolher ficheiros</label><input id="fin-ficheiros" type="file" accept=".xlsx,.xls" multiple hidden></div></section>';
    if (imp?.aLer) h += '<div class="aviso">A ler ' + imp.aLer + " ficheiros…</div>";
    if (imp?.lista) {
      const existentes = new Set(mesesCom());
      const cpBatch = {};
      const todos = F.meses.map((m) => ({ mes: m.mes, ac: m.assinatura_custos })).filter((m) => !imp.lista.some((x) => x.mes === m.mes)).concat(imp.lista.filter((x) => x.mes && !x.repetido).map((x) => ({ mes: x.mes, ac: x.assinatura_custos })));
      todos.sort((a, b) => a.mes.localeCompare(b.mes)).forEach((m, i, arr) => { const o = m.ac && arr.slice(0, i).find((x) => x.ac === m.ac); if (o) cpBatch[m.mes] = o.mes; });
      h += '<section class="cartao-sec"><h3>' + imp.lista.length + (imp.lista.length === 1 ? " ficheiro" : " ficheiros") + '</h3><div class="tabela-scroll"><table class="crm-tabela fin-tab"><thead><tr><th>Ficheiro</th><th>Mês</th><th class="n">Faturação</th><th class="n">Custos</th><th>Observações</th></tr></thead><tbody>' +
        imp.lista.map((x) => {
          const r = x.mes ? { fat: x.faturacao.filter((f) => !["26 Academy", "Hairshop", "26 Tech"].includes(f.espaco)).reduce((s, f) => s + f.total, 0), cus: x.linhas.reduce((s, l) => s + l.base + l.sem, 0) } : null;
          const obs = [];
          if (x.erro) obs.push('<span class="at">' + esc(x.erro) + "</span>");
          if (!x.mes && !x.erro) obs.push('<span class="at">Não consegui saber o mês: muda o nome do ficheiro para incluir o mês (ex.: «JULHO 26»).</span>');
          if (x.repetido) obs.push("Igual a «" + esc(x.repetido) + "»: ignorado.");
          if (x.mes && existentes.has(x.mes) && !x.repetido) obs.push("Já existe na app: vai ser substituído.");
          if (x.mes && cpBatch[x.mes] && !x.repetido) obs.push('<span class="at">Custos iguais aos de ' + esc(MES_L[+cpBatch[x.mes].slice(5) - 1]) + ".</span>");
          for (const a of x.avisos || []) if (a.tipo !== "vazio") obs.push(esc(a.texto));
          return "<tr" + (x.repetido || !x.mes ? ' class="recusada"' : "") + "><td>" + esc(x.ficheiro) + "</td><td>" + (x.mes ? esc(nomeMes(x.mes)) : "—") + '</td><td class="n">' + (r ? eur(r.fat) : "—") + '</td><td class="n">' + (r ? eur(r.cus) : "—") + "</td><td>" + (obs.join("<br>") || "Sem problemas") + "</td></tr>";
        }).join("") + "</tbody></table></div>" +
        '<div class="acts"><button class="btn pri" data-acao="fin-importar"' + (A_IMPORTAR() || !imp.lista.some((x) => x.mes && !x.repetido) ? " disabled" : "") + ">" + (F.aImportar ? "A importar…" : "Importar " + imp.lista.filter((x) => x.mes && !x.repetido).length + " meses") + '</button><button class="btn sec" data-acao="fin-imp-cancelar">Cancelar</button></div></section>';
    }
    if (F.meses.length) {
      h += '<section class="cartao-sec"><h3>Meses na app</h3><ul class="hist-aud">' + F.meses.slice().sort((a, b) => b.mes.localeCompare(a.mes)).map((m) => "<li><b>" + esc(nomeMes(m.mes)) + "</b> · " + esc(m.ficheiro) + ' <small class="muted">importado ' + esc(haQuanto(m.importado_em)) + '</small> <button class="c-link" data-acao="fin-apagar-mes" data-v="' + m.mes + '">retirar</button></li>').join("") + "</ul>" +
        (F.confirmarMes ? '<div class="aviso erro aviso-acao"><span>Retirar ' + esc(nomeMes(F.confirmarMes)) + " da app? Podes voltar a importar a folha depois.</span><span class=\"acts\"><button class=\"btn sec\" data-acao=\"fin-apagar-nao\">Manter</button><button class=\"btn perigo\" data-acao=\"fin-apagar-sim\">Retirar</button></span></div>" : "") + "</section>";
    }
    return h;
  }
  const A_IMPORTAR = () => F.aImportar;
  async function lerFicheiros(files) {
    F.importacao = { aLer: files.length }; render();
    try {
      const XLSX = await carregarXlsx(), lista = [];
      for (const f of files) {
        try { const wb = XLSX.read(await f.arrayBuffer(), { type: "array" }); lista.push(lerLivro(XLSX, wb, f.name)); }
        catch (e) { lista.push({ ficheiro: f.name, erro: "Não foi possível ler: " + (e.message || e), linhas: [], faturacao: [], avisos: [] }); }
      }
      // ficheiros repetidos (mesmo conteúdo) e dois ficheiros diferentes para o mesmo mês
      lista.forEach((x, i) => { const o = lista.slice(0, i).find((y) => y.mes && y.assinatura === x.assinatura && !y.repetido); if (o && x.mes) x.repetido = o.ficheiro; });
      lista.forEach((x, i) => { const o = lista.slice(0, i).find((y) => y.mes === x.mes && !y.repetido && !x.repetido && y !== x); if (o && x.mes) x.erro = "Há dois ficheiros diferentes para " + nomeMes(x.mes) + " («" + o.ficheiro + "» e este). Só o primeiro é importado."; if (o && x.mes) x.repetido = o.ficheiro; });
      lista.sort((a, b) => String(a.mes || "9").localeCompare(String(b.mes || "9")));
      F.importacao = { lista };
    } catch (e) { F.importacao = null; falha(e); }
    render();
  }
  async function importar() {
    const l = (F.importacao?.lista || []).filter((x) => x.mes && !x.repetido); if (!l.length) return;
    F.aImportar = true; render();
    try {
      await api.fin.importar({ meses: l.map((x) => ({ mes: x.mes, ficheiro: x.ficheiro, assinatura: x.assinatura, assinatura_custos: x.assinatura_custos, avisos: x.avisos, linhas: x.linhas, faturacao: x.faturacao })) });
      F.aImportar = false; F.importacao = null; F.estado = "por-carregar"; await carregar(); F.tab = "resumo"; F.ano = l[l.length - 1].mes.slice(0, 4);
      if (S.rota === "financeiro" && S.param) location.hash = "financeiro"; else render();
      toast(l.length === 1 ? "1 mês importado" : l.length + " meses importados");
    } catch (e) { F.aImportar = false; render(); falha(e); }
  }

  /* ============================== Ações ============================== */
  function clique(acao, el) {
    switch (acao) {
      case "fin-tab": F.tab = el.dataset.tab; if (S.rota === "financeiro" && S.param) location.hash = "financeiro"; else render(); return true;
      case "fin-importar": importar(); return true;
      case "fin-imp-cancelar": F.importacao = null; render(); return true;
      case "fin-apagar-mes": F.confirmarMes = el.dataset.v; render(); return true;
      case "fin-apagar-nao": F.confirmarMes = null; render(); return true;
      case "fin-apagar-sim": { const m = F.confirmarMes; F.confirmarMes = null; api.fin.apagarMes(m).then(async () => { F.estado = "por-carregar"; await carregar(); toast(nomeMes(m) + " retirado"); }).catch(falha); return true; }
    }
    return false;
  }
  function escrever(e) {
    const t = e.target;
    if (t.id === "fin-q") { F.q = t.value; const pos = t.selectionStart; render(); const x = $("#fin-q"); if (x) { x.focus(); x.setSelectionRange(pos, pos); } return true; }
    return false;
  }
  function mudar(e) {
    const t = e.target;
    if (t.id === "fin-ano") { F.ano = t.value; render(); return true; }
    if (t.id === "fin-mes") { F.mesSel = t.value; render(); return true; }
    if (t.id === "fin-ficheiros" && t.files?.length) { lerFicheiros([...t.files]); t.value = ""; return true; }
    if (t.dataset.rubrica) {
      const k = t.dataset.rubrica, v = t.value, antes = F.rubricas[k];
      F.rubricas[k] = v; render();
      api.fin.rubrica(k, v).then(() => toast("Categoria guardada")).catch((er) => { if (antes) F.rubricas[k] = antes; else delete F.rubricas[k]; render(); falha(er); });
      return true;
    }
    return false;
  }
  function reiniciar() { Object.assign(F, { estado: "por-carregar", meses: [], linhas: [], faturacao: [], rubricas: {}, importacao: null, tab: "resumo", mesSel: null }); }
  return { vista, clique, escrever, mudar, reiniciar, carregar };
}
