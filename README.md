# Road to Reentry — MVP

A fast, accessible, mobile-first directory helping people coming home from incarceration find local reentry programs (housing, jobs, healthcare, legal aid, benefits, and more).

**This is a directory only** — users contact programs directly. No accounts, admin UI, or saved lists in this MVP.

## Quick start (mock mode)

No database required for local development:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app loads **55 sample Kentucky programs** from `data/mock-resources.json` when Supabase env vars are not set.

## Tech stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS
- Supabase (PostgreSQL) — optional for production
- Zod for query validation

## Environment variables

Copy `.env.example` to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Leave Supabase vars empty to use mock data.

For CSV import, also set:

```env
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Supabase setup

1. Create a Supabase project.
2. Run migrations in the SQL editor **in this order**:

| Order | File | Purpose |
|-------|------|---------|
| 1 | `001_mvp_schema.sql` | Core tables |
| 2 | `003_filter_facets_rpc.sql` | Facet helpers + `get_filter_facets` |
| 3 | `006_filter_facets_all_states.sql` | Full state list in facets (supersedes 004/005) |
| 4 | `007_enterprise_search.sql` | FTS, bounded RPC params, tier totals |
| 5 | `008_zip_code_search.sql` | ZIP table, `search_resources` with `p_zip` |
| 6 | `010_search_resources_public_json.sql` | Allowlisted resource JSON (no `search_vector`) |

Skip `002`, `004`, and `005` on greenfield deploys — they are superseded by `007`/`008` and `006`.

`009_fix_search_resources_overload.sql` is a **no-op** (retired). Do **not** drop `search_resources` manually unless PostgREST reports an overload error; see comments in that file for recovery.

3. Run `supabase/seed-categories.sql`.
4. Import resources (if starting fresh):

```bash
npm run import:resources
```

5. Seed US ZIP codes (required for ZIP search):

```bash
npm run seed:zip-codes
```

Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

6. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local`.

### Verify search deployment

```bash
npm run test:rpc          # Campbell county + ZIP 40202 smoke
npm run test:facets       # Facet RPC
npm run test:multi-state  # Cross-state count parity
npm run test:smoke        # ZIP, Texas, pagination, unknown ZIP
```

### Scalable search (10k+ resources)

- **`search_resources` RPC** (`008` + `010`) — county/ZIP/keyword search with true DB pagination, FTS, tier sorting, tier totals, and allowlisted JSON.
- **`get_filter_facets` RPC** (`006`) — cascading filter dropdowns computed in SQL.
- **Production fail-closed:** when `NODE_ENV=production` (or `SEARCH_REQUIRE_RPC=true`), missing RPCs return errors instead of loading the full catalog into Node.
- **API rate limits:** middleware limits `/api/*` (120/min/IP). Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` for shared limits across Vercel instances.

### Upgrading an existing database

If you already ran `002`–`008`, apply `010_search_resources_public_json.sql`, then optionally configure Upstash for production rate limiting.

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Homepage with search |
| `/resources` | Search + filters |
| `/resources/[id]` | Program detail |
| `/about`, `/privacy`, `/accessibility` | Static pages |
| `/api/resources` | JSON API (same filters as search page) |
| `/api/facets` | Cascading filter facet options |

## Seed data

- `data/sample-kentucky-resources.csv` — 55 programs across 40+ Kentucky counties and 13 categories
- `data/mock-resources.json` — in-memory store for mock mode
- `scripts/generate-mock-data.py` — regenerates mock JSON/CSV from the full Kentucky reference dataset

## Assumptions (MVP defaults)

- **Primary state:** Kentucky
- **Brand:** Road to Reentry
- **Hosting:** Vercel + Supabase (recommended)
- **Categories:** 13 fixed categories (see `supabase/seed-categories.sql`)
- **i18n:** English + Spanish UI; resource body falls back to English when `*_es` fields are empty

## Project structure

```
src/
  app/           # Routes
  components/    # UI
  lib/data.ts    # Data access (mock + Supabase)
  types/         # Shared types
  i18n/messages/ # en.ts + es.ts
data/            # Mock JSON + sample CSV
supabase/        # Schema + category seed
scripts/         # CSV import + data generation
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run import:resources` | Import CSV into Supabase |
| `npm run seed:zip-codes` | Seed `zip_codes` table from npm `zipcodes` package |
| `npm run test:rpc` | Smoke test `search_resources` RPC |
| `npm run test:facets` | Smoke test `get_filter_facets` RPC |
| `npm run test:multi-state` | Cross-state RPC vs legacy parity |
| `npm run test:smoke` | End-to-end search smoke (ZIP, Texas, pagination) |

## Definition of done checklist

- [x] `npm install && npm run dev` works in mock mode
- [x] Homepage search → `/resources?q=…`
- [x] Filters combine (state, county, category, keyword)
- [x] Detail pages for all seeded resources
- [x] EN ↔ ES language switcher
- [x] README with setup and import instructions
- [x] No auth, admin, or saved resources
