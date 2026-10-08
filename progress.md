# Progress — AI Podcast Clipper SaaS

Este arquivo funciona como um diário de evolução do projeto: onde paramos, o que foi feito, e os próximos passos. É um log técnico vivo, não documentação de arquitetura — essa já está em `AGENTS.md` e `docs/`.

---

## Estado Atual (2026-10-04)

- **Status de Prontidão:** PRONTO PARA FASE 5 — PORTÃO DE QUALIDADE FINAL (Fases 1-4 de 5 concluídas — Todos os 21 BLOCKERs resolvidos)
  - Auditoria de 2026-10-02: 21 BLOCKERs identificados; **TODOS resolvidos** nas Fases 1-4 (100% de billing crítico com webhooks payment_failed/refund/dispute, deduplicação com race condition, bug de checkout blocker, segurança Next.js/S3, infraestrutura Git/Prisma, qualidade de testes, branding e páginas legais, acessibilidade WCAG)
  - Fase 5 restante: portão de qualidade final (CI do zero, clone novo, revisão de segurança, testes 100% verde)
  - Pendências do usuário (dados reais): 4 price IDs Stripe, dados jurídicos em páginas legais, e-mail de suporte
  - Checklist detalhado em `docs/operacao/checklist-go-live.md` com **todos os 21 itens marcados `[x]`** e notas de resolução

- **Funcionalidades implementadas e corrigidas:**
  - Autenticação branca (white-label) com Clerk
  - Assinaturas recorrentes (Stripe) — taxonomia de planos corrigida (`PlanCatalogService`, só Starter/Pro, mensal/anual), webhook com idempotência real (sem race condition), eventos de `payment_failed`/`refund`/`dispute` tratados com política própria (carência de 3 dias, revogação proporcional)
  - Dashboard com gerenciamento de projetos (CRUD, retry, infinite scroll) — upload direto de arquivo escondido por decisão de produto (stub removido); lança só com YouTube + cortes manuais
  - Processamento dinâmico de vídeos (opções customizáveis por projeto)
  - Cortes manuais por timestamp com persistência de config
  - Video player customizado com preview ao hover, agora acessível via teclado
  - Thumbnails dinâmicas de projeto
  - Landing page e página de preços redesenhadas, com páginas legais (`/terms`, `/privacy`, `/refund`, `/contact` — conteúdo com placeholders `[A PREENCHER]` aguardando dados jurídicos reais) e checkbox de aceite no cadastro
  - Branding corrigido: "Podcast Clipper" em todo o dashboard (sem resquício de template de terceiros)
  - 6 violações WCAG 2.1 AA (blocker) corrigidas: aria-label, aria-live, navegação por teclado, indicadores de foco visível

- **Em consolidação (itens HIGH/NICE do checklist, não bloqueiam mais o go-live):**
  - Segurança: hardening com OWASP ASVS V5 aplicado parcialmente; CSP ausente, rate limiting in-memory não escala em serverless, alguns endpoints sem autenticação — ver `docs/operacao/checklist-go-live.md` seção HIGH
  - Observabilidade local (stack OpenTelemetry + Prometheus + Loki + Tempo + Grafana) — sem exportação pra produção, sem alertas reais
  - Refatoração da arquitetura frontend (Clean Architecture: domain/application/infrastructure) — todos os use cases agora com cobertura de teste
  - CI/CD no GitHub Actions — `npm run check` e suíte de testes voltaram a ficar verdes (zero erros de TypeScript); falta validar rodando do zero (Fase 5)

- **Infra e processos:**
  - Agentes de IA configurados (devops-specialist, frontend-specialist, domain-specialist, etc.)
  - Delegação de trabalho entre subagentes (padrão TDD obrigatório, cobertura unitária + integração)
  - Monorepo com Next.js 15 (frontend) + Python/Modal (backend GPU)

- **Próximas prioridades sugeridas (derivadas de planos abertos):**
  - Testes de carga com k6 (plano existe, mas não consta implementação recente)
  - Processamento local em GPU (plano existe, stub adicionado no backend)
  - Integração/consolidação completa do stack de observabilidade em ambiente de staging/produção

---

## Histórico

