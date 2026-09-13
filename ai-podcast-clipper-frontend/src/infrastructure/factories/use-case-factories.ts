import { PrismaUserRepository } from "../database/repositories/prisma-user.repository";
import { PrismaUploadedFileRepository } from "../database/repositories/prisma-uploaded-file.repository";
import { PrismaClipRepository } from "../database/repositories/prisma-clip.repository";
import { PrismaCreditTransactionRepository } from "../database/repositories/prisma-credit-transaction.repository";
import { PrismaUnitOfWork } from "../database/repositories/prisma-unit-of-work";
import { S3StorageGateway } from "../storage/s3-storage.gateway";
import { StripePaymentGateway } from "../payments/stripe-payment.gateway";
import { InngestQueueGateway } from "../queue/inngest-queue.gateway";

import { HoldCreditsUseCase } from "~/application/use-cases/credits/hold-credits.use-case";
import { ConsumeCreditsUseCase } from "~/application/use-cases/credits/consume-credits.use-case";
import { RefundCreditsUseCase } from "~/application/use-cases/credits/refund-credits.use-case";
import { AddCreditsFromStripeWebhookUseCase } from "~/application/use-cases/credits/add-credits-from-stripe.use-case";

import { GenerateUploadUrlUseCase } from "~/application/use-cases/videos/generate-upload-url.use-case";
import { ImportYouTubeVideoUseCase } from "~/application/use-cases/videos/import-youtube-video.use-case";

import { GetClipPlayUrlUseCase } from "~/application/use-cases/clips/get-clip-play-url.use-case";
import { UpdateClipUseCase } from "~/application/use-cases/clips/update-clip.use-case";
import { DeleteClipUseCase } from "~/application/use-cases/clips/delete-clip.use-case";
import { SyncUserUseCase } from "~/application/use-cases/users/sync-user.use-case";

// --- Fábricas de Créditos ---
export function makeHoldCreditsUseCase(): HoldCreditsUseCase {
  return new HoldCreditsUseCase(
    new PrismaUserRepository(),
    new PrismaUploadedFileRepository(),
    new PrismaCreditTransactionRepository(),
    new PrismaUnitOfWork()
  );
}

export function makeConsumeCreditsUseCase(): ConsumeCreditsUseCase {
  return new ConsumeCreditsUseCase(
    new PrismaUserRepository(),
    new PrismaCreditTransactionRepository(),
    new PrismaUnitOfWork()
  );
}

export function makeRefundCreditsUseCase(): RefundCreditsUseCase {
  return new RefundCreditsUseCase(
    new PrismaUserRepository(),
    new PrismaUploadedFileRepository(),
    new PrismaCreditTransactionRepository(),
    new PrismaUnitOfWork()
  );
}

export function makeAddCreditsFromStripeWebhookUseCase(): AddCreditsFromStripeWebhookUseCase {
  return new AddCreditsFromStripeWebhookUseCase(
    new PrismaUserRepository(),
    new PrismaCreditTransactionRepository(),
    new PrismaUnitOfWork()
  );
}

// --- Fábricas de Vídeos ---
export function makeGenerateUploadUrlUseCase(): GenerateUploadUrlUseCase {
  return new GenerateUploadUrlUseCase(
    new S3StorageGateway(),
    new PrismaUploadedFileRepository()
  );
}

export function makeImportYouTubeVideoUseCase(): ImportYouTubeVideoUseCase {
  return new ImportYouTubeVideoUseCase(
    new PrismaUploadedFileRepository(),
    new InngestQueueGateway()
  );
}

// --- Fábricas de Clipes ---
export function makeGetClipPlayUrlUseCase(): GetClipPlayUrlUseCase {
  return new GetClipPlayUrlUseCase(
    new PrismaClipRepository(),
    new S3StorageGateway()
  );
}

export function makeUpdateClipUseCase(): UpdateClipUseCase {
  return new UpdateClipUseCase(new PrismaClipRepository());
}

export function makeDeleteClipUseCase(): DeleteClipUseCase {
  return new DeleteClipUseCase(
    new PrismaClipRepository(),
    new S3StorageGateway()
  );
}

// --- Fábricas de Pagamento ---
export function makeStripePaymentGateway(): StripePaymentGateway {
  return new StripePaymentGateway();
}

// --- Fábricas de Usuário ---
export function makeSyncUserUseCase(): SyncUserUseCase {
  return new SyncUserUseCase(
    new PrismaUserRepository(),
    new StripePaymentGateway()
  );
}
