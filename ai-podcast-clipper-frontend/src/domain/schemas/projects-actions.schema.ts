import { z } from "zod";

/**
 * Presets de legenda oferecidos na configuração de projeto (criação via
 * `importYouTubeVideo` e reenvio via `retryProjectAction`), confirmados a partir da
 * lista hardcoded em `src/components/dashboard/create-project-client.tsx` (seção
 * "Estilo da Legenda").
 *
 * Importante: este NÃO é o mesmo conjunto do `SubtitlePreset` do domínio de `Clip`
 * (`HORMOZI | MINIMAL | NEON`, em `src/domain/entities/clip.ts` e usado por
 * `update-clip.schema.ts`), que é um conjunto menor aplicado na edição de um clipe
 * já gerado. Aqui validamos o preset em nível de projeto (`UploadedFile.subtitlePreset`),
 * cujo valor é usado como preset padrão enviado ao pipeline de processamento.
 */
export const PROJECT_SUBTITLE_PRESETS = [
  "HORMOZI",
  "POPPING_GREEN",
  "GAMER",
  "LOUD",
  "NEON",
  "TRUE_CRIME",
  "MINIMAL",
  "CORPORATE",
  "VLOG",
  "ASMR",
  "NONE",
] as const;

export const renameProjectSchema = z.object({
  projectId: z.string().trim().min(1, "ID do projeto é obrigatório."),
  newName: z
    .string()
    .trim()
    .min(1, "O nome do projeto não pode ficar vazio.")
    .max(200, "O nome do projeto deve ter no máximo 200 caracteres."),
});

export const deleteProjectSchema = z.object({
  projectId: z.string().trim().min(1, "ID do projeto é obrigatório."),
});

export const listProjectsSchema = z.object({
  page: z
    .number()
    .int("A página deve ser um número inteiro.")
    .positive("A página deve ser maior que zero."),
  search: z
    .string()
    .trim()
    .max(200, "A busca deve ter no máximo 200 caracteres.")
    .optional(),
  sort: z.enum(["asc", "desc"]).optional(),
});

/**
 * `clipModel` e `aspectRatio` NÃO são validados aqui com `z.enum`: são opções
 * administráveis via tabela `ProcessingOption` (ver `prisma/seed.ts` e
 * `src/application/services/processing-options.service.ts`), carregadas em runtime
 * do banco. `src/actions/youtube.ts` (`importYouTubeVideo`) já segue essa mesma
 * convenção — valida esses dois campos comparando contra `getProcessingOptions()`
 * em vez de um enum fixo no código-fonte. Reaplicar um `z.enum` hardcoded aqui
 * divergiria da fonte real da verdade (o banco) e poderia rejeitar valores
 * legítimos cadastrados depois do deploy.
 *
 * Este schema garante apenas forma e tamanho seguros na borda (string curta e
 * não vazia); `retryProjectAction` faz a checagem de que o valor pertence à lista
 * vigente de `ProcessingOption` como regra de negócio, no mesmo nível em que
 * `importYouTubeVideo` já faz essa checagem.
 */
export const retryProjectUpdatesSchema = z.object({
  subtitlePreset: z.enum(PROJECT_SUBTITLE_PRESETS).optional(),
  clipModel: z.string().trim().min(1).max(50).optional(),
  aspectRatio: z.string().trim().min(1).max(20).optional(),
  autoZoom: z.boolean().optional(),
  sliceStartTime: z.number().nonnegative().optional(),
  sliceEndTime: z.number().nonnegative().optional(),
});

export const retryProjectSchema = z.object({
  projectId: z.string().trim().min(1, "ID do projeto é obrigatório."),
  updates: retryProjectUpdatesSchema.optional(),
});
