import { NotFoundError } from "~/domain/errors/not-found-error";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";
import type {
  IUploadedFileRepository,
  UpdateUploadedFileInput,
} from "~/domain/ports/uploaded-file-repository";
import type { IClipRepository } from "~/domain/ports/clip-repository";
import type { IQueueGateway } from "~/domain/ports/queue-gateway";
import { normalizeSubtitlePreset } from "~/domain/value-objects/subtitle-preset.vo";

export interface RetryProjectInput {
  projectId: string;
  userId: string;
  updates?: Partial<
    Pick<
      UpdateUploadedFileInput,
      | "subtitlePreset"
      | "clipModel"
      | "aspectRatio"
      | "autoZoom"
      | "sliceStartTime"
      | "sliceEndTime"
    >
  >;
}

export class RetryProjectUseCase {
  constructor(
    private readonly uploadedFileRepository: IUploadedFileRepository,
    private readonly queueGateway: IQueueGateway,
    private readonly clipRepository: IClipRepository
  ) {}

  async execute(input: RetryProjectInput): Promise<void> {
    const project = await this.uploadedFileRepository.findById(input.projectId);

    if (!project) {
      throw new NotFoundError("Projeto", input.projectId);
    }

    if (project.userId !== input.userId) {
      throw new UnauthorizedError("tentar reprocessar este projeto");
    }

    const updateData: UpdateUploadedFileInput = {
      status: "queued",
      errorMessage: null,
      ...(input.updates?.subtitlePreset !== undefined && {
        subtitlePreset: input.updates.subtitlePreset,
      }),
      ...(input.updates?.clipModel !== undefined && {
        clipModel: input.updates.clipModel,
      }),
      ...(input.updates?.aspectRatio !== undefined && {
        aspectRatio: input.updates.aspectRatio,
      }),
      ...(input.updates?.autoZoom !== undefined && {
        autoZoom: input.updates.autoZoom,
      }),
      ...(input.updates?.sliceStartTime !== undefined && {
        sliceStartTime: input.updates.sliceStartTime,
      }),
      ...(input.updates?.sliceEndTime !== undefined && {
        sliceEndTime: input.updates.sliceEndTime,
      }),
    };

    // Quando o retry NÃO está trocando o subtitlePreset, o valor que será
    // reenviado ao backend é o que já estava salvo em `project.subtitlePreset`.
    // Projetos criados antes da allowlist (`PROJECT_SUBTITLE_PRESETS`) existir
    // podem ter um preset legado/inválido persistido — normalizamos esse valor
    // aqui (para o fallback "HORMOZI" quando fora da allowlist) e aproveitamos
    // para corrigir o dado legado de volta no banco no mesmo update, evitando
    // que o projeto caia nesse caminho de novo em retries futuros.
    //
    // Quando o retry ESTÁ trocando o subtitlePreset (`input.updates.subtitlePreset
    // !== undefined`), o valor já passou pela validação de borda (`retryProjectUpdatesSchema`,
    // enum fechado) antes de chegar neste use case — por isso não normalizamos
    // de novo aqui (ver AGENTS.md: "o domínio pressupõe que os dados já
    // chegaram limpos e validados na borda").
    if (input.updates?.subtitlePreset === undefined) {
      const normalizedPreset = normalizeSubtitlePreset(project.subtitlePreset);
      if (normalizedPreset !== project.subtitlePreset) {
        updateData.subtitlePreset = normalizedPreset;
      }
    }

    // Reset status to queued
    const updated = await this.uploadedFileRepository.update(
      input.projectId,
      updateData
    );

    // Delete any clips that might have been partially generated to avoid duplicates
    await this.clipRepository.deleteByUploadedFileId(input.projectId);

    // Send to Inngest again
    // D6: `mode` é derivado de `manualCutsJson != null`, nunca de `clipModel`
    // (que só assume valores de LAYOUT: "auto" | "face_focus" — nunca "manual").
    await this.queueGateway.sendProcessVideoEvent({
      uploadedFileId: project.id,
      userId: project.userId,
      preset: updated.subtitlePreset || "HORMOZI",
      mode: updated.manualCutsJson != null ? "manual" : "auto",
      manualCuts: updated.manualCutsJson
        ? JSON.parse(updated.manualCutsJson as string)
        : undefined,
    });
  }
}
