export const studioClerkAppearance = {
  variables: {
    colorPrimary: "#e8ba52",
    colorTextOnPrimaryBackground: "#0b0a08",
    colorBackground: "#161310",
    colorInputBackground: "#0b0a08",
    colorInputText: "#f5f1e8",
    colorText: "#f5f1e8",
    colorTextSecondary: "#8f8674",
    colorNeutral: "#f5f1e8",
    colorBorder: "rgba(224, 203, 163, 0.14)",
    borderRadius: "0.75rem",
    fontFamily: "var(--font-geist-sans), sans-serif",
  },
  elements: {
    card: "bg-[#161310] border border-[var(--linha)] shadow-[0_0_40px_rgba(0,0,0,0.8)] rounded-2xl p-6 sm:p-8",
    headerTitle: "text-[var(--marfim)] font-semibold tracking-tight text-xl",
    headerSubtitle: "text-[var(--fumaca)] text-sm",
    socialButtonsBlockButton:
      "bg-[#0b0a08] hover:bg-[#1d1914] border border-[var(--linha)] text-[var(--marfim)] transition-colors py-2.5 rounded-full cursor-pointer",
    socialButtonsBlockButtonText: "text-[var(--marfim)] font-medium text-sm",
    formButtonPrimary:
      "btn-ouro !w-full !py-2.5 !text-sm",
    formFieldLabel: "text-[var(--marfim-2)] text-xs font-medium uppercase tracking-wider mb-1.5",
    formFieldInput:
      "bg-[#0b0a08] border border-[var(--linha)] focus:border-[var(--ouro)] text-[var(--marfim)] placeholder:text-[var(--fumaca)] transition-colors py-2 px-3 rounded-lg",
    footerActionLink: "text-[var(--ouro)] hover:underline underline-offset-4 text-xs",
    footer: "bg-transparent border-t border-[var(--linha)] pt-4",
    dividerLine: "bg-[var(--linha)]",
    dividerText: "text-[var(--fumaca)] text-[11px] uppercase tracking-wider",
  },
};
