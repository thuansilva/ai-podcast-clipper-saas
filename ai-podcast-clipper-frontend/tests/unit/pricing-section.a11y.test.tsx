import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PricingSection } from "~/components/landing/pricing-section";

describe("PricingSection - Accessibility (WCAG 2.1 AA)", () => {
  describe("WCAG 2.4.7: Focus visible indicators", () => {
    it("annual billing toggle should have visible focus indicator (BLOCKER #6)", () => {
      render(<PricingSection isAuthenticated={false} />);

      const toggle = screen.getByRole("button", { name: /toggle.*billing|annual/i });
      expect(toggle).toBeInTheDocument();

      const classList = toggle.className;
      // Should have focus:ring or focus-visible:ring indicator
      // Currently it has focus:outline-none which is the violation
      expect(classList).toMatch(/focus:.*ring|focus-visible:.*ring|focus:outline/);

      // The key is that focus:outline-none should NOT be the only focus style
      // It should have focus:outline-2 or focus:ring-2 or similar
      if (classList.includes("focus:outline-none")) {
        // If outline is removed, must have ring or border
        expect(classList).toMatch(/focus:.*ring|focus:.*border|focus-visible/);
      }
    });
  });
});
