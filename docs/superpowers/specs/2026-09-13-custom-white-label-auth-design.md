# Especificação Técnica: Autenticação White-Label Customizada e Menu do Usuário

**Data:** 2026-09-13  
**Status:** Aprovado  
**Escopo:** Frontend (`ai-podcast-clipper-frontend`)  

---

## 1. Visão Geral e Motivação

Atualmente, o projeto utiliza os componentes visuais pré-fabricados do Clerk (`<SignIn />`, `<SignUp />` e `<UserButton />`). Apesar da personalização via `appearance`, esses componentes mantêm a estrutura de layout e elementos nativos do Clerk, o que expõe a dependência de terceiros e limita a coesão visual com a linguagem *Dark Precision Studio*.

O objetivo desta especificação é transformar o sistema de autenticação e navegação de perfil em **100% white-label**:
- O usuário final não deve ver nenhuma menção, iframe ou elemento pré-fabricado do Clerk.
- Toda a interface (campos, botões, validações, feedback de erro e menus) será construída internamente utilizando Tailwind CSS, Radix UI e os tokens de design do projeto (`var(--superficie)`, `var(--tinta)`, `var(--ouro)`, `var(--linha)`, etc.).
- O Clerk atuará exclusivamente nos bastidores como motor de autenticação e sessão através de seus hooks oficiais (`useSignIn`, `useSignUp`, `useUser`, `useClerk`).

---

## 2. Métodos de Autenticação Suportados

1. **Email e Senha**:
   - Login direto com validação de credenciais.
   - Cadastro com validação de formato e etapa de código de verificação por email (OTP de 6 dígitos).
2. **Google OAuth (Login Social)**:
   - Botão "Continuar com Google" / "Cadastrar com Google".
   - Fluxo de redirecionamento via rota própria `/sso-callback`.

---

## 3. Arquitetura de Componentes

```
src/
├── app/
│   ├── login/[[...login]]/
│   │   └── page.tsx              # Renderiza CustomSignInForm dentro de AuthSplitLayout
│   ├── signup/[[...signup]]/
│   │   └── page.tsx              # Renderiza CustomSignUpForm dentro de AuthSplitLayout
│   └── sso-callback/
│       └── page.tsx              # Rota técnica com loading Studio para retorno do Google OAuth
├── components/
│   ├── auth/
│   │   ├── auth-split-layout.tsx # Layout dividido existente (mantido)
│   │   ├── custom-sign-in-form.tsx # Formulário customizado de login (Email/Senha + Google)
│   │   └── custom-sign-up-form.tsx # Formulário customizado de cadastro (com etapa de código OTP)
│   ├── nav-header.tsx            # Header existente atualizado
│   └── user-nav-menu.tsx         # Dropdown próprio de perfil (substitui UserButton)
└── lib/
    └── clerk-errors.ts           # Mapeamento de erros do Clerk para mensagens amigáveis em pt-BR
```

---

## 4. Detalhamento dos Componentes

### 4.1. Formulário de Login (`CustomSignInForm`)
- **Estado Local**: `email`, `password`, `showPassword`, `isLoading`, `errorMessage`.
- **Hooks Utilizados**: `useSignIn()` de `@clerk/nextjs`.
- **Ações**:
  - `signIn.create({ identifier: email, password })`:
    - Em caso de sucesso (`status === "complete"`): ativa a sessão com `setActive({ session: result.createdSessionId })` e redireciona para `/dashboard`.
    - Em caso de erro: captura e traduz os erros do Clerk para pt-BR via `formatClerkError()`.
  - `signIn.authenticateWithRedirect({ strategy: "oauth_google", redirectUrl: "/sso-callback", redirectUrlComplete: "/dashboard" })`:
    - Dispara o fluxo OAuth do Google.
- **Microcopy**:
  - Título: *"Acessar sua conta"*
  - Subtítulo: *"Entre com seu email e senha ou use sua conta Google."*
  - Botão Google: *"Continuar com Google"*
  - Separador: *"ou continue com email"*
  - Botão Primário: *"Entrar no Studio"* (`btn-ouro`)
  - Link de Rodapé: *"Não tem uma conta? Criar conta"* apontando para `/signup`.

