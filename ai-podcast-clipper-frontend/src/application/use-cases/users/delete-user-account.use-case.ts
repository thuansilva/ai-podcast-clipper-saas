import type { IUserRepository } from "~/domain/ports/user-repository";
import type { ISubscriptionRepository } from "~/domain/ports/subscription-repository";
import type { IUploadedFileRepository } from "~/domain/ports/uploaded-file-repository";
import type { IClipRepository } from "~/domain/ports/clip-repository";
import type { IStorageGateway } from "~/domain/ports/storage-gateway";
import type { IPaymentGateway } from "~/domain/ports/payment-gateway";
import type { IUnitOfWork } from "~/domain/ports/unit-of-work";
import type { ExpireSubscriptionUseCase } from "~/application/use-cases/credits/expire-subscription.use-case";
import { logger } from "~/lib/observability/logger";

export interface DeleteUserAccountInput {
  userId: string;
}

/**
 * Fonte única de verdade para a exclusão de conta de um usuário (ver item
 * "Fluxo de exclusão de conta incompleto" do checklist de go-live).
 * Disparado exclusivamente pelo webhook `user.deleted` do Clerk — a UI
 * nunca chama este Use Case diretamente, só pede ao Clerk para deletar o
 * usuário (`IAuthGateway.deleteUser`), que então dispara o webhook.
 *
 * Decisão de produto (não revisitar sem decisão explícita de negócio):
 * - Vídeos/clipes: apagados de verdade (S3 + linhas do banco).
 * - Assinatura Stripe: cancelada de verdade.
 * - Cadastro do `User`: NUNCA removido do banco (preserva o histórico de
 *   auditoria em `CreditTransaction`/`Subscription`) — em vez disso, é
 *   anonimizado (email/nome/imagem trocados, `deletedAt` preenchido).
 *
 * Idempotente: pode ser chamado múltiplas vezes para o mesmo `userId` sem
 * efeitos colaterais adicionais (o Clerk pode reentregar o webhook).
 */
export class DeleteUserAccountUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly subscriptionRepository: ISubscriptionRepository,
    private readonly uploadedFileRepository: IUploadedFileRepository,
    private readonly clipRepository: IClipRepository,
    private readonly storageGateway: IStorageGateway,
    private readonly paymentGateway: IPaymentGateway,
    private readonly unitOfWork: IUnitOfWork,
    private readonly expireSubscriptionUseCase: ExpireSubscriptionUseCase
  ) {}

  async execute(input: DeleteUserAccountInput): Promise<void> {
    const user = await this.userRepository.findById(input.userId);
    if (!user) {
      // Idempotente: o Clerk pode reentregar o webhook `user.deleted`, ou a
      // conta já pode ter sido anonimizada e removida por outra entrega
      // anterior (removida do banco só aconteceria se alguém rodasse um
      // `db.user.delete` manual fora deste fluxo).
      return;
    }

    await this.cancelActiveSubscriptionIfAny(input.userId);

    const [uploadedFiles, clips] = await Promise.all([
      this.uploadedFileRepository.findByUserId(input.userId),
      this.clipRepository.findByUserId(input.userId),
    ]);

    await this.deleteFilesFromStorage(uploadedFiles, clips);

    await this.unitOfWork.execute(async () => {
      for (const clip of clips) {
        await this.clipRepository.delete(clip.id);
      }
      for (const file of uploadedFiles) {
        await this.uploadedFileRepository.delete(file.id);
      }

      await this.userRepository.update(input.userId, {
        email: `deleted-${input.userId}@anon.local`,
        name: null,
        image: null,
        deletedAt: new Date(),
      });
    });
  }

  private async cancelActiveSubscriptionIfAny(userId: string): Promise<void> {
    const subscription = await this.subscriptionRepository.findByUserId(
      userId
    );

    if (!subscription || subscription.status === "canceled") {
      return;
    }

    try {
      await this.paymentGateway.cancelSubscription(
        subscription.stripeSubscriptionId
      );
    } catch (error) {
      logger.error(
        "Failed to cancel Stripe subscription during account deletion",
        { userId, stripeSubscriptionId: subscription.stripeSubscriptionId, error }
      );
      throw error;
    }

    await this.expireSubscriptionUseCase.execute({ userId });
  }

  private async deleteFilesFromStorage(
    uploadedFiles: Array<{ s3Key: string }>,
    clips: Array<{ s3Key: string }>
  ): Promise<void> {
    for (const file of uploadedFiles) {
      if (!file.s3Key) continue;
      try {
        await this.storageGateway.deleteFile(file.s3Key);
      } catch (error) {
        // Tolerante a arquivo já não existir no storage (ex.: 404) — não
        // interrompe a exclusão da conta por causa de um objeto órfão.
        logger.warn("Failed to delete uploaded file from storage", {
          s3Key: file.s3Key,
          error,
        });
      }
    }

    for (const clip of clips) {
      if (!clip.s3Key) continue;
      try {
        await this.storageGateway.deleteFile(clip.s3Key);
      } catch (error) {
        logger.warn("Failed to delete clip from storage", {
          s3Key: clip.s3Key,
          error,
        });
      }
    }
  }
}
