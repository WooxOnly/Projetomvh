import { cookies } from "next/headers";

import {
  DEFAULT_FRONTEND_LANGUAGE,
  isFrontendLanguage,
  type FrontendLanguage,
} from "@/lib/frontend-language";

export async function getRequestLanguage(): Promise<FrontendLanguage> {
  const cookieStore = await cookies();
  const language = cookieStore.get("frontend-language")?.value;

  return isFrontendLanguage(language) ? language : DEFAULT_FRONTEND_LANGUAGE;
}
