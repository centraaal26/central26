// Central 26 — Leitura da exportação do Booknetic (ficheiro .Booknetic = zip com sql/tables.json).
// Tudo acontece no navegador: o ficheiro é lido em fluxo (pode ter centenas de MB), só se aproveitam as marcações,
// os barbeiros, as lojas e os serviços, e o que sai daqui são apenas números agregados — nunca nomes nem contactos de clientes.

const TABELAS = new Set(["appointments", "staff", "locations", "services"]);

/* ---------- zip: encontrar sql/tables.json ---------- */
async function bytes(file, de, ate) { return new DataView(await file.slice(de, ate).arrayBuffer()); }

async function entradaZip(file, nome) {
  const cauda = Math.min(file.size, 70 * 1024), base = file.size - cauda, v = await bytes(file, base, file.size);
  let eocd = -1;
  for (let i = cauda - 22; i >= 0; i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Este ficheiro não parece uma exportação do Booknetic (não é um zip).");
  let cdTam = v.getUint32(eocd + 12, true), cdIni = v.getUint32(eocd + 16, true);
  if (cdIni === 0xffffffff && eocd >= 20 && v.getUint32(eocd - 20, true) === 0x07064b50) { // zip64
    const off = Number(v.getBigUint64(eocd - 20 + 8, true)), z = await bytes(file, off, off + 56);
    cdTam = Number(z.getBigUint64(40, true)); cdIni = Number(z.getBigUint64(48, true));
  }
  const cd = await bytes(file, cdIni, cdIni + cdTam), dec = new TextDecoder();
  for (let p = 0; p + 46 <= cd.byteLength && cd.getUint32(p, true) === 0x02014b50;) {
    const metodo = cd.getUint16(p + 10, true), nLen = cd.getUint16(p + 28, true), xLen = cd.getUint16(p + 30, true), cLen = cd.getUint16(p + 32, true);
    let comp = cd.getUint32(p + 20, true), real = cd.getUint32(p + 24, true), local = cd.getUint32(p + 42, true);
    const n = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nLen));
    if (n === nome) {
      // campos zip64 no «extra»
      for (let e = p + 46 + nLen; e < p + 46 + nLen + xLen;) {
        const id = cd.getUint16(e, true), t = cd.getUint16(e + 2, true);
        if (id === 1) { let k = e + 4; if (real === 0xffffffff) { real = Number(cd.getBigUint64(k, true)); k += 8; } if (comp === 0xffffffff) { comp = Number(cd.getBigUint64(k, true)); k += 8; } if (local === 0xffffffff) local = Number(cd.getBigUint64(k, true)); }
        e += 4 + t;
      }
      const lh = await bytes(file, local, local + 30);
      const ini = local + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
      return { metodo, ini, comp, real };
    }
    p += 46 + nLen + xLen + cLen;
  }
  throw new Error("O ficheiro não tem a lista de marcações (sql/tables.json). Confirma que é a exportação completa do Booknetic.");
}

/* ---------- JSON em fluxo: só os elementos das tabelas que interessam ---------- */
function criarLeitor(aoElemento) {
  let prof = 0, emTexto = false, escape = false, chave = "", aLerChave = false, tabela = "", capturar = false, partes = [], ini = -1;
  return function ler(txt) {
    for (let i = 0, n = txt.length; i < n; i++) {
      const c = txt.charCodeAt(i);
      if (emTexto) {
        if (escape) { escape = false; continue; }
        if (c === 92) { escape = true; continue; }               // \
        if (c === 34) { emTexto = false; if (aLerChave) aLerChave = false; continue; } // "
        if (aLerChave) chave += txt[i];
        continue;
      }
      if (c === 34) { emTexto = true; if (prof === 1) { aLerChave = true; chave = ""; } continue; }
      if (c === 123 || c === 91) {                                // { [
        prof++;
        if (prof === 2) { tabela = chave; capturar = c === 91 && TABELAS.has(tabela); }
        else if (prof === 3 && capturar && c === 123) { ini = i; partes = []; }
        continue;
      }
      if (c === 125 || c === 93) {                                // } ]
        if (prof === 3 && capturar && c === 125) {
          partes.push(txt.slice(ini, i + 1)); ini = -1;
          aoElemento(tabela, JSON.parse(partes.join(""))); partes = [];
        }
        if (prof === 2) capturar = false;
        prof--;
      }
    }
    if (ini >= 0) { partes.push(txt.slice(ini)); ini = 0; }
  };
}

export async function lerBooknetic(file, progresso) {
  const e = await entradaZip(file, "sql/tables.json");
  if (![0, 8].includes(e.metodo)) throw new Error("Compressão do zip não suportada.");
  if (e.metodo === 8 && typeof DecompressionStream === "undefined") throw new Error("Este navegador não consegue abrir o ficheiro. Usa o Chrome, o Edge ou o Safari atualizados.");
  const dados = { appointments: [], staff: [], locations: [], services: [] };
  const ler = criarLeitor((t, o) => {
    if (t === "appointments") dados.appointments.push([+o.starts_at, o.status, o.staff_id, o.location_id, o.customer_id, o.service_id]);
    else dados[t].push({ id: o.id, name: o.name });
  });
  let fluxo = file.slice(e.ini, e.ini + e.comp).stream();
  if (e.metodo === 8) fluxo = fluxo.pipeThrough(new DecompressionStream("deflate-raw"));
  const leitor = fluxo.pipeThrough(new TextDecoderStream()).getReader();
  let lidos = 0, ultimo = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    ler(value); lidos += value.length;
    if (progresso && (lidos - ultimo > 4e6)) { ultimo = lidos; progresso(Math.min(0.99, lidos / (e.real || 1))); await new Promise((r) => setTimeout(r, 0)); }
  }
  if (!dados.appointments.length) throw new Error("Não encontrei marcações no ficheiro.");
  return dados;
}

