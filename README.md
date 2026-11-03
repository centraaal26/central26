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
  - Importação do SAF-T do Multixop. Só a administração, o CEO e o departamento Comercial veem o CRM.
- **Mensagens:** canal Geral, um canal por departamento (o departamento e a direção) e conversas diretas.
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
  - Rotas: escolhes as encomendas e os locais (barbearias, armazém, outras moradas) e a app põe as paragens pela ordem mais curta, com mapa, quilómetros e tempo. Abre a navegação no Google Maps (todas as paragens) ou no Waze (uma a uma). Ao marcar uma paragem como feita, a encomenda passa a «Entregue».
  - Locais fixos: sede, 26 Tech, Avenida da República e as barbearias. Falta preencher a morada das barbearias em Logística → Locais.
- **Modelos sugeridos:** rotinas de cada marca, rotinas da Logística e os problemas encontrados nas auditorias aos sites.
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
Só é preciso para os avisos chegarem ao telemóvel; dentro da app funcionam sem isto. Instala esta função:

1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Dá-lhe o nome exato da tabela abaixo, cola o código do ficheiro indicado e carrega em **Deploy**.
3. Na página da função, desliga **Verify JWT** (ou «Enforce JWT verification»). A função valida a sessão no próprio código.

| Nome (tem de ser exatamente este) | Ficheiro |
|---|---|
| `enviar-push` | `supabase/functions/enviar-push/index.ts` |

O editor do Supabase sugere um nome automático (por exemplo «hyper-function»). Apaga-o e escreve `enviar-push` antes de carregar em **Deploy**.

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
js/dados.js · js/modelos.js                 marcas, períodos, regras e modelos
supabase/schema.sql                         tabelas, permissões e automatismos
supabase/functions/                         funções de servidor
```

A chave em `js/config.js` é a chave **publishable**, pública por natureza. **Nunca** coloques neste repositório a chave secret / service_role nem a palavra-passe da base de dados.

## Próximas fases
4. Mapa de clientes por concelho e freguesia (precisa das moradas preenchidas no CRM).
5. Marketing, Operacional (fornecedores) e Tecnológico.
