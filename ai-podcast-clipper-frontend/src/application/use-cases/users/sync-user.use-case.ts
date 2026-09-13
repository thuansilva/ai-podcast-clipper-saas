import type { UserEntity } from "~/domain/entities/user";
import type { IUserRepository } from "~/domain/ports/user-repository";
import type { IPaymentGateway } from "~/domain/ports/payment-gateway";
import type { SyncUserInput } from "~/application/dtos/user-dtos";

export class SyncUserUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly paymentGateway: IPaymentGateway
  ) {}

  async execute(input: SyncUserInput): Promise<UserEntity> {
    const existingById = await this.userRepository.findById(input.clerkUserId);

    if (existingById) {
      return await this.userRepository.update(input.clerkUserId, {
        email: input.email,
        name: input.name ?? null,
        image: input.image ?? null,
      });
    }

    let stripeCustomerId: string | null = null;
    const existingByEmail = await this.userRepository.findByEmail(input.email);

    if (existingByEmail?.stripeCustomerId) {
      stripeCustomerId = existingByEmail.stripeCustomerId;
    } else {
      try {
        stripeCustomerId = await this.paymentGateway.createCustomer(
          input.email,
          input.name ?? null,
        );
      } catch (error) {
        console.warn(
          "[SyncUserUseCase] Falha ao criar cliente no gateway de pagamento. Usando fallback.",
          error,
        );
        stripeCustomerId = `cus_fallback_${Date.now()}`;
      }
    }

    return await this.userRepository.create({
      id: input.clerkUserId,
      email: input.email,
      name: input.name ?? null,
      image: input.image ?? null,
      credits: 10,
      reservedCredits: 0,
      stripeCustomerId,
    });
  }
}
