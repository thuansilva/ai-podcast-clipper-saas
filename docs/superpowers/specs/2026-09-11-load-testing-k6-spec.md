# Especificação Técnica: Suíte de Testes de Carga com Grafana k6

- **Data:** 11 de Setembro de 2026
- **Status:** Aprovado
- **Autor:** Antigravity + Usuário
- **Escopo:** Módulo de testes de carga para APIs e Webhooks do Next.js (`ai-podcast-clipper-frontend`)

---

## 1. Visão Geral e Objetivos

O objetivo desta especificação é definir a arquitetura, estrutura de arquivos, cenários de carga, perfis de usuários virtuais (VUs) e critérios de qualidade (SLAs) para a suíte de testes de performance e carga da plataforma SaaS AI Podcast Clipper.

A suíte utiliza o **Grafana k6**, executando scripts em JavaScript moderno no ambiente local (`http://localhost:3000`), permitindo simulações de alta concorrência com baixo consumo de recursos de máquina.

---

## 2. Arquitetura da Suíte (`load-tests/`)

A suíte será alocada no diretório `ai-podcast-clipper-frontend/load-tests/`, organizada em três pilares:

```text
ai-podcast-clipper-frontend/
├── load-tests/
│   ├── config/
│   │   ├── thresholds.js        # Definições de SLAs (p90, p95, p99 e taxa de erro)
│   │   └── profiles.js          # Perfis de VUs (Smoke, Load e Stress)
│   ├── helpers/
│   │   ├── stripe-signature.js  # Gerador de cabeçalho stripe-signature HMAC-SHA256
│   │   ├── fixtures.js          # Geradores de payloads dinâmicos para testes
│   │   └── auth-headers.js      # Gerador de cabeçalhos HTTP e identificadores de sessão
│   ├── scenarios/
│   │   ├── stripe-webhook.js    # Teste de concorrência e transações no Webhook do Stripe
│   │   ├── s3-presign-flow.js   # Teste de throughput de geração de URLs pré-assinadas S3
│   │   └── main-suite.js        # Suíte combinada com tráfego misto realista
│   └── README.md                # Instruções de instalação do k6 e guia de execução
└── package.json                 # Scripts npm de atalho para execução
```

---

## 3. Cenários de Teste

### 3.1. Webhook do Stripe (`scenarios/stripe-webhook.js`)
- **Endpoint Alvo:** `POST http://localhost:3000/api/webhooks/stripe`
- **Comportamento Testado:**
  - Ingestão contínua de eventos `checkout.session.completed`.
  - Execução transacional de `AddCreditsFromStripeWebhookUseCase` com `PrismaUnitOfWork`.
  - Atualização concorrente de saldos (`creditsIncrement`) e inserção de logs em `CreditTransaction`.
- **Validação Criptográfica:**
  - Geração de cabeçalho `stripe-signature` com timestamp e HMAC-SHA256 utilizando a chave secreta `STRIPE_WEBHOOK_SECRET` em tempo de execução via `k6/crypto`.

### 3.2. Geração de URLs de Upload S3 (`scenarios/s3-presign-flow.js`)
- **Endpoint Alvo:** Rota de API / Endpoint de geração de URLs pré-assinadas.
- **Comportamento Testado:**
  - Throughput de geração de assinaturas S3 (`S3StorageGateway.createUploadPresignedUrl`).
  - Criação de registros com status inicial `queued` no `PrismaUploadedFileRepository`.

### 3.3. Suíte Mista de Produção (`scenarios/main-suite.js`)
- **Comportamento Testado:**
  - Distribuição ponderada de tráfego: 70% geração/consulta de arquivos e 30% webhooks de créditos em execução paralela.
  - Teste de esgotamento e contenção do pool de conexões do PostgreSQL/Prisma.

---

## 4. Perfis de Carga e SLAs (Thresholds)

### 4.1. Perfis de Execução
1. **Smoke Test:**
   - Carga: 5 VUs constantes durante 30 segundos.
   - Objetivo: Validação rápida de integridade e respostas 200.
2. **Load Test:**
   - Carga: Rampa de 0 a 10 VUs em 30s → 30 a 50 VUs sustentados por 1 minuto → rampa de descida em 30s (Total: 2 min).
   - Objetivo: Validação de comportamento sob carga nominal de produção.
3. **Stress / Spike Test:**
   - Carga: Subida rápida de 0 a 50 VUs em 15s → 150 a 200 VUs em pico por 1 minuto → encerramento em 30s.
   - Objetivo: Identificar limites de concorrência e comportamento de recuperação do servidor.

### 4.2. Métricas de Aceitação (Thresholds)
- **Taxa de Erros (`http_req_failed`):** `< 1%`
- **Latência de Resposta (`http_req_duration`):**
  - `p(90) < 150ms`
  - `p(95) < 250ms`
  - `p(99) < 500ms`
- **Asserções de Negócio (`checks`):**
  - `status 200`: `> 99%` de conformidade.

---

## 5. Scripts de Execução (`package.json`)

```json
{
  "scripts": {
    "test:load:smoke": "k6 run --env PROFILE=smoke load-tests/scenarios/main-suite.js",
    "test:load": "k6 run --env PROFILE=load load-tests/scenarios/main-suite.js",
    "test:load:stress": "k6 run --env PROFILE=stress load-tests/scenarios/main-suite.js",
    "test:load:stripe": "k6 run load-tests/scenarios/stripe-webhook.js",
    "test:load:s3": "k6 run load-tests/scenarios/s3-presign-flow.js"
  }
}
```
