import { DomainError } from "./domain-error";

/**
 * "Adicionar mais cortes" exige reconstruir uma URL do YouTube para
 * (re)baixar só o range/slice novo — uploads diretos (`sourceType="UPLOAD"`)
 * não têm de onde re-baixar nada (o arquivo original expira do S3 em 1 dia,
 * ver `docs/operacao/aws-s3-lifecycle-rules.md`), então esta feature só
 * aceita projetos `sourceType="YOUTUBE"` com `youtubeUrl` preenchido.
 */
export class UnsupportedAppendSourceError extends DomainError {
  constructor() {
    super(
      "Só é possível adicionar mais cortes a projetos importados do YouTube."
    );
  }
}
