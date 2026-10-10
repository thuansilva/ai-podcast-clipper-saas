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
 * Duração máxima (em segundos) de um único corte manual. Mesmo limite do
 * backend (`ManualCut.validate_duration`, `_validate_clip_duration(...,
 * max_seconds=60.0)`, RN-PIPE-MANUAL-04) — validar aqui também evita que o
 * usuário configure um corte que só vai falhar silenciosamente (422) na hora
 * de processar, depois do crédito já ter sido reservado.
 */
export const MAX_MANUAL_CUT_DURATION_SECONDS = 60;

/**
 * Valida a FORMA de um corte manual na borda (tipo, não-negatividade,
 * `endTime` estritamente maior que `startTime` e duração máxima de 60s).
 * Compartilhado por `import-youtube-video.schema.ts` e
 * `process-video.schema.ts` para não duplicar a regra em dois lugares.
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
  })
  .refine(
    (cut) => cut.endTime - cut.startTime <= MAX_MANUAL_CUT_DURATION_SECONDS,
    {
      message: `A duração do corte não pode exceder ${MAX_MANUAL_CUT_DURATION_SECONDS}s.`,
      path: ["endTime"],
    }
  );

export const manualCutsArraySchema: ZodType<ManualCutDTO[]> = z
  .array(manualCutSchema)
  .max(
    MAX_MANUAL_CUTS,
    `No máximo ${MAX_MANUAL_CUTS} cortes manuais por importação.`
  );
