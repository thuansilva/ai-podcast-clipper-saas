import fs from "fs";
import type { IStorageGateway } from "~/domain/ports/storage-gateway";
import { resolveLocalStoragePath } from "./local-storage-path";

export class LocalStorageGateway implements IStorageGateway {
  async createUploadPresignedUrl(
    s3Key: string,
    _contentType: string,
    _fileSizeBytes: number,
    _expiresInSeconds = 3600
  ): Promise<string> {
    // Retorna a URL da nossa API interna passando o key
    return `/api/local-storage?key=${encodeURIComponent(s3Key)}`;
  }

  async createPlayPresignedUrl(
    s3Key: string,
    _expiresInSeconds = 3600
  ): Promise<string> {
    // Retorna a mesma URL. Como é GET, o navegador fará o download/play
    return `/api/local-storage?key=${encodeURIComponent(s3Key)}`;
  }

  async deleteFile(key: string): Promise<void> {
    // Deleta diretamente do disco: esta classe já roda no servidor, então
    // não há motivo (nem sessão de usuário disponível) para dar um round-trip
    // HTTP até a própria API — o equivalente S3 também deleta diretamente,
    // via SDK, sem HTTP intermediário.
    const filePath = resolveLocalStoragePath(key);
    if (!filePath) {
      console.warn(`Refusing to delete local object outside upload dir: ${key}`);
      return;
    }

    try {
      await fs.promises.unlink(filePath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
        console.warn("Failed to delete local object", error);
      }
    }
  }
}
