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
- **Prospeção de barbearias (direção e Comercial):** base de prospeção importada do Excel (estado, prioridade, zonas e plano de rua, guiões), pesquisa automática de barbearias novas todas as semanas, balanço semanal, e um agente que prepara a primeira abordagem a cada barbearia (mensagem para o contacto principal e questões a definir). Quem aprova revê, decide e envia: o email sai da app; o WhatsApp e o Instagram abrem com a mensagem pronta. Cada envio fica registado no CRM, com o seguimento da visita com amostras. Se a barbearia não responder, a Central prepara os seguimentos dos guiões (também por aprovar).
- **Seguros e viaturas (direção, Administrativo e Logística):** datas dos seguros, das revisões, das inspeções e do IUC de cada viatura, com avisos no telemóvel antes de cada data e até alguém a marcar como tratada; ao renovar, a data seguinte fica logo criada.
- **Pesquisa global:** Ctrl/⌘ + K (ou o botão «Procurar…») procura em tarefas, pessoas, clientes, encomendas, produtos, fornecedores, publicações, auditoria, agenda e conversas.
- **Assistente (IA):** cada pessoa pede ajuda para escrever (descrições, legendas, emails, resumos) ou pergunta sobre o seu trabalho; o assistente consulta os dados da Central com as permissões dessa pessoa.
- **Cópia de segurança (direção):** todos os dados num ficheiro .json (para recuperar) ou em Excel (para consultar).
  - Resumo do ano com o estado de cada mês (importado, em falta, custos copiados de outro mês), médias e gráfico de faturação e custos.
  - Barbearias: faturação, pagamentos aos barbeiros, custos fixos e resultado de cada espaço, e a evolução mês a mês.
  - Despesas partilhadas, impostos, Hairshopping, Tech e Formação por rubrica e por mês, agrupadas por categoria (editável), com os valores fora do normal destacados.
  - A folha RH (vencimentos de cada pessoa) não é lida: só entra o total pago aos barbeiros de cada espaço.
- **Modelos sugeridos:** rotinas de cada marca e rotinas da Logística.
- **Fiabilidade:** funciona sem rede (os dados ficam no aparelho e as alterações seguem quando a rede volta), avisa quando outra pessoa mudou o mesmo campo, reciclagem de 30 dias, histórico e comentários em cada ficha, pesquisa nas mensagens e notas, horas de sossego e resumo diário dos avisos, e cópia de segurança automática semanal.
- **Segurança:** as permissões são aplicadas na própria base de dados, não só no ecrã. O site tem uma política de segurança de conteúdo (só carrega código e dados dos serviços que usa) e o agente de prospeção só lê sites públicos e não copia links nem contactos estranhos das páginas para as mensagens.

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
| `prospecao` (passo 3p) | `supabase/functions/prospecao/index.ts` |
| `copia-seguranca` (passo 3q) | `supabase/functions/copia-seguranca/index.ts` |

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

### 3p. Prospeção de barbearias
1. SQL Editor → **New query** → cola o conteúdo de `supabase/16-prospecao.sql` → **Run**.
2. Edge Functions → **Deploy a new function** → **Via Editor** → nome `prospecao` → apaga o exemplo, cola o código de `supabase/functions/prospecao/index.ts` → **Deploy**. Na página da função, desliga **Verify JWT** (a função valida a sessão no código e aceita o relógio da base de dados).
3. Usa os mesmos segredos do assistente (`GROQ_API_KEY` ou `ANTHROPIC_API_KEY`) e dos emails (`RESEND_API_KEY`). Opcionais: `PROSPECAO_REMETENTE` (ex.: `Wembley Costa · TwentySix <comercial@avisos.twentysix.pt>`) e `GOOGLE_PLACES_KEY` (pesquisa também no Google Maps; sem ela usa o OpenStreetMap, gratuito).
4. Na app: **Prospeção → Importar** → escolhe o Excel da base de barbearias → **Importar**.
5. **Prospeção → Definições**: escolhe quem aprova (ex.: Marcos, Wembley, Samuel), quem faz a visita com amostras, a assinatura e o email para as respostas; revê a oferta e as questões. Em **Rotas** confirma a data de início do plano de rua.
6. Todas as semanas (por defeito à segunda às 8h) a Central procura barbearias novas, escolhe 25 para abordar e o agente prepara as propostas; quem aprova recebe um aviso. Para começar já: **Definições → Preparar as propostas agora**.

