import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { LocalStorageGateway } from "~/infrastructure/storage/local-storage.gateway";
import { LOCAL_STORAGE_UPLOAD_DIR } from "~/infrastructure/storage/local-storage-path";

describe("LocalStorageGateway", () => {
  const gateway = new LocalStorageGateway();
  const key = `test-${Date.now()}/clip.mp4`;
  const filePath = path.join(LOCAL_STORAGE_UPLOAD_DIR, key);

  beforeEach(() => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "conteudo");
  });

  afterEach(() => {
    fs.rmSync(filePath, { force: true });
    vi.restoreAllMocks();
  });

  it("deve deletar o arquivo diretamente do disco, sem chamada HTTP", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");

    await gateway.deleteFile(key);

    expect(fs.existsSync(filePath)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("não deve deletar (nem lançar) se a key escapar do diretório de upload", async () => {
    await gateway.deleteFile("../../etc/passwd");
    // Só garantimos que não propaga exceção e que o arquivo de teste,
    // que não tem nada a ver com essa key, permanece intacto.
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("createUploadPresignedUrl e createPlayPresignedUrl continuam retornando a URL interna", async () => {
    const uploadUrl = await gateway.createUploadPresignedUrl(key, "video/mp4", 1000);
    const playUrl = await gateway.createPlayPresignedUrl(key);

    expect(uploadUrl).toBe(`/api/local-storage?key=${encodeURIComponent(key)}`);
    expect(playUrl).toBe(`/api/local-storage?key=${encodeURIComponent(key)}`);
  });
});
