export interface IStorageGateway {
  createUploadPresignedUrl(
    s3Key: string,
    contentType: string,
    fileSizeBytes: number,
    expiresInSeconds?: number
  ): Promise<string>;

  createPlayPresignedUrl(
    s3Key: string,
    expiresInSeconds?: number
  ): Promise<string>;

  deleteFile(key: string): Promise<void>;
}
