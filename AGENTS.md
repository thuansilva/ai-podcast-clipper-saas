# AI Podcast Clipper — Diretrizes do Projeto

SaaS que transforma podcasts longos em clipes verticais curtos (estilo TikTok/YouTube
Shorts), detectando automaticamente os momentos mais "virais", cortando o vídeo para
seguir o rosto do speaker ativo e gerando legendas.

## Visão geral da arquitetura

O repositório é um monorepo com duas aplicações principais:

- **`ai-podcast-clipper-frontend/`** — Next.js 15 (App Router) + React 19 + TypeScript.
  Web app com autenticação, dashboard, configuração de projetos, cobrança e fila de
  processamento.
- **`ai-podcast-clipper-backend/`** — Serviço Python responsável pelo processamento
  pesado de vídeo (GPU): transcrição, detecção de falante ativo, corte vertical e
  geração de legendas. Pode rodar como função serverless no **Modal** (`main.py`) ou
  como servidor local (`local_server.py`) para processamento em GPU própria.

### Frontend (`ai-podcast-clipper-frontend`)

Stack: Next.js 15, React 19, TypeScript, Tailwind CSS + Shadcn UI, Prisma (Postgres),
Clerk (autenticação), Stripe (pagamentos/assinaturas), Inngest (filas/jobs em
background), AWS S3 (armazenamento de arquivos), Zustand (estado no client), Vitest
(testes) e k6 (testes de carga).

`src/` segue uma organização inspirada em **Clean Architecture**:

- `domain/` — entidades, value objects, erros e ports (interfaces), sem dependências
  externas.
- `application/` — use cases, DTOs e services que orquestram a lógica de negócio.
- `infrastructure/` — implementações concretas dos ports: banco de dados (Prisma),
  auth (Clerk), pagamentos (Stripe), storage (S3), filas (Inngest) e factories.
- `app/` — rotas do Next.js (App Router), incluindo `app/api/*` (webhooks do Clerk e
  Stripe, integração com Inngest, download do YouTube, storage local).
- `actions/`, `components/`, `hooks/`, `stores/`, `schemas/`, `config/`, `navigation/`
  — camadas de apresentação e utilitários do Next.js.

Modelos de dados principais (`prisma/schema.prisma`): `User`, `Subscription`,
`CreditTransaction`, `UploadedFile`, `Clip`, `ProcessingOption`,
`ProcessedWebhookEvent` (usado para deduplicar eventos de webhook, ex.: Stripe). O
diagrama do banco está documentado em `docs/arquitetura/visao-dados-modelo-er.md`.

O sistema de créditos controla o consumo: usuários têm créditos de assinatura,
avulsos (one-time) e reservados; o processamento de cada podcast debita créditos via
transações registradas em `CreditTransaction`.

Scripts úteis (rodar dentro de `ai-podcast-clipper-frontend/`):

```bash
npm run dev              # servidor de desenvolvimento (Next.js + Turbo)
npm run inngest-dev      # servidor local de filas (Inngest)
npm run check            # lint + typecheck
npm run test             # testes unitários (Vitest)
npm run test:integration # testes de integração
npm run test:load        # testes de carga (k6)
npm run test:everything  # modo completo: sobe Postgres/app/Inngest e roda unit + integração + smoke de carga numa tacada só (ver ai-podcast-clipper-frontend/load-tests/README.md)
npm run db:studio        # Prisma Studio
npm run db:push          # aplica o schema no banco (dev)
npm run db:generate      # cria migration (Prisma migrate dev)
npm run db:migrate       # aplica migrations (deploy)
npm run prepare          # instala os git hooks do Husky (roda automaticamente no "npm install")
```

### Backend (`ai-podcast-clipper-backend`)

Stack: Python 3.12, FastAPI, Modal (GPU serverless), WhisperX (transcrição),
Junhua-Liao/LR-ASD (`asd/`, detecção de falante ativo — submódulo/pasta clonada à
parte), FFMPEGCV/OpenCV (renderização acelerada por GPU), Gemini 2.5 Pro (identificação
de momentos virais via LLM), boto3 (S3), yt-dlp (download de YouTube).

- `main.py` — define a app Modal (`modal.App`), a imagem de container com CUDA e as
  funções que rodam na nuvem (`modal run main.py` para testar, `modal deploy main.py`
  para publicar).
- `local_server.py` — servidor FastAPI alternativo para rodar o pipeline de
  processamento em GPU local, com monkey-patches de compatibilidade para
  torchaudio/pyannote/whisperx em versões recentes do PyTorch.
- `core/` — schemas Pydantic, geração de estilos de legenda (`subtitle_styles.py`) e
  download de vídeos do YouTube (`youtube_downloader.py`).
- `ytdownload.py` — utilitário standalone de download.
- `tests/` — testes do backend (ver `requirements-test.txt`).

O pipeline de vídeo, em alto nível: transcrição (WhisperX) → identificação de
momentos virais (Gemini) → detecção de falante ativo (LR-ASD) → corte/crop vertical
com FFMPEGCV → geração e queima de legendas (`pysubs2`) → upload do clipe final para
S3.

