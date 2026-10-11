/**
 * Guard contra endpoint S3-compatível de dev (ex.: MinIO do
 * `docker-compose.yml` em `http://localhost:9000`) esquecido em produção.
 *
 * No frontend, `S3_ENDPOINT_URL` vira o host das URLs pré-assinadas que o
 * BROWSER do usuário final usa para upload/playback. Em produção, um endpoint
 * `localhost`/loopback/IP privado/link-local/hostname interno nunca é
 * alcançável pelo usuário, e um endpoint `http:` é bloqueado como mixed
 * content num site servido por HTTPS (HSTS em `next.config.js`). Por isso,
 * em `NODE_ENV=production` falhamos alto aqui, em vez de deixar o upload
 * quebrar silenciosamente no browser.
 *
 * Fora de produção (dev/test) qualquer endpoint é aceito — é justamente o
 * caso de uso do MinIO local.
 */
export class UnsafeStorageEndpointError extends Error {
  constructor(endpoint: string, reason: string) {
    super(
      `S3_ENDPOINT_URL inválido para produção (${endpoint}): ${reason}. ` +
        "Em produção, use um endpoint público com https:// (ou remova " +
        "S3_ENDPOINT_URL para usar o AWS S3 real).",
    );
    this.name = "UnsafeStorageEndpointError";
  }
}

const INTERNAL_HOST_SUFFIXES = [".localhost", ".local", ".internal"];

function isPrivateOrLoopbackIPv4(host: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const [a, b] = [Number(match[1]), Number(match[2])];
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local (inclui metadata 169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) // 192.168.0.0/16
  );
}

function isPrivateOrLoopbackIPv6(host: string): boolean {
  // `URL.hostname` mantém os colchetes em IPv6 literal.
  if (!host.startsWith("[")) return false;
  const addr = host.slice(1, -1).toLowerCase();
  return (
    addr === "::1" ||
    addr === "::" ||
    /^f[cd][0-9a-f]{0,2}:/.test(addr) || // fc00::/7 (unique local)
    /^fe[89ab][0-9a-f]?:/.test(addr) // fe80::/10 (link-local)
  );
}

function internalHostReason(hostname: string): string | null {
  const host = hostname.toLowerCase();
  if (host === "localhost") return "host é localhost";
  if (INTERNAL_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return "host é um nome interno/de rede local";
  }
  if (isPrivateOrLoopbackIPv4(host) || isPrivateOrLoopbackIPv6(host)) {
    return "host é um IP de loopback/privado/link-local";
  }
  if (!host.startsWith("[") && !host.includes(".")) {
    // Ex.: `minio` (nome de serviço do docker-compose) — nunca resolvível
    // pelo browser do usuário.
    return "host é um nome sem domínio (ex.: serviço do docker-compose)";
  }
  return null;
}

export function assertStorageEndpointAllowed(
  endpoint: string,
  nodeEnv: string | undefined,
): void {
  if (nodeEnv !== "production") return;

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new UnsafeStorageEndpointError(endpoint, "não é uma URL válida");
  }

  const hostReason = internalHostReason(url.hostname);
  if (hostReason) {
    throw new UnsafeStorageEndpointError(endpoint, hostReason);
  }

  if (url.protocol !== "https:") {
    throw new UnsafeStorageEndpointError(endpoint, "protocolo precisa ser https");
  }
}