7. **Seguimentos** (opcional, recomendado): SQL Editor → cola `supabase/17-seguimentos.sql` → **Run**. Quando uma barbearia não responde, a Central prepara o «Follow-up 1» (4 dias depois) e o «Follow-up 2» (5 dias depois do primeiro) a partir dos guiões do Excel; ficam por aprovar como as propostas. Param quando alguém marca **A barbearia respondeu** na proposta enviada ou regista um contacto novo no CRM. Os dias mudam-se em **Definições → Seguimentos**.

**Google Maps (opcional).** Sem chave, a pesquisa usa o OpenStreetMap. Com a chave, encontra mais barbearias e quase sempre com telefone e site:
1. https://console.cloud.google.com → cria um projeto (ex.: «Central 26»).
2. **APIs e serviços → Biblioteca** → ativa **Places API (New)**.
3. **Faturação**: associa uma conta de faturação (pede um cartão). A pesquisa da Central usa o escalão «Text Search Enterprise», que tem 1000 pedidos grátis por mês; a Central faz cerca de 10 por semana (3 distritos × até 3 páginas), por isso fica dentro do grátis.
4. **APIs e serviços → Credenciais → Criar credenciais → Chave de API**. Em **Restrições da API**, escolhe só **Places API (New)**. Em restrições de aplicação deixa **Nenhuma** (a chave só é usada no servidor, nunca vai para o site).
5. **APIs e serviços → Places API (New) → Quotas**: limita «SearchTextRequest per day» a 100, e em **Faturação → Orçamentos e alertas** cria um orçamento de 1 € com alerta, para nunca haver surpresas.
6. Supabase → **Edge Functions → Secrets** → `GOOGLE_PLACES_KEY` = a chave. Não é preciso voltar a publicar a função.
7. Na app: **Prospeção → Definições → Procurar barbearias agora**. O balanço mostra quantas vieram do Google e do OpenStreetMap.

O WhatsApp e o Instagram não deixam enviar mensagens automáticas a quem nunca falou connosco sem a API paga do WhatsApp Business (e o Instagram não deixa de todo): a app abre a conversa com a mensagem pronta e quem aprova só carrega em enviar. O email sai da própria app quando o domínio estiver verificado no Resend.

### 3q. Fiabilidade: histórico, reciclagem, comentários, avisos e cópias automáticas
1. SQL Editor → **New query** → cola o conteúdo de `supabase/18-fiabilidade.sql` → **Run**.
2. Edge Functions → **Deploy a new function** → **Via Editor** → nome `copia-seguranca` → apaga o exemplo, cola o código de `supabase/functions/copia-seguranca/index.ts` → **Deploy**. Na página da função, desliga **Verify JWT**.
3. Edge Functions → `enviar-push` → cola outra vez o código de `supabase/functions/enviar-push/index.ts` → **Deploy** (passa a enviar por email os avisos importantes que ficam por ler).
4. Na app (direção): **Mais → Definições → Cópia de segurança → Fazer uma cópia agora**, para confirmar que fica guardada.

