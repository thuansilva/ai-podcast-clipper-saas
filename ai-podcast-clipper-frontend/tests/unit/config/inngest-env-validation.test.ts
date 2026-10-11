/**
 * @vitest-environment node
 *
 * Ambiente "node" de propósito: o `@t3-oss/env-nextjs` decide se está no
 * servidor via `typeof window === "undefined"`; no jsdom ele trataria o
 * import como client e pularia a validação das variáveis `server`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { assertInngestProductionEnv } from "~/inngest-env-guard.js";

/**
 * RNF-SEC-04: `INNGEST_SIGNING_KEY` (verificação de assinatura das
 * requisições que chegam em `/api/inngest`) e `INNGEST_EVENT_KEY` (envio de
 * eventos pro Inngest Cloud) são validadas centralmente. Opcionais em
 * dev/test, obrigatórias em `NODE_ENV=production` — e `INNGEST_DEV` (que
 * desliga a verificação de assinatura no SDK) é proibida em produção.
 */
describe("assertInngestProductionEnv (função pura)", () => {
  const validProd = {
    NODE_ENV: "production",
    INNGEST_EVENT_KEY: "evt_key_mock",
    INNGEST_SIGNING_KEY: "signkey-prod-0123abcd",
    INNGEST_DEV: undefined,
  };

  it("produção com as duas keys e sem INNGEST_DEV → OK", () => {
    expect(() => assertInngestProductionEnv(validProd)).not.toThrow();
  });

  it.each([
    ["INNGEST_EVENT_KEY", undefined],
    ["INNGEST_EVENT_KEY", ""],
    ["INNGEST_EVENT_KEY", "   "],
    ["INNGEST_SIGNING_KEY", undefined],
    ["INNGEST_SIGNING_KEY", ""],
  ])("produção com %s=%j → lança erro citando a variável", (name, value) => {
    expect(() =>
      assertInngestProductionEnv({ ...validProd, [name]: value })
    ).toThrow(new RegExp(name));
  });

  it("produção sem nenhuma das duas → erro lista ambas", () => {
    let message = "";
    try {
      assertInngestProductionEnv({
        NODE_ENV: "production",
        INNGEST_EVENT_KEY: undefined,
        INNGEST_SIGNING_KEY: undefined,
      });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/INNGEST_EVENT_KEY/);
    expect(message).toMatch(/INNGEST_SIGNING_KEY/);
  });

  it.each(["1", "true", "http://localhost:8288"])(
    "produção com INNGEST_DEV=%j (desliga verificação de assinatura) → lança erro",
    (devValue) => {
      expect(() =>
        assertInngestProductionEnv({ ...validProd, INNGEST_DEV: devValue })
      ).toThrow(/INNGEST_DEV/);
    }
  );

  it.each(["0", "false", ""])(
    "produção com INNGEST_DEV=%j (força cloud mode) → OK",
    (devValue) => {
      expect(() =>
        assertInngestProductionEnv({ ...validProd, INNGEST_DEV: devValue })
      ).not.toThrow();
    }
  );

  it.each(["development", "test", undefined])(
    "NODE_ENV=%j sem as keys → OK (dev local sem Inngest Cloud)",
    (nodeEnv) => {
      expect(() =>
        assertInngestProductionEnv({
          NODE_ENV: nodeEnv,
          INNGEST_EVENT_KEY: undefined,
          INNGEST_SIGNING_KEY: undefined,
          INNGEST_DEV: "1",
        })
      ).not.toThrow();
    }
  );
});

describe("src/env.js - validação central das env vars do Inngest", () => {
  beforeEach(() => {
    vi.resetModules();
    // tests/setup.ts liga SKIP_ENV_VALIDATION globalmente; aqui queremos a
    // validação real do schema.
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("INNGEST_DEV", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("NODE_ENV=production sem INNGEST_EVENT_KEY/INNGEST_SIGNING_KEY → import falha alto", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INNGEST_EVENT_KEY", undefined);
    vi.stubEnv("INNGEST_SIGNING_KEY", undefined);

    await expect(import("~/env")).rejects.toThrow(
      /INNGEST_EVENT_KEY[\s\S]*INNGEST_SIGNING_KEY|INNGEST_SIGNING_KEY[\s\S]*INNGEST_EVENT_KEY/
    );
  });

  it("NODE_ENV=production com INNGEST_DEV=1 → import falha alto", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INNGEST_EVENT_KEY", "evt_key_mock");
    vi.stubEnv("INNGEST_SIGNING_KEY", "signkey-prod-0123abcd");
    vi.stubEnv("INNGEST_DEV", "1");

    await expect(import("~/env")).rejects.toThrow(/INNGEST_DEV/);
  });

  it("NODE_ENV=production com as duas keys → env expõe os valores", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INNGEST_EVENT_KEY", "evt_key_mock");
    vi.stubEnv("INNGEST_SIGNING_KEY", "signkey-prod-0123abcd");

    const { env } = await import("~/env");
    expect(env.INNGEST_EVENT_KEY).toBe("evt_key_mock");
    expect(env.INNGEST_SIGNING_KEY).toBe("signkey-prod-0123abcd");
  });

  it("NODE_ENV=development sem as keys → import OK (keys undefined)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("INNGEST_EVENT_KEY", undefined);
    vi.stubEnv("INNGEST_SIGNING_KEY", undefined);

    const { env } = await import("~/env");
    expect(env.INNGEST_EVENT_KEY).toBeUndefined();
    expect(env.INNGEST_SIGNING_KEY).toBeUndefined();
  });
});
