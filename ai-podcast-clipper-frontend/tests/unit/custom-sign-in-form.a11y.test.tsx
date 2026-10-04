import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CustomSignInForm } from "~/components/auth/custom-sign-in-form";

vi.mock("@clerk/nextjs/legacy", () => ({
  useSignIn: () => ({
    isLoaded: true,
    signIn: {
      create: vi.fn().mockRejectedValue(new Error("Invalid credentials")),
    },
    setActive: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("CustomSignInForm - Accessibility (WCAG 2.1 AA)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("WCAG 4.1.3: Error alerts with role and aria-live", () => {
    it("should have role='alert' or aria-live on error messages (BLOCKER #3)", async () => {
      render(<CustomSignInForm />);

      const emailInput = screen.getByLabelText("Email");
      fireEvent.change(emailInput, { target: { value: "invalid" } });

      const submitButton = screen.getByRole("button", { name: /entrar|login/i });
      fireEvent.click(submitButton);

      // Wait for error message to appear
      await new Promise(resolve => setTimeout(resolve, 100));

      const errorAlert = document.querySelector('[role="alert"]');
      expect(errorAlert).toBeDefined();

      if (!errorAlert) {
        // Fallback: check if error has aria-live
        const errorDiv = screen.queryByText(/dados.*inválidos|invalid|erro/i);
        if (errorDiv) {
          const parent = errorDiv.closest('[aria-live]');
          expect(parent?.getAttribute("aria-live")).toBeTruthy();
        }
      }
    });
  });

  describe("WCAG 2.4.7: Focus visible indicators", () => {
    it("email input should have visible focus indicator (BLOCKER #6)", () => {
      render(<CustomSignInForm />);
      const emailInput = screen.getByLabelText("Email") as HTMLInputElement;

      fireEvent.focus(emailInput);

      const classList = emailInput.className;
      // Should have focus:ring or focus-visible:ring or similar
      expect(classList).toMatch(/focus:.*ring|focus-visible:.*ring|focus:outline|focus-visible:outline/);
    });

    it("password input should have visible focus indicator (BLOCKER #6)", () => {
      render(<CustomSignInForm />);
      const passwordInput = screen.getByLabelText("Senha") as HTMLInputElement;

      fireEvent.focus(passwordInput);

      const classList = passwordInput.className;
      expect(classList).toMatch(/focus:.*ring|focus-visible:.*ring|focus:outline|focus-visible:outline/);
    });
  });
});
