// Central 26 — 26 Academy: base de dados de formandos e formações, com estatística regional.
// De onde vêm os formandos (Norte, Centro, Sul, Regiões Autónomas, estrangeiro), por formação e no total.
import { normalizar, eGestor, paginar, paginador, MES } from "./dados.js";
import { REGIOES, CONCELHOS, resolverRegiao } from "./academy-regioes.js";

export const podeAcademy = (eu) => !!eu && (eGestor(eu) || eu.departamento_id === "administrativo");

// Zonas do resumo (cada zona tem sempre a mesma cor)
export const ZONAS = ["Norte", "Centro", "Sul", "Açores", "Madeira", "Estrangeiro", "Sem dados"];
const ZONA_CLASSE = { Norte: "z1", Centro: "z2", Sul: "z3", "Açores": "z4", Madeira: "z5", Estrangeiro: "z6", "Sem dados": "z0" };
const ZONAS_PADRAO = { Norte: "Norte", Centro: "Centro", "Oeste e Vale do Tejo": "Centro", "Grande Lisboa": "Sul", "Península de Setúbal": "Sul", Alentejo: "Sul", Algarve: "Sul", "Açores": "Açores", Madeira: "Madeira", Estrangeiro: "Estrangeiro" };
const CONTINENTE = ["Norte", "Centro", "Sul"];
const n = (s) => normalizar(s).replace(/\s+/g, " ").trim();
const num = (v) => Number(v || 0).toLocaleString("pt-PT");
const pct = (v, t) => (t ? (v / t) * 100 : 0);
const pctTxt = (v, t) => (Math.round(pct(v, t) * 10) / 10).toLocaleString("pt-PT", { maximumFractionDigits: 1 }) + "%";
const cancelada = (f) => /cancel/i.test(f.estado || "");
const concluida = (f) => /conclu/i.test(f.estado || "");
const dataCurta = (s) => { if (!s) return ""; const [a, m, d] = String(s).split("-").map(Number); return d + " " + MES[m - 1] + " " + a; };
const pl = (v, um, varios) => num(v) + " " + (v === 1 ? um : varios);

// Lê o ficheiro tirado da Secretaria Online e prepara a importação, já com a região de cada formando
export function prepararImportacao(dados, fonte) {
  const meses = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
  const data = (s) => {
    const m = String(s || "").match(/^(\d{1,2})-([a-zç]{3})-(\d{2,4})$/i);
    if (m && meses[m[2].toLowerCase()]) { const a = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return a + "-" + String(meses[m[2].toLowerCase()]).padStart(2, "0") + "-" + m[1].padStart(2, "0"); }
    return /^\d{4}-\d{2}-\d{2}$/.test(s || "") ? s : "";
  };
  if (!dados || !Array.isArray(dados.accoes) || !Array.isArray(dados.formandos)) throw new Error("Este ficheiro não é uma exportação de formandos da Academy.");
  const formacoes = dados.accoes.map((a) => ({
    externo_id: String(a.id), nome: String(a.nome || "").replace(/^Acção\s+(?=Ação)/i, "").trim().slice(0, 200) || "Ação", curso: a.curso || "", ano: a.agrupamento || "",
    local: a.local || "", inicio: data(a.inicio), estado: a.estado || "", estado_em: data(a.estado_em),
  }));
  const formandos = dados.formandos.filter((f) => f && f.id != null && String(f.nome || "").trim()).map((f) => {
    const r = resolverRegiao(f);
    return { externo_id: String(f.id), nome: String(f.nome).trim().slice(0, 200), pais: f.pais || "Portugal", cp4: /^\d{4}$/.test(f.cp4 || "") ? f.cp4 : "",
      localidade: f.localidade || "", concelho: r.concelho || f.concelho || "", distrito: f.distrito || "", concelho_codigo: r.concelho_codigo || "", regiao: r.regiao, regiao_aprox: !!r.aprox };
  });
  const inscricoes = dados.accoes.flatMap((a) => (a.inscricoes || []).map((i) => ({ formacao: String(a.id), formando: String(i.formando), desistente: !!i.desistente })));
  const semRegiao = formandos.filter((f) => !f.regiao).length, aprox = formandos.filter((f) => f.regiao_aprox).length;
  return { fonte, formacoes, formandos, inscricoes, resumo: { formacoes: formacoes.length, formandos: formandos.length, inscricoes: inscricoes.length, semRegiao, aprox } };
}

// A região sai sempre da residência (o que vem da Secretaria Online chega sem ela)
function comRegiao(t) {
  if (!t) return t;
  const r = resolverRegiao(t);
  return { ...t, concelho: r.concelho || t.concelho || "", concelho_codigo: r.concelho_codigo || "", regiao: r.regiao || "", regiao_aprox: !!r.aprox };
}

