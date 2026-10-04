# Documentação do AI Podcast Clipper SaaS

Bem-vindo ao índice central da documentação técnica do **AI Podcast Clipper SaaS**. Este repositório organiza a documentação em **cinco perspectivas de engenharia** — cada pasta representa uma "visão" diferente do sistema e serve a um propósito específico durante o desenvolvimento e operação.

---

## Estrutura de Documentação

### 1. Requisitos (`requisitos/`)

Define o que o sistema **deve fazer** (funcional) e **como deve se comportar** (não-funcional), com rastreabilidade total entre casos de uso, regras de negócio, código-fonte e testes.

| Documento | O que cobre | Quando consultar | Para quem |
|-----------|-----------|------------------|-----------|
| **requisitos-funcionais-e-nao-funcionais.md** | Matriz de RFs (RF-AUTH-*, RF-BILL-*, etc.) com origem rastreável, artefatos de código e cobertura de teste. RNFs de segurança (OWASP ASVS L2), performance, escalabilidade. | Antes de implementar feature nova; para validar cobertura de teste; antes de propor breaking changes. | Devs, QA, Product |
| **casos-de-uso-e-regras-de-negocio.md** | Descrição executiva dos 5 áreas principais (autenticação, créditos/billing, processamento de vídeo, cortes manuais, gerenciamento de projetos). Status de implementação e referência para specs. | Para entender o comportamento real do sistema hoje; antes de mudar uma regra; para investigar bugs de lógica. | Devs, Domain Expert, Product |

**Regra:** RFs são identificadas por ID estável (`RF-<ÁREA>-NN`, ex.: `RF-AUTH-01`, `RF-BILL-05`). Nunca reaproveitar um número removido. Manter sincronizado com código via `./requisitos/requisitos-funcionais-e-nao-funcionais.md` ao implementar changes.

---

### 2. Arquitetura (`arquitetura/`)

Quatro **visões complementares** do sistema que se referenciam cruzadamente. Cada visão usa Mermaid (diagramas obrigatórios) para clareza.

| Documento | O que cobre | Quando consultar | Para quem |
|-----------|-----------|------------------|-----------|
| **visao-dados-modelo-er.md** | Diagrama entidade-relacionamento (ERD) do Postgres: 7 models (User, Subscription, CreditTransaction, UploadedFile, Clip, ProcessingOption, ProcessedWebhookEvent) com relacionamentos 1:1, 1:N e constraints. | Antes de alterar schema (`prisma/schema.prisma`); para entender persistência de dados; para validar migrations. | Backend Dev, Infra, Database Architect |
| **visao-fluxo-pagamento.md** | Arquitetura completa de pagamentos: webhook Stripe → deduplicação → Inngest → use cases de domínio (créditos, assinaturas, carência de 3 dias, reembolsos, chargebacks). Taxonomia de planos (Starter/Pro, mensal/anual = 4 price IDs). | Antes de mexer em Stripe/webhooks/billing; para entender dunning policy; para investigar problemas de crédito não aplicado. | Backend Dev, Billing Specialist, Security |
| **visao-fluxo-processamento-video.md** | Pipeline ponta a ponta: importação YouTube → validação + hold de créditos → Modal/GPU local → transcrição (WhisperX) → virality (Gemini) → detecção de falante (LR-ASD) → corte vertical + legendas → S3. Estados (queued, processing, processed, failed) e retry logic. | Antes de mexer no backend de vídeo; para entender steps do Inngest; para investigar delays de processamento. | Backend Dev, ML Engineer, DevOps |
| **visao-jornada-usuario.md** | Fluxo de navegação do usuário (landing → onboarding → criar projeto → processar → revisar clipes → gerenciar billing). Componentes React, rotas Next.js, pontos de dor esperados. | Antes de mexer em UI/UX; para entender fluxo de conversão; para investigar problemas de usabilidade. | Frontend Dev, Product, UX Designer |

