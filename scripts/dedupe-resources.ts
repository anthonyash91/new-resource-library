/**
 * Find / archive duplicate active resources (same dedupe fingerprint).
 *
 * Dry-run (default):
 *   npx tsx scripts/dedupe-resources.ts
 *
 * Apply (archives extras, keeps oldest created_at):
 *   npx tsx scripts/dedupe-resources.ts --apply
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { resourceDedupeKey } from "../src/lib/resource-dedupe";

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

type Row = {
  id: string;
  name: string;
  state: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  status: string;
  created_at: string;
};

function preferKeep(a: Row, b: Row): Row {
  const aTime = Date.parse(a.created_at);
  const bTime = Date.parse(b.created_at);
  if (aTime !== bTime) return aTime <= bTime ? a : b;
  // Prefer deterministic seed-style UUIDs (d########-...) over random inserts
  const aSeed = /^d[0-9a-f]{7}-/i.test(a.id);
  const bSeed = /^d[0-9a-f]{7}-/i.test(b.id);
  if (aSeed !== bSeed) return aSeed ? a : b;
  return a.id < b.id ? a : b;
}

async function fetchActiveResources(
  sb: ReturnType<typeof createClient>
): Promise<Row[]> {
  const rows: Row[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from("resources")
      .select("id, name, state, city, address, phone, status, created_at")
      .eq("status", "active")
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as Row[]));
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }

  const sb = createClient(url, key);
  const rows = await fetchActiveResources(sb);
  console.log(`Active resources: ${rows.length}`);

  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = resourceDedupeKey(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const duplicateGroups = [...groups.entries()].filter(([, list]) => list.length > 1);
  const archiveIds: string[] = [];

  console.log(`Duplicate groups: ${duplicateGroups.length}`);

  for (const [, list] of duplicateGroups) {
    let keep = list[0]!;
    for (const row of list.slice(1)) keep = preferKeep(keep, row);
    const extras = list.filter((r) => r.id !== keep.id);
    archiveIds.push(...extras.map((r) => r.id));

    console.log("\n---");
    console.log(`KEEP  ${keep.id}  ${keep.name} (${keep.city}, ${keep.state})`);
    for (const extra of extras) {
      console.log(`ARCHIVE ${extra.id}  created ${extra.created_at}`);
    }
  }

  console.log(`\nExtras to archive: ${archiveIds.length}`);

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to set status=archived on extras.");
    return;
  }

  if (!archiveIds.length) {
    console.log("Nothing to archive.");
    return;
  }

  const batchSize = 100;
  let archived = 0;
  for (let i = 0; i < archiveIds.length; i += batchSize) {
    const batch = archiveIds.slice(i, i + batchSize);
    const { error } = await sb
      .from("resources")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .in("id", batch)
      .eq("status", "active");
    if (error) throw error;
    archived += batch.length;
    console.log(`Archived ${archived} / ${archiveIds.length}`);
  }

  console.log("Done. Apply supabase/migrations/011_resources_active_dedupe.sql next.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
