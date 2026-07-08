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
2. Run `supabase/migrations/001_mvp_schema.sql` in the SQL editor.
3. Run `supabase/seed-categories.sql`.
4. Import sample resources:

```bash
npm run import:resources
# or with a custom file:
npx tsx scripts/import-resources-csv.ts data/sample-kentucky-resources.csv
```

5. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local`.

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Homepage with search |
| `/resources` | Search + filters |
| `/resources/[id]` | Program detail |
| `/about`, `/privacy`, `/accessibility` | Static pages |
| `/api/resources` | JSON API (same filters as search page) |

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

## Definition of done checklist

- [x] `npm install && npm run dev` works in mock mode
- [x] Homepage search → `/resources?q=…`
- [x] Filters combine (state, county, category, keyword)
- [x] Detail pages for all seeded resources
- [x] EN ↔ ES language switcher
- [x] README with setup and import instructions
- [x] No auth, admin, or saved resources
