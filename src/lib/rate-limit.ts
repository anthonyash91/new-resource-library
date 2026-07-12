import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis/cloudflare";

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

interface MemoryEntry {
  count: number;
  resetAt: number;
}

const memoryBuckets = new Map<string, MemoryEntry>();
const MAX_MEMORY_BUCKETS = 10_000;

let upstashLimiter: Ratelimit | null | undefined;
let warnedAboutMemoryFallback = false;

function isUpstashConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

function getUpstashLimiter(config: RateLimitConfig): Ratelimit | null {
  if (!isUpstashConfigured()) return null;

  if (upstashLimiter === undefined) {
    try {
      upstashLimiter = new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(
          config.limit,
          `${Math.max(1, Math.ceil(config.windowMs / 1000))} s`
        ),
        prefix: "rtr:api",
        analytics: false,
      });
    } catch {
      upstashLimiter = null;
    }
  }

  return upstashLimiter;
}

function pruneMemoryBuckets(now: number) {
  if (memoryBuckets.size < MAX_MEMORY_BUCKETS) {
    for (const [key, entry] of memoryBuckets) {
      if (now >= entry.resetAt) memoryBuckets.delete(key);
    }
    return;
  }

  for (const [key, entry] of memoryBuckets) {
    if (now >= entry.resetAt) memoryBuckets.delete(key);
  }

  while (memoryBuckets.size >= MAX_MEMORY_BUCKETS) {
    const oldest = memoryBuckets.keys().next().value;
    if (oldest === undefined) break;
    memoryBuckets.delete(oldest);
  }
}

function rateLimitMemory(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  pruneMemoryBuckets(now);

  const entry = memoryBuckets.get(key);
  if (!entry || now >= entry.resetAt) {
    const resetAt = now + config.windowMs;
    memoryBuckets.set(key, { count: 1, resetAt });
    return { success: true, remaining: config.limit - 1, resetAt };
  }

  if (entry.count >= config.limit) {
    return { success: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  memoryBuckets.set(key, entry);
  return { success: true, remaining: config.limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Distributed rate limit when Upstash is configured; otherwise in-memory per instance.
 * Prefer Upstash in production (Vercel multi-instance).
 */
export async function rateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const limiter = getUpstashLimiter(config);
  if (limiter) {
    const result = await limiter.limit(key);
    return {
      success: result.success,
      remaining: result.remaining,
      resetAt: result.reset,
    };
  }

  if (process.env.NODE_ENV === "production" && !warnedAboutMemoryFallback) {
    warnedAboutMemoryFallback = true;
    console.warn(
      "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN unset — using in-memory limiter (not shared across instances)."
    );
  }

  return rateLimitMemory(key, config);
}

/**
 * Client IP for rate limiting. Prefer platform-set headers over client-spoofable XFF leftmost.
 * On Vercel: x-real-ip / x-vercel-forwarded-for are set by the edge.
 */
export function clientIpFromRequest(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const vercelFwd = headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercelFwd) return vercelFwd;

  // When behind a single trusted proxy that appends, the rightmost hop is more reliable
  // than a client-supplied leftmost value. Vercel already covered above.
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1]!;
  }

  return "unknown";
}
