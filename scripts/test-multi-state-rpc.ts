import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { computeFilterFacets } from "../src/lib/filter-facets";
import type { FilterFacets } from "../src/types";
import { searchRpcParams } from "./lib/search-rpc-params";

const TEST_STATES = [
  "Kentucky",
  "Michigan",
  "Georgia",
  "Ohio",
  "Florida",
  "North Carolina",
];

function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const p = resolve(f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
}

type CountyRow = {
  coverage: string;
  county: string | null;
  served_counties: string[] | null;
};

type FacetRow = CountyRow & {
  state: string | null;
  city: string | null;
  tags: string[];
  category_id: string;
};

function servesCounty(resource: CountyRow, county: string): boolean {
  if (resource.coverage === "statewide") return true;
  if ((resource.served_counties ?? []).includes(county)) return true;
  if (!resource.served_counties?.length && resource.county === county) return true;
  return false;
}

/** Compare facet shape. County tier counts come from client enrichment (see data.ts), not raw RPC. */
function stableFacets(facets: FilterFacets): string {
  return JSON.stringify({
    states: facets.states,
    counties: facets.counties.map((c) => c.county).sort((a, b) => a.localeCompare(b)),
    cities: facets.cities.map((c) => ({
      city: c.city,
      locatedInCounty: c.locatedInCounty,
      isLocal: c.isLocal,
    })),
    categories: facets.categories
      .map((c) => ({
        slug: c.slug,
        counts: c.counts ?? null,
      }))
      .sort((a, b) => a.slug.localeCompare(b.slug)),
  });
}

async function fetchAllFacetRows(
  sb: SupabaseClient,
  select: string
): Promise<FacetRow[]> {
  const rows: FacetRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await sb
      .from("resources")
      .select(select)
      .eq("status", "active")
      .range(from, from + 999);

    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as FacetRow[]));
    if (data.length < 1000) break;
    from += 1000;
  }

  return rows;
}

async function fetchStateRows(
  sb: SupabaseClient,
  state: string,
  select: string
): Promise<FacetRow[]> {
  const rows: FacetRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await sb
      .from("resources")
      .select(select)
      .eq("status", "active")
      .eq("state", state)
      .range(from, from + 999);

    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as FacetRow[]));
    if (data.length < 1000) break;
    from += 1000;
  }

  return rows;
}

async function pickSampleCounty(sb: SupabaseClient, state: string): Promise<string | null> {
  const rows = await fetchStateRows(
    sb,
    state,
    "county, served_counties, coverage"
  );

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.county?.trim()) {
      counts.set(row.county.trim(), (counts.get(row.county.trim()) ?? 0) + 1);
    }
    for (const county of row.served_counties ?? []) {
      if (county.trim()) {
        counts.set(county.trim(), (counts.get(county.trim()) ?? 0) + 1);
      }
    }
  }

  if (!counts.size) return null;

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

async function legacyCountyTotal(
  sb: SupabaseClient,
  state: string,
  county: string
): Promise<number> {
  const rows = await fetchStateRows(
    sb,
    state,
    "coverage, county, served_counties"
  );
  return rows.filter((r) => servesCounty(r, county)).length;
}

async function legacyFacets(
  sb: SupabaseClient,
  filters: { state: string; county: string }
): Promise<FilterFacets> {
  const rows = await fetchAllFacetRows(
    sb,
    "state, county, city, served_counties, coverage, tags, category_id"
  );

  const { data: categories, error } = await sb
    .from("categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  return computeFilterFacets(rows, categories ?? [], filters);
}

async function assertRpcsDeployed(sb: SupabaseClient): Promise<void> {
  const { error: searchError } = await sb.rpc(
    "search_resources",
    searchRpcParams({ p_state: "Kentucky", p_page_size: 1 })
  );
  if (searchError?.code === "PGRST202") {
    throw new Error(
      "search_resources RPC not deployed — run 007_enterprise_search.sql and 008_zip_code_search.sql"
    );
  }
  if (searchError) throw searchError;

  const { error: facetsError } = await sb.rpc("get_filter_facets", {
    p_state: "Kentucky",
  });
  if (facetsError?.code === "PGRST202") {
    throw new Error("get_filter_facets RPC not deployed — run 003_filter_facets_rpc.sql");
  }
  if (facetsError) throw facetsError;
}

async function testState(sb: SupabaseClient, state: string): Promise<boolean> {
  console.log(`\n=== ${state} ===`);

  const { data: stateSearch, error: stateSearchError } = await sb.rpc(
    "search_resources",
    searchRpcParams({ p_state: state, p_page_size: 1 })
  );
  if (stateSearchError) throw stateSearchError;

  const stateTotal = Number(stateSearch.total);
  console.log(`State search total: ${stateTotal}`);
  if (stateTotal <= 0) {
    console.error(`FAIL — no active resources for ${state}`);
    return false;
  }

  const county = await pickSampleCounty(sb, state);
  if (!county) {
    console.error(`FAIL — could not pick a sample county for ${state}`);
    return false;
  }
  console.log(`Sample county: ${county}`);

  const legacyTotal = await legacyCountyTotal(sb, state, county);
  const { data: countySearch, error: countySearchError } = await sb.rpc(
    "search_resources",
    searchRpcParams({
      p_state: state,
      p_county: county,
      p_page_size: 1,
    })
  );
  if (countySearchError) throw countySearchError;

  const rpcTotal = Number(countySearch.total);
  console.log(`County search — legacy: ${legacyTotal}, RPC: ${rpcTotal}`);
  if (legacyTotal !== rpcTotal) {
    console.error(`FAIL — search count mismatch for ${state} / ${county}`);
    return false;
  }

  const filters = { state, county };
  const legacy = await legacyFacets(sb, filters);
  const { data: rpcFacets, error: facetsError } = await sb.rpc("get_filter_facets", {
    p_state: state,
    p_county: county,
  });
  if (facetsError) throw facetsError;

  const rpc = rpcFacets as FilterFacets;
  console.log(
    `Facets — counties: ${rpc.counties.length}, categories: ${rpc.categories.length}, cities: ${rpc.cities.length}`
  );

  if (stableFacets(legacy) !== stableFacets(rpc)) {
    console.error(`FAIL — facet mismatch for ${state} / ${county}`);
    return false;
  }

  console.log("PASS");
  return true;
}

async function testGlobalStateFacet(sb: SupabaseClient): Promise<boolean> {
  console.log("\n=== Global state facet (no filters) ===");

  const { data: rpcFacets, error } = await sb.rpc("get_filter_facets", {});
  if (error) throw error;

  const rpc = rpcFacets as FilterFacets;
  console.log(`RPC states (${rpc.states.length}): ${rpc.states.join(", ")}`);

  if (rpc.states.length < TEST_STATES.length) {
    console.error("FAIL — expected multiple states in unfiltered facet list");
    return false;
  }

  for (const state of TEST_STATES) {
    if (!rpc.states.includes(state)) {
      console.error(`FAIL — missing ${state} in global state facet`);
      return false;
    }
  }

  console.log("PASS");
  return true;
}

async function main() {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const sb = createClient(url, key);
  await assertRpcsDeployed(sb);

  let passed = 0;
  let failed = 0;

  if (await testGlobalStateFacet(sb)) passed++;
  else failed++;

  for (const state of TEST_STATES) {
    if (await testState(sb, state)) passed++;
    else failed++;
  }

  console.log(`\n--- Summary: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

main();