**Regra:** Sempre que código/fluxo muda, atualizar a visão correspondente na mesma tarefa (nenhuma "catch-up" depois). Diagramas Mermaid são obrigatórios em novos documentos de visão.

---

### 3. Operação (`operacao/`)

Tudo que você precisa para rodar, manter e diagnosticar o sistema em produção ou staging.

| Documento | O que cobre | Quando consultar | Para quém |
|-----------|-----------|------------------|-----------|
| **checklist-go-live.md** | Checklist consolidado de **21 BLOCKERs** resolvidos (100% ✅) + itens HIGH e NICE. Auditoria realizada por 6 especialistas (devops, security, domain, qa, frontend, accessibility). Todos os riscos críticos (billing, webhooks, segurança, infra, CI, produto) com notas de resolução. | Antes de qualquer release para produção. Primeira coisa a revisar se algo quebrar em prod. | DevOps, Architect, Tech Lead, PM |
| **aws-s3-lifecycle-rules.md** | Guia passo a passo para configurar regras de ciclo de vida no S3: expiração automática de uploads/youtube após 1 dia, manter clips/ para sempre. Economia: ~95% em custo de storage. | Quando preparar ambiente de produção; quando revisar custos de AWS. | DevOps, Cloud Architect |
| **observabilidade.md** | Lições aprendidas do stack local OpenTelemetry + Prometheus + Grafana + Tempo + Loki: indexação com delay, busca por trace ID vs /api/search, métricas do collector. | Quando debugar traces; para entender timing de observabilidade; para estender stack em prod. | DevOps, Backend Dev, SRE |

**Regra:** Sempre que descobrir um gap de segurança/infra/observabilidade, registrar no checklist com status, origem, e se resolvido, a solução. Nunca deixar "TODO verificar depois".

---

### 4. Pesquisa (`pesquisa/`)

Experimentos e prototipagens em progresso que **não** são decisões finais de arquitetura.

| Documento | O que cobre |
|-----------|-----------|
| **experimento-observabilidade/roteiro-baseline.md** | Baseline local de OpenTelemetry: como subir stack mínimo, índices esperados, validação de saída de spans. |
| **experimento-observabilidade/guia-dashboards-grafana.md** | Templates de dashboard Grafana para monitorar Next.js (memória, HTTP requests) e backend (GPU, CPU, queued tasks). |

---

### 5. Histórico (`historico/`)

Toda decisão de design e planejamento de feature, registrada cronologicamente. Não é "código velho" — é a memória do projeto de **por quê** cada feature foi desenhada assim.

#### Plans (Estrutura de Feature)
14 documentos (2026-09-11 a 2026-09-23) descrevendo o design inicial de cada feature antes da implementação.

**Convenção:** `YYYY-MM-DD-nome-da-feature-plan.md`

**Exemplos:**
- `2026-09-12-clerk-auth-clean-architecture-plan.md` — auth branca com Clerk
- `2026-09-14-recurring-subscriptions-and-credit-packs-plan.md` — modelo de créditos + assinaturas
- `2026-09-18-local-gpu-processing-plan.md` — processamento em GPU local

#### Specs (Implementação Detalhada)
Design técnico aprofundado durante ou após a implementação.

**Convenção:** `YYYY-MM-DD-nome-da-feature-spec.md`

---

## Convenção para Novos Documentos

### 1. Nova Spec ou Plan de Feature

**Onde:** `./historico/superpowers/specs/` ou `./historico/superpowers/plans/`

**Nome:** `YYYY-MM-DD-nome-da-feature-spec.md` ou `YYYY-MM-DD-nome-da-feature-plan.md`

**Exemplo:**
```
./historico/superpowers/specs/2026-10-15-auto-retry-logic-spec.md
```

### 2. Nova Visão de Arquitetura

**Onde:** `./arquitetura/`

**Nome:** `visao-<aspecto>-<descricao>.md`

**Obrigatório:** Incluir diagrama Mermaid (flowchart, ERD, sequence, stateDiagram, ou journey).

