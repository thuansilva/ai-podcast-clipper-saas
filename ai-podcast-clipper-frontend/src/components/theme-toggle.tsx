"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

function applyThemeToDocument(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
    document.documentElement.classList.remove("light");
  } else {
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
  }
}

// Lê o tema atualmente aplicado no <html> — a fonte da verdade é o DOM (um
// sistema externo ao React), não um estado React duplicado.
function getSnapshot(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

// No servidor não há `document`; assume-se escuro (mesmo default que antes,
// quando `mounted` era `false`).
function getServerSnapshot(): Theme {
  return "dark";
}

function subscribeToThemeChange(onStoreChange: () => void) {
  window.addEventListener("theme-change", onStoreChange);
  return () => window.removeEventListener("theme-change", onStoreChange);
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  // `useSyncExternalStore` é o hook feito para sincronizar com um sistema
  // externo mutável (aqui, o atributo `data-theme` do <html>, compartilhado
  // entre múltiplas instâncias deste componente via o evento
  // "theme-change"). Substitui o antigo par `useState(theme)` +
  // `useState(mounted)` sincronizados via useEffect com `setState` síncrono
  // no corpo do efeito — desencorajado por
  // https://react.dev/reference/eslint-plugin-react-hooks/rules/set-state-in-effect.
  const theme = useSyncExternalStore(
    subscribeToThemeChange,
    getSnapshot,
    getServerSnapshot,
  );

  // Efeito legítimo: na primeira montagem no client, lê a preferência
  // persistida (localStorage) e aplica no documento. Isso é uma
  // sincronização genuína com sistemas externos ao React (DOM + storage do
  // navegador) — não há nenhum `setState` síncrono aqui; a UI é atualizada
  // através do evento "theme-change", que o `useSyncExternalStore` acima já
  // está inscrito para ouvir.
  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? localStorage.getItem("theme") : null;
    const currentAttr = document.documentElement.getAttribute("data-theme");
    const initialTheme: Theme =
      saved === "light" || currentAttr === "light" ? "light" : "dark";

    applyThemeToDocument(initialTheme);
    window.dispatchEvent(new Event("theme-change"));
  }, []);

  const toggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";

    try {
      localStorage.setItem("theme", nextTheme);
    } catch {}

    applyThemeToDocument(nextTheme);
    window.dispatchEvent(new Event("theme-change"));
  };

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`cmd-icon-btn flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--linha-2)] bg-transparent text-[var(--marfim-2)] transition-colors hover:border-[var(--ouro)]/40 hover:bg-[var(--superficie-2)] hover:text-[var(--marfim)] cursor-pointer ${className}`}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? (
        <Moon className="h-4 w-4 transition-transform hover:-rotate-12 text-[var(--marfim)]" />
      ) : (
        <Sun className="h-4 w-4 transition-transform hover:rotate-45 text-[var(--ouro)]" />
      )}
    </button>
  );
}
