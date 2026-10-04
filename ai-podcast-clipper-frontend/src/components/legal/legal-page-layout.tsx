import { Header } from "~/components/landing/header";
import { Footer } from "~/components/landing/footer";

interface LegalPageLayoutProps {
  isAuthenticated: boolean;
  title: string;
  lastUpdatedLabel: string;
  children: React.ReactNode;
}

/**
 * Layout compartilhado pelas páginas legais (Termos de Uso, Política de
 * Privacidade, Política de Reembolso e Contato). Mantém o mesmo Header/Footer
 * do resto do app e aplica uma tipografia de leitura longa consistente.
 */
export function LegalPageLayout({
  isAuthenticated,
  title,
  lastUpdatedLabel,
  children,
}: LegalPageLayoutProps) {
  return (
    <div className="relative min-h-screen bg-[var(--tinta)] text-[var(--marfim)] selection:bg-[var(--ouro)]/20 selection:text-[var(--ouro)]">
      <div className="relative z-10 flex min-h-screen flex-col">
        <Header isAuthenticated={isAuthenticated} />
        <main className="flex-1">
          <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
            <header className="mb-10 space-y-2 border-b border-[var(--linha)] pb-8">
              <h1 className="text-3xl font-semibold tracking-tight text-[var(--marfim)]">
                {title}
              </h1>
              <p className="font-mono text-xs text-[var(--fumaca)]">
                {lastUpdatedLabel}
              </p>
            </header>

            <div className="space-y-8 text-sm leading-relaxed text-[var(--marfim-2)] [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-[var(--marfim)] [&_section]:space-y-3 [&_a]:text-[var(--ouro)] [&_a]:underline [&_a]:underline-offset-4 [&_strong]:text-[var(--marfim)] [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
              {children}
            </div>
          </article>
        </main>
        <Footer />
      </div>
    </div>
  );
}
