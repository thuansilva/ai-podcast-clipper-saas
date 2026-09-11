# Refatoração Clean Architecture & SOLID no Frontend — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **User Rule Enforced:** NUNCA execute `git commit`, `git push` ou crie tags sem a autorização explícita do usuário. As alterações devem ser preparadas no working directory e revisadas.

**Goal:** Refatorar a aplicação web/SaaS (`ai-podcast-clipper-frontend`) aplicando Clean Architecture e princípios SOLID, isolando a lógica de negócio em Casos de Uso puros (Use Cases) e Portas/Adaptadores, desacoplando o Next.js/Prisma do domínio e garantindo 100% de cobertura de testes unitários com Vitest.

**Architecture:** Arquitetura em camadas estritas: Domínio puro (Entidades, Erros, Regras e Portas), Aplicação (Casos de Uso e DTOs), Infraestrutura (Repositórios Prisma, Gateways S3/Stripe/Inngest e Composition Root) e Apresentação (Server Actions enxutas e Handlers).

**Tech Stack:** Next.js 15, TypeScript, Vitest, Prisma ORM, PostgreSQL, AWS SDK S3 v3, Stripe SDK, Inngest SDK.

**Spec:** `docs/superpowers/specs/2026-09-11-frontend-clean-architecture-solid-refactor.md`

## Global Constraints
- A pasta `ai-podcast-clipper-backend` (Python / Modal GPU Worker) permanece 100% inalterada.
- O domínio (`src/domain/`) não pode ter nenhuma importação de frameworks ou bibliotecas externas.
- Todos os Casos de Uso devem ser testáveis com Mocks em memória sem acesso a rede ou banco de dados.

---

### Task 1: Camada de Domínio — Entidades, Erros Customizados, Regras Puras e Portas

**Files:**
- Create: `ai-podcast-clipper-frontend/src/domain/entities/user.ts`
- Create: `ai-podcast-clipper-frontend/src/domain/entities/uploaded-file.ts`
- Create: `ai-podcast-clipper-frontend/src/domain/entities/clip.ts`
- Create: `ai-podcast-clipper-frontend/src/domain/entities/credit-transaction.ts`
- Create: `ai-podcast-clipper-frontend/src/domain/errors/domain-error.ts`
- Create: `ai-podcast-clipper-frontend/src/domain/errors/insufficient-credits-error.ts`
- Create: `ai-podcast-clipper-frontend/src/domain/errors/unauthorized-error.ts`
- Create: `ai-podcast-clipper-frontend/src/domain/errors/not-found-error.ts`
- Create: `ai-podcast-clipper-frontend/src/domain/errors/invalid-youtube-url-error.ts`
- Create: `ai-podcast-clipper-frontend/src/domain/rules/calculate-credits.ts`
- Create: `ai-podcast-clipper-frontend/src/domain/rules/youtube-parser.ts`
- Create: `ai-podcast-clipper-frontend/src/domain/ports/user-repository.ts`
- Create: `ai-podcast-clipper-frontend/src/domain/ports/uploaded-file-repository.ts`
- Create: `ai-podcast-clipper-frontend/src/domain/ports/clip-repository.ts`
- Create: `ai-podcast-clipper-frontend/src/domain/ports/credit-transaction-repository.ts`
- Create: `ai-podcast-clipper-frontend/src/domain/ports/unit-of-work.ts`
- Create: `ai-podcast-clipper-frontend/src/domain/ports/storage-gateway.ts`
- Create: `ai-podcast-clipper-frontend/src/domain/ports/payment-gateway.ts`
- Create: `ai-podcast-clipper-frontend/src/domain/ports/queue-gateway.ts`
- Test: `ai-podcast-clipper-frontend/tests/unit/domain/calculate-credits.test.ts`
- Test: `ai-podcast-clipper-frontend/tests/unit/domain/youtube-parser.test.ts`
- Test: `ai-podcast-clipper-frontend/tests/unit/domain/domain-errors.test.ts`

**Interfaces:**
- Produces: `calculateVideoCredits(durationSeconds: number): number`
- Produces: `isValidYouTubeUrl(url: string): boolean`, `extractYouTubeVideoId(url: string): string | null`
- Produces: `IUserRepository`, `IUploadedFileRepository`, `IClipRepository`, `ICreditTransactionRepository`, `IUnitOfWork`, `IStorageGateway`, `IPaymentGateway`, `IQueueGateway`

- [ ] **Step 1: Escrever testes unitários para as regras puras e erros de domínio (RED)**
- [ ] **Step 2: Implementar as entidades e classes de erro de domínio**
- [ ] **Step 3: Implementar as regras puras de cálculo de créditos e parser de YouTube**
- [ ] **Step 4: Definir as interfaces de portas (ports) de repositórios e gateways**
- [ ] **Step 5: Executar testes com Vitest para confirmar sucesso (GREEN)**

