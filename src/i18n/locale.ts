import { cookies } from "next/headers";
import type { Locale } from "./types";

export const LOCALE_COOKIE = "reentry_locale";

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const value = cookieStore.get(LOCALE_COOKIE)?.value;
  return value === "es" ? "es" : "en";
}
