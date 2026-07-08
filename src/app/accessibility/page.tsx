import { getLocale } from "@/i18n/locale";
import { createTranslator } from "@/i18n/translator";

export default async function AccessibilityPage() {
  const locale = await getLocale();
  const { t } = createTranslator(locale);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-slate-900">{t("accessibility.title")}</h1>
      <p className="mt-4 text-base leading-relaxed text-slate-700">{t("accessibility.body")}</p>
    </div>
  );
}
