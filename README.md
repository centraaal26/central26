# Central 26

Espaço de trabalho interno do Grupo TwentySix: tarefas por marca e por período, equipa com cargos e hierarquia, registo de quem fez o quê e notificações no telemóvel.

- **App:** https://centraaal26.github.io/central26/
- **Demonstração** (dados fictícios, ficam só no aparelho): https://centraaal26.github.io/central26/?demo

## O que já faz (fase 1)

- **Entrada com email e palavra-passe.** As contas são criadas pela administração na página Equipa. A pessoa recebe uma palavra-passe temporária e escolhe a sua no primeiro acesso.
- **Equipa:** departamentos, cargos e papéis.
  - **CEO:** vê e faz tudo.
  - **Administração:** gere a equipa e vê tudo.
  - **Chefe de departamento:** dá tarefas e vê o trabalho do seu departamento.
  - **Colaborador:** vê as suas tarefas e as tarefas sem responsável do seu departamento.
- **Tarefas por marca:** TwentySix, Barbearia 26 de Junho, 26 Academy, 26 Tech, Grooms e Grupo 26 (interno).
  - Separadores Diárias, Semanais, Mensais, Anuais e Pontuais. As tarefas repetidas voltam sozinhas a «Por fazer».
  - Vistas Lista e Quadro, responsável, prazo, prioridade, checklist e notas.
- **Quem fez o quê:** tarefas concluídas por pessoa (hoje, semana, mês), tarefas em atraso e registo de todas as ações.
- **Eliminar, anular e selecionar várias:** menu ⋯ em cada tarefa, botão «Anular» durante 7 segundos depois de eliminar, e modo «Selecionar» para concluir, atribuir ou eliminar várias tarefas de uma vez.
- **Notificações:** dentro da app e no telemóvel, quando alguém te atribui uma tarefa ou quando concluem uma tarefa que criaste.
- **Comercial (CRM):** clientes do Multixop e barbearias das bases de leads.
  - Ficha editável: aniversário, contactos, morada, distrito, responsável e notas.
  - Registo de contactos, que pode criar uma tarefa com o próximo passo.
  - Funil de vendas.
  - Análise: vendas por mês e por linha de negócio, mais e menos vendidos, ofertas, devoluções, clientes a contactar, aniversários e clientes e leads por distrito.
  - Mapa: clientes, clientes ativos, leads e vendas por distrito, concelho e freguesia (limites oficiais CAOP 2025). Toca num distrito para ver os concelhos e num concelho para ver as freguesias e cada cliente no mapa. O botão «Localizar moradas» procura as moradas no mapa e preenche a freguesia.
  - Importação do SAF-T do Multixop. Só a administração, o CEO e o departamento Comercial veem o CRM.
- **Mensagens:** canal Geral, um canal por departamento (o departamento e a direção), conversas diretas, grupos com nome e mensagens de voz.
  - Menções com @nome, que avisam a pessoa mencionada.
  - Editar e apagar as próprias mensagens, com «Anular».
  - Contagem das mensagens por ler. Uma conversa direta gera um só aviso até ser lida.
  - Ninguém lê conversas diretas dos outros, nem a administração.
- **Agenda do CEO:** vista do mês e dos próximos eventos, com as tuas tarefas com prazo.
  - Só o CEO e quem tiver a permissão «Pode gerir a agenda do CEO» criam e mudam eventos.
  - Cada evento pode ter participantes (veem-no e recebem convite e lembrete) ou ser visível para toda a equipa.
  - O CEO é avisado quando outra pessoa lhe marca, muda ou cancela algo.
- **Logística:** encomendas, entregas de máquinas, recolhas e reposições das barbearias.
  - O Comercial e a direção enviam a encomenda com os artigos, a morada, o número da fatura e o ficheiro da fatura (PDF ou fotografia). A Logística recebe um aviso.
  - A Logística marca os artigos à medida que os prepara e muda o estado: Nova, Em preparação, Pronta, Em rota, Entregue. Quem pediu é avisado quando fica pronta e quando é entregue.
  - O Comercial só altera ou elimina as suas encomendas enquanto estão «Nova». Depois disso, só a pode cancelar.
  - O Comercial também faz entregas: vê e planeia rotas, junta encomendas prontas e marca-as como entregues. Preparar os artigos continua a ser da Logística.
  - Rotas: escolhes as encomendas e os locais (barbearias, armazém, outras moradas) e a app põe as paragens pela ordem mais curta, com mapa, quilómetros e tempo. Abre a navegação no Google Maps (todas as paragens) ou no Waze (uma a uma). Ao marcar uma paragem como feita, a encomenda passa a «Entregue».
  - Locais fixos: sede, 26 Tech, Avenida da República e as barbearias. Falta preencher a morada das barbearias em Logística → Locais.
