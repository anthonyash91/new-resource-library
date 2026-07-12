import type { Resource } from "@/types";

/** Columns safe to expose from search_resources / list APIs (excludes search_vector, etc.). */
const PUBLIC_RESOURCE_KEYS = [
  "id",
  "name",
  "description",
  "description_es",
  "category_id",
  "state",
  "county",
  "city",
  "address",
  "zip_code",
  "phone",
  "email",
  "website",
  "hours",
  "eligibility",
  "eligibility_es",
  "notes",
  "notes_es",
  "served_counties",
  "coverage",
  "services",
  "tags",
  "status",
  "created_at",
  "updated_at",
] as const;

type PublicResourceKey = (typeof PUBLIC_RESOURCE_KEYS)[number];

/** Strip internal columns (e.g. search_vector) from RPC/PostgREST payloads. */
export function toPublicResource(row: Record<string, unknown> | Resource): Resource {
  const out: Record<string, unknown> = {};
  for (const key of PUBLIC_RESOURCE_KEYS) {
    if (key in row) out[key] = (row as Record<string, unknown>)[key];
  }
  if ("category" in row && row.category) {
    out.category = row.category;
  }
  return out as unknown as Resource;
}

export function toPublicResources(
  rows: Array<Record<string, unknown> | Resource> | null | undefined
): Resource[] {
  return (rows ?? []).map((row) => toPublicResource(row));
}

export type { PublicResourceKey };