/* ---------- agregados ---------- */
const FMT = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" });
const DIAS = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const cacheHora = new Map();
function partes(ts) { // ts em segundos; cache por hora
  const h = Math.floor(ts / 3600); let r = cacheHora.get(h);
  if (!r) { const p = Object.fromEntries(FMT.formatToParts(new Date(h * 3600000)).map((x) => [x.type, x.value])); r = { mes: p.year + "-" + p.month, dia: p.year + "-" + p.month + "-" + p.day, hora: +p.hour, dow: DIAS[p.weekday] ?? 0 }; cacheHora.set(h, r); }
  return r;
}
const limpo = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

export function agregar(d, agora = Date.now() / 1000) {
  const loja = Object.fromEntries(d.locations.map((x) => [String(x.id), limpo(x.name) || "Sem loja"]));
  const barb = Object.fromEntries(d.staff.map((x) => [String(x.id), limpo(x.name) || "Sem barbeiro"]));
  const serv = Object.fromEntries(d.services.map((x) => [String(x.id), limpo(x.name).replace(/^-\s*/, "") + (/^\s*-/.test(x.name || "") ? " (premium)" : "") || "Sem serviço"]));
  const ap = d.appointments.filter((a) => Number.isFinite(a[0])).sort((a, b) => a[0] - b[0]);
  // primeira visita de cada cliente (marcações aprovadas já passadas)
  const primeira = new Map(), visitas = new Map();
  for (const a of ap) if (a[1] === "approved" && a[0] <= agora) {
    if (!primeira.has(a[4])) primeira.set(a[4], a[0]);
    let v = visitas.get(a[4]); if (!v) visitas.set(a[4], (v = [])); v.push(a);
  }
  const G = new Map();
  const grupo = (nivel, mes, l, chave) => { const k = nivel + "|" + mes + "|" + l + "|" + chave; let g = G.get(k); if (!g) G.set(k, (g = { nivel, mes, loja: l, chave, marcacoes: 0, canceladas: 0, cli: new Set(), nov: new Set() })); return g; };
  const horas = new Map(), futuras = {}, h84 = agora - 84 * 86400;
  let de = null, ate = null;
  for (const a of ap) {
    const [ts, est, sid, lid, cid, svc] = a;
    if (ts > agora) { if (est === "approved" && ts <= agora + 7 * 86400) { const l = loja[lid] || "Sem loja"; futuras[l] = (futuras[l] || 0) + 1; } continue; }
    if (est !== "approved" && est !== "canceled") continue;
    const p = partes(ts), l = loja[lid] || "Sem loja", b = barb[sid] || "Sem barbeiro", s = serv[svc] || "Sem serviço";
    const gs = [grupo("total", p.mes, "", ""), grupo("loja", p.mes, l, ""), grupo("barbeiro", p.mes, l, b), grupo("servico", p.mes, l, s)];
    if (est === "canceled") { gs.forEach((g) => g.canceladas++); continue; }
    if (!de || p.dia < de) de = p.dia; if (!ate || p.dia > ate) ate = p.dia;
    const nova = partes(primeira.get(cid)).mes === p.mes;
    gs.forEach((g) => { g.marcacoes++; g.cli.add(cid); if (nova) g.nov.add(cid); });
    if (ts >= h84) { const k = l + "|" + p.dow + "|" + p.hora; horas.set(k, (horas.get(k) || 0) + 1); }
  }
  // clientes: ativos, habituais e os que deixaram de vir (por loja da última visita)
  const res = {}, d90 = agora - 90 * 86400, d365 = agora - 365 * 86400, d30 = agora - 30 * 86400;
  const somar = (l, campo) => { (res[l] ||= { ativos: 0, habituais: 0, perdidos: 0, novos30: 0, intervalos: [] })[campo]++; };
  for (const [, v] of visitas) {
    const ult = v[v.length - 1], l = loja[ult[3]] || "Sem loja", ano = v.filter((a) => a[0] >= d365);
    for (const k of [l, "Todas"]) {
      if (ult[0] >= d90) somar(k, "ativos");
      if (ano.length >= 3) { somar(k, "habituais"); res[k].intervalos.push((ano[ano.length - 1][0] - ano[0][0]) / 86400 / (ano.length - 1)); }
      if (v.length >= 3 && ult[0] < d90 && ult[0] >= d365) somar(k, "perdidos");
      if (v[0][0] >= d30) somar(k, "novos30");
    }
  }
  for (const r of Object.values(res)) { const s = r.intervalos.sort((a, b) => a - b); r.intervalo = s.length ? Math.round(s[s.length >> 1]) : null; delete r.intervalos; }
  const linhas = [...G.values()].map((g) => ({ nivel: g.nivel, mes: g.mes, loja: g.loja, chave: g.chave, marcacoes: g.marcacoes, canceladas: g.canceladas, clientes: g.cli.size, novos: g.nov.size }));
  const horasL = [...horas.entries()].map(([k, n]) => { const [l, dow, hora] = k.split("|"); return { loja: l, dow: +dow, hora: +hora, n }; });
  return { linhas, horas: horasL, resumo: { clientes: res, futuras, de, ate, marcacoes: ap.length, lojas: [...new Set(Object.values(loja))] } };
}
