// Central 26 — Estatísticas das barbearias a partir das marcações do Booknetic (Lojas → Marcações, só a direção).
import { MES, MES_L, haQuanto } from "./dados.js";

const DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const num = (v) => (Number(v) || 0).toLocaleString("pt-PT");
const pct = (v, dec = 1) => (Number.isFinite(v) ? v.toLocaleString("pt-PT", { maximumFractionDigits: dec }) + "%" : "—");
const mesAnt = (m, k = 1) => { const [y, mm] = m.split("-").map(Number); const d = new Date(y, mm - 1 - k, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
const rotMes = (m) => MES_L[+m.slice(5) - 1] + " " + m.slice(0, 4);
const varia = (a, b) => (b ? ((a - b) / b) * 100 : null);

export function criarEstatBar(ctx) {
  const { S, api, esc, I, toast, falha, render, nomeDe } = ctx;
  const E = (S.estatBar = { estado: "por-carregar", stats: [], horas: [], imp: null, loja: "", mes: "", bk: null });

  async function carregar() {
    if (E.estado === "a-carregar") return;
    E.estado = "a-carregar";
    try { const d = await api.bar.carregar(); Object.assign(E, d, { estado: "pronto" }); }
    catch (e) { E.estado = "erro"; E.erro = /PGRST205|Could not find the table|bar_stats|does not exist/i.test(String(e?.message)) ? "falta-script" : e.message; }
    render();
  }

  const meses = () => [...new Set(E.stats.filter((x) => x.nivel === "total").map((x) => x.mes))].sort();
  const linha = (nivel, mes, loja = "", chave = "") => E.stats.find((x) => x.nivel === nivel && x.mes === mes && x.loja === loja && x.chave === chave);
  const doMes = (mes) => (E.loja ? linha("loja", mes, E.loja) : linha("total", mes));

  /* ---------- importação ---------- */
  function blocoImportar(primeira) {
    const b = E.bk;
    return '<section class="bk-imp' + (primeira ? " grande" : "") + '"><div><b>' + (primeira ? "Importar as marcações do Booknetic" : "Atualizar com uma exportação nova") + "</b>" +
      '<small>No WordPress da barbearia: Booknetic → Settings → Export &amp; Import data → exportar. Depois escolhe aqui o ficheiro .Booknetic. Faz isto num computador: o ficheiro é grande. Só os números ficam guardados na Central, sem nomes nem contactos de clientes.</small></div>' +
      (b?.estado === "a-ler" ? '<div class="bk-prog"><span id="bk-prog-t">A ler o ficheiro… ' + Math.round((b.p || 0) * 100) + '%</span><i><b id="bk-prog-b" style="width:' + Math.round((b.p || 0) * 100) + '%"></b></i></div>'
        : '<label class="btn ' + (primeira ? "pri" : "sec") + '" for="bk-fich">' + I.plus + "Escolher ficheiro</label>") +
      '<input id="bk-fich" type="file" accept=".Booknetic,.booknetic,.zip,application/zip" hidden></section>';
  }
  async function importar(file) {
    E.bk = { estado: "a-ler", p: 0 }; render();
    try {
      const { lerBooknetic, agregar } = await import("./booknetic.js");
      const dados = await lerBooknetic(file, (p) => {
        E.bk.p = p;
        const t = document.getElementById("bk-prog-t"), b = document.getElementById("bk-prog-b");
        if (t) t.textContent = "A ler o ficheiro… " + Math.round(p * 100) + "%"; if (b) b.style.width = Math.round(p * 100) + "%";
      });
      const ag = agregar(dados);
      const r = await api.bar.importar({ ...ag, ficheiro: file.name });
      E.bk = null; E.estado = "por-carregar"; await carregar();
      if (r == null) throw new Error("A importação não respondeu.");
      toast("Estatísticas atualizadas: " + num(ag.resumo.marcacoes) + " marcações lidas");
    } catch (e) { E.bk = null; render(); falha(e); }
  }

  /* ---------- gráfico: marcações por mês ---------- */
  function grafico(ms, ate) {
    const pares = ms.slice(-18).map((m) => [m, doMes(m)?.marcacoes || 0]);
    if (!pares.length) return "";
    const W = 640, H = 210, pe = 26, topo = 20, larg = (W - 8) / pares.length, bw = Math.min(30, larg * 0.6), max = Math.max(...pares.map((x) => x[1]), 1);
    const y = (v) => H - pe - (v / max) * (H - pe - topo), mesAte = ate?.slice(0, 7);
    let s = '<div class="grafico bk-graf"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Marcações por mês">';
    s += '<line x1="0" x2="' + W + '" y1="' + (H - pe) + '" y2="' + (H - pe) + '" class="g-base"/>';
    pares.forEach(([m, v], i) => {
      const cx = 4 + larg * i + larg / 2, yy = y(v), alt = Math.max(1, H - pe - yy), r = Math.min(4, alt / 2, bw / 2), parcial = m === mesAte;
      const mostra = i === pares.length - 1 || i === pares.length - 2 || v === max;
      s += '<g class="g-barra' + (parcial ? " parcial" : "") + '"><title>' + rotMes(m) + ": " + num(v) + " marcações" + (parcial ? " (mês a decorrer)" : "") + "</title>" +
        '<rect x="' + (cx - larg / 2) + '" y="' + topo + '" width="' + larg + '" height="' + (H - pe - topo) + '" class="g-alvo"/>' +
        '<path d="M' + (cx - bw / 2) + "," + (H - pe) + " V" + (yy + r) + " Q" + (cx - bw / 2) + "," + yy + " " + (cx - bw / 2 + r) + "," + yy + " H" + (cx + bw / 2 - r) + " Q" + (cx + bw / 2) + "," + yy + " " + (cx + bw / 2) + "," + (yy + r) + " V" + (H - pe) + 'Z" class="g-marca"/>' +
        '<text x="' + cx + '" y="' + (yy - 6) + '" class="g-valor' + (mostra ? "" : " g-oculto") + '" text-anchor="middle">' + num(v) + "</text>" +
        (i % 2 === pares.length % 2 || i === pares.length - 1 ? '<text x="' + cx + '" y="' + (H - pe + 17) + '" class="g-eixo" text-anchor="middle">' + MES[+m.slice(5) - 1] + (m.slice(5) === "01" ? " " + m.slice(2, 4) : "") + "</text>" : "") + "</g>";
    });
    return s + "</svg></div>";
  }
  function spark(vals) {
    const W = 84, H = 22, max = Math.max(...vals, 1), min = Math.min(...vals, 0);
    const pts = vals.map((v, i) => (i * (W / Math.max(1, vals.length - 1))).toFixed(1) + "," + (H - 2 - ((v - min) / (max - min || 1)) * (H - 4)).toFixed(1)).join(" ");
    return '<svg class="spark" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true"><polyline points="' + pts + '"/></svg>';
  }
  const delta = (v) => (v == null ? '<span class="muted">—</span>' : '<span class="' + (v >= 0 ? "bk-sobe" : "bk-desce") + '">' + (v >= 0 ? "+" : "−") + pct(Math.abs(v), 0) + "</span>");

  function mapaHoras() {
    const l = E.horas.filter((h) => !E.loja || h.loja === E.loja), m = new Map();
    l.forEach((h) => m.set(h.dow + "|" + h.hora, (m.get(h.dow + "|" + h.hora) || 0) + h.n));
    if (!m.size) return '<p class="muted">Sem marcações nas últimas 12 semanas.</p>';
    const hs = [...m.keys()].map((k) => +k.split("|")[1]), h0 = Math.min(...hs), h1 = Math.max(...hs), max = Math.max(...m.values());
    let s = '<div class="tabela-scroll"><table class="bk-mapa"><thead><tr><th></th>' + Array.from({ length: h1 - h0 + 1 }, (_, i) => "<th>" + (h0 + i) + "h</th>").join("") + "</tr></thead><tbody>";
    for (let d = 0; d < 7; d++) {
      s += "<tr><th>" + DIAS[d] + "</th>";
      for (let h = h0; h <= h1; h++) { const n = m.get(d + "|" + h) || 0; const al = n ? 0.12 + 0.88 * n / max : 0; s += '<td style="--a:' + al.toFixed(2) + (al > 0.55 ? ";color:var(--surface)" : "") + '" title="' + DIAS[d] + " " + h + "h: " + n + ' marcações em 12 semanas">' + (n ? Math.round(n / 12) : "") + "</td>"; }
      s += "</tr>";
    }
    return s + '</tbody></table></div><p class="muted bk-nota">Média de marcações por semana em cada hora, nas últimas 12 semanas. Mais escuro = mais movimento.</p>';
  }

  /* ---------- vista ---------- */
  function vista() {
    if (E.estado === "por-carregar") carregar();
    if (E.estado === "erro") return E.erro === "falta-script" ? '<div class="vazio"><h3>Falta instalar as estatísticas na base de dados</h3><p>No Supabase, abre o SQL Editor, cola o ficheiro <b>supabase/26-estatisticas-barbearias.sql</b> do GitHub e carrega em Run.</p></div>'
      : '<div class="aviso erro">Não foi possível carregar: ' + esc(E.erro) + "</div>";
    if (E.estado !== "pronto") return '<div class="esqueleto"><i style="width:50%"></i></div>';
    const ms = meses();
    if (!ms.length) return blocoImportar(true);
    const r = E.imp?.resumo || {}, ate = r.ate || ms[ms.length - 1] + "-28";
    const mesAte = ate.slice(0, 7), completo = +ate.slice(8) >= 28;
    if (!E.mes || !ms.includes(E.mes)) E.mes = completo || ms.length < 2 ? mesAte : mesAnt(mesAte);
    const lojas = [...new Set(E.stats.filter((x) => x.nivel === "loja").map((x) => x.loja))].sort((a, b) => a.localeCompare(b, "pt"));
    const m = E.mes, a = doMes(m) || {}, ant = doMes(mesAnt(m)) || {}, ano = doMes(mesAnt(m, 12));
    const cli = r.clientes?.[E.loja || "Todas"] || {};
    let h = '<div class="bk-cab"><div class="barra"><label class="sr" for="bk-loja">Loja</label><select id="bk-loja" class="sel"><option value="">Todas as lojas</option>' + lojas.map((l) => '<option' + (E.loja === l ? " selected" : "") + ">" + esc(l) + "</option>").join("") + "</select>" +
      '<label class="sr" for="bk-mes">Mês</label><select id="bk-mes" class="sel">' + ms.slice().reverse().map((x) => '<option value="' + x + '"' + (x === m ? " selected" : "") + ">" + rotMes(x) + (x === mesAte && !completo ? " (a decorrer)" : "") + "</option>").join("") + "</select></div>" +
      '<small class="muted">Marcações até ' + esc(ate.split("-").reverse().join("/")) + " · importado " + haQuanto(E.imp?.importado_em) + (E.imp?.importado_por ? " por " + esc(nomeDe(E.imp.importado_por) || "—") : "") + "</small></div>";
    const canc = (a.marcacoes || 0) + (a.canceladas || 0) ? (a.canceladas || 0) / ((a.marcacoes || 0) + (a.canceladas || 0)) * 100 : null;
    h += '<div class="resumo-crm bk-kpis">' +
      '<div class="kpi"><span>Marcações em ' + esc(MES_L[+m.slice(5) - 1]) + "</span><b>" + num(a.marcacoes) + "</b><small>" + delta(varia(a.marcacoes, ant.marcacoes)) + " vs " + MES[+mesAnt(m).slice(5) - 1] + (ano ? " · " + delta(varia(a.marcacoes, ano.marcacoes)) + " vs " + MES[+m.slice(5) - 1] + " " + mesAnt(m, 12).slice(2, 4) : "") + "</small></div>" +
      '<div class="kpi"><span>Canceladas</span><b>' + num(a.canceladas) + "</b><small>" + pct(canc) + " das marcações</small></div>" +
      '<div class="kpi"><span>Clientes diferentes</span><b>' + num(a.clientes) + "</b><small>" + num(a.novos) + " vieram pela primeira vez</small></div>" +
      '<div class="kpi"><span>Clientes ativos</span><b>' + num(cli.ativos) + "</b><small>vieram nos últimos 90 dias</small></div>" +
      '<div class="kpi"><span>Clientes habituais</span><b>' + num(cli.habituais) + "</b><small>3 ou mais visitas no último ano" + (cli.intervalo ? " · voltam a cada " + cli.intervalo + " dias" : "") + "</small></div>" +
      '<div class="kpi' + (cli.perdidos ? " alerta-kpi" : "") + '"><span>Deixaram de vir</span><b>' + num(cli.perdidos) + "</b><small>habituais sem vir há 90 dias ou mais</small></div>" +
      '<div class="kpi"><span>Marcadas nos próximos 7 dias</span><b>' + num(E.loja ? r.futuras?.[E.loja] : Object.values(r.futuras || {}).reduce((s, v) => s + v, 0)) + "</b><small>à data da exportação</small></div></div>";
    h += '<section class="bk-sec"><h3>Marcações por mês' + (E.loja ? " · " + esc(E.loja) : "") + "</h3>" + grafico(ms, ate) + (!completo ? '<p class="muted bk-nota">A última barra é o mês a decorrer (até ' + esc(ate.split("-").reverse().join("/")) + ").</p>" : "") + "</section>";
    if (!E.loja) {
      const ult12 = ms.slice(-12);
      h += '<section class="bk-sec"><h3>Lojas · ' + esc(rotMes(m)) + '</h3><div class="tabela-scroll"><table class="crm-tabela bk-tab bk-lojas"><thead><tr><th>Loja</th><th class="n">Marcações</th><th class="n">vs mês anterior</th><th class="n">vs há um ano</th><th class="n">Canceladas</th><th class="n">Clientes</th><th class="n">Novos</th><th>12 meses</th></tr></thead><tbody>' +
        lojas.map((l) => { const x = linha("loja", m, l) || {}, p = linha("loja", mesAnt(m), l) || {}, y = linha("loja", mesAnt(m, 12), l);
          const c = (x.marcacoes || 0) + (x.canceladas || 0) ? (x.canceladas || 0) / ((x.marcacoes || 0) + (x.canceladas || 0)) * 100 : null;
          return "<tr><td><button class=\"c-link\" data-acao=\"bk-loja\" data-v=\"" + esc(l) + '">' + esc(l) + '</button></td><td class="n">' + num(x.marcacoes) + '</td><td class="n">' + delta(varia(x.marcacoes, p.marcacoes)) + '</td><td class="n">' + (y ? delta(varia(x.marcacoes, y.marcacoes)) : "—") +
            '</td><td class="n">' + pct(c) + '</td><td class="n">' + num(x.clientes) + '</td><td class="n">' + num(x.novos) + "</td><td>" + spark(ult12.map((k) => linha("loja", k, l)?.marcacoes || 0)) + "</td></tr>"; }).join("") + "</tbody></table></div></section>";
    }
    const bs = E.stats.filter((x) => x.nivel === "barbeiro" && x.mes === m && (!E.loja || x.loja === E.loja) && x.marcacoes > 0).sort((x, y) => y.marcacoes - x.marcacoes);
    h += '<section class="bk-sec"><h3>Barbeiros · ' + esc(rotMes(m)) + '</h3><div class="tabela-scroll"><table class="crm-tabela bk-tab"><thead><tr><th>Barbeiro</th><th class="n">Marcações</th><th class="n">vs mês anterior</th><th class="n">Clientes</th><th class="n">Novos</th><th class="n">Canceladas</th></tr></thead><tbody>' +
      (bs.length ? bs.map((x) => { const p = linha("barbeiro", mesAnt(m), x.loja, x.chave); const c = x.marcacoes + x.canceladas ? x.canceladas / (x.marcacoes + x.canceladas) * 100 : null;
        return "<tr><td><b>" + esc(x.chave) + "</b><small>" + esc(x.loja) + '</small></td><td class="n">' + num(x.marcacoes) + '</td><td class="n">' + delta(varia(x.marcacoes, p?.marcacoes)) + '</td><td class="n">' + num(x.clientes) + '</td><td class="n">' + num(x.novos) + '</td><td class="n">' + pct(c) + "</td></tr>"; }).join("")
        : '<tr><td colspan="6" class="muted">Sem marcações neste mês.</td></tr>') + "</tbody></table></div></section>";
    const sv = new Map();
    E.stats.filter((x) => x.nivel === "servico" && x.mes === m && (!E.loja || x.loja === E.loja)).forEach((x) => sv.set(x.chave, (sv.get(x.chave) || 0) + x.marcacoes));
    const svs = [...sv.entries()].filter((x) => x[1] > 0).sort((x, y) => y[1] - x[1]), tot = svs.reduce((s, x) => s + x[1], 0), mx = svs[0]?.[1] || 1;
    h += '<div class="bk-duas"><section class="bk-sec"><h3>Serviços · ' + esc(rotMes(m)) + '</h3><div class="barras-h">' + svs.map(([r, v]) => '<div class="bh"><span class="bh-r">' + esc(r) + '</span><span class="bh-v">' + num(v) + " <small>" + Math.round((v / tot) * 100) + '%</small></span><div class="barra-p"><i style="width:' + Math.max(2, (v / mx) * 100) + '%"></i></div></div>').join("") + "</div></section>" +
      '<section class="bk-sec"><h3>Dias e horas com mais movimento</h3>' + mapaHoras() + "</section></div>";
    return h + blocoImportar(false);
  }

  function clique(acao, el) {
    if (acao === "bk-loja") { E.loja = el.dataset.v; render(); window.scrollTo({ top: 0, behavior: "smooth" }); return true; }
    return false;
  }
  function mudar(e) {
    const t = e.target;
    if (t.id === "bk-loja") { E.loja = t.value; render(); return true; }
    if (t.id === "bk-mes") { E.mes = t.value; render(); return true; }
    if (t.id === "bk-fich") { const f = t.files?.[0]; t.value = ""; if (f) importar(f); return true; }
    return false;
  }
  function reiniciar() { Object.assign(E, { estado: "por-carregar", stats: [], horas: [], imp: null, loja: "", mes: "", bk: null }); }
  return { vista, clique, mudar, reiniciar };
}
