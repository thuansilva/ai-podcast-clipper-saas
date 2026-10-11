# Jornada do Usuário

Este documento mapeia a experiência do usuário no AI Podcast Clipper, desde o primeiro contato até o uso recorrente. Reflete as rotas e componentes reais do código (`src/app/**`, `src/components/**`).

## Visão Geral da Jornada

A jornada de um usuário percorre três fases principais: **Descoberta & Onboarding**, **Criação de Conteúdo** e **Gestão & Billing**. Cada fase tem pontos críticos de satisfação, erros esperados e caminhos alternativos.

### Diagrama de Satisfação (User Journey)

```mermaid
journey
    title Jornada do Usuário: AI Podcast Clipper
    section Descoberta & Onboarding
      Landing Page: 4: user
      Página de Preços: 4: user
      Páginas Legais (Termos/Privacidade): 3: user
      Cadastro com Aceite: 3: user
      Primeiro Acesso ao Dashboard: 4: user
    section Criação de Conteúdo
      Criar Novo Projeto (YouTube): 5: user
      Configurar Opções de Vídeo: 4: user
      Enviar para Processamento: 4: user
      Aguardar Processamento: 2: user
      Revisar Clipes Gerados: 5: user
      Baixar / Compartilhar Clipes: 5: user
    section Gestão & Billing
      Gerenciar Projetos Anteriores: 4: user
      Visualizar Saldo de Créditos: 4: user
      Assinar Plano Recorrente: 4: user
      Usar Recorrentemente: 4: user
```

### Significado dos Scores

- **5**: Momento de alegria (clipes prontos, download bem-sucedido)
- **4**: Fluxo intuitivo (cadastro, criação de projeto, billing)
- **3**: Necessário mas com fricção (ler termos legais, esperar confirmação de email)
- **2**: Ponto de dor (esperar processamento, fila/loading state)

---

## Fluxo Detalhado de Navegação