O que passa a existir:
- **Sem rede:** a app abre com os últimos dados guardados no aparelho. Tarefas, fichas de clientes, encomendas e contactos feitos sem rede ficam «por enviar» e seguem sozinhos quando a rede volta.
- **Alterações de outras pessoas:** antes de gravar, a app confirma se alguém mudou o mesmo campo entretanto e pergunta com que versão ficar, em vez de apagar a alteração do outro sem aviso.
- **Reciclagem** (Mais → Reciclagem): o que é apagado fica 30 dias e pode ser recuperado, com o que foi apagado junto (ex.: os contactos de um cliente). A direção vê tudo; cada pessoa vê o que apagou.
- **Histórico** em cada ficha: quem mudou o quê e quando.
- **Comentários** em tarefas, clientes, encomendas, eventos, fornecedores, pedidos, publicações, produtos, prazos e viaturas, com @menções (quem é mencionado e o responsável recebem um aviso).
- **Pesquisa** também nas mensagens, nas notas dos clientes e nos comentários.
- **Avisos** (Mais → Definições → Quando recebo avisos): horas de sossego, resumo diário e email quando um aviso importante fica 4 horas por ler.
- **Mensagem → tarefa:** em cada mensagem do chat há um botão para criar uma tarefa com o texto e a ligação à conversa.
- **Cópia automática** todos os domingos às 3h, guardada num armazenamento privado do Supabase (ficam as 12 últimas). Se falhar, a direção recebe um aviso. Continua a ser boa ideia descarregar uma cópia de vez em quando para fora do Supabase.

### 3r. 26 Academy: formandos, formações e estatística regional
1. SQL Editor → **New query** → cola o conteúdo de `supabase/19-academy.sql` → **Run** (pode ser corrido outra vez).
2. Edge Functions → **Secrets** → acrescenta `FORINSIA_UTILIZADOR` e `FORINSIA_PALAVRA_PASSE` com o utilizador e a palavra-passe da Secretaria Online. Quando a palavra-passe mudar na Secretaria Online, muda-a também aqui.
3. Edge Functions → **Deploy a new function** → **Via Editor** → nome `academy-sincronizar` → apaga o exemplo, cola o código de `supabase/functions/academy-sincronizar/index.ts` → **Deploy**. Na página da função, desliga **Verify JWT**.
4. Edge Functions → `copia-seguranca` → cola outra vez o código de `supabase/functions/copia-seguranca/index.ts` → **Deploy** (a cópia automática passa a incluir a Academy).
5. Na app: **26 Academy → Secretaria Online → Ler tudo outra vez**. A primeira leitura demora alguns minutos (a app vai pedindo o resto sozinha). Em alternativa, importa o ficheiro `.json` na mesma página.

Depois disto, a Central lê a Secretaria Online sozinha às 7h e às 19h (hora de inverno; 8h e 20h no verão): ações novas, as que estão a decorrer ou em avaliação e as que mudaram de estado, com os formandos de cada uma. Só lê, nunca altera nada lá. Se a leitura falhar (por exemplo, por a palavra-passe ter mudado), a direção recebe um aviso.

Quem vê: a direção e o Administrativo e Operacional. Os dados dos formandos nunca vão para o GitHub: entram só pela importação na app.

O que passa a existir:
- **Formações e formandos**, com as inscrições de cada formando em cada formação (e quem desistiu). Também se registam à mão.
- **De onde vêm os formandos:** a região de cada formando sai do concelho de residência (com o distrito ou o código postal como último recurso). Percentagem e número de formandos do Norte, do Centro, do Sul, dos Açores, da Madeira e do estrangeiro, as regiões oficiais (NUTS II de 2024), um mapa por concelho e os concelhos com mais formandos.
- **Comparação entre formações** e a estatística de cada formação no painel dela.
- **Atualização automática:** quando alguém importa ou acrescenta formandos ou formações, os números mudam logo no ecrã de toda a gente.
- **Evolução no tempo:** inscrições por semestre, por zona, e o peso de quem vem de fora do Norte em cada ano.
- **Distância até à formação** (do concelho onde o formando vive ao concelho da formação) e os concelhos perto com poucos formandos, para o Marketing.
- **Idade** no início de cada formação (a data de nascimento não é guardada), **desistências** por zona e por distância, e **assiduidade** de cada ação (do relatório de assiduidade da Secretaria Online). Aparecem depois de «Ler tudo outra vez».
- **No Comercial:** a Central sugere que ex-formandos já estão no Comercial (pelo nome da barbearia, email ou Instagram). Depois de confirmados, aparecem na ficha do cliente.
- **Definições** (direção): em que zona (Norte, Centro ou Sul) conta cada região. Por defeito, o Oeste e Vale do Tejo conta no Centro, e a Grande Lisboa, a Península de Setúbal, o Alentejo e o Algarve contam no Sul.

