// Central 26 — Barbeiros: leitura de caixa diária das lojas e «Os meus números» de cada barbeiro.
// O responsável da loja fotografa a «Leitura de caixa» do Multixop; a Central lê-a (função «leitura-caixa»),
// o responsável confirma e guarda. Os números de cada barbeiro vêm das «Entradas» (o que entrou em caixa);
// o total faturado e os pagamentos ficam à parte, só para a direção e o responsável da loja.
// Cada barbeiro vê só os seus números e a média da loja, sem nomes (bar_meus_numeros).
import { eGestor, ymd, MES_L } from "./dados.js";
import { valorProtegido } from "./protecao.js";

const eur = (v) => (Number(v) || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const num = (v) => (Number(v) || 0).toLocaleString("pt-PT", { maximumFractionDigits: 1 });
const lerNum = (t) => { const s = String(t ?? "").replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."); if (s === "") return 0; const n = Number(s); return Number.isFinite(n) ? n : 0; };
const diaPt = (d) => (d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) : "");
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function criarBarbeiros(ctx) {
  const { S, api, esc, I, toast, falha, render, ativos } = ctx;
  const B = (S.bar = { lojas: {}, lendo: "", rascunho: null, meus: null, mes: ymd(new Date()).slice(0, 7), aGuardar: false });

  /* ============================ Leitura de caixa (Lojas) ============================ */
  async function carregarLoja(id, forcar) {
    const x = B.lojas[id];
    if (x && !forcar && x.estado !== "erro") return;
    B.lojas[id] = { estado: "a-carregar", leituras: x?.leituras || [], alias: x?.alias || [] };
    try {
      const d = await api.caixa.carregar(id);
      B.lojas[id] = { estado: "pronto", leituras: d.leituras, alias: d.alias };
    } catch (e) { B.lojas[id] = { estado: /bar_leituras|PGRST205|does not exist/i.test(String(e?.message)) ? "falta" : "erro", erro: e.message, leituras: [], alias: [] }; }
    render();
  }

  function vistaCaixa(loja) {
    if (!loja) return "";
    const x = B.lojas[loja.id];
    if (!x) { carregarLoja(loja.id); return '<div class="esqueleto"><i style="width:50%"></i></div>'; }
    if (x.estado === "falta") return '<div class="vazio"><h3>Falta instalar a leitura de caixa</h3><p>No Supabase, corre <b>supabase/35-leituras-caixa.sql</b> e publica a função <b>leitura-caixa</b>.</p></div>';
    if (x.estado === "erro") return '<div class="aviso erro">Não foi possível carregar as leituras: ' + esc(x.erro || "") + "</div>";
    if (x.estado !== "pronto") return '<div class="esqueleto"><i style="width:50%"></i></div>';
    const hoje = ymd(new Date()), deHoje = x.leituras.find((l) => l.dia === hoje);
    let h = '<div class="loj-topo"><div><b>Leitura de caixa · ' + esc(loja.nome) + "</b><small>Todos os dias, no fecho: fotografa a leitura de caixa do Multixop. A Central lê os serviços de cada barbeiro e tu confirmas antes de guardar.</small></div></div>";
    const r = B.rascunho && B.rascunho.loja_id === loja.id ? B.rascunho : null;
    if (r) return h + blocoRascunho(r, x);
    h += '<div class="bar-estado' + (deHoje ? " ok" : "") + '"><i></i><span>' + (deHoje ? "<b>A leitura de hoje está registada.</b> " + num(deHoje.entradas.reduce((s, e) => s + (+e.qtd || 0), 0)) + " serviços · " + eur(deHoje.total_entradas) + " de entradas." : "<b>Ainda não há leitura de hoje.</b> Fotografa-a no fecho da loja.") + "</span></div>";
    h += '<div class="acts">' + (B.lendo === loja.id
      ? '<button class="btn pri" disabled>' + I.ia + "A ler a foto (pode levar meio minuto)…</button>"
      : '<label class="btn pri" for="bar-foto">' + I.plus + "Fotografar a leitura de caixa</label>" + '<input id="bar-foto" type="file" accept="image/*" capture="environment" data-loja="' + esc(loja.id) + '" hidden>' +
        '<button class="btn sec" data-acao="bar-manual" data-loja="' + esc(loja.id) + '">Escrever à mão</button>') + "</div>";
    // últimas leituras
    if (x.leituras.length) {
      h += '<section class="cartao-sec"><h3>Últimos dias</h3><div class="tabela-scroll"><table class="crm-tabela bar-dias"><thead><tr><th>Dia</th><th class="n">Serviços</th><th class="n">Entradas</th><th class="n">Faturado</th><th>Barbeiros</th><th></th></tr></thead><tbody>' +
        x.leituras.slice(0, 21).map((l) => {
          const nomes = [...new Set(l.entradas.map((e) => e.barbeiro))];
          return "<tr><td><b>" + esc(DIAS[new Date(l.dia + "T12:00").getDay()]) + "</b> " + esc(diaPt(l.dia)) + '</td><td class="n">' + num(l.entradas.reduce((s, e) => s + (+e.qtd || 0), 0)) + '</td><td class="n">' + eur(l.total_entradas) +
            '</td><td class="n">' + (l.total_faturado == null ? "—" : eur(l.total_faturado)) + "</td><td>" + esc(nomes.join(", ")) + '</td><td><button class="ib" data-acao="bar-editar" data-id="' + l.id + '" data-loja="' + esc(loja.id) + '">Ver ou corrigir</button></td></tr>';
        }).join("") + "</tbody></table></div></section>";
    }
    h += blocoAlias(loja, x);
    return h;
  }

  function blocoRascunho(r, x) {
    const existe = x.leituras.find((l) => l.dia === r.dia && l.id !== r.id);
    const total = r.entradas.reduce((s, e) => s + (+e.valor || 0), 0), qtd = r.entradas.reduce((s, e) => s + (+e.qtd || 0), 0);
    let h = '<section class="cartao-sec bar-rasc"><h3>' + (r.id ? "Corrigir a leitura" : "Confirma a leitura antes de guardar") + "</h3>";
    if (r.lido) h += '<p class="muted">Lido da foto' + (r.intervalo ? " (" + esc(r.intervalo) + ")" : "") + ". Confirma cada linha com a leitura em papel e corrige o que for preciso.</p>";
    if ((r.avisos || []).length) h += '<div class="aviso"><span>' + r.avisos.map(esc).join("<br>") + "</span></div>";
    if (existe) h += '<div class="aviso"><span>Já há uma leitura de ' + esc(diaPt(r.dia)) + ". Ao guardar, fica esta.</span></div>";
    h += '<div class="bar-dia"><label for="bar-dia">Dia</label><input id="bar-dia" type="date" value="' + esc(r.dia) + '" max="' + ymd(new Date()) + '"></div>';
    h += '<p class="mk66-rot">Entradas por barbeiro</p><div class="bar-linhas">' + r.entradas.map((e, i) =>
      '<div class="bar-linha"><input aria-label="Barbeiro" data-bar-l="' + i + '" data-campo="barbeiro" value="' + esc(e.barbeiro) + '" placeholder="Barbeiro" autocomplete="off">' +
      '<input aria-label="Serviço" data-bar-l="' + i + '" data-campo="servico" value="' + esc(e.servico) + '" placeholder="Serviço" autocomplete="off">' +
      '<input aria-label="Quantidade" class="n" data-bar-l="' + i + '" data-campo="qtd" inputmode="decimal" value="' + esc(String(e.qtd).replace(".", ",")) + '">' +
      '<input aria-label="Valor" class="n" data-bar-l="' + i + '" data-campo="valor" inputmode="decimal" value="' + esc((+e.valor || 0).toFixed(2).replace(".", ",")) + '">' +
      '<button class="ib" data-acao="bar-linha-x" data-i="' + i + '" aria-label="Tirar a linha">' + I.x + "</button></div>").join("") + "</div>" +
      '<button class="c-link" data-acao="bar-linha-mais">+ Acrescentar linha</button>';
    h += '<div class="bar-tot"><div><span>Serviços</span><b id="bar-t-q">' + num(qtd) + '</b></div><div><span>Entradas</span><b id="bar-t-v">' + eur(total) + "</b></div>" +
      '<div><label for="bar-fat">Total faturado</label><input id="bar-fat" inputmode="decimal" value="' + (r.faturado == null ? "" : String(r.faturado).replace(".", ",")) + '" placeholder="—"></div></div>';
    const pag = Object.entries(r.pagamentos || {});
    if (pag.length) h += '<p class="muted">Pagamentos: ' + pag.map(([k, v]) => esc(k.toLowerCase()) + " " + eur(v)).join(" · ") + "</p>";
    h += '<div class="acts"><button class="btn pri" data-acao="bar-guardar"' + (B.aGuardar ? " disabled" : "") + ">" + I.check + (B.aGuardar ? "A guardar…" : "Guardar") + '</button><button class="btn sec" data-acao="bar-descartar">' + (r.id ? "Voltar" : "Descartar") + "</button>" +
      (r.id ? '<button class="btn perigo-sec" data-acao="bar-apagar">Apagar esta leitura</button>' : "") + "</div></section>";
    return h;
  }

  function blocoAlias(loja, x) {
    const nomes = [...new Set(x.leituras.flatMap((l) => l.entradas.map((e) => e.barbeiro)))].filter(Boolean).sort();
    if (!nomes.length) return "";
    const pessoas = ativos().filter((p) => p.departamento_id === "barbearias" || p.id === loja.responsavel_id).sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
    const al = Object.fromEntries(x.alias.map((a) => [a.nome, a.perfil_id])), sem = nomes.filter((n) => !al[n]).length;
    return '<section class="cartao-sec"><h3>Barbeiros da leitura</h3><p class="muted">Liga cada nome que aparece na leitura à conta do barbeiro na Central. Assim cada um vê só os seus números em <b>Os meus números</b>' + (sem ? " · <b>" + sem + " por ligar</b>" : "") + ".</p>" +
      '<div class="bar-alias">' + nomes.map((n) => '<label><span>' + esc(n) + '</span><select class="sel" data-bar-alias="' + esc(n) + '" data-loja="' + esc(loja.id) + '"><option value="">Por ligar</option>' +
        pessoas.map((p) => '<option value="' + p.id + '"' + (al[n] === p.id ? " selected" : "") + ">" + esc(p.nome) + "</option>").join("") + "</select></label>").join("") + "</div>" +
      (pessoas.length ? "" : '<p class="muted">Ainda não há contas de barbeiros. Cria-as em Equipa → Criar várias contas.</p>') + "</section>";
  }

  // foto → JPEG até 1600 px (para ler mais depressa e gastar menos)
  async function reduzir(ficheiro) {
    const img = await createImageBitmap(ficheiro).catch(() => null);
    if (!img) throw new Error("Não consegui abrir a foto. Tenta outra vez.");
    const f = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement("canvas");
    c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85).split(",")[1];
  }
  async function lerFoto(lojaId, ficheiro) {
    B.lendo = lojaId; render();
    try {
      const r = await api.caixa.ler(lojaId, await reduzir(ficheiro));
      B.rascunho = { loja_id: lojaId, dia: r.dia || ymd(new Date()), entradas: r.entradas || [], faturado: r.faturado, pagamentos: r.pagamentos || {}, avisos: r.avisos || [], intervalo: r.intervalo, lido: true };
      if (!B.rascunho.entradas.length) B.rascunho.avisos = [...B.rascunho.avisos, "Não encontrei linhas de entradas por barbeiro. Escreve-as à mão ou tira outra foto."];
    } catch (e) { falha(e); }
    B.lendo = ""; render();
  }
  function guardarRascunhoDoEcra() {
    const r = B.rascunho; if (!r) return;
    document.querySelectorAll("[data-bar-l]").forEach((el) => {
      const i = +el.dataset.barL, c = el.dataset.campo; if (!r.entradas[i]) return;
      r.entradas[i][c] = c === "qtd" || c === "valor" ? lerNum(el.value) : el.value.trim().toUpperCase();
    });
    const d = document.getElementById("bar-dia")?.value; if (d) r.dia = d;
    const f = document.getElementById("bar-fat"); if (f) r.faturado = f.value.trim() === "" ? null : lerNum(f.value);
  }
  async function guardar() {
    guardarRascunhoDoEcra();
    const r = B.rascunho; if (!r || B.aGuardar) return;
    const entradas = r.entradas.filter((e) => e.barbeiro && (+e.qtd || +e.valor)).map((e) => ({ barbeiro: e.barbeiro, servico: e.servico || "", qtd: +e.qtd || 0, valor: Math.round((+e.valor || 0) * 100) / 100 }));
    if (!entradas.length) { toast("Falta pelo menos uma linha com barbeiro e valor.", true); return; }
    if (!r.dia || r.dia > ymd(new Date())) { toast("Escolhe o dia da leitura.", true); return; }
    B.aGuardar = true; render();
    try {
      const x = B.lojas[r.loja_id], outra = x?.leituras.find((l) => l.dia === r.dia && l.id !== r.id);
      if (r.id && outra) await api.caixa.apagar(outra.id);
      const g = await api.caixa.guardar({ id: r.id || outra?.id, loja_id: r.loja_id, dia: r.dia, entradas, total_faturado: r.faturado, pagamentos: r.pagamentos || {} });
      if (x) { x.leituras = [g, ...x.leituras.filter((l) => l.id !== g.id && l.dia !== g.dia)].sort((a, b) => (a.dia < b.dia ? 1 : -1)); }
      B.rascunho = null; toast("Leitura de " + diaPt(g.dia) + " guardada");
    } catch (e) { falha(e); }
    B.aGuardar = false; render();
  }

  /* ============================== Os meus números ============================== */
  const visivelNumeros = () => !!S.eu && S.eu.departamento_id === "barbearias";
  async function carregarMeus() {
    const [y, m] = B.mes.split("-").map(Number);
    const de = B.mes + "-01", ate = ymd(new Date(y, m, 0));
    B.meus = { estado: "a-carregar", mes: B.mes };
    try { B.meus = { estado: "pronto", mes: B.mes, ...(await api.caixa.meus(de, ate)) }; }
    catch (e) { B.meus = { estado: /bar_meus_numeros|PGRST202|does not exist/i.test(String(e?.message)) ? "falta" : "erro", erro: e.message, mes: B.mes }; }
    render();
  }
  function vistaNumeros() {
    if (!B.meus || B.meus.mes !== B.mes) { carregarMeus(); }
    const [y, m] = B.mes.split("-").map(Number);
    let h = '<div class="cab"><div><div class="eyebrow neutro">Barbearias</div><h1>Os meus números</h1><p class="sub-cab">Os teus serviços e o que entrou em caixa, dia a dia, a partir da leitura de caixa da loja. Só tu vês os teus números.</p></div></div>';
    h += '<div class="barra"><label for="bar-mes" class="muted">Mês</label><input id="bar-mes" class="inp" type="month" value="' + B.mes + '" max="' + ymd(new Date()).slice(0, 7) + '"><span class="muted">' + esc(MES_L[m - 1] + " de " + y) + "</span></div>";
    const x = B.meus;
    if (!x || x.estado === "a-carregar") return h + '<div class="esqueleto"><i style="width:50%"></i></div>';
    if (x.estado === "falta") return h + '<div class="vazio"><h3>Ainda não está disponível</h3><p>A direção ainda está a preparar esta área.</p></div>';
    if (x.estado === "erro") return h + '<div class="aviso erro">Não foi possível carregar os teus números: ' + esc(x.erro || "") + "</div>";
    if (!x.ligado) return h + '<div class="vazio"><h3>Ainda não estás ligado à leitura de caixa</h3><p>Pede ao responsável da tua loja para ligar o teu nome da leitura à tua conta (Lojas → Leitura de caixa → Barbeiros da leitura).</p></div>';
    const l = x.linhas || [];
    if (!l.length) return h + '<div class="vazio"><h3>Sem registos neste mês</h3><p>Os números aparecem quando a leitura de caixa da loja for registada.</p></div>';
    const qtd = l.reduce((s, e) => s + +e.qtd, 0), val = l.reduce((s, e) => s + +e.valor, 0), dias = new Set(l.map((e) => e.dia)).size;
    const lj = (x.lojas || [])[0], mv = lj ? +lj.media_valor : 0, ms = lj ? +lj.media_servicos : 0;
    const comp = (meu, media) => (media ? Math.round(((meu - media) / media) * 100) : null);
    const cv = comp(val, mv), cs = comp(qtd, ms);
    const dado = (r, v, nota, cls = "") => '<div class="dado"><span>' + r + '</span><b class="' + cls + '">' + v + "</b>" + (nota ? "<small>" + nota + "</small>" : "") + "</div>";
    h += '<div class="dados">' + dado("Serviços", num(qtd), cs == null ? "" : (cs >= 0 ? "+" : "") + cs + "% que a média da loja (" + num(ms) + ")") +
      dado("Entradas", valorProtegido(eur(val)), cv == null ? "" : (cv >= 0 ? "+" : "") + cv + "% que a média da loja") +
      dado("Dias com serviços", num(dias), lj ? "a loja tem " + num(lj.dias) + " dias registados" : "") +
      dado("Por dia", valorProtegido(eur(dias ? val / dias : 0)), num(dias ? qtd / dias : 0) + " serviços por dia") + "</div>";
    // por serviço
    const porS = new Map(); for (const e of l) { const k = e.servico || "Outro"; const z = porS.get(k) || { q: 0, v: 0 }; z.q += +e.qtd; z.v += +e.valor; porS.set(k, z); }
    h += '<section class="cartao-sec"><h3>Por serviço</h3><div class="barras-h">' + [...porS.entries()].sort((a, b) => b[1].v - a[1].v).map(([k, z]) =>
      '<div class="bh"><span class="bh-r">' + esc(k.charAt(0) + k.slice(1).toLowerCase()) + '</span><span class="bh-v">' + num(z.q) + " · " + valorProtegido(eur(z.v)) + '</span><div class="barra-p"><i style="width:' + Math.max(2, (z.v / (val || 1)) * 100) + '%"></i></div></div>').join("") + "</div></section>";
    // dia a dia
    const porD = new Map(); for (const e of l) { const z = porD.get(e.dia) || { q: 0, v: 0 }; z.q += +e.qtd; z.v += +e.valor; porD.set(e.dia, z); }
    h += '<section class="cartao-sec"><h3>Dia a dia</h3><div class="bar-dd">' + [...porD.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([d, z]) =>
      '<div><span>' + esc(DIAS[new Date(d + "T12:00").getDay()]) + " " + esc(d.slice(8, 10) + "/" + d.slice(5, 7)) + "</span><b>" + num(z.q) + (z.q === 1 ? " serviço" : " serviços") + "</b>" + valorProtegido(eur(z.v)) + "</div>").join("") + "</div></section>";
    h += '<p class="nota-tab">A média da loja é calculada com todos os barbeiros que tiveram serviços neste mês, sem nomes. As metas e os prémios aparecem aqui quando a direção os definir.</p>';
    return h;
  }

  /* ============================== eventos ============================== */
  function clique(acao, el) {
    switch (acao) {
      case "bar-manual": B.rascunho = { loja_id: el.dataset.loja, dia: ymd(new Date()), entradas: [{ barbeiro: "", servico: "CABELO", qtd: 1, valor: 0 }], faturado: null, pagamentos: {}, avisos: [] }; render(); return true;
      case "bar-editar": {
        const l = B.lojas[el.dataset.loja]?.leituras.find((x) => x.id === el.dataset.id); if (!l) return true;
        B.rascunho = { id: l.id, loja_id: l.loja_id, dia: l.dia, entradas: structuredClone(l.entradas), faturado: l.total_faturado, pagamentos: l.pagamentos || {}, avisos: [] };
        render(); document.querySelector(".bar-rasc")?.scrollIntoView({ block: "start" }); return true;
      }
      case "bar-linha-mais": guardarRascunhoDoEcra(); B.rascunho?.entradas.push({ barbeiro: "", servico: "", qtd: 1, valor: 0 }); render(); return true;
      case "bar-linha-x": guardarRascunhoDoEcra(); B.rascunho?.entradas.splice(+el.dataset.i, 1); render(); return true;
      case "bar-descartar": B.rascunho = null; render(); return true;
      case "bar-guardar": guardar(); return true;
      case "bar-apagar": {
        const r = B.rascunho; if (!r?.id) return true;
        if (!B.confirmarApagar) { B.confirmarApagar = true; el.textContent = "Carrega outra vez para apagar"; setTimeout(() => { B.confirmarApagar = false; }, 4000); return true; }
        B.confirmarApagar = false;
        api.caixa.apagar(r.id).then(() => { const x = B.lojas[r.loja_id]; if (x) x.leituras = x.leituras.filter((l) => l.id !== r.id); B.rascunho = null; render(); toast("Leitura apagada"); }).catch(falha);
        return true;
      }
    }
    return false;
  }
  function mudar(e) {
    const t = e.target;
    if (t.id === "bar-foto" && t.files?.[0]) { lerFoto(t.dataset.loja, t.files[0]); t.value = ""; return true; }
    if (t.id === "bar-mes" && t.value) { B.mes = t.value; carregarMeus(); return true; }
    if (t.dataset?.barAlias != null) {
      const loja = t.dataset.loja, nome = t.dataset.barAlias, x = B.lojas[loja];
      api.caixa.alias(loja, nome, t.value || null).then(() => { if (x) { x.alias = x.alias.filter((a) => a.nome !== nome); if (t.value) x.alias.push({ loja_id: loja, nome, perfil_id: t.value }); } render(); toast(t.value ? "Ligado" : "Desligado"); }).catch(falha);
      return true;
    }
    return false;
  }
  function escrever(e) {
    if (e.target.dataset?.barL == null) return false;
    guardarRascunhoDoEcra();
    const r = B.rascunho; if (!r) return true;
    const q = document.getElementById("bar-t-q"), v = document.getElementById("bar-t-v");
    if (q) q.textContent = num(r.entradas.reduce((s, x) => s + (+x.qtd || 0), 0));
    if (v) v.textContent = eur(r.entradas.reduce((s, x) => s + (+x.valor || 0), 0));
    return true;
  }
  function reiniciar() { Object.assign(B, { lojas: {}, lendo: "", rascunho: null, meus: null, aGuardar: false }); }
  const podeCaixa = (lojas) => eGestor(S.eu) || lojas.some((l) => l.responsavel_id === S.eu?.id);

  return { vistaCaixa, vistaNumeros, visivelNumeros, podeCaixa, clique, mudar, escrever, reiniciar };
}
