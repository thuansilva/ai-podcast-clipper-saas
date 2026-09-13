import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Header } from "~/components/landing/header";
import { HeroSection } from "~/components/landing/hero-section";
import { ProductPreview } from "~/components/landing/product-preview";

describe("Landing Top Components", () => {
  it("renders Header with login/signup when unauthenticated", () => {
    render(<Header isAuthenticated={false} />);
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: /start free/i })).toHaveAttribute("href", "/signup");
  });

  it("renders Header with dashboard link when authenticated", () => {
    render(<Header isAuthenticated={true} />);
    expect(screen.getByRole("link", { name: /go to dashboard/i })).toHaveAttribute("href", "/dashboard");
  });

  it("renders HeroSection with impactful headline and CTAs", () => {
    render(<HeroSection isAuthenticated={false} />);
    expect(screen.getByText(/Turn 1-hour podcasts into/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /claim 10 free credits/i })).toHaveAttribute("href", "/signup");
  });

  it("renders ProductPreview with 9:16 mockup and metrics", () => {
    render(<ProductPreview />);
    expect(screen.getByText(/Viral Score: 94\/100/i)).toBeInTheDocument();
    expect(screen.getByText(/00:14:22 → 00:15:08/i)).toBeInTheDocument();
  });
});
