// Central 26 — ferramentas do Financeiro (só a direção): faltas de caixa, simulador de preços e comissões,
// previsão de tesouraria, desempenho dos barbeiros e resumo mensal para cada barbeiro.
import { MES, MES_L, ymd } from "./dados.js";

const eur = (v) => Math.round(Number(v) || 0).toLocaleString("pt-PT") + " €";
const eur2 = (v) => (Number(v) || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const pct = (v) => (v == null || !isFinite(v) ? "—" : Math.round(v * 100).toLocaleString("pt-PT") + "%");
const sinal = (v, f = eur) => (v > 0.5 ? "+" : v < -0.5 ? "−" : "") + f(Math.abs(v));
const dec = (v) => (v == null || v === "" ? "" : (Math.round(Number(v) * 100) / 100).toLocaleString("pt-PT", { maximumFractionDigits: 2, useGrouping: false }));
const lerNum = (s) => { const t = String(s ?? "").trim().replace(/\s|€|%/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."); return t === "" ? null : isFinite(+t) ? +t : NaN; };
const nomeM = (m) => MES_L[+m.slice(5) - 1] + " de " + m.slice(0, 4);
const Nome = (s) => s.replace(/^./, (x) => x.toUpperCase());
const PRECOS_PADRAO = { cabelo: 16, barba: 16, combo: 24, desconto: 0.5 };

export function criarFerramentas(ctx, F, u, R) {
  const { esc, toast, falha, render, api } = ctx;
  const { custo, copias, mesesCom } = u;
  const kpi = (r, v, s = "", cls = "") => '<div class="kpi"><span>' + esc(r) + '</span><b class="' + cls + '">' + v + "</b>" + (s ? "<small>" + s + "</small>" : "") + "</div>";
  const faltaScript23 = () => '<div class="vazio"><h3>Falta instalar esta parte na base de dados</h3><p>No Supabase, abre o SQL Editor, cola o ficheiro <b>supabase/23-caixa-simulador-previsao.sql</b> do GitHub e carrega em Run. Depois volta a importar as folhas mensais.</p></div>';
  const guardarConfig = (campos, msg) => {
    const antes = { ...(F.config || {}) }; F.config = { ...(F.config || {}), ...campos }; render();
    api.fin.configurar(campos).then(() => toast(msg)).catch((e) => { F.config = antes; render(); falha(e); });
  };
  const mesesBarb = () => [...new Set(F.barbeiros.map((b) => b.mes))].sort();

  /* ============================== 1. Faltas de caixa ============================== */
  function vistaCaixa() {
    if (!F.extra) return R.faltaScript();
    if (F.caixa == null) return faltaScript23();
    const p = R.periodo(), C = F.caixa.filter((c) => p.meses.includes(c.mes)), lim = Number(F.config?.caixa_limite ?? 50);
    let h = R.barra(p, "Faltas e sobras de caixa que o Samuel escreve na folha Faturação, ao lado de cada dia. As notas sem valor (por exemplo «RC CORTE A MAIS») aparecem na lista mas não somam.", false);
    const primeiro = F.caixa.map((c) => c.mes).sort()[0];
    if (!C.length) return h + '<div class="vazio"><h3>Sem faltas nem sobras neste período</h3><p>' + (primeiro ? "A primeira folha com faltas ou sobras escritas é a de " + esc(nomeM(primeiro)) + "." : "Ainda nenhuma folha importada tem faltas ou sobras escritas. Se já correste o script 23, volta a importar as folhas.") + "</p></div>";
    const fal = C.filter((c) => c.tipo === "falta"), sob = C.filter((c) => c.tipo === "sobra"), soma = (l) => l.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const lojas = [...new Set(C.map((c) => c.loja))].sort();
    const porLojaMes = (l, m) => soma(fal.filter((c) => c.loja === l && c.mes === m));
    const acima = lojas.flatMap((l) => p.meses.filter((m) => porLojaMes(l, m) > lim).map((m) => ({ l, m, v: porLojaMes(l, m) })));
    h += '<div class="kpis-mapa">' + kpi("Faltas", eur2(soma(fal)), fal.length + (fal.length === 1 ? " vez" : " vezes"), soma(fal) ? "neg" : "") + kpi("Sobras", eur2(soma(sob)), sob.length + (sob.length === 1 ? " vez" : " vezes")) +
      kpi("Diferença", sinal(soma(sob) - soma(fal), eur2), "sobras menos faltas", soma(sob) - soma(fal) < 0 ? "neg" : "") + kpi("Acima do limite", String(acima.length), "lojas e meses com faltas acima de " + eur(lim), acima.length ? "neg" : "") + "</div>";
    if (acima.length) h += '<div class="aviso erro"><span>Faltas acima do limite: ' + acima.map((a) => "<b>" + esc(a.l) + "</b> em " + esc(MES_L[+a.m.slice(5) - 1]) + " (" + eur2(a.v) + ")").join(" · ") + ".</span></div>";
    h += '<section class="cartao-sec"><h3>Por loja</h3><div class="tabela-scroll"><table class="crm-tabela fin-tab"><thead><tr><th>Loja</th><th class="n">Faltas</th><th class="n">Valor das faltas</th><th class="n">Sobras</th><th class="n">Valor das sobras</th><th class="n">Diferença</th><th class="n">Maior falta</th></tr></thead><tbody>' +
      lojas.map((l) => { const f = fal.filter((c) => c.loja === l), s = sob.filter((c) => c.loja === l), d = soma(s) - soma(f), mx = Math.max(0, ...f.map((c) => Number(c.valor) || 0));
        return "<tr><td><b>" + esc(l) + "</b>" + (acima.some((a) => a.l === l) ? ' <span class="cx-alerta">acima do limite</span>' : "") + '</td><td class="n">' + f.length + '</td><td class="n' + (soma(f) ? " neg" : "") + '">' + eur2(soma(f)) + '</td><td class="n">' + s.length + '</td><td class="n">' + eur2(soma(s)) + '</td><td class="n' + (d < 0 ? " neg" : "") + '">' + sinal(d, eur2) + '</td><td class="n">' + (mx ? eur2(mx) : "—") + "</td></tr>"; }).join("") + "</tbody></table></div>";
    h += '<div class="form-linha"><label for="cx-limite">Avisar quando as faltas de uma loja passam</label><span class="res-pesos-in"><input id="cx-limite" class="res-aj-in" inputmode="decimal" value="' + esc(dec(lim)) + '"> € num mês</span></div></section>';
    if (p.meses.length > 1) {
      const ms = p.meses.filter((m) => C.some((c) => c.mes === m));
      h += '<section class="cartao-sec"><h3>Faltas por mês</h3><div class="tabela-scroll"><table class="crm-tabela fin-tab"><thead><tr><th>Loja</th>' + ms.map((m) => '<th class="n">' + esc(MES[+m.slice(5) - 1]) + "</th>").join("") + "</tr></thead><tbody>" +
        lojas.map((l) => "<tr><td>" + esc(l) + "</td>" + ms.map((m) => { const v = porLojaMes(l, m); return '<td class="n' + (v > lim ? " neg" : "") + '">' + (v ? eur2(v) : "—") + "</td>"; }).join("") + "</tr>").join("") + "</tbody></table></div></section>";
    }
    const ord = C.slice().sort((a, b) => a.mes.localeCompare(b.mes) || (a.dia.slice(3) + a.dia.slice(0, 2)).localeCompare(b.dia.slice(3) + b.dia.slice(0, 2)) || a.loja.localeCompare(b.loja));
    const linhas = ord.map((c) => "<tr><td>" + esc(c.dia || "—") + (p.meses.length > 1 ? ' <small class="muted">' + esc(MES[+c.mes.slice(5) - 1]) + "</small>" : "") + "</td><td>" + esc(c.loja) + '</td><td><span class="cx-tipo t-' + c.tipo + '">' + ({ falta: "Falta", sobra: "Sobra", nota: "Nota" })[c.tipo] + '</span></td><td class="n">' + (c.valor != null ? eur2(c.valor) : "—") + '</td><td><small class="muted">' + esc(c.texto) + "</small></td></tr>").join("");
    h += '<section class="cartao-sec"><details' + (ord.length <= 15 ? " open" : "") + '><summary class="cx-sum">Todas as notas de caixa (' + ord.length + ')</summary><div class="tabela-scroll"><table class="crm-tabela fin-tab"><thead><tr><th>Dia</th><th>Loja</th><th>Tipo</th><th class="n">Valor</th><th>Na folha</th></tr></thead><tbody>' + linhas + "</tbody></table></div></details></section>";
    return h;
  }

  /* ============================== 2. Simulador de preços e comissões ============================== */
  const S0 = () => (F.sim ||= { base: "3", precos: null, perda: 0, ajusteCom: 0, pcs: {} });
  function baseSimulador() {
    const sim = S0(), todos = mesesBarb(), meses = sim.base === "1" ? todos.slice(-1) : todos.slice(-3);
    const ult = meses[meses.length - 1], pr = { ...PRECOS_PADRAO, ...(F.meses.find((m) => m.mes === ult)?.precos || {}) };
    const L = R.juntarBarbeiros(meses).map((x) => {
      const n = meses.length;
      return { k: x.loja + "|" + x.barbeiro, loja: x.loja, barbeiro: x.barbeiro, c: x.cabelos / n, b: x.barbas / n, k3: x.combos / n, real: x.valor_total / n, extras: x.extras / n,
        pc: x.liquido > 0 ? x.a_receber / x.liquido : 0, pago: x.total / n };
    });
    return { meses, pr, L };
  }
  function calc(b, P, d, perda, pc) {
    const q = 1 - perda, c = b.c * q, bb = b.b * q, k = b.k3 * q, serv = c + bb + k;
    const formula = b.c * P.cabelo + b.b * P.barba + b.k3 * P.combo, outro = (b.real0 ?? b.real) - (b.c * b.P0.cabelo + b.b * b.P0.barba + b.k3 * b.P0.combo);
    const valor = (c * P.cabelo + bb * P.barba + k * P.combo) + outro * q;
    const liq = valor - d * serv, com = Math.max(0, liq) * pc;
    return { serv, valor, com, pago: com + b.extras, emp: valor - com - b.extras, formula };
  }
  function vistaSimulador() {
    if (!F.extra) return R.faltaScript();
    const sim = S0(), base = baseSimulador();
    if (!base.L.length) return '<div class="vazio"><h3>Ainda não há barbeiros importados</h3><p>Volta a importar as folhas mensais no separador Importar: o simulador usa os serviços reais de cada barbeiro.</p></div>';
    const P0 = base.pr, P1 = { ...P0, ...(sim.precos || {}) }, d0 = P0.desconto, d1 = P1.desconto, perda = (sim.perda || 0) / 100;
    base.L.forEach((b) => (b.P0 = P0));
    const pcSim = (b) => (sim.pcs[b.k] != null ? sim.pcs[b.k] / 100 : Math.max(0, b.pc + (sim.ajusteCom || 0) / 100));
    const linhas = base.L.map((b) => ({ b, a: calc(b, P0, d0, 0, b.pc), s: calc(b, P1, d1, perda, pcSim(b)), s0: calc(b, P1, d1, 0, pcSim(b)) }));
    const tot = (k, campo) => linhas.reduce((s, x) => s + x[k][campo], 0);
    const A = { valor: tot("a", "valor"), pago: tot("a", "pago"), emp: tot("a", "emp"), serv: tot("a", "serv") }, Sx = { valor: tot("s", "valor"), pago: tot("s", "pago"), emp: tot("s", "emp"), serv: tot("s", "serv") };
    const vMenosC = linhas.reduce((s, x) => s + x.s0.valor - x.s0.com, 0), E = linhas.reduce((s, x) => s + x.b.extras, 0), emp0 = vMenosC - E;
    const nomeBase = base.meses.length === 1 ? nomeM(base.meses[0]) : "média de " + base.meses.map((m) => MES[+m.slice(5) - 1]).join(", ") + " de " + base.meses[base.meses.length - 1].slice(0, 4);
    let h = '<div class="barra"><div class="periodo"><b>Simulador de preços e comissões</b><span>Parte dos serviços reais de cada barbeiro (' + esc(nomeBase) + ") e mostra o efeito, por mês, de mudar preços, comissões ou o desconto por serviço. Nada do que mudares aqui é guardado.</span></div>" +
      '<div class="ferr"><label class="sr" for="sim-base">Base</label><select id="sim-base" class="sel"><option value="3"' + (sim.base !== "1" ? " selected" : "") + '>Média dos últimos 3 meses</option><option value="1"' + (sim.base === "1" ? " selected" : "") + ">Último mês</option></select>" +
      '<button class="btn sec" data-acao="sim-repor">Repor</button></div></div>';
    const campoP = (k, rot, suf = "€") => '<label>' + esc(rot) + '<span><input id="sim-' + k + '" inputmode="decimal" value="' + esc(dec(P1[k])) + '">' + suf + '</span><small class="muted">hoje ' + dec(P0[k]) + " " + suf + "</small></label>";
    h += '<section class="cartao-sec"><h3>O que queres testar</h3><div class="res-pesos sim-campos">' + campoP("cabelo", "Preço do corte") + campoP("barba", "Preço da barba") + campoP("combo", "Preço do combo") + campoP("desconto", "Desconto por serviço (IVA)") + "</div>" +
      '<div class="res-pesos sim-campos"><label>Serviços perdidos<span><input id="sim-perda" inputmode="decimal" value="' + esc(dec(sim.perda || 0)) + '">%</span><small class="muted">clientes que deixam de vir</small></label>' +
      '<label>Comissões de todos<span><input id="sim-ajuste" inputmode="decimal" value="' + esc(dec(sim.ajusteCom || 0)) + '">pontos</span><small class="muted">ex.: 5 = de 45% para 50%</small></label></div></section>';
    const delta = (a, s, inv = false) => { const d = s - a, cls = Math.abs(d) < 0.5 ? "" : (d > 0) !== inv ? "sim-mais" : "sim-menos"; return '<small class="' + cls + '">' + (Math.abs(d) < 0.5 ? "sem mudança" : sinal(d) + " por mês") + "</small>"; };
    h += '<div class="kpis-mapa sim-kpis">' +
      '<div class="kpi"><span>Faturação das barbearias</span><b>' + eur(Sx.valor) + "</b>" + delta(A.valor, Sx.valor) + "</div>" +
      '<div class="kpi"><span>Pago aos barbeiros</span><b>' + eur(Sx.pago) + "</b>" + delta(A.pago, Sx.pago, true) + "</div>" +
      '<div class="kpi"><span>Fica para a empresa</span><b>' + eur(Sx.emp) + "</b>" + delta(A.emp, Sx.emp) + "</div>" +
      '<div class="kpi"><span>Num ano</span><b class="' + (Sx.emp - A.emp < -0.5 ? "neg" : "") + '">' + sinal((Sx.emp - A.emp) * 12) + "</b><small>para a empresa</small></div></div>";
    // ponto de equilíbrio
    let eq = "";
    if (emp0 > A.emp + 0.5 && vMenosC > 0) { const q = 1 - (A.emp + E) / vMenosC; eq = "Com estes preços e comissões, podem perder-se até <b>" + pct(q) + " dos serviços</b> (cerca de " + Math.round(A.serv * q) + " por mês) e a empresa continua a ganhar o mesmo que hoje."; }
    else if (emp0 < A.emp - 0.5 && vMenosC > 0) { const q = (A.emp + E) / vMenosC - 1; eq = "Com estes preços e comissões, para a empresa ganhar o mesmo que hoje os serviços teriam de aumentar <b>" + pct(q) + "</b> (cerca de " + Math.round(A.serv * q) + " por mês)."; }
    if (eq) h += '<div class="aviso sim-eq"><span>' + eq + "</span></div>";
    const real = linhas.reduce((s, x) => s + x.b.real, 0);
    h += '<p class="nota-tab">Faturado real na base: ' + eur(real) + " por mês. A diferença para a fórmula (serviços × preço) vem de descontos e serviços com outro valor, e mantém-se na simulação.</p>";
    // por loja e por barbeiro
    const lojas = [...new Set(linhas.map((x) => x.b.loja))];
    h += '<section class="cartao-sec"><h3>Por barbeiro</h3><div class="tabela-scroll"><table class="crm-tabela fin-tab sim-tab"><thead><tr><th>Barbeiro</th><th class="n">Serviços</th><th class="n">Comissão</th><th class="n">Faturação</th><th class="n">Recebe</th><th class="n">Fica para a empresa</th></tr></thead><tbody>' +
      lojas.map((l) => { const ls = linhas.filter((x) => x.b.loja === l).sort((a, b) => b.a.valor - a.a.valor);
        return '<tr class="grupo"><td>' + esc(l) + '</td><td class="n">' + Math.round(ls.reduce((s, x) => s + x.s.serv, 0)) + '</td><td></td><td class="n">' + eur(ls.reduce((s, x) => s + x.s.valor, 0)) + '</td><td class="n">' + eur(ls.reduce((s, x) => s + x.s.pago, 0)) + '</td><td class="n">' + eur(ls.reduce((s, x) => s + x.s.emp, 0)) + "</td></tr>" +
          ls.map((x, i) => '<tr><td>' + esc(x.b.barbeiro) + '</td><td class="n">' + Math.round(x.s.serv) + '</td><td class="n"><label class="sr" for="sim-pc-' + esc(l) + i + '">Comissão de ' + esc(x.b.barbeiro) + '</label><input class="res-aj-in sim-pc" id="sim-pc-' + esc(l) + i + '" data-sim-pc="' + esc(x.b.k) + '" inputmode="decimal" value="' + esc(dec(Math.round(pcSim(x.b) * 1000) / 10)) + '">%<small class="res-serv">hoje ' + dec(Math.round(x.b.pc * 1000) / 10) + "%</small></td>" +
            '<td class="n">' + eur(x.s.valor) + '<small class="res-serv">' + sinal(x.s.valor - x.a.valor) + '</small></td><td class="n">' + eur(x.s.pago) + '<small class="res-serv">' + sinal(x.s.pago - x.a.pago) + '</small></td><td class="n"><b>' + eur(x.s.emp) + '</b><small class="res-serv ' + (x.s.emp - x.a.emp < -0.5 ? "sim-menos" : x.s.emp - x.a.emp > 0.5 ? "sim-mais" : "") + '">' + sinal(x.s.emp - x.a.emp) + "</small></td></tr>").join(""); }).join("") +
      "</tbody></table></div><p class=\"nota-tab\">A comissão de hoje é a que a folha aplicou de facto (comissão ÷ valor depois do desconto por serviço). Os extras de cada barbeiro mantêm-se.</p></section>";
    return h;
  }

  /* ============================== 3. Previsão de tesouraria ============================== */
  const T0 = () => ({ saldo: null, minimo: 0, ajuste: 0, prazos: true, ...(F.config?.tesouraria || {}) });
  function ocorrencias(pz, ini, fim) {
    const passo = { mensal: 1, trimestral: 3, semestral: 6, anual: 12, bienal: 24 }[pz.repetir] || 0, out = [];
    let d = new Date(pz.data + "T12:00:00");
    for (let i = 0; i < 400 && d <= fim; i++) { if (d >= ini) out.push(ymd(d)); if (!passo) break; d = new Date(d.getFullYear(), d.getMonth() + passo, d.getDate(), 12); }
    return out;
  }
  function vistaPrevisao() {
    if (!F.extra) return R.faltaScript();
    const t = T0(), cp = copias();
    const comFolha = mesesCom().filter((m) => !cp[m] && F.faturacao.some((f) => f.mes === m)).sort(), base = comFolha.slice(-3);
    let h = '<div class="barra"><div class="periodo"><b>Previsão de tesouraria</b><span>Quanto entra e sai por mês, pela média dos últimos meses importados, mais os prazos com valor (seguros, inspeções…). É uma estimativa: serve para ver com antecedência um mês apertado.</span></div></div>';
    if (!base.length) return h + '<div class="vazio"><h3>Ainda não há meses suficientes</h3><p>Importa as folhas mensais para a previsão ter uma base.</p></div>';
    const n = base.length, media = (f) => base.reduce((s, m) => s + f(m), 0) / n;
    const fatB = (m) => F.faturacao.filter((f) => f.mes === m && !R.NAO_LOJA.has(f.espaco)).reduce((s, f) => s + f.total, 0);
    const vendas = (m, tech) => F.vendas.filter((v) => v.mes === m && (v.linha === "tech") === tech).reduce((s, v) => s + Number(v.valor), 0) * 1.23;
    const barb = (m) => { const B = F.barbeiros.filter((b) => b.mes === m); return B.length ? B.reduce((s, b) => s + Number(b.total), 0) : F.faturacao.filter((f) => f.mes === m && !R.NAO_LOJA.has(f.espaco)).reduce((s, f) => s + f.vencimentos, 0); };
    const resp = (m) => F.responsaveis.filter((r) => r.mes === m).reduce((s, r) => s + Number(r.valor), 0), pess = (m) => F.pessoal.filter((x) => x.mes === m).reduce((s, x) => s + Number(x.valor), 0);
    const desp = (m, area) => F.linhas.filter((l) => l.mes === m && (!area || l.area === area)).reduce((s, l) => s + l.base + l.iva + l.sem, 0);
    const ent = { barbearias: media(fatB), produtos: media((m) => vendas(m, false)), tech: media((m) => vendas(m, true)), academia: media((m) => R.receitaAcademia(m)) };
    const sai = { barbeiros: media(barb) + media(resp), pessoal: media(pess), despesas: media((m) => desp(m)) };
    const AREAS_D = [["barbearias", "Barbearias (rendas, energia…)"], ["partilhadas", "Despesas partilhadas"], ["impostos", "Impostos, IVA e contribuições"], ["hairshopping", "Hairshopping (compras)"], ["formacao", "Formação"], ["tech", "26 Tech"]];
    const aj = 1 + (Number(t.ajuste) || 0) / 100;
    // meses da previsão: o resto deste mês e os 3 seguintes
    const hoje = new Date(), meses = [];
    for (let i = 0; i < 4; i++) { const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1); meses.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")); }
    const fimHorizonte = new Date(hoje.getFullYear(), hoje.getMonth() + 4, 0, 23);
    const prazosN = (F.prazos || []).flatMap((pz) => ocorrencias(pz, new Date(ymd(hoje) + "T00:00:00"), fimHorizonte).map((d) => ({ titulo: pz.titulo, data: d, valor: Number(pz.valor) })));
    let saldo = t.saldo == null || t.saldo === "" ? null : Number(t.saldo);
    const L = meses.map((m, i) => {
      const dias = new Date(+m.slice(0, 4), +m.slice(5), 0).getDate(), frac = i === 0 ? (dias - hoje.getDate() + 1) / dias : 1;
      const acad = R.receitaAcademia(m) || ent.academia;
      const e = (ent.barbearias + ent.produtos + ent.tech) * frac * aj + acad * (i === 0 ? frac : 1);
      const s = (sai.barbeiros + sai.pessoal + sai.despesas) * frac, pz = t.prazos ? prazosN.filter((x) => x.data.slice(0, 7) === m).reduce((a, x) => a + x.valor, 0) : 0;
      if (saldo != null) saldo += e - s - pz;
      return { m, frac, e, s, pz, saldo };
    });
    const min = Number(t.minimo) || 0, ultimo = L[L.length - 1];
    h += '<section class="cartao-sec"><h3>Os teus números</h3><div class="res-pesos tes-campos">' +
      '<label>Saldo hoje (bancos e caixa)<span><input id="tes-saldo" inputmode="decimal" placeholder="Ex.: 15000" value="' + esc(t.saldo == null ? "" : dec(t.saldo)) + '">€</span></label>' +
      '<label>Mínimo de segurança<span><input id="tes-minimo" inputmode="decimal" value="' + esc(dec(min)) + '">€</span><small class="muted">avisa abaixo deste valor</small></label>' +
      '<label>Ajuste das entradas<span><input id="tes-ajuste" inputmode="decimal" value="' + esc(dec(t.ajuste || 0)) + '">%</span><small class="muted">ex.: −10 para ser prudente</small></label>' +
      '<label class="tes-chk" for="tes-prazos">Prazos<span><input type="checkbox" id="tes-prazos"' + (t.prazos ? " checked" : "") + '> contar os que têm valor</span><small class="muted">seguros, inspeções, IUC…</small></label></div></section>';
    if (saldo == null) h += '<div class="aviso">Escreve o saldo de hoje para ver o saldo previsto em cada mês. Entretanto, vês quanto entra e sai.</div>';
    else {
      const mau = L.find((x) => x.saldo < min);
      h += '<div class="kpis-mapa">' + kpi("Saldo hoje", eur(t.saldo)) + kpi("Entra por mês", eur((ent.barbearias + ent.produtos + ent.tech) * aj + ent.academia), "média") + kpi("Sai por mês", eur(sai.barbeiros + sai.pessoal + sai.despesas), "média, sem os prazos") +
        kpi("Saldo em " + MES_L[+ultimo.m.slice(5) - 1], eur(ultimo.saldo), "previsto", ultimo.saldo < min ? "neg" : "") + "</div>";
      if (mau) h += '<div class="aviso erro"><span>Em <b>' + esc(nomeM(mau.m)) + "</b> o saldo previsto fica em " + eur(mau.saldo) + (min ? ", abaixo do mínimo de " + eur(min) : "") + ". Vale a pena antecipar recebimentos ou adiar pagamentos.</span></div>";
    }
    const maxAbs = Math.max(1, ...L.map((x) => Math.abs(x.saldo ?? 0)), min);
    h += '<section class="cartao-sec"><h3>Mês a mês</h3><div class="tabela-scroll"><table class="crm-tabela fin-tab tes-tab"><thead><tr><th>Mês</th><th class="n">Entradas</th><th class="n">Saídas</th><th class="n">Prazos</th><th class="n">Saldo no fim do mês</th><th class="tes-bar-h"></th></tr></thead><tbody>' +
      L.map((x) => "<tr" + (x.saldo != null && x.saldo < min ? ' class="tes-mau"' : "") + "><td><b>" + esc(Nome(MES_L[+x.m.slice(5) - 1])) + "</b>" + (x.frac < 1 ? '<small class="res-serv">resto do mês</small>' : "") + '</td><td class="n">' + eur(x.e) + '</td><td class="n">' + eur(x.s) + '</td><td class="n">' + (x.pz ? eur(x.pz) : "—") +
        '</td><td class="n' + (x.saldo != null && x.saldo < 0 ? " neg" : "") + '"><b>' + (x.saldo == null ? "—" : eur(x.saldo)) + '</b></td><td class="tes-bar-c">' + (x.saldo == null ? "" : '<i class="tes-bar' + (x.saldo < min ? " baixo" : "") + '" style="--p:' + Math.max(0, x.saldo) / maxAbs + '"></i>') + "</td></tr>").join("") + "</tbody></table></div></section>";
    // de onde vêm os números
    h += '<section class="cartao-sec"><h3>De onde vêm os números</h3><p class="nota-tab">Média de ' + base.map((m) => esc(MES_L[+m.slice(5) - 1])).join(", ") + " (meses com folha e sem custos copiados). As vendas do Multixop contam com IVA, porque é o que entra no banco. As despesas contam com IVA e incluem prestações e impostos pagos.</p>" +
      '<div class="duas"><div><h4 class="tes-h4">Entradas por mês</h4><table class="crm-tabela fin-tab tes-mini"><tbody>' +
      [["Barbearias", ent.barbearias * aj], ["Produtos (Multixop, com IVA)", ent.produtos * aj], ["26 Tech (Multixop, com IVA)", ent.tech * aj], ["Academia", ent.academia]].filter(([, v]) => v > 0.5).map(([r, v]) => "<tr><td>" + esc(r) + '</td><td class="n">' + eur(v) + "</td></tr>").join("") + "</tbody></table></div>" +
      '<div><h4 class="tes-h4">Saídas por mês</h4><table class="crm-tabela fin-tab tes-mini"><tbody><tr><td>Barbeiros e responsáveis</td><td class="n">' + eur(sai.barbeiros) + '</td></tr><tr><td>Outro pessoal</td><td class="n">' + eur(sai.pessoal) + "</td></tr>" +
      AREAS_D.map(([a, r]) => [r, media((m) => desp(m, a))]).filter(([, v]) => v > 0.5).map(([r, v]) => "<tr><td>" + esc(r) + '</td><td class="n">' + eur(v) + "</td></tr>").join("") + "</tbody></table></div></div>" +
      (t.prazos && prazosN.length ? '<h4 class="tes-h4">Prazos que contam</h4><ul class="tes-prazos">' + prazosN.sort((a, b) => a.data.localeCompare(b.data)).map((x) => "<li><b>" + esc(x.data.slice(8) + "/" + x.data.slice(5, 7)) + "</b> " + esc(x.titulo) + ' <span class="mono">' + eur(x.valor) + "</span></li>").join("") + "</ul>" : "") +
      '<p class="nota-tab">Os prazos podem já estar, em parte, na média das despesas (um seguro pago num dos meses da base). Desliga «Contar os prazos» se achares que estão a contar duas vezes.</p></section>';
    return h;
  }

  /* ============================== 4 e 5. Desempenho e resumos (separador Barbeiros) ============================== */
  function spark(vals) {
    const v = vals.map((x) => x ?? 0), max = Math.max(1, ...v), W = 72, H = 22;
    const pts = v.map((x, i) => (v.length === 1 ? W / 2 : (i * W) / (v.length - 1)).toFixed(1) + "," + (H - 2 - (x / max) * (H - 4)).toFixed(1)).join(" ");
    return '<svg class="spark" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true"><polyline points="' + pts + '"/></svg>';
  }
  function desempenho(p) {
    const ref = p.meses[p.meses.length - 1], todos = mesesBarb(), ant = todos.filter((m) => m < ref).slice(-3), ult6 = todos.filter((m) => m <= ref).slice(-6);
    const doMes = (m) => F.barbeiros.filter((b) => b.mes === m);
    const L = doMes(ref).map((b) => {
      const serv = b.cabelos + b.barbas + b.combos, k = b.loja + "|" + b.barbeiro;
      const prev = ant.map((m) => doMes(m).find((x) => x.loja + "|" + x.barbeiro === k)).filter(Boolean);
      const mServ = prev.length ? prev.reduce((s, x) => s + x.cabelos + x.barbas + x.combos, 0) / prev.length : null, mVal = prev.length ? prev.reduce((s, x) => s + x.valor_total, 0) / prev.length : null;
      return { b, k, serv, ticket: serv ? b.valor_total / serv : 0, dServ: mServ ? serv / mServ - 1 : null, dVal: mVal ? b.valor_total / mVal - 1 : null, serie: ult6.map((m) => doMes(m).find((x) => x.loja + "|" + x.barbeiro === k)?.valor_total ?? null) };
    }).filter((x) => x.serv > 0).sort((a, b) => b.b.valor_total - a.b.valor_total);
    if (!L.length) return "";
    const top = (f, cmp) => L.filter((x) => f(x) != null).sort(cmp)[0];
    const maisS = top((x) => x.serv, (a, b) => b.serv - a.serv), maisT = top((x) => x.ticket, (a, b) => b.ticket - a.ticket), sobe = top((x) => x.dVal, (a, b) => b.dVal - a.dVal), desce = top((x) => x.dVal, (a, b) => a.dVal - b.dVal);
    const card = (r, x, v) => (x ? '<div class="kpi"><span>' + esc(r) + "</span><b>" + esc(x.b.barbeiro) + "</b><small>" + esc(x.b.loja) + " · " + v + "</small></div>" : "");
    const quedas = L.filter((x) => x.dVal != null && x.dVal <= -0.15);
    let h = '<section class="cartao-sec"><h3>Desempenho em ' + esc(MES_L[+ref.slice(5) - 1]) + (ant.length ? ' <small class="muted">· comparado com a média de ' + ant.map((m) => MES[+m.slice(5) - 1]).join(", ") + "</small>" : "") + "</h3>" +
      '<div class="kpis-mapa des-cards">' + card("Mais serviços", maisS, maisS.serv + " serviços") + card("Maior valor por serviço", maisT, eur2(maisT.ticket)) +
      (sobe && sobe.dVal > 0.005 ? card("Maior subida", sobe, "+" + pct(sobe.dVal) + " no faturado") : "") + (desce && desce.dVal < -0.005 ? card("Maior descida", desce, "−" + pct(-desce.dVal) + " no faturado") : "") + "</div>" +
      (quedas.length ? '<div class="aviso"><span>A faturar bem menos do que nos meses anteriores (15% ou mais): ' + quedas.map((x) => "<b>" + esc(x.b.barbeiro) + "</b> (" + esc(x.b.loja) + ", −" + pct(-x.dVal) + ")").join(", ") + ". Pode ser férias, doença ou falta de clientes: vale a pena perceber.</span></div>" : "") +
      '<div class="tabela-scroll"><table class="crm-tabela fin-tab des-tab"><thead><tr><th>Barbeiro</th><th class="n">Serviços</th><th class="n">Valor por serviço</th><th>Cabelo · barba · combo</th><th class="n">Faturado</th><th class="n">Face à média</th><th>Últimos meses</th></tr></thead><tbody>' +
      L.map((x) => { const c = x.b.cabelos / x.serv, br = x.b.barbas / x.serv, cb = x.b.combos / x.serv, d = x.dVal;
        return "<tr><td><b>" + esc(x.b.barbeiro) + '</b><small class="res-serv">' + esc(x.b.loja) + '</small></td><td class="n">' + Math.round(x.serv) + (x.dServ != null ? '<small class="res-serv">' + (x.dServ >= 0 ? "+" : "−") + pct(Math.abs(x.dServ)) + "</small>" : "") + '</td><td class="n">' + eur2(x.ticket) + "</td>" +
          '<td><span class="mix" title="' + esc(pct(c) + " cabelo · " + pct(br) + " barba · " + pct(cb) + " combo") + '"><i class="m-c" style="--p:' + c + '"></i><i class="m-b" style="--p:' + br + '"></i><i class="m-k" style="--p:' + cb + '"></i></span><small class="res-serv">' + pct(c) + " · " + pct(br) + " · " + pct(cb) + "</small></td>" +
          '<td class="n">' + eur(x.b.valor_total) + '</td><td class="n ' + (d == null ? "" : d <= -0.15 ? "neg" : d >= 0.15 ? "pos" : "") + '">' + (d == null ? "—" : (d >= 0 ? "↑ " : "↓ ") + pct(Math.abs(d))) + "</td><td>" + spark(x.serie) + "</td></tr>"; }).join("") +
      '</tbody></table></div><p class="nota-tab">Na barra: <i class="m-c lg"></i> cabelo · <i class="m-b lg"></i> barba · <i class="m-k lg"></i> combo. «Face à média» compara o faturado deste mês com a média dos meses anteriores (até 3).</p></section>';
    return h;
  }
  const textoResumo = (b) => {
    const serv = b.cabelos + b.barbas + b.combos;
    return "Olá " + b.barbeiro.split(" ")[0] + ", segue o resumo de " + nomeM(b.mes) + " (" + b.loja + "):\n" +
      "• Serviços: " + Math.round(serv) + " (" + Math.round(b.cabelos) + " cortes, " + Math.round(b.barbas) + " barbas, " + Math.round(b.combos) + " combos)\n" +
      "• Faturado: " + eur2(b.valor_total) + "\n" + "• Valor para a comissão (depois do desconto por serviço): " + eur2(b.liquido) + "\n" +
      "• Comissão (" + dec(Math.round(b.comissao * 1000) / 10) + "%): " + eur2(b.a_receber) + "\n" + (b.extras > 0.009 ? "• Extras" + (b.nota ? " (" + b.nota + ")" : "") + ": " + eur2(b.extras) + "\n" : "") +
      "• Total a receber: " + eur2(b.total) + "\n\nQualquer dúvida, fala connosco. Obrigado pelo trabalho deste mês!\nGrupo 26";
  };
  function resumos(p) {
    if (p.meses.length !== 1) return '<section class="cartao-sec"><h3>Resumos para os barbeiros</h3><p class="nota-tab">Escolhe um mês (em vez do ano inteiro) para preparar o resumo de cada barbeiro.</p></section>';
    const B = F.barbeiros.filter((b) => b.mes === p.meses[0]).sort((a, b) => a.loja.localeCompare(b.loja) || a.barbeiro.localeCompare(b.barbeiro));
    if (!B.length) return "";
    return '<section class="cartao-sec"><h3>Resumos para os barbeiros</h3><p class="nota-tab">Um resumo por barbeiro com os serviços, a comissão, os extras e o total a receber. Copia o texto para enviar por WhatsApp ou imprime todos (ou guarda em PDF), um por página.</p>' +
      '<div class="acts"><button class="btn pri" data-acao="fer-resumos-pdf">Imprimir ou guardar em PDF</button></div><ul class="res-lista">' +
      B.map((b) => "<li><span><b>" + esc(b.barbeiro) + '</b> <small class="muted">' + esc(b.loja) + " · " + eur2(b.total) + '</small></span><button class="btn sec mini" data-acao="fer-resumo-copiar" data-k="' + esc(b.mes + "|" + b.loja + "|" + b.barbeiro) + '">Copiar texto</button></li>').join("") + "</ul></section>";
  }
  function imprimirResumos() {
    const p = R.periodo(); if (p.meses.length !== 1) return;
    const B = F.barbeiros.filter((b) => b.mes === p.meses[0]).sort((a, b) => a.loja.localeCompare(b.loja) || a.barbeiro.localeCompare(b.barbeiro));
    const e = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const pag = (b) => '<section class="pg"><header><b>Grupo 26</b><span>Resumo de ' + e(nomeM(b.mes)) + "</span></header><h1>" + e(b.barbeiro) + "</h1><p class=\"loja\">" + e(b.loja) + "</p><table>" +
      [["Cortes", Math.round(b.cabelos)], ["Barbas", Math.round(b.barbas)], ["Combos", Math.round(b.combos)], ["Serviços", Math.round(b.cabelos + b.barbas + b.combos)], ["Faturado", eur2(b.valor_total)], ["Valor para a comissão", eur2(b.liquido)],
        ["Comissão (" + dec(Math.round(b.comissao * 1000) / 10) + "%)", eur2(b.a_receber)]].concat(b.extras > 0.009 ? [["Extras" + (b.nota ? " · " + b.nota : ""), eur2(b.extras)]] : []).map(([r, v]) => "<tr><td>" + e(r) + "</td><td>" + e(v) + "</td></tr>").join("") +
      '<tr class="tot"><td>Total a receber</td><td>' + e(eur2(b.total)) + "</td></tr></table><p class=\"nota\">O valor para a comissão é o faturado menos " + e(eur2(F.meses.find((m) => m.mes === b.mes)?.precos?.desconto ?? 0.5)) + " por serviço (ajuda ao IVA).</p></section>";
    const html = '<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><title>Resumos dos barbeiros · ' + e(nomeM(p.meses[0])) + "</title><style>" +
      "body{font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#1d1b18;margin:0}.pg{padding:36px 44px;page-break-after:always;max-width:640px}header{display:flex;justify-content:space-between;border-bottom:2px solid #8a6a2f;padding-bottom:8px;color:#8a6a2f;text-transform:uppercase;letter-spacing:.06em;font-size:12px}" +
      "h1{font-size:26px;margin:22px 0 2px}.loja{margin:0 0 18px;color:#6b665f}table{width:100%;border-collapse:collapse}td{padding:8px 0;border-bottom:1px solid #e5e1da}td:last-child{text-align:right;font-variant-numeric:tabular-nums}.tot td{font-weight:700;font-size:16px;border-top:2px solid #1d1b18;border-bottom:0}.nota{color:#6b665f;font-size:12px;margin-top:18px}" +
      "@media print{.pg{padding:18mm 16mm}}</style></head><body>" + B.map(pag).join("") + "<script>setTimeout(()=>print(),300)<\/script></body></html>";
    const w = window.open("", "_blank");
    if (!w) { toast("O navegador bloqueou a janela. Permite janelas para esta app e tenta de novo.", true); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  /* ============================== Ações ============================== */
  function clique(acao, el) {
    if (acao === "sim-repor") { F.sim = { base: S0().base, precos: null, perda: 0, ajusteCom: 0, pcs: {} }; render(); return true; }
    if (acao === "fer-resumos-pdf") { imprimirResumos(); return true; }
    if (acao === "fer-resumo-copiar") {
      const [mes, loja, ...r] = el.dataset.k.split("|"), b = F.barbeiros.find((x) => x.mes === mes && x.loja === loja && x.barbeiro === r.join("|")); if (!b) return true;
      const t = textoResumo(b);
      (navigator.clipboard?.writeText(t) || Promise.reject()).then(() => toast("Resumo de " + b.barbeiro + " copiado")).catch(() => { window.prompt?.("Copia o resumo:", t); });
      return true;
    }
    return false;
  }
  function mudar(e) {
    const t = e.target, id = t.id || "";
    if (id === "cx-limite") { const v = lerNum(t.value); if (v == null || isNaN(v) || v < 0) { toast("Escreve um valor em euros.", true); render(); return true; } guardarConfig({ caixa_limite: v }, "Limite guardado"); return true; }
    if (id === "sim-base") { S0().base = t.value; render(); return true; }
    if (/^sim-(cabelo|barba|combo|desconto)$/.test(id)) { const v = lerNum(t.value); if (v == null || isNaN(v) || v < 0) { toast("Escreve um valor válido.", true); render(); return true; } const s = S0(); s.precos = { ...(s.precos || {}), [id.slice(4)]: v }; render(); return true; }
    if (id === "sim-perda" || id === "sim-ajuste") { const v = lerNum(t.value); if (v == null || isNaN(v) || (id === "sim-perda" && (v < 0 || v > 90))) { toast(id === "sim-perda" ? "Escreve uma percentagem entre 0 e 90." : "Escreve um número de pontos (ex.: 5 ou −5).", true); render(); return true; } S0()[id === "sim-perda" ? "perda" : "ajusteCom"] = v; render(); return true; }
    if (t.dataset.simPc) { const v = lerNum(t.value); if (v == null) delete S0().pcs[t.dataset.simPc]; else if (isNaN(v) || v < 0 || v > 100) { toast("Escreve uma percentagem entre 0 e 100.", true); render(); return true; } else S0().pcs[t.dataset.simPc] = v; render(); return true; }
    if (/^tes-(saldo|minimo|ajuste)$/.test(id)) {
      const v = lerNum(t.value); if (v != null && isNaN(v)) { toast("Escreve um número.", true); render(); return true; }
      guardarConfig({ tesouraria: { ...T0(), [id.slice(4)]: v } }, "Guardado"); return true;
    }
    if (id === "tes-prazos") { guardarConfig({ tesouraria: { ...T0(), prazos: t.checked } }, t.checked ? "Os prazos contam" : "Os prazos não contam"); return true; }
    return false;
  }
  return { vistaCaixa, vistaSimulador, vistaPrevisao, meioBarbeiros: (p) => desempenho(p) + resumos(p), clique, mudar };
}