- **Auditoria dos sites (Tecnológico):** registo dos problemas encontrados nas auditorias, com marca, prioridade (P0 a P3), responsável, estado e semana do plano.
  - Estados: Novo, Confirmado, Em correção, A aguardar informação, Resolvido, Validado e Aceite pela administração.
  - Quem tem um item atribuído recebe um aviso, vê o item e avança o estado até «Resolvido». O Tecnológico é avisado para validar.
  - Nada fecha sem evidência: validar exige descrever a verificação feita. Só a administração aceita um risco, com o motivo registado.
  - Plano semanal com o progresso de cada semana e aviso quando um P0 passa da semana prevista.
  - Importação e exportação da folha de acompanhamento em Excel. Os achados de segurança ficam só na base de dados, nunca no GitHub.
- **Fornecedores (Operacional):** lista de fornecedores com categoria, estado, marcas que servem, contactos, condições e avaliação.
  - Registo de cada contacto (chamada, email, reunião, visita) e data para voltar a contactar, que aparece no início.
  - Pedidos de orçamento: juntas os fornecedores, registas as propostas (preço, prazo de entrega, condições, validade) e comparas lado a lado. A app assinala a mais barata e o texto do pedido já vem escrito para enviar por email.
  - Só a direção e o Operacional veem os fornecedores.
- **Financeiro (só a direção):** faturação das barbearias e custos de cada mês, a partir das folhas mensais da Ondina & Maia.
- **Marketing (Marketing e direção):** calendário de publicações por marca, ideias, texto das publicações e documentos (guiões, datas importantes). Importa o calendário do Notion.
- **Stocks TwentySix (direção, Logística e Comercial):** produtos por categoria, retirar e dar entrada, mínimos com lembretes no telemóvel até ser reposto, histórico e importação de Excel.
- **Seguros e viaturas (direção, Administrativo e Logística):** datas dos seguros, das revisões, das inspeções e do IUC de cada viatura, com avisos no telemóvel antes de cada data e até alguém a marcar como tratada; ao renovar, a data seguinte fica logo criada.
- **Pesquisa global:** Ctrl/⌘ + K (ou o botão «Procurar…») procura em tarefas, pessoas, clientes, encomendas, produtos, fornecedores, publicações, auditoria, agenda e conversas.
- **Assistente (IA):** cada pessoa pede ajuda para escrever (descrições, legendas, emails, resumos) ou pergunta sobre o seu trabalho; o assistente consulta os dados da Central com as permissões dessa pessoa.
- **Cópia de segurança (direção):** todos os dados num ficheiro .json (para recuperar) ou em Excel (para consultar).
  - Resumo do ano com o estado de cada mês (importado, em falta, custos copiados de outro mês), médias e gráfico de faturação e custos.
  - Barbearias: faturação, pagamentos aos barbeiros, custos fixos e resultado de cada espaço, e a evolução mês a mês.
  - Despesas partilhadas, impostos, Hairshopping, Tech e Formação por rubrica e por mês, agrupadas por categoria (editável), com os valores fora do normal destacados.
  - A folha RH (vencimentos de cada pessoa) não é lida: só entra o total pago aos barbeiros de cada espaço.
- **Modelos sugeridos:** rotinas de cada marca e rotinas da Logística.
- **Segurança:** as permissões são aplicadas na própria base de dados, não só no ecrã.

## Instalação (uma única vez)

### 1. Base de dados
1. Supabase → **SQL Editor** → **New query**.
2. Cola o conteúdo de `supabase/schema.sql` e carrega em **Run**. Deve terminar com «Success».

### 2. Fechar os registos públicos
Supabase → **Authentication** → **Sign In / Providers**: desliga **Allow new users to sign up**. As contas passam a ser criadas só pela administração.

### 3. Gestão da equipa
SQL Editor → **New query** → cola o conteúdo de `supabase/02-equipa.sql` → **Run**. É isto que permite criar empregados, repor palavras-passe e desativar contas a partir da app.

