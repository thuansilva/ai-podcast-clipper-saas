import Link from "next/link";
import { CheckIcon, ZapIcon, ShieldCheckIcon } from "lucide-react";

export interface PricingSectionProps {
  isAuthenticated: boolean;
}

export function PricingSection({ isAuthenticated }: PricingSectionProps) {
  const targetHref = isAuthenticated ? "/dashboard/billing" : "/signup";

  const plans = [
    {
      title: "Starter Pack",
      price: "$9.99",
      unitPrice: "$0.20 / min",
      credits: "50 Credits",
      description: "Perfect for testing your first full podcast episode.",
      features: [
        "50 minutes of AI video processing",
        "Unlimited 1080p 60FPS downloads",
        "Smart 9:16 active-speaker crop",
        "Animated Hormozi dynamic captions",
        "Credits never expire",
      ],
      isPopular: false,
      ctaText: "Get 50 Credits",
    },
    {
      title: "Creator Pack",
      price: "$24.99",
      unitPrice: "$0.16 / min",
      credits: "150 Credits",
      description: "Best value for active podcasters releasing weekly episodes.",
      features: [
        "150 minutes of processing (~3 full episodes)",
        "Save 17% per processed minute",
        "Priority rendering queue",
        "All subtitle presets included",
        "Credits never expire",
      ],
      isPopular: true,
      ctaText: "Get 150 Credits",
    },
    {
      title: "Studio Pack",
      price: "$69.99",
      unitPrice: "$0.14 / min",
      credits: "500 Credits",
      description: "Designed for production studios, agencies, and high-volume media teams.",
      features: [
        "500 minutes of processing (~10 full episodes)",
        "Save 30% per processed minute",
        "Ultra-fast parallel render slots",
        "Dedicated priority email support",
        "Credits never expire",
      ],
      isPopular: false,
      ctaText: "Get 500 Credits",
    },
  ];

  return (
    <section id="pricing" className="border-t border-[var(--linha)] py-20 bg-[#0b0a08]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center">
          <span className="font-mono text-xs tracking-wider text-[var(--ouro)] uppercase">
            Simple Pay-As-You-Go
          </span>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--marfim)] sm:text-3xl">
            No Monthly Subscriptions. Pay Only for What You Use.
          </h2>
          <p className="mt-2 text-sm text-[var(--fumaca)]">
            Top up credits when you need them. Unused credits remain in your balance forever.
          </p>
        </div>

        {/* Guarantee Callout */}
        <div className="mx-auto mt-8 max-w-2xl rounded-full border border-[var(--patina)]/30 bg-[#161310] p-3 text-center backdrop-blur-sm shadow-[0_0_20px_rgba(110,198,162,0.06)]">
          <div className="flex items-center justify-center gap-2 text-xs font-mono text-[var(--patina)]">
            <ShieldCheckIcon className="h-4 w-4 text-[var(--patina)]" />
            <span>Risk-Free: 10 Free Minutes on Sign-up • No Credit Card Required</span>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          {plans.map((plan, idx) => (
            <div
              key={idx}
              className={`relative flex flex-col justify-between rounded-2xl border p-6 transition-all duration-200 ${
                plan.isPopular
                  ? "border-[var(--ouro)] bg-gradient-to-b from-[#1d1914] to-[#161310] shadow-[0_0_35px_rgba(232,186,82,0.14)]"
                  : "border-[var(--linha)] bg-[#161310] hover:border-[var(--linha-2)] hover:bg-[#1d1914]"
              }`}
            >
              {plan.isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-[var(--ouro)] bg-[var(--ouro)] px-3.5 py-0.5 font-mono text-[10px] font-bold text-[var(--tinta)] uppercase tracking-wider shadow-sm">
                  Most Popular
                </div>
              )}

              <div>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-lg font-semibold text-[var(--marfim)]">{plan.title}</h3>
                  <span className="rounded-full border border-[var(--linha-2)] bg-[#0b0a08] px-2 py-0.5 font-mono text-[11px] text-[var(--marfim-2)]">
                    {plan.credits}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[var(--fumaca)] leading-relaxed">{plan.description}</p>

                <div className="mt-6 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight text-[var(--marfim)]">{plan.price}</span>
                  <span className="font-mono text-xs text-[var(--fumaca)]">({plan.unitPrice})</span>
                </div>

                <div className="my-6 border-t border-[var(--linha)]" />

                <ul className="space-y-2.5 text-xs text-[var(--marfim-2)]">
                  {plan.features.map((feat, fIdx) => (
                    <li key={fIdx} className="flex items-center gap-2">
                      <CheckIcon className="h-3.5 w-3.5 text-[var(--patina)] shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8">
                <Link
                  href={targetHref}
                  className={`w-full ${
                    plan.isPopular
                      ? "btn-ouro !w-full !text-xs !py-2.5"
                      : "btn-linha !w-full !text-xs !py-2.5"
                  }`}
                >
                  <ZapIcon className="h-3.5 w-3.5" />
                  {plan.ctaText}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
