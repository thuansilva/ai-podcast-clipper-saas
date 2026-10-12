/**
 * Equivalente, no frontend, de `ai-podcast-clipper-backend/tests/minio_support.py::probe_minio()`.
 *
 * Sonda se um endpoint MinIO está alcançável, para permitir que uma suíte de
 * teste faça skip gracioso (em vez de falhar) quando a infra não está no ar
 * — o mesmo padrão já usado pelos testes do backend marcados `-m minio`.
 *
 * Mantém a mesma política do backend: só falha de CONEXÃO (timeout, conexão
 * recusada, DNS) resulta em "não alcançável" (`false`). Isto aqui NÃO tenta
 * autenticar nem valida credenciais — é só uma checagem de reachability de
 * rede, feita com uma requisição HTTP simples e timeout curto. Erros de
 * autenticação/permissão são responsabilidade do teste que efetivamente usa
 * o MinIO (ex.: `ensureBucket()` em `s3-storage.minio.integration.test.ts`),
 * que deve continuar falhando alto se a infra está no ar mas mal configurada.
 */

const DEFAULT_TIMEOUT_MS = 1500;

export async function probeMinio(
  endpoint: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<boolean> {
  try {
    // Qualquer resposta HTTP (mesmo 403/404) já prova que a conexão TCP foi
    // estabelecida e o servidor respondeu — é o suficiente para "alcançável".
    await fetch(endpoint, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return true;
  } catch {
    // fetch falha (ECONNREFUSED, timeout do AbortSignal, DNS, etc.) quando o
    // endpoint não está alcançável.
    return false;
  }
}
