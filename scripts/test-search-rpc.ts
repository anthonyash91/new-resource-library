import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
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

async function main() {
  loadEnv();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await sb.rpc(
    "search_resources",
    searchRpcParams({
      p_state: "Kentucky",
      p_county: "Campbell",
      p_page: 1,
      p_page_size: 5,
    })
  );

  if (error) {
    console.error("RPC error:", error.code, error.message);
    if (error.code === "PGRST202") {
      console.error(
        "\nsearch_resources is not in the PostgREST schema cache.\n" +
          "Run 007_enterprise_search.sql then the full 008_zip_code_search.sql.\n" +
          "See README.md — do not run the retired 009 drops without recreating the function."
      );
    }
    process.exit(1);
  }

  console.log("Campbell county total:", data.total);
  console.log(
    "sample:",
    (data.resources as { name: string }[]).map((r) => r.name).slice(0, 3)
  );

  const { data: zipData, error: zipError } = await sb.rpc(
    "search_resources",
    searchRpcParams({ p_zip: "40202", p_page_size: 3 })
  );
  if (zipError) {
    console.error("ZIP RPC error:", zipError.message);
    process.exit(1);
  }
  console.log("\nZIP 40202 total:", zipData.total, "resolved:", zipData.resolved_location);
}

main();