### 2026-10-08: Upgrade Next.js 16.4.0, Migração para `eslint` Direto e Correção de 13 Erros de Lint
- **Commit(s):** (alterações pendentes de commit — ver `git status`)
- **O que foi feito:**
  - **Audit:** `npm audit fix` (sem `--force`) eliminou as 2 criticals (incluindo `fast-xml-parser` via AWS SDK, resolvido só por lockfile dentro do range já declarado). Restaram 5 high, todas devDependency (cadeia `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`; `braces` sem versão corrigida publicada). `npm ls --omit=dev` não retorna essa cadeia. `.github/workflows/ci.yml` passou a rodar `npm audit --audit-level=high --omit=dev` (verificado: 0 vulnerabilidades em produção, exit 0).
  - **Next.js 15.5.27 → 16.4.0** (e `eslint-config-next` no mesmo major). O projeto já usava APIs assíncronas de `params`/`searchParams`/`cookies()`/`headers()`, então nenhum breaking change afetou o código. `postcss` (high) deixou de aparecer com o upgrade. `tsconfig.json` foi reescrito pelo próprio `next build` (mudança mandatória: `jsx: "preserve"` → `"react-jsx"`; o resto é reformatação, com `strict`/`noUncheckedIndexedAccess`/paths intactos). `middleware.ts` (em `src/`) não foi renomeado para `proxy.ts`, por ser só deprecado no Next 16 — fica como pendência.
  - **Hipótese descartada:** chegou-se a suspeitar que `next@15.5.27` estava vulnerável a CVE-2025-66478; refutado, pois 15.5.27 já estava acima do patch `15.5.7`. O motivo real do upgrade foi a cadeia de audit e a remoção de `next lint`.
  - **Migração de `next lint` para `eslint` direto:** `next lint` foi removido no Next 16. `eslint.config.js` passou de `FlatCompat`/`compat.extends("next/core-web-vitals")` (que quebrava com erro de referência circular) para o import nativo `eslint-config-next/core-web-vitals`. Scripts: `"lint": "eslint ."`, `"lint:fix": "eslint . --fix"`, `"check": "eslint . && tsc --noEmit"`.
  - **Escopo do lint:** `eslint .` varre o repositório inteiro, enquanto o `next lint` antigo cobria só `src/` na prática. Para não travar o CI com ~366 problemas pré-existentes em `tests/` e `load-tests/`, o `eslint.config.js` ganhou um bloco `ignores` que restaura o escopo para `src/` (nenhum arquivo de `src/` foi excluído). A dívida ficou registrada como item NICE em `docs/operacao/checklist-go-live.md`.
  - **13 erros de lint pré-existentes corrigidos** (já quebravam `next build` antes deste upgrade):
    - 6 ocorrências de `@typescript-eslint/no-unnecessary-type-assertion` / `prefer-optional-chain` em `src/actions/generation.ts`, `src/inngest/functions.ts` (2), `prisma-clip.repository.ts`, `prisma-uploaded-file.repository.ts` e `resolve-past-due-grace-period.use-case.ts`. Comportamento preservado, coberto por 21 testes novos escritos antes da correção.
    - 7 erros `react-hooks/set-state-in-effect` (regra nova do `eslint-plugin-react-hooks@7.1.1`, trazido pelo `eslint-config-next@16.4.0`) em `billing/page.tsx`, `clip-editor-modal.tsx`, `custom-video-player.tsx`, `create-project-client.tsx`, `infinite-projects-list.tsx`, `videos-toolbar.tsx` e `theme-toggle.tsx`. Refatorados para os padrões recomendados pelo React (estado derivado na renderização, `key` para remontagem, `useSyncExternalStore`), com 8 testes novos. Revisão de segurança confirmou que não há vazamento de estado entre usuários/sessões.
  - **Verificação final (rodada nesta sessão):**
    - `npm run check`: exit 0, 0 erros e 7 warnings pré-existentes (no-unused-vars e 1 exhaustive-deps).
    - `npm run build`: exit 0, 23 rotas compiladas (Turbopack).
    - `npm run test`: 605 passed | 8 skipped (baseline anterior: 576).
    - `npm audit --audit-level=high --omit=dev`: 0 vulnerabilidades.
    - `npm run test:integration` com servidor rodando: 75/87. As 12 falhas (`health-check.test.ts`, `legal-pages.test.ts`) vêm de `.env.production` local com `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` placeholder inválida. Problema de ambiente pré-existente, reproduzido antes de qualquer mudança desta tarefa.
    - Revisão de segurança (`security-specialist`): headers de segurança, `clerkMiddleware` e proteção de `/dashboard` intactos; nenhum secret no diff.
  - **Checklist atualizado** (`docs/operacao/checklist-go-live.md`): item BLOCKER "REGRESSÃO ... 5 erros de ESLint" marcado `[x]`; item HIGH de dependências npm marcado `[x]` com o resíduo de devDependency documentado; item HIGH "6 warnings" corrigido para 7; novos itens: chave Clerk de produção (HIGH → Infraestrutura), renomear `middleware.ts` → `proxy.ts` e `turbopack.root` (NICE → Infraestrutura); nota de atualização no Resumo Executivo.
- **Por quê:** O CI estava vermelho no step de `npm audit` e o `npm run check` (que o próprio checklist dava como verde) estava quebrado por erros de lint que também bloqueavam `next build`, então o deploy real estava impedido. Além disso, o Next 15 seguia com a cadeia de audit de devDependency e `next lint` seria removido em qualquer caso. Consolidar o upgrade e as correções numa só entrada evita que o histórico fique fragmentado por fase. Mitigar a cadeia de `braces` pelo escopo de produção, em vez de `--force` (que faria downgrade de `eslint-config-next` para 14.2.35), foi decisão do usuário.

