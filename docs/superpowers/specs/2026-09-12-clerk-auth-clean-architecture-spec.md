# Especificação Técnica: Migração para Clerk Auth com Clean Architecture & SOLID

- **Data:** 12 de Setembro de 2026
- **Status:** Aprovado para Planejamento de Implementação
- **Autor:** Antigravity + Usuário
- **Escopo:** Substituição do subsistema de autenticação NextAuth v5 pelo Clerk com desacoplamento por portas de domínio (`IAuthGateway`), sincronização híbrida no PostgreSQL e suporte nativo a redefinição de senha e login social.

---

## 1. Visão Geral e Objetivos

O objetivo desta especificação é migrar o sistema de autenticação do SaaS **AI Podcast Clipper** do NextAuth v5 para o **Clerk**, resolvendo a ausência de fluxo de redefinição de senha e eliminando a complexidade de manter serviços de envio de e-mails transacionais (SMTP/Resend), hashes manuais de senhas com `bcryptjs` e tabelas de sessões no banco de dados.

### 1.1 Objetivos Principais
1. **Redefinição de Senha e Recuperação de Conta Nativas:** Automatizadas pelo Clerk com entrega de e-mails criptografados e telas dedicadas de redefinição.
2. **Login Social Instantâneo:** Suporte a login em 1 clique via Google e GitHub configuráveis diretamente no painel do Clerk.
3. **Respeito à Clean Architecture & SOLID:**
   - O domínio e as regras de aplicação **não conhecem** o SDK do Clerk diretamente.
   - Todo o acesso ao usuário logado é mediado pela interface `IAuthGateway`.
   - O provisionamento e sincronização de dados utilizam o caso de uso `SyncUserUseCase`.
4. **Sincronização Híbrida de Usuários no PostgreSQL:**
   - **Canal Primário:** Webhook oficial do Clerk (`/api/webhooks/clerk`) validado via `svix`.
   - **Canal Secundário (JIT Fallback):** Criação automática sob demanda no primeiro acesso ao `/dashboard` para garantir funcionamento imediato em ambiente de desenvolvimento local (`localhost:3000`) sem exigência de túnel ngrok.
5. **Paridade com o Modelo de Negócio:**
   - Todo novo usuário recebe automaticamente `10 créditos` gratuitos.
   - Todo novo usuário recebe um `stripeCustomerId` gerado via `IPaymentGateway`.

---

## 2. Arquitetura da Solução

```mermaid
flowchart TD
    subgraph Browser["Navegador do Usuário"]
        UI_Login["Página /login (Clerk SignIn)"]
        UI_Dash["Página /dashboard"]
        UI_Header["NavHeader (Clerk UserButton)"]
    end

    subgraph AuthEdge["Borda de Autenticação"]
        ClerkCloud["Clerk Identity Platform"]
        Middleware["Next.js Middleware (clerkMiddleware)"]
    end

    subgraph AppLayer["Camada de Aplicação & Domínio"]
        AuthGateway["Porta: IAuthGateway"]
        SyncUseCase["Caso de Uso: SyncUserUseCase"]
        Actions["Server Actions (youtube, s3, stripe, generation)"]
    end

    subgraph InfraLayer["Camada de Infraestrutura"]
        ClerkAdapter["ClerkAuthGateway (Adapter)"]
        WebhookRoute["Route Handler: /api/webhooks/clerk (Svix)"]
        PrismaUserRepo["PrismaUserRepository"]
        StripeAdapter["StripePaymentGateway"]
        Postgres[(PostgreSQL: User, Clips, Credits)]
    end

    UI_Login -->|Autenticação Segura| ClerkCloud
    ClerkCloud -->|Sessão JWT / Cookie| Middleware
    Middleware -->|Valida Rota /dashboard| UI_Dash

    ClerkCloud -.->|Webhook: user.created| WebhookRoute
    WebhookRoute -->|Executa| SyncUseCase

    UI_Dash -->|1º Acesso (JIT Fallback)| SyncUseCase
    Actions -->|Injeta| AuthGateway
    AuthGateway -.->|Implementa| ClerkAdapter
    ClerkAdapter -->|Lê Sessão| ClerkCloud

    SyncUseCase -->|Cria Cliente Stripe| StripeAdapter
    SyncUseCase -->|Salva 10 Créditos| PrismaUserRepo
    PrismaUserRepo --> Postgres
```

---

## 3. Especificação por Camada

### 3.1 Camada de Domínio (`src/domain/`)

#### 1. Porta `IAuthGateway` (`src/domain/ports/auth-gateway.ts`)
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

#### 2. Extensão de `IUserRepository` (`src/domain/ports/user-repository.ts`)
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

---

### 3.2 Camada de Aplicação (`src/application/`)

#### Caso de Uso: `SyncUserUseCase` (`src/application/use-cases/users/sync-user.use-case.ts`)
- **Entrada:** `{ clerkUserId: string; email: string; name?: string | null; image?: string | null }`
- **Fluxo:**
  1. Consulta `userRepository.findById(clerkUserId)`.
  2. Se o usuário já existe:
     - Executa atualização de dados cadastrais (`email`, `name`, `image`) caso tenham sido alterados.
     - Retorna o `UserEntity` existente.
  3. Se o usuário não existe:
     - Verifica se já existe cliente cadastrado com o e-mail informado (`findByEmail`).
     - Aciona `paymentGateway.createCustomer(email)` para gerar o `stripeCustomerId`.
     - Executa `userRepository.create(...)` com:
       - `id: clerkUserId`
       - `email: email`
       - `name: name`
       - `image: image`
       - `credits: 10` (saldo promocional inicial)
       - `reservedCredits: 0`
       - `stripeCustomerId: stripeCustomer.id`
  4. Retorna `UserEntity`.

