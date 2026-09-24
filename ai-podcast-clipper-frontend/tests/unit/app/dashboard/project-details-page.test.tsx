import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ProjectDetailsPage from "~/app/dashboard/projects/[id]/page";
import { redirect } from "next/navigation";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { db } from "~/server/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const error = new Error("NEXT_REDIRECT");
    (error as any).digest = `NEXT_REDIRECT;${url}`;
    throw error;
  }),
}));

vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    uploadedFile: {
      findUnique: vi.fn(),
    },
  },
}));

describe("ProjectDetailsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login if user is not authenticated", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue(null),
    } as any);

    await expect(
      ProjectDetailsPage({ params: Promise.resolve({ id: "proj-123" }), searchParams: Promise.resolve({}) })
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("redirects to /dashboard/projects if project does not exist or does not belong to user", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-1"),
    } as any);

    vi.mocked(db.uploadedFile.findUnique).mockResolvedValue(null);

    await expect(
      ProjectDetailsPage({ params: Promise.resolve({ id: "proj-nonexistent" }), searchParams: Promise.resolve({}) })
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(db.uploadedFile.findUnique).toHaveBeenCalledWith({
      where: { id: "proj-nonexistent", userId: "user-1" },
      include: expect.any(Object),
    });
    expect(redirect).toHaveBeenCalledWith("/dashboard/projects");
  });

  it("renders project details and empty message when clips list is empty", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-1"),
    } as any);

    vi.mocked(db.uploadedFile.findUnique).mockResolvedValue({
      id: "proj-1",
      userId: "user-1",
      displayName: "Meu Podcast Top",
      durationSeconds: 360,
      status: "processing",
      _count: { clips: 0 }, clips: [],
    } as any);

    const result = await ProjectDetailsPage({
      params: Promise.resolve({ id: "proj-1" }), searchParams: Promise.resolve({}),
    });

    expect(result).toBeDefined();
    expect(db.uploadedFile.findUnique).toHaveBeenCalledWith({
      where: { id: "proj-1", userId: "user-1" },
      include: expect.any(Object),
    });
  });

  it("renders contextual failure message when project status is failed", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-1"),
    } as any);

    vi.mocked(db.uploadedFile.findUnique).mockResolvedValue({
      id: "proj-failed",
      userId: "user-1",
      displayName: "Projeto com Erro",
      durationSeconds: 120,
      status: "failed",
      errorMessage: "Erro ao processar áudio",
      _count: { clips: 0 }, clips: [],
    } as any);

    const result = await ProjectDetailsPage({
      params: Promise.resolve({ id: "proj-failed" }), searchParams: Promise.resolve({}),
    });

    render(result);
    expect(
      screen.getByText("Falha ao processar o projeto. Erro ao processar áudio")
    ).toBeDefined();
  });

  it("renders project details and clips list with rounded virality score", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-1"),
    } as any);

    vi.mocked(db.uploadedFile.findUnique).mockResolvedValue({
      id: "proj-2",
      userId: "user-1",
      displayName: "Entrevista Exclusiva",
      durationSeconds: 1200,
      status: "processed",
      _count: { clips: 1 },
      clips: [
        {
          id: "clip-1",
          title: "Momento Incrível",
          viralityScore: 9.24,
        },
        {
          id: "clip-2",
          title: "Momento 2",
          viralityScore: null,
        },
        {
          id: "clip-3",
          title: "Momento 3",
          viralityScore: 8.47,
        },
      ],
    } as any);

    const result = await ProjectDetailsPage({
      params: Promise.resolve({ id: "proj-2" }), searchParams: Promise.resolve({}),
    });

    render(result);
    expect(await screen.findByText("92%")).toBeDefined();
    expect(await screen.findByText("--")).toBeDefined();
    expect(await screen.findByText("85%")).toBeDefined();
  });
});
