import { describe, expect, it } from "vitest";
import { sidebarItems } from "~/navigation/sidebar/sidebar-items";

// Estrutura real do menu lateral (também alimenta a busca do header —
// `search-dialog.tsx` agrupa os resultados pelo `label` do grupo).
describe("sidebarItems", () => {
  it("agrupa Início e Meus Projetos em 'Geral' e Assinatura em 'Configurações'", () => {
    const structure = sidebarItems.map((group) => ({
      label: group.label,
      items: group.items.map((item) => item.id),
    }));

    expect(structure).toEqual([
      { label: "Geral", items: ["overview", "projects"] },
      { label: "Configurações", items: ["billing"] },
    ]);
  });

  it("mantém 'Meus Projetos' apontando para /dashboard/projects", () => {
    const projects = sidebarItems
      .flatMap((group) => group.items)
      .find((item) => item.id === "projects");

    expect(projects).toMatchObject({ title: "Meus Projetos", url: "/dashboard/projects" });
  });

  it("não tem ids de grupo duplicados", () => {
    const ids = sidebarItems.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
