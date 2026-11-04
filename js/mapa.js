// Central 26 — Comercial · mapa de clientes e leads por distrito, concelho e freguesia.
// Limites: CAOP 2025 (Continente) e CAOP das Regiões Autónomas, Direção-Geral do Território, simplificados (geo/).
import { carregarMapa, localizar } from "./geo.js";
import { normalizar } from "./dados.js";

const METRICAS = { clientes: "Clientes", ativos: "Clientes ativos", leads: "Leads por contactar", vendas: "Vendas" };
const norm = (s) => normalizar(String(s || "").replace(/\(.*?\)/g, "")).replace(/[-–'’.]/g, " ").replace(/\s+/g, " ").trim();
const CONT = [[36.95, -9.55], [42.16, -6.18]];

// ---------- geometria ----------
function bboxDe(g) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  const anel = (r) => { for (const [x, y] of r) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; } };
  if (g.type === "Polygon") g.coordinates.forEach(anel); else g.coordinates.forEach((p) => p.forEach(anel));
  return [a, b, c, d];
}
function dentroAnel(x, y, r) {
  let dentro = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}
const dentroPoligono = (x, y, p) => dentroAnel(x, y, p[0]) && !p.slice(1).some((h) => dentroAnel(x, y, h));
function contem(f, lng, lat) {
  const [a, b, c, d] = f._bb || (f._bb = bboxDe(f.geometry));
  if (lng < a || lng > c || lat < b || lat > d) return false;
  const g = f.geometry;
  return g.type === "Polygon" ? dentroPoligono(lng, lat, g.coordinates) : g.coordinates.some((p) => dentroPoligono(lng, lat, p));
}
// o limite simplificado pode deixar de fora um ponto junto à costa ou à fronteira: fica no mais próximo
function procurar(lista, lng, lat) {
  const f = lista.find((x) => contem(x, lng, lat));
  if (f) return f;
  let melhor = null, dist = 0.03; // cerca de 3 km
  for (const x of lista) {
    const [a, b, c, d] = x._bb || (x._bb = bboxDe(x.geometry));
    const dx = Math.max(a - lng, 0, lng - c), dy = Math.max(b - lat, 0, lat - d), dd = Math.hypot(dx, dy);
    if (dd < dist) { dist = dd; melhor = x; }
  }
  return melhor;
}

