import type { Category, Resource, ResourceFilters, ResourceQueryResult, LocationFacets } from "@/types";
import { isStatewideResource, resourceServesCounty } from "@/lib/resource-coverage";
import { createSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { PAGE_SIZE, resourceFiltersSchema } from "@/lib/validation";
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

function filterMockResources(filters: ResourceFilters): ResourceQueryResult {
  const parsed = resourceFiltersSchema.parse(filters);
  const categories = store.categories.filter((c) => c.is_active);
  let items = store.resources.filter((r) => r.status === "active");

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

  if (parsed.sort === "newest") {
    items.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  } else {
    items.sort((a, b) => a.name.localeCompare(b.name));
  }

  const total = items.length;
  const page = parsed.page;
  const start = (page - 1) * PAGE_SIZE;
  const paged = items.slice(start, start + PAGE_SIZE);

  return {
    resources: attachCategories(paged, categories),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

async function querySupabase(filters: ResourceFilters): Promise<ResourceQueryResult> {
  const parsed = resourceFiltersSchema.parse(filters);
  const supabase = createSupabaseClient();

  let query = supabase
    .from("resources")
    .select("*, category:categories(*)", { count: "exact" })
    .eq("status", "active");

  if (parsed.category) {
    const { data: cat } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", parsed.category)
      .eq("is_active", true)
      .maybeSingle();
    if (cat) query = query.eq("category_id", cat.id);
  }

  if (parsed.state) query = query.eq("state", parsed.state);
  if (parsed.city) query = query.ilike("city", parsed.city);

  if (parsed.q?.trim()) {
    const q = `%${parsed.q.trim()}%`;
    query = query.or(
      `name.ilike.${q},description.ilike.${q},city.ilike.${q},county.ilike.${q}`
    );
  }

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

  let resources = (data ?? []) as Resource[];

  if (parsed.county) {
    resources = resources.filter((r) => resourceServesCounty(r, parsed.county!));
  }

  const total = parsed.county ? resources.length : count ?? resources.length;

  return {
    resources,
    total,
    page: parsed.page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
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

export async function getLocationFacets(state?: string, county?: string): Promise<LocationFacets> {
  let items: Resource[];

  if (!isSupabaseConfigured()) {
    items = store.resources.filter((r) => r.status === "active");
  } else {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("resources")
      .select("state, county, city, served_counties, coverage, tags")
      .eq("status", "active");
    if (error) throw error;
    items = (data ?? []) as Resource[];
  }

  if (state) {
    items = items.filter((r) => r.state === state);
  }

  const states = [...new Set(items.map((r) => r.state).filter(Boolean) as string[])].sort();
  const counties = [
    ...new Set(
      items.flatMap((r) => {
        const list = [...(r.served_counties ?? [])];
        if (r.county) list.push(r.county);
        return list;
      })
    ),
  ].sort();

  let cities = items.map((r) => r.city).filter(Boolean) as string[];
  if (county) {
    cities = items
      .filter((r) => resourceServesCounty(r, county) && !isStatewideResource(r))
      .map((r) => r.city)
      .filter(Boolean) as string[];
  }
  cities = [...new Set(cities)].sort();

  return { states, counties, cities };
}

export function getLocalizedField(
  locale: "en" | "es",
  enValue: string | null | undefined,
  esValue?: string | null
): string {
  if (locale === "es" && esValue?.trim()) return esValue.trim();
  return enValue?.trim() ?? "";
}
