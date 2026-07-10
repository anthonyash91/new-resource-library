import { unstable_cache } from "next/cache";
import type {
  Category,
  CoverageTierCounts,
  FilterFacets,
  FilterFacetSelection,
  ResolvedZipLocation,
  Resource,
  ResourceFilters,
  ResourceQueryResult,
} from "@/types";
import { resourceServesCounty, coverageTierSortOrder, countResourcesByCoverageTier, resourceMatchesZipSearch } from "@/lib/resource-coverage";
import { computeFilterFacets } from "@/lib/filter-facets";
import { createSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { PAGE_SIZE, escapeIlikePattern, resourceFiltersSchema } from "@/lib/validation";
import { fullStateNameFromAbbr } from "@/lib/zip-code";
import zipcodes from "zipcodes";
import mockData from "../../data/mock-resources.json";

interface MockStore {
  categories: Category[];
  resources: Resource[];
}

const store: MockStore = mockData as MockStore;

function attachCategories(resources: Resource[], categories: Category[]): Resource[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return resources.map((r) => ({
    ...r,
    category: byId.get(r.category_id),
  }));
}

function resolveZipLocally(
  zip: string,
  resources: Resource[]
): ResolvedZipLocation | null {
  const info = zipcodes.lookup(zip);
  if (!info?.city || !info.state) return null;

  const state = fullStateNameFromAbbr(info.state);
  if (!state) return null;

  const city = info.city.trim();
  const county =
    resources.find(
      (resource) =>
        resource.state === state &&
        resource.city?.trim().toLowerCase() === city.toLowerCase() &&
        resource.county?.trim()
    )?.county?.trim() ?? null;

  return { zip, state, city, county };
}

function filterMockResources(filters: ResourceFilters): ResourceQueryResult {
  const parsed = resourceFiltersSchema.parse(filters);
  const categories = store.categories.filter((c) => c.is_active);
  let items = store.resources.filter((r) => r.status === "active");
  let resolvedLocation: ResolvedZipLocation | undefined;

  if (parsed.zip) {
    const location = resolveZipLocally(parsed.zip, items);
    if (!location) {
      return {
        resources: [],
        total: 0,
        page: parsed.page,
        pageSize: PAGE_SIZE,
        totalPages: 0,
        zipNotFound: true,
      };
    }
    resolvedLocation = location;
    items = items.filter((resource) => resourceMatchesZipSearch(resource, parsed.zip!, location));
  }

  if (parsed.category) {
    const cat = categories.find((c) => c.slug === parsed.category);
    if (cat) items = items.filter((r) => r.category_id === cat.id);
  }

  if (parsed.state) {
    items = items.filter((r) => r.state === parsed.state);
  }

  if (parsed.county) {
    items = items.filter((r) => resourceServesCounty(r, parsed.county!));
  }

  if (parsed.city) {
    const city = parsed.city.toLowerCase();
    items = items.filter((r) => r.city?.toLowerCase() === city);
  }

  if (parsed.q?.trim()) {
    const q = parsed.q.trim().toLowerCase();
    items = items.filter((r) => {
      const haystack = [
        r.name,
        r.description,
        r.city,
        r.county,
        ...(r.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  const tierCounty = parsed.county?.trim() || resolvedLocation?.county?.trim();

  if (parsed.sort === "newest") {
    items.sort((a, b) => {
      if (tierCounty) {
        const tierDiff =
          coverageTierSortOrder(a, tierCounty) - coverageTierSortOrder(b, tierCounty);
        if (tierDiff !== 0) return tierDiff;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  } else {
    items.sort((a, b) => {
      if (tierCounty) {
        const tierDiff =
          coverageTierSortOrder(a, tierCounty) - coverageTierSortOrder(b, tierCounty);
        if (tierDiff !== 0) return tierDiff;
      }
      return a.name.localeCompare(b.name);
    });
  }

  const total = items.length;
  const page = parsed.page;
  const start = (page - 1) * PAGE_SIZE;
  const paged = items.slice(start, start + PAGE_SIZE);

  const base: ResourceQueryResult = {
    resources: attachCategories(paged, categories),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    ...(resolvedLocation ? { resolvedLocation } : {}),
  };

  if (tierCounty) {
    return { ...base, tierTotals: countResourcesByCoverageTier(items, tierCounty) };
  }
  return base;
}

const DB_PAGE_SIZE = 1000;

async function resolveCategoryId(
  supabase: ReturnType<typeof createSupabaseClient>,
  slug: string
): Promise<string | undefined> {
  const { data: cat } = await supabase
    .from("categories")
    .select("id")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  return cat?.id;
}

function applySupabaseQueryFilters<
  Q extends {
    eq: (col: string, val: string) => Q;
    ilike: (col: string, val: string) => Q;
    or: (filters: string) => Q;
  },
>(
  query: Q,
  parsed: ReturnType<typeof resourceFiltersSchema.parse>,
  categoryId?: string
): Q {
  if (parsed.state) query = query.eq("state", parsed.state);
  if (parsed.city) query = query.ilike("city", escapeIlikePattern(parsed.city));
  if (categoryId) query = query.eq("category_id", categoryId);
  if (parsed.q?.trim()) {
    const q = escapeIlikePattern(parsed.q.trim());
    query = query.or(
      `name.ilike.%${q}%,description.ilike.%${q}%,city.ilike.%${q}%,county.ilike.%${q}%`
    );
  }
  return query;
}

async function fetchAllResourcesFromSupabase(
  parsed: ReturnType<typeof resourceFiltersSchema.parse>
): Promise<Resource[]> {
  const supabase = createSupabaseClient();
  const categoryId = parsed.category
    ? await resolveCategoryId(supabase, parsed.category)
    : undefined;

  const rows: Resource[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from("resources")
      .select("*, category:categories(*)")
      .eq("status", "active");

    query = applySupabaseQueryFilters(query, parsed, categoryId);

    const { data, error } = await query.range(from, from + DB_PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;

    rows.push(...(data as Resource[]));
    if (data.length < DB_PAGE_SIZE) break;
    from += DB_PAGE_SIZE;
  }

  return rows;
}

function sortResources(
  items: Resource[],
  sort: "name" | "newest",
  county?: string
): Resource[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    if (county?.trim()) {
      const tierDiff = coverageTierSortOrder(a, county) - coverageTierSortOrder(b, county);
      if (tierDiff !== 0) return tierDiff;
    }
    if (sort === "newest") {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    return a.name.localeCompare(b.name);
  });
  return sorted;
}

function paginateResourcePage(items: Resource[], page: number): ResourceQueryResult {
  const total = items.length;
  const start = (page - 1) * PAGE_SIZE;
  const paged = items.slice(start, start + PAGE_SIZE);

  return {
    resources: paged,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

function parseRpcTierTotals(value: unknown): CoverageTierCounts | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  if (
    typeof row.local !== "number" ||
    typeof row.regional !== "number" ||
    typeof row.statewide !== "number"
  ) {
    return undefined;
  }
  return {
    local: row.local,
    regional: row.regional,
    statewide: row.statewide,
  };
}

function parseResolvedLocation(value: unknown): ResolvedZipLocation | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.zip !== "string" || typeof row.state !== "string" || typeof row.city !== "string") {
    return undefined;
  }
  return {
    zip: row.zip,
    state: row.state,
    city: row.city,
    county: typeof row.county === "string" ? row.county : null,
  };
}

async function mapRpcSearchResult(
  parsed: ReturnType<typeof resourceFiltersSchema.parse>,
  payload: {
    total: number;
    page?: number;
    page_size?: number;
    tier_totals?: unknown;
    resolved_location?: unknown;
    zip_not_found?: boolean;
    resources: Resource[];
  }
): Promise<ResourceQueryResult> {
  const categories = await getCategories();
  const resources = attachCategories(payload.resources ?? [], categories);
  const total = Number(payload.total ?? 0);
  const tierTotals = parseRpcTierTotals(payload.tier_totals);
  const resolvedLocation = parseResolvedLocation(payload.resolved_location);

  return {
    resources,
    total,
    page: parsed.page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    ...(tierTotals ? { tierTotals } : {}),
    ...(resolvedLocation ? { resolvedLocation } : {}),
    ...(payload.zip_not_found ? { zipNotFound: true } : {}),
  };
}

function withCountyTierTotals(
  items: Resource[],
  county: string,
  result: ResourceQueryResult
): ResourceQueryResult {
  return { ...result, tierTotals: countResourcesByCoverageTier(items, county) };
}

async function querySupabaseViaRpc(
  parsed: ReturnType<typeof resourceFiltersSchema.parse>
): Promise<ResourceQueryResult | null> {
  const supabase = createSupabaseClient();

  const rpcParams = {
    p_q: parsed.q?.trim() || null,
    p_state: parsed.state?.trim() || null,
    p_county: parsed.county?.trim() || null,
    p_city: parsed.city?.trim() || null,
    p_category_slug: parsed.category?.trim() || null,
    p_zip: parsed.zip?.trim() || null,
    p_sort: parsed.sort,
    p_page: parsed.page,
    p_page_size: PAGE_SIZE,
  };

  const { data, error } = await supabase.rpc("search_resources", rpcParams);

  if (error) {
    if (error.code === "PGRST202" || error.message.includes("search_resources")) {
      return null;
    }
    throw error;
  }

  return mapRpcSearchResult(parsed, data as {
    total: number;
    page?: number;
    page_size?: number;
    tier_totals?: unknown;
    resolved_location?: unknown;
    zip_not_found?: boolean;
    resources: Resource[];
  });
}

/** @deprecated Fallback when search_resources RPC is not yet applied */
async function querySupabaseLegacy(
  parsed: ReturnType<typeof resourceFiltersSchema.parse>
): Promise<ResourceQueryResult> {
  if (parsed.county?.trim()) {
    let items = await fetchAllResourcesFromSupabase(parsed);
    items = items.filter((r) => resourceServesCounty(r, parsed.county!));
    items = sortResources(items, parsed.sort, parsed.county);
    const categories = await getCategories();
    const result = paginateResourcePage(items, parsed.page);
    const withTotals = withCountyTierTotals(items, parsed.county, result);
    return { ...withTotals, resources: attachCategories(withTotals.resources, categories) };
  }

  const supabase = createSupabaseClient();

  let query = supabase
    .from("resources")
    .select("*, category:categories(*)", { count: "exact" })
    .eq("status", "active");

  const categoryId = parsed.category
    ? await resolveCategoryId(supabase, parsed.category)
    : undefined;

  query = applySupabaseQueryFilters(query, parsed, categoryId);

  if (parsed.sort === "newest") {
    query = query.order("created_at", { ascending: false });
  } else {
    query = query.order("name", { ascending: true });
  }

  const from = (parsed.page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;

  const resources = (data ?? []) as Resource[];

  return {
    resources,
    total: count ?? resources.length,
    page: parsed.page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil((count ?? resources.length) / PAGE_SIZE)),
  };
}

async function querySupabase(filters: ResourceFilters): Promise<ResourceQueryResult> {
  const parsed = resourceFiltersSchema.parse(filters);

  const rpcResult = await querySupabaseViaRpc(parsed);
  if (rpcResult) return rpcResult;

  return querySupabaseLegacy(parsed);
}

export async function getCategories(): Promise<Category[]> {
  if (!isSupabaseConfigured()) {
    return store.categories.filter((c) => c.is_active).sort((a, b) => a.sort_order - b.sort_order);
  }

  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function queryResources(filters: ResourceFilters = {}): Promise<ResourceQueryResult> {
  if (!isSupabaseConfigured()) return filterMockResources(filters);
  return querySupabase(filters);
}

export async function getResourceById(id: string): Promise<Resource | null> {
  if (!isSupabaseConfigured()) {
    const resource = store.resources.find((r) => r.id === id && r.status === "active");
    if (!resource) return null;
    const categories = await getCategories();
    const [withCat] = attachCategories([resource], categories);
    return withCat;
  }

  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("resources")
    .select("*, category:categories(*)")
    .eq("id", id)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  return (data as Resource | null) ?? null;
}

const FACET_PAGE_SIZE = DB_PAGE_SIZE;

async function getActiveResourceFacetRows(): Promise<
  Pick<Resource, "state" | "county" | "city" | "served_counties" | "coverage" | "tags" | "category_id">[]
> {
  if (!isSupabaseConfigured()) {
    return store.resources.filter((r) => r.status === "active");
  }

  const supabase = createSupabaseClient();
  const rows: Pick<
    Resource,
    "state" | "county" | "city" | "served_counties" | "coverage" | "tags" | "category_id"
  >[] = [];
  let from = 0;

  // Supabase caps each request at 1000 rows; paginate so facets reflect the full dataset.
  // State is not narrowed here — computeFilterFacets excludes the state filter when
  // building the state list so users can always switch to another state.
  while (true) {
    const query = supabase
      .from("resources")
      .select("state, county, city, served_counties, coverage, tags, category_id")
      .eq("status", "active");

    const { data, error } = await query.range(from, from + FACET_PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;

    rows.push(...data);
    if (data.length < FACET_PAGE_SIZE) break;
    from += FACET_PAGE_SIZE;
  }

  return rows;
}

async function getFilterFacetsViaRpc(
  filters: FilterFacetSelection
): Promise<FilterFacets | null> {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase.rpc("get_filter_facets", {
    p_state: filters.state?.trim() || null,
    p_county: filters.county?.trim() || null,
    p_city: filters.city?.trim() || null,
    p_category_slug: filters.category?.trim() || null,
  });

  if (error) {
    if (error.code === "PGRST202" || error.message.includes("get_filter_facets")) {
      return null;
    }
    // Statement timeout / overload — fall back to in-app facet computation
    if (error.code === "57014" || error.message?.includes("timeout")) {
      return null;
    }
    throw error;
  }

  return data as FilterFacets;
}

function normalizeRpcFacets(facets: FilterFacets): FilterFacets {
  const countiesRaw = facets.counties as unknown;
  if (
    Array.isArray(countiesRaw) &&
    countiesRaw.length > 0 &&
    typeof countiesRaw[0] === "string"
  ) {
    return {
      ...facets,
      counties: (countiesRaw as string[]).map((county) => ({ county })),
    };
  }
  return facets;
}

/** Fill tier counts when RPC predates county/category count migrations. */
async function enrichFacetTierCounts(
  facets: FilterFacets,
  filters: FilterFacetSelection
): Promise<FilterFacets> {
  const normalized = normalizeRpcFacets(facets);

  const needsCountyCounts =
    Boolean(filters.state?.trim()) && normalized.counties.some((c) => !c.counts);
  const needsCategoryCounts =
    Boolean(filters.state?.trim() && filters.county?.trim()) &&
    normalized.categories.some((c) => !c.counts);

  if (!needsCountyCounts && !needsCategoryCounts) return normalized;

  const [resources, categories] = await Promise.all([
    getActiveResourceFacetRows(),
    getCategories(),
  ]);
  const enriched = computeFilterFacets(resources, categories, filters);

  return {
    ...normalized,
    counties: needsCountyCounts ? enriched.counties : normalized.counties,
    categories: needsCategoryCounts ? enriched.categories : normalized.categories,
  };
}

/** @deprecated Fallback when get_filter_facets RPC is not yet applied */
async function getFilterFacetsLegacy(
  filters: FilterFacetSelection = {}
): Promise<FilterFacets> {
  const [resources, categories] = await Promise.all([
    getActiveResourceFacetRows(),
    getCategories(),
  ]);

  return computeFilterFacets(resources, categories, filters);
}

/** Older RPC versions narrowed the state list to the current selection. */
async function ensureCompleteStateList(facets: FilterFacets): Promise<FilterFacets> {
  if (facets.states.length > 1) return facets;

  const rows = await getActiveResourceFacetRows();
  const allStates = [
    ...new Set(
      rows
        .map((r) => r.state?.trim())
        .filter((state): state is string => Boolean(state))
    ),
  ].sort((a, b) => a.localeCompare(b));

  if (allStates.length <= facets.states.length) return facets;
  return { ...facets, states: allStates };
}

const FACET_CACHE_SECONDS = 300;

async function fetchFilterFacetsInternal(
  filters: FilterFacetSelection
): Promise<FilterFacets> {
  if (!isSupabaseConfigured()) {
    const categories = await getCategories();
    const resources = store.resources.filter((r) => r.status === "active");
    return computeFilterFacets(resources, categories, filters);
  }

  try {
    const rpcResult = await getFilterFacetsViaRpc(filters);
    if (rpcResult) {
      const enriched = await enrichFacetTierCounts(rpcResult, filters);
      return ensureCompleteStateList(enriched);
    }
  } catch {
    // RPC failed — use legacy path
  }

  return ensureCompleteStateList(await getFilterFacetsLegacy(filters));
}

export async function getFilterFacets(filters: FilterFacetSelection = {}): Promise<FilterFacets> {
  if (!isSupabaseConfigured()) {
    const categories = await getCategories();
    const resources = store.resources.filter((r) => r.status === "active");
    return computeFilterFacets(resources, categories, filters);
  }

  const cacheKey = [
    filters.state?.trim() ?? "",
    filters.county?.trim() ?? "",
    filters.city?.trim() ?? "",
    filters.category?.trim() ?? "",
  ].join(":");

  return unstable_cache(
    () => fetchFilterFacetsInternal(filters),
    ["filter-facets", cacheKey],
    { revalidate: FACET_CACHE_SECONDS, tags: ["filter-facets"] }
  )();
}

/** @deprecated Use getFilterFacets instead */
export async function getLocationFacets(state?: string, county?: string) {
  const facets = await getFilterFacets({ state, county });
  return { states: facets.states, counties: facets.counties, cities: facets.cities };
}

export { getLocalizedField } from "@/lib/localized-field";
