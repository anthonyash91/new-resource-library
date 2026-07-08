#!/usr/bin/env python3
"""Generate mock-resources.json and sample-kentucky-resources.csv from reference Kentucky data."""

import csv
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

REF_CSV = Path("/Users/anthony/Resource Library/data/kentucky-resources.csv")
OUT_JSON = Path(__file__).resolve().parent.parent / "data" / "mock-resources.json"
OUT_CSV = Path(__file__).resolve().parent.parent / "data" / "sample-kentucky-resources.csv"

CATEGORIES = [
    ("housing", "Housing", 1),
    ("healthcare", "Healthcare", 2),
    ("employment", "Employment", 3),
    ("legal-aid", "Legal Aid", 4),
    ("financial-assistance", "Financial Assistance", 5),
    ("substance-use-treatment", "Substance Use Treatment", 6),
    ("food-nutrition", "Food & Nutrition", 7),
    ("education", "Education", 8),
    ("id-documentation", "ID & Documentation", 9),
    ("veterans", "Veterans Services", 10),
    ("reentry-support", "Reentry Support", 11),
    ("family-services", "Family & Children", 12),
    ("transportation", "Transportation", 13),
]

CATEGORY_MAP = {
    "housing": "housing",
    "healthcare": "healthcare",
    "employment": "employment",
    "legal-aid": "legal-aid",
    "financial-assistance": "financial-assistance",
    "substance-use-treatment": "substance-use-treatment",
    "food-nutrition": "food-nutrition",
    "education": "education",
    "id-documentation": "id-documentation",
    "veterans": "veterans",
    "basic-needs": "food-nutrition",
    "family-children": "family-services",
    "peer-support": "reentry-support",
    "probation-parole": "legal-aid",
    "reentry-organizations": "reentry-support",
    "state-agency": "reentry-support",
    "transportation": "transportation",
}

CAT_IDS = {slug: str(uuid.uuid5(uuid.NAMESPACE_DNS, f"category-{slug}")) for slug, _, _ in CATEGORIES}

NOW = datetime.now(timezone.utc).isoformat()


def parse_pipe_list(value: str) -> list[str]:
    if not value or not value.strip():
        return []
    return [p.strip() for p in value.split("|") if p.strip()]


def main() -> None:
    rows: list[dict] = []
    with REF_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)

    # Select up to 55 rows prioritizing category and county diversity
    selected: list[dict] = []
    seen_cats: set[str] = set()
    seen_counties: set[str] = set()

    def score(row: dict) -> tuple[int, int, int]:
        cat = CATEGORY_MAP.get((row.get("category") or "").strip(), "reentry-support")
        county = (row.get("county") or "").strip()
        new_cat = 0 if cat in seen_cats else 1
        new_county = 0 if county in seen_counties else 1
        return (new_cat + new_county, new_cat, new_county)

    remaining = rows[:]
    while len(selected) < 55 and remaining:
        remaining.sort(key=score, reverse=True)
        pick = remaining.pop(0)
        selected.append(pick)
        seen_cats.add(CATEGORY_MAP.get((pick.get("category") or "").strip(), "reentry-support"))
        county = (pick.get("county") or "").strip()
        if county:
            seen_counties.add(county)

    categories = [
        {
            "id": CAT_IDS[slug],
            "name": name,
            "slug": slug,
            "description": None,
            "sort_order": order,
            "is_active": True,
        }
        for slug, name, order in CATEGORIES
    ]

    resources = []
    csv_out_rows = []

    for i, row in enumerate(selected):
        raw_cat = (row.get("category") or "reentry-organizations").strip()
        cat_slug = CATEGORY_MAP.get(raw_cat, "reentry-support")
        coverage = (row.get("coverage") or "single").strip()
        if coverage not in ("single", "multi", "statewide"):
            coverage = "single"

        served = parse_pipe_list(row.get("served_counties") or "")
        tags = [t.lower().replace(" ", "-") for t in parse_pipe_list(row.get("tags") or "")]
        services = parse_pipe_list(row.get("services") or "")

        rid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"resource-ky-{row.get('id', i)}"))

        resource = {
            "id": rid,
            "name": row.get("name", "").strip(),
            "description": row.get("description", "").strip(),
            "description_es": row.get("description_es") or None,
            "category_id": CAT_IDS[cat_slug],
            "state": "Kentucky",
            "county": row.get("county") or None,
            "city": row.get("city") or None,
            "address": row.get("address") or None,
            "phone": row.get("phone") or None,
            "email": row.get("email") or None,
            "website": row.get("website") or None,
            "hours": row.get("hours") or None,
            "eligibility": row.get("eligibility") or None,
            "eligibility_es": row.get("eligibility_es") or None,
            "notes": row.get("notes") or None,
            "notes_es": row.get("notes_es") or None,
            "served_counties": served,
            "coverage": coverage,
            "services": services,
            "tags": tags,
            "status": "active",
            "created_at": NOW,
            "updated_at": NOW,
        }
        resources.append(resource)

        csv_out_rows.append({
            "name": resource["name"],
            "category": cat_slug,
            "description": resource["description"],
            "address": resource["address"] or "",
            "city": resource["city"] or "",
            "phone": resource["phone"] or "",
            "website": resource["website"] or "",
            "eligibility": resource["eligibility"] or "",
            "notes": resource["notes"] or "",
            "hours": resource["hours"] or "",
            "county": resource["county"] or "",
            "served_counties": "|".join(served),
            "coverage": coverage,
            "state": "Kentucky",
        })

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(
        json.dumps({"categories": categories, "resources": resources}, indent=2),
        encoding="utf-8",
    )

    fieldnames = [
        "name", "category", "description", "address", "city", "phone", "website",
        "eligibility", "notes", "hours", "county", "served_counties", "coverage", "state",
    ]
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(csv_out_rows)

    counties = {r["county"] for r in resources if r["county"]}
    cats = {r["category_id"] for r in resources}
    print(f"Wrote {len(resources)} resources, {len(counties)} counties, {len(cats)} categories")
    print(f"  -> {OUT_JSON}")
    print(f"  -> {OUT_CSV}")


if __name__ == "__main__":
    main()
