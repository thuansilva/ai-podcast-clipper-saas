/**
 * @vitest-environment node
 *
 * TDD RED (Fase 1a): o construtor de `S3StorageGateway` ainda não aceita
 * config injetada (lê `env` direto). Estes testes devem falhar porque o
 * `S3Client` é criado com `region`/`credentials` de `env` (us-east-1 / mock_key),
 * e não com a config passada.
 *
 * Mockamos apenas o construtor do `S3Client` para inspecionar as opções
 * recebidas; comandos e presigner continuam reais (ver o arquivo `.presign`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { S3StorageGateway } from "~/infrastructure/storage/s3-storage.gateway";

/** Tipo derivado do construtor atual: a Fase 2 define o shape real. */
type S3GatewayConfig = ConstructorParameters<typeof S3StorageGateway>[0];

const s3ClientConstructor = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();

  class S3ClientSpy {
    send = vi.fn();
    constructor(options: unknown) {
      s3ClientConstructor(options);
    }
  }

  return { ...actual, S3Client: S3ClientSpy };
});

// Valores distintos dos da env de teste (setup.ts) para provar que a config
// injetada é a fonte de verdade, e não a env global.
const BASE_CONFIG: S3GatewayConfig = {
  region: "sa-east-1",
  bucket: "bucket-injetado",
  credentials: {
    accessKeyId: "AKIA_INJETADA",
    secretAccessKey: "segredo-injetado",
  },
};

function lastS3ClientOptions(): Record<string, unknown> {
  expect(s3ClientConstructor).toHaveBeenCalledTimes(1);
  const [options] = s3ClientConstructor.mock.calls[0] as [
    Record<string, unknown>,
  ];
  return options;
}

describe("S3StorageGateway: construção do S3Client a partir da config injetada", () => {
  beforeEach(() => {
    s3ClientConstructor.mockClear();
  });

  it("sem endpoint na config, cria S3Client só com region/credentials (AWS real, sem endpoint nem forcePathStyle)", () => {
    new S3StorageGateway(BASE_CONFIG);

    const options = lastS3ClientOptions();
    expect(options).toEqual({
      region: "sa-east-1",
      credentials: {
        accessKeyId: "AKIA_INJETADA",
        secretAccessKey: "segredo-injetado",
      },
    });
    expect(options).not.toHaveProperty("endpoint");
    expect(options).not.toHaveProperty("forcePathStyle");
  });

  it("com endpoint na config, cria S3Client com endpoint igual ao passado e forcePathStyle=true", () => {
    new S3StorageGateway({
      ...BASE_CONFIG,
      endpoint: "http://localhost:9000",
    });

    const options = lastS3ClientOptions();
    expect(options.endpoint).toBe("http://localhost:9000");
    expect(options.forcePathStyle).toBe(true);
    expect(options.region).toBe("sa-east-1");
    expect(options.credentials).toEqual({
      accessKeyId: "AKIA_INJETADA",
      secretAccessKey: "segredo-injetado",
    });
  });
});
