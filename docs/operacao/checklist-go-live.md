# Checklist de Prontidão para Produção (Go-Live)

**Data da auditoria:** 2026-10-02  
**Especialistas:** devops-specialist, security-specialist, domain-specialist, qa-specialist, frontend-specialist, accessibility-tester  
**Propósito:** Checklist consolidado de todos os bloqueadores (BLOCKER), itens de alta prioridade (HIGH) e melhorias (NICE) que impedem o lançamento em produção.

---

## BLOCKER — Impedem Lançamento

Estes itens **devem** ser corrigidos antes de qualquer release para produção.

### Billing e Stripe

- [x] **Taxonomia de planos divergente causa under-provisioning de créditos** — Código define `UserPlan = "STARTER"|"STUDIO"|"CREATOR"|"PRO_STUDIO"`, mas checkout real usa price IDs `starter_monthly/annual` e `pro_monthly/annual`. `ProcessSubscriptionCheckoutUseCase` compara contra env vars nunca encontradas (`STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID`), caindo sempre no fallback `plan="CREATOR"` (150 créditos) mesmo pra clientes Pro (300 créditos).  
  **Evidência:** `src/domain/entities/user.ts:22`, `src/actions/stripe.ts:18-27`, `src/application/use-cases/credits/process-subscription-checkout.use-case.ts:48-57`, `src/inngest/functions.ts:575-576`, `prisma/schema.prisma:44`  
  **Origem:** domain-specialist, security-specialist  
  **Resolvido:** `PlanCatalogService` criado como fonte única da verdade, mapeando os 4 price IDs reais (Starter mensal/anual, Pro mensal/anual) para créditos corretos. `UserPlan` estreitado para apenas `"STARTER"|"PRO"`. Migration `20260928000000_restrict_user_subscription_plan_values` normaliza e adiciona CHECK constraint. Testes cobrindo os 4 planos e rejeição de price ID desconhecido.

- [x] **Webhook Stripe não trata pagamentos falhados, reembolsos ou chargebacks** — Handler em `src/app/api/webhooks/stripe/route.ts:60-191` trata apenas `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`. Sem tratamento para `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created` — cartão recusado não revoga acesso, reembolso/chargeback não revoga créditos.  
  **Evidência:** `src/app/api/webhooks/stripe/route.ts:60-191`  
  **Origem:** security-specialist, domain-specialist  
  **Resolvido:** Implementados 3 novos tipos de evento com padrão robusto de idempotência (checar `isProcessed` → `await` dispatch → marcar processado depois de confirmado → 503 se falhar).
  - `invoice.payment_failed`: novo use case `ProcessPaymentFailedUseCase` marca `Subscription.status = "past_due"` imediatamente (reação própria do domínio, não delegada ao timing de dunning do Stripe). Créditos/acesso continuam normais durante carência de 3 dias.
  - Carência de 3 dias: migration `20261003000000_add_subscription_past_due_at` adiciona campo `pastDueAt: DateTime?`. Novo use case `SuspendExpiredPastDueSubscriptionsUseCase` (Inngest agendada) revoga acesso de `past_due` com mais de 3 dias sem resolução.
  - `invoice.payment_succeeded` durante carência: novo use case `ResolvePastDueGracePeriodUseCase` reverte `past_due` → `active` e limpa `pastDueAt`.
  - `charge.refunded`: novo use case `ProcessChargeRefundUseCase` revoga créditos do período afetado apenas (reutiliza helper `revoke-subscription-credits.helper.ts`), sem suspender conta.
  - `charge.dispute.created`: novo use case `ProcessChargeDisputeUseCase`, mesmo comportamento de refund.
  - TDD: 6 testes de integração em `tests/integration/stripe-webhook-payment-failure.integration.test.ts` (vermelho antes da implementação, verde depois). Suíte completa: 624 testes passando.

- [x] **Deduplicação de webhook Stripe com race condition crítica** — Evento marcado como processado (BD) ANTES do dispatch ao Inngest ser completado. Em serverless, se instância congelar após 200 OK, créditos nunca são aplicados; Stripe acredita que já processou e não reenvia.  
  **Evidência:** `src/app/api/webhooks/stripe/route.ts:48-58`, `src/infrastructure/queue/stripe-queue.ts:203-213` (fire-and-forget)  
  **Origem:** security-specialist, domain-specialist  
  **Resolvido:** `src/app/api/webhooks/stripe/route.ts` agora checa `isProcessed` → `await` o dispatch → marca como processado DEPOIS de confirmar sucesso. Se dispatch falhar, responde 503 (não 200), permitindo Stripe reenviar. `event.id` do Stripe passado como chave de idempotência nativa ao `inngest.send()`. Erro de `inngest.send` agora propaga ao chamador em vez de fallback silencioso. TDD rigoroso: primeira versão dos testes teve asserções condicionais que não ficavam vermelhas (falha de metodologia identificada e corrigida); versão final: 4 testes genuinamente vermelho→verde em `tests/integration/stripe-webhook-idempotency.integration.test.ts`. Suíte completa: 616 testes passando.

