import { z, type ZodType } from "zod";
import type { AddClipsToProjectInput } from "~/application/dtos/video-dtos";
import { manualCutsArraySchema } from "./manual-cut.schema";

/**
 * Payload de `addClipsToProjectAction` (`src/actions/projects-actions.ts`)
 * sem `projectId`/`userId` (resolvidos pela própria action — `projectId` já
 * vem como argumento posicional e `userId` nunca é recebido do cliente).
 */
export type AddClipsToProjectActionInput = Omit<
  AddClipsToProjectInput,
  "projectId" | "userId"
>;

/**
 * Checagem de FORMA na borda (RN-* de "adicionar mais cortes"). Reaplica a
 * mesma validação de corte manual já usada em
 * `import-youtube-video.schema.ts`/`process-video.schema.ts`
 * (`manualCutsArraySchema`: endTime > startTime, duração máxima de 60s por
 * corte, no máximo 50 cortes).
 *
 * Deliberadamente NÃO valida aqui (fica a cargo do domínio/use case, que já
 * conhece os clipes existentes do projeto):
 * - Sobreposição de um corte novo com um clipe já existente
 *   (`ManualCutOverlapError`).
 * - Se o projeto é YouTube/tem lote em andamento/tem clipes legados sem
 *   `sourceStartTime` (`UnsupportedAppendSourceError` /
 *   `ProjectBatchInProgressError` / `LegacyClipsMissingSourceRangeError`).
 */
export const addClipsToProjectSchema: ZodType<AddClipsToProjectActionInput> =
  z
    .object({
      mode: z.enum(["manual", "auto"]),
      manualCuts: manualCutsArraySchema.optional(),
      aiSlice: z
        .object({
          // `.finite()`: Zod 3 aceita `Infinity` em `z.number()` e o
          // protocolo de Server Actions consegue serializá-lo — um payload
          // forjado chegava ao lote/evento com `endTime: Infinity`.
          startTime: z.number().nonnegative().finite(),
          endTime: z.number().nonnegative().finite(),
        })
        .refine((slice) => slice.endTime > slice.startTime, {
          message: "endTime do slice deve ser maior que startTime.",
          path: ["endTime"],
        })
        .optional(),
    })
    .refine(
      (data) =>
        data.mode !== "manual" || (data.manualCuts && data.manualCuts.length > 0),
      {
        message: "Modo manual requer ao menos um corte (manualCuts).",
        path: ["manualCuts"],
      }
    )
    .refine((data) => data.mode !== "auto" || !!data.aiSlice, {
      message: "Modo automático (IA) requer um slice (aiSlice).",
      path: ["aiSlice"],
    });
