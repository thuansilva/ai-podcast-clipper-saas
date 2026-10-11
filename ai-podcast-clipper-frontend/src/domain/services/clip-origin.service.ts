/**
 * Origem do clipe: corte manual (usuário definiu os intervalos) ou automático
 * (Gemini escolheu os momentos).
 *
 * Não existe campo explícito em `Clip`. A fonte primária é o projeto:
 * `UploadedFile.manualCutsJson != null` (mesmo critério de `mode` em
 * retry-project e process-video-payload, D6). Como projetos YouTube manuais
 * criados antes desta regra não persistiam `manualCutsJson`, há um fallback
 * legado: clipe sem nota, gancho e motivo (o backend devolve os três `null`
 * no modo manual, pois o Gemini não roda). Clipe automático sempre tem nota.
 */
export interface ClipOriginClipInfo {
  viralityScore?: number | null;
  hook?: string | null;
  reason?: string | null;
}

export interface ClipOriginProjectInfo {
  manualCutsJson?: unknown;
}

export function isManualCut(
  clip: ClipOriginClipInfo,
  project?: ClipOriginProjectInfo | null,
): boolean {
  if (project?.manualCutsJson != null) return true;
  return (
    clip.viralityScore == null && clip.hook == null && clip.reason == null
  );
}