export function criarMapaCrm(ctx) {
  const { C, S, esc, I, toast, falha, render, abrir, api, visiveis, statsDe, eur, num, podeLocalizar } = ctx;
  const M = (C.mapa = { geo: null, freg: {}, aCarregar: false, erro: "", dt: null, mn: null, fr: null, metrica: null, tarefa: null, versaoLoc: -1 });
  let idx = null, loc = new Map();
  let el = null, mapa = null, L = null, camada = null, marcas = null, desenhado = "";

  /* ---------- dados geográficos ---------- */
  async function carregarGeo() {
    if (M.geo || M.aCarregar) return;
    M.aCarregar = true;
    try {
      const r = await fetch("geo/portugal.json"); if (!r.ok) throw new Error("HTTP " + r.status);
      M.geo = await r.json();
      const dt = new Map(), mn = new Map(), mnSo = new Map();
      for (const f of M.geo.distritos.features) dt.set(norm(f.properties.nome), f.properties.id);
      for (const f of M.geo.concelhos.features) {
        const p = f.properties, k = norm(p.nome);
        mn.set(p.dt + "|" + k, p.id);
        mnSo.set(k, mnSo.has(k) ? null : p.id); // nomes repetidos (Calheta, Lagoa…) só com o distrito
      }
      idx = { dt, mn, mnSo, porId: new Map(M.geo.concelhos.features.map((f) => [f.properties.id, f])), dtPorId: new Map(M.geo.distritos.features.map((f) => [f.properties.id, f])) };
    } catch (e) { M.erro = "Não foi possível carregar os limites do mapa (" + e.message + ")."; }
    M.aCarregar = false; M.versaoLoc = -1; render();
  }
  async function carregarFreg(dt) {
    if (M.freg[dt]) return M.freg[dt];
    const r = await fetch("geo/freg/" + dt + ".json"); if (!r.ok) throw new Error("HTTP " + r.status);
    M.freg[dt] = (await r.json()).features;
    M.versaoLoc = -1;
    return M.freg[dt];
  }

  /* ---------- onde fica cada cliente ---------- */
  function localDe(c) {
    if (!idx) return null;
    let dt = null, mn = null, fr = null, exato = false;
    if (c.lat != null && c.lng != null) {
      const f = procurar(M.geo.concelhos.features, c.lng, c.lat);
      if (f) { mn = f.properties.id; dt = f.properties.dt; exato = true; }
    }
    if (!mn) {
      dt = idx.dt.get(norm(c.distrito)) || null;
      const k = norm(c.concelho);
      if (k) mn = (dt && idx.mn.get(dt + "|" + k)) || (!dt && idx.mnSo.get(k)) || null;
      if (mn && !dt) dt = idx.porId.get(mn)?.properties.dt || null;
    }
    if (mn && M.freg[dt]) {
      const doMn = M.freg[dt].filter((f) => f.properties.mn === mn);
      if (exato) fr = procurar(doMn, c.lng, c.lat)?.properties.id || null;
      else if (c.freguesia) { const k = norm(c.freguesia); fr = doMn.find((f) => norm(f.properties.nome) === k)?.properties.id || null; }
    }
    return { dt, mn, fr, exato };
  }
  function atualizarLocais() {
    if (M.versaoLoc === C.versao) return;
    loc = new Map();
    for (const c of visiveis()) loc.set(c.id, localDe(c));
    M.versaoLoc = C.versao;
  }
  const eCliente = (c) => c.etapa === "cliente" || !!statsDe(c);
  const valores = (c) => {
    const s = statsDe(c), cli = eCliente(c);
    return { clientes: cli ? 1 : 0, ativos: s && ["ativo", "morno"].includes(s.estado) ? 1 : 0, leads: !cli && c.etapa !== "perdido" ? 1 : 0, vendas: s ? Math.max(0, s.total) : 0 };
  };
  function somar(lista) {
    const t = { clientes: 0, ativos: 0, leads: 0, vendas: 0, n: lista.length };
    for (const c of lista) { const v = valores(c); t.clientes += v.clientes; t.ativos += v.ativos; t.leads += v.leads; t.vendas += v.vendas; }
    return t;
  }
  // áreas do nível atual: distritos → concelhos → freguesias
  function nivel() {
    if (M.mn) return { tipo: "fr", campo: "fr", areas: (M.freg[M.dt] || []).filter((f) => f.properties.mn === M.mn) };
    if (M.dt) return { tipo: "mn", campo: "mn", areas: M.geo.concelhos.features.filter((f) => f.properties.dt === M.dt) };
    return { tipo: "dt", campo: "dt", areas: M.geo.distritos.features };
  }
  const naArea = () => visiveis().filter((c) => { const l = loc.get(c.id); if (!l) return false; if (M.fr) return l.fr === M.fr; if (M.mn) return l.mn === M.mn; if (M.dt) return l.dt === M.dt; return true; });
  function porArea(nv) {
    const grupos = new Map(nv.areas.map((f) => [f.properties.id, []]));
    const base = M.mn ? visiveis().filter((c) => loc.get(c.id)?.mn === M.mn) : M.dt ? visiveis().filter((c) => loc.get(c.id)?.dt === M.dt) : visiveis();
    let semArea = 0;
    for (const c of base) { const k = loc.get(c.id)?.[nv.campo]; if (k && grupos.has(k)) grupos.get(k).push(c); else semArea++; }
    return { grupos, semArea, base };
  }

  // classes de cor: 5 degraus pelos quantis dos valores acima de zero
  function classes(vals) {
    const v = vals.filter((x) => x > 0).sort((a, b) => a - b);
    if (!v.length) return [];
    const q = [0.2, 0.4, 0.6, 0.8].map((p) => v[Math.min(v.length - 1, Math.floor(p * v.length))]);
    return [...new Set(q.concat(v[v.length - 1]))];
  }
  const grau = (x, br) => (x <= 0 ? 0 : 1 + Math.min(4, br.findIndex((b) => x <= b) < 0 ? 4 : br.findIndex((b) => x <= b)));
  const g5 = (x, br) => { const g = grau(x, br); return g ? g + (5 - br.length) : 0; };
  const fmt = (x) => (M.metrica === "vendas" ? eur(x) : num(x));

  /* ============================== Vista ============================== */
  function vista() {
    if (!M.geo) carregarGeo();
    if (M.erro) return '<div class="aviso erro">' + esc(M.erro) + "</div>";
    if (!M.geo) return '<div class="tabela"><div class="esqueleto"><i style="width:60%"></i></div></div>';
    atualizarLocais();
    const todos = visiveis();
    const cliSemLocal = todos.filter((c) => eCliente(c) && !loc.get(c.id)?.dt).length;
    // enquanto quase nenhum cliente tem localidade, o mapa abre pelas leads (que já trazem concelho)
    if (!M.metrica) M.metrica = todos.filter((c) => eCliente(c) && loc.get(c.id)?.dt).length >= 10 ? "clientes" : "leads";
    if (M.dt && !M.freg[M.dt]) carregarFreg(M.dt).then(() => render()).catch(() => {});
    const nv = nivel(), { grupos, semArea } = porArea(nv);
    const somas = new Map([...grupos].map(([k, l]) => [k, somar(l)]));
    const br = classes([...somas.values()].map((s) => s[M.metrica]));
    const nomeDt = M.dt ? idx.dtPorId.get(M.dt)?.properties.nome : "", nomeMn = M.mn ? idx.porId.get(M.mn)?.properties.nome : "";
    const nomeFr = M.fr ? (M.freg[M.dt] || []).find((f) => f.properties.id === M.fr)?.properties.nome : "";
    const aqui = naArea(), tot = somar(aqui);
    const semLocal = todos.filter((c) => !loc.get(c.id)?.dt).length;
    const porLocalizar = candidatos().length;

    let h = '<div class="barra"><div class="periodo"><nav class="migalhas" aria-label="Zona do mapa"><button class="c-link" data-acao="mapa-ir" data-nivel="pt">Portugal</button>' +
      (M.dt ? ' <span aria-hidden="true">›</span> <button class="c-link" data-acao="mapa-ir" data-nivel="dt" data-id="' + M.dt + '">' + esc(nomeDt) + "</button>" : "") +
      (M.mn ? ' <span aria-hidden="true">›</span> <button class="c-link" data-acao="mapa-ir" data-nivel="mn" data-id="' + M.mn + '">' + esc(nomeMn) + "</button>" : "") +
      (M.fr ? ' <span aria-hidden="true">›</span> <b>' + esc(nomeFr) + "</b>" : "") + "</nav><span>" +
      (M.mn ? "Freguesias do concelho. Toca numa freguesia para ver os clientes." : M.dt ? "Concelhos do distrito. Toca num concelho para ver as freguesias." : "Toca num distrito para ver os concelhos.") + "</span></div>" +
      '<div class="ferr"><label class="sr" for="mapa-metrica">Cor do mapa</label><select id="mapa-metrica" class="sel">' + Object.entries(METRICAS).map(([k, r]) => '<option value="' + k + '"' + (M.metrica === k ? " selected" : "") + ">Cor: " + r + "</option>").join("") + "</select>" +
      (!M.dt ? '<button class="btn sec" data-acao="mapa-ir" data-nivel="dt" data-id="30">Madeira</button><button class="btn sec" data-acao="mapa-ir" data-nivel="dt" data-id="40">Açores</button>' : "") + "</div></div>";

    if (M.tarefa) {
      const t = M.tarefa;
      h += '<div class="aviso aviso-acao mapa-prog" role="status"><span>A procurar moradas no mapa: <b class="mono">' + t.feitos + " de " + t.total + "</b> · " + t.ok + " encontradas" + (t.falhou ? " · " + t.falhou + " por encontrar" : "") +
        '. Podes continuar a trabalhar nesta página.</span><span class="barra-prog"><i style="width:' + Math.round((t.feitos / Math.max(1, t.total)) * 100) + '%"></i></span><button class="btn sec" data-acao="mapa-parar">Parar</button></div>';
    } else if (porLocalizar && podeLocalizar()) {
      h += '<div class="aviso aviso-acao"><span>' + num(porLocalizar) + (porLocalizar === 1 ? " morada ainda não está" : " moradas ainda não estão") + " no mapa. Localiza-as para veres os clientes por freguesia (cerca de um segundo por morada; fica guardado para toda a equipa).</span>" +
        '<button class="btn sec" data-acao="mapa-localizar">' + I.mapa + "Localizar moradas</button></div>";
    }

    if (cliSemLocal && !M.dt) h += '<div class="aviso aviso-acao"><span><b>' + num(cliSemLocal) + (cliSemLocal === 1 ? " cliente ainda não aparece" : " clientes ainda não aparecem") + " no mapa:</b> o SAF-T do Multixop só traz a rua, sem código postal nem localidade. Preenche o código postal e o concelho na ficha (e também no Multixop).</span>" +
      '<button class="btn sec" data-acao="crm-distrito" data-v="sem">Ver clientes sem localidade</button></div>';
    h += '<div class="kpis-mapa">' + [["clientes", "Clientes"], ["ativos", "Ativos (90 dias)"], ["leads", "Leads por contactar"], ["vendas", "Vendas no período"]].map(([k, r]) =>
      '<div class="kpi' + (M.metrica === k ? " on" : "") + '"><span>' + r + "</span><b>" + (k === "vendas" ? eur(tot[k]) : num(tot[k])) + "</b></div>").join("") + "</div>";

    h += '<div class="mapa-grid"><div class="mapa-col"><div id="mapa-crm-slot" class="mapa mapa-crm" role="img" aria-label="Mapa de ' + esc(METRICAS[M.metrica].toLowerCase()) + " por " + ({ dt: "distrito", mn: "concelho", fr: "freguesia" })[nv.tipo] + '"></div>' + legenda(br, nv) +
      '<p class="nota-tab">Limites: CAOP 2025, Direção-Geral do Território (simplificados). Mapa © OpenStreetMap.' + (semLocal ? " " + num(semLocal) + " registos sem distrito nem concelho não aparecem no mapa." : "") + "</p></div>";

    // tabela das áreas (também é a leitura do mapa sem cores)
    const linhas = nv.areas.map((f) => ({ id: f.properties.id, nome: f.properties.nome, s: somas.get(f.properties.id) })).sort((a, b) => b.s[M.metrica] - a.s[M.metrica] || b.s.n - a.s.n || a.nome.localeCompare(b.nome, "pt"));
    const comDados = linhas.filter((x) => x.s.n);
    h += '<div class="mapa-lado"><section class="cartao-sec"><h3>' + ({ dt: "Distritos", mn: "Concelhos", fr: "Freguesias" })[nv.tipo] + ' <span class="mono muted">' + comDados.length + " com registos</span></h3>" +
      (comDados.length ? '<div class="tabela-scroll"><table class="crm-tabela mapa-tab"><thead><tr><th>' + ({ dt: "Distrito", mn: "Concelho", fr: "Freguesia" })[nv.tipo] + '</th><th class="n">Clientes</th><th class="n">Ativos</th><th class="n">Leads</th><th class="n">Vendas</th></tr></thead><tbody>' +
        comDados.map((x) => '<tr data-acao="mapa-ir" data-nivel="' + (nv.tipo === "fr" ? "fr" : nv.tipo) + '" data-id="' + x.id + '" tabindex="0"' + (M.fr === x.id ? ' class="sel-linha"' : "") + '><td><span class="sw-mapa g' + g5(x.s[M.metrica], br) + '" aria-hidden="true"></span>' + esc(x.nome) + '</td><td class="n">' + num(x.s.clientes) + '</td><td class="n">' + num(x.s.ativos) + '</td><td class="n">' + num(x.s.leads) + '</td><td class="n">' + (x.s.vendas ? eur(x.s.vendas) : "—") + "</td></tr>").join("") + "</tbody></table></div>"
        : '<p class="muted">Ainda não há registos nesta zona.</p>') +
      (semArea && nv.tipo !== "dt" ? '<p class="muted">' + num(semArea) + (nv.tipo === "fr" ? " registos deste concelho ainda não têm freguesia: localiza as moradas ou preenche a freguesia na ficha." : " registos deste distrito ainda não têm concelho.") + "</p>" : "") + "</section>";

    // quem está na zona
    const ord = aqui.slice().sort((a, b) => (statsDe(b)?.total || 0) - (statsDe(a)?.total || 0) || (b.score || 0) - (a.score || 0) || a.nome.localeCompare(b.nome, "pt"));
    h += '<section class="cartao-sec"><h3>' + (M.fr ? esc(nomeFr) : M.mn ? esc(nomeMn) : M.dt ? esc(nomeDt) : "Portugal") + ' <span class="mono muted">' + num(aqui.length) + "</span></h3>" +
      (ord.length ? '<div class="lista-crm">' + ord.slice(0, 40).map((c) => {
        const s = statsDe(c), l = loc.get(c.id);
        return '<div class="lc"><button class="c-link" data-acao="crm-abrir" data-id="' + c.id + '">' + esc(c.nome) + '</button><small>' + esc([eCliente(c) ? "Cliente" : "Lead", c.concelho, s ? eur(s.total) : ""].filter(Boolean).join(" · ")) + (l && !l.exato && M.mn ? ' · <span class="at">sem morada no mapa</span>' : "") + "</small></div>";
      }).join("") + "</div>" + (ord.length > 40 ? '<p class="muted">E mais ' + num(ord.length - 40) + ". Usa a pesquisa em «Clientes e leads» para ver todos.</p>" : "")
        : '<p class="muted">Ninguém nesta zona.</p>') + "</section></div></div>";

    setTimeout(() => montar(nv, somas, br), 0);
    return h;
  }
  function legenda(br, nv) {
    if (!br.length) return '<div class="legenda-mapa"><span><i class="sw-mapa g0"></i>Sem ' + esc(METRICAS[M.metrica].toLowerCase()) + "</span></div>";
    const de = (i) => (i === 0 ? (M.metrica === "vendas" ? 0.01 : 1) : (M.metrica === "vendas" ? br[i - 1] + 0.01 : br[i - 1] + 1));
    let h = '<div class="legenda-mapa" aria-label="Legenda"><span class="lg-t">' + esc(METRICAS[M.metrica]) + " por " + ({ dt: "distrito", mn: "concelho", fr: "freguesia" })[nv.tipo] + "</span><span><i class=\"sw-mapa g0\"></i>0</span>";
    br.forEach((b, i) => { const a = de(i); h += '<span><i class="sw-mapa g' + (i + 1 + (5 - br.length)) + '"></i>' + (a >= b ? fmt(b) : fmt(Math.ceil(a)) + "–" + fmt(b)) + "</span>"; });
    if (M.mn) h += '<span><i class="pt-mapa cli"></i>Cliente</span><span><i class="pt-mapa lead"></i>Lead</span>';
    return h + "</div>";
  }

  /* ---------- Leaflet: o mapa fica vivo entre renders ---------- */
  async function montar(nv, somas, br) {
    try { L = await carregarMapa(); } catch { const s0 = document.getElementById("mapa-crm-slot"); if (s0) s0.innerHTML = '<p class="muted" style="padding:16px">Não foi possível carregar o mapa. A tabela ao lado mostra os mesmos números.</p>'; return; }
    // procurar o lugar do mapa só depois de carregar o Leaflet: entretanto o ecrã pode ter sido redesenhado
    const slot = document.getElementById("mapa-crm-slot"); if (!slot) return;
    if (!el) {
      el = document.createElement("div"); el.className = "mapa-vivo"; slot.appendChild(el);
      mapa = L.map(el, { scrollWheelZoom: false, zoomSnap: 0.25, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(mapa);
      mapa.fitBounds(CONT);
    } else if (el.parentNode !== slot) slot.appendChild(el);
    mapa.invalidateSize(false);
    const chave = [M.dt, M.mn, M.fr, M.metrica, C.versao, nv.areas.length].join("|");
    if (chave === desenhado) return;
    const mudouZona = desenhado.split("|").slice(0, 2).join("|") !== [M.dt, M.mn].join("|") || nv.areas.length !== +desenhado.split("|")[5];
    desenhado = chave;
    if (camada) camada.remove(); if (marcas) marcas.remove();
    const cor = (g) => getComputedStyle(el).getPropertyValue("--mapa-" + g).trim();
    const linha = getComputedStyle(el).getPropertyValue("--mapa-linha").trim();
    const grauDe = (id) => { const s = somas.get(id); return s ? g5(s[M.metrica], br) : 0; };
    camada = L.geoJSON({ type: "FeatureCollection", features: nv.areas }, {
      style: (f) => ({ fillColor: cor(grauDe(f.properties.id)), fillOpacity: M.fr && f.properties.id !== M.fr ? 0.35 : 0.78, color: f.properties.id === M.fr ? cor("sel") : linha, weight: f.properties.id === M.fr ? 2.5 : 1 }),
      onEachFeature: (f, ly) => {
        const s = somas.get(f.properties.id) || { clientes: 0, ativos: 0, leads: 0, vendas: 0 };
        ly.bindTooltip("<b>" + esc(f.properties.nome) + "</b><br>" + num(s.clientes) + " clientes · " + num(s.ativos) + " ativos<br>" + num(s.leads) + " leads" + (s.vendas ? " · " + eur(s.vendas) : ""), { sticky: true, direction: "top", className: "tt-mapa" });
        ly.on("mouseover", () => ly.setStyle({ weight: 2.5, color: cor("sel") }));
        ly.on("mouseout", () => camada && camada.resetStyle(ly));
        ly.on("click", () => ir(nv.tipo, f.properties.id));
      },
    }).addTo(mapa);
    if (M.mn) {
      marcas = L.layerGroup().addTo(mapa);
      for (const c of naArea()) {
        if (c.lat == null) continue;
        const cli = eCliente(c);
        L.circleMarker([c.lat, c.lng], { radius: cli ? 6 : 5, weight: 2, color: cor("ponto-borda"), fillColor: cli ? cor("ponto") : cor("ponto-borda"), fillOpacity: 1, className: cli ? "" : "pt-lead" })
          .bindTooltip(esc(c.nome) + (c.geo_aprox ? " (aproximado)" : ""), { direction: "top" }).on("click", () => abrir({ tipo: "cliente", id: c.id })).addTo(marcas);
      }
    }
    if (mudouZona) {
      const b = M.dt ? camada.getBounds() : L.latLngBounds(CONT);
      requestAnimationFrame(() => {
        if (!el.isConnected || !el.clientHeight) { desenhado = ""; return; } // volta a enquadrar no próximo desenho
        mapa.invalidateSize(false);
        if (b.isValid()) mapa.fitBounds(b, { padding: [12, 12] });
      });
    }
  }
  function ir(tipo, id) {
    if (tipo === "pt") { M.dt = M.mn = M.fr = null; }
    else if (tipo === "dt") { M.dt = id; M.mn = M.fr = null; }
    else if (tipo === "mn") { M.mn = id; M.dt = idx.porId.get(id)?.properties.dt || M.dt; M.fr = null; }
    else if (tipo === "fr") { M.fr = M.fr === id ? null : id; }
    render();
  }

  /* ---------- localizar moradas em lote ---------- */
  const temCp = (s) => /\b\d{4}-\d{3}\b/.test(s || "");
  function moradaDe(c) {
    const m = String(c.morada || "").trim(); if (!m || /^-+$|^\.+$|desconhecid/i.test(m)) return "";
    const partes = [m];
    if (c.codigo_postal && !m.includes(c.codigo_postal)) partes.push((c.codigo_postal + " " + (c.concelho || "")).trim());
    else if (!temCp(m) && c.concelho && !norm(m).includes(norm(c.concelho))) partes.push(c.concelho);
    const q = partes.join(", ");
    return temCp(q) || c.concelho ? q : "";
  }
  const candidatos = () => visiveis().filter((c) => c.lat == null && !c.geo_falhou && moradaDe(c))
    .sort((a, b) => Number(eCliente(b)) - Number(eCliente(a)));
  async function localizarTodos() {
    if (M.tarefa) return;
    if (!M.geo) await carregarGeo();
    const lista = candidatos();
    const t = (M.tarefa = { total: lista.length, feitos: 0, ok: 0, falhou: 0, parar: false });
    render();
    for (const c of lista) {
      if (t.parar) break;
      try {
        const g = await localizar(moradaDe(c));
        const campos = g ? { lat: g.lat, lng: g.lng, geo_aprox: !!g.aproximada } : { geo_falhou: true };
        if (g) {
          const conc = procurar(M.geo.concelhos.features, g.lng, g.lat);
          if (conc) {
            const dt = conc.properties.dt;
            if (!c.concelho) campos.concelho = conc.properties.nome;
            if (!c.distrito) campos.distrito = idx.dtPorId.get(dt)?.properties.nome || "";
            if (!c.freguesia && !g.aproximada) {
              const fr = procurar((await carregarFreg(dt)).filter((f) => f.properties.mn === conc.properties.id), g.lng, g.lat);
              if (fr) campos.freguesia = fr.properties.nome;
            }
          }
        }
        const r = await api.crm.atualizar(c.id, campos);
        C.clientes[c.id] = r || { ...c, ...campos }; C.versao++;
        if (g) t.ok++; else t.falhou++;
      } catch (e) {
        if (/lat|geo_|column/i.test(String(e?.message))) { t.parar = true; falha(new Error("Falta instalar o mapa na base de dados: corre o ficheiro supabase/06-mapa.sql no Supabase.")); break; }
        t.falhou++;
      }
      t.feitos++;
      if (t.feitos % 3 === 0 || t.feitos === t.total) render();
    }
    M.tarefa = null; render();
    toast(t.parar && t.feitos < t.total ? "Paragem a meio: " + t.ok + " moradas localizadas. Podes continuar mais tarde." : t.ok + " moradas localizadas" + (t.falhou ? ", " + t.falhou + " por encontrar (corrige-as na ficha)" : ""));
  }

  function clique(acao, el2) {
    if (acao === "mapa-ir") { ir(el2.dataset.nivel, el2.dataset.id); return true; }
    if (acao === "mapa-localizar") { localizarTodos(); return true; }
    if (acao === "mapa-parar") { if (M.tarefa) M.tarefa.parar = true; return true; }
    return false;
  }
  function mudar(e) { if (e.target.id === "mapa-metrica") { M.metrica = e.target.value; render(); return true; } return false; }
  function reiniciar() { if (M.tarefa) M.tarefa.parar = true; Object.assign(M, { dt: null, mn: null, fr: null, tarefa: null, versaoLoc: -1, metrica: null }); desenhado = ""; }
  return { vista, clique, mudar, reiniciar };
}
