export interface IProcessedEventRepository {
  /**
   * Verifica se o evento já foi processado anteriormente (idempotência),
   * sem marcar nada. Usado como checagem de curto-circuito ANTES de
   * disparar o processamento assíncrono de um evento (ex.: dispatch pro
   * Inngest), para que um retry de um evento já concluído não seja
   * reprocessado.
   */
  isProcessed(eventId: string): Promise<boolean>;

  /**
   * Registra o evento como processado. Deve ser chamado somente DEPOIS que
   * o dispatch do evento para processamento assíncrono (ex.: Inngest) foi
   * confirmado com sucesso — nunca antes. Marcar antes de confirmar o
   * dispatch faz com que uma falha de dispatch vire perda silenciosa e
   * irrecuperável do evento (o Stripe não vai reentregar algo que já
   * acreditamos ter processado).
   *
   * Retorna false se ele já havia sido registrado antes (corrida entre
   * duas entregas concorrentes do mesmo evento que passaram pelo
   * `isProcessed` quase ao mesmo tempo).
   */
  tryMarkProcessed(eventId: string, eventType: string): Promise<boolean>;
}
