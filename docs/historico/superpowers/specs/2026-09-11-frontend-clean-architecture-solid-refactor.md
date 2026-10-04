# Design Document: Refatoração Clean Architecture & SOLID no Frontend

- **Data**: 2026-09-11
- **Status**: Aprovado para Planejamento de Implementação
- **Escopo**: Reestruturação da pasta `ai-podcast-clipper-frontend` em camadas estritas (Domínio, Aplicação, Infraestrutura e Apresentação), desacoplamento de regras de negócio em Casos de Uso (Use Cases), injeção via Composition Root (TypeScript Puro) e cobertura total de testes unitários com Vitest.
- **Isolamento**: O worker de processamento de GPU em Python (`ai-podcast-clipper-backend`) permanece 100% inalterado.

---

## 1. Visão Geral e Objetivos

O objetivo desta refatoração é eliminar a sobreposição de responsabilidades no código do frontend (Next.js 15), separando regras de negócio, acesso ao banco de dados, SDKs de nuvem e interface em camadas independentes.

### 1.1 Princípios Arquiteturais Adotados
1. **Single Responsibility Principle (SRP)**: Cada Caso de Uso executa apenas uma ação do sistema.
2. **Dependency Inversion Principle (DIP)**: A camada de aplicação e os Casos de Uso dependem exclusivamente de interfaces/portas abstratas (`ports`), nunca de implementações concretas (Prisma, AWS S3, Stripe, Inngest).
3. **Domínio Puro**: A camada de domínio não possui nenhuma biblioteca externa ou dependência de framework.
4. **Alta Testabilidade**: 100% dos Casos de Uso são cobertos por testes unitários rápidos utilizando Mocks em memória (sem I/O de rede ou banco de dados).
5. **Composition Root Desacoplado**: As Server Actions e Handlers consomem fábricas de injeção de dependência (`factories`), tornando as ações de controle enxutas e com tratamento padronizado de erros de domínio.

---

## 2. Estrutura de Camadas Proposta

