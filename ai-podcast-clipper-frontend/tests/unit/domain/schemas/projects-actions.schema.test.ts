import { describe, it, expect } from "vitest";
import {
  renameProjectSchema,
  deleteProjectSchema,
  listProjectsSchema,
  retryProjectSchema,
  PROJECT_SUBTITLE_PRESETS,
} from "~/domain/schemas/projects-actions.schema";

describe("renameProjectSchema", () => {
  it("aceita projectId e newName válidos", () => {
    const result = renameProjectSchema.safeParse({
      projectId: "proj-1",
      newName: "Meu projeto",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita newName vazio (apenas espaços)", () => {
    const result = renameProjectSchema.safeParse({
      projectId: "proj-1",
      newName: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita newName acima de 200 caracteres", () => {
    const result = renameProjectSchema.safeParse({
      projectId: "proj-1",
      newName: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita projectId vazio", () => {
    const result = renameProjectSchema.safeParse({
      projectId: "",
      newName: "Novo nome",
    });
    expect(result.success).toBe(false);
  });
});

describe("deleteProjectSchema", () => {
  it("aceita um projectId não vazio", () => {
    expect(deleteProjectSchema.safeParse({ projectId: "proj-1" }).success).toBe(true);
  });

  it("rejeita projectId vazio", () => {
    expect(deleteProjectSchema.safeParse({ projectId: "" }).success).toBe(false);
  });
});

describe("listProjectsSchema", () => {
  it("aceita apenas page (search e sort são opcionais)", () => {
    expect(listProjectsSchema.safeParse({ page: 1 }).success).toBe(true);
  });

  it("aceita sort asc e desc", () => {
    expect(listProjectsSchema.safeParse({ page: 1, sort: "asc" }).success).toBe(true);
    expect(listProjectsSchema.safeParse({ page: 1, sort: "desc" }).success).toBe(true);
  });

  it("rejeita sort fora do enum conhecido", () => {
    const result = listProjectsSchema.safeParse({ page: 1, sort: "DROP TABLE users" });
    expect(result.success).toBe(false);
  });

  it("rejeita page zero, negativo ou não inteiro", () => {
    expect(listProjectsSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(listProjectsSchema.safeParse({ page: -1 }).success).toBe(false);
    expect(listProjectsSchema.safeParse({ page: 1.5 }).success).toBe(false);
  });

  it("rejeita search acima de 200 caracteres", () => {
    const result = listProjectsSchema.safeParse({ page: 1, search: "a".repeat(201) });
    expect(result.success).toBe(false);
  });
});

describe("retryProjectSchema", () => {
  it("aceita projectId sem updates", () => {
    expect(retryProjectSchema.safeParse({ projectId: "proj-1" }).success).toBe(true);
  });

  it("aceita todos os presets reais de subtitlePreset usados na UI de configuração de projeto", () => {
    for (const preset of PROJECT_SUBTITLE_PRESETS) {
      const result = retryProjectSchema.safeParse({
        projectId: "proj-1",
        updates: { subtitlePreset: preset },
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejeita subtitlePreset fora da lista conhecida", () => {
    const result = retryProjectSchema.safeParse({
      projectId: "proj-1",
      updates: { subtitlePreset: "INEXISTENTE" },
    });
    expect(result.success).toBe(false);
  });

  it("aceita updates completos e válidos", () => {
    const result = retryProjectSchema.safeParse({
      projectId: "proj-1",
      updates: {
        subtitlePreset: "HORMOZI",
        clipModel: "auto",
        aspectRatio: "9:16",
        autoZoom: true,
        sliceStartTime: 0,
        sliceEndTime: 300,
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sliceStartTime e sliceEndTime negativos", () => {
    expect(
      retryProjectSchema.safeParse({
        projectId: "proj-1",
        updates: { sliceStartTime: -1 },
      }).success
    ).toBe(false);

    expect(
      retryProjectSchema.safeParse({
        projectId: "proj-1",
        updates: { sliceEndTime: -10 },
      }).success
    ).toBe(false);
  });

  it("rejeita autoZoom que não seja booleano", () => {
    const result = retryProjectSchema.safeParse({
      projectId: "proj-1",
      updates: { autoZoom: "true" },
    });
    expect(result.success).toBe(false);
  });

  it("rejeita clipModel e aspectRatio vazios ou absurdamente grandes (forma na borda)", () => {
    expect(
      retryProjectSchema.safeParse({
        projectId: "proj-1",
        updates: { clipModel: "" },
      }).success
    ).toBe(false);

    expect(
      retryProjectSchema.safeParse({
        projectId: "proj-1",
        updates: { aspectRatio: "a".repeat(21) },
      }).success
    ).toBe(false);
  });

  it("rejeita projectId vazio", () => {
    expect(retryProjectSchema.safeParse({ projectId: "" }).success).toBe(false);
  });
});
