"use server";

import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { makeGenerateUploadUrlUseCase } from "~/infrastructure/factories/use-case-factories";
import { makeUploadUrlRateLimiter } from "~/infrastructure/factories/rate-limiter-factory";
import { DomainError } from "~/domain/errors/domain-error";
import { RateLimitExceededError } from "~/domain/errors/rate-limit-exceeded-error";
import { generateUploadUrlSchema } from "~/domain/schemas/generate-upload-url.schema";

export async function generateUploadUrl(fileInfo: {
  filename: string;
  contentType: string;
  fileSizeBytes: number;
  thumbnailUrl?: string;
}): Promise<{
  success: boolean;
  signedUrl: string;
  key: string;
  uploadedFileId: string;
  error?: string;
}> {
  const userId = await makeAuthGateway().getUserId();
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const parsed = generateUploadUrlSchema.safeParse(fileInfo);
  if (!parsed.success) {
    return {
      success: false,
      signedUrl: "",
      key: "",
      uploadedFileId: "",
      error: parsed.error.issues[0]?.message ?? "Arquivo inválido.",
    };
  }

  try {
    const allowed = await makeUploadUrlRateLimiter().consume(userId);
    if (!allowed) {
      throw new RateLimitExceededError(
        "Too many requests. Please wait a minute before requesting another upload."
      );
    }

    const useCase = makeGenerateUploadUrlUseCase();
    const result = await useCase.execute({
      userId,
      filename: parsed.data.filename,
      contentType: parsed.data.contentType,
      fileSizeBytes: parsed.data.fileSizeBytes,
      thumbnailUrl: parsed.data.thumbnailUrl,
    });

    return {
      success: true,
      signedUrl: result.signedUrl,
      key: result.s3Key,
      uploadedFileId: result.uploadedFileId,
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        success: false,
        signedUrl: "",
        key: "",
        uploadedFileId: "",
        error: error.message,
      };
    }
    throw error;
  }
}
