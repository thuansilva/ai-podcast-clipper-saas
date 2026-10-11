import { env } from "~/env";
import type { IStorageGateway } from "~/domain/ports/storage-gateway";
import {
  S3StorageGateway,
  type IS3StorageGatewayConfig,
} from "~/infrastructure/storage/s3-storage.gateway";
import { assertStorageEndpointAllowed } from "~/infrastructure/storage/storage-endpoint-guard";

/**
 * Resolve o gateway de storage a partir de `env.STORAGE_PROVIDER`.
 *
 * Decisão de design (aprovada): `STORAGE_PROVIDER` tem exatamente 2 valores
 * válidos e explícitos — não há mais inferência implícita de MinIO a partir
 * da presença de `S3_ENDPOINT_URL`, nem um modo "local" de disco (removido
 * completamente):
 *
 * - `"s3"`: AWS S3 real. `S3_ENDPOINT_URL` NÃO deve estar setado — se
 *   estiver, é um erro de configuração (provavelmente um endpoint de dev
 *   esquecido, que antes seria silenciosamente aceito).
 * - `"minio"`: qualquer S3-compatível self-hosted (dev local ou produção
 *   com host próprio). `S3_ENDPOINT_URL` é obrigatório.
 *
 * Por dentro, os dois valores usam a MESMA classe `S3StorageGateway` — só
 * muda se `endpoint`/`forcePathStyle` são passados no construtor.
 *
 * A env é lida no momento da chamada (não no import do módulo), para que
 * trocar `STORAGE_PROVIDER`/`S3_ENDPOINT_URL` em runtime (ex.: testes) surta
 * efeito sem precisar reimportar o módulo.
 */
export function createStorageGateway(): IStorageGateway {
  const baseConfig: Omit<IS3StorageGatewayConfig, "endpoint" | "forcePathStyle"> = {
    region: env.AWS_REGION,
    bucket: env.S3_BUCKET_NAME,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  };

  if (env.STORAGE_PROVIDER === "s3") {
    if (env.S3_ENDPOINT_URL) {
      throw new Error(
        "STORAGE_PROVIDER=s3 não aceita S3_ENDPOINT_URL (isso apontaria a AWS real " +
          "para um host alternativo). Use STORAGE_PROVIDER=minio para um " +
          "S3-compatível self-hosted, ou remova S3_ENDPOINT_URL para usar o AWS S3 real.",
      );
    }

    return new S3StorageGateway(baseConfig);
  }

  // env.STORAGE_PROVIDER === "minio"
  if (!env.S3_ENDPOINT_URL) {
    throw new Error(
      "STORAGE_PROVIDER=minio requer S3_ENDPOINT_URL apontando para o host do " +
        "S3-compatível self-hosted (ex.: http://localhost:9000 em dev, ou um host " +
        "público https:// em produção).",
    );
  }

  // Fase 4 (auditoria de segurança): endpoint de dev (MinIO local)
  // esquecido em produção falha alto aqui, nunca vira URL pré-assinada.
  assertStorageEndpointAllowed(env.S3_ENDPOINT_URL, env.NODE_ENV);

  const config: IS3StorageGatewayConfig = {
    ...baseConfig,
    endpoint: env.S3_ENDPOINT_URL,
    forcePathStyle: true,
  };

  return new S3StorageGateway(config);
}