```mermaid
flowchart TD
    Start([Usuário Novo])
    
    Start -->|Visita aioson.com| Landing["/: Landing Page"]
    Landing --> Header["Header: Logo, Links de Navegação"]
    Header -->|Clica Preços| Pricing["/pricing: Página de Preços"]
    Pricing -->|Clica Assinar| CheckAuth{Autenticado?}
    
    CheckAuth -->|Não| SignUp["/signup: Cadastro Clerk"]
    SignUp --> SignUpForm["Custom Sign-Up Form<br/>Email + Senha + Checkbox Termos/Privacidade"]
    SignUpForm -->|Clica Aceitar & Criar Conta| UserCreated["Usuário criado<br/>Clerk webhook sincroniza com DB"]
    
    Landing -->|Clica Footer: Termos| Terms["/terms: Termos de Serviço"]
    Landing -->|Clica Footer: Privacidade| Privacy["/privacy: Política de Privacidade"]
    Landing -->|Clica Footer: Reembolso| Refund["/refund: Política de Reembolso"]
    Landing -->|Clica Footer: Contato| Contact["/contact: Fale Conosco"]
    
    Terms --> CheckLegalContent{"Conteúdo<br/>completo?"}
    Privacy --> CheckLegalContent
    Refund --> CheckLegalContent
    Contact --> CheckLegalContent
    CheckLegalContent -->|Não| LegalTodo["Placeholder: [A PREENCHER]<br/>em alguns conteúdos"]
    LegalTodo --> BackToLanding["Volta ao navegador<br/>ou Footer"]
    
    CheckAuth -->|Sim| Dashboard["/dashboard: Dashboard Principal"]
    UserCreated --> Dashboard
    
    Landing -->|Usuário logado<br/>clica CTA| Dashboard
    
    Dashboard --> DashboardState{Estado do<br/>Dashboard?}
    
    DashboardState -->|Vazio, 1º acesso| FirstAccess["Estado Vazio<br/>Mensagem: Crie seu primeiro projeto"]
    FirstAccess --> CreateProjectBtn["Botão: Criar Novo Projeto"]
    
    DashboardState -->|Com projetos| RecentList["Lista: Vídeos Acessados Recentemente<br/>RecentVideosClient (ou InfiniteProjectsList em /dashboard/projects)"]
    RecentList --> ProjectAction["Clicar em Projeto Existente<br/>ou Criar Novo"]
    
    CreateProjectBtn --> NewProject["/dashboard/new: Criar Projeto"]
    ProjectAction -->|Clica em Projeto| ProjectDetails["/dashboard/projects/[id]:<br/>Detalhes do Projeto"]
    ProjectAction -->|Clica Criar Novo| NewProject
    
    NewProject --> YouTubeSection["Input: Colar URL do YouTube"]
    YouTubeSection --> FetchMeta["API: /api/youtube/info<br/>Busca metadata: título, duração"]
    FetchMeta --> MetadataLoaded["Thumbnail + Duração exibidos"]
    
    MetadataLoaded --> SliceConfig["Slice Configuration:<br/>Slider range (início/fim) em segundos, rótulos mm:ss ou h:mm:ss"]
    SliceConfig --> Options["Opções Dinâmicas:<br/>- GENRE (dropdown)<br/>- CLIP_MODEL (dropdown)<br/>- ASPECT_RATIO (dropdown)<br/>- AUTO_ZOOM (toggle)"]
    Options --> CreditEstimate["Estimativa de Créditos a Debitar"]
    
    CreditEstimate --> CheckCredits{Créditos<br/>suficientes?}
    
    CheckCredits -->|Não| InsufficientCredit["Toast Error:<br/>Créditos insuficientes"]
    InsufficientCredit --> BillingRedirect["Botão: Ir para Billing"]
    BillingRedirect --> Billing["/dashboard/billing: Planos & Créditos"]
    
    CheckCredits -->|Sim| SubmitBtn["Botão: Começar Processamento"]
    SubmitBtn --> ImportYT["Action: importYouTubeVideo()<br/>Cria UploadedFile<br/>Enfileira job Inngest"]
    ImportYT --> Processing["Status: Processing<br/>Toast: 'Vídeo enfileirado'"]
    
    Processing --> PollStatus["Client: Refetch via router.refresh()<br/>RecentVideosClient (Server Component)"]
    PollStatus --> Loading["Estado: QUEUED → PROCESSING → PROCESSED"]
    Loading --> ProcessingWait["Estado Spinner:<br/>Aguardando backend"]
    
    ProcessingWait --> ClipsReady{Processamento<br/>concluído?}
    
    ClipsReady -->|Erro no Backend| ProcessingError["Status: ERROR<br/>Toast: Exibe erro da API"]
    ProcessingError --> ErrorRecovery["Retry Button<br/>ou Criar novo projeto"]
    
    ClipsReady -->|Sucesso| ProjectDetails
    
    ProjectDetails --> ClipsList["Lista de Clips Gerados:<br/>Thumbnail, Viralidade, Título"]
    ClipsList --> ClipCard["Clip Card:<br/>- Título<br/>- Hook/Descrição<br/>- Virality Score<br/>- Botão Download<br/>- Botão Ver Detalhes"]
    
    ClipCard -->|Clica Download| Download["Download do arquivo MP4<br/>Sem marca d'água"]
    ClipCard -->|Clica Ver Detalhes| ClipModal["Clip Details Modal:<br/>- Metadata completa<br/>- Transcript<br/>- Botão Editar Legenda"]
    ClipCard -->|Clica Editar Legenda| EditModal["Clip Editor Modal:<br/>- Selector de preset<br/>- Salva alterações via updateClip"]
    ClipCard -->|Clica Agendar Publicação| ScheduleBtn["Botão: Agendar Publicação<br/>[Não funcional/Placeholder visual]"]
    ClipCard -->|Clica Excluir| DeleteModal["Confirmação:<br/>Excluir clipe permanentemente"]
    
    ProjectDetails -->|Voltar Dashboard| Dashboard
    ProjectDetails -->|Editar Projeto| EditProject["/dashboard/projects/[id]/edit:<br/>Ajustar configurações"]
    EditProject --> UpdateProject["Re-processar com<br/>novas opções"]
    UpdateProject --> Processing
    
    Dashboard -->|Clica Billing| Billing
    
    Billing --> ActiveSubCheck{Tem<br/>assinatura<br/>ativa?}
    
    ActiveSubCheck -->|Sim| ActiveCard["Active Subscription Card:<br/>- Plano (Starter/Pro)<br/>- Data de renovação<br/>- Créditos restantes"]
    ActiveCard --> ManageAction["Botão: Gerenciar Assinatura<br/>→ Portal Stripe"]
    
    ActiveSubCheck -->|Não| CreditStatus["Status de Créditos:<br/>- Total disponível<br/>- Créditos de assinatura<br/>(subscriptionCredits)"]
    CreditStatus --> PlansDisplay["Mostrar Planos:<br/>- Monthly vs Annual toggle<br/>- Starter: $15 ou $9.50/mês<br/>- Pro: $29 ou $19/mês"]
    
    PlansDisplay --> SelectPlan["Clicar em Plano"]
    SelectPlan --> Checkout["Action: createCheckoutSession(priceId)<br/>→ Stripe Checkout"]
    Checkout --> StripePayment["Usuário completa<br/>pagamento no Stripe"]
    StripePayment --> WebhookStripe["Webhook Stripe<br/>→ /api/webhooks/stripe"]
    WebhookStripe --> UpdateSub["Cria/Atualiza Subscription<br/>Adiciona subscriptionCredits"]
    UpdateSub --> ActivateSub["Status: active<br/>Créditos renovados"]
    ActivateSub --> BackToDash["Volta ao Dashboard"]
    
    ManageAction --> StripePortal["Portal Stripe:<br/>Atualizar cartão<br/>Cancelar assinatura<br/>Ver faturas"]
    StripePortal --> BackToDash
    
    BackToDash --> Recurrence["Usuário cria mais projetos<br/>com créditos renovados<br/>mensalmente/anualmente"]
    
    Recurrence --> BillingFailure{Pagamento<br/>falha?}
    
    BillingFailure -->|Sim| PaymentFailed["Subscription Status: past_due<br/>(Ver: visao-fluxo-pagamento.md)"]
    PaymentFailed --> Grace["Carência: 3 dias<br/>Créditos bloqueados"]
    Grace --> UserNotified["Email: Pagamento falhou<br/>Ação: Atualizar cartão no Portal"]
    
    BillingFailure -->|Não, renovado| Recurrence
```

