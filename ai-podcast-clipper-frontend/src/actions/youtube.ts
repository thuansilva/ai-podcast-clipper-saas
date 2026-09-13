"use server";

import { revalidatePath } from "next/cache";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { makeImportYouTubeVideoUseCase } from "~/infrastructure/factories/use-case-factories";
import { DomainError } from "~/domain/errors/domain-error";

export interface ImportYouTubeVideoInput {
  url: string;
  preset?: string;
}

export interface ImportYouTubeVideoResult {
  success: boolean;
  uploadedFileId?: string;
  error?: string;
}

/**
 * Server Action para importação de vídeos do YouTube
 * RN-06: Validação, criação de registro com sourceType YOUTUBE e enfileiramento no Inngest
 */
export async function importYouTubeVideo({
  url,
  preset,
}: ImportYouTubeVideoInput): Promise<ImportYouTubeVideoResult> {
  const userId = await makeAuthGateway().getUserId();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const useCase = makeImportYouTubeVideoUseCase();
    const result = await useCase.execute({
      userId,
      url,
      preset,
    });

    revalidatePath("/dashboard");

    return {
      success: true,
      uploadedFileId: result.uploadedFileId,
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        success: false,
        error: error.message,
      };
    }
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to import YouTube video",
    };
  }
}
