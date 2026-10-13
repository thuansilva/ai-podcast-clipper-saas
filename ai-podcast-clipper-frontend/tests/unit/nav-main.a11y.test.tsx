import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { NavMain } from "~/components/dashboard/sidebar/nav-main";
import { SidebarProvider } from "~/components/ui/sidebar";
import { TooltipProvider } from "~/components/ui/tooltip";
import type { NavGroup } from "~/navigation/sidebar/sidebar-items";

const currentPath = vi.hoisted(() => ({ value: "/dashboard/billing" }));

vi.mock("next/navigation", () => ({
  usePathname: () => currentPath.value,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const items: NavGroup[] = [
  {
    id: 1,
    label: "Principal",
    items: [
      { id: "overview", title: "Visão Geral", url: "/dashboard" },
      { id: "billing", title: "Cobrança", url: "/dashboard/billing" },
      {
        id: "projects",
        title: "Projetos",
        subItems: [
          { id: "p-1", title: "Projeto Um", url: "/dashboard/projects/1" },
          { id: "p-2", title: "Projeto Dois", url: "/dashboard/projects/2" },
        ],
      },
    ],
  },
];

function renderNav() {
  return render(
    <TooltipProvider>
      <SidebarProvider>
        <NavMain items={items} />
      </SidebarProvider>
    </TooltipProvider>,
  );
}

describe("NavMain - Accessibility (WCAG 2.1 AA)", () => {
  beforeAll(() => {
    // useIsMobile() do sidebar consulta matchMedia, que o jsdom não implementa.
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
  });

  it("o link da rota atual expõe aria-current=\"page\" (WCAG 1.3.1 / 4.1.2)", () => {
    currentPath.value = "/dashboard/billing";
    renderNav();

    const billing = screen.getByRole("link", { name: /cobrança/i });
    expect(billing).toHaveAttribute("aria-current", "page");
  });

  it("links de rotas não atuais não expõem aria-current", () => {
    currentPath.value = "/dashboard/billing";
    renderNav();

    const overview = screen.getByRole("link", { name: /visão geral/i });
    expect(overview).not.toHaveAttribute("aria-current");
  });

  it("o subitem ativo dentro de um grupo expandido expõe aria-current=\"page\"", () => {
    currentPath.value = "/dashboard/projects/2";
    renderNav();

    const active = screen.getByRole("link", { name: "Projeto Dois" });
    expect(active).toHaveAttribute("aria-current", "page");

    const inactive = screen.getByRole("link", { name: "Projeto Um" });
    expect(inactive).not.toHaveAttribute("aria-current");
  });
});
