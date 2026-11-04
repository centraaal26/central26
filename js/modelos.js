// Modelos sugeridos de tarefas. Ficam sem responsável: a chefia atribui depois.
// Cada modelo tem um código fixo para não ser carregado duas vezes.

const T = (titulo, freq, prioridade, o = {}) => ({ titulo, freq, prioridade, notas: "", checklist: [], prazo: null, departamento_id: null, ...o });
const cl = (a) => a.map((texto, i) => ({ id: "c" + i, texto, feito: false }));

export const MODELOS = {
  twentysix: {
    nome: "Rotinas TwentySix",
    tarefas: [
      T("Processar as encomendas da loja online", "diaria", "alta"),
      T("Responder a mensagens e comentários no Instagram e no Facebook", "diaria", "media", { departamento_id: "marketing" }),
      T("Validar os pedidos de registo na Área PRO", "diaria", "media", { departamento_id: "comercial" }),
      T("Rever o stock de pomadas, ceras e sprays", "semanal", "alta", { checklist: cl(["Fog Pomade", "Mist Pomade", "Clay Pomade", "Spark Pomade", "Blaze cera 100 ml", "Booster Grooming Spray"]) }),
      T("Publicar conteúdo no Instagram @twentysix.pt", "semanal", "media", { departamento_id: "marketing" }),
      T("Acompanhar a campanha de lançamento das cadeiras profissionais", "semanal", "media", { departamento_id: "comercial", checklist: cl(["Cadeira Profissional d’Áustria", "Cadeira Profissional d’Lencastre", "Cadeira Profissional Sancha"]) }),
      T("Enviar a newsletter do mês", "mensal", "media", { departamento_id: "marketing" }),
      T("Falar com os embaixadores da marca", "mensal", "baixa", { departamento_id: "marketing" }),
      T("Planear os lançamentos de produto do próximo ano", "anual", "media"),
    ],
  },
  barbearia: {
    nome: "Rotinas Barbearia 26 de Junho",
    tarefas: [
      T("Confirmar as marcações do dia em cada barbearia", "diaria", "alta", { checklist: cl(["Jardim do Morro", "Madalena", "Santo Ovídio", "Praça da República", "Arcozelo"]) }),
      T("Desinfetar e esterilizar navalhas, tesouras e pentes", "diaria", "alta"),
      T("Responder a mensagens no WhatsApp e no Instagram", "diaria", "media", { departamento_id: "marketing" }),
      T("Conferir a caixa da semana", "semanal", "alta", { departamento_id: "administrativo" }),
      T("Rever o stock de produtos TwentySix em cada barbearia", "semanal", "media"),
      T("Publicar no Instagram com a assinatura Fear The Buffalo", "semanal", "media", { departamento_id: "marketing" }),
      T("Responder às avaliações no Google", "mensal", "media", { departamento_id: "marketing" }),
      T("Reunião de equipa com os barbeiros", "mensal", "media"),
      T("Rever as candidaturas recebidas em Recrutamento", "mensal", "baixa", { departamento_id: "administrativo" }),
      T("Rever a tabela de preços", "anual", "media", { notas: "Preços publicados no site: Barba 16 €, Corte Curto 16 €, Corte Longo 25 €, Barba & Corte 24 €." }),
    ],
  },
  academy: {
    nome: "Rotinas 26 Academy",
    tarefas: [
      T("Responder a pedidos de informação sobre cursos", "diaria", "alta"),
      T("Registar presenças e sumários das turmas ativas", "diaria", "alta"),
      T("Atualizar as próximas datas dos cursos no site", "semanal", "media"),
      T("Publicar trabalhos dos formandos no Instagram @26academybarber", "semanal", "baixa", { departamento_id: "marketing" }),
      T("Confirmar o calendário das próximas turmas", "mensal", "alta", { checklist: cl(["Caxinas", "Gondomar", "Lisboa", "Lousada", "Ovar", "Porto", "Vila Nova de Gaia"]) }),
      T("Organizar o dossiê técnico-pedagógico das ações a decorrer", "mensal", "alta", { departamento_id: "administrativo", checklist: cl(["Sumários", "Folhas de presença", "Avaliações dos formandos", "Questionários de satisfação", "Certificados emitidos"]) }),
      T("Definir o plano anual de formação", "anual", "alta"),
      T("Preparar a manutenção da certificação DGERT", "anual", "alta", { departamento_id: "administrativo" }),
      T("Rever o Regulamento Interno", "anual", "media", { departamento_id: "administrativo", notas: "A versão publicada no site é a revisão de 2026." }),
    ],
  },
  tech: {
    nome: "Rotinas 26 Tech",
    tarefas: [
      T("Responder a pedidos de orçamento (comercial@twentysix.pt)", "diaria", "alta", { departamento_id: "comercial" }),
      T("Acompanhar os contratos de aluguer de equipamentos", "semanal", "alta", { departamento_id: "comercial" }),
      T("Publicar conteúdo sobre equipamentos no Instagram @26tech.pt", "semanal", "media", { departamento_id: "marketing" }),
      T("Agendar manutenções e assistência técnica pós-venda", "mensal", "alta", { departamento_id: "operacional" }),
      T("Atualizar a lista de equipamentos para venda e aluguer", "mensal", "media", { departamento_id: "comercial", checklist: cl(["Laser 4 Ondas", "Laser 3 Ondas", "EMS", "Alice 17-in-1", "Lather Machine"]) }),
      T("Planear a presença na ExpoCosmética", "anual", "media", { departamento_id: "marketing" }),
    ],
  },
  grooms: {
    nome: "Rotinas Grooms",
    tarefas: [
      T("Responder a pedidos de orçamento no Casamentos.pt", "diaria", "alta", { departamento_id: "comercial" }),
      T("Confirmar os casamentos do próximo mês", "semanal", "alta", { notas: "Os noivos devem marcar com cerca de um mês de antecedência." }),
      T("Pedir aos noivos uma opinião no Casamentos.pt", "mensal", "media", { departamento_id: "marketing" }),
      T("Publicar fotografias de preparações recentes", "mensal", "baixa", { departamento_id: "marketing" }),
      T("Atualizar pacotes, preços e fotografias no Casamentos.pt", "anual", "media", { departamento_id: "marketing", notas: "Preço atual anunciado: de 170 € a 450 €." }),
      T("Casamento · nome do noivo e data (modelo para duplicar)", "unica", "media", {
        notas: "Duplica esta tarefa para cada casamento e muda o título e o prazo.",
        checklist: cl(["Análise de estilo: fato, acessórios, local e temática", "Marcar a preparação na véspera", "Definir onde é a finalização: em casa ou na barbearia", "Confirmar deslocação e horário no dia", "Serviço no dia: cabelo, barba e maquilhagem", "Receber o pagamento (numerário ou transferência)", "Pedir opinião no Casamentos.pt"]),
      }),
    ],
  },
  grupo: {
    nome: "Rotinas da Logística",
    tarefas: [
      T("Preparar as encomendas pendentes", "diaria", "alta", { departamento_id: "logistica" }),
      T("Repor toalhas e consumíveis nas barbearias", "semanal", "media", { departamento_id: "logistica", checklist: cl(["Jardim do Morro", "Madalena", "Santo Ovídio", "Praça da República", "Arcozelo"]) }),
      T("Confirmar as entregas de máquinas da semana", "semanal", "alta", { departamento_id: "logistica" }),
      T("Fazer o inventário do armazém", "mensal", "media", { departamento_id: "logistica" }),
    ],
  },
};
