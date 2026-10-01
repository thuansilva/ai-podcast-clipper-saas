import { z, type ZodType } from "zod";
import type { ManualCutDTO } from "~/application/dtos/video-dtos";

/**
 * Limite de sanidade sem requisito de produto confirmado: nenhum teto de
 * negócio para "quantos cortes manuais um usuário pode configurar em um
 * único vídeo" foi definido até hoje. 50 cortes evita que um payload
 * malicioso (ex: via curl direto na Server Action) force a criação de
 * milhares de entradas em `UploadedFile.manualCutsJson` e no evento
 * enfileirado no Inngest, sem impedir nenhum uso legítimo conhecido (um
 * podcast longo dificilmente teria mais de algumas dezenas de cortes manuais
 * configurados de uma vez).
 */
export const MAX_MANUAL_CUTS = 50;

/**
 * Valida a FORMA de um corte manual na borda (tipo, não-negatividade e que
 * `endTime` seja estritamente maior que `startTime`). Compartilhado por
 * `import-youtube-video.schema.ts` e `process-video.schema.ts` para não
 * duplicar a regra em dois lugares.
 */
export const manualCutSchema: ZodType<ManualCutDTO> = z
  .object({
    id: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    startTime: z.number().nonnegative(),
    endTime: z.number().nonnegative(),
  })
  .refine((cut) => cut.endTime > cut.startTime, {
    message: "endTime deve ser maior que startTime.",
    path: ["endTime"],
  });

export const manualCutsArraySchema: ZodType<ManualCutDTO[]> = z
  .array(manualCutSchema)
  .max(
    MAX_MANUAL_CUTS,
    `No máximo ${MAX_MANUAL_CUTS} cortes manuais por importação.`
  );
