# Migração para Clerk com Clean Architecture & SOLID - Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir completamente o NextAuth v5 pelo Clerk no frontend (`ai-podcast-clipper-frontend`), mantendo o isolamento arquitetural por meio da porta `IAuthGateway`, implementando sincronização híbrida com PostgreSQL/Stripe e ativando fluxos nativos de login social e redefinição de senha.

**Architecture:** A aplicação desacopla a autenticação através da interface de domínio `IAuthGateway`, implementada por `ClerkAuthGateway` na infraestrutura. A sincronização de usuários é orquestrada por `SyncUserUseCase` acionado tanto via Webhook oficial (`/api/webhooks/clerk` com Svix) quanto por JIT Fallback no primeiro acesso ao Dashboard.

**Tech Stack:** `@clerk/nextjs`, `svix`, Next.js 15 App Router, Prisma ORM, PostgreSQL, Stripe SDK, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-12-clerk-auth-clean-architecture-spec.md`

## Global Constraints
- Respeitar estritamente a Clean Architecture e SOLID: domínio e regras de negócio não importam `@clerk/nextjs`.
- O saldo inicial de 10 créditos e o cliente no Stripe devem ser preservados para cada novo usuário.
- NUNCA executar `git commit` ou `git push` sem a autorização explícita do usuário (`AGENTS.md`).
- Assegurar 0 erros de ESLint e TypeScript (`npm run check`) ao final da migração.

---

### Task 1: Gerenciamento de Dependências, Schema Prisma e Variáveis de Ambiente

**Files:**
- Modify: `ai-podcast-clipper-frontend/package.json`
- Modify: `ai-podcast-clipper-frontend/prisma/schema.prisma`
- Modify: `ai-podcast-clipper-frontend/src/env.js`
- Modify: `ai-podcast-clipper-frontend/.env`

**Interfaces:**
- Produces: `env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `env.CLERK_SECRET_KEY`, `env.CLERK_WEBHOOK_SECRET`
- Produces: Schema Prisma com `User.password` opcional e tabelas do NextAuth removidas

- [ ] **Step 1: Instalar dependências do Clerk e remover NextAuth**

Executar no diretório `ai-podcast-clipper-frontend`:
```bash
npm install @clerk/nextjs svix
npm uninstall next-auth @auth/prisma-adapter bcryptjs @types/bcryptjs
```

- [ ] **Step 2: Atualizar `prisma/schema.prisma`**

Remover os modelos `Account`, `Session`, `VerificationToken` e tornar `password` opcional no modelo `User`:
```prisma
model User {
    id               String              @id
    name             String?
    email            String              @unique
    emailVerified    DateTime?
    password         String?
    credits          Int                 @default(10)
    reservedCredits  Int                 @default(0)
    stripeCustomerId String?             @unique
    image            String?
    creditTransactions CreditTransaction[]

    uploadedFiles UploadedFile[]
    clips         Clip[]
}
```

- [ ] **Step 3: Aplicar migração no banco de dados e regenerar Prisma Client**

```bash
npx prisma generate
npx prisma db push --skip-generate
```

- [ ] **Step 4: Atualizar `src/env.js` e `.env`**

Adicionar validação Zod no `src/env.js`:
- `server`: `CLERK_SECRET_KEY: z.string().min(1)`, `CLERK_WEBHOOK_SECRET: z.string().optional()`
- `client`: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1)`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().default("/login")`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().default("/signup")`
- Remover `AUTH_SECRET`.
No `.env`, adicionar placeholders de teste se não existirem.

---

### Task 2: Portas de Domínio e Extensão do `PrismaUserRepository`

**Files:**
- Create: `ai-podcast-clipper-frontend/src/domain/ports/auth-gateway.ts`
- Modify: `ai-podcast-clipper-frontend/src/domain/ports/user-repository.ts`
- Modify: `ai-podcast-clipper-frontend/src/infrastructure/database/repositories/prisma-user.repository.ts`

**Interfaces:**
- Produces: `export interface IAuthGateway` (`getUserId`, `getCurrentUser`, `requireUserId`)
- Produces: `IUserRepository.create(data)`, `IUserRepository.update(userId, data)`, `IUserRepository.findByEmail(email)`

- [ ] **Step 1: Criar a porta `IAuthGateway` em `src/domain/ports/auth-gateway.ts`**

```typescript
export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  imageUrl?: string | null;
}

