export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  imageUrl?: string | null;
}

export interface IAuthGateway {
  getUserId(): Promise<string | null>;
  getCurrentUser(): Promise<AuthUser | null>;
  requireUserId(): Promise<string>;
}
