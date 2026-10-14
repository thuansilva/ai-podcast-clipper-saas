import { DomainError } from "./domain-error";

/**
 * `Clip.sourceStartTime`/`sourceEndTime` (tempo no vídeo ORIGINAL, ver
 * `AddClipsToProjectUseCase`) só existe de forma confiável para: (a) clipes
 * automáticos (sempre, mesmo os antigos — backfill por migration, já que
 * nesse modo `startTime`/`endTime` sempre coincidem com o original) e (b)
 * clipes manuais criados APÓS esta feature (persistidos a partir de
 * `remappedCuts`). Clipes manuais de projetos do YouTube criados ANTES desta
 * feature não têm como recuperar esse tempo com certeza (o vídeo
 * concatenado que foi de fato processado não existe mais — expirou do S3) —
 * o backfill desses fica `NULL` deliberadamente (nunca inventado).
 *
 * Decisão de segurança: bloquear "adicionar mais cortes" nesse caso
 * específico (projeto com pelo menos um clipe `sourceStartTime IS NULL`) em
 * vez de ignorar esses clipes no cálculo de intervalos já usados — ignorá-los
 * permitiria um corte novo ou slice de IA sobrepor silenciosamente um clipe
 * legado sem detectar a colisão.
 */
export class LegacyClipsMissingSourceRangeError extends DomainError {
  constructor() {
    super(
      "Este projeto tem clipes antigos sem o tempo original registrado e não suporta adicionar mais cortes ainda. Reprocesse o projeto do zero para habilitar esta função."
    );
  }
}
