"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Verificar tema atual aplicado no documento ou salvo no localStorage
    const saved = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
    const currentAttr = document.documentElement.getAttribute("data-theme");
    const initialTheme: "dark" | "light" =
      saved === "light" || currentAttr === "light" ? "light" : "dark";

    setTheme(initialTheme);
    document.documentElement.setAttribute("data-theme", initialTheme);
    if (initialTheme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    }

    const handleThemeChange = () => {
      const activeAttr = document.documentElement.getAttribute("data-theme");
      if (activeAttr === "light" || activeAttr === "dark") {
        setTheme(activeAttr);
      }
    };

    window.addEventListener("theme-change", handleThemeChange);
    return () => window.removeEventListener("theme-change", handleThemeChange);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);

    try {
      localStorage.setItem("theme", nextTheme);
    } catch {}

    document.documentElement.setAttribute("data-theme", nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    }

    window.dispatchEvent(new Event("theme-change"));
  };

  const isDark = mounted ? theme === "dark" : true;

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
