import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SSOCallbackPage from "~/app/sso-callback/page";

vi.mock("@clerk/nextjs", () => ({
  AuthenticateWithRedirectCallback: vi.fn(() => (
    <div data-testid="clerk-sso-callback">Redirecting...</div>
  )),
}));

describe("SSOCallbackPage", () => {
  it("deve renderizar a tela de callback com estilo Dark Precision Studio", () => {
    render(<SSOCallbackPage />);

    expect(screen.getByTestId("clerk-sso-callback")).toBeInTheDocument();
    expect(screen.getByText("Autenticando com Google...")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Finalizando sua sessão segura no Studio. Aguarde um instante.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Validando credenciais")).toBeInTheDocument();
  });

  it("deve conter o componente AuthenticateWithRedirectCallback acessível ou em container auxiliar", () => {
    const { container } = render(<SSOCallbackPage />);

    const ssoElement = screen.getByTestId("clerk-sso-callback");
    expect(ssoElement).toBeInTheDocument();
    expect(container.querySelector(".sr-only")).toContainElement(ssoElement);
  });
});
