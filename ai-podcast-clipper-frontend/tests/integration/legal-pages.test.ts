/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";

/**
 * Testes de integração HTTP reais contra as páginas legais obrigatórias para
 * ativar o modo live do Stripe (Termos de Uso, Política de Privacidade,
 * Política de Reembolso e Contato). Seguem o mesmo padrão de
 * `tests/integration/health-check.test.ts`: fazem fetch contra um servidor
 * Next.js real (ver CI: `npm run build && npm run start`), então exigem que o
 * servidor esteja de pé em TEST_BASE_URL/localhost:3000.
 *
 * Antes da implementação, estas rotas não existem e o Next.js responde 404 —
 * esse é o estado "vermelho" esperado no TDD.
 */
describe("Páginas legais - Integration Tests", () => {
  const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";

  const pages = [
    { path: "/terms", heading: /termos de uso/i },
    { path: "/privacy", heading: /política de privacidade/i },
    { path: "/refund", heading: /política de reembolso/i },
    { path: "/contact", heading: /contato/i },
  ];

  for (const { path, heading } of pages) {
    describe(`GET ${path}`, () => {
      it(`deve responder com status 200 em ${path}`, async () => {
        const res = await fetch(`${baseUrl}${path}`, { method: "GET" });
        expect(res.status).toBe(200);
      });

      it(`deve renderizar conteúdo (heading) em ${path}`, async () => {
        const res = await fetch(`${baseUrl}${path}`, { method: "GET" });
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toMatch(heading);
      });
    });
  }
});
