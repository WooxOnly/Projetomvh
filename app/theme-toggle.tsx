"use client";

import { ButtonLabel } from "@/app/button-icon";
import { useLanguage } from "@/app/language-provider";
import { useTheme } from "@/app/theme-provider";

export function ThemeToggle() {
  const { isEnglish } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="theme-toggle-button rounded-full px-3 py-1.5 text-xs font-medium transition"
      aria-label={isEnglish ? "Toggle color theme" : "Alternar tema de cores"}
      title={
        theme === "dark"
          ? isEnglish
            ? "Switch to light mode"
            : "Mudar para modo claro"
          : isEnglish
            ? "Switch to dark mode"
            : "Mudar para modo escuro"
      }
    >
      <ButtonLabel icon={theme === "dark" ? "theme-light" : "theme-dark"} className="gap-1.5">
        {theme === "dark"
          ? isEnglish
            ? "LIGHT"
            : "CLARO"
          : isEnglish
            ? "DARK"
            : "ESCURO"}
      </ButtonLabel>
    </button>
  );
}
