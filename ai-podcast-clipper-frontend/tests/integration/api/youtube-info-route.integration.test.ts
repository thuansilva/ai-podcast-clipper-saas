/**
 * @vitest-environment node
 *
 * Teste de integração: exercita o handler real da rota
 * (`~/app/api/youtube/info/route`), passando pelo value object real de
 * domínio (`YouTubeUrl`) e pelo rate limiter real
 * (`makeYouTubeInfoRateLimiter`). Apenas a autenticação (Clerk, via
 * `~/infrastructure/factories/auth-factory`) e a chamada de rede externa
 * (YouTube) são mockadas — mesmo padrão usado em
 * tests/integration/actions/youtube-actions.integration.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGetUserId = vi.fn();
vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: () => ({ getUserId: mockGetUserId }),
}));

import { GET } from "~/app/api/youtube/info/route";

const validUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

function makeRequest(url = validUrl) {
  return new Request(
    `http://localhost/api/youtube/info?url=${encodeURIComponent(url)}`,
  );
}

describe("GET /api/youtube/info - Integração (handler real + rate limiter real + VO real)", () => {
  const originalFetch = global.fetch;
  const userId = `user_youtube_info_it_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  beforeEach(() => {
    mockGetUserId.mockReset();
    global.fetch = vi.fn().mockImplementation((input: unknown) => {
      const u = String(input);
      if (u.includes("oembed")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            title: "Vídeo de integração",
            thumbnail_url: "https://img.youtube.com/thumb-it.jpg",
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          videoDetails: {
            title: "Vídeo de integração",
            lengthSeconds: "42",
            thumbnail: { thumbnails: [{ url: "https://img.youtube.com/thumb-it.jpg" }] },
          },
        }),
      } as Response);
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("rejeita com 401 sem sessão autenticada, sem chamar a rede do YouTube", async () => {
    mockGetUserId.mockResolvedValue(null);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejeita payload malicioso/não-URL de ponta a ponta mesmo autenticado, sem chamar a rede do YouTube", async () => {
    mockGetUserId.mockResolvedValue(userId);

    const res = await GET(makeRequest("javascript:alert(document.cookie)"));

    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("busca metadados reais de ponta a ponta quando autenticado e a URL é válida", async () => {
    mockGetUserId.mockResolvedValue(userId);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      title: "Vídeo de integração",
      durationSeconds: 42,
      thumbnailUrl: "https://img.youtube.com/thumb-it.jpg",
    });
  });

  it("aplica rate limit real por usuário: bloqueia com 429 após o limite e não afeta outro usuário", async () => {
    // userId isolado (não reutiliza o `userId` do describe) porque outros
    // testes deste arquivo já consomem a mesma janela de rate limit.
    const rateLimitedUserId = `${userId}-rl`;
    mockGetUserId.mockResolvedValue(rateLimitedUserId);

    for (let i = 0; i < 20; i++) {
      const res = await GET(makeRequest());
      expect(res.status).toBe(200);
    }

    const blocked = await GET(makeRequest());
    expect(blocked.status).toBe(429);

    mockGetUserId.mockResolvedValue(`${rateLimitedUserId}-other`);
    const otherUser = await GET(makeRequest());
    expect(otherUser.status).toBe(200);
  });
});