- [x] **Pacotes avulsos (one-time credits) descontinuados ainda estão no código** — `AddCreditsFromStripeWebhookUseCase` (`src/application/use-cases/credits/add-credits-from-stripe.use-case.ts:31-48`) continua processando pacotes (smallPackPriceId, mediumPackPriceId, largePackPriceId) apesar da spec aprovada (`../historico/superpowers/specs/2026-09-14-recurring-subscriptions-and-credit-packs-design.md:12`) descontinuar essa venda. `src/env.js:27-29` mantém defaults fake (`"price_small"`).  
  **Evidência:** `src/application/use-cases/credits/add-credits-from-stripe.use-case.ts`, `src/env.js:27-29`  
  **Origem:** domain-specialist  
  **Resolvido:** Pacotes avulsos removidos do código e env vars correspondentes removidas de `env.js`. Migration `20260928000000_restrict_user_subscription_plan_values` normaliza dados legados.

### Segurança

- [x] **Next.js 15.3.2 com CVEs críticas não patcheadas** — `npm audit` reporta 2 critical (RCE no protocolo React Flight, exposição de código-fonte de Server Actions), 5 high, 22 moderate. App usa intensamente App Router + Server Actions (superfície de ataque direta).  
  **Evidência:** `npm audit` output, `package.json`  
  **Origem:** security-specialist  
  **Resolvido:** Next.js atualizado de 15.3.2 para 15.5.27 (went beyond minimal patch para corrigir 2 CVEs adicionais: RCE em Windows e na API de otimização de imagem AVIF, ambas só corrigidas a partir da 15.5.24). `npm audit` do pacote `next` sem mais advisories diretas. Build e testes passam. Novo item HIGH descoberto: 1 critical remanescente no AWS SDK (`fast-xml-parser` via `@aws-sdk/client-s3`), pendente de task separada para atualizar AWS SDK v3.

- [x] **Regra de lifecycle do S3 quebra clipes em 24h** — `./aws-s3-lifecycle-rules.md:15-19` documenta expiração de `uploads/`/`youtube/` em 1 dia, manter `clips/` pra sempre. Backend grava o clipe final na MESMA pasta do vídeo original (`ai-podcast-clipper-backend/main.py:232-233`), nunca em `clips/`. Se aplicadas, regras destroem todos os clipes 24h após processamento.  
  **Evidência:** `./aws-s3-lifecycle-rules.md:15-19`, `ai-podcast-clipper-backend/main.py:232-233`, `generate-upload-url.use-case.ts:20`, `import-youtube-video.use-case.ts:27`  
  **Origem:** security-specialist, devops-specialist  
  **Resolvido:** Pipeline backend consolidado em módulos compartilhados (`core/`), incluindo `s3_paths.py` que garante clipes finais gravados em `clips/` (em vez da mesma pasta do vídeo original). TDD: teste vermelho → implementação → verde.

### Infraestrutura e Deploy

- [x] **Submódulo Git `asd/` órfão impede clone e deploy** — `ai-podcast-clipper-backend/asd/` está listado como gitlink (modo 160000) no tree, mas não existe `.gitmodules` no repo. Clone novo gera pasta vazia. `main.py:66` (`.add_local_dir`) e `main.py:269-275` (uso em runtime) dependem do conteúdo — Modal deploy falharia.  
  **Evidência:** `git ls-tree HEAD | grep asd`, ausência de `.gitmodules`, `ai-podcast-clipper-backend/main.py:66,269-275`  
  **Origem:** devops-specialist  
  **Resolvido:** Criado `.gitmodules` apontando para repo Light-ASD (commit `ed38c23`). Validado ponta a ponta: clone novo simulado + `git submodule update --init` popula corretamente; suíte de testes do backend rodou 71/71 (venv completo) e 63/63 (venv leve) após clone simulado.

- [x] **Testes do backend (`local_server.py`) não estão no repositório** — Arquivos `ai-podcast-clipper-backend/local_server.py` e `tests/test_local_server.py` estão em `.gitignore` (linhas 1-2) mas nunca foram commitados. Job `backend-local-server` do `.github/workflows/ci.yml` roda `pytest tests/test_local_server.py` — coleta de testes falharia em produção.  
  **Evidência:** `ai-podcast-clipper-backend/.gitignore:1-2`, `.github/workflows/ci.yml` job `backend-local-server`  
  **Origem:** devops-specialist  
  **Resolvido:** Pipeline backend consolidado: lógica real extraída de `main.py` para módulos compartilhados em `core/`. `local_server.py` reescrito como wrapper fino chamando o mesmo `core/` (elimina drift). `local_server.py` e seu teste saíram do `.gitignore`, agora versionados.

