"use client";

import { useLanguage } from "@/app/language-provider";

function BrazilFlag() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] overflow-hidden rounded-full" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#1F8B4C" />
      <path d="M12 4.7 18.2 12 12 19.3 5.8 12 12 4.7Z" fill="#F4C542" />
      <circle cx="12" cy="12" r="3.2" fill="#21468B" />
      <path d="M8.8 11.2c1.3-.9 4.5-1 6.5.2" stroke="#fff" strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  );
}

function UsaFlag() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] overflow-hidden rounded-full" aria-hidden="true">
      <defs>
        <clipPath id="usa-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#usa-clip)">
        <rect width="24" height="24" fill="#fff" />
        <rect y="0" width="24" height="2.2" fill="#B22234" />
        <rect y="4.4" width="24" height="2.2" fill="#B22234" />
        <rect y="8.8" width="24" height="2.2" fill="#B22234" />
        <rect y="13.2" width="24" height="2.2" fill="#B22234" />
        <rect y="17.6" width="24" height="2.2" fill="#B22234" />
        <rect y="22" width="24" height="2.2" fill="#B22234" />
        <rect width="10.8" height="10.2" fill="#3C3B6E" />
        <g fill="#fff">
          <circle cx="2.1" cy="2.1" r="0.5" />
          <circle cx="4.7" cy="2.1" r="0.5" />
          <circle cx="7.3" cy="2.1" r="0.5" />
          <circle cx="2.1" cy="4.4" r="0.5" />
          <circle cx="4.7" cy="4.4" r="0.5" />
          <circle cx="7.3" cy="4.4" r="0.5" />
          <circle cx="2.1" cy="6.7" r="0.5" />
          <circle cx="4.7" cy="6.7" r="0.5" />
          <circle cx="7.3" cy="6.7" r="0.5" />
        </g>
      </g>
    </svg>
  );
}

export function LanguageSwitcher() {
  const { language, isEnglish, setLanguage } = useLanguage();

  return (
    <div className="theme-pill-group flex items-center gap-1 rounded-full p-1">
      <button
        type="button"
        onClick={() => setLanguage("pt-BR")}
        aria-label="Português"
        title="Português"
        className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition ${
          !isEnglish ? "theme-pill-active text-slate-950" : "theme-pill-button"
        }`}
      >
        <BrazilFlag />
      </button>
      <button
        type="button"
        onClick={() => setLanguage("en-US")}
        aria-label="English"
        title="English"
        className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition ${
          isEnglish ? "theme-pill-active text-slate-950" : "theme-pill-button"
        }`}
      >
        <UsaFlag />
      </button>
      <span className="sr-only">{language}</span>
    </div>
  );
}