**Exemplo:**
```
docs/arquitetura/visao-seguranca-autenticacao.md
```

### 3. Novo Requisito Funcional (RF) ou Não-Funcional (RNF)

**Onde:** `./requisitos/requisitos-funcionais-e-nao-funcionais.md`

**ID:** `RF-<ÁREA>-NN` (estável, nunca reutilizar número removido)

**Áreas:** AUTH, BILL, VIDEO, MANUAL, PROJECT, SECURITY, PERF, etc.

**Exemplo:**
```
RF-VIDEO-08: Detecção de silence para cortes automáticos
RF-SECURITY-12: Rate limiting em /api/webhooks
RNF-PERF-03: Processamento de vídeo < 5 minutos para 30min de podcast
```

---

## Regra: Código e Documentação Evoluem Sempre Juntos

**Nenhuma tarefa está concluída só porque o código foi implementado e testado.** A documentação é tão crítica quanto o código. Ao implementar ou mudar comportamento existente:

1. **Adicione/atualize o RF correspondente** em `./requisitos/requisitos-funcionais-e-nao-funcionais.md` (matriz rastreabilidade: RF → caso de uso → artefato → teste).
2. **Se muda regra de negócio,** atualize `./requisitos/casos-de-uso-e-regras-de-negocio.md`.
3. **Se muda fluxo, dados ou UI,** atualize a visão correspondente em `./arquitetura/` com diagrama atualizado.
4. **Se abre risco novo ou fecha um item pendente,** atualize `./operacao/checklist-go-live.md`.
5. **Sempre** registre uma entrada no histórico (`progress.md` na raiz) descrevendo o que foi feito e por quê.

**Três afirmações sobre código/teste em documentação sem nunca ter lido/executado o artefato é tão grave quanto um bug de código.**

---

## Consultas Rápidas: Qual Documento Ler?

### Antes de implementar feature nova:
1. Ler `./requisitos/casos-de-uso-e-regras-de-negocio.md` → encontrar se similar já existe
2. Ler `./historico/superpowers/` → procurar spec/plan anterior que explica decisões
3. Escrever novo RF em `./requisitos/requisitos-funcionais-e-nao-funcionais.md`

### Antes de mexer em billing/Stripe:
1. `./arquitetura/visao-fluxo-pagamento.md` → entender fluxo completo
2. `./requisitos/requisitos-funcionais-e-nao-funcionais.md` → filtrar RF-BILL-*
3. `./operacao/checklist-go-live.md` → verificar bugs conhecidos de billing

### Antes de mexer no pipeline de vídeo:
1. `./arquitetura/visao-fluxo-processamento-video.md` → entender steps
2. `./arquitetura/visao-dados-modelo-er.md` → entender persistência (UploadedFile, Clip)
3. `./requisitos/requisitos-funcionais-e-nao-funcionais.md` → RF-VIDEO-*

### Antes de mexer em UI/fluxo do usuário:
1. `./arquitetura/visao-jornada-usuario.md` → diagrama de navegação
2. `./requisitos/casos-de-uso-e-regras-de-negocio.md` → comportamento esperado

### Preparando lançamento em produção:
1. `./operacao/checklist-go-live.md` → validar todos os BLOCKERs resolvidos
2. `./operacao/aws-s3-lifecycle-rules.md` → configurar S3 lifecycle
3. `./operacao/observabilidade.md` → estender stack pra prod

---

## Links Relacionados

- **Arquitetura principal:** `AGENTS.md` (na raiz) — visão geral do monorepo, stack, e diretrizes de TDD
- **Histórico do projeto:** `progress.md` (na raiz) — diário de evolução, fases concluídas, próximas prioridades
- **Testes:** Cada task deve ter testes (`npm run test`, `npm run test:integration`)
- **Código-fonte:** `ai-podcast-clipper-frontend/src/` (Clean Architecture) e `ai-podcast-clipper-backend/core/` (pipeline compartilhado)