```
ai-podcast-clipper-frontend/
├── src/
│   ├── domain/                               # CAMADA 1: DOMÍNIO (Zero dependências externas)
│   │   ├── entities/                         # Tipos e entidades ricas de negócio
│   │   │   ├── user.ts                       # Tipagem do Usuário e saldos
│   │   │   ├── uploaded-file.ts              # Tipagem de Vídeos e fontes (UPLOAD / YOUTUBE)
│   │   │   ├── clip.ts                       # Tipagem de Clipes, presets e scores
│   │   │   └── credit-transaction.ts         # Tipagem de Transações (HOLD, CONSUME, REFUND, PURCHASE)
│   │   ├── errors/                           # Erros de domínio tipados
│   │   │   ├── domain-error.ts               # Classe base DomainError
│   │   │   ├── insufficient-credits-error.ts # Erro de saldo insuficiente
│   │   │   ├── unauthorized-error.ts         # Erro de acesso não autorizado
│   │   │   ├── not-found-error.ts            # Erro de recurso não encontrado (vídeo/clipe/user)
│   │   │   └── invalid-youtube-url-error.ts  # Erro de URL do YouTube inválida
│   │   ├── rules/                            # Regras puras e cálculos
│   │   │   ├── calculate-credits.ts          # RN-01: ceil(duration / 60)
│   │   │   └── youtube-parser.ts             # RN-06: Validação de URL e extração de Video ID
│   │   └── ports/                            # Contratos e Interfaces (Portas de Saída)
│   │       ├── user-repository.ts            # IUserRepository
│   │       ├── uploaded-file-repository.ts   # IUploadedFileRepository
│   │       ├── clip-repository.ts            # IClipRepository
│   │       ├── credit-transaction-repository.ts # ICreditTransactionRepository
│   │       ├── unit-of-work.ts               # IUnitOfWork (transações atômicas)
│   │       ├── storage-gateway.ts            # IStorageGateway (AWS S3)
│   │       ├── payment-gateway.ts            # IPaymentGateway (Stripe)
│   │       └── queue-gateway.ts              # IQueueGateway (Inngest)
│   │
│   ├── application/                          # CAMADA 2: APLICAÇÃO (Casos de Uso)
│   │   ├── dtos/                             # Interfaces de Entrada e Saída
│   │   │   ├── credits-dtos.ts
│   │   │   ├── video-dtos.ts
│   │   │   └── clip-dtos.ts
│   │   └── use-cases/                        # Casos de Uso Especializados
│   │       ├── credits/
│   │       │   ├── hold-credits.use-case.ts
│   │       │   ├── consume-credits.use-case.ts
│   │       │   ├── refund-credits.use-case.ts
│   │       │   └── add-credits-from-stripe.use-case.ts
│   │       ├── videos/
│   │       │   ├── generate-upload-url.use-case.ts
│   │       │   └── import-youtube-video.use-case.ts
│   │       └── clips/
│   │           ├── get-clip-play-url.use-case.ts
│   │           ├── update-clip.use-case.ts
│   │           └── delete-clip.use-case.ts
│   │
│   ├── infrastructure/                       # CAMADA 3: INFRAESTRUTURA (Adaptadores Concretos)
│   │   ├── database/
│   │   │   ├── prisma-client.ts              # Singleton do Prisma Client
│   │   │   └── repositories/
│   │   │       ├── prisma-user.repository.ts
│   │   │       ├── prisma-uploaded-file.repository.ts
│   │   │       ├── prisma-clip.repository.ts
│   │   │       ├── prisma-credit-transaction.repository.ts
│   │   │       └── prisma-unit-of-work.ts
│   │   ├── storage/
│   │   │   └── s3-storage.gateway.ts         # Implementação AWS SDK v3
│   │   ├── payments/
│   │   │   └── stripe-payment.gateway.ts     # Implementação Stripe SDK
│   │   ├── queue/
│   │   │   └── inngest-queue.gateway.ts      # Implementação Inngest SDK
│   │   └── factories/
│   │       └── use-case-factories.ts         # Composition Root (Instanciação dos Casos de Uso)
│   │
│   ├── presentation/                         # CAMADA 4: APRESENTAÇÃO
│   │   ├── actions/                          # Server Actions Next.js (chama factories)
│   │   │   ├── generation.actions.ts
│   │   │   ├── youtube.actions.ts
│   │   │   ├── s3.actions.ts
│   │   │   └── stripe.actions.ts
│   │   └── components/                       # Componentes de UI (Studio, Dashboard, Tabs)
│   │
│   └── inngest/                              # Orquestrador Inngest consumindo os Casos de Uso
│       └── functions.ts
│
└── tests/                                    # SUÍTE DE TESTES (Vitest)
    ├── mocks/                                # Implementações InMemory dos Repositórios e Gateways
    │   ├── in-memory-user-repository.ts
    │   ├── in-memory-uploaded-file-repository.ts
    │   ├── in-memory-clip-repository.ts
    │   ├── in-memory-credit-transaction-repository.ts
    │   ├── in-memory-unit-of-work.ts
    │   ├── in-memory-storage-gateway.ts
    │   └── in-memory-queue-gateway.ts
    └── unit/
        ├── use-cases/
        │   ├── hold-credits.use-case.test.ts
        │   ├── consume-credits.use-case.test.ts
        │   ├── refund-credits.use-case.test.ts
        │   ├── generate-upload-url.use-case.test.ts
        │   ├── import-youtube-video.use-case.test.ts
        │   ├── get-clip-play-url.use-case.test.ts
        │   ├── update-clip.use-case.test.ts
        │   └── delete-clip.use-case.test.ts
        └── rules/
            ├── calculate-credits.test.ts
            └── youtube-parser.test.ts
```

---

## 3. Especificações dos Casos de Uso e Regras de Negócio

### 3.1 Módulo de Créditos (`src/application/use-cases/credits/`)

