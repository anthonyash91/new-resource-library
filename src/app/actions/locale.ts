"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "@/i18n/locale";
import type { Locale } from "@/i18n/types";

export async function setLocale(locale: Locale) {
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
