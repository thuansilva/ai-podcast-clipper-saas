import { describe, it, expect, beforeEach } from "vitest";
import { AddCreditsFromStripeWebhookUseCase } from "~/application/use-cases/credits/add-credits-from-stripe.use-case";
import { InMemoryUserRepository } from "../../../mocks/in-memory-user-repository";
import { NotFoundError } from "~/domain/errors/not-found-error";

/**
 * Pacotes avulsos de créditos (small/medium/large) foram descontinuados
 * como produto — apenas assinaturas Starter/Pro continuam sendo vendidas
 * (ver `PlanCatalogService`). Este use case é mantido apenas pela
 * infraestrutura legada de fila/Inngest que ainda despacha o evento
 * "stripe/checkout.completed"; ele nunca mais adiciona créditos.
 */
describe("AddCreditsFromStripeWebhookUseCase", () => {
  let userRepo: InMemoryUserRepository;
  let useCase: AddCreditsFromStripeWebhookUseCase;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    useCase = new AddCreditsFromStripeWebhookUseCase(userRepo);
  });

  it("não deve adicionar créditos para nenhum priceId, pois pacotes avulsos foram descontinuados", async () => {
    await userRepo.create({
      id: "user-1",
      email: "test@example.com",
      stripeCustomerId: "cus_123",
      credits: 10,
      reservedCredits: 0,
    });

    const result = await useCase.execute({
      stripeCustomerId: "cus_123",
      priceId: "price_any_legacy_pack",
    });

    expect(result.success).toBe(false);
    expect(result.addedCredits).toBe(0);

    const user = await userRepo.findById("user-1");
    expect(user?.credits).toBe(10);
  });

  it("deve lançar NotFoundError se stripeCustomerId não for encontrado", async () => {
    await expect(
      useCase.execute({
        stripeCustomerId: "cus_unknown",
        priceId: "price_any_legacy_pack",
      })
    ).rejects.toThrow(NotFoundError);
  });
});
