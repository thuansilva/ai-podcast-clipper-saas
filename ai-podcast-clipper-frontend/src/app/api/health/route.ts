import { NextResponse } from "next/server";

import {
  resolveOverallHealth,
  runDependencyHealthChecks,
} from "~/infrastructure/health/dependency-health-checks";

/**
 * Liveness + readiness por dependência (RNF-AVAIL-01). Ver
 * `~/infrastructure/health/dependency-health-checks` para a lógica dos
 * checks e a decisão de por que só o Postgres derruba o status HTTP.
 */
export async function GET() {
  const checks = await runDependencyHealthChecks();
  const { status, httpStatus } = resolveOverallHealth(checks);

  return NextResponse.json({ status, checks }, { status: httpStatus });
}
