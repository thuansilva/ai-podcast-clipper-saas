import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "~/env";
import type { IStorageGateway } from "~/domain/ports/storage-gateway";

export class S3StorageGateway implements IStorageGateway {
  private readonly s3Client: S3Client;

  constructor() {
    this.s3Client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  async createUploadPresignedUrl(
    s3Key: string,
    contentType: string,
    expiresInSeconds = 3600
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: s3Key,
      ContentType: contentType,
    });

    return await getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  async createPlayPresignedUrl(
    s3Key: string,
    expiresInSeconds = 3600
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: s3Key,
    });

    return await getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  async deleteObject(s3Key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: s3Key,
    });

    await this.s3Client.send(command);
  }
}
