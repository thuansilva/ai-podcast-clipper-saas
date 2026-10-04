-- Baseline migration: cria as 6 tabelas que já existiam implicitamente via
-- `prisma db push` (User, Subscription, CreditTransaction, UploadedFile, Clip,
-- ProcessingOption), mas que nunca tinham sido capturadas em uma migration.
--
-- Esta migration foi gerada com:
--   npx prisma migrate diff --from-empty --to-schema-datamodel <schema sem o
--     model ProcessedWebhookEvent> --script
-- (ProcessedWebhookEvent é propositalmente excluído daqui porque já tem sua
-- própria migration em 20260927000000_add_processed_webhook_event, que deve
-- continuar vindo depois desta, cronologicamente.)
--
-- Ambientes NOVOS (banco vazio): basta `prisma migrate deploy` normalmente —
-- esta migration roda primeiro e cria as 6 tabelas, seguida da migration do
-- ProcessedWebhookEvent.
--
-- Ambiente EXISTENTE criado via `prisma db push` (ex.: banco local de dev que
-- já tem as 7 tabelas, mas nunca aplicou uma migration de verdade): rodar
-- `prisma migrate deploy` direto falharia tentando recriar tabelas que já
-- existem. Nesse caso, marque a baseline como "já aplicada" sem executá-la,
-- e deixe só a migration seguinte rodar normalmente:
--
--   npx prisma migrate resolve --applied 20260926000000_baseline_initial_schema
--   npx prisma migrate deploy
--
-- Não há banco de produção real hoje (confirmado: nenhum cliente pagante em
-- produção ainda), então este passo de `migrate resolve` é só documentação
-- preventiva — não precisou ser executado neste momento.

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "password" TEXT,
    "credits" INTEGER NOT NULL DEFAULT 10,
    "subscriptionCredits" INTEGER NOT NULL DEFAULT 0,
    "oneTimeCredits" INTEGER NOT NULL DEFAULT 10,
    "reservedCredits" INTEGER NOT NULL DEFAULT 0,
    "stripeCustomerId" TEXT,
    "image" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'STARTER',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "stripePriceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "plan" TEXT NOT NULL,
    "monthlyCredits" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadedFile" (
    "id" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "displayName" TEXT,
    "thumbnailUrl" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'UPLOAD',
    "youtubeUrl" TEXT,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "sliceStartTime" INTEGER NOT NULL DEFAULT 0,
    "sliceEndTime" INTEGER NOT NULL DEFAULT 0,
    "creditsCost" INTEGER NOT NULL DEFAULT 0,
    "uploaded" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "errorMessage" TEXT,
    "genre" TEXT,
    "clipModel" TEXT,
    "aspectRatio" TEXT,
    "autoZoom" BOOLEAN,
    "subtitlePreset" TEXT,
    "manualCutsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "UploadedFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clip" (
    "id" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Clip',
    "hook" TEXT,
    "viralityScore" DOUBLE PRECISION,
    "reason" TEXT,
    "startTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "endTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtitlePreset" TEXT NOT NULL DEFAULT 'HORMOZI',
    "layoutMode" TEXT NOT NULL DEFAULT 'SMART_CROP',
    "transcriptWords" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "uploadedFileId" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Clip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingOption" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "CreditTransaction_userId_idx" ON "CreditTransaction"("userId");

-- CreateIndex
CREATE INDEX "UploadedFile_s3Key_idx" ON "UploadedFile"("s3Key");

-- CreateIndex
CREATE INDEX "Clip_s3Key_idx" ON "Clip"("s3Key");

-- CreateIndex
CREATE INDEX "ProcessingOption_type_isActive_order_idx" ON "ProcessingOption"("type", "isActive", "order");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "UploadedFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

