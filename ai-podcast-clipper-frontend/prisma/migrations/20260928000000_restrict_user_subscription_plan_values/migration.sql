-- Bug crítico de billing: a taxonomia de planos mudou de
-- "CREATOR"/"PRO_STUDIO" para "STARTER"/"PRO" (ver PlanCatalogService em
-- src/application/services/plan-catalog.service.ts). Não há clientes
-- pagantes reais ainda, então esta migration não precisa reconciliar dados
-- de produção — apenas normaliza qualquer valor legado que possa existir
-- em bancos de desenvolvimento/homologação e passa a impor a nova
-- taxonomia no banco (defesa em profundidade além da validação em
-- aplicação feita pelo domínio `User`/`PlanCatalogService`).
--
-- Decisão de design: a coluna `plan` continua `String` (não um enum nativo
-- do Prisma) para não propagar `$Enums.Plan` por todo o mapeamento das
-- camadas de infraestrutura/repositório, que hoje tratam `plan` como
-- `string` em todos os pontos (ver `src/domain/ports/*-repository.ts`).
-- Um enum Prisma exigiria atualizar esse mapeamento inteiro só por rigor
-- de tipos, sem nenhum requisito de negócio pedindo isso agora. Em troca,
-- adicionamos uma CHECK constraint no banco para impedir dados fora da
-- taxonomia atual, sem o custo de uma migração de tipo maior.

-- Normaliza valores legados: "STUDIO"/"PRO_STUDIO" eram planos premium
-- (equivalente ao atual "PRO"); qualquer outro valor desconhecido cai no
-- plano básico "STARTER".
UPDATE "User" SET "plan" = 'PRO' WHERE "plan" IN ('STUDIO', 'PRO_STUDIO');
UPDATE "User" SET "plan" = 'STARTER' WHERE "plan" NOT IN ('STARTER', 'PRO');

UPDATE "Subscription" SET "plan" = 'PRO' WHERE "plan" IN ('STUDIO', 'PRO_STUDIO');
UPDATE "Subscription" SET "plan" = 'STARTER' WHERE "plan" NOT IN ('STARTER', 'PRO');

-- Impõe a nova taxonomia no banco (defesa em profundidade).
ALTER TABLE "User" ADD CONSTRAINT "User_plan_check" CHECK ("plan" IN ('STARTER', 'PRO'));
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_plan_check" CHECK ("plan" IN ('STARTER', 'PRO'));
