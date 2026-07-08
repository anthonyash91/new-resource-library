import Link from "next/link";
import { LanguageSwitcher } from "./LanguageSwitcher";
import type { Locale } from "@/i18n/types";

interface SiteHeaderProps {
  locale: Locale;
  labels: {
    siteName: string;
    resources: string;
    about: string;
    language: string;
    english: string;
    spanish: string;
  };
}

export function SiteHeader({ locale, labels }: SiteHeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <Link
          href="/"
          className="text-xl font-semibold text-brand-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {labels.siteName}
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-2">
          <Link href="/resources" className="min-h-11 inline-flex items-center rounded-lg px-3 font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
            {labels.resources}
          </Link>
          <Link href="/about" className="min-h-11 inline-flex items-center rounded-lg px-3 font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
            {labels.about}
          </Link>
          <LanguageSwitcher
            locale={locale}
            labels={{
              language: labels.language,
              english: labels.english,
              spanish: labels.spanish,
            }}
          />
        </nav>
      </div>
    </header>
  );
}
