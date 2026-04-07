export const FRONTEND_LANGUAGE_COOKIE = "frontend-language";

export type FrontendLanguage = "pt-BR" | "en-US";

export const DEFAULT_FRONTEND_LANGUAGE: FrontendLanguage = "pt-BR";

export function isFrontendLanguage(value: string | null | undefined): value is FrontendLanguage {
  return value === "pt-BR" || value === "en-US";
}

export function pickLanguage<T>(language: FrontendLanguage, values: { pt: T; en: T }): T {
  return language === "en-US" ? values.en : values.pt;
}
