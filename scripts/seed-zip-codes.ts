import { createRequire } from "module";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { fullStateNameFromAbbr } from "../src/lib/zip-code";

const require = createRequire(import.meta.url);
const zipcodes = require("zipcodes") as {
  codes: Record<string, { zip: string; city: string; state: string }>;
  lookup: (zip: string) => { zip: string; city: string; state: string } | undefined;
};

function loadEnv() {
  const root = resolve(__dirname, "..");
  for (const file of [".env.local", ".env"]) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match && !process.env[match[1].trim()]) {
        process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
}

type ZipRow = {
  zip_code: string;
  state: string;
  county: string | null;
  city: string;
};

async function main() {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding ZIP codes.");
  }

  const sb = createClient(url, serviceKey);
  const rows: ZipRow[] = [];

  for (const zip of Object.keys(zipcodes.codes)) {
    const info = zipcodes.lookup(zip);
    if (!info?.city || !info.state) continue;

    const state = fullStateNameFromAbbr(info.state);
    if (!state) continue;

    rows.push({
      zip_code: zip,
      state,
      county: null,
      city: info.city.trim(),
    });
  }

  console.log(`Prepared ${rows.length} ZIP rows from zipcodes package.`);

  const batchSize = 1000;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await sb.from("zip_codes").upsert(batch, { onConflict: "zip_code" });
    if (error) throw error;
    console.log(`Upserted ${Math.min(i + batchSize, rows.length)} / ${rows.length}`);
  }

  const { data: resources, error: resourceError } = await sb
    .from("resources")
    .select("state, county, city")
    .eq("status", "active")
    .not("county", "is", null)
    .not("city", "is", null);

  if (resourceError) throw resourceError;

  const countyByCityState = new Map<string, { state: string; city: string; county: string }>();
  for (const resource of resources ?? []) {
    if (!resource.state || !resource.city || !resource.county) continue;
    const key = `${resource.state.toLowerCase()}|${resource.city.toLowerCase()}`;
    if (!countyByCityState.has(key)) {
      countyByCityState.set(key, {
        state: resource.state,
        city: resource.city,
        county: resource.county.trim(),
      });
    }
  }

  let countyUpdates = 0;
  for (const { state, city, county } of countyByCityState.values()) {
    const { error } = await sb
      .from("zip_codes")
      .update({ county })
      .eq("state", state)
      .ilike("city", city)
      .is("county", null);

    if (error) throw error;
    countyUpdates += 1;
  }

  console.log(`Backfilled counties for ${countyUpdates} city/state pairs from active resources.`);
  console.log("ZIP seed complete. Run 008_zip_code_search.sql if the table is not created yet.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
