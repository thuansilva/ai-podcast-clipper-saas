# Landing Page de Vendas & Login Minimalista (Dark Precision Studio) - Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a landing page de vendas na raiz (`/`) e redesenhar as telas de autenticação (`/login` e `/signup`) com design minimalista autêntico ("Dark Precision Studio"), fugindo de clichês visuais de IA e conectando aos fluxos existentes do Clerk, Stripe e Dashboard.

**Architecture:** A aplicação organiza a camada visual pública em componentes modulares em `src/components/landing/` (Header, Hero, ProductPreview, Comparison, Pricing, FAQ, Footer) e `src/components/auth/` (AuthSplitLayout). O tema do Clerk é padronizado em `src/lib/clerk-appearance.ts`. A raiz `/` atua como Server Component com verificação de sessão (`auth()`) para alternar CTAs dinamicamente sem forçar redirecionamento.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS, `@clerk/nextjs`, `lucide-react`, Vitest, `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-09-13-landing-page-and-login-design.md`

## Global Constraints
- Design "Dark Precision Studio" (Anti-IA): fundo fosco `zinc-950` (#09090b), bordas `zinc-800`, ausência total de gradientes fluorescentes roxos/azuis neon ou orbes `blur-3xl`.
- Microcopy e textos em Português do Brasil (pt-BR) com foco em ROI de tempo e produtividade real.
- Paridade com pacotes de créditos já existentes no backend: Small ($9.99 / 50 créditos), Medium ($24.99 / 150 créditos) e Large ($69.99 / 500 créditos).
- NUNCA executar `git commit`, `git push` ou criar tags sem autorização explícita do usuário (`AGENTS.md`).
- Manter 0 erros de lint e TypeScript (`npm run check`) e 100% de testes passando (`npm run test:all`).

---

### Task 1: Tema de Autenticação do Clerk e Layout Split-Screen Studio

**Files:**
- Create: `ai-podcast-clipper-frontend/src/lib/clerk-appearance.ts`
- Create: `ai-podcast-clipper-frontend/src/components/auth/auth-split-layout.tsx`
- Test: `ai-podcast-clipper-frontend/tests/unit/auth-split-layout.test.tsx`

**Interfaces:**
- Produces: `studioClerkAppearance` (objeto de estilização nativo para `<SignIn />` e `<SignUp />`)
- Produces: `AuthSplitLayout({ children, title, subtitle }: { children: React.ReactNode; title?: string; subtitle?: string })`

- [ ] **Step 1: Escrever o teste unitário para `AuthSplitLayout`**

Criar `tests/unit/auth-split-layout.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthSplitLayout } from "~/components/auth/auth-split-layout";

describe("AuthSplitLayout", () => {
  it("renders branding, back link and child form correctly", () => {
    render(
      <AuthSplitLayout title="Acesse o Estúdio" subtitle="Entre com suas credenciais">
        <div data-testid="auth-form">Formulário Clerk</div>
      </AuthSplitLayout>
    );

    expect(screen.getByText("Podcast Clipper")).toBeInTheDocument();
    expect(screen.getByText("STUDIO")).toBeInTheDocument();
    expect(screen.getByText("Acesse o Estúdio")).toBeInTheDocument();
    expect(screen.getByText("Entre com suas credenciais")).toBeInTheDocument();
    expect(screen.getByTestId("auth-form")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /voltar ao site/i })).toHaveAttribute("href", "/");
  });

  it("displays studio proof indicators and metrics", () => {
    render(
      <AuthSplitLayout>
        <div>Form</div>
      </AuthSplitLayout>
    );

    expect(screen.getByText(/REC/i)).toBeInTheDocument();
    expect(screen.getByText(/Score Viral: 94\/100/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Executar o teste e verificar a falha inicial**

Executar:
```bash
npm run test tests/unit/auth-split-layout.test.tsx
```
Esperado: FAIL (módulo não encontrado).

- [ ] **Step 3: Implementar `src/lib/clerk-appearance.ts`**

Criar `src/lib/clerk-appearance.ts`:
```ts
export const studioClerkAppearance = {
  variables: {
    colorPrimary: "#f4f4f5",
    colorTextOnPrimaryBackground: "#09090b",
    colorBackground: "#09090b",
    colorInputBackground: "#18181b",
    colorInputText: "#f4f4f5",
    colorText: "#f4f4f5",
    colorTextSecondary: "#a1a1aa",
    colorNeutral: "#ffffff",
    colorBorder: "#27272a",
    borderRadius: "0.5rem",
    fontFamily: "var(--font-geist-sans), sans-serif",
  },
  elements: {
    card: "bg-zinc-950 border border-zinc-800 shadow-2xl rounded-xl p-6 sm:p-8",
    headerTitle: "text-zinc-100 font-semibold tracking-tight text-xl",
    headerSubtitle: "text-zinc-400 text-sm",
    socialButtonsBlockButton:
      "bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 text-zinc-200 transition-colors py-2.5",
    socialButtonsBlockButtonText: "text-zinc-200 font-medium text-sm",
    formButtonPrimary:
      "bg-zinc-100 text-zinc-950 hover:bg-zinc-200 font-medium transition-colors shadow-none py-2.5",
    formFieldLabel: "text-zinc-300 text-xs font-medium uppercase tracking-wider mb-1.5",
    formFieldInput:
      "bg-zinc-900 border-zinc-800 focus:border-zinc-500 text-zinc-100 placeholder:text-zinc-600 transition-colors py-2 px-3 rounded-md",
    footerActionLink: "text-zinc-300 hover:text-white underline-offset-4 text-xs",
    footer: "bg-transparent border-t border-zinc-800/60 pt-4",
    dividerLine: "bg-zinc-800",
    dividerText: "text-zinc-500 text-[11px] uppercase tracking-wider",
  },
};
```

- [ ] **Step 4: Implementar `src/components/auth/auth-split-layout.tsx`**

Criar `src/components/auth/auth-split-layout.tsx`:
```tsx
import Link from "next/link";
import { ArrowLeftIcon, SparklesIcon, ShieldCheckIcon } from "lucide-react";

interface AuthSplitLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export function AuthSplitLayout({
  children,
  title = "Painel de Produção",
  subtitle = "Crie cortes verticais em escala a partir de episódios de podcasts.",
}: AuthSplitLayoutProps) {
  return (
    <div className="flex min-h-screen w-full bg-zinc-950 text-zinc-100">
      {/* Coluna Esquerda: Showcase Editorial Studio (Desktop) */}
      <div className="relative hidden w-1/2 flex-col justify-between border-r border-zinc-800/70 bg-zinc-950 p-10 lg:flex">
        {/* Header do Lado Esquerdo */}
        <div className="flex items-center justify-between">
          <Link href="/" className="group flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
              <SparklesIcon className="h-4 w-4 text-zinc-200" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold tracking-tight text-zinc-100">Podcast Clipper</span>
              <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                STUDIO
              </span>
            </div>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            Voltar ao site
          </Link>
        </div>

        {/* Centro: Mockup Visual Minimalista e Destaque */}
        <div className="my-auto max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 font-mono text-xs text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            REC • ENGINE DE CORTE AUTOMÁTICO
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">{title}</h1>
            <p className="text-sm leading-relaxed text-zinc-400">{subtitle}</p>
          </div>

          {/* Card Mockup de Corte 9:16 */}
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-zinc-300">Episódio #42 - Viral Hook</span>
                <span className="rounded bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.2 font-mono text-[10px] text-emerald-400">
                  Score Viral: 94/100
                </span>
              </div>
              <span className="font-mono text-[11px] text-zinc-500">00:14:22 → 00:15:08</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
              <span>Detecção facial ativa (9:16)</span>
              <span className="font-mono text-zinc-500">60 FPS • 1080p</span>
            </div>
          </div>
        </div>

        {/* Rodapé do Lado Esquerdo */}
        <div className="flex items-center gap-2 font-mono text-xs text-zinc-500">
          <ShieldCheckIcon className="h-4 w-4 text-zinc-400" />
          <span>Processamento em nuvem isolada e pagamentos protegidos por Stripe.</span>
        </div>
      </div>

      {/* Coluna Direita: Formulário de Autenticação */}
      <div className="flex w-full flex-col justify-center px-4 py-12 sm:px-8 lg:w-1/2 lg:px-16">
        <div className="mx-auto flex w-full max-w-md flex-col items-center">
          {/* Header Mobile */}
          <div className="mb-6 flex w-full items-center justify-between lg:hidden">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-100">Podcast Clipper</span>
              <span className="rounded border border-zinc-800 bg-zinc-900 px-1 py-0.5 font-mono text-[9px] text-zinc-400">
                STUDIO
              </span>
            </Link>
            <Link href="/" className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200">
              <ArrowLeftIcon className="h-3 w-3" />
              Início
            </Link>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Rodar testes e verificar aprovação**

Executar:
```bash
npm run test tests/unit/auth-split-layout.test.tsx
```
Esperado: PASS (2/2 testes passando).

---

### Task 2: Redesenho das Páginas de Login e Cadastro com AuthSplitLayout

**Files:**
- Modify: `ai-podcast-clipper-frontend/src/app/login/[[...login]]/page.tsx`
- Modify: `ai-podcast-clipper-frontend/src/app/signup/[[...signup]]/page.tsx`
- Test: `ai-podcast-clipper-frontend/tests/unit/auth-pages.test.tsx`

**Interfaces:**
- Consumes: `AuthSplitLayout` from `~/components/auth/auth-split-layout`
- Consumes: `studioClerkAppearance` from `~/lib/clerk-appearance`
- Produces: Páginas `/login` e `/signup` com Clerk estilizado

- [ ] **Step 1: Escrever teste unitário para `/login` e `/signup`**

Criar `tests/unit/auth-pages.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginPage from "~/app/login/[[...login]]/page";
import SignUpPage from "~/app/signup/[[...signup]]/page";

vi.mock("@clerk/nextjs", () => ({
  SignIn: vi.fn(({ path, signUpUrl }) => (
    <div data-testid="clerk-signin" data-path={path} data-signup={signUpUrl}>
      Mock SignIn Component
    </div>
  )),
  SignUp: vi.fn(({ path, signInUrl }) => (
    <div data-testid="clerk-signup" data-path={path} data-signin={signInUrl}>
      Mock SignUp Component
    </div>
  )),
}));

describe("Auth Pages", () => {
  it("renders LoginPage within AuthSplitLayout with Clerk SignIn", () => {
    render(<LoginPage />);
    expect(screen.getByTestId("clerk-signin")).toBeInTheDocument();
    expect(screen.getByText("Podcast Clipper")).toBeInTheDocument();
  });

  it("renders SignUpPage within AuthSplitLayout with Clerk SignUp", () => {
    render(<SignUpPage />);
    expect(screen.getByTestId("clerk-signup")).toBeInTheDocument();
    expect(screen.getByText("Podcast Clipper")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Executar o teste e verificar falha**

Executar:
```bash
npm run test tests/unit/auth-pages.test.tsx
```
Esperado: FAIL (ainda não usam `AuthSplitLayout`).

- [ ] **Step 3: Atualizar `src/app/login/[[...login]]/page.tsx`**

```tsx
import { SignIn } from "@clerk/nextjs";
import { AuthSplitLayout } from "~/components/auth/auth-split-layout";
import { studioClerkAppearance } from "~/lib/clerk-appearance";

export default function LoginPage() {
  return (
    <AuthSplitLayout
      title="Bem-vindo de volta ao estúdio"
      subtitle="Entre na sua conta para continuar gerenciando e exportando seus cortes virais."
    >
      <SignIn
        path="/login"
        routing="path"
        signUpUrl="/signup"
        fallbackRedirectUrl="/dashboard"
        appearance={studioClerkAppearance}
      />
    </AuthSplitLayout>
  );
}
```

- [ ] **Step 4: Atualizar `src/app/signup/[[...signup]]/page.tsx`**

```tsx
import { SignUp } from "@clerk/nextjs";
import { AuthSplitLayout } from "~/components/auth/auth-split-layout";
import { studioClerkAppearance } from "~/lib/clerk-appearance";

export default function SignUpPage() {
  return (
    <AuthSplitLayout
      title="Crie sua conta no estúdio"
      subtitle="Comece com 10 créditos gratuitos para processar e extrair seus primeiros cortes virais."
    >
      <SignUp
        path="/signup"
        routing="path"
        signInUrl="/login"
        fallbackRedirectUrl="/dashboard"
        appearance={studioClerkAppearance}
      />
    </AuthSplitLayout>
  );
}
```

- [ ] **Step 5: Executar os testes unitários**

Executar:
```bash
npm run test tests/unit/auth-pages.test.tsx
```
Esperado: PASS (2/2 testes passando).

---

### Task 3: Componentes de Topo da Landing Page (Header, Hero & Product Preview)

**Files:**
- Create: `ai-podcast-clipper-frontend/src/components/landing/header.tsx`
- Create: `ai-podcast-clipper-frontend/src/components/landing/hero-section.tsx`
- Create: `ai-podcast-clipper-frontend/src/components/landing/product-preview.tsx`
- Test: `ai-podcast-clipper-frontend/tests/unit/landing-hero.test.tsx`

**Interfaces:**
- Produces: `Header({ isAuthenticated }: { isAuthenticated: boolean })`
- Produces: `HeroSection({ isAuthenticated }: { isAuthenticated: boolean })`
- Produces: `ProductPreview()`

- [ ] **Step 1: Escrever o teste unitário para Header, Hero e Product Preview**

Criar `tests/unit/landing-hero.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Header } from "~/components/landing/header";
import { HeroSection } from "~/components/landing/hero-section";
import { ProductPreview } from "~/components/landing/product-preview";

describe("Landing Top Components", () => {
  it("renders Header with login/signup when unauthenticated", () => {
    render(<Header isAuthenticated={false} />);
    expect(screen.getByRole("link", { name: /entrar/i })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: /começar agora/i })).toHaveAttribute("href", "/signup");
  });

  it("renders Header with dashboard link when authenticated", () => {
    render(<Header isAuthenticated={true} />);
    expect(screen.getByRole("link", { name: /acessar painel/i })).toHaveAttribute("href", "/dashboard");
  });

  it("renders HeroSection with impactful headline and CTAs", () => {
    render(<HeroSection isAuthenticated={false} />);
    expect(screen.getByText(/De podcasts longos a cortes virais/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /criar meus primeiros cortes/i })).toHaveAttribute("href", "/signup");
  });

  it("renders ProductPreview with 9:16 mockup and metrics", () => {
    render(<ProductPreview />);
    expect(screen.getByText(/Score Viral: 94\/100/i)).toBeInTheDocument();
    expect(screen.getByText(/00:14:22 → 00:15:08/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Executar o teste e verificar falha**

Executar:
```bash
npm run test tests/unit/landing-hero.test.tsx
```
Esperado: FAIL (módulos não encontrados).

- [ ] **Step 3: Implementar `src/components/landing/header.tsx`**

```tsx
import Link from "next/link";
import { SparklesIcon, ArrowRightIcon } from "lucide-react";

export function Header({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800/60 bg-zinc-950/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
            <SparklesIcon className="h-4 w-4 text-zinc-200" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight text-zinc-100">Podcast Clipper</span>
            <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
              STUDIO
            </span>
          </div>
        </Link>

        {/* Links de Navegação */}
        <nav className="hidden items-center gap-6 text-sm text-zinc-400 md:flex">
          <Link href="#demonstracao" className="transition-colors hover:text-zinc-100">
            Demonstração
          </Link>
          <Link href="#comparativo" className="transition-colors hover:text-zinc-100">
            Comparativo
          </Link>
          <Link href="#precos" className="transition-colors hover:text-zinc-100">
            Preços
          </Link>
          <Link href="#faq" className="transition-colors hover:text-zinc-100">
            FAQ
          </Link>
        </nav>

        {/* Ações */}
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-100 px-4 py-2 text-xs font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              Acessar Painel
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-xs font-medium text-zinc-300 transition-colors hover:text-white"
              >
                Entrar
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3.5 py-2 text-xs font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
              >
                Começar Agora
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Implementar `src/components/landing/hero-section.tsx`**

```tsx
import Link from "next/link";
import { ArrowRightIcon, ChevronDownIcon, PlayIcon } from "lucide-react";

export function HeroSection({ isAuthenticated }: { isAuthenticated: boolean }) {
  const primaryHref = isAuthenticated ? "/dashboard" : "/signup";
  const primaryText = isAuthenticated ? "Ir para o Painel de Vídeos →" : "Criar Meus Primeiros Cortes →";

  return (
    <section className="relative overflow-hidden pt-20 pb-16 md:pt-28 md:pb-24">
      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
        {/* Badge de Estúdio */}
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 font-mono text-xs text-zinc-400">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          REC • REENQUADRAMENTO FACIAL EM 9:16 & LEGENDAS AUTOMÁTICAS
        </div>

        {/* Título Principal */}
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-zinc-100 sm:text-5xl md:text-6xl md:leading-[1.15]">
          De podcasts longos a cortes virais. <br className="hidden sm:inline" />
          <span className="text-zinc-400">Em 3 minutos, sem abrir o Premiere.</span>
        </h1>

        {/* Subtítulo focado em valor real */}
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
          Cole a URL do seu episódio do YouTube. Nossa engine detecta os momentos de maior retenção, reenquadra
          automaticamente os participantes para formato vertical e gera legendas dinâmicas sincronizadas prontas para TikTok,
          Reels e Shorts.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Link
            href={primaryHref}
            className="w-full rounded-lg bg-zinc-100 px-6 py-3.5 text-sm font-medium text-zinc-950 shadow-sm transition-colors hover:bg-zinc-200 sm:w-auto"
          >
            {primaryText}
          </Link>
          <a
            href="#demonstracao"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-5 py-3.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 sm:w-auto"
          >
            <PlayIcon className="h-4 w-4 text-zinc-400" />
            Ver Exemplo de Corte
            <ChevronDownIcon className="h-4 w-4 text-zinc-500" />
          </a>
        </div>

        {/* Prova de Garantia */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-6 font-mono text-xs text-zinc-500">
          <span>✓ 10 créditos grátis ao cadastrar</span>
          <span>•</span>
          <span>✓ Sem cartão de crédito obrigatório</span>
          <span>•</span>
          <span>✓ Exportação em 1080p a 60 FPS</span>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Implementar `src/components/landing/product-preview.tsx`**

```tsx
import { PlayIcon, CheckCircle2Icon } from "lucide-react";

export function ProductPreview() {
  return (
    <section id="demonstracao" className="py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center">
          <span className="font-mono text-xs tracking-wider text-zinc-400 uppercase">Demonstração Real</span>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
            Como a transformação acontece na prática
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Detecção inteligente de quem está falando com reenquadramento cirúrgico de 16:9 para 9:16.
          </p>
        </div>

        {/* Frame de Demonstração */}
        <div className="mt-10 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4 backdrop-blur-sm sm:p-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            {/* Lado Esquerdo: Vídeo Horizontal Original + Detecção */}
            <div className="space-y-4 lg:col-span-6">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                <span className="font-mono text-xs text-zinc-400">VÍDEO FONTE (YOUTUBE 16:9)</span>
                <span className="font-mono text-xs text-zinc-500">01:14:30 TOTAL</span>
              </div>

              {/* Simulação do Player Horizontal Original */}
              <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/50">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800/80">
                    <PlayIcon className="h-5 w-5 text-zinc-300 ml-0.5" />
                  </div>
                  <span className="mt-3 font-mono text-xs text-zinc-400">Episódio #42 - Estratégias de Escala</span>
                </div>

                {/* Caixa delimitadora de detecção do orador */}
                <div className="absolute top-1/4 left-1/4 h-1/2 w-1/4 rounded border border-amber-500/80 bg-amber-500/10">
                  <span className="absolute -top-5 left-0 rounded bg-amber-500 px-1 font-mono text-[9px] font-bold text-zinc-950">
                    ORADOR ATIVO
                  </span>
                </div>
              </div>

              {/* Timeline de Análise de Picos */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-1.5">
                <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                  <span>Segmento identificado pelo algoritmo:</span>
                  <span className="text-zinc-200">00:14:22 → 00:15:08</span>
                </div>
                <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-zinc-300 w-3/4 ml-[15%]" />
                </div>
                <p className="text-[11px] text-zinc-500">Gatilho detectado: Alta intensidade vocal e retenção sem pausas mortas.</p>
              </div>
            </div>

            {/* Lado Direito: O Corte Vertical Final (9:16) */}
            <div className="flex flex-col items-center lg:col-span-6">
              <div className="w-full max-w-[280px] space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                  <span className="font-mono text-xs text-zinc-400">CORTE FINAL (VERTICAL 9:16)</span>
                  <span className="rounded bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                    Score Viral: 94/100
                  </span>
                </div>

                {/* Visual do Smartphone 9:16 */}
                <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border-2 border-zinc-800 bg-zinc-950 shadow-2xl">
                  {/* Simulação da cena do corte vertical */}
                  <div className="absolute inset-0 flex flex-col justify-between p-4">
                    {/* Topo do corte */}
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-zinc-300 backdrop-blur-sm">
                        00:46s
                      </span>
                      <span className="font-mono text-[10px] text-red-400 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> REC
                      </span>
                    </div>

                    {/* Legenda Dinâmica no Centro/Inferior */}
                    <div className="my-auto text-center px-2">
                      <p className="text-sm font-extrabold uppercase tracking-wide text-zinc-100 drop-shadow-md">
                        O maior segredo <br />
                        <span className="bg-amber-400 text-zinc-950 px-1 py-0.5 rounded">NUNCA</span> é revelado!
                      </p>
                    </div>

                    {/* Rodapé do corte */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                        <CheckCircle2Icon className="h-3 w-3" />
                        Pronto para TikTok & Reels
                      </div>
                      <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-zinc-100 w-2/3" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Executar os testes unitários**

Executar:
```bash
npm run test tests/unit/landing-hero.test.tsx
```
Esperado: PASS (4/4 testes passando).

---

### Task 4: Componentes de Conversão e Suporte (Comparison, Pricing, FAQ & Footer)

**Files:**
- Create: `ai-podcast-clipper-frontend/src/components/landing/comparison-section.tsx`
- Create: `ai-podcast-clipper-frontend/src/components/landing/pricing-section.tsx`
- Create: `ai-podcast-clipper-frontend/src/components/landing/faq-section.tsx`
- Create: `ai-podcast-clipper-frontend/src/components/landing/footer.tsx`
- Test: `ai-podcast-clipper-frontend/tests/unit/landing-conversion.test.tsx`

**Interfaces:**
- Produces: `ComparisonSection()`
- Produces: `PricingSection({ isAuthenticated }: { isAuthenticated: boolean })`
- Produces: `FAQSection()`
- Produces: `Footer()`

- [ ] **Step 1: Escrever teste unitário para os componentes de conversão**

Criar `tests/unit/landing-conversion.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComparisonSection } from "~/components/landing/comparison-section";
import { PricingSection } from "~/components/landing/pricing-section";
import { FAQSection } from "~/components/landing/faq-section";
import { Footer } from "~/components/landing/footer";

describe("Landing Conversion Components", () => {
  it("renders ComparisonSection with manual vs clipper comparison", () => {
    render(<ComparisonSection />);
    expect(screen.getByText(/Edição Manual Tradicional/i)).toBeInTheDocument();
    expect(screen.getByText(/Com o Podcast Clipper/i)).toBeInTheDocument();
  });

  it("renders PricingSection with 3 packages and correct pricing", () => {
    render(<PricingSection isAuthenticated={false} />);
    expect(screen.getByText("$9.99")).toBeInTheDocument();
    expect(screen.getByText("$24.99")).toBeInTheDocument();
    expect(screen.getByText("$69.99")).toBeInTheDocument();
    expect(screen.getByText(/Créditos nunca expiram/i)).toBeInTheDocument();
  });

  it("renders FAQSection with answers to common creator questions", () => {
    render(<FAQSection />);
    expect(screen.getByText(/Como funcionam os créditos\?/i)).toBeInTheDocument();
    expect(screen.getByText(/Os créditos expiram se eu não usar este mês\?/i)).toBeInTheDocument();
  });

  it("renders Footer with copyright and status info", () => {
    render(<Footer />);
    expect(screen.getByText(/Podcast Clipper Studio/i)).toBeInTheDocument();
    expect(screen.getByText(/Todos os sistemas operacionais/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Executar o teste e verificar falha**

Executar:
```bash
npm run test tests/unit/landing-conversion.test.tsx
```
Esperado: FAIL (módulos não encontrados).

- [ ] **Step 3: Implementar `src/components/landing/comparison-section.tsx`**

```tsx
import { CheckIcon, XIcon } from "lucide-react";

export function ComparisonSection() {
  const comparisons = [
    {
      metric: "Tempo por Episódio",
      manual: "3 a 5 horas caçando timecodes e cortando",
      clipper: "Menos de 3 minutos automatizados",
    },
    {
      metric: "Custo Médio por Corte",
      manual: "R$ 50 a R$ 150 com editor freelancer",
      clipper: "Menos de R$ 1,00 por corte finalizado",
    },
    {
      metric: "Reenquadramento 9:16",
      manual: "Keyframes manuais para cada orador",
      clipper: "Detecção facial e troca de câmera automática",
    },
    {
      metric: "Legendas Dinâmicas",
      manual: "Digitação manual e ajuste de sync",
      clipper: "Transcrição precisa em português sincronizada",
    },
    {
      metric: "Frequência de Postagem",
      manual: "2 a 3 cortes por semana com esforço",
      clipper: "10 a 20 cortes semanais sem sobrecarga",
    },
  ];

  return (
    <section id="comparativo" className="border-t border-zinc-800/60 py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center">
          <span className="font-mono text-xs tracking-wider text-zinc-400 uppercase">Eficiência & ROI</span>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
            Edição Manual vs. Podcast Clipper
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Pare de perder dias na timeline do editor. Publique com consistência sem aumentar seu custo.
          </p>
        </div>

        <div className="mt-12 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
          <div className="grid grid-cols-1 md:grid-cols-12 border-b border-zinc-800 bg-zinc-900/50 p-4 font-mono text-xs text-zinc-400">
            <div className="md:col-span-4 font-semibold uppercase">Critério</div>
            <div className="hidden md:block md:col-span-4 uppercase text-zinc-500">Edição Manual Tradicional</div>
            <div className="hidden md:block md:col-span-4 uppercase text-zinc-200">Com o Podcast Clipper</div>
          </div>

          <div className="divide-y divide-zinc-800/60">
            {comparisons.map((item, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-12 p-4 text-sm gap-2 md:gap-0 items-center">
                <div className="md:col-span-4 font-medium text-zinc-200">{item.metric}</div>
                <div className="md:col-span-4 flex items-center gap-2 text-zinc-400">
                  <XIcon className="h-4 w-4 text-zinc-600 shrink-0" />
                  <span className="text-xs sm:text-sm">{item.manual}</span>
                </div>
                <div className="md:col-span-4 flex items-center gap-2 text-zinc-100 font-medium">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span className="text-xs sm:text-sm">{item.clipper}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Implementar `src/components/landing/pricing-section.tsx`**

```tsx
import Link from "next/link";
import { CheckIcon, ZapIcon } from "lucide-react";

interface PricingSectionProps {
  isAuthenticated: boolean;
}

export function PricingSection({ isAuthenticated }: { isAuthenticated: boolean }) {
  const targetHref = isAuthenticated ? "/dashboard/billing" : "/signup";

  const plans = [
    {
      title: "Pack Inicial",
      price: "$9.99",
      approxBrl: "~R$ 50",
      credits: "50 créditos",
      description: "Ideal para testar em um episódio completo de podcast.",
      features: [
        "50 minutos de processamento",
        "Download de todos os cortes em 1080p",
        "Detecção facial ativa em 9:16",
        "Legendas automáticas sincronizadas",
        "Créditos que nunca expiram",
      ],
      isPopular: false,
      ctaText: "Comprar 50 Créditos",
    },
    {
      title: "Pack Criador",
      price: "$24.99",
      approxBrl: "~R$ 130",
      credits: "150 créditos",
      description: "O melhor custo-benefício para canais com episódios regulares.",
      features: [
        "150 minutos de processamento (~3 episódios)",
        "Economia de 17% por crédito",
        "Download ilimitado de cortes",
        "Prioridade na fila de renderização",
        "Créditos que nunca expiram",
      ],
      isPopular: true,
      ctaText: "Comprar 150 Créditos",
    },
    {
      title: "Pack Estúdio",
      price: "$69.99",
      approxBrl: "~R$ 380",
      credits: "500 créditos",
      description: "Para agências de mídia e podcasts de alta frequência semanal.",
      features: [
        "500 minutos de processamento (~10 episódios)",
        "Economia de 30% por crédito",
        "Fila de processamento ultra rápida",
        "Suporte técnico prioritário",
        "Créditos que nunca expiram",
      ],
      isPopular: false,
      ctaText: "Comprar 500 Créditos",
    },
  ];

  return (
    <section id="precos" className="border-t border-zinc-800/60 py-20 bg-zinc-950">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center">
          <span className="font-mono text-xs tracking-wider text-zinc-400 uppercase">Preços Transparentes</span>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
            Pague pelo que usar. Sem mensalidade forçada.
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Compre créditos quando precisar. Créditos nunca expiram e ficam salvos na sua conta.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {plans.map((plan, idx) => (
            <div
              key={idx}
              className={`relative flex flex-col justify-between rounded-xl border p-6 transition-all ${
                plan.isPopular
                  ? "border-zinc-500 bg-zinc-900/60 shadow-xl"
                  : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700"
              }`}
            >
              {plan.isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-zinc-600 bg-zinc-100 px-3 py-0.5 font-mono text-[10px] font-semibold text-zinc-950 uppercase tracking-wider">
                  Mais Popular
                </div>
              )}

              <div>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-lg font-semibold text-zinc-100">{plan.title}</h3>
                  <span className="font-mono text-xs text-zinc-400">{plan.credits}</span>
                </div>
                <p className="mt-2 text-xs text-zinc-400 leading-relaxed">{plan.description}</p>

                <div className="mt-6 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight text-zinc-100">{plan.price}</span>
                  <span className="font-mono text-xs text-zinc-500">{plan.approxBrl}</span>
                </div>

                <div className="my-6 border-t border-zinc-800/80" />

                <ul className="space-y-2.5 text-xs text-zinc-300">
                  {plan.features.map((feat, fIdx) => (
                    <li key={fIdx} className="flex items-center gap-2">
                      <CheckIcon className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8">
                <Link
                  href={targetHref}
                  className={`flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-medium transition-colors ${
                    plan.isPopular
                      ? "bg-zinc-100 text-zinc-950 hover:bg-zinc-200"
                      : "border border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  <ZapIcon className="h-3.5 w-3.5" />
                  {plan.ctaText}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Implementar `src/components/landing/faq-section.tsx`**

```tsx
"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
}

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs: FAQItem[] = [
    {
      question: "Como funcionam os créditos?",
      answer:
        "1 crédito equivale a 1 minuto de vídeo analisado e fatiado. Por exemplo, um episódio de 45 minutos consome 45 créditos e gera de 3 a 7 cortes verticais de alta retenção prontos para publicação.",
    },
    {
      question: "Os créditos expiram se eu não usar este mês?",
      answer:
        "Não. Nossos pacotes são pay-as-you-go. Os créditos adquiridos nunca expiram e permanecem na sua conta até que você decida utilizá-los no seu próximo episódio.",
    },
    {
      question: "O reconhecimento de fala funciona com podcasts em português?",
      answer:
        "Sim. Nosso modelo de transcrição foi calibrado especificamente com foco em português do Brasil, lidando com gírias, termos técnicos de negócios e sobreposição de falas com alta acurácia.",
    },
    {
      question: "Quais links de vídeo posso importar?",
      answer:
        "Você pode colar links públicos ou não listados do YouTube, ou fazer upload direto de arquivos de vídeo MP4 e MOV salvos no seu computador.",
    },
    {
      question: "Como funciona a garantia e o suporte?",
      answer:
        "Todo novo usuário ganha 10 créditos gratuitos para testar a qualidade antes de comprar qualquer pacote. Se tiver qualquer dúvida ou problema com um corte, nossa equipe de suporte responde diretamente.",
    },
  ];

  return (
    <section id="faq" className="border-t border-zinc-800/60 py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="text-center">
          <span className="font-mono text-xs tracking-wider text-zinc-400 uppercase">Tire suas dúvidas</span>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
            Perguntas Frequentes
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Respostas diretas sobre processamento, cobrança e suporte.
          </p>
        </div>

        <div className="mt-10 space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950 transition-colors hover:border-zinc-700"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="flex w-full items-center justify-between p-4 text-left text-sm font-medium text-zinc-200 transition-colors hover:text-white"
                  aria-expanded={isOpen}
                >
                  <span>{faq.question}</span>
                  <ChevronDownIcon
                    className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${
                      isOpen ? "rotate-180 text-zinc-200" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="border-t border-zinc-800/60 px-4 py-3 text-xs leading-relaxed text-zinc-400 bg-zinc-900/30">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Implementar `src/components/landing/footer.tsx`**

```tsx
import Link from "next/link";
import { SparklesIcon } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-zinc-800/80 bg-zinc-950 py-12 text-zinc-500">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded border border-zinc-800 bg-zinc-900">
              <SparklesIcon className="h-3 w-3 text-zinc-300" />
            </div>
            <span className="text-sm font-semibold text-zinc-300">Podcast Clipper Studio</span>
          </div>

          <div className="flex items-center gap-6 text-xs">
            <span className="flex items-center gap-1.5 font-mono text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Todos os sistemas operacionais
            </span>
          </div>

          <p className="font-mono text-xs text-zinc-500">
            © {new Date().getFullYear()} Podcast Clipper. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 7: Executar os testes unitários**

Executar:
```bash
npm run test tests/unit/landing-conversion.test.tsx
```
Esperado: PASS (4/4 testes passando).

---

### Task 5: Montagem da Landing Page Principal (`src/app/page.tsx`) com Detecção de Sessão

**Files:**
- Modify: `ai-podcast-clipper-frontend/src/app/page.tsx`
- Test: `ai-podcast-clipper-frontend/tests/unit/home-page.test.tsx`

**Interfaces:**
- Consumes: `Header`, `HeroSection`, `ProductPreview`, `ComparisonSection`, `PricingSection`, `FAQSection`, `Footer`
- Consumes: `@clerk/nextjs/server` `auth()`
- Produces: Landing Page completa em `/`

- [ ] **Step 1: Escrever teste unitário para `src/app/page.tsx`**

Criar `tests/unit/home-page.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "~/app/page";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: null }),
}));

describe("HomePage", () => {
  it("renders the full landing page for unauthenticated visitors", async () => {
    const Component = await HomePage();
    render(Component);

    expect(screen.getByText(/De podcasts longos a cortes virais/i)).toBeInTheDocument();
    expect(screen.getByText(/Demonstração Real/i)).toBeInTheDocument();
    expect(screen.getByText(/Edição Manual vs. Podcast Clipper/i)).toBeInTheDocument();
    expect(screen.getByText(/Pague pelo que usar/i)).toBeInTheDocument();
    expect(screen.getByText(/Perguntas Frequentes/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Executar o teste e verificar falha**

Executar:
```bash
npm run test tests/unit/home-page.test.tsx
```
Esperado: FAIL (atualmente `page.tsx` apenas tem `redirect("/dashboard")`).

- [ ] **Step 3: Implementar `src/app/page.tsx`**

Substituir o conteúdo de `src/app/page.tsx`:
```tsx
import { auth } from "@clerk/nextjs/server";
import { Header } from "~/components/landing/header";
import { HeroSection } from "~/components/landing/hero-section";
import { ProductPreview } from "~/components/landing/product-preview";
import { ComparisonSection } from "~/components/landing/comparison-section";
import { PricingSection } from "~/components/landing/pricing-section";
import { FAQSection } from "~/components/landing/faq-section";
import { Footer } from "~/components/landing/footer";

export default async function HomePage() {
  const { userId } = await auth();
  const isAuthenticated = Boolean(userId);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-zinc-800 selection:text-zinc-100">
      <Header isAuthenticated={isAuthenticated} />
      <main>
        <HeroSection isAuthenticated={isAuthenticated} />
        <ProductPreview />
        <ComparisonSection />
        <PricingSection isAuthenticated={isAuthenticated} />
        <FAQSection />
      </main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 4: Executar os testes unitários**

Executar:
```bash
npm run test tests/unit/home-page.test.tsx
```
Esperado: PASS (1/1 teste passando).

---

### Task 6: Verificação de Qualidade End-to-End e Suíte de Testes

**Files:**
- Audit: Todos os arquivos criados e modificados
- Execute: Verificação de tipos, lint e testes automatizados

- [ ] **Step 1: Executar verificação de lint e tipos estáticos**

Executar no diretório `ai-podcast-clipper-frontend`:
```bash
npm run check
```
Esperado: 0 erros de ESLint e 0 erros de compilação do TypeScript.

- [ ] **Step 2: Executar suíte completa de testes**

Executar:
```bash
npm run test:all
```
Esperado: Todos os 98 testes existentes + os novos testes criados executando com sucesso (100% PASS).

- [ ] **Step 3: Validar rotas locais em execução**

Testar acessibilidade via HTTP com curl:
```bash
curl -I http://localhost:3000/
curl -I http://localhost:3000/login
curl -I http://localhost:3000/signup
```
Esperado: HTTP 200 OK em todas as rotas.

- [ ] **Step 4: Solicitar revisão do usuário antes de qualquer commit**

Apresentar o resultado final ao usuário e solicitar sua aprovação antes de qualquer operação no git, em conformidade com o `AGENTS.md`.
