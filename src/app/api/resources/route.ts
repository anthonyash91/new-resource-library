import { NextRequest, NextResponse } from "next/server";
import { queryResources } from "@/lib/data";
import { resourceFiltersSchema, shouldQueryResources, isMalformedZipParam, PAGE_SIZE } from "@/lib/validation";

const RESOURCE_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=120";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const filters = resourceFiltersSchema.safeParse({
    q: sp.get("q") ?? undefined,
    zip: sp.get("zip") ?? undefined,
    state: sp.get("state") ?? undefined,
    county: sp.get("county") ?? undefined,
    city: sp.get("city") ?? undefined,
    category: sp.get("category") ?? undefined,
    page: sp.get("page") ?? undefined,
    sort: sp.get("sort") ?? undefined,
  });

  if (!filters.success) {
    return NextResponse.json({ error: filters.error.flatten() }, { status: 400 });
  }

  if (!shouldQueryResources(filters.data, Object.fromEntries(sp.entries()))) {
    return NextResponse.json({
      resources: [],
      total: 0,
      page: 1,
      pageSize: PAGE_SIZE,
      totalPages: 0,
    });
  }

  if (isMalformedZipParam(sp.get("zip") ?? undefined, filters.data.zip)) {
    return NextResponse.json(
      {
        resources: [],
        total: 0,
        page: 1,
        pageSize: PAGE_SIZE,
        totalPages: 0,
        zipNotFound: true,
      },
      { headers: { "Cache-Control": RESOURCE_CACHE_CONTROL } }
    );
  }

  try {
    const result = await queryResources(filters.data);
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": RESOURCE_CACHE_CONTROL,
      },
    });
  } catch {
    return NextResponse.json({ error: "Search is temporarily unavailable." }, { status: 503 });
  }
}