### Infraestrutura local (`docker-compose.yml`)

- `postgres` — banco Postgres 16 usado pelo Prisma em desenvolvimento.
- `k6` — runner de testes de carga apontando para `ai-podcast-clipper-frontend/`.

### Documentação

A documentação está organizada em **cinco perspectivas** (`docs/`). Fonte de verdade completa: **`docs/README.md`** (índice com convenções para novos documentos, consultas rápidas e rastreabilidade RF→código→teste).

**Resumo rápido das 5 pastas:**

1. **`docs/requisitos/`** — RFs (RF-AUTH-*, RF-BILL-*, etc.), RNFs, casos de uso, regras de negócio com status de implementação. Matriz rastreabilidade: RF → caso de uso → artefato → teste.

2. **`docs/arquitetura/`** — Quatro **visões complementares** (com diagramas Mermaid obrigatórios):
   - `visao-dados-modelo-er.md` — ER do Postgres (7 models, relacionamentos, constraints)
   - `visao-fluxo-pagamento.md` — Webhook Stripe → idempotência → Inngest → use cases (créditos, carência 3 dias, reembolsos, chargebacks)
   - `visao-fluxo-processamento-video.md` — Pipeline: YouTube → validação + hold créditos → Modal/GPU → transcrição → virality → detecção falante → corte → S3
   - `visao-jornada-usuario.md` — Navegação UI (landing → onboarding → criar/processar → revisar → billing), rotas Next.js

3. **`docs/operacao/`** — Produção e manutenção:
   - `checklist-go-live.md` — 21 BLOCKERs resolvidos (100%), HIGH/NICE items, auditoria 6 especialistas
   - `aws-s3-lifecycle-rules.md` — Config S3 lifecycle (uploads/youtube 1 dia, clips/ forever, economia 95%)
   - `observabilidade.md` — OpenTelemetry + Prometheus + Grafana troubleshooting (delay indexação, busca trace ID vs /api/search)

4. **`docs/pesquisa/`** — Experimentos em progresso (não decisões finais):
   - `experimento-observabilidade/` — Baseline local OpenTelemetry, dashboards Grafana

5. **`docs/historico/`** — Memória de design (14 plans/specs cronológicos 2026-09-11 a 2026-09-23): Clerk auth, créditos/assinaturas, dashboard, GPU local, cortes manuais, k6, project management, etc.

**Consultas rápidas: qual documento ler?**

| Situação | Ler |
|----------|-----|
| Antes de mexer em billing/Stripe | `visao-fluxo-pagamento.md` + RF-BILL-* em requisitos-funcionais |
| Antes de mexer no pipeline de vídeo | `visao-fluxo-processamento-video.md` + RF-PIPE-*/RF-INGEST-* em requisitos-funcionais |
| Antes de mexer em UI/fluxo usuário | `visao-jornada-usuario.md` + casos-de-uso |
| Preparar produção | `checklist-go-live.md` (validar BLOCKERs) + `aws-s3-lifecycle-rules.md` (config S3) |
| Investigar um bug de lógica | `casos-de-uso-e-regras-de-negocio.md` (regras esperadas) |
| Entender decisão de design antiga | `docs/historico/superpowers/` (plans/specs cronológicos) |

> **Nota:** o `README.md` na raiz descreve a versão original/tutorial do projeto (ex.: menciona Auth.js). O projeto evoluiu — a autenticação atual usa **Clerk**, e o frontend foi migrado para Clean Architecture (domain/application/infrastructure). A fonte de verdade sobre estado atual está em `AGENTS.md`, `docs/`, e código-fonte; o `README.md` será revisado depois.

## Testes, TDD e Documentação

- **Código e documentação evoluem sempre juntos — nenhuma tarefa está concluída só
  porque o teste passou.** Testes garantem que o que já existia não quebrou; a
  documentação garante que o que foi feito fica registrado e encontrável depois. Ao
  implementar uma funcionalidade nova ou mudar comportamento existente, atualize na
  mesma tarefa:
  - `docs/requisitos/requisitos-funcionais-e-nao-funcionais.md` — adicione/atualize o
    RF (e o RNF, se aplicável) correspondente, incluindo a linha na matriz de
    rastreabilidade (RF → caso de uso → artefato de código → teste).
  - `docs/requisitos/casos-de-uso-e-regras-de-negocio.md` — se a mudança introduzir ou
    alterar uma regra de negócio.
  - O documento de "visão" relevante em `docs/arquitetura/` (`visao-fluxo-pagamento.md`
    pra billing, `visao-fluxo-processamento-video.md` pro pipeline de vídeo,
    `visao-jornada-usuario.md` pra mudanças de UI/fluxo do usuário,
    `visao-dados-modelo-er.md` se o schema do banco mudar) — se a mudança afetar o
    fluxo que esses diagramas descrevem.
  - `docs/operacao/checklist-go-live.md` — se a mudança resolver um item pendente ou
    introduzir um gap/risco novo conhecido.
  - `progress.md` — sempre, como entrada no histórico (ver convenção já estabelecida
    no próprio arquivo).
  - Ver `docs/README.md` para o índice completo de documentos e qual consultar/atualizar
    em cada situação.
