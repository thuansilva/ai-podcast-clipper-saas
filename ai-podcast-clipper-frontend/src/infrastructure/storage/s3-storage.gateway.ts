import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { IStorageGateway } from "~/domain/ports/storage-gateway";

/**
 * Config injetada no gateway. Nenhum campo é lido de `~/env` diretamente
 * aqui: quem resolve a env (AWS real vs MinIO) é a factory
 * (`~/infrastructure/factories/storage-gateway.factory`), para que este
 * gateway permaneça agnóstico de onde a config vem (produção, teste de
 * integração contra MinIO, etc.).
 */
export interface IS3StorageGatewayConfig {
  region: string;
  bucket: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  /** Setado para MinIO/S3-compatível; ausente = AWS S3 real. */
  endpoint?: string;
  /**
   * Quando omitido mas `endpoint` está presente, o gateway força
   * `true` sozinho (MinIO exige path-style). Sem `endpoint`, nunca é
   * enviado ao `S3Client` — regressão do caso AWS real.
   */
  forcePathStyle?: boolean;
}

export class S3StorageGateway implements IStorageGateway {
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(config: IS3StorageGatewayConfig) {
    this.bucket = config.bucket;

    this.s3Client = new S3Client({
      region: config.region,
      credentials: config.credentials,
      ...(config.endpoint
        ? {
            endpoint: config.endpoint,
            forcePathStyle: true,
            // AWS SDK v3 adiciona por padrão um header de checksum (CRC32) na
            // URL pré-assinada; o MinIO rejeita esse header com `BadDigest`
            // em alguns casos. "WHEN_REQUIRED" mantém o comportamento
            // legado (sem checksum automático), restrito ao caso
            // S3-compatível (endpoint customizado) para não alterar a
            // config observável da AWS real.
            requestChecksumCalculation: "WHEN_REQUIRED" as const,
          }
        : {}),
    });
  }

  async createUploadPresignedUrl(
    s3Key: string,
    contentType: string,
    fileSizeBytes: number,
    expiresInSeconds = 3600
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: contentType,
      // Assinar com ContentLength faz o S3 rejeitar qualquer PUT cujo corpo
      // não bata exatamente com o tamanho declarado — impede que o cliente
      // envie mais bytes do que o anunciado (e validado) em generateUploadUrl.
      ContentLength: fileSizeBytes,
    });

    return await getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  async createPlayPresignedUrl(
    s3Key: string,
    expiresInSeconds = 3600
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });

    return await getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.s3Client.send(command);
  }
}
