"use client";

import { useLanguage } from "@/app/language-provider";

export function LanguageSwitcher() {
  const { language, isEnglish, setLanguage } = useLanguage();

  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1">
      <button
        type="button"
        onClick={() => setLanguage("pt-BR")}
        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
          !isEnglish
            ? "bg-cyan-300 text-slate-950"
            : "text-slate-300 hover:bg-white/8 hover:text-white"
        }`}
      >
        Português
      </button>
      <button
        type="button"
        onClick={() => setLanguage("en-US")}
        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
          isEnglish
            ? "bg-cyan-300 text-slate-950"
            : "text-slate-300 hover:bg-white/8 hover:text-white"
        }`}
      >
        English
      </button>
      <span className="sr-only">{language}</span>
    </div>
  );
}
