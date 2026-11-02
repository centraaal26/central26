// Dados fixos, datas e regras partilhadas pela app e pelo modo de demonstração.

export const MARCAS = [
  { id: "twentysix", nome: "TwentySix", curto: "TwentySix", logo: "img/logo-twentysix.webp", site: "https://twentysix.pt/", host: "twentysix.pt",
    eyebrow: "Produtos · 100% produzidos em Portugal",
    desc: "Produtos de cabelo, barba e tratamento feitos por barbeiros, com loja online, Área PRO para profissionais e equipamentos de barbearia." },
  { id: "barbearia", nome: "Barbearia 26 de Junho", curto: "Barbearia", logo: "img/logo-barbearia.webp", site: "https://barbearia26dejunho.pt/", host: "barbearia26dejunho.pt",
    eyebrow: "Barbearia · desde 2012",
    desc: "Barbearia de inspiração old school nascida em Vila Nova de Gaia. Cinco espaços: Jardim do Morro, Madalena, Santo Ovídio, Praça da República e Arcozelo." },
  { id: "academy", nome: "26 Academy", curto: "Academy", logo: "img/logo-academy.webp", site: "https://26academy.pt/cursos/", host: "26academy.pt",
    eyebrow: "Formação · certificada pela DGERT",
    desc: "Academia de barbeiros com cursos em Caxinas, Gondomar, Lisboa, Lousada, Ovar, Porto e Vila Nova de Gaia." },
  { id: "tech", nome: "26 Tech", curto: "Tech", logo: "img/logo-tech.webp", site: "https://26tech.pt/", host: "26tech.pt",
    eyebrow: "Equipamentos · venda e aluguer",
    desc: "Venda e aluguer de equipamentos de estética e barbearia, com assistência técnica pós-venda." },
  { id: "grooms", nome: "Grooms", curto: "Grooms", logo: null, site: "https://www.casamentos.pt/cuidado-masculino/grooms-by-barbearia-26-de-junho--e135149", host: "casamentos.pt",
    eyebrow: "Casamentos · by Barbearia 26 de Junho",
    desc: "Preparação do noivo para o dia do casamento: análise de estilo, preparação na véspera e finalização no próprio dia." },
  { id: "grupo", nome: "Grupo 26", curto: "Grupo", logo: null, site: null, host: null,
    eyebrow: "Interno · todas as marcas",
    desc: "Tarefas internas que não pertencem a uma marca: logística, administração, equipamentos e organização dos espaços." },
];
export const MARCA = Object.fromEntries(MARCAS.map((m) => [m.id, m]));

export const FREQS = [
  { id: "diaria", tab: "Diárias", um: "Diária", reset: "Voltam a ficar por fazer todos os dias à meia-noite." },
  { id: "semanal", tab: "Semanais", um: "Semanal", reset: "Voltam a ficar por fazer todas as segundas-feiras." },
  { id: "mensal", tab: "Mensais", um: "Mensal", reset: "Voltam a ficar por fazer no dia 1 de cada mês." },
  { id: "anual", tab: "Anuais", um: "Anual", reset: "Voltam a ficar por fazer a 1 de janeiro." },
  { id: "unica", tab: "Pontuais", um: "Pontual (sem repetição)", reset: "Tarefas sem repetição, com prazo opcional." },
];
export const FREQ = Object.fromEntries(FREQS.map((f) => [f.id, f]));
export const ESTADOS = { por_fazer: "Por fazer", em_curso: "Em curso", concluido: "Concluída" };
export const PRIORIDADES = { alta: "Alta", media: "Média", baixa: "Baixa" };
export const PRI_ORDEM = { alta: 0, media: 1, baixa: 2 };
export const PAPEIS = { ceo: "CEO", admin: "Administração", chefe: "Chefe de departamento", colaborador: "Colaborador" };

export const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const MES_L = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const DIA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function semanaIso(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia);
  const y = t.getUTCFullYear();
  return [y, Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7)];
}

export function periodo(freq, d = new Date()) {
  if (freq === "diaria") return ymd(d);
  if (freq === "semanal") { const [y, w] = semanaIso(d); return y + "-W" + pad(w); }
  if (freq === "mensal") return d.getFullYear() + "-" + pad(d.getMonth() + 1);
  if (freq === "anual") return String(d.getFullYear());
  return "unica";
}

export function inicioPeriodo(tipo, d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (tipo === "semana") x.setDate(x.getDate() - ((x.getDay() || 7) - 1));
  if (tipo === "mes") x.setDate(1);
  if (tipo === "ano") { x.setMonth(0); x.setDate(1); }
  return x;
}

