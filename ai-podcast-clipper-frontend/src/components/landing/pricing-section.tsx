"use client";

import Link from "next/link";
import { CheckIcon, ZapIcon, ShieldCheckIcon, MailIcon } from "lucide-react";
import { useState } from "react";

export interface PricingSectionProps {
  isAuthenticated: boolean;
}

export function PricingSection({ isAuthenticated }: PricingSectionProps) {
  const [isAnnual, setIsAnnual] = useState(false);
  const defaultTargetHref = isAuthenticated ? "/dashboard/billing" : "/signup";

  const plans = [
    {
      title: "Starter",
      monthlyPrice: "$15",
      annualPrice: "$9.50",
      billedAnnually: "$114",
      monthlyCredits: "150 Créditos/mês",
      annualCredits: "1.800 Créditos/ano",
      description: "Perfect for testing your first full podcast episode or starting a channel.",
      monthlyFeatures: [
        "150 minutes of AI video processing",
        "Unlimited 1080p 60FPS downloads",
        "Smart 9:16 active-speaker crop",
        "Animated dynamic captions",
      ],
      annualFeatures: [
        "1,800 minutes of AI video processing",
        "Unlimited 1080p 60FPS downloads",
        "Smart 9:16 active-speaker crop",
        "Animated dynamic captions",
      ],
      isPopular: false,
      ctaText: "Get Starter",
      isCustom: false,
    },
    {
      title: "Pro",
      monthlyPrice: "$29",
      annualPrice: "$19",
      billedAnnually: "$228",
      monthlyCredits: "300 Créditos/mês",
      annualCredits: "3.600 Créditos/ano",
      description: "Best value for active creators releasing daily shorts.",
      monthlyFeatures: [
        "300 minutes of AI processing",
        "Save 30% per processed minute",
        "Priority rendering queue",
        "All subtitle presets included",
      ],
      annualFeatures: [
        "3,600 minutes of AI processing",
        "Save 30% per processed minute",
        "Priority rendering queue",
        "All subtitle presets included",
      ],
      isPopular: true,
      ctaText: "Get Pro",
      isCustom: false,
    },
    {
      title: "Enterprise",
      monthlyPrice: "Custom",
      annualPrice: "Custom",
      billedAnnually: "",
      monthlyCredits: "Unlimited Volume",
      annualCredits: "Unlimited Volume",
      description: "Designed for production studios, agencies, and high-volume media teams.",
      monthlyFeatures: [
        "Custom processing volume",
        "Ultra-fast parallel render slots",
        "Dedicated account manager",
        "White-label API Access",
      ],
      annualFeatures: [
        "Custom processing volume",
        "Ultra-fast parallel render slots",
        "Dedicated account manager",
        "White-label API Access",
      ],
      isPopular: false,
      ctaText: "Contact Us",
      isCustom: true,
      href: "mailto:contact@suaempresa.com",
    },
  ];

  return (
    <section id="pricing" className="border-t border-[var(--linha)] py-20 bg-[var(--tinta)]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center">
          <span className="font-mono text-xs tracking-wider text-[var(--ouro)] uppercase">
            Simple & Transparent Pricing
          </span>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--marfim)] sm:text-3xl">
            Pick the right plan for your content
          </h2>
          <p className="mt-2 text-sm text-[var(--fumaca)]">
            Upgrade, downgrade, or cancel anytime.
          </p>
        </div>

        {/* Monthly / Annual Toggle */}
        <div className="mt-8 flex justify-center items-center gap-3">
          <span className={`text-sm ${!isAnnual ? "font-semibold text-[var(--marfim)]" : "text-[var(--fumaca)]"}`}>
            Monthly
          </span>
          <button
            onClick={() => setIsAnnual(!isAnnual)}
            className="relative inline-flex h-6 w-12 items-center rounded-full bg-[var(--linha-2)] transition-colors focus:outline-none"
            aria-label="Toggle Annual Billing"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-[var(--ouro)] transition-transform duration-200 ease-in-out ${
                isAnnual ? "translate-x-7" : "translate-x-1"
              }`}
            />
          </button>
          <span className={`text-sm flex items-center gap-1.5 ${isAnnual ? "font-semibold text-[var(--marfim)]" : "text-[var(--fumaca)]"}`}>
            Annually 
            <span className="rounded-full bg-[var(--ouro)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--ouro)] uppercase">
              Save 30%
            </span>
          </span>
        </div>

        {/* Guarantee Callout */}
        <div className="mx-auto mt-8 max-w-2xl rounded-full border border-[var(--patina)]/30 bg-[var(--superficie)] p-3 text-center backdrop-blur-sm shadow-[0_0_20px_rgba(110,198,162,0.06)]">
          <div className="flex items-center justify-center gap-2 text-xs font-mono text-[var(--patina)]">
            <ShieldCheckIcon className="h-4 w-4 text-[var(--patina)]" />
            <span>Risk-Free: 10 Free Minutes on Sign-up • Cancel Anytime</span>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          {plans.map((plan, idx) => {
            const currentCredits = isAnnual ? plan.annualCredits : plan.monthlyCredits;
            const currentFeatures = isAnnual ? plan.annualFeatures : plan.monthlyFeatures;

            return (
              <div
                key={idx}
                className={`relative flex flex-col justify-between rounded-2xl border p-6 transition-all duration-200 ${
                  plan.isPopular
                    ? "border-[var(--ouro)] bg-gradient-to-b from-[var(--superficie-2)] to-[var(--superficie)] shadow-[0_0_35px_rgba(232,186,82,0.14)]"
                    : "border-[var(--linha)] bg-[var(--superficie)] hover:border-[var(--linha-2)] hover:bg-[var(--superficie-2)]"
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
                    <span className="rounded-full border border-[var(--linha-2)] bg-[var(--tinta)] px-2 py-0.5 font-mono text-[11px] text-[var(--marfim-2)]">
                      {currentCredits}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-[var(--fumaca)] leading-relaxed">{plan.description}</p>

                  <div className="mt-6 flex flex-col gap-1 min-h-[4rem]">
                    <div className="flex items-end gap-1">
                      <span className="text-4xl font-bold tracking-tight text-[var(--marfim)]">
                        {plan.isCustom ? "Custom" : (isAnnual ? plan.annualPrice : plan.monthlyPrice)}
                      </span>
                      {!plan.isCustom && <span className="text-sm text-[var(--fumaca)] mb-1">/mo</span>}
                    </div>
                    {isAnnual && !plan.isCustom ? (
                      <span className="font-mono text-xs text-[var(--patina)]">
                        Billed {plan.billedAnnually} yearly
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-transparent">
                        Placeholder
                      </span>
                    )}
                  </div>

                  <div className="my-6 border-t border-[var(--linha)]" />

                  <ul className="space-y-2.5 text-xs text-[var(--marfim-2)]">
                    {currentFeatures.map((feat, fIdx) => (
                      <li key={fIdx} className="flex items-center gap-2">
                        <CheckIcon className="h-3.5 w-3.5 text-[var(--patina)] shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8">
                  <Link
                    href={plan.href || defaultTargetHref}
                    className={`w-full ${
                      plan.isPopular
                        ? "btn-ouro !w-full !text-xs !py-2.5"
                        : "btn-linha !w-full !text-xs !py-2.5"
                    }`}
                  >
                    {plan.isCustom ? <MailIcon className="h-3.5 w-3.5" /> : <ZapIcon className="h-3.5 w-3.5" />}
                    {plan.ctaText}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
