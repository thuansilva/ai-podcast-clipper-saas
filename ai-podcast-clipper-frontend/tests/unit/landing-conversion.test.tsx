import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComparisonSection } from "~/components/landing/comparison-section";
import { PricingSection } from "~/components/landing/pricing-section";
import { FAQSection } from "~/components/landing/faq-section";
import { Footer } from "~/components/landing/footer";
import { MultiPlatformSection } from "~/components/landing/multi-platform-section";

describe("Landing Conversion Components", () => {
  it("renders MultiPlatformSection with social networks", () => {
    render(<MultiPlatformSection />);
    expect(screen.getByText("TikTok")).toBeInTheDocument();
    expect(screen.getByText("Instagram Reels")).toBeInTheDocument();
    expect(screen.getByText("YouTube Shorts")).toBeInTheDocument();
    expect(screen.getByText("LinkedIn Video")).toBeInTheDocument();
    expect(screen.getByText(/One Click. Formatted for Every Major Feed/i)).toBeInTheDocument();
  });

  it("renders ComparisonSection with manual vs clipper comparison", () => {
    render(<ComparisonSection />);
    expect(screen.getByText(/Traditional Manual Editing/i)).toBeInTheDocument();
    expect(screen.getByText(/With Podcast Clipper Studio/i)).toBeInTheDocument();
  });

  it("renders PricingSection with 3 plans and correct pricing", () => {
    render(<PricingSection isAuthenticated={false} />);
    expect(screen.getByText("$15")).toBeInTheDocument();
    expect(screen.getByText("$29")).toBeInTheDocument();
    expect(screen.getAllByText("Custom").length).toBeGreaterThanOrEqual(1);
  });

  it("renders FAQSection with answers to common creator questions", () => {
    render(<FAQSection />);
    expect(screen.getByText(/How do processing credits work\?/i)).toBeInTheDocument();
    expect(screen.getByText(/Do my credits ever expire\?/i)).toBeInTheDocument();
  });

  it("renders Footer with copyright and status info", () => {
    render(<Footer />);
    expect(screen.getAllByText(/Podcast Clipper Studio/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/All Systems Operational/i)).toBeInTheDocument();
  });
});