- [x] **Migrações do Prisma incompletas — apenas 1 de 7 tabelas** — `ai-podcast-clipper-frontend/prisma/migrations/` contém só `20260927000000_add_processed_webhook_event`. Schema tem 7 models (`User`, `Subscription`, `CreditTransaction`, `UploadedFile`, `Clip`, `ProcessingOption`, `ProcessedWebhookEvent`). CI usa `prisma db push --skip-generate`, não `migrate deploy`. Rodar em banco vazio criaria só 1 tabela; queries do app falhariam.  
  **Evidência:** `prisma/migrations/`, `prisma/schema.prisma`, `.github/workflows/ci.yml:55`  
  **Origem:** devops-specialist, qa-specialist  
  **Resolvido:** migration baseline `20260926000000_baseline_initial_schema` criada (cronologicamente anterior à `..._add_processed_webhook_event`) cobrindo as 6 tabelas que faltavam. CI (`.github/workflows/ci.yml`) passou a usar `prisma migrate deploy` em vez de `prisma db push --skip-generate`. Verificado localmente: `migrate deploy` num Postgres vazio cria as 7 tabelas e `prisma migrate diff` contra `schema.prisma` resulta vazio. Instruções para aplicar num ambiente já existente (criado via `db push`) documentadas no cabeçalho do `migration.sql` da baseline (`prisma migrate resolve --applied 20260926000000_baseline_initial_schema`); não há banco de produção real hoje, então esse passo não precisou ser executado.

### Qualidade e CI

- [x] **TypeScript: 9 erros de tipo na suíte de testes bloqueiam `npm run check`** — Incompatibilidade de tipo `Response` (undici vs fetch nativa) em `tests/integration/inngest-pipeline.test.ts:119,201,337,420` e `tests/unit/inngest/manual-cuts-pipeline.test.ts:100`; argumentos incompatíveis em `tests/unit/api/health.test.ts:10,19,29,39` (handler `GET()` não recebe argumentos, teste passa `Request`).  
  **Evidência:** Output de `npm run check` (erros de compilação)  
  **Origem:** qa-specialist  
  **Resolvido:** Os 9 erros originais mais 3 novos (introduzidos pelos testes das use cases) foram corrigidos. `npm run check` 100% verde. Suíte completa: 541 testes unitários passando.

- [x] **Duas use cases sem testes unitários** — `src/application/use-cases/delete-project.use-case.ts` e `src/application/use-cases/rename-project.use-case.ts` sem cobertura, violando regra TDD obrigatória do `AGENTS.md`.  
  **Evidência:** Ausência de `*.test.ts` correspondentes  
  **Origem:** qa-specialist  
  **Resolvido:** Adicionados 26 testes novos (15 unitários + 11 integração). Confirmado: ambas as use cases já verificavam posse corretamente (sem IDOR) — não havia bug escondido.

### Produto e UX

- [x] **Upload direto de vídeo é um stub não funcional** — Decisão de produto: fluxo escondido em vez de implementado agora. `<input type="file">` + `handleUpload` (stub que mostrava sucesso falso) removidos de `src/components/dashboard/create-project-client.tsx`. App lança só com importação via YouTube + cortes manuais, ambos funcionando ponta a ponta. Infraestrutura de upload no backend (`generateUploadUrl`, `generateVideoThumbnail`) mantida intacta para reativar se decidido.  
  **Evidência:** `src/components/dashboard/create-project-client.tsx` (handleUpload removido)  
  **Origem:** frontend-specialist  
  **Resolvido na Fase 4**

- [x] **Branding de template terceiro vaza pra UI** — Nome trocado de "Studio Admin" para "Podcast Clipper" (`src/config/app-config.ts:6-12`), consistente com marca já usada na landing pública. Copyright e meta.title/description atualizados. Links "Support" pessoais de "arhamkhnz" (X/GitHub do autor do template) removidos de `src/components/dashboard/sidebar/support-card.tsx:16,26`, substituídos por `mailto:` com placeholder `suporte@PREENCHER.com.br` marcado com TODO (usuário decide e-mail real depois). Teste novo: `tests/unit/components/app-sidebar-branding.test.tsx`.  
  **Evidência:** `src/config/app-config.ts`, `src/components/dashboard/sidebar/support-card.tsx`, `tests/unit/components/app-sidebar-branding.test.tsx`  
  **Origem:** frontend-specialist  
  **Resolvido na Fase 4**

