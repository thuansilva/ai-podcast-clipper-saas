import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";

import { AppSidebar } from "~/components/dashboard/sidebar/app-sidebar";
import { SupportCard } from "~/components/dashboard/sidebar/support-card";
import { SidebarProvider } from "~/components/ui/sidebar";
import { TooltipProvider } from "~/components/ui/tooltip";
import { APP_CONFIG } from "~/config/app-config";

beforeAll(() => {
  // useIsMobile (usado pelo SidebarProvider) depende de window.matchMedia,
  // que não existe no jsdom por padrão.
  const noop = () => undefined;

  window.matchMedia =
    window.matchMedia ??
    ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: noop,
      removeEventListener: noop,
      addListener: noop,
      removeListener: noop,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList);
});

describe("Branding do dashboard (rebranding do template de terceiros)", () => {
  it("APP_CONFIG não deve mais referenciar o template 'Studio Admin'", () => {
    expect(APP_CONFIG.name).toBe("Podcast Clipper");
    expect(APP_CONFIG.copyright).not.toMatch(/Studio Admin/i);
    expect(APP_CONFIG.meta.title).not.toMatch(/Studio Admin/i);
    expect(APP_CONFIG.meta.description).not.toMatch(/Studio Admin/i);
    expect(APP_CONFIG.meta.description).not.toMatch(
      /open-source dashboard starter template/i,
    );
  });

  it("a sidebar do dashboard deve exibir 'Podcast Clipper' e nunca 'Studio Admin'", () => {
    render(
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </TooltipProvider>,
    );

    expect(screen.getByText("Podcast Clipper")).toBeInTheDocument();
    expect(screen.queryByText(/Studio Admin/i)).not.toBeInTheDocument();
  });

  it("o support card não deve conter links para o perfil pessoal do autor do template (arhamkhnz)", () => {
    render(<SupportCard />);

    const links = screen.getAllByRole("link");
    for (const link of links) {
      expect(link.getAttribute("href")).not.toMatch(/arhamkhnz/i);
    }
  });

  it("o support card deve apontar para um e-mail de suporte (mailto) com texto genérico", () => {
    render(<SupportCard />);

    const emailLink = screen.getByRole("link", { name: /suporte/i });
    expect(emailLink.getAttribute("href")).toMatch(/^mailto:/);
    expect(screen.queryByText(/Have something in mind\?/i)).not.toBeInTheDocument();
  });
});
