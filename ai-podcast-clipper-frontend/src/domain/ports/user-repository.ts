import type { UserEntity } from "../entities/user";

export interface IUserRepository {
  findById(id: string): Promise<UserEntity | null>;
  findByStripeCustomerId(stripeCustomerId: string): Promise<UserEntity | null>;
  updateCredits(
    userId: string,
    data: {
      creditsDecrement?: number;
      creditsIncrement?: number;
      reservedCreditsIncrement?: number;
      reservedCreditsDecrement?: number;
    }
  ): Promise<UserEntity>;
}
