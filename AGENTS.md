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
diagrama do banco está documentado em `docs/diagrama-banco-de-dados.md`.

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
npm run db:studio        # Prisma Studio
npm run db:push          # aplica o schema no banco (dev)
npm run db:generate      # cria migration (Prisma migrate dev)
npm run db:migrate       # aplica migrations (deploy)
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

### Documentação adicional

- `docs/diagrama-banco-de-dados.md` — modelo entidade-relacionamento do banco.
- `docs/aws-s3-lifecycle-rules.md` — regras de ciclo de vida do bucket S3.
- `docs/superpowers/plans/` e `docs/superpowers/specs/` — histórico de planos e specs
  de features (autenticação com Clerk, assinaturas e pacotes de crédito,
  reestruturação do dashboard, processamento local em GPU, cortes manuais por
  timestamp, testes de carga com k6, gerenciamento de projetos, etc.). Consulte esses
  arquivos para entender o contexto e as decisões de design por trás de cada feature
  antes de propor mudanças relacionadas.

> Nota: o `README.md` na raiz descreve a versão original/tutorial do projeto (ex.:
> menciona Auth.js). O projeto evoluiu — a autenticação atual usa **Clerk**, e o
> frontend foi migrado para uma arquitetura em camadas (domain/application/
> infrastructure). Prefira o código-fonte e os arquivos em `docs/superpowers/` como
> fonte da verdade sobre o estado atual.

## Testes e TDD

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

## Controle de Versão e Git
- **NUNCA execute `git commit`, `git push` ou crie tags sem a autorização explícita do usuário.**
- Todas as alterações de código e documentação devem ser apresentadas para revisão antes de qualquer ação de commit.
- Quando arquivos forem criados ou alterados, apenas prepare os arquivos ou deixe-os no working directory e solicite aprovação do usuário para efetuar o commit.
