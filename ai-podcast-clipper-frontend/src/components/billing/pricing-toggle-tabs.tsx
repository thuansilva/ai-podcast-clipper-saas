"use client";

import { Sparkles, Zap } from "lucide-react";
import { cn } from "~/lib/utils";

export type PricingTab = "monthly" | "annual";

export interface PricingToggleTabsProps {
  activeTab?: PricingTab;
  onTabChange?: (tab: PricingTab) => void;
  value?: PricingTab;
  onValueChange?: (tab: PricingTab) => void;
  className?: string;
}

export function PricingToggleTabs({
  activeTab: propActiveTab,
  onTabChange,
  value: propValue,
  onValueChange,
  className,
}: PricingToggleTabsProps) {
  const currentTab = propValue ?? propActiveTab ?? "monthly";

  const handleSelect = (tab: PricingTab) => {
    onTabChange?.(tab);
    onValueChange?.(tab);
  };

  return (
    <div
      role="tablist"
      aria-label="Modalidade de Faturamento"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-2xl border border-[var(--linha)] bg-[var(--superficie-2)] p-1.5 shadow-inner",
        className,
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={currentTab === "monthly"}
        onClick={() => handleSelect("monthly")}
        className={cn(
          "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all duration-200 cursor-pointer select-none",
          currentTab === "monthly"
            ? "bg-[var(--ouro)] text-[var(--tinta)] shadow-[0_0_18px_rgba(232,186,82,0.25)]"
            : "text-[var(--fumaca)] hover:text-[var(--marfim)] hover:bg-[var(--superficie)]",
        )}
      >
        <Zap className="size-3.5" />
        <span>Mensal</span>
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={currentTab === "annual"}
        onClick={() => handleSelect("annual")}
        className={cn(
          "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all duration-200 cursor-pointer select-none",
          currentTab === "annual"
            ? "bg-[var(--ouro)] text-[var(--tinta)] shadow-[0_0_18px_rgba(232,186,82,0.25)]"
            : "text-[var(--fumaca)] hover:text-[var(--marfim)] hover:bg-[var(--superficie)]",
        )}
      >
        <Sparkles className="size-3.5" />
        <span>Anual</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono",
            currentTab === "annual"
              ? "bg-[var(--tinta)]/15 text-[var(--tinta)]"
              : "bg-[var(--ouro)]/15 text-[var(--ouro)]",
          )}
        >
          Economize 30%
        </span>
      </button>
    </div>
  );
}