export function rotuloPeriodo(freq) {
  const d = new Date();
  if (freq === "diaria") return "Hoje · " + DIA[d.getDay()] + ", " + d.getDate() + " de " + MES_L[d.getMonth()];
  if (freq === "semanal") {
    const seg = inicioPeriodo("semana", d), dom = new Date(seg); dom.setDate(seg.getDate() + 6);
    const a = seg.getMonth() === dom.getMonth() ? String(seg.getDate()) : seg.getDate() + " de " + MES_L[seg.getMonth()];
    return "Semana " + semanaIso(d)[1] + " · " + a + " a " + dom.getDate() + " de " + MES_L[dom.getMonth()];
  }
  if (freq === "mensal") return cap(MES_L[d.getMonth()]) + " de " + d.getFullYear();
  if (freq === "anual") return "Ano de " + d.getFullYear();
  return "Sem repetição";
}

export function rotuloPrazo(s) {
  if (!s) return "";
  const hoje = new Date(), am = new Date(), on = new Date();
  am.setDate(am.getDate() + 1); on.setDate(on.getDate() - 1);
  if (s === ymd(hoje)) return "Hoje";
  if (s === ymd(am)) return "Amanhã";
  if (s === ymd(on)) return "Ontem";
  const [y, m, d] = s.split("-").map(Number);
  return d + " " + MES[m - 1] + (y !== hoje.getFullYear() ? " " + y : "");
}

export function dataLonga(ts) {
  const d = new Date(ts);
  return d.getDate() + " de " + MES_L[d.getMonth()] + " de " + d.getFullYear();
}

export function haQuanto(ts) {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return "agora mesmo";
  if (s < 3600) return "há " + Math.floor(s / 60) + " min";
  if (s < 86400) return "há " + Math.floor(s / 3600) + " h";
  const d = Math.floor(s / 86400);
  if (d === 1) return "ontem";
  if (d < 7) return "há " + d + " dias";
  const x = new Date(ts);
  return x.getDate() + " " + MES[x.getMonth()];
}

// ---------- Regras das tarefas (iguais às da base de dados) ----------
export function estadoAtual(t) {
  return t.freq === "unica" || t.estado_periodo === periodo(t.freq) ? t.estado || "por_fazer" : "por_fazer";
}
export const concluida = (t) => estadoAtual(t) === "concluido";
export function itensChecklist(t) {
  const fresco = t.freq !== "unica" && t.checklist_periodo !== periodo(t.freq);
  return (t.checklist || []).map((i) => ({ id: i.id, texto: i.texto, feito: fresco ? false : !!i.feito }));
}
export function emAtraso(t, hoje = ymd(new Date())) {
  return !!t.prazo && t.prazo < hoje && !concluida(t);
}
export function ordenar(lista) {
  return lista.sort((a, b) =>
    (concluida(a) - concluida(b)) ||
    (PRI_ORDEM[a.prioridade] - PRI_ORDEM[b.prioridade]) ||
    ((a.prazo || "9999") < (b.prazo || "9999") ? -1 : (a.prazo || "9999") > (b.prazo || "9999") ? 1 : 0) ||
    (String(a.criado_em || "") < String(b.criado_em || "") ? -1 : 1));
}

// Permissões no ecrã (a base de dados aplica as mesmas regras)
export const eGestor = (eu) => !!eu && (eu.papel === "ceo" || eu.papel === "admin");
export function podeAtribuirA(eu, pessoa) {
  if (!eu) return false;
  if (!pessoa || pessoa.id === eu.id) return true;
  if (!pessoa.ativo) return false;
  if (eGestor(eu)) return true;
  return eu.papel === "chefe" && pessoa.departamento_id === eu.departamento_id;
}
export function podeEditar(eu, t) {
  if (!eu) return false;
  return eGestor(eu) || t.responsavel_id === eu.id || t.criado_por === eu.id ||
    (t.departamento_id && t.departamento_id === eu.departamento_id && (eu.papel === "chefe" || !t.responsavel_id));
}
export function podeApagar(eu, t) {
  if (!eu) return false;
  return eGestor(eu) || t.criado_por === eu.id || (eu.papel === "chefe" && t.departamento_id && t.departamento_id === eu.departamento_id);
}
export function podeVer(eu, t) {
  if (!eu) return false;
  return eGestor(eu) || t.responsavel_id === eu.id || t.criado_por === eu.id ||
    (t.departamento_id && t.departamento_id === eu.departamento_id && (eu.papel === "chefe" || !t.responsavel_id));
}

export function iniciais(nome) {
  const p = String(nome || "?").trim().split(/\s+/);
  return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}
export const normalizar = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
