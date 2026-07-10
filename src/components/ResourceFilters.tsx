"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useRef, useState, useTransition } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import type { CategoryFacetOption, CountyFacetOption, CoverageTierCounts, FilterFacets, FilterFacetSelection } from "@/types";
import { sanitizeFacetSelection } from "@/lib/filter-facets";

interface FilterLabels {
  filters: string;
  showFilters: string;
  hideFilters: string;
  keyword: string;
  keywordPlaceholder: string;
  zip: string;
  zipPlaceholder: string;
  state: string;
  county: string;
  city: string;
  category: string;
  allStates: string;
  allCounties: string;
  allCities: string;
  allCategories: string;
  searchButton: string;
  searchingLabel: string;
  sortLabel: string;
  sortName: string;
  sortNewest: string;
  citiesInCounty: string;
  citiesRegional: string;
  cityLocatedIn: string;
  categoryCounts: string;
  selectStateFirst: string;
}

type FacetField = keyof FilterFacetSelection;

interface ResourceFiltersProps {
  labels: FilterLabels;
  initialFacets: FilterFacets;
  initial: {
    q?: string;
    zip?: string;
    state?: string;
    county?: string;
    city?: string;
    category?: string;
    sort?: string;
  };
}

function selectionFromInitial(initial: ResourceFiltersProps["initial"]): Required<FilterFacetSelection> {
  return {
    state: initial.state ?? "",
    county: initial.county ?? "",
    city: initial.city ?? "",
    category: initial.category ?? "",
  };
}

