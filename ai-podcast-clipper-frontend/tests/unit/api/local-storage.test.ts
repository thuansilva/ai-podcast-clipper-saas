import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { GET, PUT, DELETE } from "~/app/api/local-storage/route";

const UPLOAD_DIR = "/tmp/ai-podcast-clipper";

const mockAuthGateway = {
  getUserId: vi.fn(),
  getCurrentUser: vi.fn(),
  requireUserId: vi.fn(),
};

vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: () => mockAuthGateway,
}));

const mockUploadedFileRepository = { findByS3Key: vi.fn() };
const mockClipRepository = { findByS3Key: vi.fn() };

vi.mock("~/infrastructure/factories/use-case-factories", () => ({
  makeUploadedFileRepository: () => mockUploadedFileRepository,
  makeClipRepository: () => mockClipRepository,
}));

function buildRequest(
  method: string,
  key: string | null,
  body?: BodyInit
): Request {
  const url = new URL("http://localhost:3000/api/local-storage");
  if (key !== null) url.searchParams.set("key", key);
  return new Request(url, { method, body });
}

describe("local-storage route", () => {
  const testKey = `test-${Date.now()}/video.mp4`;
  const testFilePath = path.join(UPLOAD_DIR, testKey);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(testFilePath, { force: true });
  });

  describe("autenticação", () => {
    it("PUT deve retornar 401 se não autenticado", async () => {
      mockAuthGateway.getUserId.mockResolvedValueOnce(null);
      const res = await PUT(buildRequest("PUT", testKey, "conteudo") as any);
      expect(res.status).toBe(401);
    });

    it("GET deve retornar 401 se não autenticado", async () => {
      mockAuthGateway.getUserId.mockResolvedValueOnce(null);
      const res = await GET(buildRequest("GET", testKey) as any);
      expect(res.status).toBe(401);
    });

    it("DELETE deve retornar 401 se não autenticado", async () => {
      mockAuthGateway.getUserId.mockResolvedValueOnce(null);
      const res = await DELETE(buildRequest("DELETE", testKey) as any);
      expect(res.status).toBe(401);
    });
  });

  describe("path traversal", () => {
    beforeEach(() => {
      mockAuthGateway.getUserId.mockResolvedValue("user-123");
    });

    it("GET deve rejeitar key com path absoluto fora do UPLOAD_DIR", async () => {
      const res = await GET(buildRequest("GET", "/etc/passwd") as any);
      expect(res.status).toBe(400);
    });

    it("GET deve rejeitar key com '..' escapando do UPLOAD_DIR", async () => {
      const res = await GET(
        buildRequest("GET", "../../../../../../etc/passwd") as any
      );
      expect(res.status).toBe(400);
    });

    it("PUT deve rejeitar key com '..' escapando do UPLOAD_DIR", async () => {
      const res = await PUT(
        buildRequest("PUT", "../../../../../../tmp/evil.txt", "conteudo") as any
      );
      expect(res.status).toBe(400);
    });

    it("DELETE deve rejeitar key com path absoluto fora do UPLOAD_DIR", async () => {
      const res = await DELETE(buildRequest("DELETE", "/etc/passwd") as any);
      expect(res.status).toBe(400);
    });
  });

  describe("fluxo normal (autenticado, key pertence ao usuário)", () => {
    beforeEach(() => {
      mockAuthGateway.getUserId.mockResolvedValue("user-123");
      mockUploadedFileRepository.findByS3Key.mockResolvedValue({
        id: "file-1",
        userId: "user-123",
        s3Key: testKey,
      });
      mockClipRepository.findByS3Key.mockResolvedValue(null);
    });

    it("deve gravar via PUT e ler o mesmo conteúdo via GET", async () => {
      const content = "conteudo-de-teste";
      const putRes = await PUT(buildRequest("PUT", testKey, content) as any);
      expect(putRes.status).toBe(200);
      expect(fs.existsSync(testFilePath)).toBe(true);

      const getRes = await GET(buildRequest("GET", testKey) as any);
      expect(getRes.status).toBe(200);
    });

    it("deve remover o arquivo via DELETE", async () => {
      fs.mkdirSync(path.dirname(testFilePath), { recursive: true });
      fs.writeFileSync(testFilePath, "conteudo");

      const res = await DELETE(buildRequest("DELETE", testKey) as any);
      expect(res.status).toBe(200);
      expect(fs.existsSync(testFilePath)).toBe(false);
    });

    it("GET também aceita uma key pertencente a um Clip do usuário", async () => {
      mockUploadedFileRepository.findByS3Key.mockResolvedValue(null);
      mockClipRepository.findByS3Key.mockResolvedValue({
        id: "clip-1",
        userId: "user-123",
        s3Key: testKey,
      });
      fs.mkdirSync(path.dirname(testFilePath), { recursive: true });
      fs.writeFileSync(testFilePath, "conteudo");

      const res = await GET(buildRequest("GET", testKey) as any);
      expect(res.status).toBe(200);
    });
  });

  describe("autorização por dono do recurso (IDOR)", () => {
    beforeEach(() => {
      mockAuthGateway.getUserId.mockResolvedValue("attacker-user");
    });

    it("GET deve retornar 404 se a key pertencer a outro usuário", async () => {
      mockUploadedFileRepository.findByS3Key.mockResolvedValue({
        id: "file-1",
        userId: "victim-user",
        s3Key: testKey,
      });
      mockClipRepository.findByS3Key.mockResolvedValue(null);

      const res = await GET(buildRequest("GET", testKey) as any);
      expect(res.status).toBe(404);
    });

    it("GET deve retornar 404 se a key não corresponder a nenhum registro", async () => {
      mockUploadedFileRepository.findByS3Key.mockResolvedValue(null);
      mockClipRepository.findByS3Key.mockResolvedValue(null);

      const res = await GET(buildRequest("GET", "chave-nunca-registrada.mp4") as any);
      expect(res.status).toBe(404);
    });

    it("PUT deve retornar 404 se a key pertencer a outro usuário", async () => {
      mockUploadedFileRepository.findByS3Key.mockResolvedValue({
        id: "file-1",
        userId: "victim-user",
        s3Key: testKey,
      });

      const res = await PUT(buildRequest("PUT", testKey, "conteudo") as any);
      expect(res.status).toBe(404);
      expect(fs.existsSync(testFilePath)).toBe(false);
    });
  });
});
