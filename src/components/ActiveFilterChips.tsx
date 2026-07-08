"use client";

import Link from "next/link";

interface ActiveFilterChipsProps {
  labels: {
    activeFilters: string;
    clearAll: string;
    keyword: string;
    state: string;
    county: string;
    city: string;
    category: string;
  };
  filters: Record<string, string | undefined>;
  categoryName?: string;
}

const LABEL_KEYS: Record<string, keyof ActiveFilterChipsProps["labels"]> = {
  q: "keyword",
  state: "state",
  county: "county",
  city: "city",
  category: "category",
};

export function ActiveFilterChips({ labels, filters, categoryName }: ActiveFilterChipsProps) {
  const active = Object.entries(filters).filter(
    ([key, value]) => value && key !== "page" && key !== "sort"
  );

  if (!active.length) return null;

  function buildClearHref(removeKey?: string): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (!value || key === "page") continue;
      if (key === removeKey) continue;
      params.set(key, value);
    }
    const qs = params.toString();
    return `/resources${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-slate-600">{labels.activeFilters}:</span>
      {active.map(([key, value]) => (
        <Link
          key={key}
          href={buildClearHref(key)}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 bg-white px-3 text-sm text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <span>
            {labels[LABEL_KEYS[key] ?? "keyword"]}: {key === "category" && categoryName ? categoryName : value}
          </span>
          <span aria-hidden="true">×</span>
        </Link>
      ))}
      <Link href="/resources" className="min-h-11 inline-flex items-center text-sm font-medium text-brand-700 underline-offset-2 hover:underline">
        {labels.clearAll}
      </Link>
    </div>
  );
}
