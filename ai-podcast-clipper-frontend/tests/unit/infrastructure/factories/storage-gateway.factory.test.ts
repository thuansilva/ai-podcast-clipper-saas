/**
 * @vitest-environment node
 *
 * Decisão de design (aprovada): `STORAGE_PROVIDER` tem exatamente 2 valores
 * válidos e explícitos:
 * - "s3": AWS S3 real. `S3_ENDPOINT_URL` NÃO deve estar setado — se estiver,
 *   é erro (nunca mais inferimos MinIO implicitamente a partir do endpoint).
 * - "minio": qualquer S3-compatível self-hosted (dev ou produção).
 *   `S3_ENDPOINT_URL` é obrigatório — se faltar, é erro.
 *
 * Por dentro, os dois valores usam a MESMA classe `S3StorageGateway` — só
 * muda se `endpoint`/`forcePathStyle` são passados no construtor. O modo de
 * armazenamento em disco local ("local") foi removido completamente.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStorageGateway } from "~/infrastructure/factories/storage-gateway.factory";
import { S3StorageGateway } from "~/infrastructure/storage/s3-storage.gateway";

/** Forma das variáveis de storage lidas de `~/env` pela factory. */
interface StorageEnvFixture {
  STORAGE_PROVIDER: "s3" | "minio";
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  S3_BUCKET_NAME: string;
  S3_ENDPOINT_URL?: string;
  NODE_ENV?: "development" | "test" | "production";
}

/** Config que a factory deve entregar ao construtor de `S3StorageGateway`. */
interface S3ConfigSpy {
  region: string;
  bucket: string;
  credentials: { accessKeyId: string; secretAccessKey: string };
  endpoint?: string;
  forcePathStyle?: boolean;
}

const { mockEnv, baseEnv } = vi.hoisted(() => {
  const baseEnv = (): StorageEnvFixture => ({
    STORAGE_PROVIDER: "s3",
    AWS_ACCESS_KEY_ID: "AKIA_FIXTURE_ENV",
    AWS_SECRET_ACCESS_KEY: "secret_fixture_env",
    AWS_REGION: "sa-east-1",
    S3_BUCKET_NAME: "bucket-da-env",
  });
  return { mockEnv: baseEnv(), baseEnv };
});

vi.mock("~/env", () => ({ env: mockEnv }));

// Stub que apenas registra a config recebida no construtor. Usar um stub
// (e não o S3Client real) mantém o teste unitário isolado de rede/SDK.
vi.mock("~/infrastructure/storage/s3-storage.gateway", () => {
  class S3StorageGatewayStub {
    readonly config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
  }
  return { S3StorageGateway: S3StorageGatewayStub };
});

function setEnv(overrides: Partial<StorageEnvFixture> = {}): void {
  for (const key of Object.keys(mockEnv) as (keyof StorageEnvFixture)[]) {
    delete (mockEnv as Partial<StorageEnvFixture>)[key];
  }
  Object.assign(mockEnv, baseEnv(), overrides);
}

function configOf(gateway: unknown): S3ConfigSpy {
  return (gateway as { config: S3ConfigSpy }).config;
}

describe("createStorageGateway", () => {
  beforeEach(() => {
    setEnv();
  });

  it("STORAGE_PROVIDER=s3 sem S3_ENDPOINT_URL retorna S3StorageGateway configurado só com region/bucket/credentials da env (AWS real)", () => {
    setEnv({ STORAGE_PROVIDER: "s3" });

    const gateway = createStorageGateway();

    expect(gateway).toBeInstanceOf(S3StorageGateway);
    const config = configOf(gateway);
    expect(config).toEqual({
      region: "sa-east-1",
      bucket: "bucket-da-env",
      credentials: {
        accessKeyId: "AKIA_FIXTURE_ENV",
        secretAccessKey: "secret_fixture_env",
      },
    });
    expect(config).not.toHaveProperty("endpoint");
    expect(config).not.toHaveProperty("forcePathStyle");
  });

  it("STORAGE_PROVIDER=s3 com S3_ENDPOINT_URL setado falha alto (nunca mais infere MinIO implicitamente)", () => {
    setEnv({
      STORAGE_PROVIDER: "s3",
      S3_ENDPOINT_URL: "http://localhost:9000",
    });

    expect(() => createStorageGateway()).toThrow(/STORAGE_PROVIDER=minio/);
  });

  it('STORAGE_PROVIDER=minio com S3_ENDPOINT_URL retorna S3StorageGateway com endpoint e forcePathStyle=true', () => {
    setEnv({
      STORAGE_PROVIDER: "minio",
      S3_ENDPOINT_URL: "http://localhost:9000",
    });

    const gateway = createStorageGateway();

    expect(gateway).toBeInstanceOf(S3StorageGateway);
    const config = configOf(gateway);
    expect(config.endpoint).toBe("http://localhost:9000");
    expect(config.forcePathStyle).toBe(true);
    // Credenciais e bucket continuam vindo da mesma env (MinIO é só S3 com outro host).
    expect(config.region).toBe("sa-east-1");
    expect(config.bucket).toBe("bucket-da-env");
    expect(config.credentials).toEqual({
      accessKeyId: "AKIA_FIXTURE_ENV",
      secretAccessKey: "secret_fixture_env",
    });
  });

  it("STORAGE_PROVIDER=minio sem S3_ENDPOINT_URL falha alto", () => {
    setEnv({ STORAGE_PROVIDER: "minio", S3_ENDPOINT_URL: undefined });

    expect(() => createStorageGateway()).toThrow(/S3_ENDPOINT_URL/);
  });

  it("lê a env no momento da chamada (não congela valores no import do módulo)", () => {
    setEnv({ STORAGE_PROVIDER: "s3" });
    const first = createStorageGateway();
    expect(configOf(first)).not.toHaveProperty("endpoint");

    setEnv({
      STORAGE_PROVIDER: "minio",
      S3_ENDPOINT_URL: "http://minio.internal:9000",
    });
    const second = createStorageGateway();
    expect(configOf(second).endpoint).toBe("http://minio.internal:9000");
  });

  // Auditoria de segurança (Fase 4): endpoint de dev esquecido em produção.
  it("NODE_ENV=production, STORAGE_PROVIDER=minio com S3_ENDPOINT_URL apontando para localhost falha alto (não constrói o gateway)", () => {
    setEnv({
      STORAGE_PROVIDER: "minio",
      S3_ENDPOINT_URL: "http://localhost:9000",
      NODE_ENV: "production",
    });

    expect(() => createStorageGateway()).toThrow(/S3_ENDPOINT_URL/);
  });

  it("NODE_ENV=production, STORAGE_PROVIDER=minio com S3_ENDPOINT_URL público HTTPS constrói o gateway normalmente", () => {
    setEnv({
      STORAGE_PROVIDER: "minio",
      S3_ENDPOINT_URL: "https://minio.example.com",
      NODE_ENV: "production",
    });

    const gateway = createStorageGateway();
    expect(configOf(gateway).endpoint).toBe("https://minio.example.com");
  });

  it("NODE_ENV=production, STORAGE_PROVIDER=s3 (AWS real) não é afetado pelo guard", () => {
    setEnv({ STORAGE_PROVIDER: "s3", NODE_ENV: "production" });

    const gateway = createStorageGateway();
    expect(configOf(gateway)).not.toHaveProperty("endpoint");
  });
});
