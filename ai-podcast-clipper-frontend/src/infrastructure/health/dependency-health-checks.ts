import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import Stripe from "stripe";

import { env } from "~/env";
import { db } from "~/server/db";

/**
 * Suporte a `GET /api/health` (RNF-AVAIL-01).
 *
 * Distingue **liveness** (o processo está no ar e consegue falar com a
 * única dependência verdadeiramente dura, o Postgres) de **readiness por
 * dependência** (S3, Stripe, Redis) — cada uma reportada individualmente no
 * corpo da resposta, sem derrubar o status HTTP do endpoint.
 *
 * Isso é deliberado: este endpoint é usado pelo CI
 * (`.github/workflows/ci.yml`, step "Wait for Next.js server to become
 * healthy") como probe de "o servidor subiu", num ambiente onde S3/Stripe
 * recebem credenciais fake de propósito. Se o status HTTP dependesse de
 * S3/Stripe responderem de verdade, o probe nunca passaria nesse CI.
 */

export type DependencyCheckStatus = "ok" | "error" | "skipped";

export interface DependencyCheckResult {
  status: DependencyCheckStatus;
  /** Ausente quando `status === "skipped"` (não houve tentativa). */
  latencyMs?: number;
  /** Mensagem de erro curta, só quando `status === "error"`. */
  error?: string;
}

export interface HealthChecksResult {
  postgres: DependencyCheckResult;
  s3: DependencyCheckResult;
  stripe: DependencyCheckResult;
  redis: DependencyCheckResult;
}

/**
 * Timeout curto por dependência: uma dependência travada não deve deixar o
 * healthcheck lento (ele próprio é consultado em loop por probes de
 * infraestrutura).
 */
const DEFAULT_CHECK_TIMEOUT_MS = 2500;

/** Exportado só para teste unitário direto (ver `dependency-health-checks.test.ts`). */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Exportado só para teste unitário direto (ver `dependency-health-checks.test.ts`). */
export async function runCheck(
  probe: () => Promise<void>,
  timeoutMs: number = DEFAULT_CHECK_TIMEOUT_MS
): Promise<DependencyCheckResult> {
  const startedAt = Date.now();
  try {
    await withTimeout(probe(), timeoutMs);
    return { status: "ok", latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Postgres via Prisma — dependência dura de praticamente toda rota. */
export async function probePostgres(): Promise<void> {
  await db.$queryRaw`SELECT 1`;
}

/**
 * S3/MinIO: `HeadBucketCommand` é read-only e não tem efeito colateral
 * (diferente de `deleteFile`/presigned URLs do `IStorageGateway`, que não
 * servem pra validar conectividade: gerar uma URL assinada é um cálculo
 * local, não bate na rede).
 *
 * Constrói um client próprio em vez de reutilizar `createStorageGateway()`
 * (`~/infrastructure/factories/storage-gateway.factory`) porque aquela
 * factory valida regras de negócio de `STORAGE_PROVIDER` (ex.: lança se
 * `STORAGE_PROVIDER=s3` e `S3_ENDPOINT_URL` estiver setado) que não fazem
 * sentido pra um probe de diagnóstico — aqui só queremos saber se o bucket
 * configurado responde.
 */
export async function probeS3(): Promise<void> {
  const client = new S3Client({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
    ...(env.S3_ENDPOINT_URL
      ? { endpoint: env.S3_ENDPOINT_URL, forcePathStyle: true }
      : {}),
  });

  await client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET_NAME }));
}

/**
 * Stripe: `balance.retrieve()` é leitura pura, sem custo nem efeito
 * colateral (não cria/altera nenhum recurso), ao contrário de criar uma
 * sessão de checkout/portal de verdade só para testar conectividade.
 */
export async function probeStripe(): Promise<void> {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-04-30.basil",
  });
  await stripe.balance.retrieve();
}

/**
 * Redis/Upstash é opcional (ver `rate-limiter-factory.ts`: sem as env vars,
 * o rate limiter cai para in-memory) — então só faz sentido checar quando
 * configurado. Quando ausente, o check vira `"skipped"`, não `"error"`.
 */
export function isRedisConfigured(): boolean {
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

export async function probeRedis(): Promise<void> {
  const res = await fetch(`${env.UPSTASH_REDIS_REST_URL}/ping`, {
    headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
  });

  if (!res.ok) {
    throw new Error(`Upstash respondeu HTTP ${res.status}`);
  }
}

/** Roda os 4 checks em paralelo (não serializado — cada um já tem timeout próprio). */
export async function runDependencyHealthChecks(): Promise<HealthChecksResult> {
  const [postgres, s3, stripe, redis] = await Promise.all([
    runCheck(probePostgres),
    runCheck(probeS3),
    runCheck(probeStripe),
    isRedisConfigured()
      ? runCheck(probeRedis)
      : Promise.resolve<DependencyCheckResult>({ status: "skipped" }),
  ]);

  return { postgres, s3, stripe, redis };
}

export interface OverallHealth {
  status: "ok" | "degraded";
  httpStatus: 200 | 503;
}

/**
 * Postgres é a única dependência dura (quase toda rota de banco depende
 * dela) — só ela derruba o status HTTP para 503. S3/Stripe/Redis fora do
 * ar deixam `status: "degraded"` no corpo, mas o endpoint continua
 * respondendo 200 (ver nota de topo do arquivo sobre o probe do CI).
 */
export function resolveOverallHealth(checks: HealthChecksResult): OverallHealth {
  if (checks.postgres.status !== "ok") {
    return { status: "degraded", httpStatus: 503 };
  }

  const allHealthy = Object.values(checks).every(
    (check) => check.status === "ok" || check.status === "skipped"
  );

  return { status: allHealthy ? "ok" : "degraded", httpStatus: 200 };
}