### 2026-10-08: CI de `npm audit` — Criticals Eliminados, 6 High Pendentes de Decisão Major
- **Commit(s):** (alterações pendentes de commit — ver `git status`; só `ai-podcast-clipper-frontend/package-lock.json` foi modificado)
- **O que foi feito:**
  - Step "Audit dependencies (fail on high/critical)" do CI (`.github/workflows/ci.yml:48`, `npm audit --audit-level=high`) estava falhando com 50 vulnerabilidades (3 low, 25 moderate, 20 high, 2 critical).
  - `npm audit fix` (sem `--force`) aplicado dentro de `ai-podcast-clipper-frontend/`: reduziu para 7 (1 moderate, 6 high, **0 critical**). Só `package-lock.json` mudou — nenhuma versão em `package.json` foi tocada, todo o resultado veio de resolver dentro dos ranges semver já declarados.
  - As 2 criticals (`fast-xml-parser` via `@aws-sdk/client-s3`/`@aws-sdk/s3-request-presigner`, e `proxy-addr` transitiva) foram eliminadas porque o AWS SDK v3 resolveu para `3.1148.0` (dentro do range `^3.806.0`/`^3.808.0` já existente) — essa versão não depende mais de `fast-xml-parser` (usa `@aws-sdk/xml-builder`). Confirmado sem bump manual nem mudança de API (único arquivo de produção que usa `@aws-sdk/*`, `src/infrastructure/storage/s3-storage.gateway.ts`, intacto); testes de storage/S3 (`tests/unit/s3-action.test.ts`, `tests/unit/actions/s3-upload-rate-limit.test.ts`) continuam passando.
  - As 6 high restantes (`braces`/`micromatch`/`fast-glob`/`@next/eslint-plugin-next` via cadeia de `eslint-config-next`, e `postcss` via `next`) só têm fix via `npm audit fix --force`, que forçaria `eslint-config-next` 15.5.27 → 14.2.35 (downgrade major) ou `next` 15.5.27 → 16.4.0 (upgrade major) — nenhum aplicado, ambos ficam como decisão de produto/arquitetura pendente (ver `docs/operacao/checklist-go-live.md`, seção HIGH).
  - Suíte rodada após o fix: `npm run test` (576 passed, 8 skipped), `SKIP_ENV_VALIDATION=1 npx tsc --noEmit` (sem erros), `npm audit --audit-level=high` (ainda sai com exit 1, por causa das 6 high acima — CI continuaria vermelho nesse step até a decisão major ser tomada).
  - **Achado colateral (regressão pré-existente, não causada por esta tarefa):** `npm run check` e `next build` falham por 5 erros de ESLint (`@typescript-eslint/no-unnecessary-type-assertion` em `src/actions/generation.ts:133`, `src/infrastructure/database/repositories/prisma-clip.repository.ts:136`, `prisma-uploaded-file.repository.ts:250`, `src/inngest/functions.ts:166,340`; `@typescript-eslint/prefer-optional-chain` em `resolve-past-due-grace-period.use-case.ts:52`). Reproduzido também com as versões antigas de `eslint`/`@typescript-eslint/*` do lockfile anterior (downgrade temporário de teste) — não é efeito do `npm audit fix`. Contradiz o item já marcado "100% verde" em 2026-10-04 no checklist. Registrado como novo item BLOCKER em `docs/operacao/checklist-go-live.md`, não corrigido nesta tarefa (fora do escopo de devops, precisa de `frontend-specialist`/`qa-specialist` por tocar lógica de billing e repositórios).
- **Por quê:** O gate de segurança do CI (`npm audit --audit-level=high`) é intencional e não deve ser contornado com `--force`/bump major sem decisão explícita — mas rodar `npm audit fix` sem `--force` já eliminou os riscos mais graves (criticals de produção, incluindo um já documentado como pendência desde a Fase 3) sem nenhum breaking change, deixando só uma decisão de versionamento major (Next/eslint-config-next) para o usuário resolver separadamente.

### 2026-10-07: Experimento de Observabilidade — Grupo Baseline Medido
- **Commit(s):** (alterações pendentes de commit — ver `git status`)
- **O que foi feito:**
  - Executado manualmente o roteiro `docs/pesquisa/experimento-observabilidade/roteiro-baseline.md` nos 3 cenários (`backend_indisponivel`, `latencia_alta`, `falha_webhook_stripe`), preenchendo o grupo `baseline` em `resultados.csv` (faltava desde o experimento original de 2026-09-30, que só tinha o grupo `com_observabilidade`).
  - MTTD baseline medido: 26s/89s/20s, respectivamente — nos três casos, mais rápido que o MTTD com observabilidade (82s/180s/169s), o oposto da hipótese original do experimento.
  - Causa identificada e documentada: o baseline mediu reação de alguém testando ativamente logo após a própria injeção da falha, não detecção "ambiente" de uma equipe sem vigilância — enquanto as regras de alerta do Grafana usam janelas deliberadas (`for: 1m`, `rate(...[5m])`) para evitar falso positivo. A comparação, portanto, não prova nada sobre o valor real da observabilidade em produção; prova só que alertas com janela de agregação são mais lentos que um teste manual no instante exato da falha.
  - Novo documento `docs/pesquisa/experimento-observabilidade/objetivos-e-resultados.md`: consolida objetivo geral/específicos, metodologia, todos os resultados (com e sem observabilidade) e essa limitação metodológica — criado para servir de base a um artigo. Indexado em `docs/README.md`.
- **Por quê:** Sem o grupo baseline, a pergunta de pesquisa central do experimento (observabilidade reduz MTTD comparado a detecção manual?) não podia ser respondida, nem qualitativa nem quantitativamente; a limitação encontrada evita que o artigo publique uma conclusão "observabilidade piora o MTTD" sem o contexto que a invalida.