### 3s. Margens, encomendas ao laboratório e relatório mensal
1. SQL Editor → **New query** → cola o conteúdo de `supabase/20-margens-encomendas-relatorio.sql` → **Run**.
2. Edge Functions → **Deploy a new function** → **Via Editor** → nome `relatorio-mensal` → cola o código de `supabase/functions/relatorio-mensal/index.ts` → **Deploy**. Na página da função, desliga **Verify JWT**. Usa o mesmo segredo `RESEND_API_KEY` dos avisos por email.
3. Edge Functions → `copia-seguranca` → cola outra vez o código atual → **Deploy** (a cópia passa a incluir os custos).
4. Na app (direção): **Comercial → Análise → Margens**: escreve o custo de cada produto (sem IVA, por unidade). Em **Stocks**, abre cada produto e liga-o ao produto do Multixop e ao prazo de fabrico.

O que passa a existir:
- **Margens** no Comercial: margem por produto, margem total e os clientes com mais e menos margem. O custo só a direção o muda.
- **Encomendar ao laboratório** nos Stocks e no Início: quantos dias de stock faltam, pela venda dos últimos 90 dias, e quanto encomendar para cobrir o fabrico e mais 60 dias (muda-se em Stocks → Avisos).
- **Relatório mensal** (Mais → Relatório mensal, só a direção): vendas e margem, clientes novos e parados, barbearias, stock, Academy, prazos e tarefas. No dia 1 de cada mês chega por email à direção, com o mês anterior.

### 3t. Resultados por área e por barbeiro (Financeiro)
1. SQL Editor → **New query** → cola o conteúdo de `supabase/21-resultados.sql` → **Run**.
2. Edge Functions → `copia-seguranca` → cola outra vez o código atual → **Deploy** (a cópia passa a incluir os barbeiros, o pessoal e as regras).
3. Na app (direção): **Financeiro → Importar** → escolhe outra vez todas as folhas mensais da Ondina & Maia. A app passa a ler o quadro dos barbeiros e os responsáveis de loja (folha Faturação) e o pessoal com a divisão pelas áreas (folha RH).
4. **Financeiro → Despesas**: na coluna **Vai para**, escolhe para onde vai cada despesa partilhada (por exemplo, as compras ao laboratório para os Produtos; empréstimos e IVA como «Não é custo»).
5. **Financeiro → Resultados**: escreve, mês a mês, a receita da Academia e os produtos gastos nas barbearias (a preço de custo), e escolhe como se dividem os custos gerais.

O que passa a existir:
- **Resultados**: rendimentos, gastos e resultado das Barbearias, Produtos, Academia e 26 Tech, e das barbearias loja a loja, por mês ou no ano, com o IRC no total. Botão **Exportar Excel** para o contabilista.
- **Barbeiros**: serviços (cabelos, barbas e combos), faturado, comissão, extras, total pago e quanto fica para a empresa, por barbeiro e por loja, e a evolução mês a mês.
- Só a direção vê. As faturas das comissões da folha RH não são guardadas, só o total de cada pessoa.

### 3u. Preço das formações e receita da Academia
1. SQL Editor → **New query** → cola o conteúdo de `supabase/22-precos-formacao.sql` → **Run**.
2. Edge Functions → `copia-seguranca` → cola outra vez o código atual → **Deploy** (a cópia passa a incluir os preços).
3. Na app (direção): **Academy → Formações** → abre cada formação e escreve o **preço por formando**. O botão «Usar … nas outras formações do curso» põe o mesmo preço nas formações do mesmo curso que ainda não têm.

O que passa a existir:
- Na Academy (só a direção vê): receita de cada formação (preço × formandos que não desistiram) e o valor de cada formando.
- No **Financeiro → Resultados**, a receita da Academia passa a vir destes preços, dividida em partes iguais pelos meses de cada formação. Um valor escrito à mão nos Resultados continua a ter prioridade.

