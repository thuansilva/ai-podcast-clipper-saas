/**
 * @vitest-environment node
 *
 * Teste de integração leve para `fetchYouTubeVideoInfo`: exercita a Server
 * Action real com o schema real de borda (`fetchYouTubeVideoInfoSchema`) e o
 * value object real de domínio (`YouTubeUrl`). Apenas a chamada de rede
 * externa (oEmbed do YouTube) é mockada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchYouTubeVideoInfo } from "~/actions/youtube-info";

describe("fetchYouTubeVideoInfo - Integração (schema real + value object real)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("rejeita payload malicioso/não-URL de ponta a ponta sem chamar a rede do YouTube", async () => {
    await expect(
      fetchYouTubeVideoInfo("javascript:alert(document.cookie)")
    ).rejects.toThrow("Invalid YouTube URL");

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejeita uma URL válida porém de outro domínio sem chamar a rede do YouTube", async () => {
    await expect(fetchYouTubeVideoInfo("https://attacker.example/x")).rejects.toThrow(
      "Invalid YouTube URL"
    );

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("busca metadados reais de ponta a ponta quando a URL do YouTube é válida", async () => {
    vi.mocked(global.fetch).mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes("oembed")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            title: "Vídeo de integração",
            thumbnail_url: "https://img.youtube.com/thumb-it.jpg",
          }),
        } as any);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ videoDetails: { lengthSeconds: "42" } }),
      } as any);
    });

    const result = await fetchYouTubeVideoInfo(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );

    expect(result).toEqual({
      title: "Vídeo de integração",
      durationSeconds: 42,
      thumbnailUrl: "https://img.youtube.com/thumb-it.jpg",
    });
  });
});
