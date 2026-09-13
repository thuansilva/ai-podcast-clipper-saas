import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginPage from "~/app/login/[[...login]]/page";
import SignUpPage from "~/app/signup/[[...signup]]/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@clerk/nextjs/legacy", () => ({
  useSignIn: () => ({
    isLoaded: true,
    signIn: {
      create: vi.fn(),
      authenticateWithRedirect: vi.fn(),
    },
    setActive: vi.fn(),
  }),
  useSignUp: () => ({
    isLoaded: true,
    signUp: {
      create: vi.fn(),
      prepareEmailAddressVerification: vi.fn(),
      attemptEmailAddressVerification: vi.fn(),
      authenticateWithRedirect: vi.fn(),
    },
    setActive: vi.fn(),
  }),
}));

describe("Auth Pages", () => {
  it("renders LoginPage within AuthSplitLayout with CustomSignInForm", () => {
    render(<LoginPage />);

    // Layout assertions
    expect(screen.getAllByText("Podcast Clipper")[0]).toBeInTheDocument();
    expect(
      screen.getByText("Bem-vindo de volta ao Studio"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Acesse sua conta para continuar criando, personalizando e exportando seus cortes virais.",
      ),
    ).toBeInTheDocument();

    // CustomSignInForm assertions (pt-BR copy)
    expect(
      screen.getByRole("button", { name: /entrar no studio/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /continuar com google/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /acessar sua conta/i }),
    ).toBeInTheDocument();
  });

  it("renders SignUpPage within AuthSplitLayout with CustomSignUpForm", () => {
    render(<SignUpPage />);

    // Layout assertions
    expect(screen.getAllByText("Podcast Clipper")[0]).toBeInTheDocument();
    expect(screen.getByText("Crie sua conta no Studio")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Comece com 10 minutos gratuitos. Envie seu episódio e gere seus primeiros clipes virais em minutos.",
      ),
    ).toBeInTheDocument();

    // CustomSignUpForm assertions (pt-BR copy)
    expect(
      screen.getByRole("button", { name: /criar conta no studio/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /cadastrar com google/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: /criar sua conta studio/i,
      }),
    ).toBeInTheDocument();
  });
});