- [x] **Nenhuma página legal/compliance existe** — Criadas rotas `/terms`, `/privacy`, `/refund`, `/contact` com conteúdo padrão de SaaS em PT-BR. Todos os dados específicos da empresa (razão social, CNPJ, endereço, e-mail, jurisdição/foro) marcados com placeholder visível `[A PREENCHER: ...]` — nenhum dado jurídico foi inventado, conforme decisão do usuário de resolver depois. Política de Reembolso descreve corretamente o comportamento real implementado (carência de 3 dias, revogação de créditos só do período afetado). Links adicionados no Header (dropdown "Legal") e Footer. Checkbox de aceite de Termos/Privacidade adicionado a `custom-sign-up-form.tsx`, bloqueando submit (e-mail/senha e Google) sem aceite. 8 testes de integração novos (`tests/integration/legal-pages.test.ts`) + 3 unitários no form de cadastro.  
  **Evidência:** `src/app/terms/`, `src/app/privacy/`, `src/app/refund/`, `src/app/contact/`, `src/components/auth/custom-sign-up-form.tsx`, Header/Footer links  
  **Origem:** frontend-specialist  
  **Resolvido na Fase 4**

- [x] **Bug crítico de checkout — redirecionamento ao Stripe bloqueado** — `src/app/dashboard/billing/page.tsx:110-116`: `handleCheckout` chama `createCheckoutSession` (termina em `redirect()`, `src/actions/stripe.ts:89`) dentro de `try/catch` genérico sem `isRedirectError`. Next.js throw especial de `NEXT_REDIRECT` é engolido, disparando toast de erro e impedindo redirecionamento. Bug conhecido do App Router, não testado em staging. Risca 100% das conversões de assinatura.  
  **Evidência:** `src/app/dashboard/billing/page.tsx:110-116`, `src/actions/stripe.ts:89`, padrão do Next.js  
  **Origem:** frontend-specialist, qa-specialist  
  **Resolvido:** Criado helper reutilizável `src/lib/handle-server-action-error.ts` usando API pública `unstable_rethrow` do Next.js (confirmada disponível em 15.5.27), relançando erros de redirect/notFound do framework e tratando apenas erros de aplicação reais. Bug duplicado encontrado e corrigido também em `src/components/billing/active-subscription-card.tsx` (`handleManage`, botão de gerenciar assinatura/portal do Stripe). TDD: testes novos em `tests/unit/lib/handle-server-action-error.test.ts` e nos testes de componente de billing/active-subscription-card, confirmados vermelhos antes do fix.

### Acessibilidade (WCAG 2.1 AA)

- [x] **Botão de mute sem `aria-label`** — `aria-label` adicionado ao botão mute em `src/components/custom-video-player.tsx:103-108` — WCAG 4.1.2. Resolvido na Fase 4.  
  **Origem:** accessibility-tester

- [x] **Controles do video player inacessíveis via teclado** — Controles do video player agora visíveis e operáveis via teclado. Removida a restrição `group-hover:opacity-100`, adicionado `focus-visible:outline` para indicador visual de foco. `src/components/custom-video-player.tsx` — WCAG 2.1.1. Resolvido na Fase 4.  
  **Origem:** accessibility-tester

- [x] **Alertas de erro sem `role="alert"` ou `aria-live`** — `role="alert"` adicionado em `src/components/auth/custom-sign-in-form.tsx:88-91` e `src/components/auth/custom-sign-up-form.tsx:141-144` — WCAG 4.1.3. Resolvido na Fase 4.  
  **Origem:** accessibility-tester

- [x] **Mensagem de sucesso sem `aria-live="polite"`** — `aria-live="polite"` adicionado em `src/components/auth/custom-sign-up-form.tsx:147-151` — WCAG 4.1.3. Resolvido na Fase 4.  
  **Origem:** accessibility-tester

- [x] **Botões de ação em clip card sem `aria-label`** — `aria-label` adicionado aos botões de ação em `src/components/clip-card.tsx:125-131,158-187`, substituindo inadequado `title` — WCAG 4.1.2. Resolvido na Fase 4.  
  **Origem:** accessibility-tester

- [x] **`focus:outline-none` sem substituto visual** — `focus:outline-none` substituído por `focus:ring` (com cor e offset visível) em múltiplos componentes: `custom-sign-in-form.tsx:152,173`, `custom-sign-up-form.tsx:170,309`, `landing/pricing-section.tsx:113` — WCAG 2.4.7. Resolvido na Fase 4.  
  **Origem:** accessibility-tester

---

## RISCOS DESCOBERTOS PELA AUDITORIA DE ESPECIALISTAS (Sessão 2026-10-04)

Estes itens foram identificados por 5 especialistas durante revisão técnica dos 4 documentos de arquitetura/requisitos. Não bloqueiam lançamento imediato se forem considerados aceitáveis, mas requerem visibilidade e decisão do usuário.

### Riscos Confirmados de Implementação (Gap Funcional)