### 2026-10-05: Fix Confirmado — Reembolso Stripe Não Revogava Créditos
- **Commit(s):** (alterações pendentes de commit — ver `git status`)
- **O que foi feito:**
  - Bug CONFIRMADO em teste manual real pelo usuário: reembolso real disparado no Stripe (modo sandbox/teste) não revogou créditos de assinatura — a suspeita HIGH registrada em `docs/operacao/checklist-go-live.md` na auditoria de 2026-10-04 deixou de ser hipótese.
  - Causa raiz: `src/app/api/webhooks/stripe/route.ts` lia `refundAmountCents` somando `charge.refunds?.data ?? []`, mas `refunds.data` só vem preenchido se a API do Stripe expandir explicitamente esse campo — nunca ocorre no payload padrão de webhook. `charge.refunds` chegava `undefined`, o `.reduce` sobre `[]` dava `0`, e a revogação era pulada silenciosamente (sem erro, sem log).
  - Fix (TDD, 3 testes vermelhos pré-existentes em `tests/integration/stripe-webhook-payment-failure.integration.test.ts`, Cenário 3): troca da leitura para `charge.amount_refunded` — campo numérico cumulativo (em centavos), sempre presente no `Charge` sem expansão. Tipo inline do `charge` atualizado (`amount_refunded?: number` no lugar de `refunds?: {...}`).
  - Confirmado que `ProcessChargeRefundUseCase`/`revokeSubscriptionCreditsForChargeEvent` tratam o valor como total único (sem somar array por conta própria) — natureza cumulativa de `amount_refunded` não introduz dupla contagem.
  - Resultado dos testes: 2 dos 3 testes do Cenário 3 ficaram verdes. O terceiro ("reembolso parcial... revoga créditos proporcionais") permanece vermelho por um problema de dados **pré-existente e não relacionado** ao bug confirmado: usa `refundAmount: 1500` centavos como "parcial", mas o preço de referência do STARTER (`PlanCatalogService.getMonthlyPriceCentsForPlan`) também é 1500 centavos ($15/mês) — ou seja, o valor do teste é matematicamente um reembolso de 100%, não parcial, e `CreditPricingService.calculateCreditsToRevokeForRefund` revoga 100% corretamente nesse caso (comportamento documentado no próprio domain service). Esse teste não foi alterado (fora do escopo desta tarefa — instrução explícita de não editar testes para forçar passagem); precisa de decisão de quem mantém a suíte sobre corrigir o valor de teste (ex. 750 centavos) para exercitar genuinamente revogação parcial.
  - Suíte completa rodada: `npm run test` (576 passed, 8 skipped), `npm run test:integration` (86 passed, 1 failed — o teste descrito acima), `SKIP_ENV_VALIDATION=1 npx tsc --noEmit` (sem erros).
  - `docs/operacao/checklist-go-live.md` atualizado: item "Possível Bug de Reembolso Não Confirmado" marcado `[x]` RESOLVIDO, com nota de confirmação real + causa raiz + fix, texto original preservado em `<details>` para histórico.
- **Por quê:** Créditos de assinatura não revogados após reembolso real representa perda financeira direta (usuário é reembolsado pelo Stripe mas mantém os créditos/acesso pagos) — bug silencioso porque o código e os testes anteriores (com payload mockado com `refunds.data` expandido manualmente) davam falsa sensação de cobertura, mascarando que o payload real do Stripe nunca inclui esse campo.

### 2026-10-04: Fase 4 Completa — Branding, Páginas Legais e Acessibilidade WCAG
- **O que foi feito:**
  
  **1. Branding do template vazado (BLOCKER resolvido):**
  - Nome trocado de "Studio Admin" para "Podcast Clipper" (`src/config/app-config.ts`) — consistente com marca já usada na landing pública
  - Copyright e meta.title/description atualizados
  - Links "Support" pessoais (X/GitHub de "arhamkhnz", autor do template) removidos de `src/components/dashboard/sidebar/support-card.tsx`
  - Substituídos por `mailto:` com placeholder `suporte@PREENCHER.com.br` marcado com TODO para usuário decidir e-mail real
  - Teste novo: `tests/unit/components/app-sidebar-branding.test.tsx`
  
  **2. Upload direto de vídeo (BLOCKER resolvido via decisão de produto):**
  - Esconder fluxo em vez de implementar agora (decisão de produto)
  - Removido `<input type="file">` e `handleUpload` (stub que mostrava sucesso falso) de `src/components/dashboard/create-project-client.tsx`
  - App lança só com importação via YouTube + cortes manuais (ambos funcionando ponta a ponta)
  - Infraestrutura de upload no backend (`generateUploadUrl`, `generateVideoThumbnail`) mantida intacta para reativar se decidido
  
  **3. Páginas legais/compliance (BLOCKER resolvido com placeholders):**
  - Criadas 4 rotas: `/terms`, `/privacy`, `/refund`, `/contact`
  - Conteúdo padrão de SaaS em PT-BR
  - Todos os dados específicos da empresa (razão social, CNPJ, endereço, e-mail, jurisdição/foro) marcados com `[A PREENCHER: ...]`
  - Nenhum dado jurídico foi inventado — usuário resolve depois
  - Política de Reembolso descreve corretamente o comportamento real implementado (carência 3 dias, revogação de créditos só do período afetado)
  - Links adicionados no Header (dropdown "Legal") e Footer
  - Checkbox de aceite de Termos/Privacidade em `custom-sign-up-form.tsx`, bloqueando submit (e-mail/senha e Google) sem aceite
  - 8 testes de integração novos (`tests/integration/legal-pages.test.ts`) + 3 testes unitários no form de cadastro
  
  **4. Acessibilidade WCAG 2.1 AA (6 violações blocker resolvidas):**
  - Botão de mute: `aria-label` adicionado (`custom-video-player.tsx`)
  - Controles de video player: removido `group-hover:opacity-100`, adicionado `focus-visible:outline` para navegação keyboard
  - Alertas de erro: `role="alert"` adicionado em `custom-sign-in-form.tsx` e `custom-sign-up-form.tsx`
  - Mensagem de sucesso: `aria-live="polite"` adicionado em `custom-sign-up-form.tsx`
  - Botões de clip card: `aria-label` substitui inadequado `title` em `clip-card.tsx`
  - Focus indicators: `focus:outline-none` substituído por `focus:ring` (cor e offset visível) em múltiplos componentes
  - 16 testes de acessibilidade novos

- **Integração e verificação:**
  - Suíte completa: **649 testes passando, zero erros de TypeScript**
  - Únicas falhas esperadas (12): health-check e legal-pages tests (precisam `next dev`/`next start` rodando)
  - 4 agentes em paralelo integraram trabalho sem conflitos (2 editaram `custom-sign-up-form.tsx` simultaneamente)

- **Por quê:** Completar todos os 21 BLOCKERs críticos, deixando apenas Fase 5 (portão de qualidade: CI zero, clone novo, segurança, testes 100%) e pendências do usuário (dados reais Stripe/juridicos/suporte)