---

### Task 2: Implementação dos Mocks em Memória (`tests/mocks/`)

**Files:**
- Create: `ai-podcast-clipper-frontend/tests/mocks/in-memory-user-repository.ts`
- Create: `ai-podcast-clipper-frontend/tests/mocks/in-memory-uploaded-file-repository.ts`
- Create: `ai-podcast-clipper-frontend/tests/mocks/in-memory-clip-repository.ts`
- Create: `ai-podcast-clipper-frontend/tests/mocks/in-memory-credit-transaction-repository.ts`
- Create: `ai-podcast-clipper-frontend/tests/mocks/in-memory-unit-of-work.ts`
- Create: `ai-podcast-clipper-frontend/tests/mocks/in-memory-storage-gateway.ts`
- Create: `ai-podcast-clipper-frontend/tests/mocks/in-memory-queue-gateway.ts`

**Interfaces:**
- Consumes: Contratos definidos em `src/domain/ports/*`
- Produces: Mocks em memória para injeção imediata nos testes unitários dos Casos de Uso.

- [ ] **Step 1: Implementar os repositórios em memória implementando as interfaces de porta**
- [ ] **Step 2: Implementar o `InMemoryUnitOfWork` que executa transações síncronas/assíncronas em memória**
- [ ] **Step 3: Implementar `InMemoryStorageGateway` e `InMemoryQueueGateway`**

---

### Task 3: Casos de Uso do Domínio de Créditos (`src/application/use-cases/credits/`)

**Files:**
- Create: `ai-podcast-clipper-frontend/src/application/dtos/credits-dtos.ts`
- Create: `ai-podcast-clipper-frontend/src/application/use-cases/credits/hold-credits.use-case.ts`
- Create: `ai-podcast-clipper-frontend/src/application/use-cases/credits/consume-credits.use-case.ts`
- Create: `ai-podcast-clipper-frontend/src/application/use-cases/credits/refund-credits.use-case.ts`
- Create: `ai-podcast-clipper-frontend/src/application/use-cases/credits/add-credits-from-stripe.use-case.ts`
- Test: `ai-podcast-clipper-frontend/tests/unit/application/credits/hold-credits.use-case.test.ts`
- Test: `ai-podcast-clipper-frontend/tests/unit/application/credits/consume-credits.use-case.test.ts`
- Test: `ai-podcast-clipper-frontend/tests/unit/application/credits/refund-credits.use-case.test.ts`
- Test: `ai-podcast-clipper-frontend/tests/unit/application/credits/add-credits-from-stripe.use-case.test.ts`

**Interfaces:**
- Produces: `HoldCreditsUseCase`, `ConsumeCreditsUseCase`, `RefundCreditsUseCase`, `AddCreditsFromStripeWebhookUseCase`

- [ ] **Step 1: Escrever testes unitários para `HoldCreditsUseCase` (caminho feliz e `InsufficientCreditsError`)**
- [ ] **Step 2: Implementar `HoldCreditsUseCase`**
- [ ] **Step 3: Escrever testes unitários e implementar `ConsumeCreditsUseCase`**
- [ ] **Step 4: Escrever testes unitários e implementar `RefundCreditsUseCase`**
- [ ] **Step 5: Escrever testes unitários e implementar `AddCreditsFromStripeWebhookUseCase`**
- [ ] **Step 6: Executar suíte de testes de créditos com Vitest (GREEN)**

---

### Task 4: Casos de Uso de Vídeos & Clipes (`src/application/use-cases/videos/` e `clips/`)

**Files:**
- Create: `ai-podcast-clipper-frontend/src/application/dtos/video-dtos.ts`
- Create: `ai-podcast-clipper-frontend/src/application/dtos/clip-dtos.ts`
- Create: `ai-podcast-clipper-frontend/src/application/use-cases/videos/generate-upload-url.use-case.ts`
- Create: `ai-podcast-clipper-frontend/src/application/use-cases/videos/import-youtube-video.use-case.ts`
- Create: `ai-podcast-clipper-frontend/src/application/use-cases/clips/get-clip-play-url.use-case.ts`
- Create: `ai-podcast-clipper-frontend/src/application/use-cases/clips/update-clip.use-case.ts`
- Create: `ai-podcast-clipper-frontend/src/application/use-cases/clips/delete-clip.use-case.ts`
- Test: `ai-podcast-clipper-frontend/tests/unit/application/videos/generate-upload-url.use-case.test.ts`
- Test: `ai-podcast-clipper-frontend/tests/unit/application/videos/import-youtube-video.use-case.test.ts`
- Test: `ai-podcast-clipper-frontend/tests/unit/application/clips/get-clip-play-url.use-case.test.ts`
- Test: `ai-podcast-clipper-frontend/tests/unit/application/clips/update-clip.use-case.test.ts`
- Test: `ai-podcast-clipper-frontend/tests/unit/application/clips/delete-clip.use-case.test.ts`

