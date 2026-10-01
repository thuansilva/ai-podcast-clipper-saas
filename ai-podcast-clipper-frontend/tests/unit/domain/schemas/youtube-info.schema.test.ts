import { describe, it, expect } from "vitest";
import { fetchYouTubeVideoInfoSchema } from "~/domain/schemas/youtube-info.schema";

describe("fetchYouTubeVideoInfoSchema", () => {
  it("aceita uma URL absoluta válida", () => {
    const result = fetchYouTubeVideoInfoSchema.safeParse({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita string vazia", () => {
    expect(fetchYouTubeVideoInfoSchema.safeParse({ url: "" }).success).toBe(false);
  });

  it("rejeita string que não é uma URL (ex: texto arbitrário)", () => {
    expect(fetchYouTubeVideoInfoSchema.safeParse({ url: "não é uma url" }).success).toBe(false);
  });

  it("rejeita payload sem o campo url", () => {
    expect(fetchYouTubeVideoInfoSchema.safeParse({}).success).toBe(false);
  });
});