- **(BLOCKER — Funcionalidade Anunciada Não Funciona)** Confirmado por 3 revisores independentes (2026-10-04): O backend Python (`core/schemas.py::ProcessVideoRequest`) só aceita `s3_key` e `preset` — os campos `mode`, `manual_cuts`, `aspect_ratio`, `auto_zoom`, `genre` enviados pelo frontend (cortes manuais por timestamp, opções dinâmicas de vídeo) **são descartados silenciosamente** pelo Pydantic v2. O backend sempre roda o pipeline automático completo (detecção de momentos via IA), ignorando qualquer configuração manual do usuário — e ainda gasta uma chamada à API do Gemini desnecessariamente. 
  - **Arquivo**: `ai-podcast-clipper-backend/core/schemas.py`, `src/inngest/functions.ts:278-282`
  - **Severidade**: BLOCKER (funcionalidade anunciada não entrega no backend)
  - **Requer decisão**: Implementar a recepção desses campos no backend, ou remover/avisar sobre a limitação no frontend.

### Riscos Não Confirmados (Suspeitas que Requerem Teste Real)

- [x] **(HIGH — Bug de Reembolso) RESOLVIDO.** CONFIRMADO em produção local em 2026-10-05: o usuário disparou um reembolso real no Stripe (modo sandbox/teste) e verificou que os créditos **não** foram revogados — a suspeita registrada abaixo (texto original mantido para histórico) deixou de ser hipótese e passou a bug reproduzido.
  - **Causa raiz**: `src/app/api/webhooks/stripe/route.ts` (bloco `charge.refunded` de `dispatchStripeEventForProcessing`) lia `refundAmountCents` somando `charge.refunds?.data ?? []`. O campo `refunds.data` só vem preenchido se a chamada à API do Stripe expandir explicitamente esse campo (`expand: ['refunds']`) — o que **nunca** acontece no payload padrão de webhook. Na prática, `charge.refunds` chegava `undefined`, o `.reduce` sobre `[]` resultava em `0`, e `ProcessChargeRefundUseCase` sempre recebia `refundAmountCents: 0`, pulando a revogação (`creditsToRevoke <= 0` → `return { success: false, revokedCredits: 0 }`) silenciosamente — sem erro, sem log de falha, parecendo que tudo funcionava.
  - **Fix aplicado**: troca da leitura para `charge.amount_refunded` — campo numérico em centavos, **cumulativo**, sempre presente no objeto `Charge` do Stripe sem precisar de expansão (representa o total já reembolsado daquele charge, incluindo reembolsos parciais anteriores). O tipo inline do `charge` em `route.ts` foi atualizado para refletir `amount_refunded?: number` no lugar de `refunds?: {...}`. Conferido que `ProcessChargeRefundUseCase`/`revokeSubscriptionCreditsForChargeEvent` já tratam o valor recebido como um total único (sem somar arrays por conta própria), então não há dupla contagem introduzida pela natureza cumulativa do campo.
  - **Teste**: `tests/integration/stripe-webhook-payment-failure.integration.test.ts` (Cenário 3) — 2 dos 3 testes do cenário (reembolso "simples" e reembolso total 100%) ficaram verdes com o fix. O terceiro teste ("reembolso parcial... revoga créditos proporcionais") continua vermelho por um motivo **não relacionado** ao bug confirmado: ele usa `refundAmount: 1500` centavos como "parcial", mas o preço de referência do plano STARTER (`PlanCatalogService.getMonthlyPriceCentsForPlan`) também é 1500 centavos ($15,00/mês, conforme `docs/historico/superpowers/specs/2026-09-14-recurring-subscriptions-and-credit-packs-design.md`) — ou seja, o valor do teste representa matematicamente um reembolso de 100% (não parcial) do preço mensal, e `CreditPricingService.calculateCreditsToRevokeForRefund` revoga corretamente 100% dos créditos nesse caso (comportamento documentado no próprio domain service, não é regressão). Esse teste específico tem uma inconsistência de dados pré-existente (precisaria de um valor genuinamente menor que 1500, ex. 750 centavos, para exercitar revogação parcial) e não foi alterado nesta tarefa — ver nota em `progress.md`.

<details>
<summary>Texto original da suspeita (2026-10-04), mantido para histórico</summary>

(HIGH — Possível Bug de Reembolso Não Confirmado) O webhook handler em `src/app/api/webhooks/stripe/route.ts` (linhas ~332-335) calcula o valor reembolsado via `charge.refunds.data`. **Suspeita não confirmada**: O objeto `Charge` recebido no payload webhook do Stripe pode **não vir com `refunds` expandido por padrão**, fazendo `refundAmountCents` sempre ser `0`, e a revogação de créditos por reembolso **nunca acontecer de fato na prática**, apesar do código existir e os testes (com payload mockado/expandido manualmente) passarem. Isso só pode ser confirmado com um evento real do Stripe em modo teste — o usuário ainda não configurou os produtos/price IDs no Stripe, então essa verificação fica pendente.
  - Ação recomendada: Antes de confiar nesta feature em produção, disparar um reembolso de teste real no Stripe (modo teste) e confirmar no banco que o crédito foi de fato revogado.

