import type { APIRoute } from 'astro';

export const prerender = false;

// ── helpers ────────────────────────────────────────────────────────────────

/** Naïve in-memory rate-limit (per serverless instance).  Good enough for a
 *  launch waitlist; swap for Upstash/Vercel KV for cross-instance limits. */
const hits = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;   // 1-minute window
const MAX_HITS  = 5;        // max submissions per IP per window

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  // Bound memory: drop expired buckets so a long-lived instance can't leak across
  // many distinct IPs.
  if (hits.size > 5_000) {
    for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
  }
  let rec = hits.get(ip);
  if (!rec || rec.resetAt < now) {
    rec = { count: 0, resetAt: now + WINDOW_MS };
    hits.set(ip, rec);
  }
  rec.count += 1;
  return rec.count > MAX_HITS;
}

/** Basic email validation — mirrors the client check so neither can be bypassed. */
function validEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 320;
}

/** Client IP for rate-limiting. Prefer platform-set headers (Vercel), which a client
 *  cannot spoof; fall back to the RIGHTMOST x-forwarded-for hop (closest trusted
 *  proxy) rather than the leftmost value, which the caller controls. */
function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  return (
    req.headers.get('x-real-ip') ??
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ??
    xff?.split(',').pop()?.trim() ??
    'unknown'
  );
}

// ── storage adapter ────────────────────────────────────────────────────────
// Pluggable so you can drop in a real DB without touching the route logic.
// Set WAITLIST_STORE="supabase" in Vercel env vars when you're ready.
//
// NB: env is read from `process.env` (RUNTIME) — NOT `import.meta.env`, which Vite
// inlines at BUILD time and would tree-shake the whole adapter away, so a secret set
// later in the Vercel dashboard would silently never take effect.

const env = (k: string): string | undefined => process.env[k];

async function store(email: string): Promise<{ ok: boolean; duplicate: boolean }> {
  const adapter = env('WAITLIST_STORE') ?? 'none';

  if (adapter === 'supabase') {
    const url = env('SUPABASE_URL');
    const key = env('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) {
      console.error('[waitlist] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
      return { ok: false, duplicate: false };
    }
    const res = await fetch(`${url}/rest/v1/waitlist`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        key,
        'Authorization': `Bearer ${key}`,
        'Prefer':        'return=minimal,resolution=ignore-duplicates',
      },
      body: JSON.stringify({ email }),
    });
    if (res.status === 409) return { ok: true, duplicate: true };
    if (res.ok) return { ok: true, duplicate: false };
    console.error('[waitlist] Supabase error', res.status, await res.text());
    return { ok: false, duplicate: false };
  }

  // 'none' — no store configured yet; log and accept gracefully.
  console.log('[waitlist] no store configured — would have stored:', email);
  return { ok: true, duplicate: false };
}

// ── POST /api/waitlist ─────────────────────────────────────────────────────
export const POST: APIRoute = async ({ request }) => {
  const ip = clientIp(request);

  // Rate limit
  if (isRateLimited(ip)) {
    return Response.json({ ok: false, error: 'Too many requests — slow down.' }, { status: 429 });
  }

  // Parse body
  let body: { email?: unknown; _hp?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Bad request.' }, { status: 400 });
  }

  // Honeypot (server-side mirror of the client check)
  if (body._hp) {
    // Silently accept — bots shouldn't learn from 4xx responses.
    return Response.json({ ok: true });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!validEmail(email)) {
    return Response.json({ ok: false, error: 'Invalid email.' }, { status: 422 });
  }

  const { ok, duplicate } = await store(email);
  if (duplicate) {
    return Response.json({ ok: false, error: 'already on the list' }, { status: 409 });
  }
  if (!ok) {
    return Response.json({ ok: false, error: 'Server error — please try again.' }, { status: 500 });
  }

  return Response.json({ ok: true });
};
