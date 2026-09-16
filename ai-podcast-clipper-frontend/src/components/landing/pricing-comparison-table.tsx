import React from "react";
import { CheckIcon, MinusIcon } from "lucide-react";

export function PricingComparisonTable() {
  const features = [
    {
      category: "Processing & Limits",
      items: [
        { name: "Credits per Month", starter: "150", pro: "300", enterprise: "Custom" },
        { name: "Max Local Upload Size", starter: "10 GB", pro: "35 GB", enterprise: "Unlimited" },
        { name: "Max Video Length", starter: "15 Minutes", pro: "Unlimited", enterprise: "Unlimited" },
        { name: "Processing Queue", starter: "Standard", pro: "Dedicated (Ultra GPU)", enterprise: "Dedicated (Multi-GPU)" },
      ],
    },
    {
      category: "Artificial Intelligence",
      items: [
        { name: "Smart Viral Cuts", starter: true, pro: true, enterprise: true },
        { name: "Active Face Tracking", starter: true, pro: true, enterprise: true },
        { name: "Auto Thumbnail Generator", starter: false, pro: true, enterprise: true },
        { name: "AI-Optimized Titles & Tags", starter: false, pro: true, enterprise: true },
        { name: "Multi-language (Auto-Translate)", starter: false, pro: true, enterprise: true },
      ],
    },
    {
      category: "Export & Integration",
      items: [
        { name: "Resolution & Quality", starter: "1080p 60fps", pro: "4K 60fps", enterprise: "4K 60fps (ProRes)" },
        { name: "No Watermark", starter: true, pro: true, enterprise: true },
        { name: "Dynamic Caption Templates", starter: "3 Basic", pro: "Unlimited (+ Custom)", enterprise: "Custom Font Upload" },
        { name: "API Access", starter: false, pro: false, enterprise: true },
      ],
    },
  ];

  const renderCheck = (val: string | boolean) => {
    if (typeof val === "boolean") {
      return val ? (
        <CheckIcon className="h-5 w-5 mx-auto text-[var(--patina)]" />
      ) : (
        <MinusIcon className="h-5 w-5 mx-auto text-[var(--fumaca)]" />
      );
    }
    return <span className="text-sm font-medium">{val}</span>;
  };

  return (
    <section className="py-20 bg-[var(--superficie-2)] border-t border-[var(--linha)]" id="comparison">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--marfim)] sm:text-3xl">
            Comprehensive Feature Comparison
          </h2>
          <p className="mt-2 text-sm text-[var(--fumaca)]">
            Explore everything included in each plan.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[var(--linha)] bg-[var(--superficie)] shadow-lg hide-scrollbar">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-[var(--linha)]">
                <th className="p-6 text-sm font-semibold text-[var(--marfim)] w-2/5">Features</th>
                <th className="p-6 text-center text-sm font-semibold text-[var(--marfim)] w-1/5">Starter</th>
                <th className="p-6 text-center text-sm font-bold text-[var(--ouro)] w-1/5">
                  Pro <span className="block text-[10px] font-normal text-[var(--fumaca)] uppercase tracking-widest mt-1">Most Popular</span>
                </th>
                <th className="p-6 text-center text-sm font-semibold text-[var(--marfim)] w-1/5">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {features.map((section, sIdx) => (
                <React.Fragment key={sIdx}>
                  <tr className="border-b border-[var(--linha)] bg-[var(--tinta)]">
                    <td
                      colSpan={4}
                      className="px-6 py-3 text-xs font-bold uppercase tracking-wider text-[var(--patina)]"
                    >
                      {section.category}
                    </td>
                  </tr>
                  {section.items.map((item, iIdx) => (
                    <tr
                      key={iIdx}
                      className="border-b border-[var(--linha)] transition-colors hover:bg-[var(--superficie-2)]"
                    >
                      <td className="p-4 px-6 text-sm text-[var(--marfim-2)] font-medium">
                        {item.name}
                      </td>
                      <td className="p-4 text-center text-[var(--marfim)]">
                        {renderCheck(item.starter)}
                      </td>
                      <td className="p-4 text-center text-[var(--marfim)] bg-[var(--ouro)]/5">
                        {renderCheck(item.pro)}
                      </td>
                      <td className="p-4 text-center text-[var(--marfim)]">
                        {renderCheck(item.enterprise)}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
