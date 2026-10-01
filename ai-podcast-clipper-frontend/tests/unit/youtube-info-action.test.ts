import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchYouTubeVideoInfo } from "~/actions/youtube-info";

describe("fetchYouTubeVideoInfo Server Action", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("rejeita payload que não é uma URL válida (ex: texto arbitrário) sem chamar a rede", async () => {
    await expect(fetchYouTubeVideoInfo("não é uma url")).rejects.toThrow(
      "Invalid YouTube URL"
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejeita string vazia sem chamar a rede", async () => {
    await expect(fetchYouTubeVideoInfo("")).rejects.toThrow("Invalid YouTube URL");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejeita uma URL válida de outro domínio (não é YouTube) sem chamar a rede", async () => {
    await expect(fetchYouTubeVideoInfo("https://vimeo.com/123456")).rejects.toThrow(
      "Invalid YouTube URL"
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("busca metadados quando a URL do YouTube é válida", async () => {
    vi.mocked(global.fetch).mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes("oembed")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            title: "Vídeo de teste",
            thumbnail_url: "https://img.youtube.com/thumb.jpg",
          }),
        } as any);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ videoDetails: { lengthSeconds: "120" } }),
      } as any);
    });

    const result = await fetchYouTubeVideoInfo(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );

    expect(result).toEqual({
      title: "Vídeo de teste",
      durationSeconds: 120,
      thumbnailUrl: "https://img.youtube.com/thumb.jpg",
    });
  });
});
