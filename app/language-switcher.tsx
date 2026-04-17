"use client";

import { ButtonLabel } from "@/app/button-icon";
import { useLanguage } from "@/app/language-provider";

export function LanguageSwitcher() {
  const { language, isEnglish, setLanguage } = useLanguage();

  return (
    <div className="theme-pill-group flex items-center gap-2 rounded-full p-1">
      <button
        type="button"
        onClick={() => setLanguage("pt-BR")}
        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
          !isEnglish
            ? "theme-pill-active text-slate-950"
            : "theme-pill-button"
        }`}
      >
        <ButtonLabel icon="language" className="gap-1.5">
          Português
        </ButtonLabel>
      </button>
      <button
        type="button"
        onClick={() => setLanguage("en-US")}
        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
          isEnglish
            ? "theme-pill-active text-slate-950"
            : "theme-pill-button"
        }`}
      >
        <ButtonLabel icon="language" className="gap-1.5">
          English
        </ButtonLabel>
      </button>
      <span className="sr-only">{language}</span>
    </div>
  );
}
