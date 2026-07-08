import { Suspense } from "react";
import { ResourceCard } from "@/components/ResourceCard";
import { ResourceFilters } from "@/components/ResourceFilters";
import { ActiveFilterChips } from "@/components/ActiveFilterChips";
import { LoadMoreButton } from "@/components/LoadMoreButton";
import { getCategories, getLocationFacets, queryResources } from "@/lib/data";
import { getLocale } from "@/i18n/locale";
import { createTranslator } from "@/i18n/translator";
import { resourceFiltersSchema } from "@/lib/validation";

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
    state: param(raw.state),
    county: param(raw.county),
    city: param(raw.city),
    category: param(raw.category),
    page: param(raw.page),
    sort: param(raw.sort),
  });

  const locale = await getLocale();
  const { t } = createTranslator(locale);

  const [categories, facets, result] = await Promise.all([
    getCategories(),
    getLocationFacets(filters.state, filters.county),
    queryResources(filters),
  ]);

  const categoryName = categories.find((c) => c.slug === filters.category)?.name;
  const searchString = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== "" && String(v) !== "1") as [string, string][]
  ).toString();

  const countLabel =
    result.total === 1
      ? t("resources.resultsCountOne")
      : t("resources.resultsCount", { count: result.total });

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t("resources.title")}</h1>
        <p className="mt-2 text-slate-600">{countLabel}</p>
      </header>

      <Suspense fallback={<div className="card h-40 animate-pulse bg-slate-100" />}>
        <ResourceFilters
          labels={{
            filters: t("resources.filters"),
            showFilters: t("resources.showFilters"),
            hideFilters: t("resources.hideFilters"),
            keyword: t("resources.keyword"),
            keywordPlaceholder: t("resources.keywordPlaceholder"),
            state: t("resources.state"),
            county: t("resources.county"),
            city: t("resources.city"),
            category: t("resources.category"),
            allStates: t("resources.allStates"),
            allCounties: t("resources.allCounties"),
            allCities: t("resources.allCities"),
            allCategories: t("resources.allCategories"),
            searchButton: t("resources.searchButton"),
            sortLabel: t("resources.sortLabel"),
            sortName: t("resources.sortName"),
            sortNewest: t("resources.sortNewest"),
          }}
          categories={categories}
          states={facets.states}
          counties={facets.counties}
          cities={facets.cities}
          initial={filters}
        />
      </Suspense>

      <ActiveFilterChips
        labels={{
          activeFilters: t("resources.activeFilters"),
          clearAll: t("resources.clearAll"),
          keyword: t("resources.keyword"),
          state: t("resources.state"),
          county: t("resources.county"),
          city: t("resources.city"),
          category: t("resources.category"),
        }}
        filters={{
          q: filters.q,
          state: filters.state,
          county: filters.county,
          city: filters.city,
          category: filters.category,
        }}
        categoryName={categoryName}
      />

      {result.resources.length === 0 ? (
        <div className="card text-center">
          <h2 className="text-xl font-semibold text-slate-900">{t("resources.noResultsTitle")}</h2>
          <p className="mt-2 text-slate-600">{t("resources.noResultsBody")}</p>
        </div>
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2">
            {result.resources.map((resource) => (
              <li key={resource.id}>
                <ResourceCard
                  resource={resource}
                  t={t}
                  locale={locale}
                  searchParams={searchString}
                />
              </li>
            ))}
          </ul>
          <LoadMoreButton
            loadMoreLabel={t("resources.loadMore")}
            nextPage={result.page + 1}
            searchParams={{
              q: filters.q,
              state: filters.state,
              county: filters.county,
              city: filters.city,
              category: filters.category,
              sort: filters.sort,
            }}
            hasMore={result.page < result.totalPages}
          />
        </>
      )}
    </div>
  );
}
