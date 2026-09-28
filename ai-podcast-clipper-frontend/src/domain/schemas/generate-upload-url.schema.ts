import { z } from "zod";

/**
 * Este app só processa vídeo (a IA transcreve/corta/legenda vídeo — não faz
 * sentido aceitar outro tipo de mídia aqui). 2GB casa com o teto já
 * documentado em docs/aws-s3-lifecycle-rules.md para uploads/downloads
 * brutos.
 */
export const MAX_VIDEO_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

export const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime", // .mov
  "video/x-matroska", // .mkv
  "video/webm",
  "video/x-msvideo", // .avi
  "video/mpeg",
] as const;

export const generateUploadUrlSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.enum(ALLOWED_VIDEO_MIME_TYPES, {
    errorMap: () => ({
      message: `Tipo de arquivo não suportado. Envie apenas vídeo (${ALLOWED_VIDEO_MIME_TYPES.join(", ")}).`,
    }),
  }),
  fileSizeBytes: z
    .number()
    .int()
    .positive("O arquivo está vazio.")
    .max(
      MAX_VIDEO_UPLOAD_SIZE_BYTES,
      `Arquivo maior que o limite de ${MAX_VIDEO_UPLOAD_SIZE_BYTES / (1024 * 1024 * 1024)}GB.`
    ),
  thumbnailUrl: z.string().optional(),
});
