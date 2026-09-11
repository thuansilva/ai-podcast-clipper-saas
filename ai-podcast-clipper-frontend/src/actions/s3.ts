"use server";

import { auth } from "~/server/auth";
import { makeGenerateUploadUrlUseCase } from "~/infrastructure/factories/use-case-factories";
import { DomainError } from "~/domain/errors/domain-error";

export async function generateUploadUrl(fileInfo: {
  filename: string;
  contentType: string;
}): Promise<{
  success: boolean;
  signedUrl: string;
  key: string;
  uploadedFileId: string;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  try {
    const useCase = makeGenerateUploadUrlUseCase();
    const result = await useCase.execute({
      userId: session.user.id,
      filename: fileInfo.filename,
      contentType: fileInfo.contentType,
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
