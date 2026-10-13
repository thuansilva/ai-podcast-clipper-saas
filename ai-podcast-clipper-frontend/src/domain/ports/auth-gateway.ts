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
  /**
   * Solicita ao provedor de identidade a exclusão do usuário. Isso dispara
   * o webhook `user.deleted` do provedor (ex.: Clerk), que é a fonte única
   * de verdade para a limpeza de dados da conta (ver
   * `DeleteUserAccountUseCase`). Esta chamada em si não apaga nenhum dado
   * da aplicação.
   */
  deleteUser(userId: string): Promise<void>;
}