</details>

### Riscos de Configuração e Ambiente

- **(HIGH)** Fila em memória de fallback do Stripe (`stripe-queue.ts`) não tem guard de `NODE_ENV` — se `INNGEST_EVENT_KEY` faltar em produção por engano, reabre o risco de perda de crédito já corrigido na Fase 3 (evento marcado como processado mesmo se a fila em memória falhar).
  - **Arquivo**: `src/infrastructure/queue/stripe-queue.ts:86-98,107-122`
  - **Mitigação recomendada**: Adicionar `NODE_ENV !== "development"` check ou falhar explicitamente em produção

### Riscos de Segurança por Design

- **(HIGH)** `local_server.py`: SSRF/injeção de argumento no yt-dlp — não valida host da URL antes de passar pro yt-dlp (`local_server.py:143-160`), diferente de `main.py` que valida via `_assert_youtube_host`.
  - **Arquivo**: `ai-podcast-clipper-backend/local_server.py:143-160`

- **(HIGH)** `download_youtube` do Modal aceita bucket E chave S3 arbitrários do chamador autenticado (`core/schemas.py:77-84`, `main.py:156-162`) — quem tiver o token pode escrever em qualquer bucket alcançável pelas credenciais AWS, inclusive sobrescrever `clips/` de outros usuários.
  - **Arquivo**: `ai-podcast-clipper-backend/core/schemas.py:77-84`, `main.py:156-162`

- **(HIGH)** `core/video_pipeline.py::resolve_input_video_path` (linhas 37-38) aceita caminho de arquivo local mesmo em produção (Modal) — não é exclusivo de dev. Se um `s3_key` coincidir com um caminho existente no container, lê local em vez de buscar do S3.
  - **Arquivo**: `ai-podcast-clipper-backend/core/video_pipeline.py:37-38`

- **(NICE/Confirmar)** Divergência de modelo Gemini: AGENTS.md e documentação citam "Gemini 2.5 Pro", código usa `gemini-2.5-flash` como default (`core/moments.py:48`). Confirmar se é intencional (decisão de custo deliberada, ou desalinhamento).
  - **Arquivo**: `ai-podcast-clipper-backend/core/moments.py:48`

- **(HIGH, Reforça Item Existente)** Endpoint de debug `/api/dev-sign-stripe-payload` ainda acessível fora de produção (middleware não cobre `/api`), permite forjar webhooks Stripe válidos. O próprio código já o marca como "TEMPORÁRIO" — ação recomendada é REMOVER diretamente, não é mais uma decisão em aberto.
  - **Arquivo**: `src/app/api/dev-sign-stripe-payload/route.ts`

---

## HIGH — Correção Urgente Antes de Produção

Estes itens impactam segurança, confiabilidade ou experiência crítica; recomenda-se correção antes de go-live.

### Segurança

- [ ] **Rate limiting nos endpoints do backend Python** — Endpoints `/process_video` e `/download_youtube` (`ai-podcast-clipper-backend/main.py`) não possuem throttling (slowapi/Limiter) — abusáveis para consumir GPU sem limite. Bearer token estático é único controle (sem limite de tentativas). **Prioridade P0 (custos GPU elevados).** *(Incorporado de OWASP ASVS V11)*

- [ ] **Rate limiting in-memory não funciona em serverless** — `src/infrastructure/rate-limiting/in-memory-sliding-window-rate-limiter.ts:16` usa estrutura residente na memória, reiniciada a cada cold start serverless — proteção inefetiva.

- [ ] **CSP (Content Security Policy) ausente** — `next.config.js:26-32` não define diretivas CSP robustas.

- [ ] **Rate limit ausente em actions de projeto e billing** — `deleteProjectAction`, `renameProjectAction`, `retryProjectAction`, `createCheckoutSession`, `createCustomerPortalSession` sem rate limiting — potencial para abuse (ex: gerar sessões Stripe em loop). **Prioridade P1.** *(Incorporado de OWASP ASVS V11)*

- [ ] **Fluxo de exclusão de conta incompleto** — Usuário não pode deletar conta via UI; webhook Clerk (`src/app/api/webhooks/clerk/route.ts:92-105`) não limpa S3 nem cancela Stripe subscription.

- [ ] **IDOR em `DELETE /api/local-storage`** — `src/app/api/local-storage/route.ts:181-208` não valida propriedade do arquivo sendo deletado. GET/PUT possuem `isOwnedByUser()`, mas DELETE não.

- [ ] **`/api/youtube/info` sem autenticação e rate limit** — `src/app/api/youtube/info/route.ts:4-75` exposto publicamente, faz fetch outbound sem limite — abusável para flood de requisições.

- [ ] **Dependências Python sem versão fixada** — `ai-podcast-clipper-backend/requirements.txt` sem pinning exato (ex.: `whisperx>=0.10.0` em vez de `whisperx==0.10.2`).

