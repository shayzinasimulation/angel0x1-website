// src/lib/security.ts
// Server-only security helpers. Globals only (crypto, TextEncoder) so this stays
// unit-testable under `node --experimental-strip-types` and edge-compatible.

export function validEmail(s: string): boolean {
  return typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function ipHash(ip: string, salt: string): Promise<string> {
  return sha256Hex(`${ip}::${salt}`);
}

/** Client IP for rate-limiting. Prefer platform headers a client cannot spoof;
 *  fall back to the RIGHTMOST x-forwarded-for hop (closest trusted proxy). */
export function clientIp(req: Request): string {
  const vercel = req.headers.get('x-vercel-forwarded-for');
  if (vercel) return vercel.split(',')[0]!.trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',').pop()!.trim();
  return 'unknown';
}

/** Constant-time compare for equal-length strings (e.g. hex hashes). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const buckets = new Map<string, { count: number; resetAt: number }>();
/** In-memory per-instance limiter. Returns true if the caller is OVER the limit. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  }
  let rec = buckets.get(key);
  if (!rec || rec.resetAt < now) {
    rec = { count: 0, resetAt: now + windowMs };
    buckets.set(key, rec);
  }
  rec.count += 1;
  return rec.count > max;
}
