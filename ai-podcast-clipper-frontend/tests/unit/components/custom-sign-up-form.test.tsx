import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CustomSignUpForm } from "~/components/auth/custom-sign-up-form";

const mockSignUpCreate = vi.fn();
const mockPrepareVerification = vi.fn();
const mockAttemptVerification = vi.fn();
const mockAuthenticateWithRedirect = vi.fn();
const mockSetActive = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@clerk/nextjs/legacy", () => ({
  useSignUp: () => ({
    isLoaded: true,
    signUp: {
      create: mockSignUpCreate,
      prepareEmailAddressVerification: mockPrepareVerification,
      attemptEmailAddressVerification: mockAttemptVerification,
      authenticateWithRedirect: mockAuthenticateWithRedirect,
    },
    setActive: mockSetActive,
  }),
}));

describe("CustomSignUpForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve renderizar campos de email, senha, botão de cadastro e botão do Google", () => {
    render(<CustomSignUpForm />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /criar conta no studio/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cadastrar com google/i })).toBeInTheDocument();
    expect(screen.getByText(/já tem uma conta/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /entrar/i })).toBeInTheDocument();
  });

  it("deve alternar a visibilidade da senha ao clicar no botão de revelar", () => {
    render(<CustomSignUpForm />);

    const passwordInput = screen.getByLabelText(/senha/i) as HTMLInputElement;
    expect(passwordInput.type).toBe("password");

    const toggleButton = screen.getByRole("button", { name: /alternar visibilidade/i });
    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe("text");

    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe("password");
  });

  it("deve submeter dados e avançar para etapa de verificação de código", async () => {
    mockSignUpCreate.mockResolvedValueOnce({});
    mockPrepareVerification.mockResolvedValueOnce({});

    render(<CustomSignUpForm />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "newuser@example.com" } });
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /criar conta no studio/i }));

    await waitFor(() => {
      expect(mockSignUpCreate).toHaveBeenCalledWith({
        emailAddress: "newuser@example.com",
        password: "password123",
      });
      expect(mockPrepareVerification).toHaveBeenCalledWith({ strategy: "email_code" });
      expect(screen.getByText(/verifique seu email/i)).toBeInTheDocument();
      expect(screen.getByText("newuser@example.com")).toBeInTheDocument();
      expect(screen.getByLabelText(/código de verificação/i)).toBeInTheDocument();
    });
  });

  it("deve validar código de 6 dígitos e autenticar com sucesso", async () => {
    mockSignUpCreate.mockResolvedValueOnce({});
    mockPrepareVerification.mockResolvedValueOnce({});
    mockAttemptVerification.mockResolvedValueOnce({
      status: "complete",
      createdSessionId: "sess_new_123",
    });

    render(<CustomSignUpForm />);

    // Avança para etapa 2
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "newuser@example.com" } });
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /criar conta no studio/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/código de verificação/i)).toBeInTheDocument();
    });

    // Digita o código e confirma
    fireEvent.change(screen.getByLabelText(/código de verificação/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar e acessar/i }));

    await waitFor(() => {
      expect(mockAttemptVerification).toHaveBeenCalledWith({ code: "123456" });
      expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_new_123" });
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("deve reenviar o código de verificação ao clicar no botão reenviar", async () => {
    mockSignUpCreate.mockResolvedValueOnce({});
    mockPrepareVerification.mockResolvedValueOnce({});

    render(<CustomSignUpForm />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "newuser@example.com" } });
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /criar conta no studio/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /reenviar código/i })).toBeInTheDocument();
    });

    mockPrepareVerification.mockResolvedValueOnce({});
    fireEvent.click(screen.getByRole("button", { name: /reenviar código/i }));

    await waitFor(() => {
      expect(mockPrepareVerification).toHaveBeenCalledWith({ strategy: "email_code" });
      expect(screen.getByText(/novo código de verificação enviado/i)).toBeInTheDocument();
    });
  });

  it("deve permitir voltar para a etapa de formulário ao clicar em editar email", async () => {
    mockSignUpCreate.mockResolvedValueOnce({});
    mockPrepareVerification.mockResolvedValueOnce({});

    render(<CustomSignUpForm />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "newuser@example.com" } });
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /criar conta no studio/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /editar email/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /editar email/i }));

    expect(screen.getByRole("button", { name: /criar conta no studio/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveValue("newuser@example.com");
  });

  it("deve disparar OAuth com Google no cadastro", async () => {
    render(<CustomSignUpForm />);

    fireEvent.click(screen.getByRole("button", { name: /cadastrar com google/i }));

    await waitFor(() => {
      expect(mockAuthenticateWithRedirect).toHaveBeenCalledWith({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/dashboard",
      });
    });
  });

  it("deve exibir mensagem de erro traduzida caso a criação de conta falhe", async () => {
    mockSignUpCreate.mockRejectedValueOnce({
      errors: [{ code: "form_identifier_exists" }],
    });

    render(<CustomSignUpForm />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "existing@example.com" } });
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /criar conta no studio/i }));

    await waitFor(() => {
      expect(screen.getByText(/este email já está cadastrado/i)).toBeInTheDocument();
    });
  });

  it("deve exibir erro na etapa 2 se a verificação de código falhar", async () => {
    mockSignUpCreate.mockResolvedValueOnce({});
    mockPrepareVerification.mockResolvedValueOnce({});
    mockAttemptVerification.mockRejectedValueOnce({
      errors: [{ code: "form_code_incorrect" }],
    });

    render(<CustomSignUpForm />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "newuser@example.com" } });
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /criar conta no studio/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/código de verificação/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/código de verificação/i), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar e acessar/i }));

    await waitFor(() => {
      expect(screen.getByText(/código de verificação incorreto ou expirado/i)).toBeInTheDocument();
    });
  });

  it("deve exibir erro se o status de verificação retornado não for complete", async () => {
    mockSignUpCreate.mockResolvedValueOnce({});
    mockPrepareVerification.mockResolvedValueOnce({});
    mockAttemptVerification.mockResolvedValueOnce({
      status: "missing_requirements",
    });

    render(<CustomSignUpForm />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "newuser@example.com" } });
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /criar conta no studio/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/código de verificação/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/código de verificação/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar e acessar/i }));

    await waitFor(() => {
      expect(screen.getByText(/não foi possível concluir o cadastro/i)).toBeInTheDocument();
    });
  });
});
