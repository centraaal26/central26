// Central 26 — Resultados por área e por barbeiro (Financeiro, só a direção).
// Substitui o mapa que o contabilista preenchia à mão: rendimentos e gastos de cada área, loja a loja e barbeiro a barbeiro,
// com os custos gerais divididos pelas áreas segundo a regra escolhida.
import { MES, MES_L } from "./dados.js";
import { carregarXlsx } from "./xlsx.js";

export const AREAS = [["barbearias", "Barbearias"], ["produtos", "Produtos"], ["academia", "Academia"], ["tech", "26 Tech"]];
const NAO_LOJA = new Set(["26 Academy", "Hairshop", "26 Tech", "Todas as barbearias"]);
export const DESTINOS = [["", "Dividir por todas as áreas"], ["barbearias", "Barbearias"], ["produtos", "Produtos"], ["academia", "Academia"], ["tech", "26 Tech"], ["fora", "Não é custo (ex.: IVA)"], ["irc", "Imposto sobre o lucro (IRC)"]];
const eur = (v) => (Math.round(Number(v) || 0)).toLocaleString("pt-PT") + " €";
const pct = (v) => (v == null || !isFinite(v) ? "—" : Math.round(v * 100).toLocaleString("pt-PT") + "%");
const dec = (v) => (v == null || v === "" ? "" : (Math.round(Number(v) * 100) / 100).toLocaleString("pt-PT", { maximumFractionDigits: 2, useGrouping: false }));
const lerNum = (s) => { const t = String(s ?? "").trim().replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."); return t === "" ? null : isFinite(+t) ? +t : NaN; };
const vazio = () => ({ vendas: 0, autoconsumo: 0, mercadorias: 0, barbeiros: 0, responsaveis: 0, pessoal: 0, fse: 0, comuns: 0, gerais: 0 });
const gastos = (x) => x.mercadorias + x.barbeiros + x.responsaveis + x.pessoal + x.fse + x.comuns + x.gerais;
const resultado = (x) => x.vendas + x.autoconsumo - gastos(x);

export function criarResultados(ctx, F, u) {
  const { esc, toast, falha, render, api } = ctx;
  const { custo, copias, mesesCom, nomeMes } = u;

  // ---------- para onde vai cada rubrica ----------
  function destinoPadrao(l) {
    if (l.area === "barbearias") return l.grupo && l.grupo !== "Todas as barbearias" ? "loja" : "barbearias";
    if (l.area === "hairshopping") return "produtos";
    if (l.area === "tech") return "tech";
    if (l.area === "formacao") return "academia";
    if (l.area === "impostos") return l.chave === "iva" ? "fora" : l.chave === "irc" ? "irc" : "geral";
    return "geral";
  }
  const editavel = (l) => l.area === "partilhadas" || l.area === "impostos";
  const destino = (l) => (editavel(l) && F.imput[l.chave]) || destinoPadrao(l);

  // ---------- contas ----------
  const regra = () => F.config?.reparticao || { metodo: "faturacao", pesos: { barbearias: 60, produtos: 25, academia: 10, tech: 5 } };
  const ajuste = (mes, tipo) => Number(F.ajustes.find((a) => a.mes === mes && a.tipo === tipo)?.valor || 0);
  const temAjuste = (mes, tipo) => F.ajustes.some((a) => a.mes === mes && a.tipo === tipo);
  // receita da Academia: o valor escrito à mão; se não houver, o calculado pelos preços das formações (Academy)
  const autoAcad = (mes) => F.receitaAcad?.find((r) => r.mes === mes) || null;
  const receitaAcademia = (mes) => (temAjuste(mes, "receita_academia") ? ajuste(mes, "receita_academia") : autoAcad(mes)?.valor || 0);
  const dividir = (valor, pesos) => { const t = Object.values(pesos).reduce((s, v) => s + Math.max(0, v), 0); return Object.fromEntries(Object.entries(pesos).map(([k, v]) => [k, t > 0 ? (valor * Math.max(0, v)) / t : 0])); };

  function calcular(meses) {
    const areas = Object.fromEntries(AREAS.map(([k]) => [k, vazio()])), lojas = {}, geralRub = {}, fora = {};
    let irc = 0, geralTotal = 0;
    const loja = (e) => (lojas[e] ||= vazio());
    const avisos = { semVendas: [], semBarbeiros: [], copias: [] }, cp = copias();
    const temVendas = F.vendas.length > 0;
    for (const m of meses) {
      if (cp[m]) avisos.copias.push(m);
      const fat = F.faturacao.filter((f) => f.mes === m && !NAO_LOJA.has(f.espaco) && f.total > 0);
      const L = F.linhas.filter((l) => l.mes === m);
      for (const l of L) if (destino(l) === "loja") loja(l.grupo);
      for (const f of fat) loja(f.espaco).vendas += f.total;
      const pesoLojas = Object.fromEntries(Object.keys(lojas).map((e) => [e, fat.find((f) => f.espaco === e)?.total || 0]));
      const lojasMes = Object.keys(pesoLojas).filter((e) => pesoLojas[e] > 0 || L.some((l) => l.grupo === e));
      const repartirLojas = (valor, campo) => { const p = Object.fromEntries(lojasMes.map((e) => [e, pesoLojas[e] || 0])); const fat0 = Object.values(p).every((v) => !v); const d = dividir(valor, fat0 ? Object.fromEntries(lojasMes.map((e) => [e, 1])) : p); for (const [e, v] of Object.entries(d)) loja(e)[campo] += v; };
      areas.barbearias.vendas += fat.reduce((s, f) => s + f.total, 0);
      // vendas da faturação (SAF-T)
      const V = F.vendas.filter((v) => v.mes === m);
      if (temVendas && !V.length) avisos.semVendas.push(m);
      const vTech = V.filter((v) => v.linha === "tech").reduce((s, v) => s + Number(v.valor), 0), vProd = V.filter((v) => v.linha !== "tech").reduce((s, v) => s + Number(v.valor), 0);
      areas.produtos.vendas += vProd; areas.tech.vendas += vTech;
      const receitaAcad = receitaAcademia(m); areas.academia.vendas += receitaAcad;
      // produtos gastos nas barbearias (a preço de custo): rendimento dos Produtos, custo das barbearias
      const auto = ajuste(m, "autoconsumo");
      areas.produtos.autoconsumo += auto; areas.barbearias.mercadorias += auto; repartirLojas(auto, "mercadorias");
      // barbeiros e responsáveis de loja
      const B = F.barbeiros.filter((b) => b.mes === m);
      if (!B.length && fat.length) avisos.semBarbeiros.push(m);
      for (const e of lojasMes) {
        const pago = B.filter((b) => b.loja === e).reduce((s, b) => s + Number(b.total), 0) || (F.faturacao.find((f) => f.mes === m && f.espaco === e)?.vencimentos || 0);
        loja(e).barbeiros += pago; areas.barbearias.barbeiros += pago;
      }
      for (const r of F.responsaveis.filter((r) => r.mes === m)) { loja(r.loja).responsaveis += Number(r.valor); areas.barbearias.responsaveis += Number(r.valor); }
      // outro pessoal: pela divisão da folha RH
      let geralMes = 0;
      for (const p of F.pessoal.filter((p) => p.mes === m)) {
        const pesos = Object.fromEntries(AREAS.map(([k]) => [k, Number(p.pesos?.[k] || 0)]));
        if (!Object.values(pesos).some((v) => v > 0)) { geralMes += Number(p.valor); geralRub["Pessoal: " + p.pessoa] = (geralRub["Pessoal: " + p.pessoa] || 0) + Number(p.valor); continue; }
        const d = dividir(Number(p.valor), pesos);
        for (const [k, v] of Object.entries(d)) areas[k].pessoal += v;
        repartirLojas(d.barbearias, "pessoal");
      }
      // despesas das folhas
      let comunsBarb = 0;
      for (const l of L) {
        const v = custo(l), d = destino(l);
        if (!v) continue;
        if (d === "fora") fora[l.chave] = (fora[l.chave] || 0) + v;
        else if (d === "irc") irc += v;
        else if (d === "geral") { geralMes += v; geralRub[l.chave] = (geralRub[l.chave] || 0) + v; }
        else if (d === "loja") { loja(l.grupo).fse += v; areas.barbearias.fse += v; }
        else if (d === "barbearias") { comunsBarb += v; areas.barbearias.comuns += v; }
        else areas[d].fse += v;
      }
      repartirLojas(comunsBarb, "comuns");
      // custos gerais: pela regra escolhida
      const r = regra();
      let base = r.metodo === "faturacao" ? { barbearias: fat.reduce((s, f) => s + f.total, 0), produtos: Math.max(0, vProd), academia: receitaAcad, tech: Math.max(0, vTech) } : r.pesos;
      if (!Object.values(base).some((v) => v > 0)) base = r.pesos;
      const d = dividir(geralMes, base);
      for (const [k, v] of Object.entries(d)) areas[k].gerais += v;
      repartirLojas(d.barbearias, "gerais");
      geralTotal += geralMes;
    }
    const total = vazio(); for (const a of Object.values(areas)) for (const k of Object.keys(total)) total[k] += a[k];
    return { areas, total, lojas: Object.entries(lojas).filter(([, x]) => x.vendas || gastos(x)).sort((a, b) => b[1].vendas - a[1].vendas), irc, fora, geralRub, geralTotal, avisos };
  }

  // ---------- período ----------
  const anos = () => [...new Set(mesesCom().map((m) => m.slice(0, 4)))].sort();
  function periodo() {
    if (!F.resAno || !anos().includes(F.resAno)) F.resAno = anos()[anos().length - 1];
    const doAno = mesesCom().filter((m) => m.startsWith(F.resAno));
    if (F.resMes && !doAno.includes(F.resMes)) F.resMes = "";
    return { meses: F.resMes ? [F.resMes] : doAno, doAno, nome: F.resMes ? MES_L[+F.resMes.slice(5) - 1].replace(/^./, (x) => x.toUpperCase()) + " de " + F.resMes.slice(0, 4) : "Ano de " + F.resAno + " (" + doAno.length + (doAno.length === 1 ? " mês" : " meses") + ")" };
  }
  function barra(p, extra = "", exportar = true) {
    return '<div class="barra"><div class="periodo"><b>' + esc(p.nome) + "</b><span>" + extra + "</span></div><div class=\"ferr\">" +
      '<label class="sr" for="res-ano">Ano</label><select id="res-ano" class="sel">' + anos().map((a) => "<option" + (a === F.resAno ? " selected" : "") + ">" + a + "</option>").join("") + "</select>" +
      '<label class="sr" for="res-mes">Mês</label><select id="res-mes" class="sel"><option value="">Ano inteiro</option>' + p.doAno.map((m) => '<option value="' + m + '"' + (m === F.resMes ? " selected" : "") + ">" + esc(MES_L[+m.slice(5) - 1].replace(/^./, (x) => x.toUpperCase())) + "</option>").join("") + "</select>" +
      (exportar ? '<button class="btn sec" data-acao="res-exportar">Exportar Excel</button>' : "") + "</div></div>";
  }
  const faltaScript = () => '<div class="vazio"><h3>Falta instalar os resultados na base de dados</h3><p>No Supabase, abre o SQL Editor, cola o ficheiro <b>supabase/21-resultados.sql</b> do GitHub e carrega em Run. Depois volta a importar as folhas mensais para entrarem os barbeiros e o pessoal.</p></div>';
  const listaMeses = (l) => l.map((m) => MES[+m.slice(5) - 1]).join(", ");

  function avisosHtml(r) {
    let h = "";
    if (r.avisos.semBarbeiros.length) h += '<div class="aviso">Sem o quadro dos barbeiros em ' + esc(listaMeses(r.avisos.semBarbeiros)) + ': volta a importar essas folhas no separador Importar. Até lá conta o total de vencimentos da folha.</div>';
    if (r.avisos.semVendas.length) h += '<div class="aviso">Faltam as vendas do Multixop em ' + esc(listaMeses(r.avisos.semVendas)) + ": importa o SAF-T no Comercial para os Produtos ficarem completos.</div>";
    if (r.avisos.copias.length) h += '<div class="aviso erro">Os custos de ' + esc(listaMeses(r.avisos.copias)) + " são cópia de outro mês: os resultados destes meses não são fiáveis.</div>";
    return h;
  }

  // ---------- vista Resultados ----------
  const LINHAS = [["vendas", "Vendas e serviços prestados", 1], ["autoconsumo", "Produtos gastos nas barbearias (interno)", 1], ["mercadorias", "Custo das mercadorias (produtos gastos)", -1], ["barbeiros", "Gastos com barbeiros", -1],
    ["responsaveis", "Responsáveis de loja", -1], ["pessoal", "Outro pessoal", -1], ["fse", "Fornecimentos e serviços da área", -1], ["comuns", "Despesas comuns às barbearias", -1], ["gerais", "Custos gerais imputados", -1]];
  function tabela(colunas, cab) {
    const usadas = LINHAS.filter(([k]) => colunas.some(([, x]) => Math.abs(x[k]) > 0.5));
    let h = '<div class="tabela-scroll"><table class="crm-tabela fin-tab res-tab"><thead><tr><th>' + esc(cab) + "</th>" + colunas.map(([n]) => '<th class="n">' + esc(n) + "</th>").join("") + "</tr></thead><tbody>";
    h += usadas.map(([k, rot, s]) => "<tr><td>" + (s < 0 ? '<span class="res-menos">−</span> ' : "") + esc(rot) + "</td>" + colunas.map(([, x]) => '<td class="n">' + (Math.abs(x[k]) > 0.5 ? eur(x[k]) : "—") + "</td>").join("") + "</tr>").join("");
    h += '</tbody><tfoot><tr><td>Resultado</td>' + colunas.map(([, x]) => { const r = resultado(x); return '<td class="n ' + (r < 0 ? "neg" : "") + '"><b>' + eur(r) + "</b></td>"; }).join("") + "</tr>" +
      '<tr class="sub"><td>Margem sobre as vendas</td>' + colunas.map(([, x]) => '<td class="n">' + (x.vendas > 0 ? pct(resultado(x) / x.vendas) : "—") + "</td>").join("") + "</tr></tfoot></table></div>";
    return h;
  }

  function vistaResultados() {
    if (!F.extra) return faltaScript();
    const p = periodo(), r = calcular(p.meses), t = r.total, rai = resultado(t), liq = rai - r.irc;
    let h = barra(p, "Rendimentos e gastos de cada área, como no mapa do contabilista. Valores sem IVA nas despesas e no Multixop; a faturação das barbearias é a da folha.");
    h += avisosHtml(r);
    h += '<div class="kpis-mapa">' +
      '<div class="kpi"><span>Rendimentos</span><b>' + eur(t.vendas) + "</b><small>barbearias, produtos, Academia e Tech</small></div>" +
      '<div class="kpi"><span>Gastos</span><b>' + eur(gastos(t) - t.mercadorias) + "</b><small>sem o IVA" + (r.irc ? " e sem o IRC" : "") + "</small></div>" +
      '<div class="kpi"><span>Resultado antes do IRC</span><b class="' + (rai < 0 ? "neg" : "") + '">' + eur(rai) + "</b><small>margem " + (t.vendas ? pct(rai / t.vendas) : "—") + "</small></div>" +
      '<div class="kpi"><span>Resultado líquido</span><b class="' + (liq < 0 ? "neg" : "") + '">' + eur(liq) + "</b><small>" + (r.irc ? "depois de " + eur(r.irc) + " de IRC" : "sem IRC pago neste período") + "</small></div></div>";
    h += '<div class="res-areas">' + AREAS.map(([k, n]) => { const x = r.areas[k], rr = resultado(x); return '<div class="res-area a-' + k + '"><span>' + esc(n) + '</span><b class="' + (rr < 0 ? "neg" : "") + '">' + eur(rr) + "</b><small>" + (x.vendas > 0 ? "margem " + pct(rr / x.vendas) : "sem vendas registadas") + "</small>" +
      '<i class="res-barra" style="--p:' + (x.vendas > 0 ? Math.max(0, Math.min(1, rr / x.vendas)) : 0) + '"></i></div>'; }).join("") + "</div>";
    h += '<section class="cartao-sec"><h3>Por área</h3>' + tabela(AREAS.map(([k, n]) => [n, r.areas[k]]).concat([["Total", t]]), "Rubrica") +
      '<table class="crm-tabela fin-tab res-tab res-fim"><tbody><tr><td>Resultado antes do IRC</td><td class="n"><b>' + eur(rai) + '</b></td></tr><tr><td><span class="res-menos">−</span> IRC</td><td class="n">' + (r.irc ? eur(r.irc) : "—") + '</td></tr><tr class="tot"><td>Resultado líquido</td><td class="n ' + (liq < 0 ? "neg" : "") + '"><b>' + eur(liq) + "</b></td></tr></tbody></table></section>";
    if (r.lojas.length) h += '<section class="cartao-sec"><h3>Barbearias, loja a loja</h3>' + tabela(r.lojas.map(([e, x]) => [e, x]).concat([["Total", r.areas.barbearias]]), "Rubrica") +
      '<p class="nota-tab">As despesas comuns às barbearias, os produtos gastos, o outro pessoal e os custos gerais da área dividem-se pelas lojas na proporção da faturação de cada uma.</p></section>';
    // regra de divisão dos custos gerais
    const rg = regra(), somaP = AREAS.reduce((s, [k]) => s + (Number(rg.pesos?.[k]) || 0), 0);
    h += '<section class="cartao-sec"><h3>Como se dividem os custos gerais</h3><p>Custos gerais deste período: <b>' + eur(r.geralTotal) + "</b> (despesas partilhadas, impostos e contribuições, a sede e o pessoal sem área definida). O IVA não conta como custo e o IRC fica só no total da empresa.</p>" +
      '<div class="form-linha"><label for="res-metodo">Dividir</label><select id="res-metodo" class="sel"><option value="faturacao"' + (rg.metodo === "faturacao" ? " selected" : "") + '>Na proporção das vendas de cada área, mês a mês</option><option value="fixo"' + (rg.metodo === "fixo" ? " selected" : "") + ">Por percentagens fixas</option></select></div>" +
      (rg.metodo === "fixo" ? '<div class="res-pesos">' + AREAS.map(([k, n]) => '<label>' + esc(n) + '<span><input id="res-peso-' + k + '" inputmode="decimal" value="' + esc(dec(rg.pesos?.[k] ?? 0)) + '">%</span></label>').join("") + '</div><p class="nota-tab' + (Math.abs(somaP - 100) > 0.01 ? " at" : "") + '">Somam ' + dec(somaP) + "%" + (Math.abs(somaP - 100) > 0.01 ? ": a app ajusta na proporção, mas convém que somem 100%." : ".") + "</p>" : "") +
      '<p class="nota-tab">Cada despesa pode ir para uma área em vez de ser dividida (por exemplo, as compras ao laboratório para os Produtos): escolhe em <button class="c-link" data-acao="fin-tab" data-tab="despesas">Despesas</button>, na coluna «Vai para».</p>' +
      (Object.keys(r.geralRub).length ? '<details class="fin-leves"><summary>Ver os custos gerais deste período</summary><div class="tabela-scroll"><table class="crm-tabela fin-tab"><tbody>' +
        Object.entries(r.geralRub).sort((a, b) => b[1] - a[1]).map(([k, v]) => "<tr><td>" + esc(u.rotulo(k)) + '</td><td class="n">' + eur(v) + "</td></tr>").join("") + "</tbody></table></div></details>" : "") + "</section>";
    // valores escritos à mão
    h += '<section class="cartao-sec"><h3>Valores que não estão nas folhas</h3><p>Os produtos gastos nas barbearias não aparecem nas folhas: escreve-os aqui, mês a mês, a preço de custo. A receita da Academia vem ' + (F.receitaAcad ? "do preço de cada formação (Academy → Formações), dividida pelos meses da formação" : "do que escreveres aqui (quando correres o script 22, passa a vir do preço de cada formação na Academy)") + "; se escreveres um valor, é esse que conta.</p>" +
      '<div class="tabela-scroll"><table class="crm-tabela fin-tab res-aj"><thead><tr><th>Mês</th><th class="n">Receita da Academia</th><th class="n">Produtos gastos nas barbearias</th></tr></thead><tbody>' +
      p.doAno.map((m) => "<tr><td>" + esc(nomeMes(m)) + "</td>" + ["receita_academia", "autoconsumo"].map((tp) => { const au = tp === "receita_academia" ? autoAcad(m) : null, manual = temAjuste(m, tp);
        return '<td class="n"><label class="sr" for="res-aj-' + tp + "-" + m + '">' + (tp === "autoconsumo" ? "Produtos gastos" : "Receita da Academia") + " em " + esc(nomeMes(m)) + '</label><input class="res-aj-in" id="res-aj-' + tp + "-" + m + '" data-aj-mes="' + m + '" data-aj-tipo="' + tp + '" inputmode="decimal" placeholder="' + (au ? esc(dec(au.valor)) : "0") + '" value="' + esc(dec(F.ajustes.find((a) => a.mes === m && a.tipo === tp)?.valor ?? "")) + '"> €' +
          (tp === "receita_academia" ? '<small class="res-serv">' + (manual ? "escrito à mão" + (au ? " (pelos preços: " + eur(au.valor) + ")" : "") : au ? "pelos preços: " + au.formacoes + (au.formacoes === 1 ? " formação" : " formações") : "sem formações com preço") + "</small>" : "") + "</td>"; }).join("") + "</tr>").join("") +
      "</tbody></table></div></section>";
    if (Object.keys(r.fora).length) h += '<section class="cartao-sec"><h3>Não entram nas contas</h3><p class="nota-tab">' + Object.entries(r.fora).map(([k, v]) => esc(u.rotulo(k)) + " " + eur(v)).join(" · ") + '. Para mudar, escolhe outro destino em Despesas.</p></section>';
    return h;
  }

  // ---------- vista Barbeiros ----------
  function juntarBarbeiros(meses) {
    const m = new Map();
    for (const b of F.barbeiros.filter((x) => meses.includes(x.mes))) {
      const k = b.loja + "|" + b.barbeiro, x = m.get(k) || { loja: b.loja, barbeiro: b.barbeiro, meses: 0, cabelos: 0, barbas: 0, combos: 0, valor_total: 0, liquido: 0, a_receber: 0, extras: 0, total: 0, notas: new Set(), pcs: new Set(), porMes: {} };
      x.meses++; for (const c of ["cabelos", "barbas", "combos", "valor_total", "liquido", "a_receber", "extras", "total"]) x[c] += Number(b[c]) || 0;
      if (b.nota) x.notas.add(b.nota); x.pcs.add(Math.round(Number(b.comissao) * 100)); x.porMes[b.mes] = (x.porMes[b.mes] || 0) + Number(b.valor_total);
      m.set(k, x);
    }
    return [...m.values()];
  }
  function vistaBarbeiros(meio) {
    if (!F.extra) return faltaScript();
    const p = periodo(), L = juntarBarbeiros(p.meses);
    let h = barra(p, "Serviços, faturação e pagamento de cada barbeiro, da folha Faturação. «Fica para a empresa» = faturado − total pago ao barbeiro (o desconto de 0,50 € por serviço, para ajuda ao IVA, fica na empresa).");
    const semB = p.meses.filter((m) => !F.barbeiros.some((b) => b.mes === m));
    if (semB.length) h += '<div class="aviso">Sem o quadro dos barbeiros em ' + esc(listaMeses(semB)) + ": volta a importar essas folhas no separador Importar.</div>";
    if (!L.length) return h + '<div class="vazio"><h3>Ainda não há barbeiros neste período</h3><p>Volta a importar as folhas mensais no separador Importar: a app lê o quadro dos barbeiros da folha Faturação.</p></div>';
    const t = L.reduce((s, x) => ({ serv: s.serv + x.cabelos + x.barbas + x.combos, fat: s.fat + x.valor_total, pago: s.pago + x.total }), { serv: 0, fat: 0, pago: 0 });
    const resp = F.responsaveis.filter((r) => p.meses.includes(r.mes));
    h += '<div class="kpis-mapa"><div class="kpi"><span>Serviços</span><b>' + Math.round(t.serv).toLocaleString("pt-PT") + "</b><small>cortes, barbas e combos</small></div>" +
      '<div class="kpi"><span>Faturado pelos barbeiros</span><b>' + eur(t.fat) + "</b><small>" + (t.serv ? (t.fat / t.serv).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " € por serviço" : "") + "</small></div>" +
      '<div class="kpi"><span>Pago aos barbeiros</span><b>' + eur(t.pago) + "</b><small>comissões e extras" + (resp.length ? " · mais " + eur(resp.reduce((s, r) => s + Number(r.valor), 0)) + " aos responsáveis" : "") + "</small></div>" +
      '<div class="kpi"><span>Fica para a empresa</span><b>' + eur(t.fat - t.pago) + "</b><small>" + (t.fat ? pct((t.fat - t.pago) / t.fat) + " do faturado" : "") + "</small></div></div>";
    if (meio) h += meio(p, L);
    const lojas = [...new Set(L.map((x) => x.loja))].sort((a, b) => L.filter((x) => x.loja === b).reduce((s, x) => s + x.valor_total, 0) - L.filter((x) => x.loja === a).reduce((s, x) => s + x.valor_total, 0));
    for (const lj of lojas) {
      const B = L.filter((x) => x.loja === lj).sort((a, b) => b.valor_total - a.valor_total), rv = resp.filter((r) => r.loja === lj).reduce((s, r) => s + Number(r.valor), 0);
      const st = B.reduce((s, x) => ({ fat: s.fat + x.valor_total, pago: s.pago + x.total, serv: s.serv + x.cabelos + x.barbas + x.combos }), { fat: 0, pago: 0, serv: 0 });
      h += '<section class="cartao-sec"><h3>' + esc(lj) + (rv ? ' <small class="muted">· responsável de loja ' + eur(rv) + "</small>" : "") + '</h3><div class="tabela-scroll"><table class="crm-tabela fin-tab res-barb"><thead><tr><th>Barbeiro</th><th class="n">Serviços</th><th class="n">Faturado</th><th class="n">Comissão</th><th class="n">Extras</th><th class="n">Total pago</th><th class="n">Fica para a empresa</th></tr></thead><tbody>' +
        B.map((x) => { const serv = x.cabelos + x.barbas + x.combos, pcs = [...x.pcs].sort((a, b) => a - b), emp = x.valor_total - x.total;
          return "<tr><td><b>" + esc(x.barbeiro) + "</b>" + (p.meses.length > 1 ? '<small class="muted"> · ' + x.meses + (x.meses === 1 ? " mês" : " meses") + "</small>" : "") + "</td>" +
            '<td class="n">' + Math.round(serv) + '<small class="res-serv">' + Math.round(x.cabelos) + " cabelos · " + Math.round(x.barbas) + " barbas · " + Math.round(x.combos) + " combos</small></td>" +
            '<td class="n">' + eur(x.valor_total) + '</td><td class="n">' + eur(x.a_receber) + '<small class="res-serv">' + (pcs.length > 1 ? pcs[0] + "–" + pcs[pcs.length - 1] : pcs[0]) + "%</small></td>" +
            '<td class="n"' + (x.notas.size ? ' title="' + esc([...x.notas].join(" · ")) + '"' : "") + ">" + (x.extras > 0.5 ? eur(x.extras) + (x.notas.size ? '<small class="res-serv">' + esc([...x.notas][0].slice(0, 40)) + "</small>" : "") : "—") + "</td>" +
            '<td class="n"><b>' + eur(x.total) + '</b></td><td class="n">' + eur(emp) + '<small class="res-serv">' + (x.valor_total ? pct(emp / x.valor_total) : "") + "</small></td></tr>"; }).join("") +
        '</tbody><tfoot><tr><td>Total da loja</td><td class="n">' + Math.round(st.serv) + '</td><td class="n">' + eur(st.fat) + '</td><td></td><td></td><td class="n"><b>' + eur(st.pago) + '</b></td><td class="n">' + eur(st.fat - st.pago) + "</td></tr></tfoot></table></div></section>";
    }
    if (p.meses.length > 1) {
      const todos = L.slice().sort((a, b) => a.loja.localeCompare(b.loja) || b.valor_total - a.valor_total);
      h += '<section class="cartao-sec"><h3>Faturado por barbeiro e por mês</h3><div class="tabela-scroll"><table class="crm-tabela fin-tab"><thead><tr><th>Barbeiro</th>' + p.meses.map((m) => '<th class="n">' + esc(MES[+m.slice(5) - 1]) + "</th>").join("") + "</tr></thead><tbody>" +
        todos.map((x) => "<tr><td>" + esc(x.barbeiro) + ' <small class="muted">· ' + esc(x.loja) + "</small></td>" + p.meses.map((m) => '<td class="n">' + (x.porMes[m] ? eur(x.porMes[m]) : "—") + "</td>").join("") + "</tr>").join("") + "</tbody></table></div></section>";
    }
    return h;
  }

  // ---------- exportar para o contabilista ----------
  async function exportar() {
    const p = periodo(), r = calcular(p.meses), XLSX = await carregarXlsx(), wb = XLSX.utils.book_new(), arred = (v) => Math.round(v * 100) / 100;
    const folhaRes = (colunas) => {
      const usadas = LINHAS.filter(([k]) => colunas.some(([, x]) => Math.abs(x[k]) > 0.005));
      return [["Rubrica", ...colunas.map(([n]) => n)], ...usadas.map(([k, rot, s]) => [(s < 0 ? "− " : "") + rot, ...colunas.map(([, x]) => arred(x[k]))]), ["Resultado", ...colunas.map(([, x]) => arred(resultado(x)))]];
    };
    const res = folhaRes(AREAS.map(([k, n]) => [n, r.areas[k]]).concat([["Total", r.total]]));
    res.push([], ["IRC", "", "", "", "", arred(r.irc)], ["Resultado líquido", "", "", "", "", arred(resultado(r.total) - r.irc)], [], ["Período", p.nome], ["Custos gerais divididos " + (regra().metodo === "fixo" ? "por percentagens fixas" : "na proporção das vendas")]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(res), "Resultados por área");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(folhaRes(r.lojas.concat([["Total", r.areas.barbearias]]))), "Barbearias");
    const B = F.barbeiros.filter((b) => p.meses.includes(b.mes)).sort((a, b) => a.mes.localeCompare(b.mes) || a.loja.localeCompare(b.loja));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Mês", "Loja", "Barbeiro", "Cabelos", "Barbas", "Combos", "Faturado", "Comissão %", "Comissão €", "Extras", "Nota", "Total pago", "Fica para a empresa"],
      ...B.map((b) => [b.mes, b.loja, b.barbeiro, +b.cabelos, +b.barbas, +b.combos, +b.valor_total, Math.round(b.comissao * 100), +b.a_receber, +b.extras, b.nota, +b.total, arred(b.valor_total - b.total)])]), "Barbeiros");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Custo geral", "Valor"], ...Object.entries(r.geralRub).sort((a, b) => b[1] - a[1]).map(([k, v]) => [u.rotulo(k), arred(v)])]), "Custos gerais");
    XLSX.writeFile(wb, "Central 26 - Resultados - " + p.nome.replace(/[()]/g, "").replace(/\s+/g, " ") + ".xlsx");
  }

  // ---------- ações ----------
  function clique(acao) {
    if (acao !== "res-exportar") return false;
    exportar().then(() => toast("Excel exportado")).catch(falha);
    return true;
  }
  function guardarConfig(nova) {
    const antes = F.config; F.config = { ...(F.config || {}), reparticao: nova }; render();
    api.fin.config(nova).then(() => toast("Regra guardada")).catch((e) => { F.config = antes; render(); falha(e); });
  }
  function mudar(e) {
    const t = e.target;
    if (t.id === "res-ano") { F.resAno = t.value; F.resMes = ""; render(); return true; }
    if (t.id === "res-mes") { F.resMes = t.value; render(); return true; }
    if (t.id === "res-metodo") { guardarConfig({ ...regra(), metodo: t.value }); return true; }
    if (t.id?.startsWith("res-peso-")) {
      const v = lerNum(t.value); if (v == null || isNaN(v) || v < 0) { toast("Escreve uma percentagem válida.", true); render(); return true; }
      guardarConfig({ ...regra(), pesos: { ...regra().pesos, [t.id.slice(9)]: v } }); return true;
    }
    if (t.dataset.ajMes) {
      const v = lerNum(t.value), mes = t.dataset.ajMes, tipo = t.dataset.ajTipo;
      if (v != null && (isNaN(v) || v < 0)) { toast("Escreve um valor em euros (ex.: 1250,50).", true); return true; }
      const antes = F.ajustes.slice();
      F.ajustes = F.ajustes.filter((a) => !(a.mes === mes && a.tipo === tipo)).concat(v == null ? [] : [{ mes, tipo, valor: v }]); render();
      api.fin.ajuste(mes, tipo, v).then(() => toast("Guardado")).catch((er) => { F.ajustes = antes; render(); falha(er); });
      return true;
    }
    if (t.dataset.destino !== undefined) {
      const k = t.dataset.destino, v = t.value || null, antes = F.imput[k];
      if (v) F.imput[k] = v; else delete F.imput[k]; render();
      api.fin.imputacao(k, v).then(() => toast("Destino guardado")).catch((er) => { if (antes) F.imput[k] = antes; else delete F.imput[k]; render(); falha(er); });
      return true;
    }
    return false;
  }
  return { vistaResultados, vistaBarbeiros, clique, mudar, destino, editavel, calcular, periodo, barra, juntarBarbeiros, receitaAcademia, faltaScript, NAO_LOJA };
}
