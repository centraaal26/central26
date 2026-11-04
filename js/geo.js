// Central 26 — moradas, distâncias e rotas.
// Localização de moradas: OpenStreetMap (Nominatim, com Photon como alternativa).
// Distâncias e trajeto por estrada: OSRM. Se algum serviço falhar, usa linha reta × 1,3.
// Todos gratuitos e sem chave; pedidos poucos e espaçados, como pedem as regras de uso.

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const PHOTON = "https://photon.komoot.io/api/";
const OSRM = "https://router.project-osrm.org";
const CACHE = "central26-geo-v1";

const normal = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
let cache = {};
try { cache = JSON.parse(localStorage.getItem(CACHE) || "{}"); } catch { cache = {}; }
const guardar = () => { try { localStorage.setItem(CACHE, JSON.stringify(cache)); } catch { /* */ } };

let ultimo = 0;
async function espaco() { const falta = ultimo + 1100 - Date.now(); if (falta > 0) await new Promise((r) => setTimeout(r, falta)); ultimo = Date.now(); }
async function json(url, ms = 12000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { Accept: "application/json" } }); if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

// O resultado tem de bater certo com o código postal (4 primeiros dígitos) ou a localidade escritos na morada
function alvoDe(morada) {
  const cp = morada.match(/\b(\d{4})-\d{3}\b/);
  const partes = morada.split(",").map((x) => x.trim()).filter(Boolean);
  const loc = partes.length > 1 ? normal(partes[partes.length - 1].replace(/\b\d{4}-\d{3}\b/, "")) : "";
  return { cp4: cp ? cp[1] : null, loc };
}
// lugares: [cidade, vila, aldeia, concelho…] do resultado (sem o distrito, que no OpenStreetMap português aparece como «county»)
function confere(lugares, postcode, alvo) {
  if (alvo.cp4 && postcode) return String(postcode).replace(/\s/g, "").startsWith(alvo.cp4);
  if (alvo.loc) return lugares.filter(Boolean).some((l) => normal(l) === alvo.loc || normal(l).includes(alvo.loc));
  return true;
}
const escolher = (lista, lugaresDe, postcodeDe, alvo) => {
  const exato = lista.find((x) => alvo.loc && lugaresDe(x).filter(Boolean).some((l) => normal(l) === alvo.loc) && (!alvo.cp4 || !postcodeDe(x) || String(postcodeDe(x)).startsWith(alvo.cp4)));
  return exato || lista.find((x) => confere(lugaresDe(x), postcodeDe(x), alvo));
};

// Devolve { lat, lng, rotulo, aproximada } ou null
export async function localizar(morada) {
  const k = normal(morada);
  if (!k) return null;
  if (cache[k]) return cache[k];
  const alvo = alvoDe(morada);
  const tentativas = [morada];
  const partes = morada.split(",").map((x) => x.trim()).filter(Boolean);
  if (partes.length > 2) tentativas.push(partes.slice(0, 1).concat(partes.slice(-1)).join(", ")); // rua + localidade
  const cp = morada.match(/\b\d{4}-\d{3}\b/);
  if (cp) tentativas.push(cp[0]);                                                                  // só o código postal
  if (alvo.loc) tentativas.push(partes[partes.length - 1].replace(/\b\d{4}-\d{3}\b/, "").trim()); // só a localidade
  for (const q of tentativas) {
    const aproximada = q !== morada;
    try {
      await espaco();
      const r = await json(NOMINATIM + "?format=jsonv2&addressdetails=1&limit=5&countrycodes=pt&accept-language=pt&q=" + encodeURIComponent(q));
      const bom = escolher(r || [], (x) => { const a = x.address || {}; return [a.city, a.town, a.village, a.municipality, a.city_district, a.suburb, a.hamlet]; }, (x) => x.address?.postcode, alvo);
      if (bom) { const v = { lat: +bom.lat, lng: +bom.lon, rotulo: bom.display_name, aproximada }; cache[k] = v; guardar(); return v; }
    } catch { /* tenta a alternativa */ }
    try {
      const r = await json(PHOTON + "?limit=5&lang=default&q=" + encodeURIComponent(q + ", Portugal"));
      const bom = escolher((r?.features || []).filter((f) => (f.properties?.countrycode || "").toUpperCase() === "PT"),
        (f) => [f.properties.city, f.properties.district, f.properties.locality, f.properties.type === "city" ? f.properties.name : ""], (f) => f.properties.postcode, alvo);
      if (bom) {
        const v = { lat: bom.geometry.coordinates[1], lng: bom.geometry.coordinates[0], rotulo: [bom.properties.name, bom.properties.street, bom.properties.city].filter(Boolean).join(", "), aproximada };
        cache[k] = v; guardar(); return v;
      }
    } catch { /* sem resultado */ }
  }
  return null;
}