---

## Fases Detalhadas

### 1. Descoberta & Onboarding

**Rotas**: `/` → `/pricing` → `/terms`, `/privacy`, `/refund`, `/contact` → `/signup`

| Componente | Responsabilidade | Rota |
|---|---|---|
| `Header` | Nav principal, logo, links de autenticação | `/` |
| `HeroSection` | Call-to-action principal, proposta de valor | `/` |
| `ProductPreview` | Demo visual / animação do produto | `/` |
| `ShowcaseCarousel` | Exemplos de clipes gerados | `/` |
| `ComparisonSection` | Comparação vs. edição manual | `/` |
| `Footer` | Links legais, redes sociais | todos |
| `PricingToggleTabs` | Monthly / Annual toggle | `/pricing` |
| `Custom Sign-Up Form` | Email, senha, checkbox Termos/Privacidade obrigatório | `/signup` |

**Fluxo de Erro**: 
- Se checkbox não marcado → aviso de validação
- Se email já existe → erro do Clerk
- Webhook Clerk sincroniza novo usuário com `db.user`

---

### 2. Criação de Conteúdo

**Rotas**: `/dashboard` → `/dashboard/new` → `/dashboard/projects/[id]` → `/dashboard/projects` (lista)

**Fluxo adicional de login social:**
- `/sso-callback`: Rota do Clerk (`AuthenticateWithRedirectCallback`) para completar login com Google/social

#### 2.1 Primeiro Acesso (Empty State)
- **Componente**: `RecentVideosClient` mostrando estado vazio
- **Estado**: Nenhum projeto anterior
- **Mensagem**: "Nenhum projeto recente."
- **CTA**: Botão "Criar Novo Projeto" disponível no layout

