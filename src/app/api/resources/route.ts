import { NextRequest, NextResponse } from "next/server";
import { queryResources } from "@/lib/data";
import { resourceFiltersSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const filters = resourceFiltersSchema.safeParse({
    q: sp.get("q") ?? undefined,
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

  const result = await queryResources(filters.data);
  return NextResponse.json(result);
}
