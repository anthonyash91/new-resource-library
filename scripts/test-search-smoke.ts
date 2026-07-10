import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { isMalformedZipParam } from "../src/lib/validation";
import { searchRpcParams } from "./lib/search-rpc-params";

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

type CaseResult = { name: string; ok: boolean; detail: string };

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const sb = createClient(url, key);
  const results: CaseResult[] = [];

  // Validation: malformed ZIP detection
  results.push({
    name: "malformed zip validation",
    ok: isMalformedZipParam("abc", undefined) && !isMalformedZipParam("40202", "40202"),
    detail: "isMalformedZipParam",
  });

  async function rpcSearch(label: string, params: ReturnType<typeof searchRpcParams>, checks: (data: Record<string, unknown>) => boolean) {
    const { data, error } = await sb.rpc("search_resources", params);
    if (error) {
      results.push({ name: label, ok: false, detail: `${error.code} ${error.message}` });
      return;
    }
    const ok = checks(data as Record<string, unknown>);
    results.push({
      name: label,
      ok,
      detail: ok ? `total=${data.total}` : `unexpected payload: ${JSON.stringify(data).slice(0, 120)}`,
    });
  }

  await rpcSearch(
    "Kentucky / Campbell county",
    searchRpcParams({ p_state: "Kentucky", p_county: "Campbell", p_page_size: 5 }),
    (d) => Number(d.total) > 0 && Array.isArray(d.resources)
  );

  await rpcSearch(
    "ZIP 40202 (Louisville KY)",
    searchRpcParams({ p_zip: "40202", p_page_size: 5 }),
    (d) => Number(d.total) > 0 && d.zip_not_found === false && Boolean(d.resolved_location)
  );

  await rpcSearch(
    "ZIP 78701 (Austin TX)",
    searchRpcParams({ p_zip: "78701", p_page_size: 5 }),
    (d) => Number(d.total) > 0 && d.zip_not_found === false
  );

  await rpcSearch(
    "Texas state-only",
    searchRpcParams({ p_state: "Texas", p_page_size: 5 }),
    (d) => {
      const resources = d.resources as { state: string }[];
      return Number(d.total) > 0 && resources.every((r) => r.state === "Texas");
    }
  );

  await rpcSearch(
    "unknown ZIP 99999",
    searchRpcParams({ p_zip: "99999", p_page_size: 5 }),
    (d) => d.zip_not_found === true && Number(d.total) === 0
  );

  // Load-more / page 2 offset
  const page1 = await sb.rpc(
    "search_resources",
    searchRpcParams({ p_state: "Kentucky", p_county: "Campbell", p_page: 1, p_page_size: 24 })
  );
  const page2 = await sb.rpc(
    "search_resources",
    searchRpcParams({ p_state: "Kentucky", p_county: "Campbell", p_page: 2, p_page_size: 24 })
  );
  if (page1.error || page2.error) {
    results.push({
      name: "load more page 2",
      ok: false,
      detail: page1.error?.message ?? page2.error?.message ?? "rpc error",
    });
  } else {
    const ids1 = new Set((page1.data.resources as { id: string }[]).map((r) => r.id));
    const ids2 = (page2.data.resources as { id: string }[]).map((r) => r.id);
    const overlap = ids2.filter((id) => ids1.has(id));
    results.push({
      name: "load more page 2",
      ok: Number(page2.data.total) > 24 && ids2.length > 0 && overlap.length === 0,
      detail: `page1=${ids1.size} page2=${ids2.length} overlap=${overlap.length}`,
    });
  }

  let passed = 0;
  let failed = 0;
  for (const r of results) {
    console.log(r.ok ? "PASS" : "FAIL", "-", r.name, "—", r.detail);
    if (r.ok) passed++;
    else failed++;
  }

  console.log(`\n--- Smoke summary: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

main();