### 3v. Caixa, simulador, previsão de tesouraria e desempenho dos barbeiros
1. SQL Editor → **New query** → cola o conteúdo de `supabase/23-caixa-simulador-previsao.sql` → **Run**.
2. Edge Functions → `copia-seguranca` → cola outra vez o código atual → **Deploy** (a cópia passa a incluir as faltas de caixa).
3. Na app (direção): **Financeiro → Importar** → volta a importar as folhas mensais (para entrarem as faltas de caixa e os preços).

O que passa a existir no Financeiro:
- **Caixa**: faltas e sobras escritas na folha Faturação, por loja e por mês, com aviso quando uma loja passa o limite escolhido.
- **Simulador**: muda preços (corte, barba, combo), o desconto por serviço, as comissões e os serviços perdidos, e vê o efeito por mês e por ano, por loja e por barbeiro, e quantos serviços se podem perder sem a empresa ganhar menos.
- **Previsão**: saldo previsto no fim deste mês e dos 3 seguintes, pela média dos últimos meses e pelos prazos com valor (seguros, inspeções…), com aviso abaixo do mínimo.
- **Barbeiros**: desempenho do mês (valor por serviço, cabelo/barba/combo, comparação com os meses anteriores, avisos de quedas) e resumos para cada barbeiro (copiar para WhatsApp ou imprimir/guardar em PDF).

### 3w. Proformas da TwentySix e envios pela Nacex
1. SQL Editor → **New query** → cola o conteúdo de `supabase/24-proformas-nacex.sql` → **Run** (depois do 20).
2. Edge Functions → `copia-seguranca` → cola outra vez o código atual → **Deploy** (a cópia passa a incluir as proformas e a tabela de preços).
3. Na app (direção): **Comercial → Proformas → Definições** → escolhe **quem fatura** e preenche os dados da empresa. Depois, em **Tabela de preços**, cola a tabela (ou escreve os preços à mão).

Como funciona:
- Na ficha do cliente escolhes o **escalão** (Base, PRO, distribuidor PVD30/40/50) e se é **embaixador**. O botão **Proforma** abre a lista dos produtos com o preço do escalão e a margem do cliente; escreves as quantidades.
- A proforma mostra quanto falta para o próximo patamar e quanto o cliente pouparia. **Imprimir** abre a proforma para imprimir ou guardar em PDF.
- **Cliente aceitou** cria uma tarefa para quem fatura, com os artigos e o total. Quem fatura cria a fatura no Multixop e escreve o número na proforma: a encomenda passa sozinha para a Logística, com os artigos ligados ao stock (o stock desce quando fica **Pronta**).
- **Envio pela Nacex**: a encomenda mostra os dados para copiar para o portal (serviço 27). Quando se escreve o tracking, quem fatura recebe o aviso para imprimir a etiqueta.
- As credenciais do portal da Nacex **não** entram na Central.

### 3x. Lojas e parcerias (embaixador / influencer)
1. SQL Editor → **New query** → cola o conteúdo de `supabase/25-lojas-parcerias.sql` → **Run** (depois do 24).
2. Edge Functions → `copia-seguranca` → cola outra vez o código atual → **Deploy**.
3. Cria em **Equipa** a conta de cada responsável de loja. Depois, em **Lojas → Definições**, escolhe o responsável de cada loja e quem recebe os pedidos.
4. Em **Comercial → Proformas → Definições**, escreve o desconto de embaixador (o de influencer vem a 5%).

O que passa a existir:
- **Lojas → Stock**: o responsável conta os consumíveis e produtos da sua loja e define o mínimo; o que fica abaixo do mínimo aparece a vermelho.
- **Pedidos**: pedido da semana (já vem com o que falta), trocos (moedas de 2 €, 1 € e 0,50 €) e manutenção. Quem trata recebe o aviso; quando o pedido da semana fica **Feito**, os artigos entram no stock da loja.
- **Aluguer de cadeiras** (direção): valor fixo + percentagem da faturação bruta de cada barbeiro, com o número da fatura do Multixop.
- **Parcerias**: cada cliente pode ser embaixador ou influencer (um ou outro). O desconto não acumula com os escalões: só conta no preço Base.

