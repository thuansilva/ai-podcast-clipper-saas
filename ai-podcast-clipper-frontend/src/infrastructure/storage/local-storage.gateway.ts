import type { IStorageGateway } from "~/domain/ports/storage-gateway";

export class LocalStorageGateway implements IStorageGateway {
  async createUploadPresignedUrl(
    s3Key: string,
    _contentType: string,
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
    // Requisição interna para a API local deletar o arquivo
    try {
      await fetch(`http://localhost:3000/api/local-storage?key=${encodeURIComponent(key)}`, {
        method: "DELETE"
      });
    } catch (e) {
      console.warn("Failed to delete local object", e);
    }
  }
}
