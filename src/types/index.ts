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
  state?: string;
  county?: string;
  city?: string;
  category?: string;
  page?: number;
  sort?: "name" | "newest";
}

export interface ResourceQueryResult {
  resources: Resource[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface LocationFacets {
  states: string[];
  counties: string[];
  cities: string[];
}
