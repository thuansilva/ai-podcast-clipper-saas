import { describe, it, expect, vi, beforeEach } from "vitest";
import { SyncUserUseCase } from "~/application/use-cases/users/sync-user.use-case";
import type { IUserRepository } from "~/domain/ports/user-repository";
import type { IPaymentGateway } from "~/domain/ports/payment-gateway";
import type { UserEntity } from "~/domain/entities/user";

describe("SyncUserUseCase", () => {
  let mockUserRepository: IUserRepository;
  let mockPaymentGateway: IPaymentGateway;
  let sut: SyncUserUseCase;

  beforeEach(() => {
    mockUserRepository = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findByStripeCustomerId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateCredits: vi.fn(),
    };

    mockPaymentGateway = {
      createCheckoutSession: vi.fn(),
      createCustomer: vi.fn(),
    };

    sut = new SyncUserUseCase(mockUserRepository, mockPaymentGateway);
  });

  it("deve criar um novo usuário com 10 créditos e gerar cliente no Stripe quando não existir", async () => {
    vi.mocked(mockUserRepository.findById).mockResolvedValue(null);
    vi.mocked(mockUserRepository.findByEmail).mockResolvedValue(null);
    vi.mocked(mockPaymentGateway.createCustomer).mockResolvedValue("cus_new_123");

    const expectedUser: UserEntity = {
      id: "user_clerk_123",
      email: "novo@exemplo.com",
      name: "Novo Usuário",
      image: "https://avatar.png",
      credits: 10,
      reservedCredits: 0,
      stripeCustomerId: "cus_new_123",
    };

    vi.mocked(mockUserRepository.create).mockResolvedValue(expectedUser);

    const result = await sut.execute({
      clerkUserId: "user_clerk_123",
      email: "novo@exemplo.com",
      name: "Novo Usuário",
      image: "https://avatar.png",
    });

    expect(mockPaymentGateway.createCustomer).toHaveBeenCalledWith(
      "novo@exemplo.com",
      "Novo Usuário"
    );
    expect(mockUserRepository.create).toHaveBeenCalledWith({
      id: "user_clerk_123",
      email: "novo@exemplo.com",
      name: "Novo Usuário",
      image: "https://avatar.png",
      credits: 10,
      reservedCredits: 0,
      stripeCustomerId: "cus_new_123",
    });
    expect(result).toEqual(expectedUser);
  });

  it("deve atualizar dados cadastrais de forma idempotente se o usuário já existir", async () => {
    const existingUser: UserEntity = {
      id: "user_clerk_123",
      email: "antigo@exemplo.com",
      name: "Antigo",
      image: null,
      credits: 25,
      reservedCredits: 0,
      stripeCustomerId: "cus_existing_456",
    };

    vi.mocked(mockUserRepository.findById).mockResolvedValue(existingUser);

    const updatedUser: UserEntity = {
      ...existingUser,
      email: "atualizado@exemplo.com",
      name: "Nome Atualizado",
    };
    vi.mocked(mockUserRepository.update).mockResolvedValue(updatedUser);

    const result = await sut.execute({
      clerkUserId: "user_clerk_123",
      email: "atualizado@exemplo.com",
      name: "Nome Atualizado",
    });

    expect(mockPaymentGateway.createCustomer).not.toHaveBeenCalled();
    expect(mockUserRepository.update).toHaveBeenCalledWith("user_clerk_123", {
      email: "atualizado@exemplo.com",
      name: "Nome Atualizado",
      image: null,
      stripeCustomerId: undefined,
    });
    expect(result).toEqual(updatedUser);
  });

  it("deve reaproveitar o stripeCustomerId caso o e-mail já possua cadastro no banco", async () => {
    vi.mocked(mockUserRepository.findById).mockResolvedValue(null);

    const existingByEmail: UserEntity = {
      id: "cuid_old",
      email: "mesmo@exemplo.com",
      name: "Existente",
      credits: 10,
      reservedCredits: 0,
      stripeCustomerId: "cus_reused_789",
    };
    vi.mocked(mockUserRepository.findByEmail).mockResolvedValue(existingByEmail);

    const createdUser: UserEntity = {
      id: "user_clerk_new",
      email: "mesmo@exemplo.com",
      name: "Existente",
      credits: 10,
      reservedCredits: 0,
      stripeCustomerId: "cus_reused_789",
    };
    vi.mocked(mockUserRepository.create).mockResolvedValue(createdUser);

    const result = await sut.execute({
      clerkUserId: "user_clerk_new",
      email: "mesmo@exemplo.com",
    });

    expect(mockPaymentGateway.createCustomer).not.toHaveBeenCalled();
    expect(mockUserRepository.create).toHaveBeenCalledWith({
      id: "user_clerk_new",
      email: "mesmo@exemplo.com",
      name: null,
      image: null,
      credits: 10,
      reservedCredits: 0,
      stripeCustomerId: "cus_reused_789",
    });
    expect(result.stripeCustomerId).toBe("cus_reused_789");
  });
});