export interface IAuthGateway {
  getUserId(): Promise<string | null>;
  getCurrentUser(): Promise<AuthUser | null>;
  requireUserId(): Promise<string>;
}
```

- [ ] **Step 2: Estender `IUserRepository` em `src/domain/ports/user-repository.ts`**

Adicionar as assinaturas:
```typescript
export interface CreateUserData {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  stripeCustomerId?: string | null;
  credits?: number;
}

export interface UpdateUserData {
  email?: string;
  name?: string | null;
  image?: string | null;
  stripeCustomerId?: string | null;
}

export interface IUserRepository {
  findById(id: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  findByStripeCustomerId(stripeCustomerId: string): Promise<UserEntity | null>;
  create(data: CreateUserData): Promise<UserEntity>;
  update(userId: string, data: UpdateUserData): Promise<UserEntity>;
  updateCredits(userId: string, data: CreditsUpdateInput): Promise<UserEntity>;
}
```

- [ ] **Step 3: Implementar métodos no `PrismaUserRepository`**

Implementar `create`, `update` e `findByEmail` conectando com `db.user`.

---

### Task 3: Caso de Uso `SyncUserUseCase` com TDD

**Files:**
- Create: `ai-podcast-clipper-frontend/src/application/dtos/user-dtos.ts`
- Create: `ai-podcast-clipper-frontend/src/application/use-cases/users/sync-user.use-case.ts`
- Create: `ai-podcast-clipper-frontend/src/infrastructure/factories/user-factory.ts`
- Test: `ai-podcast-clipper-frontend/tests/unit/application/users/sync-user.use-case.test.ts`

**Interfaces:**
- Consumes: `IUserRepository`, `IPaymentGateway`
- Produces: `SyncUserUseCase.execute(input: SyncUserInput): Promise<UserEntity>`
- Produces: `makeSyncUserUseCase(): SyncUserUseCase`

- [ ] **Step 1: Escrever teste unitário com falha para `SyncUserUseCase`**

Criar `tests/unit/application/users/sync-user.use-case.test.ts` cobrindo:
1. Criação de novo usuário com 10 créditos e novo Stripe Customer.
2. Atualização idempotente quando o usuário já existe.
3. Não duplicação de customer no Stripe se já cadastrado.

- [ ] **Step 2: Executar teste para verificar a falha esperada**

```bash
npx vitest run tests/unit/application/users/sync-user.use-case.test.ts
```

- [ ] **Step 3: Implementar `SyncUserUseCase` em `src/application/use-cases/users/sync-user.use-case.ts`**

Implementar a regra de negócio completa e instanciá-la em `src/infrastructure/factories/user-factory.ts`.

- [ ] **Step 4: Executar teste novamente e verificar aprovação**

```bash
npx vitest run tests/unit/application/users/sync-user.use-case.test.ts
```

---

### Task 4: Implementação do `ClerkAuthGateway` e Teste Unitário

**Files:**
- Create: `ai-podcast-clipper-frontend/src/infrastructure/auth/clerk-auth.gateway.ts`
- Create: `ai-podcast-clipper-frontend/src/infrastructure/factories/auth-factory.ts`
- Test: `ai-podcast-clipper-frontend/tests/unit/infrastructure/auth/clerk-auth.gateway.test.ts`

**Interfaces:**
- Consumes: `@clerk/nextjs/server` (`auth`, `currentUser`)
- Produces: `ClerkAuthGateway implements IAuthGateway`
- Produces: `makeAuthGateway(): IAuthGateway`

- [ ] **Step 1: Escrever teste unitário para `ClerkAuthGateway`**

Criar `tests/unit/infrastructure/auth/clerk-auth.gateway.test.ts` mockando `@clerk/nextjs/server` e validando:
1. `getUserId()` retorna o ID da sessão ativa ou null.
2. `requireUserId()` lança `UnauthorizedError` caso deslogado.
3. `getCurrentUser()` mapeia corretamente o primaryEmailAddress.

- [ ] **Step 2: Implementar `ClerkAuthGateway` em `src/infrastructure/auth/clerk-auth.gateway.ts`**

- [ ] **Step 3: Criar `src/infrastructure/factories/auth-factory.ts`**

Exportar `makeAuthGateway(): IAuthGateway`.

- [ ] **Step 4: Executar teste unitário e verificar aprovação**

```bash
npx vitest run tests/unit/infrastructure/auth/clerk-auth.gateway.test.ts
```

---

### Task 5: Webhook do Clerk com Validação Svix

**Files:**
- Create: `ai-podcast-clipper-frontend/src/app/api/webhooks/clerk/route.ts`
- Test: `ai-podcast-clipper-frontend/tests/unit/api/clerk-webhook.test.ts`

**Interfaces:**
- Consumes: `svix.Webhook`, `makeSyncUserUseCase()`, `db.user.delete`
- Produces: Endpoint `POST /api/webhooks/clerk`

- [ ] **Step 1: Escrever teste unitário para a rota de webhook do Clerk**

Testar validação de assinatura Svix e chamada de `SyncUserUseCase` para `user.created` e exclusão para `user.deleted`.

- [ ] **Step 2: Implementar `src/app/api/webhooks/clerk/route.ts`**

Validar cabeçalhos `svix-id`, `svix-timestamp`, `svix-signature` contra `env.CLERK_WEBHOOK_SECRET`.

- [ ] **Step 3: Executar testes de webhook**

```bash
npx vitest run tests/unit/api/clerk-webhook.test.ts
```

---

### Task 6: Middleware, Layout, Header e Páginas de Login/Signup

**Files:**
- Create: `ai-podcast-clipper-frontend/src/middleware.ts`
- Modify: `ai-podcast-clipper-frontend/src/app/layout.tsx`
- Modify: `ai-podcast-clipper-frontend/src/app/dashboard/layout.tsx`
- Modify: `ai-podcast-clipper-frontend/src/components/nav-header.tsx`
- Create: `ai-podcast-clipper-frontend/src/app/login/[[...login]]/page.tsx`
- Create: `ai-podcast-clipper-frontend/src/app/signup/[[...signup]]/page.tsx`
- Delete: `src/server/auth/`, `src/app/api/auth/[...nextauth]`, `src/lib/auth.ts`, `src/actions/auth.ts`, `src/components/login-form.tsx`, `src/components/signup-form.tsx`, `src/schemas/auth.ts`

- [ ] **Step 1: Criar `src/middleware.ts` com `clerkMiddleware()`**

Proteger `/dashboard(.*)`.

- [ ] **Step 2: Configurar `src/app/layout.tsx` com `<ClerkProvider>`**

- [ ] **Step 3: Atualizar `src/app/dashboard/layout.tsx`**

Usar `makeAuthGateway().requireUserId()` e acionar `makeSyncUserUseCase().execute(...)` como fallback JIT caso o usuário não conste ainda na base local.

- [ ] **Step 4: Criar páginas `/login` e `/signup` com componentes Clerk**

Substituir formulários legados por `<SignIn path="/login" />` e `<SignUp path="/signup" />`.

- [ ] **Step 5: Atualizar `src/components/nav-header.tsx` com `<UserButton />`**

Substituir avatar estático e menu manual de logout pelo `<UserButton />`.

- [ ] **Step 6: Deletar código legado do NextAuth**

Remover diretórios e arquivos de autenticação legados.

---

### Task 7: Desacoplamento das Server Actions e Verificação Completa

**Files:**
- Modify: `ai-podcast-clipper-frontend/src/actions/youtube.ts`
- Modify: `ai-podcast-clipper-frontend/src/actions/generation.ts`
- Modify: `ai-podcast-clipper-frontend/src/actions/stripe.ts`
- Modify: `ai-podcast-clipper-frontend/src/actions/s3.ts`
- Modify: `ai-podcast-clipper-frontend/tests/unit/youtube-action.test.ts`
- Modify: `ai-podcast-clipper-frontend/tests/unit/generation-action.test.ts`
- Modify: `ai-podcast-clipper-frontend/tests/setup.ts`

- [ ] **Step 1: Atualizar Server Actions para consumir `makeAuthGateway().requireUserId()`**

Substituir o antigo `import { auth } from "~/server/auth"`.

- [ ] **Step 2: Atualizar mocks de testes unitários das Server Actions**

- [ ] **Step 3: Executar verificação estática (`npm run check`)**

Garantir 0 erros de lint e 0 erros de TypeScript:
```bash
npm run check
```

- [ ] **Step 4: Executar todos os testes (`npm run test:all`)**

Garantir que todos os testes unitários e de integração passem com 100% de sucesso:
```bash
npm run test:all
```
