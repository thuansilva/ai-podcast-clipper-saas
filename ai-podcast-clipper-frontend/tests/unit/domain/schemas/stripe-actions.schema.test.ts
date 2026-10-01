import { describe, it, expect } from "vitest";
import {
  createCheckoutSessionSchema,
  createCustomerPortalSessionSchema,
  STRIPE_PRICE_ID_KEYS,
} from "~/domain/schemas/stripe-actions.schema";

describe("createCheckoutSessionSchema", () => {
  it("aceita cada uma das 4 chaves reais de plano", () => {
    for (const priceId of STRIPE_PRICE_ID_KEYS) {
      expect(createCheckoutSessionSchema.safeParse({ priceId }).success).toBe(true);
    }
  });

  it("aceita mode payment ou subscription", () => {
    expect(
      createCheckoutSessionSchema.safeParse({ priceId: "pro_monthly", mode: "payment" }).success
    ).toBe(true);
    expect(
      createCheckoutSessionSchema.safeParse({ priceId: "pro_monthly", mode: "subscription" })
        .success
    ).toBe(true);
  });

  it("rejeita priceId arbitrário que não é uma das 4 chaves conhecidas (gap de segurança corrigido)", () => {
    const result = createCheckoutSessionSchema.safeParse({ priceId: "price_arbitrary_123" });
    expect(result.success).toBe(false);
  });

  it("rejeita mode fora do enum conhecido", () => {
    const result = createCheckoutSessionSchema.safeParse({
      priceId: "pro_monthly",
      mode: "refund",
    });
    expect(result.success).toBe(false);
  });
});

describe("createCustomerPortalSessionSchema", () => {
  it("aceita ausência de returnUrl", () => {
    expect(createCustomerPortalSessionSchema.safeParse({}).success).toBe(true);
  });

  it("aceita um path relativo começando com /", () => {
    expect(
      createCustomerPortalSessionSchema.safeParse({ returnUrl: "/dashboard/billing" }).success
    ).toBe(true);
  });

  it("rejeita URL absoluta para outro domínio (open redirect)", () => {
    const result = createCustomerPortalSessionSchema.safeParse({
      returnUrl: "https://evil.com/phish",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita URL protocol-relative (//evil.com)", () => {
    const result = createCustomerPortalSessionSchema.safeParse({
      returnUrl: "//evil.com/phish",
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ["/\\evil.com", "barra invertida logo após a barra inicial (/\\evil.com)"],
    ["/\\/evil.com", "barra invertida seguida de barra (/\\/evil.com)"],
    ["/dashboard\\..\\evil", "barra invertida no meio do path"],
    ["/\t/evil.com", "TAB no meio (navegadores removem e viram //evil.com)"],
    ["/\n/evil.com", "quebra de linha no meio"],
    ["javascript:alert(1)", "esquema javascript:"],
  ])("rejeita %s (%s)", (returnUrl) => {
    expect(createCustomerPortalSessionSchema.safeParse({ returnUrl }).success).toBe(false);
  });

  it("aceita path com query string", () => {
    expect(
      createCustomerPortalSessionSchema.safeParse({ returnUrl: "/dashboard/billing?tab=plans" }).success
    ).toBe(true);
  });

  it("rejeita path que não começa com /", () => {
    const result = createCustomerPortalSessionSchema.safeParse({
      returnUrl: "dashboard/billing",
    });
    expect(result.success).toBe(false);
  });
});
