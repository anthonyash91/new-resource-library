/** Map USPS state abbreviations to full names used in the resources table. */
export const US_STATE_ABBR_TO_NAME: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

const ZIP_PATTERN = /^\d{5}$/;

/** Normalize user input to a 5-digit US ZIP code, or null when invalid. */
export function normalizeUsZipCode(input: string | undefined | null): string | null {
  if (!input?.trim()) return null;
  const digits = input.replace(/\D/g, "");
  if (digits.length < 5) return null;
  const zip = digits.slice(0, 5);
  return ZIP_PATTERN.test(zip) ? zip : null;
}

export function isValidUsZipCode(input: string | undefined | null): boolean {
  return normalizeUsZipCode(input) !== null;
}

/** If the keyword is only a ZIP code, treat it as a zip search instead of full-text. */
export function extractZipFromKeyword(keyword: string | undefined): string | null {
  if (!keyword?.trim()) return null;
  const trimmed = keyword.trim();
  if (!/^\d{5}(?:-\d{4})?$/.test(trimmed)) return null;
  return normalizeUsZipCode(trimmed);
}

export function fullStateNameFromAbbr(abbr: string): string | null {
  return US_STATE_ABBR_TO_NAME[abbr.toUpperCase()] ?? null;
}
