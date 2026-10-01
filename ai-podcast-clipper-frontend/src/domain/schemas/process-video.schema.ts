import { z, type ZodType } from "zod";
import type { TriggerVideoProcessingInput } from "~/application/dtos/video-dtos";
import { manualCutsArraySchema } from "./manual-cut.schema";

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
  preset: z.string().trim().min(1).max(50).optional(),
  mode: z.enum(["auto", "manual"]).optional(),
  manualCuts: manualCutsArraySchema.optional(),
});
