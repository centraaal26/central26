// Central 26 — leitura da base de prospeção (Excel «base_…_barbearias_twentysix…xlsx»).
// Devolve tudo pronto a enviar para a função prs_importar: leads, zonas, barbearias postas de parte e guiões.

const DIAS = { segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, domingo: 7 };

export function normalizarChave(s) {
  return String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
export const chaveLead = (nome, concelho) => normalizarChave(nome) + "|" + normalizarChave(concelho);

// «Sem contacto público», «A validar», «Instagram a confirmar»… contam como vazio
const VAZIO = /^(sem\b|a validar|a confirmar|instagram a confirmar|n[ãa]o aplic[áa]vel|n\/?a|null|none|-+|—|\?)/i;
function limpo(v) {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).replace(/\s+/g, " ").trim();
  return VAZIO.test(s) ? "" : s;
}
const url = (v) => { const s = limpo(v); return /^https?:\/\//i.test(s) ? s : /^www\./i.test(s) ? "https://" + s : ""; };
const morada = (v) => { const s = limpo(v); return /https?:|www\.|\.com\b|\.pt\/|\/$/i.test(s) ? "" : s; };
function dataISO(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = limpo(v); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0") : "";
}
function instagram(v) {
  const s = limpo(v); if (!s) return "";
  const m = s.match(/instagram\.com\/([A-Za-z0-9_.]+)/i); if (m && !/^(p|reel|explore|stories)$/i.test(m[1])) return "https://www.instagram.com/" + m[1];
  const h = s.match(/^@?([A-Za-z0-9_.]{2,30})$/); return h ? "https://www.instagram.com/" + h[1] : "";
}
const prioridade = (v) => { const s = normalizarChave(v); return s.startsWith("alt") ? "alta" : s.startsWith("med") ? "média" : s.startsWith("baix") ? "baixa" : ""; };
const tipoNegocio = (v) => { const s = limpo(v); return /^a validar$/i.test(s) ? "" : s; };
const num = (v) => { const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10); return Number.isFinite(n) ? n : null; };

// Lê uma folha como lista de objetos {cabeçalho: valor}; procura o cabeçalho nas primeiras linhas
function folha(XLSX, wb, nomes, obrigatorio) {
  const nome = wb.SheetNames.find((n) => nomes.some((x) => normalizarChave(n) === normalizarChave(x)));
  if (!nome) { if (obrigatorio) throw new Error("O ficheiro não tem a folha «" + nomes[0] + "». Confirma que é a base de prospeção de barbearias."); return []; }
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: null, raw: true });
  const i = linhas.findIndex((l) => (l || []).filter((x) => x != null && String(x).trim()).length >= 2);
  if (i < 0) return [];
  const cab = linhas[i].map((x) => normalizarChave(x));
  return linhas.slice(i + 1).filter((l) => l && l.some((x) => x != null && String(x).trim() !== "")).map((l) => {
    const o = {}; cab.forEach((c, k) => { if (c && o[c] == null) o[c] = l[k]; }); return o;
  });
}
const col = (o, ...nomes) => { for (const n of nomes) { const v = o[normalizarChave(n)]; if (v != null && String(v).trim() !== "") return v; } return null; };

