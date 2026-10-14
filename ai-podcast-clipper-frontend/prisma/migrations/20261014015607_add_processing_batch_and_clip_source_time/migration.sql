-- AlterTable
ALTER TABLE "Clip" ADD COLUMN     "sourceEndTime" DOUBLE PRECISION,
ADD COLUMN     "sourceStartTime" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ProjectProcessingBatch" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "rangesJson" JSONB NOT NULL,
    "excludedRangesJson" JSONB,
    "s3Key" TEXT,
    "creditsCost" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "uploadedFileId" TEXT NOT NULL,

    CONSTRAINT "ProjectProcessingBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectProcessingBatch_uploadedFileId_idx" ON "ProjectProcessingBatch"("uploadedFileId");

-- CreateIndex
CREATE INDEX "ProjectProcessingBatch_status_idx" ON "ProjectProcessingBatch"("status");

-- AddForeignKey
ALTER TABLE "ProjectProcessingBatch" ADD CONSTRAINT "ProjectProcessingBatch_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "UploadedFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: Clip.startTime/endTime já coincidem com o tempo no vídeo
-- ORIGINAL em todos os modos de processamento, EXCETO o modo manual de
-- projetos do YouTube (sourceType='YOUTUBE' AND manualCutsJson IS NOT NULL),
-- onde `functions.ts` remapeia os cortes para o tempo do vídeo concatenado
-- (menor) que foi de fato baixado e processado (ver RF-INGEST-10). Para
-- clipes automáticos (qualquer sourceType) e clipes manuais de upload
-- direto (sourceType='UPLOAD', que nunca passa por esse remapeamento —
-- não há download/concat), startTime/endTime já SÃO o tempo original, então
-- o backfill é uma cópia direta e segura.
--
-- Deliberadamente NÃO preenchido (fica NULL) para: clipes manuais de
-- projetos do YouTube anteriores a esta migration (o vídeo concatenado que
-- foi de fato processado não existe mais — expirou do S3 — então não há
-- como recuperar o tempo original com certeza; nunca inventado) e clipes
-- órfãos sem `uploadedFileId` (uploadedFile IS NULL, não participam do JOIN
-- abaixo).
UPDATE "Clip" c
SET "sourceStartTime" = c."startTime",
    "sourceEndTime" = c."endTime"
FROM "UploadedFile" uf
WHERE c."uploadedFileId" = uf."id"
  AND NOT (uf."sourceType" = 'YOUTUBE' AND uf."manualCutsJson" IS NOT NULL);
