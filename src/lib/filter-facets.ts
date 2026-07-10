import type { Category, CategoryFacetOption, CityFacetOption, CountyFacetOption, CoverageTierCounts, FilterFacetSelection, FilterFacets, Resource } from "@/types";
import { getResourceCoverageTier, isStatewideResource, resourceLocatedInCounty, resourceServesCounty } from "@/lib/resource-coverage";

type FacetField = keyof FilterFacetSelection;

type ResourceFacetRow = Pick<
  Resource,
  "state" | "county" | "city" | "served_counties" | "coverage" | "tags" | "category_id"
>;

function applyFacetFilters(
  items: ResourceFacetRow[],
  filters: FilterFacetSelection,
  exclude: FacetField,
  categorySlugById: Map<string, string>
): ResourceFacetRow[] {
  let result = items;

  if (exclude !== "state" && filters.state) {
    result = result.filter((r) => r.state === filters.state);
  }

  if (exclude !== "county" && filters.county) {
    result = result.filter((r) => resourceServesCounty(r as Resource, filters.county!));
  }

  if (exclude !== "city" && filters.city) {
    const city = filters.city.toLowerCase();
    result = result.filter((r) => r.city?.toLowerCase() === city);
  }

  if (exclude !== "category" && filters.category) {
    result = result.filter((r) => categorySlugById.get(r.category_id) === filters.category);
  }

  return result;
}

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b));
}

function countiesFromResources(
  resources: ResourceFacetRow[],
  filters: FilterFacetSelection
): CountyFacetOption[] {
  const countyNames = uniqueSorted(
    resources.flatMap((r) => {
      if (isStatewideResource(r)) return [];
      const list = [...(r.served_counties ?? [])];
      if (r.county) list.push(r.county);
      return list;
    })
  );

  const showCounts = Boolean(filters.state?.trim());

  return countyNames.map((county) => {
    if (!showCounts) return { county };

    const counts: CoverageTierCounts = { local: 0, regional: 0, statewide: 0 };
    for (const resource of resources) {
      if (!resourceServesCounty(resource as Resource, county)) continue;
      counts[getResourceCoverageTier(resource as Resource, county)]++;
    }
    return { county, counts };
  });
}

function citiesFromResources(
  resources: ResourceFacetRow[],
  selectedCounty?: string
): CityFacetOption[] {
  const items = resources.filter((r) => !isStatewideResource(r) && r.city?.trim());

  if (!selectedCounty?.trim()) {
    return uniqueSorted(items.map((r) => r.city)).map((city) => ({
      city,
      locatedInCounty: null,
      isLocal: true,
    }));
  }

  const county = selectedCounty.trim();
  const byCity = new Map<string, CityFacetOption>();

  for (const r of items) {
    if (!resourceServesCounty(r as Resource, county)) continue;

    const city = r.city!.trim();
    const isLocal = resourceLocatedInCounty(r, county);

    if (isLocal) {
      byCity.set(city, { city, locatedInCounty: r.county?.trim() ?? null, isLocal: true });
    } else if (!byCity.get(city)?.isLocal) {
      byCity.set(city, {
        city,
        locatedInCounty: r.county?.trim() ?? null,
        isLocal: false,
      });
    }
  }

  return [...byCity.values()].sort((a, b) => {
    if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
    return a.city.localeCompare(b.city);
  });
}

function categoriesFromResources(
  resources: ResourceFacetRow[],
  categories: Category[],
  filters: FilterFacetSelection
): CategoryFacetOption[] {
  const showCounts = Boolean(filters.state?.trim() && filters.county?.trim());
  const county = filters.county?.trim();

  const countsByCategory = new Map<
    string,
    { local: number; regional: number; statewide: number }
  >();

  if (showCounts && county) {
    for (const resource of resources) {
      const tier = getResourceCoverageTier(resource as Resource, county);
      const bucket = countsByCategory.get(resource.category_id) ?? {
        local: 0,
        regional: 0,
        statewide: 0,
      };
      bucket[tier]++;
      countsByCategory.set(resource.category_id, bucket);
    }
  }

  const activeIds = showCounts
    ? new Set(countsByCategory.keys())
    : new Set(resources.map((r) => r.category_id));

  return categories
    .filter((c) => c.is_active && activeIds.has(c.id))
    .map(({ id, name, slug, sort_order }) => ({
      id,
      name,
      slug,
      sort_order,
      ...(showCounts && countsByCategory.has(id)
        ? { counts: countsByCategory.get(id)! }
        : {}),
    }))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export function computeFilterFacets(
  resources: ResourceFacetRow[],
  categories: Category[],
  filters: FilterFacetSelection
): FilterFacets {
  const categorySlugById = new Map(categories.map((c) => [c.id, c.slug]));

  const forStates = applyFacetFilters(resources, filters, "state", categorySlugById);
  const forCounties = applyFacetFilters(resources, filters, "county", categorySlugById);
  const forCities = applyFacetFilters(resources, filters, "city", categorySlugById);
  const forCategories = applyFacetFilters(resources, filters, "category", categorySlugById);

  return {
    states: uniqueSorted(forStates.map((r) => r.state)),
    counties: countiesFromResources(forCounties, filters),
    cities: citiesFromResources(forCities, filters.county),
    categories: categoriesFromResources(forCategories, categories, filters),
  };
}

/** Clear downstream selections that are no longer valid after a parent filter changes. */
export function sanitizeFacetSelection(
  selection: Required<FilterFacetSelection>,
  facets: FilterFacets,
  changedField: FacetField
): Required<FilterFacetSelection> {
  const next = { ...selection };

  if (changedField === "state") {
    if (next.county && !facets.counties.some((c) => c.county === next.county)) next.county = "";
    if (next.city && !facets.cities.some((c) => c.city === next.city)) next.city = "";
    if (next.category && !facets.categories.some((c) => c.slug === next.category)) {
      next.category = "";
    }
  }

  if (changedField === "county") {
    if (next.city && !facets.cities.some((c) => c.city === next.city)) next.city = "";
    if (next.category && !facets.categories.some((c) => c.slug === next.category)) {
      next.category = "";
    }
  }

  if (changedField === "city") {
    if (next.category && !facets.categories.some((c) => c.slug === next.category)) {
      next.category = "";
    }
  }

  if (changedField === "category") {
    if (next.county && !facets.counties.some((c) => c.county === next.county)) next.county = "";
    if (next.city && !facets.cities.some((c) => c.city === next.city)) next.city = "";
    if (next.state && !facets.states.includes(next.state)) next.state = "";
  }

  return next;
}
