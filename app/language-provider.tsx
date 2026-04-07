"use client";

import { createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";

import {
  FRONTEND_LANGUAGE_COOKIE,
  type FrontendLanguage,
} from "@/lib/frontend-language";

type LanguageContextValue = {
  language: FrontendLanguage;
  isEnglish: boolean;
  setLanguage: (language: FrontendLanguage) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  initialLanguage,
  children,
}: {
  initialLanguage: FrontendLanguage;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [language, setLanguageState] = useState<FrontendLanguage>(initialLanguage);

  function setLanguage(nextLanguage: FrontendLanguage) {
    setLanguageState(nextLanguage);
    document.cookie = `${FRONTEND_LANGUAGE_COOKIE}=${nextLanguage}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  }

  return (
    <LanguageContext.Provider
      value={{
        language,
        isEnglish: language === "en-US",
        setLanguage,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider.");
  }

  return context;
}
