export interface IStorageGateway {
  createUploadPresignedUrl(
    s3Key: string,
    contentType: string,
    expiresInSeconds?: number
  ): Promise<string>;

  createPlayPresignedUrl(
    s3Key: string,
    expiresInSeconds?: number
  ): Promise<string>;

  deleteObject(s3Key: string): Promise<void>;
}