### 3y. Estatísticas das barbearias (marcações do Booknetic)
1. SQL Editor → **New query** → cola o conteúdo de `supabase/26-estatisticas-barbearias.sql` → **Run**.
2. Edge Functions → `copia-seguranca` → cola outra vez o código atual → **Deploy**.
3. No WordPress da barbearia: **Booknetic → Settings → Export & Import data** → exportar. Na app (direção, num computador): **Lojas → Marcações** → **Escolher ficheiro** → o ficheiro `.Booknetic`.

O ficheiro é lido no computador de quem importa e só os números ficam na Central (por mês, loja, barbeiro e serviço): marcações, canceladas, clientes diferentes, clientes novos, clientes ativos, habituais e os que deixaram de vir, e os dias e horas com mais movimento. Nomes, contactos e notas de clientes nunca saem do computador. Para atualizar, exporta outra vez e importa o ficheiro novo.

### 3z. Contas com acesso limitado e propostas de tarefas do assistente
1. SQL Editor → **New query** → cola o conteúdo de `supabase/27-acessos-propostas.sql` → **Run**.
2. Edge Functions → `assistente` → cola outra vez o código atual → **Deploy**.
3. Na app (direção): **Equipa** → a pessoa → **Gerir conta**:
   - **Responsável direto**: quem responde por esta pessoa. Vê as tarefas dela, pode dar-lhe tarefas e aprova o que o assistente propuser.
   - **Acesso limitado**: a pessoa só vê as suas tarefas, as mensagens e o módulo do seu departamento. Tudo o que tiver valores em euros (€, EUR, euros) nas tarefas, publicações e documentos fica escondido para ela, na base de dados e não só no ecrã, e não consegue escrever valores em euros.
4. O responsável direto abre **Propostas de tarefas** → **Pedir propostas**. O assistente analisa as tarefas pendentes e as publicações sem responsável e propõe tarefas. Nada chega à pessoa até o responsável carregar em **Aprovar e atribuir** em cada proposta (ou **Aprovar todas**).

### 3z-b. Proteção de ecrã nas contas dos barbeiros
Automática para as contas do departamento Barbearias (nunca para a direção). Nenhuma aplicação web consegue impedir a 100% uma captura de ecrã, por isso a Central:
1. mostra uma marca de água com o nome da pessoa e a hora em todo o ecrã, para qualquer captura ficar identificada;
2. tapa o ecrã quando a app sai de primeiro plano (mudar de aplicação, outra janela, tecla Print Screen); para voltar carrega-se em **Continuar**;
3. esconde os valores até a pessoa tocar neles, e voltam a esconder-se ao fim de 6 segundos;
4. não deixa copiar, abrir o menu de contexto, arrastar nem imprimir.

### 3z-c. Envios pela Nacex (webservice)
1. SQL Editor → **New query** → cola o conteúdo de `supabase/28-nacex-webservice.sql` → **Run**.
2. Edge Functions → **Deploy a new function** → nome `nacex` → cola `supabase/functions/nacex/index.ts` → **Deploy**.
3. Edge Functions → **Secrets** → acrescenta (os valores vêm da Nacex e nunca vão para o GitHub):
   - `NACEX_UTILIZADOR`: o utilizador do webservice (começa pelo de testes);
   - `NACEX_CHAVE`: a palavra-passe em MD5, tal como a Nacex a envia;
   - `NACEX_DELEGACAO`: a agência do cliente;
   - `NACEX_CLIENTE`: o código de cliente (n.º de abonado).