#### 2.2 Criar Novo Projeto

**Rota**: `/dashboard/new`
**Componentes**:
- `CreateProjectClient` (modo config, `isConfigRoute=true`)
- Input URL YouTube com debounce
- API: `/api/youtube/info` → fetch de metadata (título, duração, thumbnail).
  Exige sessão autenticada (`401 Unauthorized` sem Clerk session) e aplica
  rate limit de 20 req/min por usuário (`429 Too many requests`) — ver
  RF-SEC-02. Nos dois casos, `CreateProjectClient.handleFetchMeta` exibe um
  toast com a mensagem de erro retornada pela API.

**Opções Dinâmicas**:
```
GENRE
  └─ DOCUMENTARY, COMEDY, EDUCATIONAL, MOTIVATIONAL, etc.
CLIP_MODEL
  └─ VIRALITY (padrão), CONSISTENCY, BALANCED
ASPECT_RATIO
  └─ 9:16 (default), 16:9, 1:1
AUTO_ZOOM
  └─ toggle (default: true)
```

(Busca de opções: `getProcessingOptions()` → `ProcessingOption` tabela)

#### 2.2.1 Modo dos cortes: Automático ou Manual (RF-PIPE-08)
No topo do card "Configurações do Corte" (`CreateProjectClient`) há um radio group
"Como os cortes serão definidos":
- **Automático (padrão)**: "a IA escolhe os melhores momentos". Mostra o
  Fatiador Inteligente (seção 2.3) e envia `mode: "auto"` com
  `sliceStartTime`/`sliceEndTime`. Comportamento inalterado.
- **Manual**: "eu defino os cortes". O Fatiador é **escondido** (ele serve para a
  IA escolher dentro de um trecho; no manual o usuário já escolheu os cortes) e
  aparece o editor de cortes:
  - Uma linha vazia ao entrar; cada linha tem um **slider de dois pontos** (início e
    fim, de 0 até a duração real, passo de 1s; setas movem 1s) **sincronizado** com os
    campos de texto: mover o slider preenche os dois campos; digitar um par válido
    move o slider; texto inválido/incompleto não move o slider e mostra o erro como
    antes. O limite de 60s vale ao arrastar: o ponto que não foi movido acompanha
    (janela arrastável). O slider de uma linha nova sugere 0:00-0:30 (ou 30s logo
    depois do fim do último corte válido, sem passar do fim do vídeo), mas os campos
    ficam vazios até o usuário interagir. Pontos nomeados "Início do corte N
    (deslizante)"/"Fim do corte N (deslizante)" com `aria-valuetext` em tempo. Cada
    linha tem ainda Início, Fim (`mm:ss` ou `h:mm:ss`,
    convertidos por `src/lib/time-format.ts`) e Título opcional (até 200 caracteres),
    mais botão "Remover corte N" (na última linha restante ele só limpa os campos).
  - Validação por linha (`src/lib/manual-cut-rows.ts`, reaproveitando
    `MAX_MANUAL_CUTS` = 50 e `MAX_MANUAL_CUT_DURATION_SECONDS` = 60 de
    `manual-cut.schema.ts`): formato inválido, fim <= início, corte > 60s, início
    ou fim além da duração do vídeo (`metadata.durationSeconds`; o backend só
    rejeitaria isso com 422 depois do download). Mensagens com `role="alert"`
    ligadas ao campo por `aria-invalid` + `aria-describedby`. Campo vazio não
    mostra erro, mas bloqueia o envio.
  - Sobreposição entre cortes vira **aviso não bloqueante** (`role="status"`).
  - "Adicionar corte" desabilita em 50 cortes, com texto explicando o limite.
  - Custo mostrado com `calculateManualCutsCredits` sobre os cortes válidos (mesmo
    cálculo que o Inngest usa na reserva); `cost > userCredits` usa o custo do modo
    ativo. O botão "Confirmar e Processar" fica desabilitado sem cortes, com corte
    inválido/incompleto ou sem créditos.
  - Envio: `importYouTubeVideo({ mode: "manual", manualCuts })` com tempos absolutos
    em segundos e **sem** `sliceStartTime`/`sliceEndTime`.