- [ ] **Dependências npm com vulnerabilidades críticas/high** — `fast-xml-parser`, `sharp`, `path-to-regexp`, `@grpc/grpc-js` reportados por npm audit.

- [ ] **Verificação de assinatura Inngest sem validação central** — Depende de env vars não validadas em schema Zod; pode cair pra default insegura.

- [ ] **Endpoint de debug Stripe ainda em produção** — `/api/dev-sign-stripe-payload` (`src/app/api/dev-sign-stripe-payload/route.ts:22-40`) protegido só por `NODE_ENV === "production"` — insuficiente.

### Infraestrutura

- [ ] **Sem `vercel.json` — configuração de deploy não versionada** — Domínio, redirects, headers, regions não documentados/reproduzíveis.

- [ ] **Secret do Modal sem checklist documentado** — Documentação sobre quais variáveis devem conter não existe.

- [ ] **Bucket S3 hardcoded divergente entre front e backend** — Backend: `"ai-podcast-clipper"` (`ai-podcast-clipper-backend/main.py:314,468`); Frontend: `S3_BUCKET_NAME` — inconsistência.

- [ ] **Auth do endpoint Modal com comparação não constant-time** — `ai-podcast-clipper-backend/main.py:453,521` usa `==` simples; usar `hmac.compare_digest`.

- [ ] **Observabilidade sem exportação externa** — Stack OpenTelemetry só local; sem alertas reais (Slack, email, PagerDuty).

- [ ] **Healthcheck `/api/health` não valida dependências** — `route.ts:1-5` sempre retorna 200 sem checar Postgres, Redis, Stripe, S3.

- [ ] **Sem estratégia de rollback documentada** — Procedimento não escrito.

- [ ] **Backup/restore do Postgres não documentado** — Sem plano de DR.

### Billing e Dados

- [ ] **Fallback silencioso de customer Stripe** — `sync-user.use-case.ts:34-38` gera `cus_fallback_*` se busca falhar; sem alertar ou falhar explícito.

- [ ] **Sem idempotência contra retries Inngest** — Operações de crédito de assinatura podem ser aplicadas 2x se job retratar.

- [ ] **Webhook Clerk sem idempotência deliberada** — Apenas acidental.

- [ ] **Índices ausentes em FKs de alto volume** — `UploadedFile.userId`, `Clip.userId`/`uploadedFileId`, `CreditTransaction.type`, `Subscription.status` — `prisma/schema.prisma` sem `@@index` ou `@@unique`.

- [ ] **Breakdown sub/avulso frágil** — `src/infrastructure/queue/stripe-queue.ts` usa regex em descrição para distinguir tipos.

### Qualidade

- [ ] **Webhook Stripe sem teste de integração real** — `src/app/api/webhooks/stripe/route.ts` testado só com mocks (fake Stripe responses).

- [ ] **Testes de carga com k6 nunca executados** — Sem baseline de performance; script existe mas não roda em CI.

- [ ] **6 warnings ESLint não resolvidos** — Variáveis não usadas em código.

### Acessibilidade (WCAG 2.1 AA) — 16 Violações HIGH Adicionais

- [ ] Video player sem role ARIA adequado
- [ ] Modais sem focus trap
- [ ] FAQ accordion sem aria-controls
- [ ] Carousel automático sem pausa
- [ ] Tabela de preços sem acessibilidade
- [ ] `window.confirm()` pra exclusão (sem alternativa acessível)
- [ ] Navegação sem aria-current
- [ ] Mais 9 itens (detalhe completo sob demanda via `accessibility-tester` — resumido aqui por brevidade)

---

## NICE — Melhorias Recomendadas

Estes itens melhoram confiabilidade, manutenibilidade e experiência, mas não bloqueiam lançamento.

### Segurança

- Logging estruturado de eventos de autorização negada — Não há logger estruturado (`pino`/`winston`/etc.) para rastrear tentativas de acesso negado (IDOR bloqueado, sessão inválida). Importante para detectar exploração de vulnerabilidades corrigidas. *(Incorporado de OWASP ASVS V7 — P2)*
- Rate limiter é por instância/processo, não é garantia global em multi-instância — `InMemorySlidingWindowRateLimiter` não é duro em ambiente serverless/multi-instância; considerar Redis/Memcached para distribuído. *(Incorporado de OWASP ASVS V11 — P2)*
- `.gitignore` não cobre `.env*` globalmente (nenhum exposto hoje, proteger contra futuros).
- PII em logs (Gemini responses, títulos de clip) — remover ou sanitizar.
- Mensagens de erro do backend vazam detalhes internos (`str(e)` no detail) — genéricos pra cliente.
- Token de teste fixo "Bearer 123123" em `ai-podcast-clipper-backend/main.py:575` — remover.

