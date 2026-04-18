"use client";

import { useLanguage } from "@/app/language-provider";

export function LanguageSwitcher() {
  const { language, isEnglish, setLanguage } = useLanguage();

  return (
    <div className="theme-pill-group flex items-center gap-1 rounded-full p-1">
      <button
        type="button"
        onClick={() => setLanguage("pt-BR")}
        aria-label="Português"
        title="Português"
        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
          !isEnglish ? "theme-pill-active text-slate-950" : "theme-pill-button"
        }`}
      >
        <span className="text-sm leading-none" aria-hidden="true">
          🇧🇷
        </span>
      </button>
      <button
        type="button"
        onClick={() => setLanguage("en-US")}
        aria-label="English"
        title="English"
        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
          isEnglish ? "theme-pill-active text-slate-950" : "theme-pill-button"
        }`}
      >
        <span className="text-sm leading-none" aria-hidden="true">
          🇺🇸
        </span>
      </button>
      <span className="sr-only">{language}</span>
    </div>
  );
}
