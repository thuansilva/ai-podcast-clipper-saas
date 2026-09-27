export interface IProcessedEventRepository {
  /**
   * Registra o evento como processado. Retorna false se ele já havia sido
   * registrado antes (entrega duplicada do webhook).
   */
  tryMarkProcessed(eventId: string, eventType: string): Promise<boolean>;
}
