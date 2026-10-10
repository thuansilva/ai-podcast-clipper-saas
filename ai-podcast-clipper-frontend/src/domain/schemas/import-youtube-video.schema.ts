import { z, type ZodType } from "zod";
import type { ImportYouTubeVideoInput } from "~/application/dtos/video-dtos";
import { manualCutsArraySchema } from "./manual-cut.schema";
import { PROJECT_SUBTITLE_PRESETS } from "./projects-actions.schema";

/**
 * Payload de `importYouTubeVideo` (`src/actions/youtube.ts`) sem `userId`,
 * que não vem do cliente — é resolvido na própria action via
 * `makeAuthGateway().getUserId()` depois de autenticar a sessão.
 */
export type ImportYouTubeVideoActionInput = Omit<
  ImportYouTubeVideoInput,
  "userId"
>;

/**
 * Checagem de FORMA na borda. Note o que esta checagem deliberadamente NÃO
 * faz, para não duplicar regra de negócio que já mora em outro lugar:
 *
 * - `url`: só garante que é uma string não vazia. O formato real (é
 *   realmente uma URL do YouTube? qual o video id?) já é validado pelo value
 *   object de domínio `YouTubeUrl` dentro de `ImportYouTubeVideoUseCase`
 *   (`YouTubeUrl.tryCreate`), que lança `InvalidYouTubeUrlError` — reaplicar
 *   um `z.string().url()` aqui rejeitaria incorretamente entradas sem
 *   protocolo (ex: "youtube.com/watch?v=...") que o value object aceita.
 * - `genre` / `clipModel` / `aspectRatio`: só garante a forma (string curta e
 *   não vazia). A checagem de que o valor pertence à lista vigente de
 *   `ProcessingOption` (carregada do banco em runtime) continua na própria
 *   action, como já documentado em `projects-actions.schema.ts`.
 */
export const importYouTubeVideoSchema: ZodType<ImportYouTubeVideoActionInput> =
  z.object({
    url: z.string().trim().min(1, "URL do YouTube é obrigatória."),
    // Allowlist (não só tamanho): o preset chega ao backend de processamento,
    // que já foi vulnerável a injeção de shell via esse campo.
    preset: z.enum(PROJECT_SUBTITLE_PRESETS).optional(),
    mode: z.enum(["auto", "manual"]).optional(),
    manualCuts: manualCutsArraySchema.optional(),
    sliceStartTime: z.number().nonnegative().optional(),
    sliceEndTime: z.number().nonnegative().optional(),
    genre: z.string().trim().min(1).max(50).optional(),
    clipModel: z.string().trim().min(1).max(50).optional(),
    aspectRatio: z.string().trim().min(1).max(20).optional(),
    autoZoom: z.boolean().optional(),
    thumbnailUrl: z.string().trim().max(2000).optional(),
  });