---

### 3.3 Camada de Infraestrutura (`src/infrastructure/`)

#### 1. Implementação `ClerkAuthGateway` (`src/infrastructure/auth/clerk-auth.gateway.ts`)
- Consome `auth()` e `currentUser()` do pacote `@clerk/nextjs/server`.
- Implementa `requireUserId()` lançando `UnauthorizedError` do domínio se `userId` for nulo.

#### 2. Factory `makeAuthGateway` (`src/infrastructure/factories/auth-factory.ts`)
- Retorna uma instância de `ClerkAuthGateway`.

#### 3. Implementação no `PrismaUserRepository`
- Adiciona os métodos `create`, `update` e `findByEmail` mapeando diretamente para o Prisma Client.

#### 4. Webhook Handler Clerk (`src/app/api/webhooks/clerk/route.ts`)
- Valida o cabeçalho criptográfico (`svix-id`, `svix-timestamp`, `svix-signature`) utilizando `svix.Webhook(env.CLERK_WEBHOOK_SECRET)`.
- Dispara:
  - `user.created` / `user.updated`: instancia `makeSyncUserUseCase().execute(...)`.
  - `user.deleted`: remove o usuário no banco (com `onDelete: Cascade` existente nas relações).

---

### 3.4 Camada de Apresentação e Telas (`src/app/`, `src/components/`, `src/middleware.ts`)

#### 1. Middleware (`src/middleware.ts`)
- Utiliza `clerkMiddleware()` para proteger rotas:
  ```typescript
  import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

  const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

  export default clerkMiddleware(async (auth, req) => {
    if (isProtectedRoute(req)) await auth.protect();
  });
  ```

#### 2. Páginas de Autenticação
- `src/app/login/[[...login]]/page.tsx`:
  - Renderiza `<SignIn path="/login" routing="path" signUpUrl="/signup" />` com tema escuro nativo.
- `src/app/signup/[[...signup]]/page.tsx`:
  - Renderiza `<SignUp path="/signup" routing="path" signInUrl="/login" />`.
- As rotas suportam redefinição de senha e verificação de e-mail automaticamente dentro do componente.

#### 3. Header e Navegação (`src/components/nav-header.tsx`)
- Substitui o dropdown manual de avatar e o botão de logout pelo componente oficial `<UserButton afterSignOutUrl="/login" />`.
- Mantém o badge de exibição de créditos intacto.

#### 4. Server Actions
- Substitui `import { auth } from "~/server/auth"` por `makeAuthGateway().requireUserId()` em:
  - [`src/actions/youtube.ts`](file:///home/thuan/Documentos/projetos-empresa/ai-podcast-clipper-saas/ai-podcast-clipper-frontend/src/actions/youtube.ts)
  - [`src/actions/generation.ts`](file:///home/thuan/Documentos/projetos-empresa/ai-podcast-clipper-saas/ai-podcast-clipper-frontend/src/actions/generation.ts)
  - [`src/actions/stripe.ts`](file:///home/thuan/Documentos/projetos-empresa/ai-podcast-clipper-saas/ai-podcast-clipper-frontend/src/actions/stripe.ts)
  - [`src/actions/s3.ts`](file:///home/thuan/Documentos/projetos-empresa/ai-podcast-clipper-saas/ai-podcast-clipper-frontend/src/actions/s3.ts)

---

## 4. Modelagem de Dados (`prisma/schema.prisma`)

```prisma
model User {
    id               String              @id // Clerk User ID (user_...)
    name             String?
    email            String              @unique
    emailVerified    DateTime?
    password         String?             // Opcional para usuários autenticados via Clerk
    credits          Int                 @default(10)
    reservedCredits  Int                 @default(0)
    stripeCustomerId String?             @unique
    image            String?
    creditTransactions CreditTransaction[]

    uploadedFiles UploadedFile[]
    clips         Clip[]
}
```
*As tabelas legadas `Account`, `Session` e `VerificationToken` serão removidas do schema.*

---

## 5. Variáveis de Ambiente (`src/env.js` e `.env`)

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
CLERK_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/login"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/signup"
```

---

## 6. Plano de Testes e Validação

1. **Testes Unitários:**
   - `tests/unit/application/users/sync-user.use-case.test.ts`: Valida criação com 10 créditos, Stripe customer e atualização idempotente.
   - `tests/unit/infrastructure/auth/clerk-auth.gateway.test.ts`: Valida `getUserId`, `getCurrentUser` e erro tipado em `requireUserId`.
2. **Atualização dos Testes Unitários de Actions:**
   - Adaptar mocks das Server Actions para usar o mock de `IAuthGateway`.
3. **Verificação Global de Qualidade:**
   - `npm run check`: Zero erros de ESLint e TypeScript.
   - `npm run test:all`: 100% de aprovação na suíte (unitários e integração).