### 3b. Notificações no telemóvel (opcional)
Só é preciso para os avisos chegarem ao telemóvel; dentro da app funcionam sem isto. Enquanto esta função não estiver instalada, o botão «Ativar neste aparelho» avisa que falta este passo. Instala esta função:

1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Dá-lhe o nome exato da tabela abaixo, cola o código do ficheiro indicado e carrega em **Deploy**.
3. Na página da função, desliga **Verify JWT** (ou «Enforce JWT verification»). A função valida a sessão no próprio código.

| Nome (tem de ser exatamente este) | Ficheiro |
|---|---|
| `enviar-push` | `supabase/functions/enviar-push/index.ts` |
| `assistente` (passo 3n, opcional) | `supabase/functions/assistente/index.ts` |

O editor do Supabase sugere um nome automático (por exemplo «hyper-function»). Apaga-o e escreve `enviar-push` antes de carregar em **Deploy**.

O editor abre já com um código de exemplo («Hello …»): apaga-o todo antes de colar o nosso. Se a função já existir com esse exemplo, abre-a, separador **Code**, substitui todo o conteúdo pelo do ficheiro e carrega em **Deploy** outra vez. Sempre que este ficheiro mudar no GitHub, repete este passo.

### 3c. CRM comercial
1. SQL Editor → **New query** → cola o conteúdo de `supabase/03-crm.sql` → **Run**.
2. Na app: **Comercial** → **Importar** → escolhe o ficheiro `central26-dados-iniciais.json` (enviado à parte, **nunca** o carregues para o GitHub) → **Importar agora**.
3. Todos os meses, exporta o SAF-T no Multixop e importa-o da mesma forma. O que foi preenchido no CRM não é apagado.

### 3d. Mensagens e agenda
1. SQL Editor → **New query** → cola o conteúdo de `supabase/04-chat-agenda.sql` → **Run**.
2. Se aparecer o aviso «pg_cron indisponível», vai a **Database → Extensions**, ativa **pg_cron** e corre o script outra vez. É o que envia os lembretes da agenda.
3. Na app: **Equipa** → **Samuel Maia** → marca «Pode gerir a agenda do CEO» → **Guardar alterações**.

### 3e. Logística
1. SQL Editor → **New query** → cola o conteúdo de `supabase/05-logistica.sql` → **Run**.
2. O script cria também o espaço privado «faturas» no Storage (até 10 MB por ficheiro). Se aparecer um aviso sobre o Storage, confirma em **Storage** que o espaço «faturas» existe e é privado.
3. Na app: **Logística** → **Locais** → escreve a morada de cada barbearia, com código postal.

As moradas são procuradas no mapa com o OpenStreetMap e os trajetos são calculados pelo serviço público OSRM. Ambos são gratuitos e não precisam de conta.

### 3f. Mapa de clientes
1. SQL Editor → **New query** → cola o conteúdo de `supabase/06-mapa.sql` → **Run**.
2. Corre também outra vez o `supabase/05-logistica.sql`, para o Comercial passar a ver e fazer rotas.
3. Na app: **Comercial** → **Mapa** → **Localizar moradas**. Deixa a página aberta até terminar (cerca de um segundo por morada). Fica guardado para toda a equipa.

Os clientes vindos do Multixop só aparecem no mapa depois de terem código postal ou concelho na ficha, porque o SAF-T exportado não traz a localidade.

### 3g. Auditoria dos sites
1. SQL Editor → **New query** → cola o conteúdo de `supabase/07-auditoria.sql` → **Run**.
2. Na app: **Auditoria dos sites** → **Importar** → escolhe a folha de acompanhamento (`Central-Grupo26.xlsx`).
3. Em **Plano semanal**, indica a data em que começa a semana 1.

A folha da auditoria tem informação de segurança dos sites: guarda-a fora do GitHub (o `.gitignore` já exclui ficheiros `.xlsx`).

### 3h. Fornecedores
1. SQL Editor → **New query** → cola o conteúdo de `supabase/08-operacional.sql` → **Run**.
2. Na app: **Fornecedores** → **Importar** → escolhe a lista inicial (`central26-fornecedores-iniciais.xlsx`, feita a partir do SAF-T e das folhas de despesas). Também há um modelo em branco para descarregar.

### 3i. Financeiro
1. SQL Editor → **New query** → cola o conteúdo de `supabase/09-financeiro.sql` → **Run**.
2. Na app: **Financeiro** → **Importar** → escolhe todas as folhas mensais de uma vez. Um mês que já existe é substituído pela versão nova.

