import { auth } from "@clerk/nextjs/server";
import { Header } from "~/components/landing/header";
import { HeroSection } from "~/components/landing/hero-section";
import { ProductPreview } from "~/components/landing/product-preview";
import { ComparisonSection } from "~/components/landing/comparison-section";
import { PricingSection } from "~/components/landing/pricing-section";
import { FAQSection } from "~/components/landing/faq-section";
import { Footer } from "~/components/landing/footer";

export default async function HomePage() {
  const { userId } = await auth();
  const isAuthenticated = Boolean(userId);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-zinc-800 selection:text-zinc-100">
      <Header isAuthenticated={isAuthenticated} />
      <main>
        <HeroSection isAuthenticated={isAuthenticated} />
        <ProductPreview />
        <ComparisonSection />
        <PricingSection isAuthenticated={isAuthenticated} />
        <FAQSection />
      </main>
      <Footer />
    </div>
  );
}
