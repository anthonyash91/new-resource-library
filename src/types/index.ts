export type ResourceStatus = "active" | "archived";
export type ResourceCoverage = "single" | "multi" | "statewide";

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface Resource {
  id: string;
  name: string;
  description: string;
  description_es?: string | null;
  category_id: string;
  category?: Category;
  state: string | null;
  county: string | null;
  city: string | null;
  address: string | null;
  zip_code?: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  hours: string | null;
  eligibility: string | null;
  eligibility_es?: string | null;
  notes?: string | null;
  notes_es?: string | null;
  served_counties?: string[];
  coverage?: ResourceCoverage;
  services: string[];
  tags: string[];
  status: ResourceStatus;
  created_at: string;
  updated_at: string;
}

export interface ResourceFilters {
  q?: string;
  zip?: string;
  state?: string;
  county?: string;
  city?: string;
  category?: string;
  page?: number;
  sort?: "name" | "newest";
}

export interface ResolvedZipLocation {
  zip: string;
  state: string;
  county?: string | null;
  city: string;
}

export interface ResourceQueryResult {
  resources: Resource[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Full tier totals for county or ZIP searches (before pagination). */
  tierTotals?: CoverageTierCounts;
  resolvedLocation?: ResolvedZipLocation;
  zipNotFound?: boolean;
}

export interface LocationFacets {
  states: string[];
  counties: string[];
  cities: string[];
}

export interface FilterFacetSelection {
  state?: string;
  county?: string;
  city?: string;
  category?: string;
}

/** City option for filter dropdowns; regional providers note their home county. */
export interface CityFacetOption {
  city: string;
  /** Primary office county when different from the selected filter county. */
  locatedInCounty: string | null;
  isLocal: boolean;
}

export interface CoverageTierCounts {
  local: number;
  regional: number;
  statewide: number;
}

export interface CountyFacetOption {
  county: string;
  /** Present when a state filter is selected. */
  counts?: CoverageTierCounts;
}

export interface CategoryFacetOption {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  /** Present when state and county filters are both selected. */
  counts?: CoverageTierCounts;
}

export interface FilterFacets {
  states: string[];
  counties: CountyFacetOption[];
  cities: CityFacetOption[];
  categories: CategoryFacetOption[];
}
