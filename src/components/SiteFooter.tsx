import Link from "next/link";
import type { Translator } from "@/i18n/translator";

export function SiteFooter({ t }: { t: Translator["t"] }) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8">
        <p className="max-w-3xl text-base text-slate-700">{t("footer.disclaimer")}</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-4 text-sm">
          <Link href="/about" className="min-h-11 inline-flex items-center text-brand-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
            {t("nav.about")}
          </Link>
          <Link href="/privacy" className="min-h-11 inline-flex items-center text-brand-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
            {t("nav.privacy")}
          </Link>
          <Link href="/accessibility" className="min-h-11 inline-flex items-center text-brand-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
            {t("nav.accessibility")}
          </Link>
        </nav>
        <p className="text-sm text-slate-500">{t("footer.rights", { year })}</p>
      </div>
    </footer>
  );
}
