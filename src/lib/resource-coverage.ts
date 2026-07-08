import type { Resource } from "@/types";

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

export function coverageBadgeKey(
  resource: Pick<Resource, "coverage">
): "local" | "regional" | "statewide" {
  if (resource.coverage === "statewide") return "statewide";
  if (resource.coverage === "multi") return "regional";
  return "local";
}

export function formatServedCounties(counties: string[], max = 8): string {
  if (!counties.length) return "";
  if (counties.length <= max) return counties.join(", ");
  return `${counties.slice(0, max).join(", ")} +${counties.length - max} more`;
}

export function shouldShowCountiesServed(
  resource: Pick<Resource, "coverage" | "served_counties">
): boolean {
  if (resource.coverage === "statewide") return false;
  return (resource.served_counties?.length ?? 0) > 0;
}