export function criarAcademy(ctx) {
  const { S, api, esc, I, toast, falha, render, agendarRender, renderPainel, abrir, fechar, $ } = ctx;
  const A = (S.aca = { estado: "por-carregar", formacoes: {}, formandos: {}, insc: [], config: null, tab: "painel", ultimoParam: undefined, q: "", fZona: "", pag: 1, aImportar: null, importando: false, geo: null, confirmar: false });
  let desligar = null;
  const pode = () => podeAcademy(S.eu);

  async function carregar() {
    if (!pode()) return;
    if (A.estado !== "pronto") A.estado = "a-carregar";
    agendarRender();
    try {
      const d = await api.aca.carregar();
      A.formacoes = Object.fromEntries(d.formacoes.map((f) => [f.id, f]));
      A.formandos = Object.fromEntries(d.formandos.map((f) => [f.id, comRegiao(f)]));
      A.insc = d.inscricoes; A.config = d.config;
      A.estado = "pronto";
      if (!desligar && api.aca.subscrever) desligar = api.aca.subscrever(aoMudar);
    } catch (e) {
      A.estado = /aca_|PGRST205|does not exist|FALTA_SCRIPT/i.test(e.message) ? "falta-script" : "erro"; A.erro = e.message;
    }
    agendarRender();
    if (S.aberto && ["formacao", "formando"].includes(S.aberto.tipo)) renderPainel(true);
  }
  // Atualização automática: o que alguém muda (ou importa) entra logo no painel de toda a gente
  let tPainel = null;
  function aoMudar(tabela, ev, novo, antigo) {
    if (tabela === "aca_formacoes") { if (ev === "DELETE") delete A.formacoes[antigo.id]; else A.formacoes[novo.id] = novo; }
    else if (tabela === "aca_formandos") { if (ev === "DELETE") delete A.formandos[antigo.id]; else A.formandos[novo.id] = comRegiao(novo); }
    else if (tabela === "aca_inscricoes") {
      const r = ev === "DELETE" ? antigo : novo;
      if (!r || !r.formacao_id) return;
      A.insc = A.insc.filter((i) => !(i.formacao_id === r.formacao_id && i.formando_id === r.formando_id));
      if (ev !== "DELETE") A.insc.push({ formacao_id: novo.formacao_id, formando_id: novo.formando_id, desistente: !!novo.desistente });
    } else if (tabela === "aca_config" && novo) A.config = novo;
    agendarRender();
    // o painel aberto só se redesenha quando ninguém está a escrever nele
    if (S.aberto && ["formacao", "formando"].includes(S.aberto.tipo)) { clearTimeout(tPainel); tPainel = setTimeout(() => renderPainel(), 250); }
  }

  /* ------------------------------ cálculos ------------------------------ */
  const zonas = () => ({ ...ZONAS_PADRAO, ...(A.config?.zonas || {}) });
  const zonaDe = (f) => (!f || !f.regiao ? "Sem dados" : zonas()[f.regiao] || "Sem dados");
  const ordemFormacao = (a, b) => String(a.inicio || "").localeCompare(String(b.inicio || "")) || a.nome.localeCompare(b.nome, "pt", { numeric: true });
  const formacoesValidas = () => Object.values(A.formacoes).filter((f) => !cancelada(f)).sort(ordemFormacao);
  const inscritosDe = (fid) => A.insc.filter((i) => i.formacao_id === fid);
  const formandosDe = (fid) => inscritosDe(fid).map((i) => A.formandos[i.formando_id]).filter(Boolean);
  const formacoesDe = (tid) => A.insc.filter((i) => i.formando_id === tid).map((i) => ({ ...i, f: A.formacoes[i.formacao_id] })).filter((x) => x.f);
  function contar(lista, chave) { const c = {}; lista.forEach((x) => { const k = chave(x); c[k] = (c[k] || 0) + 1; }); return c; }
  // Para a estatística contam os formandos de formações não canceladas (e os registados à mão ainda sem formação)
  function formandosContam() {
    const validas = new Set(formacoesValidas().map((f) => f.id)), com = new Set(), algum = new Set();
    A.insc.forEach((i) => { algum.add(i.formando_id); if (validas.has(i.formacao_id)) com.add(i.formando_id); });
    return Object.values(A.formandos).filter((t) => com.has(t.id) || !algum.has(t.id));
  }

  /* ------------------------------ gráficos ------------------------------ */
  const ponto = (z) => '<i class="aca-pt ' + ZONA_CLASSE[z] + '" aria-hidden="true"></i>';
  function barrasZonas(cont, total) {
    if (!total) return '<p class="muted">Ainda sem formandos.</p>';
    return '<div class="barras-h aca-zonas">' + ZONAS.filter((z) => cont[z]).map((z) => '<div class="bh"><span class="bh-r">' + ponto(z) + esc(z) + '</span><span class="bh-v">' + pctTxt(cont[z], total) + " <small>" + pl(cont[z], "formando", "formandos") + "</small></span>" +
      '<div class="barra-p"><i class="' + ZONA_CLASSE[z] + '" style="width:' + Math.max(1.5, pct(cont[z], total)).toFixed(1) + '%"></i></div></div>').join("") + "</div>";
  }
  function barraEmpilhada(cont, total) {
    const zs = ZONAS.filter((z) => cont[z]);
    if (!total) return '<span class="aca-emp vazio-b"></span>';
    return '<span class="aca-emp" role="img" aria-label="' + esc(zs.map((z) => z + " " + pctTxt(cont[z], total)).join(", ")) + '">' +
      zs.map((z) => '<i class="' + ZONA_CLASSE[z] + '" style="flex-grow:' + cont[z] + '" title="' + esc(z + ": " + pl(cont[z], "formando", "formandos") + " (" + pctTxt(cont[z], total) + ")") + '"></i>').join("") + "</span>";
  }
  const legenda = (zs) => '<div class="aca-leg">' + zs.map((z) => "<span>" + ponto(z) + esc(z) + "</span>").join("") + "</div>";

  // Mapa de Portugal por concelho (limites oficiais da CAOP), em SVG
  function carregarGeo() {
    if (A.geo) return;
    A.geo = "a-carregar";
    fetch("geo/portugal.json").then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then((g) => {
      const kx = Math.cos(39.5 * Math.PI / 180);
      const caixas = { cont: { cx: -9.52, cy: 42.16, k: 95, dx: 152, dy: 6 }, acores: { cx: -31.3, cy: 39.75, k: 30, dx: 4, dy: 272 }, madeira: { cx: -17.3, cy: 33.15, k: 80, dx: 40, dy: 420 } };
      A.geo = g.concelhos.features.map((f) => {
        const dt = +f.properties.dt, c = dt >= 40 ? caixas.acores : dt >= 30 ? caixas.madeira : caixas.cont;
        const pols = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
        let d = "";
        for (const pol of pols) for (const anel of pol) {
          if (dt >= 30 && dt < 40 && anel[0][1] < 31) continue; // as Selvagens ficariam fora do quadro
          let ult = "", s = "";
          for (const [lo, la] of anel) {
            const p = ((lo - c.cx) * kx * c.k + c.dx).toFixed(1) + "," + ((c.cy - la) * c.k + c.dy).toFixed(1);
            if (p !== ult) { s += (s ? "L" : "M") + p; ult = p; }
          }
          d += s + "Z";
        }
        return { codigo: f.properties.id, nome: f.properties.nome, d };
      });
      agendarRender();
    }).catch(() => { A.geo = "erro"; agendarRender(); });
  }
  function mapa(lista) {
    carregarGeo();
    if (A.geo === "erro") return "";
    if (!Array.isArray(A.geo)) return '<div class="aca-mapa"><p class="muted">A desenhar o mapa…</p></div>';
    const c = contar(lista.filter((t) => t.concelho_codigo), (t) => t.concelho_codigo), max = Math.max(0, ...Object.values(c));
    // 4 classes até ao máximo (sem repetir limites quando há poucos formandos)
    const lim = [...new Set([1, Math.ceil(max * 0.25), Math.ceil(max * 0.5), Math.ceil(max * 0.75)].filter((v) => v >= 1))].sort((a, b) => a - b);
    const nivel = (v) => (!v ? 0 : lim.filter((x) => v >= x).length);
    const cls = (k) => "aca-m" + (lim.length < 4 && k ? k + (4 - lim.length) : k);
    let s = '<svg viewBox="0 0 400 505" role="img" aria-label="Mapa de Portugal com o número de formandos por concelho"><text x="4" y="262" class="aca-mapa-t">Açores</text><text x="40" y="412" class="aca-mapa-t">Madeira</text>';
    s += A.geo.map((p) => { const v = c[p.codigo] || 0; return '<path d="' + p.d + '" class="' + cls(nivel(v)) + '"><title>' + esc(p.nome) + ": " + (v ? pl(v, "formando", "formandos") : "sem formandos") + "</title></path>"; }).join("");
    s += "</svg>";
    const leg = '<div class="aca-mapa-leg"><span><i class="aca-m0"></i>0</span>' + lim.map((de, i) => { const ate = i + 1 < lim.length ? lim[i + 1] - 1 : max; return '<span><i class="' + cls(i + 1) + '"></i>' + (de === ate ? de : de + "–" + ate) + "</span>"; }).join("") + "</div>";
    return '<div class="aca-mapa">' + s + leg + "</div>";
  }

  /* ------------------------------ vistas ------------------------------ */
  function vista(param) {
    if (A.estado === "por-carregar") carregar();
    if (param !== A.ultimoParam) { A.ultimoParam = param; A.tab = ["formacoes", "formandos", "importar", "definicoes"].includes(param) ? param : "painel"; }
    const g = eGestor(S.eu);
    const acao = A.estado !== "pronto" ? "" : A.tab === "formandos" ? '<button class="btn pri" data-acao="aca-formando-novo">' + I.plus + "Novo formando</button>" : A.tab === "formacoes" ? '<button class="btn pri" data-acao="aca-formacao-nova">' + I.plus + "Nova formação</button>" : "";
    let h = '<div class="cab" data-marca="academy"><div><div class="eyebrow">26 Academy</div><h1>Formandos e formações</h1><p class="sub-cab">Todos os formandos e formações da Academy, e de onde vêm os formandos: Norte, Centro, Sul e Regiões Autónomas. Os números atualizam-se sozinhos sempre que entram formandos ou formações novas.</p></div>' +
      (acao ? '<div class="acts">' + acao + "</div>" : "") + "</div>";
    const tabs = [["painel", "Estatística"], ["formacoes", "Formações"], ["formandos", "Formandos"], ["importar", "Secretaria Online"]].concat(g ? [["definicoes", "Definições"]] : []);
    h += '<div class="tabs" role="tablist">' + tabs.map(([k, r]) => '<button class="tab" role="tab" data-acao="aca-tab" data-tab="' + k + '" aria-selected="' + (A.tab === k) + '">' + r + "</button>").join("") + "</div>";
    if (A.estado === "falta-script") return h + '<div class="vazio"><h3>Falta instalar a Academy na base de dados</h3><p>No Supabase, abre o SQL Editor, cola o ficheiro <b>supabase/19-academy.sql</b> do GitHub e carrega em Run. Depois recarrega esta página.</p></div>';
    if (A.estado === "erro") return h + '<div class="aviso erro">Não foi possível abrir a Academy: ' + esc(A.erro || "") + "</div>";
    if (A.estado !== "pronto") return h + '<div class="tabela"><div class="esqueleto"><i style="width:50%"></i></div></div>';
    if (A.tab === "importar") return h + vistaImportar();
    if (A.tab === "definicoes" && g) return h + vistaDefinicoes();
    if (A.tab === "formacoes") return h + vistaFormacoes();
    if (!Object.keys(A.formandos).length) return h + '<div class="vazio"><h3>Ainda não há formandos</h3><p>Em «Secretaria Online», lê os dados de lá ou importa o ficheiro. Também podes registar os formandos à mão.</p><div class="acts"><button class="btn pri" data-acao="aca-tab" data-tab="importar">Secretaria Online</button><button class="btn sec" data-acao="aca-formando-novo">' + I.plus + "Novo formando</button></div></div>";
    if (A.tab === "formandos") return h + vistaFormandos();
    return h + vistaPainel();
  }

  const kpi = (rot, val, nota = "") => '<div class="kpi"><span>' + esc(rot) + "</span><b>" + val + "</b>" + (nota ? "<small>" + esc(nota) + "</small>" : "") + "</div>";

  function vistaPainel() {
    const tf = formandosContam(), total = tf.length, validas = formacoesValidas();
    const concl = validas.filter(concluida).length, aval = validas.filter((f) => /avalia/i.test(f.estado || "")).length, outras = validas.length - concl - aval;
    const idsValidas = new Set(validas.map((f) => f.id)), insc = A.insc.filter((i) => idsValidas.has(i.formacao_id));
    const repetentes = Object.values(contar(insc, (i) => i.formando_id)).filter((v) => v > 1).length;
    const cz = contar(tf, zonaDe), regs = contar(tf.filter((t) => t.regiao), (t) => t.regiao);
    const aprox = tf.filter((t) => t.regiao_aprox).length, sem = cz["Sem dados"] || 0;
    let h = '<div class="resumo-crm aca-kpis">' +
      kpi("Formandos", num(total), repetentes ? pl(repetentes, "fez mais de uma formação", "fizeram mais de uma formação") : "") +
      kpi("Formações realizadas", num(validas.length), [concl ? pl(concl, "concluída", "concluídas") : "", outras ? outras + " a decorrer" : "", aval ? aval + " em avaliação" : ""].filter(Boolean).join(" · ")) +
      CONTINENTE.map((z) => kpi("Do " + z, pctTxt(cz[z] || 0, total), pl(cz[z] || 0, "formando", "formandos"))).join("") + "</div>";
    const ilhas = (cz["Açores"] || 0) + (cz.Madeira || 0);
    h += '<div class="duas aca-duas"><section class="cartao-sec"><h3>De onde vêm os formandos</h3>' + barrasZonas(cz, total);
    const notas = [];
    if (!ilhas) notas.push("Ainda não há formandos das Regiões Autónomas.");
    if (aprox) notas.push(pl(aprox, "formando tem", "formandos têm") + " a região deduzida só pelo distrito ou pelo código postal.");
    h += notas.map((t) => '<p class="nota-tab">' + esc(t) + "</p>").join("");
    if (sem) h += '<p class="nota-tab">' + esc(pl(sem, "formando", "formandos") + " sem residência registada.") + ' <button class="c-link" data-acao="aca-ver-sem">Ver quais</button></p>';
    h += '<h4 class="aca-h4">Por região (NUTS II)</h4><div class="barras-h">' + REGIOES.filter((r) => regs[r]).sort((a, b) => regs[b] - regs[a] || REGIOES.indexOf(a) - REGIOES.indexOf(b)).map((r) =>
      '<div class="bh"><span class="bh-r">' + esc(r) + (zonas()[r] && zonas()[r] !== r ? ' <small class="muted">· ' + esc(zonas()[r]) + "</small>" : "") + '</span><span class="bh-v">' + num(regs[r]) + " <small>" + pctTxt(regs[r], total) + '</small></span><div class="barra-p"><i class="' + ZONA_CLASSE[zonas()[r]] + '" style="width:' + pct(regs[r], total).toFixed(1) + '%"></i></div></div>').join("") + "</div>";
    h += '</section><section class="cartao-sec"><h3>Por concelho</h3>' + mapa(tf) + topConcelhos(tf) + "</section></div>";
    h += '<section class="cartao-sec aca-comp-sec"><h3>Comparação entre formações</h3><p>O peso de cada zona nos formandos de cada formação (sem as canceladas). Toca numa formação para ver o detalhe.</p>' + legenda(ZONAS.filter((z) => cz[z])) + comparacao(validas) + "</section>" + linhaSinc();
    return h;
  }
  function topConcelhos(tf) {
    const c = contar(tf.filter((t) => t.concelho), (t) => t.concelho), l = Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt")).slice(0, 8);
    if (!l.length) return "";
    return '<h4 class="aca-h4">Concelhos com mais formandos</h4><ol class="aca-top">' + l.map(([k, v]) => "<li><span>" + esc(k) + "</span><b>" + num(v) + "</b></li>").join("") + "</ol>";
  }
  function comparacao(validas) {
    if (!validas.length) return '<p class="muted">Ainda sem formações.</p>';
    return '<div class="aca-comp">' + validas.slice().reverse().map((f) => {
      const lista = formandosDe(f.id), c = contar(lista, zonaDe);
      const resumo = CONTINENTE.filter((z) => c[z]).map((z) => z + " " + pctTxt(c[z], lista.length)).join(" · ");
      return '<button class="aca-comp-l" data-acao="aca-formacao" data-id="' + esc(f.id) + '"><span class="aca-comp-n"><b>' + esc(f.nome) + "</b><small>" + esc([dataCurta(f.inicio), f.local].filter(Boolean).join(" · ")) + "</small></span>" +
        barraEmpilhada(c, lista.length) + '<span class="aca-comp-v"><b>' + num(lista.length) + "</b><small>" + esc(resumo || "—") + "</small></span></button>";
    }).join("") + "</div>";
  }

  function vistaFormacoes() {
    const todas = Object.values(A.formacoes).sort((a, b) => ordemFormacao(b, a));
    if (!todas.length) return '<div class="vazio"><h3>Ainda não há formações</h3><p>Lê-as da Secretaria Online (no separador com o mesmo nome) ou cria uma em «Nova formação».</p></div>';
    return '<div class="tabela-scroll"><table class="crm-tabela aca-tab tab-cartoes"><thead><tr><th>Formação</th><th>Início</th><th>Estado</th><th class="n">Formandos</th><th>Origem dos formandos</th></tr></thead><tbody>' +
      todas.map((f) => {
        const ins = inscritosDe(f.id), lista = formandosDe(f.id), c = contar(lista, zonaDe), des = ins.filter((i) => i.desistente).length;
        return '<tr data-acao="aca-formacao" data-id="' + esc(f.id) + '"' + (cancelada(f) ? ' class="aca-cancelada"' : "") + "><td><b>" + esc(f.nome) + "</b><small>" + esc([f.curso, f.local].filter(Boolean).join(" · ")) + "</small></td><td>" + esc(dataCurta(f.inicio) || "—") + "</td><td>" + esc(f.estado || "—") +
          '</td><td class="n mono">' + pl(lista.length, "formando", "formandos") + (des ? "<small>" + pl(des, "desistente", "desistentes") + "</small>" : "") + '</td><td class="aca-td-emp">' + (lista.length ? barraEmpilhada(c, lista.length) : "") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function filtrados() {
    const q = n(A.q);
    return Object.values(A.formandos).filter((t) => (!A.fZona || zonaDe(t) === A.fZona) && (!q || n([t.nome, t.concelho, t.localidade, t.distrito, t.regiao, t.pais].join(" ")).includes(q)))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
  }
  function vistaFormandos() {
    const l = filtrados(), pg = paginar(l, A.pag, 50); A.pag = pg.pag;
    let h = '<div class="barra"><div class="ferr"><label class="pesq">' + I.lupa + '<span class="sr">Procurar formandos</span><input id="aca-q" type="search" placeholder="Nome, concelho, localidade…" value="' + esc(A.q) + '"></label>' +
      '<label class="sr" for="aca-fzona">Zona</label><select class="sel" id="aca-fzona"><option value="">Todas as zonas</option>' + ZONAS.map((z) => '<option value="' + esc(z) + '"' + (A.fZona === z ? " selected" : "") + ">" + esc(z) + "</option>").join("") + "</select></div></div>";
    if (!l.length) return h + '<div class="vazio"><h3>Nenhum formando encontrado</h3><p>Experimenta outro nome ou outra zona.</p></div>';
    h += '<div class="tabela-scroll"><table class="crm-tabela aca-tab tab-cartoes"><thead><tr><th>Formando</th><th>Residência</th><th>Região</th><th class="n">Formações</th></tr></thead><tbody>' +
      pg.itens.map((t) => {
        const z = zonaDe(t), res = [t.localidade && n(t.localidade) !== n(t.concelho) ? t.localidade : "", t.concelho, t.pais && t.pais !== "Portugal" ? t.pais : ""].filter(Boolean).join(", ");
        return '<tr data-acao="aca-formando" data-id="' + esc(t.id) + '"><td><b>' + esc(t.nome) + "</b></td><td>" + esc(res || "Sem residência") + "</td><td>" + ponto(z) + esc(t.regiao && t.regiao !== z ? z + " · " + t.regiao : z) +
          (t.regiao_aprox ? ' <small class="muted" title="Deduzida só pelo distrito ou pelo código postal">aproximada</small>' : "") + '</td><td class="n mono">' + formacoesDe(t.id).length + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    return h + paginador(pg, "aca-pag", "formandos");
  }

  const quando = (ts) => { const d = new Date(ts), hoje = new Date().toDateString() === d.toDateString(); return (hoje ? "hoje" : d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" })) + " às " + d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }); };
  function linhaSinc() {
    const c = A.config;
    if (!c?.sinc_em) return "";
    return '<p class="nota-tab aca-sinc-l">' + (c.sinc_ok === false ? '<b class="at">A ligação à Secretaria Online falhou ' + esc(quando(c.sinc_em)) + ".</b> " : "Dados da Secretaria Online lidos " + esc(quando(c.sinc_em)) + ". ") +
      '<a href="#academy-importar">Ver a ligação</a></p>';
  }
  function vistaImportar() {
    const a = A.aImportar, c = A.config || {}, s = A.sinc;
    let h = '<section class="cartao-sec"><h3>Ligação à Secretaria Online</h3><p>A Central lê sozinha a Secretaria Online duas vezes por dia (de manhã e ao fim da tarde): as ações novas, as que estão a decorrer ou em avaliação e as que mudaram de estado, com os formandos de cada uma e a residência dos formandos novos. Só lê: nunca altera nada na Secretaria Online.</p>';
    if (c.sinc_em) h += c.sinc_ok === false ? '<div class="aviso erro">Última tentativa ' + esc(quando(c.sinc_em)) + ": " + esc(c.sinc_msg || "falhou.") + "</div>"
      : '<p class="aca-sinc-ok"><svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg><span>Última leitura ' + esc(quando(c.sinc_em)) + (c.sinc_msg ? " · " + esc(c.sinc_msg) : "") + "</span></p>";
    else h += "<p>Ainda não houve nenhuma leitura automática.</p>";
    if (s?.aCorrer) h += '<p class="aca-sinc-ok"><span class="aca-roda" aria-hidden="true"></span><span>' + esc(s.msg) + "</span></p>";
    h += '<div class="acts"><button class="btn pri" data-acao="aca-sinc" data-modo="agora"' + (s?.aCorrer ? " disabled" : "") + ">Ler agora</button>" +
      '<button class="btn sec" data-acao="aca-sinc" data-modo="completa"' + (s?.aCorrer ? " disabled" : "") + ">Ler tudo outra vez</button></div>" +
      '<p class="nota-tab">«Ler tudo outra vez» volta a ler todas as ações e as fichas de todos os formandos (demora alguns minutos). Se corrigires aqui a residência de um formando, a correção fica, mesmo que na Secretaria Online esteja diferente.</p></section>';
    h += '<section class="cartao-sec"><h3>Importar um ficheiro</h3><p>Carrega o ficheiro .json com as ações e os formandos tirado da Secretaria Online da 26 Academy. Quem já existir é atualizado pelo número da Secretaria Online, sem duplicar; os formandos registados à mão não são tocados.</p>' +
      '<p>Só entram o nome, a residência (país, código postal, localidade, concelho e distrito) e as inscrições em cada ação. A região de cada formando é calculada a partir do concelho.</p>' +
      '<div class="acts"><label class="btn sec">' + I.plus + 'Escolher ficheiro<input type="file" id="aca-ficheiro" accept=".json,application/json" hidden></label></div>';
    if (A.config?.ultima_importacao) h += '<p class="nota-tab">Última importação: ' + esc(new Date(A.config.ultima_importacao).toLocaleString("pt-PT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })) + (A.config.ultima_fonte ? " · " + esc(A.config.ultima_fonte) : "") + "</p>";
    h += "</section>";
    if (a?.erro) h += '<div class="aviso erro">' + esc(a.erro) + "</div>";
    else if (a?.resumo) {
      const r = a.resumo;
      h += '<section class="cartao-sec"><h3>' + esc(a.fonte) + '</h3><div class="resumo-crm">' + kpi("Formações", num(r.formacoes)) + kpi("Formandos", num(r.formandos)) + kpi("Inscrições", num(r.inscricoes)) + "</div>" +
        (r.semRegiao ? "<p>" + esc(pl(r.semRegiao, "formando não tem", "formandos não têm") + " residência suficiente para saber a região. Podes completar depois, em Formandos.") + "</p>" : "") +
        (r.aprox ? "<p>" + esc(pl(r.aprox, "formando fica", "formandos ficam") + " com a região deduzida só pelo distrito ou pelo código postal.") + "</p>" : "") +
        '<div class="acts"><button class="btn pri" data-acao="aca-importar"' + (A.importando ? " disabled" : "") + ">" + (A.importando ? "A importar…" : "Importar") + '</button><button class="btn sec" data-acao="aca-importar-cancelar"' + (A.importando ? " disabled" : "") + ">Cancelar</button></div></section>";
    }
    return h;
  }

  function vistaDefinicoes() {
    const z = zonas(), id = (r) => "aca-z-" + n(r).replace(/[^a-z]+/g, "-");
    return '<section class="cartao-sec"><h3>Norte, Centro e Sul</h3><p>Em que zona do resumo conta cada região oficial (NUTS II, versão de 2024). Os Açores, a Madeira e o estrangeiro aparecem sempre à parte.</p><div class="aca-def">' +
      REGIOES.filter((r) => !["Açores", "Madeira", "Estrangeiro"].includes(r)).map((r) => '<div class="campo"><label for="' + id(r) + '">' + esc(r) + '</label><select id="' + id(r) + '" data-aca-zona="' + esc(r) + '">' +
        CONTINENTE.map((o) => '<option value="' + o + '"' + (z[r] === o ? " selected" : "") + ">" + o + "</option>").join("") + "</select></div>").join("") +
      '</div><p class="nota-tab">Desde 2024, o Oeste, o Médio Tejo e a Lezíria do Tejo formam a região «Oeste e Vale do Tejo», e a antiga Área Metropolitana de Lisboa divide-se em «Grande Lisboa» e «Península de Setúbal». Cada concelho conta na região a que pertence, mesmo nos distritos divididos (por exemplo, Santa Maria da Feira, do distrito de Aveiro, conta no Norte).</p></section>';
  }

  /* ------------------------------ painéis ------------------------------ */
  const mold = (label, c) => '<div class="veu" data-acao="fechar"></div><aside class="painel" role="dialog" aria-label="' + esc(label) + '" data-marca="academy"><div class="p-scroll">' + c + "</div></aside>";
  const topo = (rot, apagar) => '<div class="p-topo"><span class="migalha"><i></i>26 Academy / ' + rot + '</span><span class="acts">' + (apagar ? '<button class="ib perigo" data-acao="' + apagar + '">' + I.lixo + "Eliminar</button>" : "") + '<button class="ib" data-acao="fechar" aria-label="Fechar">' + I.x + "</button></span></div>";
  const campo = (id, rot, val, extra = "") => '<div class="campo"><label for="' + id + '">' + rot + '</label><input id="' + id + '" value="' + esc(val || "") + '"' + extra + "></div>";

  function painel(a) {
    if (A.estado === "por-carregar") carregar();
    if (A.estado !== "pronto") return mold("26 Academy", topo(a.tipo === "formando" ? "Formando" : "Formação") + '<div class="esqueleto"><i style="width:60%"></i></div>');
    return a.tipo === "formando" ? painelFormando(a) : painelFormacao(a);
  }
  const confirmar = (txt, sim) => '<div class="aviso erro aviso-acao"><span>' + txt + '</span><span class="acts"><button class="btn sec" data-acao="aca-apagar-nao">Manter</button><button class="btn perigo" data-acao="' + sim + '">Eliminar</button></span></div>';

  function painelFormacao(a) {
    const nova = !a.id, f = nova ? { nome: "", curso: "", local: "", inicio: "", estado: "" } : A.formacoes[a.id];
    if (!f) return mold("Formação", topo("Formação") + '<div class="vazio"><h3>Esta formação já não existe</h3><p>Pode ter sido eliminada.</p></div>');
    let h = topo("Formação", nova ? "" : "aca-formacao-apagar");
    if (A.confirmar && !nova) h += confirmar("Eliminar «" + esc(f.nome) + "»? Sai da estatística, com as inscrições (os formandos ficam)." + (f.externo_id ? " Se voltares a importar da Secretaria Online, volta a entrar." : ""), "aca-formacao-apagar-sim");
    h += '<h2 class="aca-p-h">' + esc(nova ? "Nova formação" : f.nome) + "</h2>";
    if (!nova) {
      const ins = inscritosDe(f.id), lista = ins.map((i) => ({ i, t: A.formandos[i.formando_id] })).filter((x) => x.t).sort((x, y) => x.t.nome.localeCompare(y.t.nome, "pt"));
      const c = contar(lista.map((x) => x.t), zonaDe), des = ins.filter((i) => i.desistente).length;
      h += '<section class="p-sec"><h3>Origem dos formandos</h3><div class="resumo-crm aca-kpis">' + kpi("Formandos", num(lista.length), des ? pl(des, "desistente", "desistentes") : "") +
        CONTINENTE.map((z) => kpi(z, pctTxt(c[z] || 0, lista.length), pl(c[z] || 0, "formando", "formandos"))).join("") + "</div>" + barrasZonas(c, lista.length) + "</section>";
      const fora = Object.values(A.formandos).filter((t) => !ins.some((x) => x.formando_id === t.id)).sort((x, y) => x.nome.localeCompare(y.nome, "pt"));
      h += '<section class="p-sec"><h3>Formandos <span class="mono muted">' + lista.length + "</span></h3>" + (lista.length ? '<ul class="aca-lista">' + lista.map(({ i, t }) => '<li><span class="aca-l-n"><button class="c-link" data-acao="aca-formando" data-id="' + esc(t.id) + '">' + esc(t.nome) + "</button><small>" + ponto(zonaDe(t)) + esc([t.concelho, zonaDe(t)].filter(Boolean).join(" · ")) + "</small></span>" +
        '<label class="aca-des"><input type="checkbox" data-aca-desist="' + esc(t.id) + '"' + (i.desistente ? " checked" : "") + "> Desistiu</label>" +
        '<button class="ib" data-acao="aca-tirar" data-id="' + esc(t.id) + '" aria-label="Tirar ' + esc(t.nome) + ' da formação" title="Tirar da formação">' + I.x + "</button></li>").join("") + "</ul>" : '<p class="muted">Ainda sem formandos.</p>') +
        (fora.length ? '<div class="aca-juntar"><label class="sr" for="aca-juntar-q">Juntar formando</label><input id="aca-juntar-q" list="aca-todos" placeholder="Juntar formando: escreve o nome" autocomplete="off"><datalist id="aca-todos">' + fora.map((t) => '<option value="' + esc(t.nome) + '">').join("") + '</datalist><button class="btn sec" data-acao="aca-juntar">Juntar</button></div>' : "") + "</section>";
    }
    h += '<section class="p-sec"><h3>' + (nova ? "Dados da formação" : "Editar") + '</h3><form class="form" id="form-aca-formacao" novalidate>' + campo("af-nome", "Nome", f.nome, ' maxlength="200" required placeholder="Ex.: Ação 23"') +
      '<div class="campos-2">' + campo("af-curso", "Curso", f.curso, ' maxlength="200"') + campo("af-local", "Local", f.local, ' maxlength="120"') +
      campo("af-inicio", "Início", f.inicio, ' type="date"') + campo("af-estado", "Estado", f.estado, ' maxlength="80" list="aca-estados" placeholder="Ex.: Concluída"') + "</div>" +
      '<datalist id="aca-estados"><option value="Em preparação"><option value="A decorrer"><option value="Em avaliação"><option value="Concluída"><option value="Cancelada"></datalist>' +
      '<div class="acts"><button class="btn pri" type="submit">' + (nova ? I.plus + "Criar formação" : "Guardar") + "</button></div></form>" +
      (f.externo_id ? '<p class="nota-tab">Ação n.º ' + esc(f.externo_id) + " na Secretaria Online. Uma nova importação volta a pôr os dados de lá.</p>" : "") + "</section>";
    return mold(nova ? "Nova formação" : "Formação", h);
  }

  function painelFormando(a) {
    const novo = !a.id, t = novo ? { nome: "", pais: "Portugal" } : A.formandos[a.id];
    if (!t) return mold("Formando", topo("Formando") + '<div class="vazio"><h3>Este formando já não existe</h3><p>Pode ter sido eliminado.</p></div>');
    const z = zonaDe(t);
    let h = topo("Formando", novo ? "" : "aca-formando-apagar");
    if (A.confirmar && !novo) h += confirmar("Eliminar «" + esc(t.nome) + "»? Sai de todas as formações e da estatística." + (t.externo_id ? " Se voltares a importar da Secretaria Online, volta a entrar." : ""), "aca-formando-apagar-sim");
    h += '<h2 class="aca-p-h">' + esc(novo ? "Novo formando" : t.nome) + "</h2>";
    if (!novo) h += '<p class="aca-reg">' + ponto(z) + "<b>" + esc(z) + "</b>" + (t.regiao && t.regiao !== z ? " · " + esc(t.regiao) : "") + (t.regiao_aprox ? " · deduzida só pelo distrito ou pelo código postal" : "") + (!t.regiao ? " · completa o concelho para saber a região" : "") + "</p>";
    if (!novo) {
      const fs = formacoesDe(t.id).sort((x, y) => ordemFormacao(y.f, x.f));
      h += '<section class="p-sec"><h3>Formações</h3>' + (fs.length ? '<ul class="aca-lista">' + fs.map((x) => '<li><span class="aca-l-n"><button class="c-link" data-acao="aca-formacao" data-id="' + esc(x.f.id) + '">' + esc(x.f.nome) + "</button><small>" + esc([dataCurta(x.f.inicio), x.f.estado, x.desistente ? "desistiu" : ""].filter(Boolean).join(" · ")) + "</small></span></li>").join("") + "</ul>" : '<p class="muted">Ainda sem formações. Junta-o a uma formação no painel da formação.</p>') + "</section>";
    }
    h += '<section class="p-sec"><h3>Residência</h3><form class="form" id="form-aca-formando" novalidate>' + (novo ? campo("at-nome", "Nome", t.nome, ' maxlength="200" required autocomplete="off"') : "") +
      '<div class="campos-2">' + campo("aca-conc", "Concelho", t.concelho, ' list="aca-concelhos" maxlength="120" autocomplete="off"') + campo("aca-loc", "Localidade", t.localidade, ' maxlength="120"') +
      campo("aca-cp4", "Código postal", t.cp4, ' inputmode="numeric" maxlength="4" placeholder="4 primeiros dígitos"') + campo("aca-dist", "Distrito ou ilha", t.distrito, ' maxlength="120"') + campo("aca-pais", "País", t.pais || "Portugal", ' maxlength="80"') + "</div>" +
      '<datalist id="aca-concelhos">' + CONCELHOS.map((c) => '<option value="' + esc(c.nome) + '">').join("") + "</datalist>" +
      (novo ? "" : campo("at-nome", "Nome", t.nome, ' maxlength="200" required')) +
      '<div class="acts"><button class="btn pri" type="submit">' + (novo ? I.plus + "Criar formando" : "Guardar") + "</button></div></form>" +
      (t.externo_id ? '<p class="nota-tab">Formando n.º ' + esc(t.externo_id) + " na Secretaria Online. Uma nova importação volta a pôr os dados de lá.</p>" : "") + "</section>";
    return mold(novo ? "Novo formando" : "Formando", h);
  }

  /* ------------------------------ ações ------------------------------ */
  function residenciaDoForm() {
    const v = (id) => ($("#" + id)?.value || "").trim();
    const f = { pais: v("aca-pais") || "Portugal", cp4: v("aca-cp4"), concelho: v("aca-conc"), localidade: v("aca-loc"), distrito: v("aca-dist") };
    if (f.cp4 && !/^\d{4}$/.test(f.cp4)) throw new Error("No código postal escreve só os 4 primeiros dígitos (por exemplo, 4400).");
    const r = resolverRegiao(f);
    return { ...f, concelho: r.concelho || f.concelho, concelho_codigo: r.concelho_codigo || "", regiao: r.regiao || "", regiao_aprox: !!r.aprox };
  }
  function clique(acao, el) {
    if (!/^aca-/.test(acao)) return false;
    const id = el.dataset.id;
    switch (acao) {
      case "aca-tab": location.hash = el.dataset.tab === "painel" ? "academy" : "academy-" + el.dataset.tab; return true;
      case "aca-formacao": A.confirmar = false; abrir({ tipo: "formacao", id }); return true;
      case "aca-formando": A.confirmar = false; abrir({ tipo: "formando", id }); return true;
      case "aca-formacao-nova": A.confirmar = false; abrir({ tipo: "formacao" }); return true;
      case "aca-formando-novo": A.confirmar = false; abrir({ tipo: "formando" }); return true;
      case "aca-pag": A.pag = +el.dataset.p; render(); $(".main")?.scrollTo?.({ top: 0 }); return true;
      case "aca-ver-sem": A.fZona = "Sem dados"; A.q = ""; A.pag = 1; location.hash = "academy-formandos"; return true;
      case "aca-importar-cancelar": A.aImportar = null; render(); return true;
      case "aca-importar": importar(); return true;
      case "aca-sinc": sincronizar(el.dataset.modo === "completa" ? "completa" : "agora"); return true;
      case "aca-apagar-nao": A.confirmar = false; renderPainel(true); return true;
      case "aca-formacao-apagar": case "aca-formando-apagar": A.confirmar = true; renderPainel(true); return true;
      case "aca-formacao-apagar-sim": case "aca-formando-apagar-sim": {
        const formacao = acao === "aca-formacao-apagar-sim", x = formacao ? A.formacoes[S.aberto?.id] : A.formandos[S.aberto?.id];
        if (!x) return true;
        const inscAntes = A.insc;
        if (formacao) { delete A.formacoes[x.id]; A.insc = A.insc.filter((i) => i.formacao_id !== x.id); } else { delete A.formandos[x.id]; A.insc = A.insc.filter((i) => i.formando_id !== x.id); }
        A.confirmar = false; fechar(); render();
        (formacao ? api.aca.apagarFormacao(x.id) : api.aca.apagarFormando(x.id)).then(() => toast(formacao ? "Formação eliminada" : "Formando eliminado"))
          .catch((e) => { if (formacao) A.formacoes[x.id] = x; else A.formandos[x.id] = x; A.insc = inscAntes; render(); falha(e); });
        return true;
      }
      case "aca-tirar": {
        const fid = S.aberto?.id, antes = A.insc;
        A.insc = A.insc.filter((i) => !(i.formacao_id === fid && i.formando_id === id)); renderPainel(true); render();
        api.aca.desinscrever(fid, id).catch((e) => { A.insc = antes; renderPainel(true); render(); falha(e); });
        return true;
      }
      case "aca-juntar": {
        const fid = S.aberto?.id, nome = n($("#aca-juntar-q")?.value || "");
        const t = nome && Object.values(A.formandos).find((x) => n(x.nome) === nome);
        if (!t) { toast("Escolhe um formando da lista. Se ainda não existir, cria-o primeiro em Formandos.", true); return true; }
        if (A.insc.some((i) => i.formacao_id === fid && i.formando_id === t.id)) { toast(t.nome + " já está nesta formação."); return true; }
        A.insc.push({ formacao_id: fid, formando_id: t.id, desistente: false }); renderPainel(true); render();
        api.aca.inscrever(fid, t.id).then(() => toast(t.nome.split(" ")[0] + " juntou-se a esta formação"))
          .catch((e) => { A.insc = A.insc.filter((i) => !(i.formacao_id === fid && i.formando_id === t.id)); renderPainel(true); render(); falha(e); });
        return true;
      }
    }
    return false;
  }
  function escrever(e) {
    if (e.target.id === "aca-q") { A.q = e.target.value; A.pag = 1; agendarRender(); return true; }
    return false;
  }
  function mudar(e) {
    const t = e.target;
    if (t.id === "aca-fzona") { A.fZona = t.value; A.pag = 1; render(); return true; }
    if (t.id === "aca-ficheiro") { lerFicheiro(t.files?.[0]); t.value = ""; return true; }
    if (t.dataset?.acaZona) {
      const novas = { ...zonas(), [t.dataset.acaZona]: t.value };
      api.aca.guardarConfig({ zonas: novas }).then((c) => { A.config = c; toast("Guardado. A estatística já usa esta divisão."); render(); }).catch((err) => { render(); falha(err); });
      return true;
    }
    if (t.dataset?.acaDesist) {
      const fid = S.aberto?.id, tid = t.dataset.acaDesist, v = t.checked, i = A.insc.find((x) => x.formacao_id === fid && x.formando_id === tid);
      if (i) i.desistente = v;
      render();
      api.aca.marcarDesistente(fid, tid, v).catch((err) => { if (i) i.desistente = !v; t.checked = !v; render(); falha(err); });
      return true;
    }
    return false;
  }
  async function submeter(f) {
    if (f.id === "form-aca-formacao") {
      const d = { nome: $("#af-nome").value.trim(), curso: $("#af-curso").value.trim(), local: $("#af-local").value.trim(), inicio: $("#af-inicio").value || null, estado: $("#af-estado").value.trim() };
      if (!d.nome) { toast("Escreve o nome da formação.", true); $("#af-nome").focus(); return true; }
      try {
        if (S.aberto.id) { const r = await api.aca.atualizarFormacao(S.aberto.id, d); A.formacoes[r.id] = r; toast("Guardado"); renderPainel(true); }
        else { const r = await api.aca.criarFormacao(d); A.formacoes[r.id] = r; abrir({ tipo: "formacao", id: r.id }); toast("Formação criada. Junta-lhe os formandos."); }
        render();
      } catch (e) { falha(e); }
      return true;
    }
    if (f.id === "form-aca-formando") {
      try {
        const nome = $("#at-nome").value.trim();
        if (!nome) { toast("Escreve o nome do formando.", true); $("#at-nome").focus(); return true; }
        const d = { nome, ...residenciaDoForm() };
        // a residência corrigida aqui deixa de ser substituída pela da Secretaria Online
        const antes = S.aberto.id ? A.formandos[S.aberto.id] : null;
        if (antes && ["pais", "cp4", "concelho", "localidade", "distrito"].some((c) => (antes[c] || "") !== (d[c] || ""))) d.residencia_manual = true;
        if (S.aberto.id) { const r = await api.aca.atualizarFormando(S.aberto.id, d); A.formandos[r.id] = comRegiao(r); toast(r.regiao ? "Guardado · " + zonaDe(r) : "Guardado. O concelho não foi reconhecido, por isso a região fica por saber."); renderPainel(true); }
        else { const r = await api.aca.criarFormando(d); A.formandos[r.id] = comRegiao(r); abrir({ tipo: "formando", id: r.id }); toast(r.regiao ? "Formando criado · " + zonaDe(r) : "Formando criado"); }
        render();
      } catch (e) { falha(e); }
      return true;
    }
    return false;
  }
  async function lerFicheiro(fich) {
    if (!fich) return;
    try {
      if (fich.size > 20 * 1048576) throw new Error("O ficheiro é demasiado grande.");
      A.aImportar = prepararImportacao(JSON.parse(await fich.text()), fich.name);
    } catch (e) { A.aImportar = { erro: e instanceof SyntaxError ? "O ficheiro não é um .json válido." : e.message }; }
    render();
  }
  async function importar() {
    const a = A.aImportar; if (!a?.resumo || A.importando) return;
    A.importando = true; render();
    try {
      const r = await api.aca.importar({ fonte: a.fonte, formacoes: a.formacoes, formandos: a.formandos, inscricoes: a.inscricoes });
      A.aImportar = null;
      toast("Importado: " + pl(r.formandos_novos, "formando novo", "formandos novos") + ", " + pl(r.formandos_atualizados, "atualizado", "atualizados") + " e " + pl(r.formacoes_novas + r.formacoes_atualizadas, "formação", "formações") + ".", { ms: 6000 });
      await carregar();
      A.importando = false;
      location.hash = "academy";
    } catch (e) { A.importando = false; render(); falha(e); }
  }

  async function sincronizar(modo) {
    if (A.sinc?.aCorrer) return;
    A.sinc = { aCorrer: true, msg: "A ler a Secretaria Online… pode demorar um ou dois minutos." }; render();
    const t = { lidas: 0, accoes: 0, formandos_novos: 0, inscricoes_removidas: 0 };
    try {
      let cont, voltas = 0;
      do {
        const r = await api.aca.sincronizar(modo, cont);
        t.lidas += r.lidas || 0; t.accoes = r.accoes || t.accoes; t.formandos_novos += r.formandos_novos || 0; t.inscricoes_removidas += r.inscricoes_removidas || 0;
        cont = r.continuar_de;
        if (cont) { A.sinc.msg = "A ler a Secretaria Online… " + pl(t.lidas, "ação lida", "ações lidas") + " até agora."; render(); }
      } while (cont && ++voltas < 12);
      toast("Secretaria Online lida: " + pl(t.lidas, "ação", "ações") + " de " + t.accoes + (t.formandos_novos ? ", " + pl(t.formandos_novos, "formando novo", "formandos novos") : ", sem formandos novos") + ".", { ms: 6000 });
    } catch (e) { falha(e); }
    A.sinc = null;
    await carregar();
  }

  function reiniciar() {
    if (desligar) { desligar(); desligar = null; }
    Object.assign(A, { estado: "por-carregar", formacoes: {}, formandos: {}, insc: [], config: null, aImportar: null, importando: false, q: "", fZona: "", pag: 1, confirmar: false, ultimoParam: undefined });
  }
  const totalFormandos = () => (A.estado === "pronto" ? formandosContam().length : null);
  // para a pesquisa geral (q é a função que diz se o texto corresponde)
  function pesquisar(q) {
    if (A.estado !== "pronto") return [];
    const ts = Object.values(A.formandos).filter((t) => q([t.nome, t.concelho, t.localidade].join(" "))).sort((a, b) => a.nome.localeCompare(b.nome, "pt")).slice(0, 5)
      .map((t) => ({ titulo: t.nome, sub: "Formando" + (t.concelho ? " · " + t.concelho : "") + " · " + zonaDe(t), href: "#formando-" + t.id }));
    const fs = Object.values(A.formacoes).filter((f) => q([f.nome, f.curso, f.local].join(" "))).sort((a, b) => ordemFormacao(b, a)).slice(0, 3)
      .map((f) => ({ titulo: f.nome, sub: "Formação" + (f.inicio ? " · " + dataCurta(f.inicio) : "") + (f.estado ? " · " + f.estado : ""), href: "#formacao-" + f.id }));
    return [...ts, ...fs];
  }

  return { vista, painel, clique, escrever, mudar, submeter, carregar, reiniciar, totalFormandos, pesquisar, estado: () => A.estado, zonaDe };
}
