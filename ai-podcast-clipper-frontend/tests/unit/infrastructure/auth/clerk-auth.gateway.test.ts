import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClerkAuthGateway } from "~/infrastructure/auth/clerk-auth.gateway";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";
import { auth, currentUser } from "@clerk/nextjs/server";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

describe("ClerkAuthGateway", () => {
  let sut: ClerkAuthGateway;

  beforeEach(() => {
    vi.clearAllMocks();
    sut = new ClerkAuthGateway();
  });

  describe("getUserId", () => {
    it("deve retornar o ID do usuário quando logado", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_clerk_123" } as any);

      const userId = await sut.getUserId();
      expect(userId).toBe("user_clerk_123");
    });

    it("deve retornar null quando não houver usuário logado", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: null } as any);

      const userId = await sut.getUserId();
      expect(userId).toBeNull();
    });
  });

  describe("requireUserId", () => {
    it("deve retornar o ID do usuário se estiver logado", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_clerk_456" } as any);

      const userId = await sut.requireUserId();
      expect(userId).toBe("user_clerk_456");
    });

    it("deve lançar UnauthorizedError se não houver usuário na sessão", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: null } as any);

      await expect(sut.requireUserId()).rejects.toThrow(UnauthorizedError);
    });
  });

  describe("getCurrentUser", () => {
    it("deve retornar os dados formatados do usuário ativo", async () => {
      vi.mocked(currentUser).mockResolvedValue({
        id: "user_clerk_789",
        emailAddresses: [{ emailAddress: "teste@clerk.com" }],
        firstName: "Thuan",
        lastName: "Silva",
        imageUrl: "https://clerk.img/avatar.png",
      } as any);

      const user = await sut.getCurrentUser();

      expect(user).toEqual({
        id: "user_clerk_789",
        email: "teste@clerk.com",
        name: "Thuan Silva",
        imageUrl: "https://clerk.img/avatar.png",
      });
    });

    it("deve retornar null se nenhum usuário estiver logado", async () => {
      vi.mocked(currentUser).mockResolvedValue(null);

      const user = await sut.getCurrentUser();
      expect(user).toBeNull();
    });
  });
});
