import { z } from "zod";
import { normalizeUsZipCode } from "@/lib/zip-code";

/** Enterprise input bounds for public search endpoints. */
export const SEARCH_LIMITS = {
  qMaxLength: 200,
  stateMaxLength: 64,
  countyMaxLength: 128,
  cityMaxLength: 128,
  categoryMaxLength: 64,
  zipMaxLength: 10,
  maxPage: 500,
  maxPageSize: 100,
} as const;

export const PAGE_SIZE = 24;

function optionalBoundedString(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength)
    .optional()
    .transform((value) => (value === "" ? undefined : value));
}

function optionalZipCode() {
  return z
    .string()
    .trim()
    .max(SEARCH_LIMITS.zipMaxLength)
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      return normalizeUsZipCode(value) ?? undefined;
    });
}

export const resourceFiltersSchema = z.object({
  q: optionalBoundedString(SEARCH_LIMITS.qMaxLength),
  zip: optionalZipCode(),
  state: optionalBoundedString(SEARCH_LIMITS.stateMaxLength),
  county: optionalBoundedString(SEARCH_LIMITS.countyMaxLength),
  city: optionalBoundedString(SEARCH_LIMITS.cityMaxLength),
  category: optionalBoundedString(SEARCH_LIMITS.categoryMaxLength),
  page: z.coerce.number().int().min(1).max(SEARCH_LIMITS.maxPage).default(1),
  sort: z.enum(["name", "newest"]).default("name"),
});

export type ResourceFiltersInput = z.infer<typeof resourceFiltersSchema>;

export const filterFacetSchema = z.object({
  state: optionalBoundedString(SEARCH_LIMITS.stateMaxLength),
  county: optionalBoundedString(SEARCH_LIMITS.countyMaxLength),
  city: optionalBoundedString(SEARCH_LIMITS.cityMaxLength),
  category: optionalBoundedString(SEARCH_LIMITS.categoryMaxLength),
});

export type FilterFacetInput = z.infer<typeof filterFacetSchema>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Raw zip query param before Zod normalization. */
export function rawZipParam(value: string | string[] | undefined): string | undefined {
  const raw = firstParam(value)?.trim();
  return raw || undefined;
}

/** True when URL has a zip value that failed 5-digit normalization. */
export function isMalformedZipParam(
  rawZip: string | string[] | undefined,
  parsedZip: string | undefined
): boolean {
  return Boolean(rawZipParam(rawZip) && !parsedZip);
}

/** Escape ILIKE metacharacters for legacy PostgREST filters. */
export function escapeIlikePattern(input: string): string {
  return input.replace(/[%_\\]/g, "\\$&");
}

/** True when the user has applied at least one search filter (not sort/page alone). */
export function hasSearchCriteria(filters: ResourceFiltersInput): boolean {
  return Boolean(
    filters.q?.trim() ||
      filters.zip?.trim() ||
      filters.state?.trim() ||
      filters.county?.trim() ||
      filters.city?.trim() ||
      filters.category?.trim()
  );
}

/** True when the resources list should load (filters set, or search form submitted). */
export function shouldQueryResources(
  filters: ResourceFiltersInput,
  rawSearchParams: Record<string, string | string[] | undefined> = {}
): boolean {
  if (hasSearchCriteria(filters)) return true;

  for (const [key, value] of Object.entries(rawSearchParams)) {
    const v = firstParam(value)?.trim();
    if (!v) continue;
    if (key === "page" && v === "1") continue;
    return true;
  }

  return false;
}

/** Build URLSearchParams for search API calls from validated filters. */
export function searchParamsFromFilters(
  filters: ResourceFiltersInput,
  page?: number
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.zip) params.set("zip", filters.zip);
  if (filters.state) params.set("state", filters.state);
  if (filters.county) params.set("county", filters.county);
  if (filters.city) params.set("city", filters.city);
  if (filters.category) params.set("category", filters.category);
  if (filters.sort) params.set("sort", filters.sort);
  params.set("page", String(page ?? filters.page ?? 1));
  return params;
}
