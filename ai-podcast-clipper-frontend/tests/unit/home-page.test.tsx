import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "~/app/page";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: null }),
}));

describe("HomePage", () => {
  it("renders the full landing page for unauthenticated visitors", async () => {
    const Component = await HomePage();
    render(Component);

    expect(screen.getByText(/De podcasts longos a cortes virais/i)).toBeInTheDocument();
    expect(screen.getByText(/Demonstração Real/i)).toBeInTheDocument();
    expect(screen.getByText(/Edição Manual vs. Podcast Clipper/i)).toBeInTheDocument();
    expect(screen.getByText(/Pague pelo que usar/i)).toBeInTheDocument();
    expect(screen.getByText(/Perguntas Frequentes/i)).toBeInTheDocument();
  });

  it("passes isAuthenticated=true to sections when user is logged in", async () => {
    const { auth } = await import("@clerk/nextjs/server");
    vi.mocked(auth).mockResolvedValueOnce({ userId: "user_123" } as any);

    const Component = await HomePage();
    render(Component);

    expect(screen.getByRole("link", { name: /acessar painel/i })).toHaveAttribute("href", "/dashboard");
  });
});
