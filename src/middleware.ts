import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { clientIpFromHeaders, rateLimit } from "@/lib/rate-limit";

const API_RATE_LIMIT = { limit: 120, windowMs: 60_000 };

export function middleware(request: NextRequest) {
  const ip = clientIpFromHeaders(request.headers.get("x-forwarded-for"));
  const bucketKey = `${ip}:${request.nextUrl.pathname}`;
  const result = rateLimit(bucketKey, API_RATE_LIMIT);

  if (!result.success) {
    const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(API_RATE_LIMIT.limit),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(API_RATE_LIMIT.limit));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
