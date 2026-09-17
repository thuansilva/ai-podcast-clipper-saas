"use server";

import { makeListUserVideosUseCase } from "~/infrastructure/factories/use-case-factories";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";

export async function loadMoreProjectsAction(
  page: number,
  search?: string,
  sort?: string,
) {
  const userId = await makeAuthGateway().getUserId();
  if (!userId) {
    throw new Error("Unauthorized");
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
