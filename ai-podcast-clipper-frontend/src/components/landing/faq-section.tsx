"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
}

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs: FAQItem[] = [
    {
      question: "How do processing credits work?",
      answer:
        "1 credit equals 1 minute of source video analyzed and clipped. For instance, a 45-minute episode uses 45 credits and typically yields 4 to 8 high-retention vertical clips ready to publish.",
    },
    {
      question: "Do my credits ever expire?",
      answer:
        "Never. Our model is strictly pay-as-you-go. Unlike predatory monthly SaaS tiers that wipe your unused credits every 30 days, your credits stay safely in your account forever.",
    },
    {
      question: "Which social media platforms are supported?",
      answer:
        "Every major vertical platform is natively supported: TikTok, Instagram Reels, YouTube Shorts, LinkedIn Video, and X (Twitter). Every clip is exported with automatic safe margins so text is never covered by native UI buttons.",
    },
    {
      question: "Can I customize the subtitle presets?",
      answer:
        "Yes. Choose between Hormozi high-impact dynamic words, Clean Minimalist modern typography, or Developer Terminal aesthetics. You can preview all presets before downloading.",
    },
    {
      question: "What video sources can I import?",
      answer:
        "You can paste any public or unlisted YouTube video URL, or upload MP4 and MOV files directly from your computer.",
    },
    {
      question: "Is there a free trial before paying?",
      answer:
        "Yes. Every new user receives 10 free credits immediately upon registration. No credit card is required to test the entire processing pipeline.",
    },
  ];

  return (
    <section id="faq" className="border-t border-[var(--linha)] py-20 bg-[#0b0a08]">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="text-center">
          <span className="font-mono text-xs tracking-wider text-[var(--ouro)] uppercase">
            Frequently Asked Questions
          </span>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--marfim)] sm:text-3xl">
            Everything You Need to Know
          </h2>
          <p className="mt-2 text-sm text-[var(--fumaca)]">
            Clear answers about processing, platform formatting, billing, and exports.
          </p>
        </div>

        <div className="mt-10 space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className="overflow-hidden rounded-xl border border-[var(--linha)] bg-[#161310] transition-all duration-200 hover:border-[var(--linha-2)]"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="flex w-full items-center justify-between p-4 text-left text-sm font-medium text-[var(--marfim)] transition-colors hover:text-[var(--ouro)] cursor-pointer"
                  aria-expanded={isOpen}
                >
                  <span>{faq.question}</span>
                  <ChevronDownIcon
                    className={`h-4 w-4 text-[var(--fumaca)] transition-transform duration-200 ${
                      isOpen ? "rotate-180 text-[var(--ouro)]" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="border-t border-[var(--linha)] px-4 py-3.5 text-xs leading-relaxed text-[var(--marfim-2)] bg-[#1d1914]/60">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
