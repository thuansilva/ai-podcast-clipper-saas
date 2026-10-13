import type { IUserRepository } from "~/domain/ports/user-repository";
import type { IUploadedFileRepository } from "~/domain/ports/uploaded-file-repository";
import type { IClipRepository } from "~/domain/ports/clip-repository";
import type { IUnitOfWork } from "~/domain/ports/unit-of-work";

export interface AnonymizeUserAndDeleteRowsInput {
  userId: string;
}

/**
 * Extraído de `DeleteUserAccountUseCase` (ver item "Fluxo de exclusão de
 * conta incompleto" do checklist de go-live) para que a exclusão de conta
 * possa ser executada pelo Inngest (`src/inngest/functions.ts::
 * deleteUserAccount`) em um `step.run` próprio, com retry granular: a
 * remoção das linhas de `UploadedFile`/`Clip` e a anonimização do cadastro
 * do usuário acontecem na mesma transação (`IUnitOfWork`) — ou as duas
 * acontecem, ou nenhuma, e um retry deste passo não reexecuta
 * `cancel-subscription`/`delete-storage-files`, já concluídos.
 *
 * Decisão de produto (não revisitar sem decisão explícita de negócio, ver
 * `DeleteUserAccountUseCase`): o cadastro do `User` NUNCA é removido do
 * banco (preserva o histórico de auditoria em
 * `CreditTransaction`/`Subscription`) — é anonimizado (email/nome/imagem
 * trocados, `deletedAt` preenchido).
 *
 * Idempotente: usuário não encontrado (ex.: webhook `user.deleted`
 * reentregue depois de uma execução anterior ter concluído tudo até aqui —
 * o que na prática não ocorre, já que o `User` nunca é removido, só
 * anonimizado, mas é tratado como no-op por segurança) é um no-op.
 * Arquivos/clipes já removidos numa tentativa anterior simplesmente não são
 * encontrados por `findByUserId`, então deletar de novo não tem efeito.
 */
export class AnonymizeUserAndDeleteRowsUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly uploadedFileRepository: IUploadedFileRepository,
    private readonly clipRepository: IClipRepository,
    private readonly unitOfWork: IUnitOfWork
  ) {}

  async execute(input: AnonymizeUserAndDeleteRowsInput): Promise<void> {
    const user = await this.userRepository.findById(input.userId);
    if (!user) {
      return;
    }

    const [uploadedFiles, clips] = await Promise.all([
      this.uploadedFileRepository.findByUserId(input.userId),
      this.clipRepository.findByUserId(input.userId),
    ]);

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
}
