/** Fingerprint for active-resource deduplication (must match SQL resource_dedupe_key). */

export type ResourceDedupeFields = {
  name: string;
  state?: string | null;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Stable key for name + location + phone. Used by import skip + cleanup scripts. */
export function resourceDedupeKey(fields: ResourceDedupeFields): string {
  return [
    normalizeText(fields.name),
    normalizeText(fields.state),
    normalizeText(fields.city),
    normalizeText(fields.address),
    normalizePhone(fields.phone),
  ].join("\u001f");
}
