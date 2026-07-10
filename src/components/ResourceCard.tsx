import Link from "next/link";
import type { Resource } from "@/types";
import type { Translator } from "@/i18n/translator";
import { getResourceCoverageTier } from "@/lib/resource-coverage";
import { CoverageBadge } from "@/components/CoverageBadge";
import { getLocalizedField } from "@/lib/localized-field";
import type { Locale } from "@/i18n/types";

interface ResourceCardProps {
  resource: Resource;
  t: Translator["t"];
  locale: Locale;
  searchParams?: string;
  selectedCounty?: string;
}

export function ResourceCard({
  resource,
  t,
  locale,
  searchParams,
  selectedCounty,
}: ResourceCardProps) {
  const description = getLocalizedField(locale, resource.description, resource.description_es);
  const tier = getResourceCoverageTier(resource, selectedCounty);
  const coverageLabels = {
    local: t("resources.coverageLocal"),
    regional: t("resources.coverageRegional"),
    statewide: t("resources.coverageStatewide"),
  } as const;
  const href = `/resources/${resource.id}${searchParams ? `?back=${encodeURIComponent(searchParams)}` : ""}`;
  const location = [resource.city, resource.county].filter(Boolean).join(", ");

  const regionalNote =
    tier === "regional" && resource.county && selectedCounty
      ? t("resources.coverageOfficeIn", { county: resource.county })
      : null;

  return (
    <article className="card flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <CoverageBadge tier={tier} label={coverageLabels[tier]} />
        {resource.category && (
          <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-sm font-medium text-slate-800">
            {resource.category.name}
          </span>
        )}
      </div>

      <h2 className="text-lg font-semibold text-slate-900">
        <Link
          href={href}
          className="hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {resource.name}
        </Link>
      </h2>

      {location && <p className="text-sm text-slate-600">{location}</p>}
      {regionalNote && (
        <p className="text-sm font-medium text-amber-900">{regionalNote}</p>
      )}

      <p className="line-clamp-2 text-base text-slate-700">{description}</p>

      {resource.phone && (
        <p className="text-sm">
          <a
            href={`tel:${resource.phone.replace(/[^\d+]/g, "")}`}
            className="text-brand-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {resource.phone}
          </a>
        </p>
      )}

      <Link href={href} className="btn-secondary mt-auto w-fit">
        {t("resources.viewDetails")}
      </Link>
    </article>
  );
}
