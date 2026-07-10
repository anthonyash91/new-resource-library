/** Pick localized resource text without pulling in the data layer. */
export function getLocalizedField(
  locale: "en" | "es",
  enValue: string | null | undefined,
  esValue?: string | null
): string {
  if (locale === "es" && esValue?.trim()) return esValue.trim();
  return enValue?.trim() ?? "";
}
