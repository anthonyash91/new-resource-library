"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ResourceResults } from "@/components/ResourceResults";
import { LoadMoreButton } from "@/components/LoadMoreButton";
import { createTranslator } from "@/i18n/translator";
import { searchParamsFromFilters, type ResourceFiltersInput } from "@/lib/validation";
import type { Locale } from "@/i18n/types";
import type { ResourceQueryResult } from "@/types";

interface PaginatedResourceResultsProps {
  initialResult: ResourceQueryResult;
  filters: ResourceFiltersInput;
  locale: Locale;
  searchParams: string;
  selectedCounty?: string;
  selectedState?: string;
  loadMoreLabel: string;
  loadingLabel: string;
}

export function PaginatedResourceResults({
  initialResult,
  filters,
  locale,
  searchParams,
  selectedCounty,
  selectedState,
  loadMoreLabel,
  loadingLabel,
}: PaginatedResourceResultsProps) {
  const { t } = createTranslator(locale);
  const [resources, setResources] = useState(initialResult.resources);
  const [page, setPage] = useState(initialResult.page);
  const [totalPages, setTotalPages] = useState(initialResult.totalPages);
  const [tierTotals, setTierTotals] = useState(initialResult.tierTotals);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const filterKey = useMemo(
    () =>
      [filters.q, filters.zip, filters.state, filters.county, filters.city, filters.category, filters.sort].join(
        "|"
      ),
    [filters]
  );

  useEffect(() => {
    setResources(initialResult.resources);
    setPage(initialResult.page);
    setTotalPages(initialResult.totalPages);
    setTierTotals(initialResult.tierTotals);
    setLoadError(null);
  }, [filterKey, initialResult]);

  const loadMore = useCallback(async () => {
    if (loadingMore || page >= totalPages) return;

    setLoadingMore(true);
    setLoadError(null);

    try {
      const params = searchParamsFromFilters(filters, page + 1);
      const response = await fetch(`/api/resources?${params.toString()}`);

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed (${response.status})`);
      }

      const data = (await response.json()) as ResourceQueryResult;
      setResources((previous) => [...previous, ...data.resources]);
      setPage(data.page);
      setTotalPages(data.totalPages);
      if (data.tierTotals) setTierTotals(data.tierTotals);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load more results.");
    } finally {
      setLoadingMore(false);
    }
  }, [filters, loadingMore, page, totalPages]);

  return (
    <>
      {loadError && (
        <p role="alert" className="text-center text-sm text-red-700">
          {loadError}
        </p>
      )}
      <ResourceResults
        resources={resources}
        t={t}
        locale={locale}
        searchParams={searchParams}
        selectedCounty={selectedCounty}
        selectedState={selectedState}
        tierTotals={tierTotals}
      />
      <LoadMoreButton
        loadMoreLabel={loadMoreLabel}
        loadingLabel={loadingLabel}
        hasMore={page < totalPages}
        isLoading={loadingMore}
        onLoadMore={loadMore}
      />
    </>
  );
}
