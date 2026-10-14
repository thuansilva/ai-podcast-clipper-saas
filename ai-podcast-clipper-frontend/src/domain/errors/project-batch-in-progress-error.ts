import { DomainError } from "./domain-error";

/**
 * Impede dois processamentos de "adicionar mais cortes" simultâneos no
 * mesmo projeto: um lote ainda em "queued"/"processing" bloqueia a criação
 * de um novo até terminar (sucesso ou falha). Evita downloads/holds de
 * crédito concorrentes e condições de corrida sobre o mesmo projeto.
 */
export class ProjectBatchInProgressError extends DomainError {
  constructor() {
    super(
      "Este projeto já tem um processamento em andamento. Aguarde terminar antes de adicionar mais cortes."
    );
  }
}
