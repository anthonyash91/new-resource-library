import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

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

  const { data, error } = await sb.rpc("get_filter_facets", {
    p_state: "Kentucky",
    p_county: "Campbell",
  });

  if (error) {
    console.error("RPC error:", error.code, error.message);
    process.exit(1);
  }

  const states = data.states as string[];
  if (states.length < 2) {
    console.error("Expected full state list when p_state is set, got:", states);
    process.exit(1);
  }

  console.log("states:", states.length, "options");
  console.log("counties:", data.counties.length, "options");
  console.log("cities:", data.cities);
  console.log("categories:", data.categories.map((c: { slug: string }) => c.slug));
}

main();