**Interfaces:**
- Produces: `GenerateUploadUrlUseCase`, `ImportYouTubeVideoUseCase`, `GetClipPlayUrlUseCase`, `UpdateClipUseCase`, `DeleteClipUseCase`

- [ ] **Step 1: Escrever testes unitários e implementar `GenerateUploadUrlUseCase` e `ImportYouTubeVideoUseCase`**
- [ ] **Step 2: Escrever testes unitários e implementar `GetClipPlayUrlUseCase` com validação de ownership**
- [ ] **Step 3: Escrever testes unitários e implementar `UpdateClipUseCase` e `DeleteClipUseCase`**
- [ ] **Step 4: Executar testes de vídeos e clipes no Vitest (GREEN)**

---

### Task 5: Camada de Infraestrutura — Repositórios Prisma, Gateways e Composition Root

**Files:**
- Create: `ai-podcast-clipper-frontend/src/infrastructure/database/repositories/prisma-user.repository.ts`
- Create: `ai-podcast-clipper-frontend/src/infrastructure/database/repositories/prisma-uploaded-file.repository.ts`
- Create: `ai-podcast-clipper-frontend/src/infrastructure/database/repositories/prisma-clip.repository.ts`
- Create: `ai-podcast-clipper-frontend/src/infrastructure/database/repositories/prisma-credit-transaction.repository.ts`
- Create: `ai-podcast-clipper-frontend/src/infrastructure/database/repositories/prisma-unit-of-work.ts`
- Create: `ai-podcast-clipper-frontend/src/infrastructure/storage/s3-storage.gateway.ts`
- Create: `ai-podcast-clipper-frontend/src/infrastructure/payments/stripe-payment.gateway.ts`
- Create: `ai-podcast-clipper-frontend/src/infrastructure/queue/inngest-queue.gateway.ts`
- Create: `ai-podcast-clipper-frontend/src/infrastructure/factories/use-case-factories.ts`

**Interfaces:**
- Implements: `IUserRepository`, `IUploadedFileRepository`, `IClipRepository`, `ICreditTransactionRepository`, `IUnitOfWork`, `IStorageGateway`, `IPaymentGateway`, `IQueueGateway`
- Produces: Funções de fábrica no `use-case-factories.ts` para composição de instâncias prontas para produção.

- [ ] **Step 1: Implementar os repositórios Prisma mapeando entidades de domínio**
- [ ] **Step 2: Implementar `PrismaUnitOfWork` com `db.$transaction`**
- [ ] **Step 3: Implementar `S3StorageGateway`, `StripePaymentGateway` e `InngestQueueGateway`**
- [ ] **Step 4: Implementar o Composition Root em `use-case-factories.ts`**

---

### Task 6: Refatoração da Camada de Apresentação (Server Actions & Inngest Pipeline)

**Files:**
- Modify: `ai-podcast-clipper-frontend/src/actions/generation.ts`
- Modify: `ai-podcast-clipper-frontend/src/actions/youtube.ts`
- Modify: `ai-podcast-clipper-frontend/src/actions/s3.ts`
- Modify: `ai-podcast-clipper-frontend/src/actions/stripe.ts`
- Modify: `ai-podcast-clipper-frontend/src/app/api/webhooks/stripe/route.ts`
- Modify: `ai-podcast-clipper-frontend/src/inngest/functions.ts`

**Interfaces:**
- Consumes: Factories de `use-case-factories.ts`
- Produces: Handlers desacoplados, protegidos e com tratamento unificado de `DomainError`.

- [ ] **Step 1: Refatorar `src/actions/s3.ts` para usar `makeGenerateUploadUrlUseCase()`**
- [ ] **Step 2: Refatorar `src/actions/youtube.ts` para usar `makeImportYouTubeVideoUseCase()`**
- [ ] **Step 3: Refatorar `src/actions/generation.ts` para usar `makeGetClipPlayUrlUseCase()`, `makeUpdateClipUseCase()` e `makeDeleteClipUseCase()`**
- [ ] **Step 4: Refatorar `src/app/api/webhooks/stripe/route.ts` para usar `makeAddCreditsFromStripeWebhookUseCase()`**
- [ ] **Step 5: Refatorar `src/inngest/functions.ts` para consumir os Casos de Uso de Crédito**

---

### Task 7: Verificação Geral, Typecheck e Homologação dos Testes

**Files:**
- All tests in `ai-podcast-clipper-frontend/tests/`

- [ ] **Step 1: Executar typecheck completo do TypeScript**
```bash
cd ai-podcast-clipper-frontend && npm run typecheck
```
- [ ] **Step 2: Executar todos os testes unitários no Vitest**
```bash
cd ai-podcast-clipper-frontend && npx vitest run
```
- [ ] **Step 3: Apresentar resumo completo das alterações para revisão do usuário**