- **Toda afirmação em documentação sobre código/teste precisa vir de leitura ou
  execução real** (Read/Grep/rodar o teste), nunca de suposição — citar um arquivo,
  função ou resultado de teste que não foi conferido é tão grave quanto um bug de
  código. (Lição aprendida em 2026-10-04: uma sessão de documentação introduziu
  referências a arquivos de teste inexistentes sem ter rodado a suíte; só foi pego
  numa revisão técnica cruzada posterior.)
- **Toda funcionalidade nova ou alteração de comportamento deve começar pelo teste.**
  Escreva o teste (falhando) antes de implementar o código de produção, e só então
  implemente até o teste passar (TDD: red → green → refactor).
- Nenhuma funcionalidade nova ou alteração é considerada concluída sem cobertura de
  **teste unitário** e de **teste de integração**. Não é aceitável entregar código só
  com teste unitário, ou só manual/sem teste.
- Ao desenhar o teste de integração, estruture os cenários (fixtures, dados de setup,
  seleção de seletores/rotas estáveis) de forma que já sirvam de base para um teste
  **e2e** futuro, mesmo que o e2e não seja escrito na mesma tarefa — ou seja, deixe o
  terreno pronto (ex.: dados determinísticos, endpoints/rotas reais, não depender de
  detalhes de implementação que quebrariam um teste ponta a ponta).
- Frontend (`ai-podcast-clipper-frontend/`): unitário/integração com Vitest
  (`npm run test`, `npm run test:integration`, `npm run test:all`). Bugfix também
  precisa de um teste que reproduza o bug antes da correção.
- Backend (`ai-podcast-clipper-backend/`): testes em `tests/` (ver
  `requirements-test.txt`); siga o mesmo princípio de TDD e cobertura unitária +
  integração para o pipeline de processamento.
- Antes de considerar uma tarefa pronta, rode a suíte relevante (`npm run check` +
  testes) e reporte o resultado — não afirme que uma funcionalidade está pronta sem
  ter executado os testes.

## Uso dos Agentes Especializados (`.claude/agents/`)

Este projeto tem subagentes configurados em `.claude/agents/` (ex.:
`frontend-specialist`, `domain-specialist`, `security-specialist`,
`qa-specialist`, `devops-specialist`, `accessibility-tester`,
`docs-release-specialist`, `cto`).

- **Para qualquer tarefa não-trivial, divida o trabalho entre os
  especialistas em vez de executar tudo direto na sessão principal.**
  "Trivial" = fix de uma linha, typo, ajuste cosmético — fora isso, quebre a
  tarefa e acione o(s) agente(s) certo(s) via Agent tool.
- Quando não estiver óbvio quem cuida de qual parte, acione o `cto`
  primeiro para obter o plano de divisão (ele só planeja, não executa —
  subagentes não conseguem acionar outros subagentes; quem executa o plano
  é a sessão principal).
- Pedaços independentes (sem dependência de dado entre si) devem ser
  disparados **em paralelo** (múltiplas chamadas do Agent tool na mesma
  mensagem), não em sequência.
- Use `subagent_type: "fork"` em vez de um agente nomeado quando a tarefa
  precisa continuar um estado/investigação já em andamento na conversa
  atual — agentes nomeados começam sem memória da conversa; só o fork
  herda o contexto já construído.

## Controle de Versão e Git
- **NUNCA execute `git commit`, `git push` ou crie tags sem a autorização explícita do usuário.**
- Todas as alterações de código e documentação devem ser apresentadas para revisão antes de qualquer ação de commit.
- Quando arquivos forem criados ou alterados, apenas prepare os arquivos ou deixe-os no working directory e solicite aprovação do usuário para efetuar o commit.
- **Git hook `pre-push` (Husky) roda a suíte completa antes de qualquer `git push`:**
  `ai-podcast-clipper-backend` (`pytest`) e `ai-podcast-clipper-frontend`
  (`npm run test:everything` — Postgres/build/Inngest/smoke de carga k6). O
  push é abortado se qualquer uma falhar. Deliberadamente **não** roda no
  `pre-commit` (decisão do usuário): a suíte completa leva minutos e depende
  de Docker, então rodá-la a cada commit tornaria o dia a dia lento demais —
  o `pre-push` é o último gate local antes do CI, e commits locais continuam
  rápidos. O `.husky/` fica na **raiz do monorepo** (não dentro de
  `ai-podcast-clipper-frontend/`), porque hooks de git são por repositório
  inteiro; o Husky é uma devDependency do único `package.json` do projeto
  (`ai-podcast-clipper-frontend/package.json`), e o script `prepare`
  (`ai-podcast-clipper-frontend/scripts/husky-install.sh`) cuida de instalar
  os hooks no lugar certo mesmo assim. Para pular pontualmente (ex.:
  emergência já testada manualmente): `HUSKY=0 git push`.
