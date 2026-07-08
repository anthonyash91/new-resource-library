import Link from "next/link";
import { notFound } from "next/navigation";
import { getResourceById, getLocalizedField } from "@/lib/data";
import { getLocale } from "@/i18n/locale";
import { createTranslator } from "@/i18n/translator";
import { coverageBadgeKey, formatServedCounties, shouldShowCountiesServed } from "@/lib/resource-coverage";

interface ResourceDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function mapsUrl(address: string, city?: string | null, state?: string | null): string {
  const q = [address, city, state].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export default async function ResourceDetailPage({ params, searchParams }: ResourceDetailPageProps) {
  const { id } = await params;
  const rawSearch = await searchParams;
  const backQs = param(rawSearch.back) ?? "";
  const backHref = `/resources${backQs ? `?${backQs}` : ""}`;

  const resource = await getResourceById(id);
  if (!resource) notFound();

  const locale = await getLocale();
  const { t } = createTranslator(locale);

  const description = getLocalizedField(locale, resource.description, resource.description_es);
  const eligibility = getLocalizedField(locale, resource.eligibility, resource.eligibility_es);
  const notes = getLocalizedField(locale, resource.notes, resource.notes_es);
  const coverageKey = coverageBadgeKey(resource);
  const coverageLabels = {
    local: t("resources.coverageLocal"),
    regional: t("resources.coverageRegional"),
    statewide: t("resources.coverageStatewide"),
  } as const;
  const location = [resource.city, resource.county, resource.state].filter(Boolean).join(", ");

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <Link
        href={backHref}
        className="min-h-11 inline-flex items-center text-brand-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        ← {t("resources.backToResults")}
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {resource.category && (
            <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-sm font-medium text-slate-800">
              {resource.category.name}
            </span>
          )}
          <span className="rounded-md border border-brand-200 bg-brand-50 px-2 py-1 text-sm font-medium text-brand-800">
            {coverageLabels[coverageKey]}
          </span>
        </div>
        <h1 className="text-3xl font-bold text-slate-900">{resource.name}</h1>
        {location && <p className="text-lg text-slate-600">{location}</p>}
      </header>

      <section className="prose prose-slate max-w-none">
        <p className="text-base leading-relaxed text-slate-800">{description}</p>
      </section>

      {eligibility && (
        <section className="card">
          <h2 className="text-lg font-semibold text-slate-900">{t("detail.eligibility")}</h2>
          <p className="mt-2 text-base text-slate-700">{eligibility}</p>
        </section>
      )}

      {notes && (
        <section className="card">
          <h2 className="text-lg font-semibold text-slate-900">{t("detail.goodToKnow")}</h2>
          <p className="mt-2 text-base text-slate-700">{notes}</p>
        </section>
      )}

      {shouldShowCountiesServed(resource) && resource.served_counties && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900">{t("detail.countiesServed")}</h2>
          <p className="mt-2 text-base text-slate-700">
            {formatServedCounties(resource.served_counties, 20)}
          </p>
        </section>
      )}

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">{t("detail.contact")}</h2>
        <dl className="space-y-3 text-base">
          {resource.phone && (
            <div>
              <dt className="font-medium text-slate-700">{t("detail.phone")}</dt>
              <dd>
                <a
                  href={`tel:${resource.phone.replace(/[^\d+]/g, "")}`}
                  className="text-brand-700 underline-offset-2 hover:underline"
                >
                  {resource.phone}
                </a>
              </dd>
            </div>
          )}
          {resource.email && (
            <div>
              <dt className="font-medium text-slate-700">{t("detail.email")}</dt>
              <dd>
                <a href={`mailto:${resource.email}`} className="text-brand-700 underline-offset-2 hover:underline">
                  {resource.email}
                </a>
              </dd>
            </div>
          )}
          {resource.website && (
            <div>
              <dt className="font-medium text-slate-700">{t("detail.website")}</dt>
              <dd>
                <a
                  href={resource.website.startsWith("http") ? resource.website : `https://${resource.website}`}
                  className="break-all text-brand-700 underline-offset-2 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {resource.website}
                </a>
              </dd>
            </div>
          )}
          {resource.address && (
            <div>
              <dt className="font-medium text-slate-700">{t("detail.address")}</dt>
              <dd className="text-slate-800">
                {resource.address}
                {resource.city && `, ${resource.city}`}
                {resource.state && `, ${resource.state}`}
              </dd>
              <dd className="mt-2">
                <a
                  href={mapsUrl(resource.address, resource.city, resource.state)}
                  className="btn-secondary inline-flex"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("detail.getDirections")}
                </a>
              </dd>
            </div>
          )}
          {resource.hours && (
            <div>
              <dt className="font-medium text-slate-700">{t("detail.hours")}</dt>
              <dd className="text-slate-800">{resource.hours}</dd>
            </div>
          )}
        </dl>
      </section>

      <aside className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-base text-amber-950">
        {t("detail.disclaimer")}
      </aside>
    </div>
  );
}
