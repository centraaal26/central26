// Central 26 — Relatório mensal da direção: os números do mês num só sítio (e por email no dia 1).
import { eGestor, MES_L } from "./dados.js";

const eur = (v) => (Number(v) || 0).toLocaleString("pt-PT", { maximumFractionDigits: 0 }) + " €";
const num = (v) => (Number(v) || 0).toLocaleString("pt-PT", { maximumFractionDigits: 1 });
const nomeMes = (m) => MES_L[+m.slice(5, 7) - 1] + " de " + m.slice(0, 4);
const dataPt = (d) => (d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) : "");
const variacao = (a, b) => (!b ? "" : (a >= b ? "+" : "−") + Math.abs(Math.round(((a - b) / Math.abs(b)) * 100)) + "%");
function mesesRecentes() {
  const out = [], h = new Date();
  for (let i = 0; i < 13; i++) { const d = new Date(h.getFullYear(), h.getMonth() - i, 1); out.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")); }
  return out;
}

export function criarRelatorio(ctx) {
  const { S, api, esc, toast, falha, render, agendarRender } = ctx;
  const R = (S.rel = { mes: null, dados: {}, estado: {}, erro: {}, aEnviar: false });

  function carregar(mes) {
    if (R.estado[mes] === "a-carregar" || R.estado[mes] === "pronto") return;
    R.estado[mes] = "a-carregar";
    api.relatorio.dados(mes).then((d) => { R.dados[mes] = d; R.estado[mes] = "pronto"; })
      .catch((e) => { R.estado[mes] = /relatorio_dados|PGRST202|Could not find/i.test(e.message) ? "falta-script" : "erro"; R.erro[mes] = e.message; })
      .finally(() => agendarRender());
  }

  function vista(param) {
    if (!eGestor(S.eu)) return '<div class="vazio"><h3>Só para a direção</h3><p>O relatório mensal só está disponível para a direção.</p></div>';
    const meses = mesesRecentes();
    R.mes = /^\d{4}-\d{2}$/.test(param || "") ? param : R.mes || meses[1];
    carregar(R.mes);
    const atual = R.mes === meses[0];
    let h = '<div class="cab" data-marca="grupo"><div><div class="eyebrow">Direção</div><h1>Relatório mensal</h1><p class="sub-cab">Vendas e margem da TwentySix, clientes, barbearias, stock, 26 Academy, prazos e tarefas. Chega também por email à direção no dia 1 de cada mês, com o mês anterior.</p></div>' +
      '<div class="acts"><button class="btn sec" data-acao="rel-enviar" data-para="mim"' + (R.aEnviar ? " disabled" : "") + '>Enviar para mim</button><button class="btn pri" data-acao="rel-enviar" data-para="direcao"' + (R.aEnviar ? " disabled" : "") + ">Enviar à direção</button></div></div>";
    h += '<div class="barra"><div class="ferr"><label class="sr" for="rel-mes">Mês</label><select class="sel" id="rel-mes">' + meses.map((m, i) => '<option value="' + m + '"' + (m === R.mes ? " selected" : "") + ">" + esc(nomeMes(m).replace(/^./, (c) => c.toUpperCase()) + (i === 0 ? " (até hoje)" : "")) + "</option>").join("") + "</select></div></div>";
    const st = R.estado[R.mes];
    if (st === "falta-script") return h + '<div class="vazio"><h3>Falta instalar o relatório na base de dados</h3><p>No Supabase, abre o SQL Editor, cola o ficheiro <b>supabase/20-margens-encomendas-relatorio.sql</b> do GitHub e carrega em Run.</p></div>';
    if (st === "erro") return h + '<div class="aviso erro">Não foi possível gerar o relatório: ' + esc(R.erro[R.mes] || "") + "</div>";
    if (st !== "pronto") return h + '<div class="tabela"><div class="esqueleto"><i style="width:50%"></i></div></div>';
    return h + corpo(R.dados[R.mes], atual);
  }

  const kpi = (r, v, n = "") => '<div class="kpi"><span>' + esc(r) + "</span><b>" + v + "</b>" + (n ? "<small>" + esc(n) + "</small>" : "") + "</div>";
  const tabela = (cab, linhas) => '<div class="tabela-scroll"><table class="ranking"><thead><tr>' + cab.map((c, i) => "<th" + (i ? ' class="n"' : "") + ">" + esc(c) + "</th>").join("") + "</tr></thead><tbody>" +
    linhas.map((l) => "<tr>" + l.map((c, i) => "<td" + (i ? ' class="n"' : "") + ">" + c + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>";
  const sec = (t, c) => '<section class="cartao-sec rel-sec"><h3>' + esc(t) + "</h3>" + c + "</section>";
  const nota = (t) => '<p class="nota-tab">' + t + "</p>";

  function corpo(d, atual) {
    const v = d.vendas || {}, m = d.margem || {}, margem = m.vendas_com_custo ? m.vendas_com_custo - m.custo : null;
    let h = "";
    if (atual) h += '<div class="aviso">O mês ainda não acabou: os números vão até hoje.</div>';
    if (d.ultima_venda && d.ultima_venda < d.mes + "-28" && !atual) h += '<div class="aviso">As vendas importadas do Multixop vão só até ' + esc(dataPt(d.ultima_venda)) + ". Importa o SAF-T mais recente no Comercial para o relatório ficar completo.</div>";
    h += sec("TwentySix", '<div class="resumo-crm aca-kpis">' +
      kpi("Vendas sem IVA", eur(v.mes), [variacao(v.mes, v.anterior) && variacao(v.mes, v.anterior) + " face ao mês anterior", variacao(v.mes, v.ano_passado) && variacao(v.mes, v.ano_passado) + " face ao ano passado"].filter(Boolean).join(" · ")) +
      kpi("Clientes que compraram", num(v.clientes), num(v.faturas) + " faturas") +
      kpi("Margem bruta", margem == null ? "—" : eur(margem), margem == null ? "falta o custo dos produtos (Comercial, Análise)" : Math.round((margem / m.vendas_com_custo) * 100) + "% · custo conhecido em " + Math.round((m.vendas_com_custo / Math.max(1, m.vendas)) * 100) + "% das vendas") +
      kpi("Notas de crédito", eur(v.notas_credito), v.ofertas ? num(v.ofertas) + " unidades oferecidas" : "") + "</div>" +
      (d.produtos?.length ? tabela(["Mais vendidos", "Unidades", "Vendas"], d.produtos.map((p) => [esc(p.nome), num(p.qtd), eur(p.valor)])) : nota("Sem vendas importadas neste mês.")));
    h += '<div class="duas">' + sec("Clientes novos", d.clientes_novos?.length ? tabela(["Cliente", "Vendas no mês"], d.clientes_novos.map((c) => [esc(c.nome), eur(c.valor)])) : nota("Nenhum cliente novo neste mês.")) +
      sec("Deixaram de comprar", (d.clientes_parados?.length ? nota("Compravam e estão há 3 a 6 meses sem comprar. Vale a pena ligar.") + tabela(["Cliente", "Última compra", "Último ano"], d.clientes_parados.map((c) => [esc(c.nome), esc(dataPt(c.ultima)), eur(c.valor_ano)])) : nota("Ninguém nesta situação."))) + "</div>";
    if (d.barbearias?.length) {
      const tot = d.barbearias.reduce((s, b) => s + +b.total, 0), ant = d.barbearias.reduce((s, b) => s + +(b.anterior || 0), 0);
      h += sec("Barbearias", '<div class="resumo-crm aca-kpis">' + kpi("Faturação", eur(tot), variacao(tot, ant) ? variacao(tot, ant) + " face ao mês anterior" : "") + "</div>" +
        tabela(["Loja", "Faturação", "Mês anterior", "Variação"], d.barbearias.map((b) => [esc(b.espaco), eur(b.total), b.anterior == null ? "—" : eur(b.anterior), b.anterior ? variacao(+b.total, +b.anterior) : "—"])) +
        (d.financeiro_avisos?.length ? nota("Avisos da folha: " + esc(d.financeiro_avisos.map((a) => (typeof a === "string" ? a : a.texto || a.msg || "")).filter(Boolean).join(" · "))) : ""));
    } else h += sec("Barbearias", nota(d.financeiro_importado ? "A folha deste mês não tem faturação por loja." : 'A folha do Financeiro deste mês ainda não foi importada. <a href="#financeiro">Abrir o Financeiro</a>'));
    h += '<div class="duas">' + sec("Stock", (d.encomendar?.length ? nota("Encomendar ao laboratório:") + tabela(["Produto", "Dá para", "Fabrico", "Encomendar"], d.encomendar.map((p) => [esc(p.nome), num(p.dias_restantes) + " dias", num(p.prazo) + " dias", num(p.sugerido) + " un."])) : nota("Nada a encomendar ao laboratório nas próximas semanas.")) +
      (d.stock_minimo?.length ? nota("Abaixo do mínimo: " + esc(d.stock_minimo.map((p) => p.nome + " (" + p.quantidade + ")").join(", ")) + ".") : "")) +
      sec("26 Academy", '<div class="resumo-crm aca-kpis">' + kpi("A decorrer ou em avaliação", num(d.academy?.a_decorrer)) + kpi("Formandos novos", num(d.academy?.formandos_novos)) + kpi("Assiduidade (12 meses)", d.academy?.assiduidade == null ? "—" : num(d.academy.assiduidade) + "%") + "</div>") + "</div>";
    h += sec("Prazos e tarefas", '<div class="resumo-crm aca-kpis">' + kpi("Tarefas concluídas no mês", num(d.tarefas?.concluidas)) + kpi("Tarefas em atraso hoje", num(d.tarefas?.em_atraso)) + "</div>" +
      (d.prazos?.length ? tabela(["Seguros e viaturas nos próximos 30 dias", "Data"], d.prazos.map((p) => [esc(p.titulo), esc(dataPt(p.data))])) : ""));
    return h;
  }

  function clique(acao, el) {
    if (acao !== "rel-enviar") return false;
    const mim = el.dataset.para === "mim";
    R.aEnviar = true; render();
    api.relatorio.enviar(R.mes, mim).then((r) => toast(r.enviados ? "Relatório de " + nomeMes(r.mes || R.mes) + " enviado " + (mim ? "para o teu email" : "a " + r.enviados + (r.enviados === 1 ? " pessoa" : " pessoas")) + "." : "Não foi possível enviar o email.", !r.enviados))
      .catch(falha).finally(() => { R.aEnviar = false; render(); });
    return true;
  }
  function mudar(e) {
    if (e.target.id !== "rel-mes") return false;
    location.hash = "relatorio-" + e.target.value;
    return true;
  }
  function reiniciar() { Object.assign(R, { mes: null, dados: {}, estado: {}, erro: {}, aEnviar: false }); }
  return { vista, clique, mudar, reiniciar };
}
