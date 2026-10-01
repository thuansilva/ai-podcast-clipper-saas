import { z } from "zod";

/**
 * Checagem de forma na borda, antes de delegar a validação semântica (é
 * realmente uma URL do YouTube? qual o video id?) para o value object de domínio
 * `YouTubeUrl` (`src/domain/value-objects/youtube-url.vo.ts`). Mantém o mesmo
 * padrão dos demais schemas desta pasta, sem reescrever a lógica que já existe no
 * domínio.
 */
export const fetchYouTubeVideoInfoSchema = z.object({
  url: z.string().trim().url(),
});
