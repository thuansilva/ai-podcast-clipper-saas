"use server";

import { revalidatePath } from "next/cache";

import {
  makeListUserVideosUseCase,
  makeDeleteProjectUseCase,
  makeRenameProjectUseCase,
  makeAddClipsToProjectUseCase,
} from "~/infrastructure/factories/use-case-factories";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import {
  makeProjectActionRateLimiter,
  makeYouTubeImportRateLimiter,
} from "~/infrastructure/factories/rate-limiter-factory";
import { RateLimitExceededError } from "~/domain/errors/rate-limit-exceeded-error";
import { DomainError } from "~/domain/errors/domain-error";
import { getProcessingOptions } from "~/application/services/processing-options.service";
import {
  renameProjectSchema,
  deleteProjectSchema,
  listProjectsSchema,
  retryProjectSchema,
} from "~/domain/schemas/projects-actions.schema";
import { addClipsToProjectSchema } from "~/domain/schemas/add-clips-to-project.schema";
import type { AddClipsToProjectActionInput } from "~/domain/schemas/add-clips-to-project.schema";

export async function loadMoreProjectsAction(
  page: number,
  search?: string,
  sort?: string,
) {
  const userId = await makeAuthGateway().getUserId();
  if (!userId) {
    throw new Error("Não autorizado.");
  }

  const parsed = listProjectsSchema.safeParse({ page, search, sort });
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Parâmetros de busca inválidos."
    );
  }

  const useCase = makeListUserVideosUseCase();
  return useCase.execute({
    userId,
    page: parsed.data.page,
    search: parsed.data.search,
    sort: parsed.data.sort === "asc" ? "asc" : "desc",
    limit: 20,
  });
}

export async function deleteProjectAction(id: string) {
  try {
    const userId = await makeAuthGateway().getUserId();
    if (!userId) {
      return { success: false, error: "Não autorizado." };
    }

    const allowed = await makeProjectActionRateLimiter().consume(userId);
    if (!allowed) {
      throw new RateLimitExceededError(
        "Too many requests. Please wait a minute before trying again."
      );
    }

    const parsed = deleteProjectSchema.safeParse({ projectId: id });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "ID do projeto inválido.",
      };
    }

    const useCase = makeDeleteProjectUseCase();
    await useCase.execute({ userId, projectId: parsed.data.projectId });

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

    const allowed = await makeProjectActionRateLimiter().consume(userId);
    if (!allowed) {
      throw new RateLimitExceededError(
        "Too many requests. Please wait a minute before trying again."
      );
    }

    const parsed = renameProjectSchema.safeParse({ projectId: id, newName });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      };
    }

    const useCase = makeRenameProjectUseCase();
    await useCase.execute({
      userId,
      projectId: parsed.data.projectId,
      newName: parsed.data.newName,
    });

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

  const parsed = retryProjectSchema.safeParse({ projectId, updates });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  try {
    const allowed = await makeProjectActionRateLimiter().consume(userId);
    if (!allowed) {
      throw new RateLimitExceededError(
        "Too many requests. Please wait a minute before trying again."
      );
    }

    // clipModel e aspectRatio são opções administráveis via ProcessingOption
    // (banco de dados), não um enum fixo no código — mesma regra de negócio já
    // aplicada em src/actions/youtube.ts (importYouTubeVideo).
    if (parsed.data.updates?.clipModel || parsed.data.updates?.aspectRatio) {
      const options = await getProcessingOptions();

      if (
        parsed.data.updates.clipModel &&
        !options.CLIP_MODEL?.some((o) => o.value === parsed.data.updates!.clipModel)
      ) {
        return { success: false, error: "Modelo de clipe inválido." };
      }

      if (
        parsed.data.updates.aspectRatio &&
        !options.ASPECT_RATIO?.some((o) => o.value === parsed.data.updates!.aspectRatio)
      ) {
        return { success: false, error: "Proporção inválida." };
      }
    }

    const { makeRetryProjectUseCase } = await import("~/infrastructure/factories/use-case-factories");
    const useCase = makeRetryProjectUseCase();
    await useCase.execute({
      projectId: parsed.data.projectId,
      userId,
      updates: parsed.data.updates,
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

/**
 * Server Action para "adicionar mais cortes" a um projeto já existente
 * (manual ou "IA gera mais" sobre um novo slice) — ver
 * `AddClipsToProjectUseCase`. Reaproveita o rate limiter de importação do
 * YouTube (`makeYouTubeImportRateLimiter`, 5/min), não o de ações de
 * projeto (delete/rename/retry, 20/min): assim como `importYouTubeVideo`,
 * esta action dispara um download real + processamento GPU a cada chamada,
 * perfil de custo bem diferente de renomear/deletar.
 */
export async function addClipsToProjectAction(
  projectId: string,
  input: AddClipsToProjectActionInput
): Promise<{ success: boolean; batchId?: string; error?: string }> {
  const userId = await makeAuthGateway().getUserId();
  if (!userId) {
    return { success: false, error: "Não autorizado." };
  }

  const parsed = addClipsToProjectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  if (!projectId || projectId.trim() === "") {
    return { success: false, error: "ID do projeto é obrigatório." };
  }

  try {
    const allowed = await makeYouTubeImportRateLimiter().consume(userId);
    if (!allowed) {
      throw new RateLimitExceededError(
        "Too many requests. Please wait a minute before trying again."
      );
    }

    const useCase = makeAddClipsToProjectUseCase();
    const result = await useCase.execute({
      projectId,
      userId,
      mode: parsed.data.mode,
      manualCuts: parsed.data.manualCuts,
      aiSlice: parsed.data.aiSlice,
    });

    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/projects/${projectId}`);

    return { success: true, batchId: result.batchId };
  } catch (error) {
    if (error instanceof DomainError) {
      return { success: false, error: error.message };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}
