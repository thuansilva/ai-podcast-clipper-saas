"use server";

import { revalidatePath } from "next/cache";

import {
  makeListUserVideosUseCase,
  makeDeleteProjectUseCase,
  makeRenameProjectUseCase,
} from "~/infrastructure/factories/use-case-factories";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";

export async function loadMoreProjectsAction(
  page: number,
  search?: string,
  sort?: string,
) {
  const userId = await makeAuthGateway().getUserId();
  if (!userId) {
    throw new Error("Não autorizado.");
  }

  const useCase = makeListUserVideosUseCase();
  return useCase.execute({
    userId,
    page,
    search,
    sort: sort === "asc" ? "asc" : "desc",
    limit: 20,
  });
}

export async function deleteProjectAction(id: string) {
  try {
    const userId = await makeAuthGateway().getUserId();
    if (!userId) {
      return { success: false, error: "Não autorizado." };
    }

    const useCase = makeDeleteProjectUseCase();
    await useCase.execute({ userId, projectId: id });
    
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/dashboard/projects");

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Ocorreu um erro inesperado ao excluir o projeto." 
    };
  }
}

export async function renameProjectAction(id: string, newName: string) {
  try {
    const userId = await makeAuthGateway().getUserId();
    if (!userId) {
      return { success: false, error: "Não autorizado." };
    }

    const useCase = makeRenameProjectUseCase();
    await useCase.execute({ userId, projectId: id, newName });

    const { revalidatePath } = await import("next/cache");
    revalidatePath("/dashboard/projects");

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Ocorreu um erro inesperado ao renomear o projeto." 
    };
  }
}

export async function retryProjectAction(
  projectId: string, 
  updates?: {
    subtitlePreset?: string;
    clipModel?: string;
    aspectRatio?: string;
    autoZoom?: boolean;
    sliceStartTime?: number;
    sliceEndTime?: number;
  }
): Promise<{ success: boolean; error?: string }> {
  const userId = await makeAuthGateway().getUserId();
  if (!userId) return { success: false, error: "Não autorizado." };
  
  try {
    const { makeRetryProjectUseCase } = await import("~/infrastructure/factories/use-case-factories");
    const useCase = makeRetryProjectUseCase();
    await useCase.execute({ projectId, userId, updates });
    
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}