export function ResourceFilters({ labels, initialFacets, initial }: ResourceFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSearching, startSearchTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [facets, setFacets] = useState(initialFacets);
  const [selection, setSelection] = useState(() => selectionFromInitial(initial));
  const [loadingFacets, setLoadingFacets] = useState(false);
  const [stateRequiredHint, setStateRequiredHint] = useState<"county" | "city" | null>(null);
  const requestId = useRef(0);
  const stateSelectRef = useRef<HTMLSelectElement>(null);

  const fetchFacets = useCallback(async (next: Required<FilterFacetSelection>) => {
    const id = ++requestId.current;
    setLoadingFacets(true);

    const params = new URLSearchParams();
    if (next.state) params.set("state", next.state);
    if (next.county) params.set("county", next.county);
    if (next.city) params.set("city", next.city);
    if (next.category) params.set("category", next.category);

    try {
      const res = await fetch(`/api/facets?${params.toString()}`);
      if (!res.ok) return null;
      const data = (await res.json()) as FilterFacets;
      if (id !== requestId.current) return null;
      return data;
    } finally {
      if (id === requestId.current) setLoadingFacets(false);
    }
  }, []);

  async function handleFacetChange(field: FacetField, value: string) {
    if (field === "state") setStateRequiredHint(null);

    const next: Required<FilterFacetSelection> =
      field === "state"
        ? { state: value, county: "", city: "", category: selection.category }
        : field === "county"
          ? { ...selection, county: value, city: "" }
          : { ...selection, [field]: value };

    setSelection(next);

    const updatedFacets = await fetchFacets(next);
    if (!updatedFacets) return;

    setFacets(updatedFacets);
    const sanitized = sanitizeFacetSelection(next, updatedFacets, field);
    if (
      sanitized.state !== next.state ||
      sanitized.county !== next.county ||
      sanitized.city !== next.city ||
      sanitized.category !== next.category
    ) {
      setSelection(sanitized);
      const refetched = await fetchFacets(sanitized);
      if (refetched) setFacets(refetched);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const params = new URLSearchParams();

    const q = String(form.get("q") ?? "").trim();
    if (q) params.set("q", q);

    const zip = String(form.get("zip") ?? "").trim();
    if (zip) params.set("zip", zip);

    // Use React selection — disabled facet controls are omitted from FormData.
    if (selection.state.trim()) params.set("state", selection.state.trim());
    if (selection.county.trim()) params.set("county", selection.county.trim());
    if (selection.city.trim()) params.set("city", selection.city.trim());
    if (selection.category.trim()) params.set("category", selection.category.trim());

    const sort = String(form.get("sort") ?? sortDefault).trim();
    if (sort) params.set("sort", sort);

    startSearchTransition(() => {
      router.push(`/resources?${params.toString()}`);
    });
  }

  const panelId = "resource-filters-panel";
  const keywordDefault = initial.q ?? searchParams.get("q") ?? "";
  const zipDefault = initial.zip ?? searchParams.get("zip") ?? "";
  const sortDefault = initial.sort ?? searchParams.get("sort") ?? "name";
  const hasState = Boolean(selection.state.trim());

  function requestStateSelection(field: "county" | "city") {
    setStateRequiredHint(field);
    stateSelectRef.current?.focus();
  }

  const localCities = selection.county
    ? facets.cities.filter((c) => c.isLocal)
    : facets.cities;
  const regionalCities = selection.county
    ? facets.cities.filter((c) => !c.isLocal)
    : [];

  function cityOptionLabel(city: (typeof facets.cities)[number]): string {
    if (city.isLocal || !city.locatedInCounty) return city.city;
    return labels.cityLocatedIn
      .replace("{city}", city.city)
      .replace("{county}", city.locatedInCounty);
  }

  function coverageCountsLabel(counts: CoverageTierCounts): string {
    return labels.categoryCounts
      .replace("{local}", String(counts.local))
      .replace("{regional}", String(counts.regional))
      .replace("{statewide}", String(counts.statewide));
  }

  function countyOptionLabel(county: CountyFacetOption): string {
    if (!county.counts || !selection.state) return county.county;
    return `${county.county} (${coverageCountsLabel(county.counts)})`;
  }

  function categoryOptionLabel(category: CategoryFacetOption): string {
    if (!category.counts || !selection.state || !selection.county) {
      return category.name;
    }
    return `${category.name} (${coverageCountsLabel(category.counts)})`;
  }

  return (
    <section aria-labelledby="filters-heading" className="card">
      <div className="flex items-center justify-between gap-3">
        <h2 id="filters-heading" className="text-lg font-semibold text-slate-900">
          {labels.filters}
        </h2>
        <button
          type="button"
          className="btn-secondary min-h-11 lg:hidden"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? labels.hideFilters : labels.showFilters}
        </button>
      </div>

      <form
        id={panelId}
        onSubmit={onSubmit}
        className={`mt-4 grid gap-4 ${open ? "grid" : "hidden lg:grid"} lg:grid-cols-2`}
      >
        <div className="lg:col-span-2">
          <label htmlFor="filter-q" className="mb-1 block text-sm font-medium text-slate-700">
            {labels.keyword}
          </label>
          <input
            id="filter-q"
            name="q"
            type="search"
            defaultValue={keywordDefault}
            placeholder={labels.keywordPlaceholder}
            className="input-field"
          />
        </div>

        <div>
          <label htmlFor="filter-zip" className="mb-1 block text-sm font-medium text-slate-700">
            {labels.zip}
          </label>
          <input
            id="filter-zip"
            name="zip"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            defaultValue={zipDefault}
            placeholder={labels.zipPlaceholder}
            className="input-field"
            maxLength={10}
          />
        </div>

        <div>
          <label htmlFor="filter-state" className="mb-1 block text-sm font-medium text-slate-700">
            {labels.state}
          </label>
          <select
            ref={stateSelectRef}
            id="filter-state"
            name="state"
            value={selection.state}
            onChange={(e) => handleFacetChange("state", e.target.value)}
            className="input-field"
          >
            <option value="">{labels.allStates}</option>
            {facets.states.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-county" className="mb-1 block text-sm font-medium text-slate-700">
            {labels.county}
          </label>
          <div className="relative">
            <select
              id="filter-county"
              name="county"
              value={selection.county}
              onChange={(e) => handleFacetChange("county", e.target.value)}
              disabled={!hasState || loadingFacets}
              aria-describedby={
                !hasState && stateRequiredHint === "county" ? "filter-county-hint" : undefined
              }
              className="input-field"
            >
              <option value="">
                {hasState ? labels.allCounties : labels.selectStateFirst}
              </option>
              {facets.counties.map((c) => (
                <option key={c.county} value={c.county}>{countyOptionLabel(c)}</option>
              ))}
            </select>
            {!hasState && (
              <button
                type="button"
                className="absolute inset-0 z-10 cursor-not-allowed rounded-lg bg-transparent"
                aria-label={labels.selectStateFirst}
                onClick={() => requestStateSelection("county")}
              />
            )}
          </div>
          {!hasState && stateRequiredHint === "county" && (
            <p id="filter-county-hint" role="status" className="mt-1 text-sm text-amber-800">
              {labels.selectStateFirst}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="filter-city" className="mb-1 block text-sm font-medium text-slate-700">
            {labels.city}
          </label>
          <div className="relative">
            <select
              id="filter-city"
              name="city"
              value={selection.city}
              onChange={(e) => handleFacetChange("city", e.target.value)}
              disabled={!hasState || loadingFacets}
              aria-describedby={
                !hasState && stateRequiredHint === "city" ? "filter-city-hint" : undefined
              }
              className="input-field"
            >
              <option value="">
                {hasState ? labels.allCities : labels.selectStateFirst}
              </option>
              {selection.county ? (
                <>
                  {localCities.length > 0 && (
                    <optgroup
                      label={labels.citiesInCounty.replace("{county}", selection.county)}
                    >
                      {localCities.map((c) => (
                        <option key={c.city} value={c.city}>
                          {c.city}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {regionalCities.length > 0 && (
                    <optgroup
                      label={labels.citiesRegional.replace("{county}", selection.county)}
                    >
                      {regionalCities.map((c) => (
                        <option key={`${c.city}-${c.locatedInCounty}`} value={c.city}>
                          {cityOptionLabel(c)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </>
              ) : (
                facets.cities.map((c) => (
                  <option key={c.city} value={c.city}>
                    {c.city}
                  </option>
                ))
              )}
            </select>
            {!hasState && (
              <button
                type="button"
                className="absolute inset-0 z-10 cursor-not-allowed rounded-lg bg-transparent"
                aria-label={labels.selectStateFirst}
                onClick={() => requestStateSelection("city")}
              />
            )}
          </div>
          {!hasState && stateRequiredHint === "city" && (
            <p id="filter-city-hint" role="status" className="mt-1 text-sm text-amber-800">
              {labels.selectStateFirst}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="filter-category" className="mb-1 block text-sm font-medium text-slate-700">
            {labels.category}
          </label>
          <select
            id="filter-category"
            name="category"
            value={selection.category}
            onChange={(e) => handleFacetChange("category", e.target.value)}
            className="input-field"
          >
            <option value="">{labels.allCategories}</option>
            {facets.categories.map((c) => (
              <option key={c.id} value={c.slug}>{categoryOptionLabel(c)}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-sort" className="mb-1 block text-sm font-medium text-slate-700">
            {labels.sortLabel}
          </label>
          <select
            id="filter-sort"
            name="sort"
            defaultValue={sortDefault}
            className="input-field"
          >
            <option value="name">{labels.sortName}</option>
            <option value="newest">{labels.sortNewest}</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-3 lg:col-span-2">
          <button
            type="submit"
            className="btn-primary"
            disabled={isSearching}
            aria-busy={isSearching}
          >
            {isSearching ? (
              <>
                <ButtonSpinner />
                {labels.searchingLabel}
              </>
            ) : (
              labels.searchButton
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