### 3j. Marketing
1. SQL Editor → **New query** → cola o conteúdo de `supabase/10-marketing.sql` → **Run**.
2. Na app: **Marketing** → **Importar** → escolhe o ficheiro `central26-marketing-notion.json` (preparado a partir da exportação do Notion). Voltar a importar não duplica nada.

### 3k. Mensagens de voz, grupos e revisão de segurança
SQL Editor → **New query** → cola o conteúdo de `supabase/11-mensagens-e-seguranca.sql` → **Run**. Corre-se depois de todos os anteriores. Liga os grupos com nome e as mensagens de voz nas Mensagens, e fecha o acesso às funções da base de dados a quem não tem sessão iniciada.

### 3l. Foto de perfil, avisos por email e Stocks da TwentySix
1. SQL Editor → **New query** → cola o conteúdo de `supabase/12-perfil-email-stocks.sql` → **Run**. Liga a foto e a cor de perfil, as preferências de email e os Stocks (já com a lista de produtos da TwentySix, sem quantidades).
2. Se aparecer o aviso «pg_cron indisponível», ativa **pg_cron** em **Database → Extensions** e corre o script outra vez: é o que envia os lembretes de stock de 15 em 15 minutos.
3. **Emails (opcional).** Os avisos por email usam o serviço Resend (gratuito até 3000 emails por mês e 100 por dia). Saem emails das tarefas atribuídas, da agenda, das datas dos seguros e viaturas e das mensagens (um por conversa até ser lida); cada pessoa escolhe em **Mais** quais quer receber:
   1. Cria uma conta em resend.com, vai a **Domains → Add domain** e adiciona `avisos.twentysix.pt` (um subdomínio, para não mexer no email normal da empresa).
   2. Copia os registos DNS que o Resend mostra para o painel de DNS do domínio `twentysix.pt` e espera que fiquem verificados.
   3. Em **API Keys**, cria uma chave com permissão de envio (**Sending access**) só para esse domínio. Sem domínio verificado, o Resend só deixa enviar para o email de quem criou a conta.
   4. No Supabase: **Edge Functions → Secrets** → adiciona `RESEND_API_KEY` com a chave e `EMAIL_REMETENTE` com `Central 26 <central@avisos.twentysix.pt>`.
   5. Volta a instalar a função `enviar-push` com o código atual (passo 3b). Na app, **Mais → Avisos por email → Enviar email de teste**.
4. Stocks: preenche as quantidades produto a produto («Acertar contagem») ou em **Stocks → Importar → Descarregar modelo**, preenche o Excel e importa-o. Em **Stocks → Avisos** (direção) escolhes quem recebe os lembretes e o horário.

### 3m. Encomendas ligadas aos Stocks e cópias de segurança
SQL Editor → **New query** → cola o conteúdo de `supabase/13-encomendas-stocks-copias.sql` → **Run**.
- Os artigos das encomendas ligam-se aos produtos dos Stocks (a app reconhece «6 SPARK», «Shampoo Hack 1000ML»…; a Logística pode corrigir a ligação em cada artigo). Quando a encomenda fica **Pronta**, o stock desce; se for cancelada ou voltar atrás, volta a entrar.
- **Mais → Cópia de segurança** (direção): descarrega todos os dados num ficheiro. Se passar uma semana sem cópia, a direção recebe um lembrete à segunda-feira às 9h.

### 3n. Assistente (IA)
1. SQL Editor → **New query** → cola o conteúdo de `supabase/14-assistente.sql` → **Run**.
2. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor** → nome `assistente` → apaga o exemplo e cola o código de `supabase/functions/assistente/index.ts` → **Deploy**.
3. Escolhe o serviço de IA e cria a chave:
   - **Gratuito — Groq:** cria uma conta em **console.groq.com** → **API Keys** → **Create API Key**. Usa modelos abertos (por defeito `openai/gpt-oss-120b`). Tem limites diários para toda a equipa (cerca de 1000 pedidos e 200 mil tokens por dia, o que dá algumas dezenas de conversas) e escreve pior do que o Claude.
   - **Pago — Claude:** cria uma conta em **console.anthropic.com** (é diferente da subscrição do Claude ou do ChatGPT: paga-se pelo uso). Em **Billing** carrega créditos e em **Limits** põe um teto de gasto mensal. Em **API Keys** cria uma chave.
