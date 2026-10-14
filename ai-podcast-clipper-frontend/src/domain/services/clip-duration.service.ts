/**
 * Duração total exibida como "duração dos cortes" na tela de detalhes do
 * projeto (`src/app/dashboard/projects/[id]/page.tsx`).
 *
 * Bug corrigido: a tela mostrava `project.durationSeconds`, que é a duração
 * do VÍDEO BAIXADO (`durationSeconds = downloadResult.duration` em
 * `src/inngest/functions.ts`) — no modo automático isso é o vídeo inteiro.
 * O "Fatiador Inteligente" só afeta o cálculo de créditos via
 * `computeEffectiveProcessingDuration` (`src/domain/services/processing-duration.service.ts`),
 * nunca restringe o download real. O usuário via, portanto, a duração do
 * vídeo original, não a dos cortes gerados.
 *
 * A duração correta é a soma de `durationSeconds` de TODOS os clipes do
 * projeto (não só os da página atual, já que a listagem de clipes é
 * paginada). Essa soma vem de um aggregate do Prisma
 * (`db.clip.aggregate({ _sum: { durationSeconds: true } })`), cujo `_sum`
 * é `null` quando o projeto ainda não tem nenhum clipe — por isso esta
 * função aceita `null`/`undefined`.
 */
export function formatClipsDurationLabel(
  totalDurationSeconds: number | null | undefined,
): string {
  const safeSeconds = Math.max(0, totalDurationSeconds ?? 0);
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes} min de cortes gerados`;
}
