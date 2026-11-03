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
js/dados.js · js/modelos.js                 marcas, períodos, regras e modelos
supabase/schema.sql                         tabelas, permissões e automatismos
supabase/functions/                         funções de servidor
```

A chave em `js/config.js` é a chave **publishable**, pública por natureza. **Nunca** coloques neste repositório a chave secret / service_role nem a palavra-passe da base de dados.

## Próximas fases
2. Chat interno e agenda do CEO (só o CEO e o Samuel acrescentam eventos).
3. Logística: encomendas com fatura e rotas otimizadas.
4. CRM comercial: barbearias, clientes, funil e mapa.
5. Marketing, Operacional (fornecedores) e Tecnológico.
