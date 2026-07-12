import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { resourceDedupeKey } from "../src/lib/resource-dedupe";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;

  for (const line of readFileSync(filePath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const root = resolve(__dirname, "..");
loadEnvFile(resolve(root, ".env.local"));
loadEnvFile(resolve(root, ".env"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error(
    "Missing Supabase credentials. Copy .env.example to .env.local and set:\n" +
      "  NEXT_PUBLIC_SUPABASE_URL\n" +
      "  SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const csvPath = process.argv[2] ?? resolve(root, "data/sample-kentucky-resources.csv");
const supabase = createClient(supabaseUrl, serviceKey);

const CATEGORY_SEED = [
  { name: "Housing", slug: "housing", sort_order: 1 },
  { name: "Healthcare", slug: "healthcare", sort_order: 2 },
  { name: "Employment", slug: "employment", sort_order: 3 },
  { name: "Legal Aid", slug: "legal-aid", sort_order: 4 },
  { name: "Financial Assistance", slug: "financial-assistance", sort_order: 5 },
  { name: "Substance Use Treatment", slug: "substance-use-treatment", sort_order: 6 },
  { name: "Food & Nutrition", slug: "food-nutrition", sort_order: 7 },
  { name: "Education", slug: "education", sort_order: 8 },
  { name: "ID & Documentation", slug: "id-documentation", sort_order: 9 },
  { name: "Veterans Services", slug: "veterans", sort_order: 10 },
  { name: "Reentry Support", slug: "reentry-support", sort_order: 11 },
  { name: "Family & Children", slug: "family-services", sort_order: 12 },
  { name: "Transportation", slug: "transportation", sort_order: 13 },
] as const;

/** Map MVP CSV slugs to slugs that may already exist in the shared Supabase project. */
const CATEGORY_ALIASES: Record<string, string> = {
  "family-services": "family-children",
  "reentry-support": "reentry-organizations",
};

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

async function ensureCategories() {
  for (const cat of CATEGORY_SEED) {
    const slug = CATEGORY_ALIASES[cat.slug] ?? cat.slug;

    const { data: existing } = await supabase
      .from("categories")
      .select("id")
      .or(`slug.eq.${slug},name.eq.${cat.name}`)
      .maybeSingle();

    if (existing) continue;

    const { error } = await supabase.from("categories").insert({
      name: cat.name,
      slug,
      sort_order: cat.sort_order,
      is_active: true,
    });

    if (error && error.code !== "23505") throw error;
  }
}

function resolveCategoryId(catBySlug: Map<string, string>, slug: string): string | undefined {
  return catBySlug.get(slug) ?? catBySlug.get(CATEGORY_ALIASES[slug] ?? "");
}

type ImportRow = {
  name: string;
  description: string;
  category_id: string;
  state: string;
  county: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  hours: string | null;
  eligibility: string | null;
  notes: string | null;
  served_counties: string[];
  coverage: string;
  services: string[];
  tags: string[];
  status: "active";
};

async function loadExistingDedupeKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("resources")
      .select("name, state, city, address, phone")
      .eq("status", "active")
      .range(from, from + 999);

    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      keys.add(resourceDedupeKey(row));
    }

    if (data.length < 1000) break;
    from += 1000;
  }

  return keys;
}

async function main() {
  await ensureCategories();

  const { data: categories, error: catError } = await supabase
    .from("categories")
    .select("id, slug");
  if (catError) throw catError;

  if (!categories?.length) {
    throw new Error(
      "No categories found. Run supabase/seed-categories.sql in your Supabase SQL editor first."
    );
  }

  const catBySlug = new Map(categories.map((c) => [c.slug, c.id]));
  const rows = parseCsv(readFileSync(csvPath, "utf-8"));
  const existingKeys = await loadExistingDedupeKeys();

  const payload: ImportRow[] = [];
  let skippedExisting = 0;
  let skippedInFile = 0;
  const seenInFile = new Set<string>();

  for (const row of rows) {
    const categoryId = resolveCategoryId(catBySlug, row.category);
    if (!categoryId) {
      throw new Error(`Unknown category slug: ${row.category}`);
    }
    const served = row.served_counties
      ? row.served_counties.split("|").map((s) => s.trim()).filter(Boolean)
      : [];

    const candidate: ImportRow = {
      name: row.name,
      description: row.description,
      category_id: categoryId,
      state: row.state || "Kentucky",
      county: row.county || null,
      city: row.city || null,
      address: row.address || null,
      phone: row.phone || null,
      website: row.website || null,
      hours: row.hours || null,
      eligibility: row.eligibility || null,
      notes: row.notes || null,
      served_counties: served,
      coverage: row.coverage || "single",
      services: [],
      tags: [],
      status: "active",
    };

    const key = resourceDedupeKey(candidate);
    if (seenInFile.has(key)) {
      skippedInFile += 1;
      continue;
    }
    seenInFile.add(key);

    if (existingKeys.has(key)) {
      skippedExisting += 1;
      continue;
    }

    existingKeys.add(key);
    payload.push(candidate);
  }

  if (!payload.length) {
    console.log(
      `No new resources to import from ${csvPath} ` +
        `(skipped existing: ${skippedExisting}, skipped in-file dupes: ${skippedInFile}).`
    );
    return;
  }

  const batchSize = 200;
  let inserted = 0;
  for (let i = 0; i < payload.length; i += batchSize) {
    const batch = payload.slice(i, i + batchSize);
    const { error } = await supabase.from("resources").insert(batch);
    if (error) throw error;
    inserted += batch.length;
    console.log(`Inserted ${inserted} / ${payload.length}`);
  }

  console.log(
    `Imported ${inserted} resources from ${csvPath} ` +
      `(skipped existing: ${skippedExisting}, skipped in-file dupes: ${skippedInFile}).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