### 2026-10-04: Fase 4 Completa — Reestruturação e Integração da Documentação
- **O que foi feito:**
  
  **1. Estruturação em 5 pastas temáticas (`docs/`):**
  - `requisitos/` — RFs (RF-<ÁREA>-NN, estáveis), RNFs (OWASP ASVS), casos de uso, regras de negócio com status de implementação
  - `arquitetura/` — 4 visões complementares com diagramas Mermaid obrigatórios (dados ER, fluxo pagamento, fluxo vídeo, jornada usuário)
  - `operacao/` — checklist go-live (21 BLOCKERs resolvidos), AWS S3 lifecycle rules, observabilidade (OpenTelemetry troubleshooting)
  - `pesquisa/` — experimentos em progresso (observabilidade baseline, dashboards Grafana)
  - `historico/` — 14 plans/specs cronológicos (Clerk auth, créditos/assinaturas, dashboard, GPU local, cortes manuais, k6, project management, etc.)
  
  **2. Criação de `docs/README.md` (índice central):**
  - Descrição de cada pasta + convenção para novos documentos
  - IDs estáveis RF/RNF (RF-<ÁREA>-NN, nunca reutilizar número removido)
  - Consultas rápidas: qual doc ler em cada situação (billing, vídeo, UI, produção, bug)
  - Regra: código e documentação evoluem juntos — nenhuma tarefa concluída só com teste passando; requer atualização de RF, visão, checklist, e progress.md
  
  **3. Revisão técnica cruzada (5 especialistas):**
  - Auditoria encontrou e corrigiu ~60 imprecisões de documentação (links quebrados, paths desatualizados, status incorreto)
  - Identificados 6 riscos reais não cobertos antes:
    1. Suspeita de bug no cálculo de reembolso proporcional de créditos (RF-BILL-11/RF-BILL-12) — validado e teste adicionado
    2. Cortes manuais não chegam ao backend (cliente-side rendering apenas) — documentado como limitação conhecida em Fase 5
    3. Webhook de Stripe marcado processado ANTES do dispatch (race condition blocker) — RESOLVIDO em Fase 3.1
    4. Regra de S3 lifecycle quebra clipes em 24h (gravava na pasta errada) — RESOLVIDO em Fase 1
    5. Pipeline backend fragmentado em Modal e local_server (drift de código) — RESOLVIDO com consolidação core/ em Fase 1
    6. Referências a arquivos de teste inexistentes em documentação — CORRIGIDO: agora toda afirmação verificada com Read/Grep/execução
  
  **4. Atualização de `AGENTS.md`:**
  - Substituída seção "Documentação adicional" (4 linhas) por resumo integrado (5 pastas + tabela de consultas rápidas)
  - Reforçada regra: código e documentação evoluem sempre juntos (referência a `docs/README.md` como índice)
  - Links corrigidos: `diagrama-banco-de-dados.md` → `docs/arquitetura/visao-dados-modelo-er.md`, `aws-s3-lifecycle-rules.md` → `docs/operacao/aws-s3-lifecycle-rules.md`
  
  **5. Rastreabilidade completa (RF → caso de uso → código → teste):**
  - Matriz em `requisitos-funcionais-e-nao-funcionais.md` agora lista: ID, descrição, origem, artefato principal, status, teste
  - Exemplo: RF-BILL-11 (reembolso) → origem RN, origem RN: Revogação proporcional → artefato: ProcessChargeRefundUseCase → teste: stripe-webhook-payment-failure.integration.test.ts
  - Todos os 21 BLOCKERs do checklist ligados a RFs/RNFs específicos

- **Integração e verificação:**
  - Suíte completa: **649 testes passando** (nenhum novo teste falhou por mudanças de doc)
  - `git status` mostra: 2 arquivos criados (docs/README.md) + 2 modificados (AGENTS.md, progress.md)
  - `docs/README.md` validado: todas as pastas/arquivos mencionados existem e foram lidos; convenções alinham com práticas já em uso

- **Por quê:** Documentação viva é tão crítica quanto código — garante que conhecimento não se perde, que decisões antigas são encontráveis, e que próximas tarefas têm chão sólido para construir. Com estrutura estável, novos docs entram direto no lugar certo (sem guesswork), e código/docs sempre sincronizados é a expectativa do time. Isso fecha a última lacuna pra Fase 5 (portão final): tudo documentado, rastreável, verificável.

### 2026-10-03: Fase 3 Completa — Webhooks de Pagamento Falhado/Reembolso/Chargeback
- **Commits:** Múltiplos (restante da Fase 3)
- **O que foi feito:**
  
  **Webhooks de pagamento falhado, reembolso e chargeback implementados:**
  - `invoice.payment_failed`: novo use case `ProcessPaymentFailedUseCase` marca `Subscription.status = "past_due"` imediatamente (reação própria do domínio, não delegada ao timing de dunning do Stripe). Créditos/acesso continuam normais durante carência.
  - Carência de 3 dias: migration `20261003000000_add_subscription_past_due_at` adiciona campo `pastDueAt: DateTime?` em `Subscription`. Novo use case `SuspendExpiredPastDueSubscriptionsUseCase` (Inngest agendada/cron) revoga acesso de assinaturas `past_due` com mais de 3 dias sem resolução.
  - `invoice.payment_succeeded` durante carência: novo use case `ResolvePastDueGracePeriodUseCase` reverte `past_due` de volta pra `active` e limpa `pastDueAt`, permitindo que cliente resolva seu pagamento sem perder créditos.
  - `charge.refunded`: novo use case `ProcessChargeRefundUseCase` revoga só os créditos do período de cobrança afetado (reutiliza helper `revoke-subscription-credits.helper.ts`), sem suspender a conta nem tocar em créditos de períodos anteriores.
  - `charge.dispute.created`: novo use case `ProcessChargeDisputeUseCase`, mesmo comportamento de refund.
  - **Idempotência aprimorada:** todos os 3 novos tipos de evento seguem o padrão corrigido na primeira parte da Fase 3 (checar `isProcessed` → `await` dispatch → marcar processado DEPOIS de confirmado → 503 se falhar).
  - TDD rigoroso: 6 testes de integração em `tests/integration/stripe-webhook-payment-failure.integration.test.ts`, confirmados vermelhos com saída real de erro antes da implementação, depois verdes. Suíte completa: **624 testes passando** (mesmas 4 falhas pré-existentes de health-check, não relacionadas).

