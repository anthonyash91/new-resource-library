"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import type { Category } from "@/types";

interface FilterLabels {
  filters: string;
  showFilters: string;
  hideFilters: string;
  keyword: string;
  keywordPlaceholder: string;
  state: string;
  county: string;
  city: string;
  category: string;
  allStates: string;
  allCounties: string;
  allCities: string;
  allCategories: string;
  searchButton: string;
  sortLabel: string;
  sortName: string;
  sortNewest: string;
}

interface ResourceFiltersProps {
  labels: FilterLabels;
  categories: Category[];
  states: string[];
  counties: string[];
  cities: string[];
  initial: {
    q?: string;
    state?: string;
    county?: string;
    city?: string;
    category?: string;
    sort?: string;
  };
}

export function ResourceFilters({
  labels,
  categories,
  states,
  counties,
  cities,
  initial,
}: ResourceFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const params = new URLSearchParams();

    for (const key of ["q", "state", "county", "city", "category", "sort"]) {
      const value = String(form.get(key) ?? "").trim();
      if (value) params.set(key, value);
    }

    router.push(`/resources?${params.toString()}`);
  }

  const panelId = "resource-filters-panel";

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
            defaultValue={initial.q ?? searchParams.get("q") ?? ""}
            placeholder={labels.keywordPlaceholder}
            className="input-field"
          />
        </div>

        <div>
          <label htmlFor="filter-state" className="mb-1 block text-sm font-medium text-slate-700">
            {labels.state}
          </label>
          <select
            id="filter-state"
            name="state"
            defaultValue={initial.state ?? searchParams.get("state") ?? ""}
            className="input-field"
          >
            <option value="">{labels.allStates}</option>
            {states.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-county" className="mb-1 block text-sm font-medium text-slate-700">
            {labels.county}
          </label>
          <select
            id="filter-county"
            name="county"
            defaultValue={initial.county ?? searchParams.get("county") ?? ""}
            className="input-field"
          >
            <option value="">{labels.allCounties}</option>
            {counties.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-city" className="mb-1 block text-sm font-medium text-slate-700">
            {labels.city}
          </label>
          <select
            id="filter-city"
            name="city"
            defaultValue={initial.city ?? searchParams.get("city") ?? ""}
            className="input-field"
          >
            <option value="">{labels.allCities}</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-category" className="mb-1 block text-sm font-medium text-slate-700">
            {labels.category}
          </label>
          <select
            id="filter-category"
            name="category"
            defaultValue={initial.category ?? searchParams.get("category") ?? ""}
            className="input-field"
          >
            <option value="">{labels.allCategories}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>{c.name}</option>
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
            defaultValue={initial.sort ?? searchParams.get("sort") ?? "name"}
            className="input-field"
          >
            <option value="name">{labels.sortName}</option>
            <option value="newest">{labels.sortNewest}</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-3 lg:col-span-2">
          <button type="submit" className="btn-primary">
            {labels.searchButton}
          </button>
        </div>
      </form>
    </section>
  );
}