const rad = (x) => (x * Math.PI) / 180;
export function linhaReta(a, b) {
  const R = 6371000, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const coords = (pts) => pts.map((p) => p.lng.toFixed(6) + "," + p.lat.toFixed(6)).join(";");

async function matriz(pts) {
  try {
    const r = await json(OSRM + "/table/v1/driving/" + coords(pts) + "?annotations=duration,distance", 20000);
    if (r.code === "Ok" && r.durations) return { tempo: r.durations, dist: r.distances, estrada: true };
  } catch { /* usa linha reta */ }
  const dist = pts.map((a) => pts.map((b) => linhaReta(a, b) * 1.3));
  return { tempo: dist.map((l) => l.map((d) => d / 13.9)), dist, estrada: false }; // ≈ 50 km/h
}

// Ordena as paragens: começa em pts[0]; se «voltar», regressa ao início; se «fimFixo», o último ponto é o fim.
function resolver(custo, n, voltar, fimFixo) {
  const fim = fimFixo ? n - 1 : null;
  const livres = []; for (let i = 1; i < n; i++) if (i !== fim) livres.push(i);
  // vizinho mais próximo
  const ordem = []; let atual = 0; const resta = new Set(livres);
  while (resta.size) { let melhor = null; for (const j of resta) if (melhor === null || custo[atual][j] < custo[atual][melhor]) melhor = j; ordem.push(melhor); resta.delete(melhor); atual = melhor; }
  const total = (o) => { let s = 0, a = 0; for (const j of o) { s += custo[a][j]; a = j; } if (fim !== null) s += custo[a][fim]; else if (voltar) s += custo[a][0]; return s; };
  // 2-opt
  let melhorou = true, melhorT = total(ordem);
  while (melhorou) {
    melhorou = false;
    for (let i = 0; i < ordem.length - 1; i++) for (let k = i + 1; k < ordem.length; k++) {
      const nova = ordem.slice(0, i).concat(ordem.slice(i, k + 1).reverse(), ordem.slice(k + 1));
      const t = total(nova);
      if (t + 1e-6 < melhorT) { ordem.splice(0, ordem.length, ...nova); melhorT = t; melhorou = true; }
    }
  }
  return fim !== null ? ordem.concat([fim]) : ordem;
}

// partida: {lat,lng}; paragens: [{lat,lng,...}]; fim: {lat,lng} | null; voltar: bool
// Devolve { ordem (índices das paragens), distancia_m, duracao_s, geometria: [[lat,lng],...], estrada }
export async function calcularRota(partida, paragens, { fim = null, voltar = true } = {}) {
  if (!paragens.length) return { ordem: [], distancia_m: 0, duracao_s: 0, geometria: [], estrada: true };
  const pts = [partida, ...paragens].concat(fim && !voltar ? [fim] : []);
  const m = await matriz(pts);
  const ord = resolver(m.tempo, pts.length, voltar, !!(fim && !voltar));
  const sequencia = [0, ...ord].concat(voltar ? [0] : []);
  const ordem = ord.filter((i) => i >= 1 && i <= paragens.length).map((i) => i - 1);
  let distancia_m = 0, duracao_s = 0, geometria = sequencia.map((i) => [pts[i].lat, pts[i].lng]), estrada = m.estrada;
  for (let x = 0; x < sequencia.length - 1; x++) { distancia_m += m.dist[sequencia[x]][sequencia[x + 1]]; duracao_s += m.tempo[sequencia[x]][sequencia[x + 1]]; }
  try {
    const r = await json(OSRM + "/route/v1/driving/" + coords(sequencia.map((i) => pts[i])) + "?overview=full&geometries=geojson", 20000);
    if (r.code === "Ok" && r.routes?.[0]) {
      const rt = r.routes[0]; distancia_m = rt.distance; duracao_s = rt.duration; estrada = true;
      const c = rt.geometry.coordinates, passo = Math.max(1, Math.ceil(c.length / 1500));
      geometria = c.filter((_, i) => i % passo === 0 || i === c.length - 1).map(([lng, lat]) => [+lat.toFixed(5), +lng.toFixed(5)]);
    }
  } catch { /* fica a linha reta entre paragens */ }
  return { ordem, distancia_m: Math.round(distancia_m), duracao_s: Math.round(duracao_s), geometria, estrada };
}

// Ligações para o Google Maps: até 9 paragens intermédias por ligação (limite da app no telemóvel)
export function ligacoesGoogle(pontos) {
  const p = pontos.filter((x) => x && x.lat != null);
  if (p.length < 2) return [];
  const ll = (x) => x.lat.toFixed(6) + "," + x.lng.toFixed(6), out = [];
  for (let i = 0; i < p.length - 1; i += 10) {
    const troco = p.slice(i, Math.min(i + 11, p.length));
    const meio = troco.slice(1, -1).map(ll).join("|");
    out.push({ de: i + 1, ate: i + troco.length, url: "https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=" + ll(troco[0]) + "&destination=" + ll(troco[troco.length - 1]) + (meio ? "&waypoints=" + encodeURIComponent(meio) : "") });
  }
  return out;
}
export const navegarGoogle = (x) => "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" + x.lat.toFixed(6) + "," + x.lng.toFixed(6);
export const navegarWaze = (x) => "https://waze.com/ul?ll=" + x.lat.toFixed(6) + "," + x.lng.toFixed(6) + "&navigate=yes";

/* ---------- mapa (Leaflet, carregado só quando é preciso) ---------- */
let leaflet = null;
export function carregarMapa() {
  if (leaflet) return leaflet;
  leaflet = new Promise((ok, falha) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
    const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js";
    s.onload = () => ok(window.L); s.onerror = () => { leaflet = null; falha(new Error("Não foi possível carregar o mapa.")); };
    document.head.appendChild(s);
  });
  return leaflet;
}
let mapaAtual = null;
export async function desenharMapa(el, { partida, paragens, fim, geometria }) {
  const L = await carregarMapa();
  if (!el.isConnected) return;
  if (mapaAtual) { try { mapaAtual.remove(); } catch { /* */ } mapaAtual = null; }
  const mapa = L.map(el, { scrollWheelZoom: false, attributionControl: true });
  mapaAtual = mapa;
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(mapa);
  const pts = [];
  const marca = (p, txt, cls) => {
    if (p?.lat == null) return;
    pts.push([p.lat, p.lng]);
    L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "", html: '<span class="pino ' + cls + '">' + txt + "</span>", iconSize: [28, 28], iconAnchor: [14, 14] }), title: p.nome || "" })
      .addTo(mapa).bindPopup("<b>" + String(p.nome || "").replace(/[<>&]/g, "") + "</b><br>" + String(p.morada || "").replace(/[<>&]/g, ""));
  };
  marca(partida, "▶", "inicio");
  paragens.forEach((p, i) => marca(p, String(i + 1), p.feito ? "feito" : ""));
  if (fim) marca(fim, "■", "inicio");
  if (geometria?.length > 1) L.polyline(geometria, { color: getComputedStyle(el).getPropertyValue("--b").trim() || "#8A672C", weight: 4, opacity: 0.85 }).addTo(mapa);
  if (pts.length) mapa.fitBounds(L.latLngBounds(pts.concat(geometria || [])), { padding: [28, 28], maxZoom: 15 });
  else mapa.setView([41.13, -8.61], 11);
}