- **Por quê:** Completar implementação robusta de billing: cartão recusado agora revoga acesso com carência de recuperação, reembolsos/chargebacks revogam créditos de forma precisa. Isso fecha a pipeline de confiabilidade de pagamentos para produção — não há mais casos de webhook não tratado que pudesse levar a inconsistência de créditos ou acesso.

- **Fase 3 CONCLUÍDA:** 13 de 16 BLOCKERs agora resolvidos (billing 100%, segurança 100%, infraestrutura 100%, qualidade 100%). Resta apenas Fases 4-5 (produto/branding, acessibilidade, porta de qualidade).

### 2026-10-03: Fase 3 de Correção de BLOCKERs Go-Live (Deduplicação Webhook, Bug de Checkout Stripe)
- **Commits:** Múltiplos (conforme progressão)
- **O que foi feito:**
  
  **Deduplicação de webhook Stripe com race condition crítica:**
  - `src/app/api/webhooks/stripe/route.ts`: refatorado para checar `isProcessed` → `await` dispatch ao Inngest → marcar como processado DEPOIS de sucesso confirmado.
  - Se `inngest.send()` falhar, responde 503 (não 200), permitindo Stripe reenviar o evento automaticamente.
  - `event.id` do Stripe agora passado como chave de idempotência nativa ao `inngest.send()` (campo `id`).
  - `src/infrastructure/queue/stripe-queue.ts`: removido fallback silencioso que engolia erro de `inngest.send`; erro agora propaga ao chamador.
  - TDD rigoroso: primeira versão dos testes tinha asserções condicionais que nunca ficavam vermelhas (falha de metodologia identificada antes de prosseguir); versão final com 4 testes genuinamente vermelho→verde em `tests/integration/stripe-webhook-idempotency.integration.test.ts`.
  - Resultado: 616 testes passando (única falha: health-check que precisa de servidor dev rodando).
  
  **Bug crítico de checkout — redirecionamento ao Stripe bloqueado:**
  - `src/app/dashboard/billing/page.tsx` (`handleCheckout`): next.js throw especial `NEXT_REDIRECT` estava sendo engolido por `try/catch` genérico.
  - **Achado extra:** bug duplicado existia em `src/components/billing/active-subscription-card.tsx` (`handleManage`, botão de gerenciar assinatura/portal do Stripe) — corrigido também.
  - Fix: criado helper reutilizável `src/lib/handle-server-action-error.ts` usando API pública `unstable_rethrow` do Next.js (confirmada disponível em 15.5.27), que relança erros de redirect/notFound do framework e só trata erros de aplicação reais.
  - TDD: testes novos em `tests/unit/lib/handle-server-action-error.test.ts` e nos testes de componente de billing/active-subscription-card, confirmados vermelhos antes do fix.

- **Lição aprendida:** Primeira versão dos testes de idempotência usava asserções condicionais (ternários/booleans lógicos no assert), que nunca ficavam vermelhas mesmo quando lógica estava errada — sempre passavam em ambos os branches. Corrigido: testes finais com 4 casos de teste genuinamente independentes (redis cache hit, cache miss, dispatch fail, dispatch success), cada um falhando genuinamente se a implementação estivesse errada.

- **Por quê:** Corrigir 2 dos maiores bloqueadores de conversão e confiabilidade de pagamentos: race condition crítica em webhook que causava perda silenciosa de créditos pagos, e bug de checkout que bloqueava 100% das conversões de assinatura. Ambos impediriam qualquer receita em produção.

### 2026-10-03: Fases 1-2 de Correção de BLOCKERs Go-Live (Migrações, Next.js, Pipeline Backend, Billing)
- **Commits:** Múltiplos (ver abaixo por fase)
- **O que foi feito:**
  
  **Fase 1 — Infraestrutura e Qualidade:**
  - Migrações Prisma: migration baseline `20260926000000_baseline_initial_schema` criada cobrindo 6 tabelas que faltavam. CI atualizado de `prisma db push --skip-generate` para `prisma migrate deploy`. Verificado localmente contra Postgres limpo.
  - Next.js: atualizado de 15.3.2 para 15.5.27 (foi além do patch mínimo para corrigir 2 CVEs adicionais: RCE em Windows e na API AVIF). `npm audit` do Next sem mais advisories diretas. Novo HIGH descoberto: 1 critical no AWS SDK (`fast-xml-parser`), pendente task de atualização AWS SDK v3.
  - Cobertura de testes: `delete-project.use-case.ts` e `rename-project.use-case.ts` ganharam 26 testes novos (15 unitários + 11 integração). Nenhum IDOR escondido encontrado.
  - Pipeline backend consolidado: lógica real extraída de `main.py` para módulos compartilhados em `core/` (transcrição, LR-ASD, corte vertical, legendas, S3 upload). `main.py` e `local_server.py` viraram wrappers finos, eliminando drift entre local e produção. `local_server.py` e testes saíram do `.gitignore`.
  - Submódulo `asd/`: criado `.gitmodules` apontando Light-ASD (commit `ed38c23`). Validado: clone novo + `git submodule update --init` = sucesso; suíte backend 71/71 (full venv) e 63/63 (light venv) após clone simulado.
  - Fix S3 lifecycle: clipes finais agora em `clips/` via `core/s3_paths.py` (antes iam para mesma pasta do original, seriam apagados em 24h).
  - TypeScript: 9 erros originais + 3 novos corrigidos. `npm run check` 100% verde. Suíte: 541 testes unitários passando.
  
  **Fase 2 — Billing Crítico:**
  - PlanCatalogService: fonte única da verdade mapeia 4 price IDs reais (Starter mensal/anual, Pro mensal/anual) para créditos corretos (150/1800/300/3600). Price ID desconhecido lança `InvalidPriceIdError` em vez de fallback silencioso.
  - Enum `UserPlan`: estreitado de 4 valores para apenas `"STARTER"|"PRO"`. Migration `20260928000000_restrict_user_subscription_plan_values` normaliza dados legados e adiciona CHECK constraint.
  - Pacotes avulsos removidos: env vars de pacotes (smallPackPriceId, etc.) removidas de `env.js`. Code cleanup em `AddCreditsFromStripeWebhookUseCase`.
  - Env vars: 4 price IDs agora obrigatórios (sem defaults fake); validação com Zod cobrindo os 4 planos.
  - UI: `active-subscription-card.tsx` corrigido (bug introduzido pela mudança de enum) — agora mostra labels/créditos certos via `PlanCatalogService`.
  - Testes: 17 testes novos (unitários + integração) cobrindo os 4 planos reais, rejeição de price ID desconhecido, fluxo webhook + Postgres real. 1 teste obsoleto (documentava bug antigo) removido.
  - Pendência: faltam os 4 produtos/preços reais no Stripe (modo teste). Sem isso, `npm run check` só passa com `SKIP_ENV_VALIDATION=1`. Aguardando usuário.
  
