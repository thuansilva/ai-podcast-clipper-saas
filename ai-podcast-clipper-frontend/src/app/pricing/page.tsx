import { auth } from "@clerk/nextjs/server";
import { Header } from "~/components/landing/header";
import { PricingSection } from "~/components/landing/pricing-section";
import { PricingComparisonTable } from "~/components/landing/pricing-comparison-table";
import { FAQSection } from "~/components/landing/faq-section";
import { Footer } from "~/components/landing/footer";

export default async function PricingPage() {
  const { userId } = await auth();
  const isAuthenticated = Boolean(userId);

  return (
    <div className="relative min-h-screen bg-[var(--tinta)] text-[var(--marfim)] selection:bg-[var(--ouro)]/20 selection:text-[var(--ouro)] overflow-x-hidden">
      {/* aioson.com Atmospheric Contour Field & Prismatic Ray Background */}
      <div className="site-field" aria-hidden="true">
        <svg
          className="site-field-contours"
          viewBox="0 0 1440 520"
          preserveAspectRatio="none"
        >
          <g>
            <path d="M-80 92 C180 28 380 170 650 92 S1080 30 1520 126" />
            <path d="M-90 120 C170 52 386 198 664 118 S1100 57 1530 154" />
            <path d="M-100 151 C160 82 392 228 682 148 S1120 88 1540 188" />
            <path d="M-110 186 C145 118 405 259 700 184 S1140 125 1550 224" />
            <path d="M-120 224 C132 158 420 292 720 224 S1160 164 1560 262" />
            <path d="M-130 266 C122 205 438 330 742 268 S1180 208 1570 304" />
            <path d="M-140 312 C118 258 454 372 766 316 S1200 258 1580 348" />
          </g>
        </svg>
        <span className="prisma-feixe" />
        <span className="prisma-marca" />
        <span className="prisma-raio prisma-raio--ouro" />
        <span className="prisma-raio prisma-raio--prata" />
        <span className="prisma-raio prisma-raio--rose" />
        <span className="prisma-raio prisma-raio--cobre" />
        <span className="prisma-raio prisma-raio--patina" />
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[500px] w-full max-w-6xl bg-[radial-gradient(ellipse_at_top,rgba(232,186,82,0.06),transparent_70%)] z-0"
      />

      <div className="relative z-10">
        <Header isAuthenticated={isAuthenticated} />
        <main>
          {/* Header padding adjustment since we don't have a hero section here */}
          <div className="pt-10">
            <PricingSection isAuthenticated={isAuthenticated} />
          </div>
          <PricingComparisonTable />
          <FAQSection />
        </main>
        <Footer />
      </div>
    </div>
  );
}
