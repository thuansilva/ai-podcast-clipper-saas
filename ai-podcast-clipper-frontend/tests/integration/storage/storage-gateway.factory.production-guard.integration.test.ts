/**
 * @vitest-environment node
 *
 * Integração (factory + `S3StorageGateway` real + presigner real do AWS SDK,
 * só `~/env` é substituído): em produção, um `S3_ENDPOINT_URL` de dev
 * esquecido (MinIO em localhost) é barrado antes de qualquer URL
 * pré-assinada ser entregue ao browser; um endpoint público HTTPS gera URLs
 * pré-assinadas exatamente nesse host. Não depende de rede (pré-assinar é
 * só cálculo local), então serve de base para um e2e futuro que troque a
 * env real do processo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {} as Record<string, string | undefined>,
}));

vi.mock("~/env", () => ({ env: mockEnv }));

import { createStorageGateway } from "~/infrastructure/factories/storage-gateway.factory";

function setEnv(overrides: Record<string, string | undefined>): void {
  for (const key of Object.keys(mockEnv)) delete mockEnv[key];
  Object.assign(
    mockEnv,
    {
      // Baseline "minio": todos os cenários deste arquivo exercitam
      // S3_ENDPOINT_URL (dev local ou host público self-hosted), que só é
      // aceito com STORAGE_PROVIDER=minio (STORAGE_PROVIDER=s3 + endpoint
      // é erro de configuração desde a remoção da inferência implícita).
      STORAGE_PROVIDER: "minio",
      AWS_ACCESS_KEY_ID: "AKIAINTEGRATIONFIXTURE",
      AWS_SECRET_ACCESS_KEY: "integration-fixture-secret",
      AWS_REGION: "us-east-1",
      S3_BUCKET_NAME: "ai-podcast-clipper",
    },
    overrides,
  );
}

describe("createStorageGateway em produção (guard de endpoint de dev)", () => {
  beforeEach(() => setEnv({}));

  it("barra S3_ENDPOINT_URL=http://localhost:9000 antes de gerar qualquer URL pré-assinada", () => {
    setEnv({ NODE_ENV: "production", S3_ENDPOINT_URL: "http://localhost:9000" });

    expect(() => createStorageGateway()).toThrow(/S3_ENDPOINT_URL/);
  });

  it("endpoint público HTTPS gera URL pré-assinada de upload nesse host (path-style)", async () => {
    setEnv({ NODE_ENV: "production", S3_ENDPOINT_URL: "https://minio.example.com" });

    const gateway = createStorageGateway();
    const url = new URL(
      await gateway.createUploadPresignedUrl("uploads/u/x/podcast.mp4", "video/mp4", 1024),
    );

    expect(url.protocol).toBe("https:");
    expect(url.host).toBe("minio.example.com");
    expect(url.pathname).toBe("/ai-podcast-clipper/uploads/u/x/podcast.mp4");
  });

  it("em desenvolvimento o MinIO local continua permitido", async () => {
    setEnv({ NODE_ENV: "development", S3_ENDPOINT_URL: "http://localhost:9000" });

    const gateway = createStorageGateway();
    const url = new URL(await gateway.createPlayPresignedUrl("clips/u/x/clip_0.mp4"));

    expect(url.host).toBe("localhost:9000");
  });
});