- **Limitações conhecidas**: (1) o seletor **não aparece em modo edição/retry**
  (`editMode`, `retryProjectAction`); o fluxo de retry segue como antes. (2) O vídeo
  inteiro ainda é baixado do YouTube e guardado no storage, mesmo que só alguns
  segundos sejam cortados; baixar só os trechos é uma etapa futura. Desde
  2026-10-11 (RN-PIPE-MANUAL-16/17, `src/domain/services/processing-duration.service.ts`),
  o limite do plano no modo manual é aplicado à **soma dos cortes**, não ao vídeo
  inteiro, e um corte além do fim do vídeo falha antes da reserva de créditos.

#### 2.3 Configuração do Slice (modo Automático)
- **Slider Range**: min = 0, max = duração real do vídeo, **em segundos** (passo de
  1s; antes era em minutos inteiros e os últimos segundos de um vídeo como 10:50 eram
  inalcançáveis). Rótulos de início/fim e "Duração total" em `mm:ss`/`h:mm:ss`.
- **Trecho mínimo**: 1s. `sliceStartTime`/`sliceEndTime` são enviados em segundos
  exatos (também no retry em modo edição, que lê o trecho salvo já em segundos).
- **Custo**: `calculateVideoCredits(fim - início)` (1 crédito por minuto ou fração,
  mínimo 1), igual à reserva do Inngest.
- **Padrão**: primeiros 5 minutos ou duração do vídeo, se menor

#### 2.4 Estimativa de Créditos
- Backend calcula (baseado no `clipModel`, duração do slice)
- **Se insuficientes**:
  - Toast: "Créditos insuficientes"
  - Botão: "Ir para Billing" → `/dashboard/billing`

#### 2.5 Submissão
- **Action**: `importYouTubeVideo()`
- **Cria**: `UploadedFile` com `status = 'queued'`
- **Enfileira**: Job Inngest
- **Toast**: "Vídeo enfileirado"
- **Redirecionamento**: usuário vê lista de projetos/estado vazio com polling

#### 2.6 Aguardando Processamento
- **Componente**: `RecentVideosClient`
- **Polling**: `setInterval` chama `router.refresh()` (refetch do Server Component, `recent-videos-client.tsx:64-75`) — não é uma rota de API dedicada
- **Estados**:
  - `QUEUED`: em fila do Inngest
  - `PROCESSING`: GPU/backend processando
  - `PROCESSED`: clips prontos
  - `ERROR`: falha no pipeline (ver detalhes em `./visao-fluxo-processamento-video.md`)

#### 2.7 Revisar Clipes Gerados

