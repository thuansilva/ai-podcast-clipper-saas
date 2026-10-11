import { describe, it, expect, beforeAll } from "vitest";
import {
  buildContentSecurityPolicy,
  resolveExtraOriginFromS3Endpoint,
} from "../../content-security-policy.config.js";

let config: typeof import("../../next.config.js").default;

beforeAll(async () => {
  config = (await import("../../next.config.js")).default;
});

describe("next.config.js headers", () => {
  it("aplica cabeçalhos de segurança em todas as rotas", async () => {
    const rules = await config.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.source).toBe("/:path*");

    const headerNames = rules[0]!.headers.map((h) => h.key);
    expect(headerNames).toEqual(
      expect.arrayContaining([
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Permissions-Policy",
        "Strict-Transport-Security",
      ])
    );
  });

  it("X-Content-Type-Options é nosniff", async () => {
    const rules = await config.headers!();
    const header = rules[0]!.headers.find((h) => h.key === "X-Content-Type-Options");
    expect(header?.value).toBe("nosniff");
  });

  it("X-Frame-Options impede embed cross-origin", async () => {
    const rules = await config.headers!();
    const header = rules[0]!.headers.find((h) => h.key === "X-Frame-Options");
    expect(header?.value).toBe("SAMEORIGIN");
  });

  it("aplica Content-Security-Policy-Report-Only, nunca Content-Security-Policy em modo enforce", async () => {
    const rules = await config.headers!();
    const headerNames = rules[0]!.headers.map((h) => h.key);

    // O guard mais importante desta suíte: garante que ninguém ative o
    // enforce por engano. Ver content-security-policy.config.js e o
    // comentário em next.config.js sobre por que isto é Report-Only.
    expect(headerNames).toContain("Content-Security-Policy-Report-Only");
    expect(headerNames).not.toContain("Content-Security-Policy");
  });

  it("o valor de Content-Security-Policy-Report-Only vem de buildContentSecurityPolicy()", async () => {
    const rules = await config.headers!();
    const header = rules[0]!.headers.find(
      (h) => h.key === "Content-Security-Policy-Report-Only",
    );

    // tests/setup.ts fixa S3_ENDPOINT_URL=http://localhost:9000 (MinIO) para
    // toda a suíte — next.config.js lê essa mesma env var para liberar o
    // endpoint em media-src/img-src, então replicamos aqui para comparar
    // com o valor exato (em vez de reimplementar a extração do env dentro
    // do teste de forma divergente).
    const expected = buildContentSecurityPolicy({
      extraMediaSrc: resolveExtraOriginFromS3Endpoint(
        process.env.S3_ENDPOINT_URL,
      ),
      extraImgSrc: resolveExtraOriginFromS3Endpoint(
        process.env.S3_ENDPOINT_URL,
      ),
    });
    expect(header?.value).toBe(expected);
  });
});

describe("buildContentSecurityPolicy", () => {
  it("contém as diretivas mínimas de defesa", () => {
    const csp = buildContentSecurityPolicy();

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("libera o Frontend API do Clerk (script, connect e frame)", () => {
    const csp = buildContentSecurityPolicy();
    const directives = Object.fromEntries(
      csp.split("; ").map((d) => {
        const [name, ...values] = d.split(" ");
        return [name, values.join(" ")];
      }),
    );

    expect(directives["script-src"]).toContain("https://*.clerk.accounts.dev");
    expect(directives["connect-src"]).toContain("https://*.clerk.accounts.dev");
    expect(directives["frame-src"]).toContain("https://*.clerk.accounts.dev");
  });

  it("libera avatares do Clerk (img.clerk.com) em img-src", () => {
    const csp = buildContentSecurityPolicy();
    expect(csp).toContain("img.clerk.com");
  });

  it("libera miniaturas do YouTube e imagens da landing (Unsplash) em img-src", () => {
    const csp = buildContentSecurityPolicy();
    expect(csp).toContain("i.ytimg.com");
    expect(csp).toContain("images.unsplash.com");
  });

  it("libera o S3/AWS real em media-src para o player de vídeo (URLs pré-assinadas)", () => {
    const csp = buildContentSecurityPolicy();
    const directives = Object.fromEntries(
      csp.split("; ").map((d) => {
        const [name, ...values] = d.split(" ");
        return [name, values.join(" ")];
      }),
    );
    expect(directives["media-src"]).toContain("https://*.amazonaws.com");
  });

  it("não inclui nenhum domínio Stripe (checkout é redirect de página inteira, não iframe/script embutido)", () => {
    const csp = buildContentSecurityPolicy();
    expect(csp).not.toContain("stripe.com");
  });

  it("aceita origens extras de media-src/img-src (ex.: MinIO em dev via S3_ENDPOINT_URL)", () => {
    const csp = buildContentSecurityPolicy({
      extraMediaSrc: ["http://localhost:9000"],
      extraImgSrc: ["http://localhost:9000"],
    });

    expect(csp).toContain("http://localhost:9000");
  });
});

describe("resolveExtraOriginFromS3Endpoint", () => {
  it("retorna a origem (protocolo + host) de uma URL de endpoint S3-compatível", () => {
    expect(resolveExtraOriginFromS3Endpoint("http://localhost:9000")).toEqual([
      "http://localhost:9000",
    ]);
    expect(
      resolveExtraOriginFromS3Endpoint("https://minio.internal:9000/extra/path"),
    ).toEqual(["https://minio.internal:9000"]);
  });

  it("retorna array vazio quando não há endpoint configurado (AWS S3 real)", () => {
    expect(resolveExtraOriginFromS3Endpoint(undefined)).toEqual([]);
  });

  it("retorna array vazio para URL inválida, em vez de lançar", () => {
    expect(resolveExtraOriginFromS3Endpoint("not-a-url")).toEqual([]);
  });
});