#### 1. `HoldCreditsUseCase`
- **Responsabilidade**: Efetuar a retenção atômica prévia dos créditos do usuário antes de processar um vídeo.
- **Portas Requeridas**: `IUserRepository`, `IUploadedFileRepository`, `ICreditTransactionRepository`, `IUnitOfWork`.
- **Regras de Negócio**:
  1. Calcula o custo: `requiredCredits = calculateVideoCredits(durationSeconds)`.
  2. Busca o usuário por `userId`. Se não existir, lança `NotFoundError("Usuário não encontrado")`.
  3. Verifica se `user.credits >= requiredCredits`. Se não, lança `InsufficientCreditsError(requiredCredits, user.credits)`.
  4. Dentro de transação atômica (`IUnitOfWork`):
     - Decrementa `user.credits` em `requiredCredits`.
     - Incrementa `user.reservedCredits` em `requiredCredits`.
     - Cria transação `CreditTransaction` com tipo `"HOLD"` e descrição explicativa.
     - Atualiza `creditsCost` no `UploadedFile`.
  5. Retorna `{ success: true, heldCredits: requiredCredits }`.

#### 2. `ConsumeCreditsUseCase`
- **Responsabilidade**: Consolidar a dedução dos créditos reservados após a persistência dos clipes gerados.
- **Portas Requeridas**: `IUserRepository`, `ICreditTransactionRepository`, `IUnitOfWork`.
- **Regras de Negócio**:
  1. Dentro de transação atômica (`IUnitOfWork`):
     - Decrementa `user.reservedCredits` no valor de `amount`.
     - Cria transação `CreditTransaction` com tipo `"CONSUME"`.

#### 3. `RefundCreditsUseCase`
- **Responsabilidade**: Estornar 100% dos créditos reservados em caso de falha no pipeline de IA ou fila.
- **Portas Requeridas**: `IUserRepository`, `IUploadedFileRepository`, `ICreditTransactionRepository`, `IUnitOfWork`.
- **Regras de Negócio**:
  1. Dentro de transação atômica (`IUnitOfWork`):
     - Incrementa `user.credits` no valor de `amount`.
     - Decrementa `user.reservedCredits` no valor de `amount`.
     - Cria transação `CreditTransaction` com tipo `"REFUND"` e motivo da falha.
     - Atualiza status do `UploadedFile` para `"failed"` e grava `errorMessage`.

#### 4. `AddCreditsFromStripeWebhookUseCase`
- **Responsabilidade**: Processar o evento de webhook `checkout.session.completed` e creditar o saldo do usuário.
- **Portas Requeridas**: `IUserRepository`, `ICreditTransactionRepository`, `IUnitOfWork`.
- **Regras de Negócio**:
  1. Identifica o pacote de créditos com base no `priceId` (Small: 50, Medium: 150, Large: 500).
  2. Incrementa `user.credits` e registra `CreditTransaction` com tipo `"PURCHASE"`.

---

### 3.2 Módulo de Vídeos & Ingestão (`src/application/use-cases/videos/`)

#### 1. `GenerateUploadUrlUseCase`
- **Responsabilidade**: Criar registro de vídeo e gerar Presigned URL para upload direto do navegador no S3.
- **Portas Requeridas**: `IStorageGateway`, `IUploadedFileRepository`.
- **Regras de Negócio**:
  1. Valida extensão e contentType (`video/mp4`, `video/quicktime`).
  2. Gera `s3Key` estruturada: `uploads/${userId}/${uuid}/${filename}`.
  3. Cria registro em `UploadedFile` com `sourceType = "UPLOAD"` e `status = "queued"`.
  4. Gera presigned PUT URL via `IStorageGateway.createUploadPresignedUrl(s3Key, contentType)`.
  5. Retorna `{ uploadUrl, uploadedFileId, s3Key }`.

