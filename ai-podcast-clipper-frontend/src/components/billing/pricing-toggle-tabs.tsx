"use client";

import { useRef } from "react";
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

const TABS: readonly PricingTab[] = ["monthly", "annual"];

export function PricingToggleTabs({
  activeTab: propActiveTab,
  onTabChange,
  value: propValue,
  onValueChange,
  className,
}: PricingToggleTabsProps) {
  const currentTab = propValue ?? propActiveTab ?? "monthly";
  const tabRefs = useRef<Record<PricingTab, HTMLButtonElement | null>>({
    monthly: null,
    annual: null,
  });

  const handleSelect = (tab: PricingTab) => {
    onTabChange?.(tab);
    onValueChange?.(tab);
  };

  // Padrão WAI-ARIA tabs: setas trocam de aba (com foco), Home/End vão às pontas.
  // Só a aba selecionada fica no Tab order (roving tabindex), WCAG 2.1.1.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tab: PricingTab) => {
    const index = TABS.indexOf(tab);
    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowRight":
        nextIndex = (index + 1) % TABS.length;
        break;
      case "ArrowLeft":
        nextIndex = (index - 1 + TABS.length) % TABS.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = TABS.length - 1;
        break;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = TABS[nextIndex]!;
    handleSelect(nextTab);
    tabRefs.current[nextTab]?.focus();
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
        tabIndex={currentTab === "monthly" ? 0 : -1}
        ref={(el) => {
          tabRefs.current.monthly = el;
        }}
        onClick={() => handleSelect("monthly")}
        onKeyDown={(event) => handleKeyDown(event, "monthly")}
        className={cn(
          "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all duration-200 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ouro)]",
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
        tabIndex={currentTab === "annual" ? 0 : -1}
        ref={(el) => {
          tabRefs.current.annual = el;
        }}
        onClick={() => handleSelect("annual")}
        onKeyDown={(event) => handleKeyDown(event, "annual")}
        className={cn(
          "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all duration-200 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ouro)]",
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