export function lerBaseProspecao(XLSX, dados, ficheiro = "") {
  const wb = XLSX.read(dados, { type: "array", cellDates: true });
  const todos = folha(XLSX, wb, ["Todos os Leads"], true);
  const rot = folha(XLSX, wb, ["Leads Roteirizados"]);
  const zonasF = folha(XLSX, wb, ["Zonas Operacionais"]);
  const plano = folha(XLSX, wb, ["Plano Mensal Rua"]);
  const scripts = folha(XLSX, wb, ["Scripts de Contacto"]);
  const fora = folha(XLSX, wb, ["Fora da Campanha"]);
  const excl = folha(XLSX, wb, ["Excluídos", "Excluidos"]);

  const porChaveRot = new Map(rot.map((r) => [chaveLead(col(r, "Nome da barbearia", "Nome"), col(r, "Concelho")), r]));
  const leads = new Map();
  for (const r of todos) {
    const nome = limpo(col(r, "Nome da barbearia", "Nome")); if (!nome) continue;
    const concelho = limpo(col(r, "Concelho")), chave = chaveLead(nome, concelho);
    const z = porChaveRot.get(chave) || {};
    const l = {
      chave, nome, distrito: limpo(col(r, "Distrito")), concelho,
      morada: morada(col(r, "Morada")) || morada(col(z, "Morada")),
      telefone: limpo(col(r, "Telefone")) || limpo(col(z, "Telefone")),
      email: (limpo(col(r, "Email")) || limpo(col(z, "Email"))).replace(/^mailto:/i, "").toLowerCase(),
      website: url(col(r, "Website")) || url(col(z, "Website")),
      instagram: instagram(col(r, "Instagram")) || instagram(col(z, "Instagram")),
      whatsapp: limpo(col(r, "WhatsApp")),
      link_marcacao: url(col(r, "Link de marcação online")),
      link_mapa: url(col(r, "Link Google Maps ou diretório público", "Link Google Maps ou diretório")),
      tipo_negocio: tipoNegocio(col(r, "Tipo de Negócio")),
      confianca: limpo(col(r, "Confiança do Lead")),
      prioridade: prioridade(col(r, "Prioridade comercial")),
      estado: limpo(col(r, "Estado comercial")) || "A validar",
      score: num(col(r, "Score comercial")),
      motivo: limpo(col(r, "Motivo da Classificação")).slice(0, 300),
      notas: limpo(col(r, "Observações")).slice(0, 600),
      fonte: url(col(r, "Fonte principal")),
      recolhido_em: dataISO(col(r, "Data de recolha")),
      zona: limpo(col(z, "Código Zona")),
      canal: limpo(col(z, "Canal recomendado")),
      nivel: limpo(col(z, "Nível de visita")),
      proximo: limpo(col(z, "Próximo passo")),
    };
    if (l.email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(l.email)) l.email = "";
    leads.set(chave, l);
  }

  const objetivo = new Map(plano.map((p) => [limpo(col(p, "Código Zona")), limpo(col(p, "Objetivo do dia"))]));
  let inicio = null;
  const zonas = zonasF.map((z) => {
    const codigo = limpo(col(z, "Código Zona")); if (!codigo) return null;
    const d = col(z, "Data sugerida"); if (d instanceof Date && (!inicio || d < inicio)) inicio = d;
    return {
      codigo, nome: limpo(col(z, "Nome da zona")), semana: num(col(z, "Semana")) || 1, dia: DIAS[normalizarChave(col(z, "Dia")).split(" ")[0]] || 1,
      distritos: limpo(col(z, "Distritos")), concelhos: limpo(col(z, "Concelhos / eixo", "Concelhos")),
      visitas: num(col(z, "Visitas presenciais sugeridas")), remotos: num(col(z, "Contactos remotos sugeridos")),
      recursos: limpo(col(z, "Recursos sugeridos")), observacoes: limpo(col(z, "Observações logísticas")), objetivo: objetivo.get(codigo) || "",
    };
  }).filter(Boolean);

  // Tudo o que ficou fora da campanha ou foi excluído fica guardado para a pesquisa automática não o voltar a propor
  const excluidos = new Map();
  for (const [lista, motivoCol] of [[fora, "Motivo da Classificação"], [excl, "Motivo da exclusão"]]) {
    for (const r of lista) {
      const nome = limpo(col(r, "Nome da barbearia", "Nome")); if (!nome) continue;
      const concelho = limpo(col(r, "Concelho")), chave = chaveLead(nome, concelho);
      if (leads.has(chave) || excluidos.has(chave)) continue;
      excluidos.set(chave, {
        chave, nome, distrito: limpo(col(r, "Distrito")), concelho, motivo: (limpo(col(r, motivoCol)) || limpo(col(r, "Estado comercial")) || "Fora da campanha").slice(0, 300),
        morada: morada(col(r, "Morada")), telefone: limpo(col(r, "Telefone")), email: limpo(col(r, "Email")).replace(/^mailto:/i, "").toLowerCase(),
        website: url(col(r, "Website")), instagram: instagram(col(r, "Instagram")),
      });
    }
  }

  const guioes = scripts.map((s) => ({ tipo: limpo(col(s, "Tipo")), texto: String(col(s, "Texto") ?? "").trim() })).filter((g) => g.tipo && g.texto);

  const L = [...leads.values()];
  const porDistrito = {}; L.forEach((l) => { porDistrito[l.distrito || "Sem distrito"] = (porDistrito[l.distrito || "Sem distrito"] || 0) + 1; });
  const porEstado = {}; L.forEach((l) => { porEstado[l.estado] = (porEstado[l.estado] || 0) + 1; });
  return {
    ficheiro, leads: L, zonas, excluidos: [...excluidos.values()], guioes,
    planoInicio: inicio ? inicio.toISOString().slice(0, 10) : null,
    resumo: {
      total: L.length, por_distrito: porDistrito, por_estado: porEstado,
      com_telefone: L.filter((l) => l.telefone).length, com_email: L.filter((l) => l.email).length, com_instagram: L.filter((l) => l.instagram).length,
      zonas: zonas.length, excluidos: excluidos.size, guioes: guioes.length,
    },
  };
}

// Contacto principal de uma barbearia: o canal recomendado, se houver contacto para ele; senão WhatsApp (telemóvel) > email > Instagram > telefone
export function digitos(tel) {
  const primeiro = String(tel || "").split(/[\/;,]| ou /i)[0];
  let d = primeiro.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9) d = "351" + d;
  return d.length >= 11 ? d : "";
}
export const eTelemovel = (tel) => { const d = digitos(tel); return d.startsWith("3519") && d.length === 12; };
export const contaInstagram = (u) => { const m = String(u || "").match(/instagram\.com\/([A-Za-z0-9_.]+)/i); return m ? m[1] : ""; };
export function canaisDe(c) {
  const out = {};
  const wa = c.whatsapp && digitos(c.whatsapp) ? c.whatsapp : eTelemovel(c.telefone) ? c.telefone : "";
  if (wa) out.whatsapp = digitos(wa);
  if (c.email) out.email = c.email;
  if (contaInstagram(c.instagram)) out.instagram = contaInstagram(c.instagram);
  if (digitos(c.telefone)) out.telefone = digitos(c.telefone);
  return out;
}
export function canalPrincipal(c) {
  const k = canaisDe(c), rec = normalizarChave(c.canal_recomendado || c.canal || "");
  if (rec.includes("instagram") && k.instagram) return "instagram";
  if (rec.includes("whatsapp") && k.whatsapp) return "whatsapp";
  if ((rec.includes("email") || rec.includes("website")) && k.email) return "email";
  return ["whatsapp", "email", "instagram", "telefone"].find((x) => k[x]) || "";
}
