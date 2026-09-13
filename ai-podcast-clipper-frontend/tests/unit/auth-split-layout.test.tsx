import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthSplitLayout } from "~/components/auth/auth-split-layout";

describe("AuthSplitLayout", () => {
  it("renders branding, back link and child form correctly", () => {
    render(
      <AuthSplitLayout title="Acesse o Estúdio" subtitle="Entre com suas credenciais">
        <div data-testid="auth-form">Formulário Clerk</div>
      </AuthSplitLayout>
    );

    expect(screen.getAllByText("Podcast Clipper")[0]).toBeInTheDocument();
    expect(screen.getAllByText("STUDIO")[0]).toBeInTheDocument();
    expect(screen.getByText("Acesse o Estúdio")).toBeInTheDocument();
    expect(screen.getByText("Entre com suas credenciais")).toBeInTheDocument();
    expect(screen.getByTestId("auth-form")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /voltar ao site/i })).toHaveAttribute("href", "/");
  });

  it("displays studio proof indicators and metrics", () => {
    render(
      <AuthSplitLayout>
        <div>Form</div>
      </AuthSplitLayout>
    );

    expect(screen.getByText(/REC/i)).toBeInTheDocument();
    expect(screen.getByText(/Score Viral: 94\/100/i)).toBeInTheDocument();
  });
});