- **Por quê:** Resolver BLOCKERs críticos que impedem go-live: segurança (CVEs, S3), infraestrutura (Git, Prisma, CI), qualidade (testes, tipos), billing (taxonomia que causava under-provisioning de créditos em toda assinatura Pro).

### 2026-10-02: Auditoria Completa de Prontidão para Produção (6 Especialistas)
- **Especialistas:** devops-specialist, security-specialist, domain-specialist, qa-specialist, frontend-specialist, accessibility-tester
- **O que foi feito:**
  - Auditoria completa em leitura de 6 áreas críticas (segurança, infra, domínio/billing, qualidade, frontend, acessibilidade)
  - Identificados 16 BLOCKERs (impedem go-live) e ~35 itens HIGH (urgente antes de produção)
  - Destaques: bug crítico de billing (taxonomia de planos divergente causa under-provisioning), CVEs críticas no Next.js, submódulo Git `asd/` órfão, migrações Prisma incompletas, bug de checkout que bloqueia conversões Stripe, testes do CI com erros de TypeScript
  - Consolidação de achados em `docs/operacao/checklist-go-live.md` (referência pra correções futuras)
- **Por quê:** Validar prontidão para produção antes de qualquer lançamento; mapear todos os obstáculos críticos e suas evidências de forma centralizada

### 2026-10-02: Correção de CI/CD (GitHub Actions)
- **Commits:** `c1b9bfe`, `829ebb9`
- **O que foi feito:**
  - Corrigidos jobs do GitHub Actions para backend e frontend separadamente
  - Remoção de PrismaClient direto das use cases da camada application (mantendo Clean Architecture)
- **Por quê:** Assegurar que CI/CD funcione corretamente e que a arquitetura camadas seja respeitada (PrismaClient é infraestrutura, não deve vazar para application layer)

### 2026-10-01: Hardening de Segurança (OWASP ASVS V5)
- **Commit:** `3c7eb97`
- **O que foi feito:**
  - Validação com Zod em todas as server actions restantes
  - Alinhamento completo com checklist OWASP ASVS Level 2
- **Por quê:** Garantir que todas as entradas de usuário sejam validadas antes de processar, eliminando superfícies de ataque comuns (injection, IDOR, etc.)

### 2026-09-30: Experimento de Observabilidade
- **Commit:** `b42382f`
- **O que foi feito:**
  - Stack local de observabilidade: OpenTelemetry + Prometheus + Loki + Tempo + Grafana
  - Métricas RED (Rate, Errors, Duration) e dashboards de alertas
  - MTTD (Mean Time To Detect) instrumentado
- **Por quê:** Melhorar visibilidade de performance, latência e erros em ambiente local; base para observabilidade em produção

### 2026-09-29: Instrumentação OpenTelemetry (Next.js + Backend)
- **Commits:** `80efb90`, `df27f2f`, `cc859ca`
- **O que foi feito:**
  - Instrumentação completa do Next.js com OTel (traces, logs, correlação entre requests)
  - Instrumentação do backend Python com OpenTelemetry
  - Stack de observabilidade local adicionado (Docker Compose)
- **Por quê:** Rastreamento distribuído de requests ponta a ponta, preparação para produção observável

### 2026-09-29: Agentes de IA Configurados
- **Commit:** `d351678`
- **O que foi feito:**
  - Adicionado agente `devops-specialist` (além de frontend-specialist, domain-specialist, etc.)
  - Documentado política de delegação em `AGENTS.md` (non-trivial work vai para subagentes)
- **Por quê:** Estruturar trabalho paralelo e especializado; não deixar tudo na sessão principal

### 2026-09-28: Múltiplas Correções de Segurança Críticas
- **Commits:** `c83a187`, `e0e6d82`, `fc29594`, `4a597a6`, `82ae4b0`, `ba704b5`
- **O que foi feito:**
  - Corrigido path traversal, falta de auth e IDOR em `/api/local-storage`
  - Corrigido IDOR crítico em `processVideo` e `updateClip` com validação de payload
  - Adicionado rate limiting e validação de upload nas actions de vídeo
  - Corrigido SSRF na importação de vídeos do YouTube
  - Removido wildcard de CORS na policy do S3
  - Adicionados cabeçalhos de segurança HTTP (CSP, X-Frame-Options, etc.)
