import { z, type ZodType } from "zod";
import type { TriggerVideoProcessingInput } from "~/application/dtos/video-dtos";
import { manualCutsArraySchema } from "./manual-cut.schema";
import { PROJECT_SUBTITLE_PRESETS } from "./projects-actions.schema";

/**
 * Argumentos posicionais de `processVideo` (`src/actions/generation.ts`),
 * sem `userId` — resolvido na própria action via
 * `makeAuthGateway().getUserId()`, nunca recebido do cliente.
 */
export type ProcessVideoActionInput = Omit<
  TriggerVideoProcessingInput,
  "userId"
>;

export const processVideoSchema: ZodType<ProcessVideoActionInput> = z.object({
  uploadedFileId: z.string().trim().min(1, "uploadedFileId é obrigatório."),
  // Allowlist (não só tamanho): o preset chega ao backend de processamento,
  // que já foi vulnerável a injeção de shell via esse campo.
  preset: z.enum(PROJECT_SUBTITLE_PRESETS).optional(),
  mode: z.enum(["auto", "manual"]).optional(),
  manualCuts: manualCutsArraySchema.optional(),
});
