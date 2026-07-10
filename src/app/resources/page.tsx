import { Suspense } from "react";
import { PaginatedResourceResults } from "@/components/PaginatedResourceResults";
import { ResourceFilters } from "@/components/ResourceFilters";
import { ActiveFilterChips } from "@/components/ActiveFilterChips";
import { getCategories, getFilterFacets, queryResources } from "@/lib/data";
import { getLocale } from "@/i18n/locale";
import { createTranslator } from "@/i18n/translator";
import { resourceFiltersSchema, shouldQueryResources, isMalformedZipParam, PAGE_SIZE } from "@/lib/validation";
import type { ResourceQueryResult } from "@/types";

const EMPTY_RESULTS: ResourceQueryResult = {
  resources: [],
  total: 0,
  page: 1,
  pageSize: PAGE_SIZE,
  totalPages: 0,
};

interface ResourcesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ResourcesPage({ searchParams }: ResourcesPageProps) {
  const raw = await searchParams;
  const filters = resourceFiltersSchema.parse({
    q: param(raw.q),
    zip: param(raw.zip),
    state: param(raw.state),
    county: param(raw.county),
    city: param(raw.city),
    category: param(raw.category),
    page: param(raw.page),
    sort: param(raw.sort),
  });

  const locale = await getLocale();
  const { t } = createTranslator(locale);

  const showResults = shouldQueryResources(filters, raw);
  const malformedZip = isMalformedZipParam(raw.zip, filters.zip);

  const [categories, filterFacets, result] = await Promise.all([
    getCategories(),
    getFilterFacets({
      state: filters.state,
      county: filters.county,
      city: filters.city,
      category: filters.category,
    }),
    malformedZip
      ? Promise.resolve({ ...EMPTY_RESULTS, zipNotFound: true })
      : showResults
        ? queryResources({ ...filters, page: 1 })
        : Promise.resolve(EMPTY_RESULTS),
  ]);

  const categoryName = categories.find((c) => c.slug === filters.category)?.name;
  const searchString = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== "" && String(v) !== "1") as [string, string][]
  ).toString();

  const effectiveCounty = filters.county ?? result.resolvedLocation?.county ?? undefined;
  const effectiveState = filters.state ?? result.resolvedLocation?.state ?? undefined;

  const countLabel = showResults
    ? result.total === 1
      ? t("resources.resultsCountOne")
      : t("resources.resultsCount", { count: result.total })
    : t("resources.searchPromptSubtitle");

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t("resources.title")}</h1>
        <p className="mt-2 text-slate-600">{countLabel}</p>
        {result.resolvedLocation && (
          <p className="mt-1 text-sm text-slate-600">
            {result.resolvedLocation.county
              ? t("resources.zipResolvedHintCounty", {
                  zip: result.resolvedLocation.zip,
                  city: result.resolvedLocation.city,
                  state: result.resolvedLocation.state,
                  county: result.resolvedLocation.county,
                })
              : t("resources.zipResolvedHint", {
                  zip: result.resolvedLocation.zip,
                  city: result.resolvedLocation.city,
                  state: result.resolvedLocation.state,
                })}
          </p>
        )}
      </header>

      <Suspense fallback={<div className="card h-40 animate-pulse bg-slate-100" />}>
        <ResourceFilters
          key={[filters.q, filters.zip, filters.state, filters.county, filters.city, filters.category, filters.sort].join("|")}
          labels={{
            filters: t("resources.filters"),
            showFilters: t("resources.showFilters"),
            hideFilters: t("resources.hideFilters"),
            keyword: t("resources.keyword"),
            keywordPlaceholder: t("resources.keywordPlaceholder"),
            zip: t("resources.zip"),
            zipPlaceholder: t("resources.zipPlaceholder"),
            state: t("resources.state"),
            county: t("resources.county"),
            city: t("resources.city"),
            category: t("resources.category"),
            allStates: t("resources.allStates"),
            allCounties: t("resources.allCounties"),
            allCities: t("resources.allCities"),
            allCategories: t("resources.allCategories"),
            searchButton: t("resources.searchButton"),
            searchingLabel: t("resources.searching"),
            sortLabel: t("resources.sortLabel"),
            sortName: t("resources.sortName"),
            sortNewest: t("resources.sortNewest"),
            citiesInCounty: t("resources.citiesInCounty"),
            citiesRegional: t("resources.citiesRegional"),
            cityLocatedIn: t("resources.cityLocatedIn"),
            categoryCounts: t("resources.categoryCounts"),
            selectStateFirst: t("resources.selectStateFirst"),
          }}
          initialFacets={filterFacets}
          initial={filters}
        />
      </Suspense>

      <ActiveFilterChips
        labels={{
          activeFilters: t("resources.activeFilters"),
          clearAll: t("resources.clearAll"),
          keyword: t("resources.keyword"),
          zip: t("resources.zip"),
          state: t("resources.state"),
          county: t("resources.county"),
          city: t("resources.city"),
          category: t("resources.category"),
        }}
        filters={{
          q: filters.q,
          zip: filters.zip,
          state: filters.state,
          county: filters.county,
          city: filters.city,
          category: filters.category,
        }}
        categoryName={categoryName}
      />

      {!showResults ? (
        <div className="card text-center">
          <h2 className="text-xl font-semibold text-slate-900">{t("resources.searchPromptTitle")}</h2>
          <p className="mt-2 text-slate-600">{t("resources.searchPromptBody")}</p>
        </div>
      ) : result.zipNotFound ? (
        <div className="card text-center">
          <h2 className="text-xl font-semibold text-slate-900">{t("resources.zipNotFoundTitle")}</h2>
          <p className="mt-2 text-slate-600">{t("resources.zipNotFoundBody")}</p>
        </div>
      ) : result.resources.length === 0 ? (
        <div className="card text-center">
          <h2 className="text-xl font-semibold text-slate-900">{t("resources.noResultsTitle")}</h2>
          <p className="mt-2 text-slate-600">{t("resources.noResultsBody")}</p>
        </div>
      ) : (
        <>
          <PaginatedResourceResults
            initialResult={result}
            filters={{
              q: filters.q,
              zip: filters.zip,
              state: filters.state,
              county: filters.county,
              city: filters.city,
              category: filters.category,
              sort: filters.sort,
              page: 1,
            }}
            locale={locale}
            searchParams={searchString}
            selectedCounty={effectiveCounty}
            selectedState={effectiveState}
            loadMoreLabel={t("resources.loadMore")}
            loadingLabel={t("resources.loadingMore")}
          />
        </>
      )}
    </div>
  );
}