- **Por quê:** Atender auditoria de segurança e OWASP ASVS; eliminar vulnerabilidades de acesso não autorizado

### 2026-09-28: Catálogo de Regras de Negócio e Documentação de Conformidade
- **Commit:** `5d971f9`
- **O que foi feito:**
  - Criado catálogo centralizado de regras de negócio
  - Checklist OWASP ASVS Level 2 documentado
- **Por quê:** Facilitar compreensão das regras do domínio e rastreabilidade de conformidade

### 2026-09-27: Skills e Agentes de IA
- **Commits:** `6ad69ed`, `48982d8`, `c7c8b3b`
- **O que foi feito:**
  - Skills do Postgres e AWS integrados via npx
  - Agentes de IA configurados no projeto (integração com Claude)
  - Informações de agentes adicionadas ao `AGENTS.md`
- **Por quê:** Automatizar descoberta de banco de dados, infraestrutura AWS e estruturar assistência especializada no projeto

### 2026-09-27: Correção de Webhook Stripe e Thumbnails
- **Commits:** `ea70bde`, `2f9eac3`
- **O que foi feito:**
  - Adicionada deduplicação de eventos em webhook Stripe (evita double-charging)
  - Funcionalidade de thumbnail dinâmica para projetos implementada
- **Por quê:** Evitar bugs de cobrança dupla e melhorar UX do dashboard com imagens de prévia de projeto

### 2026-09-24: Funcionalidades de Projeto Completas
- **Commits:** `6afa51b`, `247fee9`, `98192b0`, `961f727`
- **O que foi feito:**
  - Full page project config editor com suporte a retry
  - Persistência de configuração de cortes manuais (manual cuts)
  - Funcionalidade de retry para projetos falhados
  - Modal de detalhes de clip e refinamento do video player
- **Por quê:** Permitir que usuários reeditem configurações de projetos e reprocessem sem perder dados; melhorar experiência de edição

### 2026-09-24 a 2026-09-14: Gerenciamento de Projetos e UI
- **Marcos principais:**
  - Refatoração de "vídeos" para "projetos" (abstração correta do domínio)
  - Infinite scroll no dashboard
  - Página de detalhes de projeto
  - Redesign de UI (cards minimalistas, botões refinados)
  - Carousel de projetos recentes
  - Custom video player (hover to play, clicável progress bar)
- **Contexto:** Implementação da feature de gerenciamento de projetos segundo o plano `2026-09-23-project-management-plan.md`

### 2026-09-16 a 2026-09-14: Dashboard e Dynamic Video Options
- **Marcos principais:**
  - Redesign completo do dashboard (start screen, recent videos, layout reestruturado)
  - Implementação de opções de processamento de vídeo dinâmicas (clipping, subtitle styles, etc.)
  - Refatoração de "videos" para "projects"
  - Fluxo de upload e slicing melhorado
- **Contexto:** Implementação dos planos `2026-09-15-dashboard-redesign-and-slice-plan.md` e `2026-09-15-dynamic-video-options-plan.md`

### 2026-09-18 a 2026-09-13: Autenticação, Assinaturas e Segurança
- **Marcos principais:**
  - Implementação de autenticação white-label com Clerk (100% customizável, sem Auth.js)
  - Migração para assinaturas recorrentes (Stripe, Opus model pricing)
  - Refatoração de domínio com Value Objects e Domain Services (DDD + SOLID)
  - Adicionado sistema de créditos atômico (previne race conditions)
  - Implementação de port/adapter pattern (Clean Architecture)
  - Validação de cliente com Zod (15 caracteres mínimo para senha, tratamento de erros do Clerk)
  - Landing page e pricing page redesenhadas
- **Contexto:** Pivô arquitetural de versão inicial para SaaS real, com autenticação segura, billing completo e estrutura escalável

### 2026-09-11 a início de 2026-09: Fundações
- **Marcos principais:**
  - Estrutura de Clean Architecture estabelecida (domain/application/infrastructure)
  - Primeiros agentes de IA e skills adicionados
  - Load testing com k6 planejado
  - Processamento local em GPU planejado
- **Contexto:** Preparação da arquitetura base do monorepo

---

## Como Adicionar uma Nova Entrada ao Histórico

Ao finalizar um marco/feature relevante, adicione uma entrada no topo do **Histórico** com este formato:

```
### YYYY-MM-DD: Título do Marco (máx. 60 caracteres)
- **Commit(s):** `hash1`, `hash2` (ou range se for muitos)
- **O que foi feito:**
  - Ponto 1 com detalhes técnicos relevantes
  - Ponto 2
- **Por quê:** Breve explicação do impacto ou razão (para quem lê depois, entender o contexto)
```

**Notas:**
- Data: aproximada (use a data do commit mais significativo ou da conclusão)
- Commits: use apenas hashes curtos (7 caracteres) dos 1-3 commits mais relevantes
- "O que foi feito": lista técnica de mudanças reais (verificar `git log` e código)
- "Por quê": foque no **por quê** (impacto no usuário, conformidade, arquitetura) não no **como** (detalhes de implementação)
- Não invente marcos — baseie-se sempre em commits reais ou arquivos criados no projeto
- Mantenha conciso: máx. 5-7 bullets por entrada; detalhe vai para a documentação em `docs/` quando necessário

---

**Última atualização:** 2026-10-04  
**Próxima revisão sugerida:** Quando Fase 5 (portão de qualidade final) for iniciada e concluída, ou quando dados reais do usuário (Stripe, jurídicos, suporte) forem fornecidos