4. Na app: encomenda com transporte **Nacex** → **Criar envio Nacex** (volumes e peso). A Central devolve a etiqueta em PDF e guarda a carta de porte como tracking. **Etiqueta (PDF)** volta a imprimi-la; **Atualizar estado** pergunta à Nacex (também é feito sozinho quando a Logística abre as encomendas, de 30 em 30 minutos): em trânsito passa a «em rota», entregue passa a «entregue».
5. A Nacex começa em modo de testes (envios fictícios, carta de porte com 9s). Quando os testes estiverem bem, pede a ativação do modo real a atencion.informatica@nacex.es; a Central mostra os envios de teste com um aviso.

### 3z-d. Método Mackay 66 e clientes a abordar
1. SQL Editor → **New query** → cola o conteúdo de `supabase/29-mackay-abordagens.sql` → **Run**.
2. Edge Functions → **Deploy a new function** → nome `crm-abordar` → cola `supabase/functions/crm-abordar/index.ts` → **Deploy**. Usa a mesma chave do assistente; a pesquisa na web só funciona com o Claude (ANTHROPIC_API_KEY) e tem de estar ativa na consola da Anthropic.
3. Na app: **Comercial → Abordar hoje**. Todos os dias (o primeiro a abrir o Comercial gera a lista) o assistente escolhe até 5 clientes: seguimentos marcados, clientes que já deviam ter encomendado, clientes em risco e leads prometedores. Quem já foi sugerido nos últimos 14 dias ou contactado nesta semana fica de fora. **Preparar abordagem** pesquisa a barbearia e devolve o que sabemos, como abordar, a primeira mensagem (copiar ou abrir no WhatsApp) e o que descobrir na conversa.
4. Na ficha de cada cliente: **Perfil Mackay 66**, com as 66 perguntas adaptadas a barbearias. O assistente só pesquisa informação pública da loja e deixa sugestões com a fonte, que só ficam guardadas depois de alguém as aceitar. Não se guardam dados sensíveis (saúde, religião, política, vida familiar).

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
js/academy.js · js/academy-regioes.js      26 Academy: formandos, formações e estatística por região (concelhos e NUTS II)
supabase/functions/academy-sincronizar/     leitura automática da Secretaria Online da 26 Academy (só leitura)
js/relatorio.js · supabase/functions/relatorio-mensal/  relatório mensal da direção (na app e por email no dia 1)
js/vida.js                                  ilustrações de cada área, números que contam e gráficos que crescem ao abrir uma página
js/resultados.js                            Financeiro: resultados por área, loja e barbeiro, divisão dos custos gerais e exportação para Excel
js/estatisticas-bar.js · js/booknetic.js    estatísticas das barbearias a partir da exportação do Booknetic (lida no navegador, só números)
js/lojas.js                                 lojas: stock de consumíveis, pedidos da semana, trocos, manutenção e aluguer de cadeiras
js/proformas.js                             Comercial: proformas, escalões de preço, tarefa para faturar e passagem à Logística
js/ferramentas.js                           Financeiro: caixa, simulador de preços e comissões, previsão de tesouraria, desempenho e resumos dos barbeiros
js/prospecao.js                             prospeção: propostas do agente, aprovação e envio, barbearias, rotas, balanços
js/prospecao-importar.js                    leitura do Excel da base de prospeção
supabase/functions/prospecao/index.ts       agente de prospeção (pesquisa semanal, propostas com IA, envio de emails)
js/pesquisa.js                              pesquisa global (Ctrl/⌘ + K), também no servidor
js/offline.js                               sem rede: dados guardados no aparelho, alterações por enviar, conflitos
js/fiabilidade.js                           comentários e histórico nas fichas, reciclagem, avisos e cópias automáticas
supabase/functions/copia-seguranca/index.ts cópia de segurança automática semanal
js/assistente.js                            assistente de IA (conversas, sugestões por departamento, utilização)
js/dados.js · js/modelos.js                 marcas, períodos, regras e modelos
supabase/schema.sql                         tabelas, permissões e automatismos
supabase/functions/                         funções de servidor
```

A chave em `js/config.js` é a chave **publishable**, pública por natureza. **Nunca** coloques neste repositório a chave secret / service_role nem a palavra-passe da base de dados.
