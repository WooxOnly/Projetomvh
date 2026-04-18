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
        className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-base leading-none transition ${
          !isEnglish ? "theme-pill-active text-slate-950" : "theme-pill-button"
        }`}
      >
        <span aria-hidden="true">🇧🇷</span>
      </button>
      <button
        type="button"
        onClick={() => setLanguage("en-US")}
        aria-label="English"
        title="English"
        className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-base leading-none transition ${
          isEnglish ? "theme-pill-active text-slate-950" : "theme-pill-button"
        }`}
      >
        <span aria-hidden="true">🇺🇸</span>
      </button>
      <span className="sr-only">{language}</span>
    </div>
  );
}
