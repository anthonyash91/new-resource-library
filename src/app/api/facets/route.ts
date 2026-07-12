import { NextRequest, NextResponse } from "next/server";
import { getFilterFacets } from "@/lib/data";
import { filterFacetSchema } from "@/lib/validation";

const FACET_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=600";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const parsed = filterFacetSchema.safeParse({
    state: sp.get("state") || undefined,
    county: sp.get("county") || undefined,
    city: sp.get("city") || undefined,
    category: sp.get("category") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const facets = await getFilterFacets(parsed.data);
    return NextResponse.json(facets, {
      headers: {
        "Cache-Control": FACET_CACHE_CONTROL,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Filter options are temporarily unavailable." },
      { status: 503 }
    );
  }
}
