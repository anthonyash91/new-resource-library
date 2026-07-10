import type { CoverageTierCounts, Resource } from "@/types";

export function isStatewideResource(
  resource: Pick<Resource, "coverage" | "tags">
): boolean {
  if (resource.coverage === "statewide") return true;
  if (resource.coverage) return false;
  return resource.tags.some((tag) => tag.toLowerCase() === "statewide");
}

export function resourceServesCounty(resource: Resource, county: string): boolean {
  if (!county.trim()) return true;
  if (isStatewideResource(resource)) return true;
  const normalized = county.trim();
  if (resource.served_counties?.some((c) => c === normalized)) return true;
  if (!resource.served_counties?.length && resource.county === normalized) return true;
  return false;
}

export type CoverageTier = "local" | "regional" | "statewide";

export function getResourceCoverageTier(
  resource: Resource,
  selectedCounty?: string
): CoverageTier {
  if (isStatewideResource(resource)) return "statewide";

  if (selectedCounty?.trim()) {
    if (resourceLocatedInCounty(resource, selectedCounty)) return "local";
    if (resourceServesCounty(resource, selectedCounty)) return "regional";
  }

  if (resource.coverage === "multi") return "regional";
  return "local";
}

/** Sort key when grouping/paginating county searches: local first, then regional, then statewide. */
export function coverageTierSortOrder(
  resource: Resource,
  selectedCounty?: string
): number {
  if (!selectedCounty?.trim()) return 0;
  const tier = getResourceCoverageTier(resource, selectedCounty);
  if (tier === "local") return 0;
  if (tier === "regional") return 1;
  return 2;
}

export function coverageBadgeKey(
  resource: Resource,
  selectedCounty?: string
): CoverageTier {
  return getResourceCoverageTier(resource, selectedCounty);
}

export function partitionResourcesByCoverageTier(
  resources: Resource[],
  selectedCounty?: string
): { local: Resource[]; regional: Resource[]; statewide: Resource[] } {
  const local: Resource[] = [];
  const regional: Resource[] = [];
  const statewide: Resource[] = [];

  for (const resource of resources) {
    const tier = getResourceCoverageTier(resource, selectedCounty);
    if (tier === "statewide") statewide.push(resource);
    else if (tier === "regional") regional.push(resource);
    else local.push(resource);
  }

  const byName = (a: Resource, b: Resource) => a.name.localeCompare(b.name);
  local.sort(byName);
  regional.sort(byName);
  statewide.sort(byName);

  return { local, regional, statewide };
}

export function countResourcesByCoverageTier(
  resources: Resource[],
  selectedCounty: string
): CoverageTierCounts {
  const counts: CoverageTierCounts = { local: 0, regional: 0, statewide: 0 };
  for (const resource of resources) {
    counts[getResourceCoverageTier(resource, selectedCounty)]++;
  }
  return counts;
}

export function formatServedCounties(counties: string[], max = 8): string {
  if (!counties.length) return "";
  if (counties.length <= max) return counties.join(", ");
  return `${counties.slice(0, max).join(", ")} +${counties.length - max} more`;
}

export function resourceLocatedInCounty(
  resource: Pick<Resource, "county">,
  county: string
): boolean {
  if (!county.trim()) return true;
  return resource.county?.trim() === county.trim();
}

export function shouldShowCountiesServed(
  resource: Pick<Resource, "coverage" | "served_counties">
): boolean {
  if (resource.coverage === "statewide") return false;
  return (resource.served_counties?.length ?? 0) > 0;
}

export function resourceMatchesZipSearch(
  resource: Resource,
  zip: string,
  location: { state: string; city: string; county?: string | null }
): boolean {
  if (resource.state?.trim() !== location.state.trim()) return false;
  if (resource.zip_code?.trim() === zip) return true;
  if (location.county && resourceServesCounty(resource, location.county)) return true;
  if (
    !location.county &&
    location.city &&
    resource.city?.trim().toLowerCase() === location.city.trim().toLowerCase()
  ) {
    return true;
  }
  return isStatewideResource(resource);
}
