import Link from "next/link";
import type { Resource } from "@/types";
import type { Translator } from "@/i18n/translator";
import { coverageBadgeKey } from "@/lib/resource-coverage";
import { getLocalizedField } from "@/lib/data";
import type { Locale } from "@/i18n/types";

interface ResourceCardProps {
  resource: Resource;
  t: Translator["t"];
  locale: Locale;
  searchParams?: string;
}

export function ResourceCard({ resource, t, locale, searchParams }: ResourceCardProps) {
  const description = getLocalizedField(locale, resource.description, resource.description_es);
  const coverageKey = coverageBadgeKey(resource);
  const coverageLabels = {
    local: t("resources.coverageLocal"),
    regional: t("resources.coverageRegional"),
    statewide: t("resources.coverageStatewide"),
  } as const;
  const coverageLabel = coverageLabels[coverageKey];
  const href = `/resources/${resource.id}${searchParams ? `?back=${encodeURIComponent(searchParams)}` : ""}`;
  const location = [resource.city, resource.county].filter(Boolean).join(", ");

  return (
    <article className="card flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">
          <Link
            href={href}
            className="hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {resource.name}
          </Link>
        </h2>
        {resource.category && (
          <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-sm font-medium text-slate-800">
            {resource.category.name}
          </span>
        )}
      </div>

      {location && <p className="text-sm text-slate-600">{location}</p>}

      <p className="line-clamp-2 text-base text-slate-700">{description}</p>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-md border border-brand-200 bg-brand-50 px-2 py-1 font-medium text-brand-800">
          {coverageLabel}
        </span>
        {resource.phone && (
          <a
            href={`tel:${resource.phone.replace(/[^\d+]/g, "")}`}
            className="text-brand-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {resource.phone}
          </a>
        )}
      </div>

      <Link href={href} className="btn-secondary mt-auto w-fit">
        {t("resources.viewDetails")}
      </Link>
    </article>
  );
}
