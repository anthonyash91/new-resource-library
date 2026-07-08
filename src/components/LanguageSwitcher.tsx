"use client";

import { setLocale } from "@/app/actions/locale";
import type { Locale } from "@/i18n/types";
import { useTransition } from "react";

interface LanguageSwitcherProps {
  locale: Locale;
  labels: {
    language: string;
    english: string;
    spanish: string;
  };
}

export function LanguageSwitcher({ locale, labels }: LanguageSwitcherProps) {
  const [pending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
      window.location.reload();
    });
  }

  return (
    <div className="flex items-center gap-1" role="group" aria-label={labels.language}>
      <button
        type="button"
        onClick={() => switchTo("en")}
        disabled={pending}
        aria-pressed={locale === "en"}
        className={`min-h-11 rounded-lg px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
          locale === "en" ? "bg-brand-100 text-brand-900" : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        {labels.english}
      </button>
      <button
        type="button"
        onClick={() => switchTo("es")}
        disabled={pending}
        aria-pressed={locale === "es"}
        className={`min-h-11 rounded-lg px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
          locale === "es" ? "bg-brand-100 text-brand-900" : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        {labels.spanish}
      </button>
    </div>
  );
}
