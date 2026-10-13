import { PROJECT_SUBTITLE_PRESETS } from "../schemas/projects-actions.schema";

/**
 * Value Object: SubtitlePreset (nível de projeto)
 *
 * `UploadedFile.subtitlePreset` é uma coluna `string` livre no banco (sem
 * `CHECK`/enum no Postgres), e a allowlist (`PROJECT_SUBTITLE_PRESETS`) só
 * passou a ser validada na borda (`retryProjectUpdatesSchema`,
 * `importYouTubeVideoSchema`) depois que vários projetos já tinham sido
 * criados — logo `subtitlePreset` persistido pode conter qualquer string
 * legada (incluindo valores nunca válidos ou removidos da allowlist).
 *
 * Este Value Object encapsula a normalização desse valor potencialmente sujo
 * vindo do banco para um preset sempre pertencente à allowlist atual, para
 * ser reutilizado por qualquer camada (use case, action, etc.) que precise
 * ler `subtitlePreset` de um projeto já existente e repassá-lo a um sistema
 * downstream que valida contra um enum fechado (ex.: `core/schemas.py` do
 * backend, `Literal[...]`).
 *
 * Não deve ser usado para validar input NOVO vindo de fora (isso é
 * responsabilidade do schema Zod na borda, que já usa `PROJECT_SUBTITLE_PRESETS`
 * diretamente); é especificamente para "higienizar" dado histórico já
 * persistido antes da validação existir.
 */
export type ProjectSubtitlePreset = (typeof PROJECT_SUBTITLE_PRESETS)[number];

export const DEFAULT_PROJECT_SUBTITLE_PRESET: ProjectSubtitlePreset = "HORMOZI";

export function isValidProjectSubtitlePreset(
  value: unknown
): value is ProjectSubtitlePreset {
  return (
    typeof value === "string" &&
    (PROJECT_SUBTITLE_PRESETS as readonly string[]).includes(value)
  );
}

/**
 * Normaliza um `subtitlePreset` possivelmente nulo/vazio/legado (fora da
 * allowlist atual) para um valor sempre válido. Cai no preset default
 * (`HORMOZI`) para `null`, `undefined`, string vazia ou qualquer valor que
 * não pertença mais à allowlist.
 */
export function normalizeSubtitlePreset(
  value: string | null | undefined
): ProjectSubtitlePreset {
  if (isValidProjectSubtitlePreset(value)) {
    return value;
  }
  return DEFAULT_PROJECT_SUBTITLE_PRESET;
}
