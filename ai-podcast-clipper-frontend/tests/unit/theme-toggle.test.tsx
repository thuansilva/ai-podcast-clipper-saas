import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeToggle } from "~/components/theme-toggle";

describe("ThemeToggle Component", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("light", "dark");
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("light", "dark");
  });

  it("deve iniciar no modo escuro por padrão quando localStorage estiver vazio", () => {
    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: /switch to light theme|mudar para tema claro/i });
    expect(button).toBeInTheDocument();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("deve alternar para o modo claro ao ser clicado", () => {
    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: /switch to light theme|mudar para tema claro/i });
    fireEvent.click(button);

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("theme")).toBe("light");

    expect(
      screen.getByRole("button", { name: /switch to dark theme|mudar para tema escuro/i }),
    ).toBeInTheDocument();
  });

  it("deve alternar de volta para o modo escuro no segundo clique", () => {
    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: /switch to light theme|mudar para tema claro/i });
    fireEvent.click(button); // vira light
    fireEvent.click(screen.getByRole("button", { name: /switch to dark theme|mudar para tema escuro/i })); // volta dark

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("deve respeitar a preferência salva em localStorage se já for light", () => {
    localStorage.setItem("theme", "light");
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.classList.add("light");

    render(<ThemeToggle />);

    expect(
      screen.getByRole("button", { name: /switch to dark theme|mudar para tema escuro/i }),
    ).toBeInTheDocument();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
