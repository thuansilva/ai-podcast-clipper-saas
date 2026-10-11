/**
 * @vitest-environment node
 *
 * Testes unitários para GET /api/youtube/info: a rota precisa exigir sessão
 * autenticada (Clerk, via IAuthGateway) e aplicar rate limit por usuário
 * antes de disparar qualquer fetch outbound para o YouTube.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockAuthGateway = {
  getUserId: vi.fn(),
  getCurrentUser: vi.fn(),
  requireUserId: vi.fn(),
};

vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: () => mockAuthGateway,
}));

// Deliberately NOT mocking ~/infrastructure/factories/rate-limiter-factory
// here: this file exercises the real in-memory limiter to prove the route
// actually enforces the limit (mesmo padrão de
// tests/unit/actions/youtube-import-rate-limit.test.ts).

import { GET } from "~/app/api/youtube/info/route";

const validUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

function makeRequest(url = validUrl) {
  return new Request(
    `http://localhost/api/youtube/info?url=${encodeURIComponent(url)}`,
  );
}

describe("GET /api/youtube/info - autenticação e rate limit", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((input: unknown) => {
      const u = String(input);
      if (u.includes("oembed")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            title: "Vídeo de teste",
            thumbnail_url: "https://img.youtube.com/thumb.jpg",
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          videoDetails: {
            title: "Vídeo de teste",
            lengthSeconds: "120",
            thumbnail: { thumbnails: [{ url: "https://img.youtube.com/thumb.jpg" }] },
          },
        }),
      } as Response);
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("retorna 401 e nunca dispara fetch outbound quando não há sessão", async () => {
    mockAuthGateway.getUserId.mockResolvedValue(null);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toBe("Unauthorized");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("permite até 20 requisições por minuto por usuário e bloqueia a 21a com 429", async () => {
    mockAuthGateway.getUserId.mockResolvedValue("user-info-rate-limited");

    for (let i = 0; i < 20; i++) {
      const res = await GET(makeRequest());
      expect(res.status).toBe(200);
    }

    const res21 = await GET(makeRequest());
    expect(res21.status).toBe(429);
    const data = (await res21.json()) as { error?: string };
    expect(data.error).toBe("Too many requests");
  });

  it("não compartilha o limite entre usuários diferentes", async () => {
    mockAuthGateway.getUserId.mockResolvedValue("user-info-a");
    for (let i = 0; i < 20; i++) {
      await GET(makeRequest());
    }

    mockAuthGateway.getUserId.mockResolvedValue("user-info-b");
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });
});
