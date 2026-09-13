import type { UserEntity } from "../entities/user";

export interface CreateUserData {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  stripeCustomerId?: string | null;
  credits?: number;
  reservedCredits?: number;
}

export interface UpdateUserData {
  email?: string;
  name?: string | null;
  image?: string | null;
  stripeCustomerId?: string | null;
}

export interface CreditsUpdateInput {
  creditsDecrement?: number;
  creditsIncrement?: number;
  reservedCreditsIncrement?: number;
  reservedCreditsDecrement?: number;
}

export interface IUserRepository {
  findById(id: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  findByStripeCustomerId(stripeCustomerId: string): Promise<UserEntity | null>;
  create(data: CreateUserData): Promise<UserEntity>;
  update(userId: string, data: UpdateUserData): Promise<UserEntity>;
  updateCredits(userId: string, data: CreditsUpdateInput): Promise<UserEntity>;
}