4. Supabase → **Edge Functions** → **Secrets** → adiciona `GROQ_API_KEY` (gratuito) ou `ANTHROPIC_API_KEY` (pago) com a chave. Se tiveres as duas, usa o Claude. Para mudar de serviço mais tarde basta trocar a chave: a app não muda.
5. Na app: **Assistente**. A direção define em **Assistente → Utilização da equipa** se está ligado e quantos pedidos por mês cada pessoa pode fazer (400 por defeito).

O assistente só consulta o que a pessoa que pergunta já pode ver na app (as mesmas regras de acesso) e não altera nada. As conversas são privadas: nem a direção as lê, só vê quantos pedidos cada pessoa fez. Os dados consultados para responder são enviados ao serviço de IA escolhido.

### 3o. Seguros e viaturas
1. SQL Editor → **New query** → cola o conteúdo de `supabase/15-seguros-viaturas.sql` → **Run**.
2. Na app: **Seguros e viaturas** → **Viaturas** → **Nova viatura** (com as datas que já souberes) e **Prazos** → **Novo prazo** para os seguros da empresa (multirriscos, acidentes de trabalho…).
3. A Central avisa no telemóvel quando faltam os dias escolhidos em cada prazo (30 por defeito nos seguros), na última semana, na véspera, no próprio dia e, se passar, uma vez por semana até ser marcado como **Renovado** ou **Feito**. Recebem o responsável do prazo e o da viatura; em **Avisos** (direção) escolhes quem recebe também todos os avisos e a hora.

### 4. Primeira conta
1. Supabase → **Authentication** → **Users** → **Add user** → **Create new user**. Usa o teu email e uma palavra-passe forte, com **Auto Confirm User** ligado.
2. **SQL Editor**: cola `supabase/primeiro-acesso.sql`, troca `COLOCA-AQUI-O-TEU-EMAIL` pelo teu email e carrega em **Run**.

### 5. Publicar o site
GitHub → repositório → **Settings** → **Pages** → **Source: Deploy from a branch** → **main** / **(root)** → **Save**. Passados 1 a 2 minutos fica em https://centraaal26.github.io/central26/.

### 6. Criar a equipa
1. Entra na app → **Equipa** → **Adicionar empregado**.
2. Começa pelo Marcos Maia, com o papel **CEO**. Depois adiciona o Samuel (Administração) e os restantes.
3. A app mostra uma palavra-passe temporária. Entrega-a pessoalmente a cada pessoa.

### 7. Instalar nos telemóveis
- **Android (Chrome):** menu ⋮ → **Instalar app**.
- **iPhone (Safari, iOS 16.4 ou mais recente):** Partilhar → **Adicionar ao ecrã principal**.

Depois, em cada telemóvel: **Mais** → **Ativar neste aparelho** → **Enviar notificação de teste**.

## Estrutura

```
index.html · manifest.webmanifest · sw.js   página, instalação e notificações
css/app.css                                 aspeto
js/app.js                                   ecrãs e interações
js/api.js                                   ligação ao Supabase
js/demo.js                                  modo de demonstração (?demo)
js/crm.js · js/chat.js · js/agenda.js       Comercial, Mensagens e Agenda
js/logistica.js · js/geo.js                 Logística, moradas no mapa e rotas
js/mapa.js · geo/                           mapa do Comercial e limites CAOP 2025 (DGT), simplificados
js/auditoria.js                             registo da auditoria aos sites e plano semanal
js/fornecedores.js · js/xlsx.js             fornecedores, pedidos de orçamento e leitura de Excel
js/financeiro.js                            faturação e custos por mês (folhas da Ondina & Maia)
js/marketing.js                             calendário de publicações, ideias e documentos do Marketing
js/stocks.js                                stocks da TwentySix: quantidades, movimentos e avisos de reposição
js/prazos.js                                seguros e viaturas: datas, avisos antes do dia e histórico
js/pesquisa.js                              pesquisa global (Ctrl/⌘ + K)
js/assistente.js                            assistente de IA (conversas, sugestões por departamento, utilização)
js/dados.js · js/modelos.js                 marcas, períodos, regras e modelos
supabase/schema.sql                         tabelas, permissões e automatismos
supabase/functions/                         funções de servidor
```

A chave em `js/config.js` é a chave **publishable**, pública por natureza. **Nunca** coloques neste repositório a chave secret / service_role nem a palavra-passe da base de dados.
