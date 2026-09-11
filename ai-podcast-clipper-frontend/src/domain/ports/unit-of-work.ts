export interface IUnitOfWork {
  execute<T>(operation: () => Promise<T>): Promise<T>;
}
