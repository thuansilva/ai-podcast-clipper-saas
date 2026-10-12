/**
 * @vitest-environment node
 *
 * TDD RED (Fase 1a): integração de `S3StorageGateway` contra um MinIO real.
 *
 * CONTRATO DE INFRA (alinhar com o agente de `docker-compose.yml`):
 *   - Serviço MinIO no ar em `http://localhost:9000` (API S3).
 *   - Credenciais padrão do MinIO (root user). Podem ser sobrescritas por env
 *     `TEST_MINIO_ACCESS_KEY` / `TEST_MINIO_SECRET_KEY`.
 *   - Região: `us-east-1` (padrão do MinIO).
 *   - Bucket `ai-podcast-clipper-test`: este teste o cria se não existir
 *     (idempotente), então não depende de provisionamento manual.
 *
 * DECISÃO (revisada em 2026-10-12): a suíte "contra MinIO real" faz SKIP
 * gracioso quando o MinIO não está alcançável, em vez de falhar — o mesmo
 * padrão já usado pelos testes do backend marcados `-m minio`
 * (`ai-podcast-clipper-backend/tests/minio_support.py::probe_minio()`). A
 * versão anterior deste comentário dizia "falhamos de propósito para que
 * ausência de infra não passe despercebida em CI", mas essa decisão nunca
 * foi validada contra o CI real: `.github/workflows/ci.yml` nunca
 * provisionou um serviço MinIO (nem para o backend, nem para o frontend) —
 * o único `services:` do job `frontend` é o Postgres. Resultado: todo push
 * quebrava com `ECONNREFUSED localhost:9000`, sendo este o único teste do
 * monorepo a exigir uma infra que o CI nunca teve. A suíte de "contrato de
 * URL" não precisa de rede e roda mesmo sem MinIO. Localmente, com o MinIO
 * do `docker-compose.yml` no ar, a suíte "contra MinIO real" continua
 * rodando de verdade (não há skip incondicional) — ver `probeMinio()`.
 *
 * Base para e2e futuro: as chaves, o payload e a config estão em constantes
 * determinísticas no topo, sob o prefixo `test-fixtures/s3-storage-minio/`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { S3StorageGateway } from "~/infrastructure/storage/s3-storage.gateway";
import { probeMinio } from "../../helpers/probe-minio";

type S3GatewayConfig = ConstructorParameters<typeof S3StorageGateway>[0];

// --- Constantes determinísticas do ambiente de teste (MinIO) ---------------
const MINIO_ENDPOINT =
  process.env.TEST_MINIO_ENDPOINT ?? "http://localhost:9000";
const MINIO_REGION = "us-east-1";
const MINIO_BUCKET = "ai-podcast-clipper-test";
const MINIO_ACCESS_KEY_ID = process.env.TEST_MINIO_ACCESS_KEY ?? "minioadmin";
const MINIO_SECRET_ACCESS_KEY =
  process.env.TEST_MINIO_SECRET_KEY ?? "minioadmin";

const KEY_PREFIX = "test-fixtures/s3-storage-minio/";
const KEYS = {
  upload: `${KEY_PREFIX}upload-tamanho-exato.txt`,
  uploadMismatch: `${KEY_PREFIX}upload-tamanho-divergente.txt`,
  play: `${KEY_PREFIX}play-objeto-existente.txt`,
  delete: `${KEY_PREFIX}delete-objeto-existente.txt`,
} as const;
const ALL_KEYS: readonly string[] = Object.values(KEYS);

const CONTENT_TYPE = "text/plain";
/** Payload determinístico: mesmo conteúdo em toda execução. */
const PAYLOAD = Buffer.from(
  "ai-podcast-clipper: fixture determinística de upload assinado\n",
  "utf8"
);
/** Corpo 1 byte maior que o assinado: o S3/MinIO deve rejeitar. */
const PAYLOAD_MISMATCH = Buffer.concat([
  PAYLOAD,
  Buffer.from("X", "utf8"),
]);

const GATEWAY_CONFIG: S3GatewayConfig = {
  region: MINIO_REGION,
  bucket: MINIO_BUCKET,
  credentials: {
    accessKeyId: MINIO_ACCESS_KEY_ID,
    secretAccessKey: MINIO_SECRET_ACCESS_KEY,
  },
  endpoint: MINIO_ENDPOINT,
  forcePathStyle: true,
};

// Cliente administrativo SEPARADO do gateway sob teste: usado só para
// preparar/limpar fixtures, para que um bug do gateway não contamine o setup.
const adminClient = new S3Client({
  region: MINIO_REGION,
  endpoint: MINIO_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: MINIO_ACCESS_KEY_ID,
    secretAccessKey: MINIO_SECRET_ACCESS_KEY,
  },
});

const gateway = new S3StorageGateway(GATEWAY_CONFIG);

// --- Helpers ----------------------------------------------------------------

async function ensureBucket(): Promise<void> {
  try {
    await adminClient.send(new CreateBucketCommand({ Bucket: MINIO_BUCKET }));
  } catch (error: unknown) {
    const name = (error as { name?: string }).name;
    if (name !== "BucketAlreadyOwnedByYou" && name !== "BucketAlreadyExists") {
      throw error;
    }
  }
}

