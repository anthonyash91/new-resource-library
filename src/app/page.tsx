import Link from "next/link";
import { HomeSearchForm } from "@/components/HomeSearchForm";
import { getLocale } from "@/i18n/locale";
import { createTranslator } from "@/i18n/translator";

export default async function HomePage() {
  const locale = await getLocale();
  const { t, messages } = createTranslator(locale);
  const steps = messages.home.howItWorks;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <section className="space-y-6 py-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          {t("home.heroTitle")}
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-slate-700">{t("home.heroSubtitle")}</p>
        <div className="flex justify-center">
          <HomeSearchForm
            labels={{
              placeholder: t("home.searchPlaceholder"),
              searchButton: t("home.searchButton"),
            }}
          />
        </div>
        <p>
          <Link href="/resources" className="min-h-11 inline-flex items-center font-medium text-brand-700 underline-offset-2 hover:underline">
            {t("home.browseAll")}
          </Link>
        </p>
      </section>

      <section aria-labelledby="how-it-works" className="card mx-auto max-w-2xl">
        <h2 id="how-it-works" className="text-xl font-semibold text-slate-900">
          {t("home.howItWorksTitle")}
        </h2>
        <ol className="mt-4 list-decimal space-y-3 pl-6 text-base text-slate-700">
          {steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
        </ol>
      </section>
    </div>
  );
}
