/**
 * @vitest-environment node
 *
 * Auditoria de segurança (Fase 4 do storage plugável): guard contra endpoint
 * S3-compatível de dev (MinIO em `localhost`/rede interna) esquecido em
 * produção.
 *
 * No frontend, o `endpoint` vira o host das URLs pré-assinadas que o
 * BROWSER do usuário usa para PUT/GET. Em produção, um endpoint
 * `localhost`/IP privado/hostname interno/`http:` nunca funciona para o
 * usuário final (aponta para a máquina dele, para uma rede que ele não
 * alcança, ou é bloqueado como mixed content num site HTTPS) — falhar alto e
 * cedo é estritamente melhor do que falhar silenciosamente no browser.
 */
import { describe, it, expect } from "vitest";
import {
  assertStorageEndpointAllowed,
  UnsafeStorageEndpointError,
} from "~/infrastructure/storage/storage-endpoint-guard";

describe("assertStorageEndpointAllowed", () => {
  describe("NODE_ENV=production", () => {
    it.each([
      ["http://localhost:9000"],
      ["https://localhost:9000"],
      ["https://minio.localhost"],
      ["https://127.0.0.1:9000"],
      ["https://127.10.0.1"],
      ["https://0.0.0.0:9000"],
      ["https://[::1]:9000"],
      ["https://10.0.0.5"],
      ["https://172.16.0.1"],
      ["https://172.31.255.254"],
      ["https://192.168.1.10:9000"],
      ["https://169.254.169.254"],
      ["https://[fd00::1]"],
      ["https://[fe80::1]"],
      ["https://minio:9000"],
      ["https://minio.internal"],
      ["https://nas.local"],
    ])("rejeita endpoint interno/dev %s", (endpoint) => {
      expect(() => assertStorageEndpointAllowed(endpoint, "production")).toThrow(
        UnsafeStorageEndpointError,
      );
    });

    it("rejeita endpoint público sem TLS (http:)", () => {
      expect(() =>
        assertStorageEndpointAllowed("http://s3.example.com", "production"),
      ).toThrow(/https/);
    });

    it("a mensagem de erro cita S3_ENDPOINT_URL para o operador achar a causa", () => {
      expect(() =>
        assertStorageEndpointAllowed("http://localhost:9000", "production"),
      ).toThrow(/S3_ENDPOINT_URL/);
    });

    it.each([
      ["https://s3.example.com"],
      ["https://minio.minha-empresa.com.br:9000"],
      ["https://172.32.0.1"],
      ["https://8.8.8.8"],
    ])("aceita endpoint público HTTPS %s", (endpoint) => {
      expect(() => assertStorageEndpointAllowed(endpoint, "production")).not.toThrow();
    });
  });

  describe.each([["development"], ["test"], [undefined]])("NODE_ENV=%s", (nodeEnv) => {
    it.each([["http://localhost:9000"], ["http://minio:9000"], ["http://192.168.1.10:9000"]])(
      "permite endpoint de dev %s",
      (endpoint) => {
        expect(() => assertStorageEndpointAllowed(endpoint, nodeEnv)).not.toThrow();
      },
    );
  });
});