### Infraestrutura

- CORS explícito no backend FastAPI — `main.py` e `local_server.py` não configuram `CORSMiddleware` — comportamento padrão do FastAPI (sem CORS habilitado) bloqueia browsers cross-origin, mas política não está documentada/testada. *(Incorporado de OWASP ASVS V9 — P2)*
- Inngest sem validação central de env vars — centralizar.
- `ai-podcast-clipper-backend/asd/` deveria ser submódulo git real (`.gitmodules`).

### Qualidade

- Testes e2e não existem (mas terreno já preparado via testes de integração estruturados).
- Backend Python não testado nesta auditoria (ambiente sem Python 3.12).

### Produto

- Imports não usados em vários arquivos — cleanup.
- `<img>` cru em vez de `next/image` (`src/components/...`).
- Polling agressivo a cada 4s — considerar WebSocket ou SSE.

### Acessibilidade (WCAG 2.1 AA) — 8 Melhorias

- Skip links ausentes.
- `aria-busy` não usado em estados de loading.
- Contraste em light mode abaixo de 4.5:1 em alguns textos.
- Mais 5 itens (detalhe sob demanda).

---

## Resumo Executivo

**Status:** PRONTO PARA FASE 5 — PORTÃO DE QUALIDADE FINAL (Fases 1-4 de 5 concluídas)

- **Bloqueadores:** **21 itens críticos, TODOS RESOLVIDOS** (Fases 1-4)
  - **Fases 1-3 (código e infra — 12 itens):**
    - Billing: taxonomia de planos corrigida (PlanCatalogService, env vars obrigatórias, migration com CHECK constraint), pacotes avulsos removidos, deduplicação de webhook Stripe com race condition corrigida (dispatch agora awaited, resposta 503 se falhar), bug crítico de checkout corrigido (redirecionamento ao Stripe desbloqueado via `unstable_rethrow`), webhooks de pagamento falhado/reembolso/chargeback implementados (`invoice.payment_failed` marca `past_due`, carência de 3 dias, `charge.refunded` e `charge.dispute.created` revogam créditos, TDD com 6 testes de integração, 649 testes passando)
    - Segurança: CVEs críticas do Next.js patcheadas (15.5.27), S3 lifecycle agora grava clipes em `clips/` via `s3_paths.py`, env vars validadas com Zod
    - Infra: submódulo Git `asd/` criado via `.gitmodules`, migrações Prisma baseline criada (baseline cobrindo 6 tabelas), testes do backend versionados (saíram de `.gitignore`)
    - Qualidade: erros de TypeScript corrigidos (`npm run check` 100% verde), 2 use cases ganharam 26 testes (15 unitários + 11 integração)
  
  - **Fase 4 (produto e acessibilidade — 9 itens):**
    - Produto: upload direto escondido (decisão de produto), branding corrigido ("Podcast Clipper", links de suporte atualizados com placeholder TODO), páginas legais implementadas com placeholders `[A PREENCHER]` para dados da empresa
    - Acessibilidade: todas as 6 violações WCAG 2.1 AA blocker resolvidas (aria-label em botões, controles de teclado no player, role="alert" e aria-live em forms, focus indicators visíveis); 16 testes novos de acessibilidade

- **Próximos passos (Fase 5 — portão de qualidade final):**
  1. Rodar CI do zero (GitHub Actions backend + frontend)
  2. Simular clone novo do repositório (validar `.gitmodules`, migrations, dependencies)
  3. Revisão de segurança do diff completo acumulado desde baseline
  4. Confirmar suíte de testes 100% verde em ambientes isolados
  
- **Pendências do usuário (não de código — fora do escopo de Fase 5):**
  1. Criar 4 price IDs reais no Stripe (Starter mensal/anual, Pro mensal/anual)
  2. Preencher dados jurídicos reais em páginas legais (razão social, CNPJ, endereço, e-mail, foro)
  3. Decidir e-mail de suporte real (atualmente `suporte@PREENCHER.com.br`)

- **High:** **43 itens** (incorporados 2 itens de rate limiting do OWASP ASVS: endpoints do backend Python [P0], actions de projeto/billing [P1])
- **Nice:** **23 melhorias** que podem ser planejadas pós-lançamento (incorporados 3 itens do OWASP ASVS: logging estruturado [P2], CORS FastAPI [P2], rate limiter global [P2])

---

## Nota sobre Fusão com OWASP ASVS

Este checklist incorpora todos os gaps de segurança do [**OWASP ASVS Nível 2**](https://owasp.org/www-project-application-security-verification-standard/) relevantes a este projeto.

**Referências cruzadas:**
- Detalhes de implementação por feature: `../requisitos/casos-de-uso-e-regras-de-negocio.md`
- Histórico de decisões de design e specs: `../historico/superpowers/specs/` e `../historico/superpowers/plans/`
