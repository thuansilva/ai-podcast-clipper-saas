import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DeleteAccountSection } from "~/components/dashboard/delete-account-section";
import { requestAccountDeletion } from "~/actions/delete-account";
import { toast } from "sonner";

vi.mock("~/actions/delete-account", () => ({
  requestAccountDeletion: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe("DeleteAccountSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve exibir um aviso claro e o botão de exclusão", () => {
    render(<DeleteAccountSection />);

    expect(screen.getByText(/zona de risco/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /excluir minha conta/i })
    ).toBeInTheDocument();
  });

  it("não deve chamar a action sem confirmação no diálogo", () => {
    render(<DeleteAccountSection />);

    fireEvent.click(
      screen.getByRole("button", { name: /excluir minha conta/i })
    );

    expect(requestAccountDeletion).not.toHaveBeenCalled();
  });

  it("deve chamar requestAccountDeletion e navegar para a home ao confirmar", async () => {
    vi.mocked(requestAccountDeletion).mockResolvedValueOnce(undefined);

    render(<DeleteAccountSection />);

    fireEvent.click(
      screen.getByRole("button", { name: /excluir minha conta/i })
    );

    const confirmButton = await screen.findByRole("button", {
      name: /sim, excluir minha conta/i,
    });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(requestAccountDeletion).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("deve exibir toast de erro e não navegar se a exclusão falhar", async () => {
    vi.mocked(requestAccountDeletion).mockRejectedValueOnce(
      new Error("Clerk indisponível")
    );

    render(<DeleteAccountSection />);

    fireEvent.click(
      screen.getByRole("button", { name: /excluir minha conta/i })
    );

    const confirmButton = await screen.findByRole("button", {
      name: /sim, excluir minha conta/i,
    });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
