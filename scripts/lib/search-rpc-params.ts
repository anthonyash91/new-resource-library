/** Matches `search_resources` in 008_zip_code_search.sql — pass all keys so PostgREST resolves the RPC. */
export type SearchRpcParams = {
  p_q?: string | null;
  p_state?: string | null;
  p_county?: string | null;
  p_city?: string | null;
  p_category_slug?: string | null;
  p_zip?: string | null;
  p_sort?: "name" | "newest";
  p_page?: number;
  p_page_size?: number;
};

export function searchRpcParams(overrides: SearchRpcParams = {}) {
  return {
    p_q: null,
    p_state: null,
    p_county: null,
    p_city: null,
    p_category_slug: null,
    p_zip: null,
    p_sort: "name" as const,
    p_page: 1,
    p_page_size: 24,
    ...overrides,
  };
}
