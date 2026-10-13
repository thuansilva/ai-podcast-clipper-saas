import { describe, it, expect, vi, beforeEach } from "vitest";
import { requestAccountDeletion } from "~/actions/delete-account";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";

const mockRequireUserId = vi.fn();
const mockDeleteUser = vi.fn();
const mockCancelUserSubscriptionExecute = vi.fn();

vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: () => ({
    requireUserId: mockRequireUserId,
    deleteUser: mockDeleteUser,
  }),
}));

vi.mock("~/infrastructure/factories/use-case-factories", () => ({
  makeCancelUserSubscriptionUseCase: () => ({
    execute: mockCancelUserSubscriptionExecute,
  }),
}));

describe("requestAccountDeletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCancelUserSubscriptionExecute.mockResolvedValue(undefined);
  });

  it("deve lançar erro se o usuário não estiver autenticado", async () => {
    mockRequireUserId.mockRejectedValueOnce(
      new UnauthorizedError("Usuário não autenticado.")
    );

    await expect(requestAccountDeletion()).rejects.toThrow(UnauthorizedError);
    expect(mockCancelUserSubscriptionExecute).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("cancela a assinatura antes de pedir ao Clerk para deletar o usuário", async () => {
    mockRequireUserId.mockResolvedValueOnce("user_to_delete_123");
    const callOrder: string[] = [];
    mockCancelUserSubscriptionExecute.mockImplementationOnce(async () => {
      callOrder.push("cancelSubscription");
    });
    mockDeleteUser.mockImplementationOnce(async () => {
      callOrder.push("deleteUser");
    });

    await expect(requestAccountDeletion()).resolves.toBeUndefined();

    expect(mockCancelUserSubscriptionExecute).toHaveBeenCalledWith({
      userId: "user_to_delete_123",
    });
    expect(mockDeleteUser).toHaveBeenCalledWith("user_to_delete_123");
    expect(callOrder).toEqual(["cancelSubscription", "deleteUser"]);
  });

  it("se o cancelamento da assinatura falhar, propaga o erro e NUNCA chama deleteUser", async () => {
    mockRequireUserId.mockResolvedValueOnce("user_to_delete_789");
    mockCancelUserSubscriptionExecute.mockRejectedValueOnce(
      new Error("Stripe indisponível")
    );

    await expect(requestAccountDeletion()).rejects.toThrow(
      "Stripe indisponível"
    );

    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("deve propagar o erro se deleteUser falhar", async () => {
    mockRequireUserId.mockResolvedValueOnce("user_to_delete_456");
    mockDeleteUser.mockRejectedValueOnce(new Error("Clerk indisponível"));

    await expect(requestAccountDeletion()).rejects.toThrow(
      "Clerk indisponível"
    );
  });
});
