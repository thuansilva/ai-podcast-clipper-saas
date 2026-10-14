import { describe, it, expect, vi } from "vitest";

// Bug real (2026-10-14): `appendClipsToProject` existia em
// `src/inngest/functions.ts` mas não estava na lista do `serve()` — o Inngest
// recebia o evento `append-clips-events`, não achava função registrada e o
// lote ficava em `queued` para sempre. Este teste garante que TODA função
// exportada de `functions.ts` está registrada na rota.

const captured = vi.hoisted(() => ({ functions: [] as unknown[] }));

vi.mock("inngest/next", () => ({
  serve: (opts: { functions: unknown[] }) => {
    captured.functions = opts.functions;
    return { GET: () => null, POST: () => null, PUT: () => null };
  },
}));

vi.mock("undici", () => ({ Agent: vi.fn(), fetch: vi.fn() }));
vi.mock("~/env", () => ({ env: {} }));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/infrastructure/factories/use-case-factories", () => ({}));

describe("rota /api/inngest", () => {
  it("registra todas as funções Inngest exportadas de src/inngest/functions.ts", async () => {
    const functionsModule = await import("~/inngest/functions");
    await import("~/app/api/inngest/route");

    const exportedFunctions = Object.entries(functionsModule)
      .filter(
        ([, value]) =>
          typeof value === "object" &&
          value !== null &&
          typeof (value as { id?: unknown }).id === "function",
      )
      .map(([name, value]) => ({ name, value }));

    expect(exportedFunctions.length).toBeGreaterThan(0);

    const registered = captured.functions;
    const missing = exportedFunctions
      .filter(({ value }) => !registered.includes(value))
      .map(({ name }) => name);

    expect(missing).toEqual([]);
  });

  it("registra a função de adicionar cortes (append-clips-events)", async () => {
    const { appendClipsToProject } = await import("~/inngest/functions");
    await import("~/app/api/inngest/route");

    expect(captured.functions).toContain(appendClipsToProject);
  });
});
