export interface UserEntity {
  id: string;
  name?: string | null;
  email: string;
  credits: number;
  reservedCredits: number;
  stripeCustomerId?: string | null;
  image?: string | null;
  plan?: string;
}
