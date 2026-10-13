import { describe, it, expect, vi, beforeEach } from "vitest";
import { SyncUserUseCase } from "~/application/use-cases/users/sync-user.use-case";
import type { IUserRepository } from "~/domain/ports/user-repository";
import type { IPaymentGateway } from "~/domain/ports/payment-gateway";
import type { UserEntity } from "~/domain/entities/user";
import { UserAlreadyExistsError } from "~/domain/errors/user-already-exists-error";
import { logger } from "~/lib/observability/logger";

vi.mock("~/lib/observability/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

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
      createBillingPortalSession: vi.fn(),
      createCustomer: vi.fn(),
      cancelSubscription: vi.fn(),
    };

    sut = new SyncUserUseCase(mockUserRepository, mockPaymentGateway);
    vi.clearAllMocks();
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

  describe("idempotência deliberada (Bug 1: corrida de condição no webhook do Clerk)", () => {
    it("deve tratar violação de unicidade no create() como 'usuário já existe' e seguir o caminho de update, sem propagar a exceção", async () => {
      // Duas entregas concorrentes do mesmo webhook `user.created`: ambas
      // passam pelo findById inicial encontrando null antes de qualquer uma
      // terminar o create. Esta chamada "perde" a corrida.
      vi.mocked(mockUserRepository.findById)
        .mockResolvedValueOnce(null) // 1ª checagem: ainda não existe
        .mockResolvedValueOnce({
          id: "user_clerk_race",
          email: "corrida@exemplo.com",
          name: null,
          image: null,
          credits: 10,
          reservedCredits: 0,
          stripeCustomerId: "cus_won_race_123",
        }); // 2ª checagem, após o conflito: a outra chamada já criou

      vi.mocked(mockUserRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(mockPaymentGateway.createCustomer).mockResolvedValue(
        "cus_would_be_duplicate"
      );
      vi.mocked(mockUserRepository.create).mockRejectedValue(
        new UserAlreadyExistsError("user_clerk_race")
      );

      const updatedUser: UserEntity = {
        id: "user_clerk_race",
        email: "corrida@exemplo.com",
        name: "Nome Vencedor",
        image: null,
        credits: 10,
        reservedCredits: 0,
        stripeCustomerId: "cus_won_race_123",
      };
      vi.mocked(mockUserRepository.update).mockResolvedValue(updatedUser);

      const result = await sut.execute({
        clerkUserId: "user_clerk_race",
        email: "corrida@exemplo.com",
        name: "Nome Vencedor",
      });

      expect(mockUserRepository.findById).toHaveBeenCalledTimes(2);
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        "user_clerk_race",
        {
          email: "corrida@exemplo.com",
          name: "Nome Vencedor",
          image: null,
        }
      );
      expect(result).toEqual(updatedUser);
    });

    it("deve propagar outros erros de create() que não sejam violação de unicidade", async () => {
      vi.mocked(mockUserRepository.findById).mockResolvedValue(null);
      vi.mocked(mockUserRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(mockPaymentGateway.createCustomer).mockResolvedValue(
        "cus_123"
      );
      vi.mocked(mockUserRepository.create).mockRejectedValue(
        new Error("Falha de conexão com o banco")
      );

      await expect(
        sut.execute({
          clerkUserId: "user_clerk_other_error",
          email: "erro@exemplo.com",
        })
      ).rejects.toThrow("Falha de conexão com o banco");
    });
  });

  describe("fallback de customer Stripe (Bug 2: sem mascarar falha do gateway de pagamento)", () => {
    it("deve criar o usuário com um stripeCustomerId sentinela reconhecível e logar em nível ERROR quando o gateway de pagamento falhar", async () => {
      vi.mocked(mockUserRepository.findById).mockResolvedValue(null);
      vi.mocked(mockUserRepository.findByEmail).mockResolvedValue(null);

      const gatewayError = new Error("Stripe indisponível (503)");
      vi.mocked(mockPaymentGateway.createCustomer).mockRejectedValue(
        gatewayError
      );

      vi.mocked(mockUserRepository.create).mockImplementation(async (data) => ({
        id: data.id,
        email: data.email,
        name: data.name ?? null,
        image: data.image ?? null,
        credits: 10,
        reservedCredits: 0,
        stripeCustomerId: data.stripeCustomerId ?? null,
      }));

      const result = await sut.execute({
        clerkUserId: "user_clerk_fallback",
        email: "fallback@exemplo.com",
      });

      // Sentinela reconhecível: prefixo fixo + identificador do usuário
      // embutido, para permitir reconciliação manual via query no banco
      // (`stripeCustomerId LIKE 'cus_fallback_%'`) sem depender só de logs.
      expect(result.stripeCustomerId).toMatch(
        /^cus_fallback_user_clerk_fallback_\d+$/,
      );

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Falha ao criar cliente no gateway de pagamento"),
        expect.objectContaining({
          clerkUserId: "user_clerk_fallback",
          email: "fallback@exemplo.com",
          fallbackStripeCustomerId: result.stripeCustomerId,
          error: gatewayError,
        })
      );
    });
  });
});
