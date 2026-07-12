/**
 * When true, search/facets must use PostgreSQL RPCs — never the full-table Node fallback.
 *
 * Default: on in production. Override with SEARCH_REQUIRE_RPC=true|false.
 */
export function shouldRequireSearchRpc(): boolean {
  const override = process.env.SEARCH_REQUIRE_RPC?.trim().toLowerCase();
  if (override === "true" || override === "1") return true;
  if (override === "false" || override === "0") return false;
  return process.env.NODE_ENV === "production";
}

export class SearchRpcUnavailableError extends Error {
  constructor(message = "Search RPC is unavailable. Deploy migrations 007–008 (and 010).") {
    super(message);
    this.name = "SearchRpcUnavailableError";
  }
}