async function removeKeys(keys: readonly string[]): Promise<void> {
  for (const key of keys) {
    await adminClient.send(
      new DeleteObjectCommand({ Bucket: MINIO_BUCKET, Key: key })
    );
  }
}

async function seedObject(key: string, body: Buffer): Promise<void> {
  await adminClient.send(
    new PutObjectCommand({
      Bucket: MINIO_BUCKET,
      Key: key,
      Body: body,
      ContentType: CONTENT_TYPE,
    })
  );
}

/** Garante que a URL veio do endpoint de teste; falha com motivo claro. */
function expectUrlOnMinio(url: string): void {
  expect(new URL(url).origin).toBe(MINIO_ENDPOINT);
}

async function putTo(url: string, body: Buffer): Promise<Response> {
  return fetch(url, {
    method: "PUT",
    headers: { "Content-Type": CONTENT_TYPE },
    body,
  });
}

async function getFrom(
  url: string
): Promise<{ status: number; body: Buffer }> {
  const response = await fetch(url, { method: "GET" });
  return {
    status: response.status,
    body: Buffer.from(await response.arrayBuffer()),
  };
}

// --- Contrato de URL (sem rede) --------------------------------------------

describe("S3StorageGateway: contrato de URL com endpoint MinIO (sem rede)", () => {
  it("createUploadPresignedUrl gera URL apontando para o endpoint MinIO configurado", async () => {
    const url = await gateway.createUploadPresignedUrl(
      KEYS.upload,
      CONTENT_TYPE,
      PAYLOAD.length
    );

    expectUrlOnMinio(url);
  });

  it("createPlayPresignedUrl gera URL apontando para o endpoint MinIO configurado", async () => {
    const url = await gateway.createPlayPresignedUrl(KEYS.play);

    expectUrlOnMinio(url);
  });
});

// --- Fluxo real contra MinIO ------------------------------------------------

// Top-level await: a checagem de reachability precisa resolver ANTES do
// `describe` abaixo rodar, porque `describe.skipIf` só aceita um boolean
// síncrono (não uma Promise). O ambiente de teste (Vitest + Vite, ESM,
// target es2022) suporta top-level await em arquivos de teste.
const isMinioReachable = await probeMinio(MINIO_ENDPOINT);

describe.skipIf(!isMinioReachable)(
  "S3StorageGateway contra MinIO real (integração)",
  () => {
    beforeAll(async () => {
      try {
        await ensureBucket();
      } catch (error: unknown) {
        throw new Error(
          `MinIO indisponível em ${MINIO_ENDPOINT} (bucket ${MINIO_BUCKET}). ` +
            `Suba o serviço MinIO do docker-compose ou ajuste TEST_MINIO_ENDPOINT. ` +
            `Causa: ${String(error)}`
        );
      }
    });

    beforeEach(async () => {
      await removeKeys(ALL_KEYS);
    });

    afterAll(async () => {
      await removeKeys(ALL_KEYS);
    });

    it("PUT com o tamanho exato assinado é aceito (200) e o objeto fica disponível", async () => {
      const uploadUrl = await gateway.createUploadPresignedUrl(
        KEYS.upload,
        CONTENT_TYPE,
        PAYLOAD.length
      );
      expectUrlOnMinio(uploadUrl);

      const response = await putTo(uploadUrl, PAYLOAD);

      expect(response.status).toBe(200);
      const stored = await getFrom(
        await gateway.createPlayPresignedUrl(KEYS.upload)
      );
      expect(stored.status).toBe(200);
      expect(stored.body.equals(PAYLOAD)).toBe(true);
    });

    it("PUT com corpo de tamanho diferente do assinado é rejeitado e o objeto NÃO é criado", async () => {
      const uploadUrl = await gateway.createUploadPresignedUrl(
        KEYS.uploadMismatch,
        CONTENT_TYPE,
        PAYLOAD.length
      );
      expectUrlOnMinio(uploadUrl);

      const response = await putTo(uploadUrl, PAYLOAD_MISMATCH);

      expect(response.ok).toBe(false);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);

      const stored = await getFrom(
        await gateway.createPlayPresignedUrl(KEYS.uploadMismatch)
      );
      expect(stored.status).toBe(404);
    });

    it("GET pela URL de play devolve exatamente o conteúdo enviado", async () => {
      await seedObject(KEYS.play, PAYLOAD);
      const playUrl = await gateway.createPlayPresignedUrl(KEYS.play);
      expectUrlOnMinio(playUrl);

      const downloaded = await getFrom(playUrl);

      expect(downloaded.status).toBe(200);
      expect(downloaded.body.equals(PAYLOAD)).toBe(true);
    });

    it("deleteFile remove o objeto de verdade (GET posterior retorna 404)", async () => {
      await seedObject(KEYS.delete, PAYLOAD);
      const playUrl = await gateway.createPlayPresignedUrl(KEYS.delete);
      expect((await getFrom(playUrl)).status).toBe(200);

      await gateway.deleteFile(KEYS.delete);

      const afterDelete = await getFrom(playUrl);
      expect(afterDelete.status).toBe(404);
    });
  }
);
