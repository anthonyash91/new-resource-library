"use client";

import type { Resource } from "@/types";
import { ResourceCard } from "@/components/ResourceCard";
import { partitionResourcesByCoverageTier } from "@/lib/resource-coverage";
import type { CoverageTierCounts } from "@/types";
import type { Locale } from "@/i18n/types";
import type { Translator } from "@/i18n/translator";

interface ResourceResultsProps {
  resources: Resource[];
  t: Translator["t"];
  locale: Locale;
  searchParams?: string;
  selectedCounty?: string;
  selectedState?: string;
  tierTotals?: CoverageTierCounts;
}

interface ResultsSectionProps {
  id: string;
  heading: string;
  hint?: string;
  resources: Resource[];
  totalInTier?: number;
  t: Translator["t"];
  locale: Locale;
  searchParams?: string;
  selectedCounty?: string;
}

function sectionCountLabel(
  shown: number,
  totalInTier: number | undefined,
  t: Translator["t"]
): string {
  if (totalInTier !== undefined && totalInTier > shown) {
    return t("resources.resultsSectionCount", { shown, total: totalInTier });
  }
  return String(shown);
}

function ResultsSection({
  id,
  heading,
  hint,
  resources,
  totalInTier,
  t,
  locale,
  searchParams,
  selectedCounty,
}: ResultsSectionProps) {
  if (!resources.length) return null;

  return (
    <section aria-labelledby={id} className="space-y-4">
      <div>
        <h2 id={id} className="text-xl font-semibold text-slate-900">
          {heading}{" "}
          <span className="text-base font-normal text-slate-500">
            ({sectionCountLabel(resources.length, totalInTier, t)})
          </span>
        </h2>
        {hint && <p className="mt-1 text-base text-slate-600">{hint}</p>}
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {resources.map((resource) => (
          <li key={resource.id}>
            <ResourceCard
              resource={resource}
              t={t}
              locale={locale}
              searchParams={searchParams}
              selectedCounty={selectedCounty}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ResourceResults({
  resources,
  t,
  locale,
  searchParams,
  selectedCounty,
  selectedState,
  tierTotals,
}: ResourceResultsProps) {
  const { local, regional, statewide } = partitionResourcesByCoverageTier(
    resources,
    selectedCounty
  );

  // Local / regional / statewide sections only make sense when a county is selected.
  const showSections = Boolean(selectedCounty?.trim());

  if (!showSections) {
    return (
      <ul className="grid gap-4 sm:grid-cols-2">
        {resources.map((resource) => (
          <li key={resource.id}>
            <ResourceCard
              resource={resource}
              t={t}
              locale={locale}
              searchParams={searchParams}
              selectedCounty={selectedCounty}
            />
          </li>
        ))}
      </ul>
    );
  }

  const county = selectedCounty ?? "";
  const state = selectedState ?? "your state";

  return (
    <div className="space-y-10">
      <ResultsSection
        id="results-local"
        heading={t("resources.resultsLocalHeading")}
        hint={county ? t("resources.resultsLocalHint", { county }) : undefined}
        resources={local}
        totalInTier={tierTotals?.local}
        t={t}
        locale={locale}
        searchParams={searchParams}
        selectedCounty={selectedCounty}
      />
      <ResultsSection
        id="results-regional"
        heading={t("resources.resultsRegionalHeading")}
        hint={county ? t("resources.resultsRegionalHint", { county }) : undefined}
        resources={regional}
        totalInTier={tierTotals?.regional}
        t={t}
        locale={locale}
        searchParams={searchParams}
        selectedCounty={selectedCounty}
      />
      <ResultsSection
        id="results-statewide"
        heading={t("resources.resultsStatewideHeading")}
        hint={t("resources.resultsStatewideHint", { state })}
        resources={statewide}
        totalInTier={tierTotals?.statewide}
        t={t}
        locale={locale}
        searchParams={searchParams}
        selectedCounty={selectedCounty}
      />
    </div>
  );
}