**Rota**: `/dashboard/projects/[id]`
**Componentes**:
- `RecentVideosClient` (em modo detalhes)
- `ClipCard` (cada clipe gerado)
  - Thumbnail (frame do clipe)
  - Título (gerado automaticamente ou editável)
  - Hook (trecho inicial, para social)
  - Virality Score (0.0–1.0, calculado pelo Gemini)
  - **Clipe de corte manual (RF-PIPE-08)**: no lugar da porcentagem de viralização
    (que vem do Gemini, que não roda no modo manual) o card mostra o texto
    **"Corte Manual"** (ícone decorativo `aria-hidden`; o rótulo é texto real, lido
    por leitor de tela). `ClipDetailsModal` mostra o mesmo rótulo e omite a seção
    "Por que é viral?". Regra em `src/domain/services/clip-origin.service.ts`
    (`isManualCut`): manual se `UploadedFile.manualCutsJson != null`, com fallback
    legado para clipe sem nota, gancho e motivo (projetos YouTube manuais criados
    antes de `manualCutsJson` ser persistido na importação). A página
    `/dashboard/projects/[id]` calcula e passa `isManual` ao `ClipCard`. Clipe
    automático sem nota (ex.: falha do Gemini, mas com gancho) continua mostrando `--`.
  - Botão: Download (MP4, sem marca d'água → S3)
  - Botão: "Ver Detalhes"

- `ClipDetailsModal` (ao clicar "Ver Detalhes")
  - Metadata completa (timestamps, duração, aspectRatio, subtitle preset)
  - Transcript (palavras com timestamps)
  - Botão: "Editar" (abre `ClipEditorModal` — placeholder para edição de legenda/crop)

#### 2.8 Gerenciar Projetos

**Rota**: `/dashboard/projects` (lista) ou `/dashboard/projects/[id]/edit`

| Ação | Descrição | Componente |
|---|---|---|
| Renomear | Editar `displayName` do `UploadedFile` | Dialog/AlertDialog inline em `RecentVideosClient` |
| Reprocessar | Mudar opções (GENRE, etc.) e re-enfileirar | `CreateProjectClient` em modo edit |
| Deletar | Hard-delete do `UploadedFile` e clipes relacionados (+ arquivos S3) | AlertDialog inline em `RecentVideosClient` |

---

### 3. Gestão & Billing

**Rota**: `/dashboard/billing`

#### 3.1 Status de Créditos
- **Card 1**: "Saldo Total Disponível" = `user.credits` (soma de todos os tipos)
- **Card 2**: "Cota de Assinatura" = `user.subscriptionCredits` (renovado mensalmente/anualmente)

#### 3.2 Assinatura Ativa
Se `subscription.status = 'active'` ou `'past_due'`:
- **Component**: `ActiveSubscriptionCard`
- **Info**:
  - Plano (Starter / Pro)
  - Data de renovação (`currentPeriodEnd`)
  - Créditos restantes antes da renovação
  - Botão: "Gerenciar Assinatura" → Portal Stripe

#### 3.3 Selecionar Plano
- **Toggle**: Monthly / Annual
- **Planos Disponíveis**:
  - **Starter Monthly**: $15/mês, 150 créditos/mês
  - **Starter Annual**: $114/ano ($9.50/mês), 1.800 créditos/ano
  - **Pro Monthly**: $29/mês, 300 créditos/mês
  - **Pro Annual**: $228/ano ($19/mês), 3.600 créditos/ano

#### 3.4 Checkout
- **Action**: `createCheckoutSession(priceId)`
- **Integração**: Stripe Checkout
- **Webhook**: `/api/webhooks/stripe` (webhook do Stripe)
  - Cria/atualiza `Subscription`
  - Adiciona `subscriptionCredits` ao usuário
  - Status: `active` ou `past_due`

#### 3.5 Falha de Pagamento
- **Trigger**: Webhook Stripe `invoice.payment_failed`
- **Estado**: `subscription.status = 'past_due'`
- **Ação Automática**: Carência de 3 dias (ver **`./visao-fluxo-pagamento.md`** para detalhe)
- **User Action**: Email notificando falha → Atualizar cartão no Portal Stripe → Retry automático

---

## Componentes-chave Mapeados

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| `Header` | `src/components/landing/header.tsx` | Nav landing, logo, CTA |
| `Footer` | `src/components/landing/footer.tsx` | Links legais, redes |
| `CreateProjectClient` | `src/components/dashboard/create-project-client.tsx` | Criar/editar projeto, opções dinâmicas, slice config |
| `RecentVideosClient` | `src/components/dashboard/recent-videos-client.tsx` | Polling de status, lista de vídeos |
| `ClipCard` | `src/components/clip-card.tsx` | Exibição de clipe individual |
| `ClipDetailsModal` | `src/components/clip-details-modal.tsx` | Detalhes completos do clipe |
| `ClipEditorModal` | `src/components/clip-editor-modal.tsx` | Editor de preset de legenda |
| `PricingToggleTabs` | `src/components/billing/pricing-toggle-tabs.tsx` | Monthly/Annual toggle |
| `ActiveSubscriptionCard` | `src/components/billing/active-subscription-card.tsx` | Card de assinatura ativa |
| `AppSidebar` | `src/components/dashboard/sidebar/app-sidebar.tsx` | Navegação lateral do dashboard |
| `AccountSwitcher` | `src/components/dashboard/header/account-switcher.tsx` | Usuário logado, opções de conta |

---

## Rotas Mapeadas

| Rota | Arquivo | Descrição |
|---|---|---|
| `/` | `app/page.tsx` | Landing page |
| `/pricing` | `app/pricing/page.tsx` | Página de preços |
| `/terms` | `app/terms/page.tsx` | Termos de Serviço |
| `/privacy` | `app/privacy/page.tsx` | Política de Privacidade |
| `/refund` | `app/refund/page.tsx` | Política de Reembolso |
| `/contact` | `app/contact/page.tsx` | Formulário de contato |
| `/signup/[[...signup]]` | `app/signup/[[...signup]]/page.tsx` | Cadastro (Clerk) |
| `/login/[[...login]]` | `app/login/[[...login]]/page.tsx` | Login (Clerk) |
| `/` | `app/page.tsx` | Landing page |
| `/pricing` | `app/pricing/page.tsx` | Página de preços |
| `/terms` | `app/terms/page.tsx` | Termos de Serviço |
| `/privacy` | `app/privacy/page.tsx` | Política de Privacidade |
| `/refund` | `app/refund/page.tsx` | Política de Reembolso |
| `/contact` | `app/contact/page.tsx` | Formulário de contato |
| `/signup/[[...signup]]` | `app/signup/[[...signup]]/page.tsx` | Cadastro (Clerk) |
| `/login/[[...login]]` | `app/login/[[...login]]/page.tsx` | Login (Clerk) |
| `/sso-callback` | `app/sso-callback/page.tsx` | Callback de SSO (Google login) |
| `/dashboard` | `app/dashboard/page.tsx` | Dashboard principal (início, recent videos) |
| `/dashboard/new` | `app/dashboard/new/page.tsx` | Criar novo projeto |
| `/dashboard/projects` | `app/dashboard/projects/page.tsx` | Lista de projetos |
| `/dashboard/projects/[id]` | `app/dashboard/projects/[id]/page.tsx` | Detalhes do projeto (clipes gerados) |
| `/dashboard/projects/[id]/edit` | `app/dashboard/projects/[id]/edit/page.tsx` | Editar projeto (reprocessar) |
| `/dashboard/billing` | `app/dashboard/billing/page.tsx` | Gerenciar billing e assinatura |
| `/api/youtube/info` | `app/api/youtube/info/route.ts` | Buscar metadata de vídeo YouTube |
| `/api/webhooks/stripe` | `app/api/webhooks/stripe/route.ts` | Webhook de eventos Stripe |
| `/api/webhooks/clerk` | `app/api/webhooks/clerk/route.ts` | Webhook de eventos Clerk |

---

## Referência Cruzada com Outros Documentos

Este documento é complementado por:

1. **`visao-dados-modelo-er.md`** — Modelo de dados (entidades User, UploadedFile, Clip, Subscription, CreditTransaction)
2. **`visao-fluxo-pagamento.md`** — Detalhe técnico de billing, webhook Stripe, carência de pagamento, créditos hold/consume/refund (a documentar)
3. **`visao-fluxo-processamento-video.md`** — Pipeline de vídeo, transcrição, detecção de falante, geração de legendas, renderização (a documentar)

---

## Notas Importantes

- **Upload Direto**: Escondido na UI (decisão de produto). Fluxo atual é YouTube-only + cortes manuais por timestamp.
- **Conteúdo Legal**: Alguns placeholders `[A PREENCHER]` ainda existem em `/terms`, `/privacy`, `/refund`, `/contact`.
- **Checkpoint de Créditos**: Antes de enviar para processamento, o sistema verifica se `user.credits >= estimatedCost`. Se não, redireciona para billing.
- **Webhook Clerk**: Sincroniza novo usuário com `db.user` automaticamente ao cadastro.
- **Polling**: O frontend faz polling contínuo em `RecentVideosClient` enquanto vídeo está em `QUEUED` ou `PROCESSING`.
- **Deduplicação de Webhook**: `ProcessedWebhookEvent` previne double-processing de eventos Stripe/Clerk.
