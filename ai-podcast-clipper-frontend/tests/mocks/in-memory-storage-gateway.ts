import type { IStorageGateway } from "~/domain/ports/storage-gateway";

export class InMemoryStorageGateway implements IStorageGateway {
  public deletedKeys: string[] = [];
  public presignedUrls: Map<string, string> = new Map();

  async createUploadPresignedUrl(
    s3Key: string,
    contentType: string,
    expiresInSeconds = 3600
  ): Promise<string> {
    const url = `https://mock-s3.amazonaws.com/${s3Key}?upload=true&expires=${expiresInSeconds}&contentType=${encodeURIComponent(contentType)}`;
    this.presignedUrls.set(s3Key, url);
    return url;
  }

  async createPlayPresignedUrl(
    s3Key: string,
    expiresInSeconds = 3600
  ): Promise<string> {
    const url = `https://mock-s3.amazonaws.com/${s3Key}?play=true&expires=${expiresInSeconds}`;
    this.presignedUrls.set(s3Key, url);
    return url;
  }

  async deleteObject(s3Key: string): Promise<void> {
    this.deletedKeys.push(s3Key);
  }
}
