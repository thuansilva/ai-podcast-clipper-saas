import type { IUserRepository } from "~/domain/ports/user-repository";
import type { IUploadedFileRepository } from "~/domain/ports/uploaded-file-repository";
import type { IClipRepository } from "~/domain/ports/clip-repository";
import type { IStorageGateway } from "~/domain/ports/storage-gateway";
import type { IUnitOfWork } from "~/domain/ports/unit-of-work";
import type { CancelUserSubscriptionUseCase } from "~/application/use-cases/credits/cancel-user-subscription.use-case";
import { DeleteUserFilesFromStorageUseCase } from "~/application/use-cases/users/delete-user-files-from-storage.use-case";
import { AnonymizeUserAndDeleteRowsUseCase } from "~/application/use-cases/users/anonymize-user-and-delete-rows.use-case";

export interface DeleteUserAccountInput {
  userId: string;
}

/**
 * Composição das 3 sub-etapas da exclusão de conta de um usuário (ver item
 * "Fluxo de exclusão de conta incompleto" do checklist de go-live):
 * `CancelUserSubscriptionUseCase` → `DeleteUserFilesFromStorageUseCase` →
 * `AnonymizeUserAndDeleteRowsUseCase`.
 *
 * Esta classe NÃO é mais chamada pelo webhook `user.deleted` do Clerk
 * (`src/app/api/webhooks/clerk/route.ts`) — o webhook agora só despacha o
 * evento `clerk/user.deleted` para o Inngest, e a function
 * `deleteUserAccount` (`src/inngest/functions.ts`) chama as 3 sub-etapas
 * diretamente, cada uma em seu próprio `step.run`, para ganhar retry
 * granular (um passo que já terminou com sucesso não é reexecutado quando
 * outro passo falha e o Inngest tenta de novo). Esta classe é mantida como
 * a composição de referência das 3 etapas na ordem correta, reaproveitada
 * pelos testes unitários e por qualquer chamador que precise do fluxo
 * completo de uma só vez (ex.: script administrativo).
 *
 * Decisão de produto (não revisitar sem decisão explícita de negócio):
 * - Vídeos/clipes: apagados de verdade (S3 + linhas do banco).
 * - Assinatura Stripe: cancelada de verdade.
 * - Cadastro do `User`: NUNCA removido do banco (preserva o histórico de
 *   auditoria em `CreditTransaction`/`Subscription`) — em vez disso, é
 *   anonimizado (email/nome/imagem trocados, `deletedAt` preenchido).
 *
 * O cancelamento da assinatura Stripe (`CancelUserSubscriptionUseCase`)
 * hoje também é disparado de forma síncrona pela Server Action
 * `requestAccountDeletion` (`src/actions/delete-account.ts`), antes mesmo
 * do Clerk deletar o usuário e emitir o webhook (que agora só enfileira
 * este fluxo) — para que o usuário tenha confirmação imediata de que não
 * será mais cobrado. O fluxo de exclusão continua chamando o cancelamento
 * de novo como rede de segurança (ex.: admin deleta o usuário direto no
 * painel do Clerk, sem passar pelo botão da UI); isso é seguro porque
 * `CancelUserSubscriptionUseCase` é idempotente.
 *
 * Idempotente: pode ser chamado múltiplas vezes para o mesmo `userId` sem
 * efeitos colaterais adicionais (o Clerk pode reentregar o webhook, e o
 * Inngest pode reexecutar o job em um retry).
 */
export class DeleteUserAccountUseCase {
  private readonly deleteUserFilesFromStorageUseCase: DeleteUserFilesFromStorageUseCase;
  private readonly anonymizeUserAndDeleteRowsUseCase: AnonymizeUserAndDeleteRowsUseCase;

  constructor(
    private readonly userRepository: IUserRepository,
    private readonly uploadedFileRepository: IUploadedFileRepository,
    private readonly clipRepository: IClipRepository,
    private readonly storageGateway: IStorageGateway,
    private readonly unitOfWork: IUnitOfWork,
    private readonly cancelUserSubscriptionUseCase: CancelUserSubscriptionUseCase
  ) {
    this.deleteUserFilesFromStorageUseCase = new DeleteUserFilesFromStorageUseCase(
      uploadedFileRepository,
      clipRepository,
      storageGateway
    );
    this.anonymizeUserAndDeleteRowsUseCase = new AnonymizeUserAndDeleteRowsUseCase(
      userRepository,
      uploadedFileRepository,
      clipRepository,
      unitOfWork
    );
  }

  async execute(input: DeleteUserAccountInput): Promise<void> {
    const user = await this.userRepository.findById(input.userId);
    if (!user) {
      // Idempotente: o Clerk pode reentregar o webhook `user.deleted`, ou a
      // conta já pode ter sido anonimizada e removida por outra entrega
      // anterior (removida do banco só aconteceria se alguém rodasse um
      // `db.user.delete` manual fora deste fluxo).
      return;
    }

    // O cancelamento também já pode ter ocorrido de forma síncrona, antes
    // mesmo deste webhook ser entregue, quando o usuário clicou em "excluir
    // conta" (`src/actions/delete-account.ts`) — este Use Case é a rede de
    // segurança para quando a exclusão é disparada de outro jeito (ex.:
    // admin deleta o usuário direto no painel do Clerk). Chamar de novo é
    // seguro: `CancelUserSubscriptionUseCase` é idempotente.
    await this.cancelUserSubscriptionUseCase.execute({
      userId: input.userId,
    });

    await this.deleteUserFilesFromStorageUseCase.execute({
      userId: input.userId,
    });

    await this.anonymizeUserAndDeleteRowsUseCase.execute({
      userId: input.userId,
    });
  }
}