#### 2. `ImportYouTubeVideoUseCase`
- **Responsabilidade**: Validar link do YouTube, criar registro de vídeo e enfileirar para ingestão assíncrona.
- **Portas Requeridas**: `IUploadedFileRepository`, `IQueueGateway`.
- **Regras de Negócio**:
  1. Valida a URL utilizando a regra pura `isValidYouTubeUrl(url)`. Se inválida, lança `InvalidYouTubeUrlError`.
  2. Extrai o ID do vídeo via `extractYouTubeVideoId(url)`.
  3. Cria registro em `UploadedFile` com `sourceType = "YOUTUBE"`, `youtubeUrl = url` e `status = "queued"`.
  4. Dispara evento assíncrono para a fila (`IQueueGateway.sendProcessVideoEvent`).
  5. Retorna `{ success: true, uploadedFileId }`.

---

### 3.3 Módulo de Clipes & Studio (`src/application/use-cases/clips/`)

#### 1. `GetClipPlayUrlUseCase`
- **Responsabilidade**: Gerar URL presigned temporária de leitura para o player de vídeo.
- **Portas Requeridas**: `IClipRepository`, `IStorageGateway`.
- **Regras de Negócio**:
  1. Busca o clipe pelo `clipId`. Se não existir, lança `NotFoundError("Clipe não encontrado")`.
  2. Valida ownership (`clip.userId === userId`). Se não coincidir, lança `UnauthorizedError()`.
  3. Gera URL presigned GET via `IStorageGateway.createPlayPresignedUrl(clip.s3Key, 3600)`.
  4. Retorna `{ playUrl }`.

#### 2. `UpdateClipUseCase`
- **Responsabilidade**: Atualizar título, preset de legenda ou transcrição de um clipe.
- **Portas Requeridas**: `IClipRepository`.
- **Regras de Negócio**:
  1. Busca clipe e valida ownership (`clip.userId === userId`).
  2. Atualiza apenas os campos fornecidos (`title`, `subtitlePreset`, `transcriptWords`).

#### 3. `DeleteClipUseCase`
- **Responsabilidade**: Excluir clipe do banco de dados e apagar o objeto correspondente no bucket S3.
- **Portas Requeridas**: `IClipRepository`, `IStorageGateway`.
- **Regras de Negócio**:
  1. Busca clipe e valida ownership (`clip.userId === userId`).
  2. Remove o arquivo físico no S3 via `IStorageGateway.deleteObject(clip.s3Key)`.
  3. Remove o registro do banco de dados via `IClipRepository.delete(clipId)`.

---

## 4. Camada de Infraestrutura e Composition Root

### 4.1 Composition Root (`src/infrastructure/factories/use-case-factories.ts`)
Fornece funções fábrica para instanciar Casos de Uso com dependências de produção injetadas:

```ts
// Exemplo de factory centralizadora
export function makeHoldCreditsUseCase(): HoldCreditsUseCase {
  return new HoldCreditsUseCase(
    new PrismaUserRepository(),
    new PrismaUploadedFileRepository(),
    new PrismaCreditTransactionRepository(),
    new PrismaUnitOfWork()
  );
}

export function makeImportYouTubeVideoUseCase(): ImportYouTubeVideoUseCase {
  return new ImportYouTubeVideoUseCase(
    new PrismaUploadedFileRepository(),
    new InngestQueueGateway()
  );
}
```

---

## 5. Estratégia de Testes Automatizados (Vitest)

1. **Mocks em Memória (`tests/mocks/`)**:
   - `InMemoryUserRepository`, `InMemoryUploadedFileRepository`, `InMemoryClipRepository`, `InMemoryCreditTransactionRepository`, `InMemoryUnitOfWork`, `InMemoryStorageGateway`, `InMemoryQueueGateway`.
2. **Cobertura Unitária (100% dos Casos de Uso)**:
   - Caminhos felizes de execução com asserts de alteração de estado.
   - Cenários de erro de negócio (exceções `InsufficientCreditsError`, `UnauthorizedError`, `NotFoundError`, `InvalidYouTubeUrlError`).
3. **Tempo de Execução**: Suíte unitária completa roda em menos de 2 segundos sem dependências de containers ou serviços externos.
