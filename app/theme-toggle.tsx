"use client";

import { useLanguage } from "@/app/language-provider";
import { useTheme } from "@/app/theme-provider";

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
      <circle cx="10" cy="10" r="3.3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M10 1.8v2.1M10 16.1v2.1M18.2 10h-2.1M3.9 10H1.8M15.8 4.2l-1.5 1.5M5.7 14.3l-1.5 1.5M15.8 15.8l-1.5-1.5M5.7 5.7 4.2 4.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ThemeToggle() {
  const { isEnglish } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLight}
      onClick={toggleTheme}
      className="theme-toggle-button relative inline-grid h-10 w-[4.75rem] grid-cols-2 items-center rounded-full px-1"
      aria-label={isEnglish ? "Toggle color theme" : "Alternar tema de cores"}
      title={
        isLight
          ? isEnglish
            ? "Switch to dark mode"
            : "Mudar para modo escuro"
          : isEnglish
            ? "Switch to light mode"
            : "Mudar para modo claro"
      }
    >
      <span
        aria-hidden="true"
        className={`absolute top-1/2 h-8 w-8 -translate-y-1/2 rounded-full transition-[left] duration-200 ${
          isLight ? "bg-sky-500 text-white" : "bg-slate-950/80 text-slate-100"
        }`}
        style={{ left: isLight ? "2.5625rem" : "0.1875rem" }}
      />
      <span className="relative z-10 flex h-full items-center justify-center text-slate-500">
        <span className={isLight ? "text-slate-400" : "text-slate-100"}>
          <MoonIcon />
        </span>
      </span>
      <span className="relative z-10 flex h-full items-center justify-center text-slate-500">
        <span className={isLight ? "text-white" : "text-slate-400"}>
          <SunIcon />
        </span>
      </span>
    </button>
  );
}
