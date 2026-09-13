import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CustomSignInForm } from "~/components/auth/custom-sign-in-form";

const mockSignInCreate = vi.fn();
const mockAuthenticateWithRedirect = vi.fn();
const mockSetActive = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@clerk/nextjs/legacy", () => ({
  useSignIn: () => ({
    isLoaded: true,
    signIn: {
      create: mockSignInCreate,
      authenticateWithRedirect: mockAuthenticateWithRedirect,
    },
    setActive: mockSetActive,
  }),
}));

describe("CustomSignInForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve renderizar campos de email, senha, botão de login e botão do Google", () => {
    render(<CustomSignInForm />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /entrar no studio/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continuar com google/i })).toBeInTheDocument();
    expect(screen.getByText(/não tem uma conta/i)).toBeInTheDocument();
  });

  it("deve alternar a visibilidade da senha ao clicar no botão de revelar", () => {
    render(<CustomSignInForm />);

    const passwordInput = screen.getByLabelText(/senha/i) as HTMLInputElement;
    expect(passwordInput.type).toBe("password");

    const toggleButton = screen.getByRole("button", { name: /alternar visibilidade/i });
    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe("text");

    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe("password");
  });

  it("deve submeter credenciais e redirecionar para dashboard em caso de sucesso", async () => {
    mockSignInCreate.mockResolvedValueOnce({
      status: "complete",
      createdSessionId: "sess_123",
    });

    render(<CustomSignInForm />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar no studio/i }));

    await waitFor(() => {
      expect(mockSignInCreate).toHaveBeenCalledWith({
        identifier: "user@example.com",
        password: "password123",
      });
      expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_123" });
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("deve disparar OAuth com Google ao clicar no botão correspondente", async () => {
    render(<CustomSignInForm />);

    fireEvent.click(screen.getByRole("button", { name: /continuar com google/i }));

    await waitFor(() => {
      expect(mockAuthenticateWithRedirect).toHaveBeenCalledWith({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/dashboard",
      });
    });
  });

  it("deve exibir mensagem de erro traduzida caso as credenciais falhem", async () => {
    mockSignInCreate.mockRejectedValueOnce({
      errors: [{ code: "form_password_incorrect" }],
    });

    render(<CustomSignInForm />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: "wrongpass" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar no studio/i }));

    await waitFor(() => {
      expect(screen.getByText(/senha incorreta/i)).toBeInTheDocument();
    });
  });

  it("deve exibir erro se o status retornado não for complete", async () => {
    mockSignInCreate.mockResolvedValueOnce({
      status: "needs_second_factor",
    });

    render(<CustomSignInForm />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar no studio/i }));

    await waitFor(() => {
      expect(screen.getByText(/autenticação não concluída/i)).toBeInTheDocument();
    });
  });
});
