import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthSplitLayout } from "~/components/auth/auth-split-layout";

describe("AuthSplitLayout", () => {
  it("renders branding, back link and child form correctly", () => {
    render(
      <AuthSplitLayout title="Production Studio" subtitle="Enter your credentials">
        <div data-testid="auth-form">Clerk Form</div>
      </AuthSplitLayout>
    );

    expect(screen.getAllByText("Podcast Clipper")[0]).toBeInTheDocument();
    expect(screen.getAllByText("STUDIO")[0]).toBeInTheDocument();
    expect(screen.getByText("Production Studio")).toBeInTheDocument();
    expect(screen.getByText("Enter your credentials")).toBeInTheDocument();
    expect(screen.getByTestId("auth-form")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to website/i })).toHaveAttribute("href", "/");
  });

  it("displays studio proof indicators and metrics", () => {
    render(
      <AuthSplitLayout>
        <div>Form</div>
      </AuthSplitLayout>
    );

    expect(screen.getByText(/REC/i)).toBeInTheDocument();
    expect(screen.getByText(/Viral Score: 94\/100/i)).toBeInTheDocument();
  });
});