### 4.2. Formulário de Cadastro (`CustomSignUpForm`)
- **Estado Local**: `step` (`"form"` | `"verifying"`), `email`, `password`, `code`, `isLoading`, `errorMessage`.
- **Hooks Utilizados**: `useSignUp()` de `@clerk/nextjs`.
- **Fluxo do Formulário**:
  1. **Etapa 1 (Dados)**:
     - Usuário preenche `email` e `password` (mínimo de 8 caracteres).
     - Chama `signUp.create({ emailAddress: email, password })`.
     - Em seguida, dispara `signUp.prepareEmailAddressVerification({ strategy: "email_code" })`.
     - Atualiza o estado `step = "verifying"`.
  2. **Etapa 2 (Código de Verificação)**:
     - Exibe tela: *"Verifique seu email"* com instrução: *"Digite o código de 6 dígitos enviado para seu email."*
     - Input estilizado para o código de 6 dígitos.
     - Chama `signUp.attemptEmailAddressVerification({ code })`.
     - Quando `status === "complete"`: chama `setActive({ session: result.createdSessionId })` e redireciona para `/dashboard`.
     - Botão para reenviar código (`signUp.prepareEmailAddressVerification`).
     - Botão para voltar à edição do email caso o usuário tenha digitado incorretamente.
  3. **Cadastro com Google**:
     - Chama `signUp.authenticateWithRedirect({ strategy: "oauth_google", redirectUrl: "/sso-callback", redirectUrlComplete: "/dashboard" })`.

### 4.3. Rota de Retorno OAuth (`/sso-callback`)
- Rota Next.js App Router em `src/app/sso-callback/page.tsx`.
- Utiliza `<AuthenticateWithRedirectCallback />` do Clerk envolto em um container estilizado no padrão *Dark Precision Studio*.
- Exibe feedback visual com spinner sutil em ouro e o texto *"Autenticando com Google..."*, garantindo transição sem telas brancas ou genéricas.

### 4.4. Menu de Navegação do Usuário (`UserNavMenu`)
- Substitui completamente o componente `<UserButton />` em `src/components/nav-header.tsx`.
- **Hooks Utilizados**: `useUser()` e `useClerk()` de `@clerk/nextjs`.
- **Estrutura Visual**:
  - **Trigger (Avatar)**:
    - Componente [`Avatar`](file:///home/thuan/Documentos/projetos-empresa/ai-podcast-clipper-saas/ai-podcast-clipper-frontend/src/components/ui/avatar.tsx) do Radix com a imagem do perfil (`user.imageUrl`).
    - Fallback com as iniciais do nome ou email em tipografia mono com cor `var(--ouro)`.
  - **Conteúdo do Dropdown** ([`DropdownMenu`](file:///home/thuan/Documentos/projetos-empresa/ai-podcast-clipper-saas/ai-podcast-clipper-frontend/src/components/ui/dropdown-menu.tsx)):
    - **Header**: Nome do usuário (`user.fullName` ou fallback) e email (`user.primaryEmailAddress`).
    - **Separador**: Linha sutil em `var(--linha)`.
    - **Link de Faturamento**: Ícone de cartão de crédito e texto *"Faturamento & Créditos"* (`/dashboard/billing`).
    - **Separador**: Linha sutil.
    - **Botão de Logout**: Ícone `LogOut` e texto *"Sair da conta"* com ação `signOut(() => router.push("/"))`.

### 4.5. Tradutor de Erros do Clerk (`clerk-errors.ts`)
- Mapeia códigos de erro comuns do Clerk para português claro e amigável:
  - `form_identifier_not_found` ➔ *"Conta não encontrada para este email."*
  - `form_password_incorrect` ➔ *"Senha incorreta. Tente novamente."*
  - `form_identifier_exists` ➔ *"Este email já está cadastrado. Tente entrar."*
  - `form_code_incorrect` ➔ *"Código de verificação incorreto."*
  - `form_password_pwned` / `form_password_length_too_short` ➔ *"A senha deve ter pelo menos 8 caracteres."*
  - Fallback ➔ Mensagem padrão *"Ocorreu um erro ao processar sua solicitação."*

---

## 5. Estratégia de Testes

1. **Testes Unitários de Componentes**:
   - `tests/unit/components/custom-sign-in-form.test.tsx`:
     - Renderização de campos de email, senha e botão Google.
     - Envio de credenciais chamando `signIn.create` e `setActive`.
     - Exibição de mensagens de erro formatadas.
     - Acionamento do OAuth Google.
   - `tests/unit/components/custom-sign-up-form.test.tsx`:
     - Renderização inicial do formulário.
     - Transição para o passo de verificação OTP ao criar conta.
     - Validação do código e chamada de `setActive`.
   - `tests/unit/components/user-nav-menu.test.tsx`:
     - Renderização do avatar com imagem/iniciais.
     - Renderização dos itens do menu (nome, email, link de billing).
     - Execução do logout com `signOut`.
   - Atualização dos testes existentes de páginas de login e signup (`tests/unit/auth-pages.test.tsx`).

2. **Garantia de Não-Regressão**:
   - Execução de `npm run check` (`next lint && tsc --noEmit`).
   - Execução de `npm run test:all` para garantir que todos os 210 testes continuem verdes.
