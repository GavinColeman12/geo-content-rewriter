import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type RateResult = { success: boolean; remaining: number; reset: number };

let _limiter: Ratelimit | null = null;

function getLimiter(): Ratelimit | null {
  if (_limiter) return _limiter;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.fixedWindow(5, "1 d"),
    analytics: false,
    prefix: "geo-rewriter",
  });
  return _limiter;
}

export async function checkRateLimit(ip: string): Promise<RateResult> {
  const limiter = getLimiter();
  if (!limiter) {
    return { success: true, remaining: 5, reset: Date.now() + 86400000 };
  }
  const result = await limiter.limit(ip);
  return {
    success: result.success,
    remaining: result.remaining,
    reset: result.reset,
  };
}

export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "anonymous";
}
