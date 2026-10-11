/**
 * @vitest-environment node
 *
 * TDD RED (Fase 1a): contrato das URLs pré-assinadas com config injetada.
 * Usa o SDK real (sem rede: a assinatura é calculada localmente), então o
 * que falha hoje é só o construtor ignorar a config (host/bucket/região
 * vindos da env global, não do endpoint/bucket injetados).
 */
import { describe, it, expect } from "vitest";
import { S3StorageGateway } from "~/infrastructure/storage/s3-storage.gateway";

type S3GatewayConfig = ConstructorParameters<typeof S3StorageGateway>[0];

const CREDENTIALS = {
  accessKeyId: "AKIA_PRESIGN_TEST",
  secretAccessKey: "segredo-presign-test",
};

const MINIO_CONFIG: S3GatewayConfig = {
  region: "us-east-1",
  bucket: "bucket-presign-test",
  credentials: CREDENTIALS,
  endpoint: "http://localhost:9000",
};

const AWS_CONFIG: S3GatewayConfig = {
  region: "sa-east-1",
  bucket: "bucket-presign-test",
  credentials: CREDENTIALS,
};

const KEY = "test-fixtures/presign/upload.txt";
const CONTENT_TYPE = "text/plain";
const FILE_SIZE_BYTES = 1234;

function signedHeadersOf(url: string): string[] {
  const value = new URL(url).searchParams.get("X-Amz-SignedHeaders") ?? "";
  return value.split(";");
}

describe("S3StorageGateway: URLs pré-assinadas", () => {
  it("com endpoint, a URL de upload aponta para o host do endpoint em path-style (bucket no path)", async () => {
    const gateway = new S3StorageGateway(MINIO_CONFIG);

    const url = new URL(
      await gateway.createUploadPresignedUrl(KEY, CONTENT_TYPE, FILE_SIZE_BYTES)
    );

    expect(url.origin).toBe("http://localhost:9000");
    expect(url.pathname).toBe(`/bucket-presign-test/${KEY}`);
  });

  it("com endpoint, a URL de play (GET) aponta para o host do endpoint em path-style", async () => {
    const gateway = new S3StorageGateway(MINIO_CONFIG);

    const url = new URL(await gateway.createPlayPresignedUrl(KEY));

    expect(url.origin).toBe("http://localhost:9000");
    expect(url.pathname).toBe(`/bucket-presign-test/${KEY}`);
  });

  it("sem endpoint, a URL usa o host virtual-hosted da AWS com o bucket injetado (regressão AWS)", async () => {
    const gateway = new S3StorageGateway(AWS_CONFIG);

    const url = new URL(
      await gateway.createUploadPresignedUrl(KEY, CONTENT_TYPE, FILE_SIZE_BYTES)
    );

    expect(url.hostname).toBe("bucket-presign-test.s3.sa-east-1.amazonaws.com");
    expect(url.pathname).toBe(`/${KEY}`);
  });

  it("a URL de upload assina ContentLength (content-length em X-Amz-SignedHeaders), como hoje", async () => {
    const gateway = new S3StorageGateway(MINIO_CONFIG);

    const url = await gateway.createUploadPresignedUrl(
      KEY,
      CONTENT_TYPE,
      FILE_SIZE_BYTES
    );

    expect(signedHeadersOf(url)).toContain("content-length");
  });

  it("respeita expiresInSeconds informado (X-Amz-Expires)", async () => {
    const gateway = new S3StorageGateway(MINIO_CONFIG);

    const url = new URL(
      await gateway.createUploadPresignedUrl(KEY, CONTENT_TYPE, FILE_SIZE_BYTES, 120)
    );

    expect(url.searchParams.get("X-Amz-Expires")).toBe("120");
  });
});
