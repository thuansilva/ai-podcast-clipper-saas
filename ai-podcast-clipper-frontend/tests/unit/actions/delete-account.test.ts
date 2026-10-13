import { describe, it, expect, vi, beforeEach } from "vitest";
import { requestAccountDeletion } from "~/actions/delete-account";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";

const mockRequireUserId = vi.fn();
const mockDeleteUser = vi.fn();

vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: () => ({
    requireUserId: mockRequireUserId,
    deleteUser: mockDeleteUser,
  }),
}));

describe("requestAccountDeletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve lançar erro se o usuário não estiver autenticado", async () => {
    mockRequireUserId.mockRejectedValueOnce(
      new UnauthorizedError("Usuário não autenticado.")
    );

    await expect(requestAccountDeletion()).rejects.toThrow(UnauthorizedError);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("deve chamar deleteUser com o id do usuário autenticado", async () => {
    mockRequireUserId.mockResolvedValueOnce("user_to_delete_123");
    mockDeleteUser.mockResolvedValueOnce(undefined);

    await expect(requestAccountDeletion()).resolves.toBeUndefined();

    expect(mockDeleteUser).toHaveBeenCalledWith("user_to_delete_123");
  });

  it("deve propagar o erro se deleteUser falhar", async () => {
    mockRequireUserId.mockResolvedValueOnce("user_to_delete_456");
    mockDeleteUser.mockRejectedValueOnce(new Error("Clerk indisponível"));

    await expect(requestAccountDeletion()).rejects.toThrow(
      "Clerk indisponível"
    );
  });
});
