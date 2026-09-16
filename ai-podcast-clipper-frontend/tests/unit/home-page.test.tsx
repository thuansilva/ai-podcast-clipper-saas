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

    expect(screen.getByText(/Turn 1-hour podcasts into/i)).toBeInTheDocument();
    expect(screen.getByText(/See the Intelligent Reframe in Action/i)).toBeInTheDocument();
    expect(screen.getByText(/One Click. Formatted for Every Major Feed/i)).toBeInTheDocument();
    expect(screen.getByText(/Manual Video Editing vs. Podcast Clipper/i)).toBeInTheDocument();
    
    expect(screen.getByText(/See the Magic Happen/i)).toBeInTheDocument();
  });

  it("passes isAuthenticated=true to sections when user is logged in", async () => {
    const { auth } = await import("@clerk/nextjs/server");
    vi.mocked(auth).mockResolvedValueOnce({ userId: "user_123" } as any);

    const Component = await HomePage();
    render(Component);

    expect(screen.getByRole("link", { name: /go to dashboard/i })).toHaveAttribute("href", "/dashboard");
  });
});
