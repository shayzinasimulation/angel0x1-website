# Angel0x1 Reserve-Your-Spot (Email-OTP) + Refined Mobile-First Site — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Astro+Vercel site into a mobile-first, minimal "reserve your spot" waitlist (1,000 free spots, email-OTP verified, no payment) with a live counter, persisted Supabase storage, automated Resend emails, and refined K95-inspired motion — with no SQL injection, no client secrets, and a parallel security review before completion.

**Architecture:** Static-first Astro (prerendered marketing pages) with three on-demand serverless routes (`/api/reserve/request`, `/api/reserve/verify`, `/api/waitlist/count`). All server-only logic lives in `src/lib/` (thin routes over tested modules). Persistence is Supabase Postgres via parameterized REST + one atomic `reserve_spot` RPC. Email is Resend via raw `fetch`. Every subsystem has a graceful no-op default so the site runs the instant it deploys, before any account exists.

**Tech Stack:** Astro 7.2.2, `@astrojs/vercel` 11.0.5, Node 22 (global Web Crypto), TypeScript (strict), Supabase (REST/RPC), Resend (REST), Lenis 1.3.26 (vendored, self-hosted). Tests: Node built-in `node:test` + `--experimental-strip-types` (zero dev-dependencies).

## Global Constraints

- **No new runtime npm dependencies.** Supabase + Resend via raw `fetch`; only Lenis is vendored as a static file under `public/scripts/`. (Spec §3 "Dependencies".)
- **No secrets in the client bundle.** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `IP_HASH_SALT`, `OTP_SALT`, `RESEND_API_KEY` are read via `process.env` inside serverless functions only — never `import.meta.env`, never in any file served to the browser.
- **No SQL strings built in JS.** Supabase REST + parameterized RPC only; user input is always a parameter, never concatenated into a query.
- **Strict CSP unchanged** (`vercel.json`): `default-src 'self'`, `script-src 'self'`, `connect-src 'self'`, no inline scripts/styles. Lenis is same-origin. Supabase/Resend are server→server (not subject to browser CSP).
- **Cap = 1,000** verified reservations. **IP cap = 3** verified reservations per `ip_hash`. **OTP = 6 digits**, CSPRNG, stored only as `sha256(code + OTP_SALT)`, **10-min** expiry, **5-attempt** cap, constant-time compare. **Per-email throttle**: ≤1 code/60s, ≤5/day.
- **Privacy:** store `sha256(ip + IP_HASH_SALT)`, never the raw IP. OTP never logged in plaintext.
- **Copy:** "first 1,000 reserve a free lifetime spot" (replaces "first 5,000 free for life") across hero, reserve section, meta, and legal pages.
- **Socials (public, in `src/config/site.ts`, not env):** X `https://x.com/angel0x1_`, IG `https://instagram.com/angel0x1_`, Discord optional (omit from UI if empty).
- **Mobile-first + very minimal:** base styles target ~360–430px; the reserve flow is the highlighted feature, with a persistent live "X / 1000 reserved" counter. Tap targets ≥44px. All motion gated behind `prefers-reduced-motion`.
- **Runtime env access pattern:** always `process.env[k]` inside a helper, never destructured at module top (Vite would inline).
- **Test invocation:** `npm test` = `node --experimental-strip-types --test 'src/lib/**/*.test.ts'`. Test files import siblings with explicit `.ts` extensions. Leaf modules used in tests must only use globals (`crypto`, `TextEncoder`) + relative `.ts` imports — no Astro imports.
- **Fail safe:** DB error → 500, nothing leaked. Confirmation-email failure is non-fatal. Generic responses at both reserve steps (no account/email enumeration).

---

## File Structure

**Create:**
- `src/config/site.ts` — public config: socials, cap, brand copy strings. Imported by pages + emails.
- `src/lib/env.ts` — typed runtime `process.env` access + feature flags (`storeEnabled`, `emailEnabled`).
- `src/lib/security.ts` — `validEmail`, `clientIp`, `sha256Hex`, `ipHash`, `constantTimeEqual`, in-memory rate limiter.
- `src/lib/otp.ts` — `generateCode`, `hashCode`, `codeMatches` (uses `security.ts`).
- `src/lib/store.ts` — Supabase adapter: `putPending`, `getPending`, `bumpAttempts`, `deletePending`, `reserveSpot` (RPC), `countReserved`. No-op/in-memory when store disabled.
- `src/lib/email.ts` — Resend adapter: `sendOtp`, `sendConfirmation`. Log-only when email disabled.
- `src/pages/api/reserve/request.ts` — step 1 route (send OTP).
- `src/pages/api/reserve/verify.ts` — step 2 route (verify → reserve).
- `public/scripts/reserve.js` — two-step form controller + counter hydration.
- `public/scripts/lenis.min.js` — vendored Lenis (self-hosted).
- `db/01_schema.sql`, `db/02_reserve_rpc.sql` — SQL to paste into Supabase.
- `SETUP.md` — ordered account/connect walkthrough.
- Test files: `src/lib/security.test.ts`, `src/lib/otp.test.ts`, `src/lib/store.test.ts`, `src/lib/email.test.ts`.

**Modify:**
- `src/pages/api/waitlist/count.ts` — retarget to `reservations` count + `WAITLIST_CAP`, return `{ reserved, cap }`.
- `src/pages/api/waitlist.ts` — **delete** (replaced by reserve/*). 
- `src/pages/index.astro` — mobile-first nav+overlay, refined hero, trimmed sections, two-step reserve form, socials, persistent counter; copy change.
- `src/layouts/Base.astro` — Lenis init hook, meta/OG copy change, mobile menu markup/root.
- `src/styles/global.css` — mobile-first refinements, overlay, letter-swap, sticky reserve, counter styles.
- `public/scripts/reveal.js` — integrate Lenis raf; keep IO reveals + parallax.
- `src/pages/privacy.astro`, `src/pages/terms.astro` — copy change (1,000 / OTP / no "5,000").
- `package.json` — add `"test"` + `"typecheck"` scripts (no deps).
- `.env.example` — document new keys.
- `README.md` — update stack/wiring section.

---

### Task 1: Public site config + npm scripts

**Files:**
- Create: `src/config/site.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `SITE` const `{ cap: number; socials: { x: string; instagram: string; discord: string }; copy: {...} }`; `activeSocials(): { label: string; href: string }[]` (omits empty).

- [ ] **Step 1: Create the config**

```typescript
// src/config/site.ts
// PUBLIC site config — safe to ship to the browser. Secrets never go here.
export const SITE = {
  name: 'Angel0x1',
  domain: 'https://angel0x1.com',
  cap: 1000,
  socials: {
    x: 'https://x.com/angel0x1_',
    instagram: 'https://instagram.com/angel0x1_',
    discord: '', // optional — omitted from UI if empty
  },
  copy: {
    reserveEyebrow: 'Early access',
    reserveHeadline: 'Be there at the start.',
    reserveSub: 'The first 1,000 to reserve get a free lifetime spot — every version, forever, no subscription.',
    heroScarcity: 'First 1,000 reserve a free lifetime spot',
  },
} as const;

export function activeSocials(): { label: string; href: string }[] {
  const s = SITE.socials;
  return [
    { label: 'Instagram', href: s.instagram },
    { label: 'X', href: s.x },
    { label: 'Discord', href: s.discord },
  ].filter((x) => x.href.length > 0);
}
```

- [ ] **Step 2: Add scripts to package.json (no new deps)**

Add to the `"scripts"` block:

```json
    "typecheck": "astro check",
    "test": "node --experimental-strip-types --test 'src/lib/**/*.test.ts'"
```

- [ ] **Step 3: Verify scripts resolve**

Run: `npm run typecheck`
Expected: completes (0 errors expected once later tasks compile; at this point the config alone must not error).

- [ ] **Step 4: Commit**

```bash
git add src/config/site.ts package.json
git commit -m "feat(config): public site config (socials, cap, copy) + test/typecheck scripts"
```

---

### Task 2: security.ts — hashing, IP, validation, rate limit

**Files:**
- Create: `src/lib/security.ts`
- Test: `src/lib/security.test.ts`

**Interfaces:**
- Consumes: globals only (`crypto`, `TextEncoder`, `Request`).
- Produces:
  - `validEmail(s: string): boolean`
  - `sha256Hex(input: string): Promise<string>` (64 lowercase hex chars)
  - `ipHash(ip: string, salt: string): Promise<string>`
  - `clientIp(req: Request): string`
  - `constantTimeEqual(a: string, b: string): boolean`
  - `rateLimit(key: string, max: number, windowMs: number): boolean` (returns true if LIMITED)

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/security.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validEmail, sha256Hex, ipHash, constantTimeEqual, rateLimit, clientIp,
} from './security.ts';

test('validEmail accepts normal, rejects junk and overlong', () => {
  assert.equal(validEmail('a@b.co'), true);
  assert.equal(validEmail('no-at'), false);
  assert.equal(validEmail('a@b'), false);
  assert.equal(validEmail('a b@c.co'), false);
  assert.equal(validEmail('x'.repeat(320) + '@b.co'), false);
});

test('sha256Hex is deterministic, 64 hex chars', async () => {
  const h = await sha256Hex('hello');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, await sha256Hex('hello'));
  assert.notEqual(h, await sha256Hex('world'));
});

test('ipHash depends on salt and never equals raw ip', async () => {
  const a = await ipHash('1.2.3.4', 'salt-a');
  const b = await ipHash('1.2.3.4', 'salt-b');
  assert.notEqual(a, b);
  assert.notEqual(a, '1.2.3.4');
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('constantTimeEqual', () => {
  assert.equal(constantTimeEqual('abcdef', 'abcdef'), true);
  assert.equal(constantTimeEqual('abcdef', 'abcdeg'), false);
  assert.equal(constantTimeEqual('abc', 'abcd'), false);
});

test('clientIp prefers vercel header then real-ip then rightmost xff', () => {
  const mk = (h: Record<string, string>) => new Request('https://x/', { headers: h });
  assert.equal(clientIp(mk({ 'x-vercel-forwarded-for': '9.9.9.9, 1.1.1.1' })), '9.9.9.9');
  assert.equal(clientIp(mk({ 'x-real-ip': '2.2.2.2' })), '2.2.2.2');
  assert.equal(clientIp(mk({ 'x-forwarded-for': 'a, b, 3.3.3.3' })), '3.3.3.3');
  assert.equal(clientIp(mk({})), 'unknown');
});

test('rateLimit blocks after max in window', () => {
  const key = 'test-key-' + Math.floor(performance.now());
  assert.equal(rateLimit(key, 2, 60_000), false); // 1st
  assert.equal(rateLimit(key, 2, 60_000), false); // 2nd
  assert.equal(rateLimit(key, 2, 60_000), true);  // 3rd → limited
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './security.ts'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/security.ts
// Server-only security helpers. Globals only (crypto, TextEncoder) so this stays
// unit-testable under `node --experimental-strip-types` and edge-compatible.

export function validEmail(s: string): boolean {
  return typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
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

/** Length-independent-ish constant-time string compare (compares equal-length hex). */
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
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  let rec = buckets.get(key);
  if (!rec || rec.resetAt < now) { rec = { count: 0, resetAt: now + windowMs }; buckets.set(key, rec); }
  rec.count += 1;
  return rec.count > max;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS (all security tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/security.ts src/lib/security.test.ts
git commit -m "feat(lib): security helpers (sha256, ipHash, validation, constant-time, rate limit) + tests"
```

---

### Task 3: otp.ts — code generation, hashing, matching

**Files:**
- Create: `src/lib/otp.ts`
- Test: `src/lib/otp.test.ts`

**Interfaces:**
- Consumes: `sha256Hex`, `constantTimeEqual` from `./security.ts`.
- Produces:
  - `generateCode(): string` — 6 digits, CSPRNG, leading zeros allowed.
  - `hashCode(code: string, salt: string): Promise<string>`
  - `codeMatches(code: string, storedHash: string, salt: string): Promise<boolean>` — constant-time.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/otp.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCode, hashCode, codeMatches } from './otp.ts';

test('generateCode is 6 digits', () => {
  for (let i = 0; i < 200; i++) assert.match(generateCode(), /^[0-9]{6}$/);
});

test('generateCode is not trivially constant', () => {
  const set = new Set(Array.from({ length: 50 }, () => generateCode()));
  assert.ok(set.size > 1);
});

test('hashCode never returns the plaintext code', async () => {
  const h = await hashCode('123456', 'salt');
  assert.notEqual(h, '123456');
  assert.match(h, /^[0-9a-f]{64}$/);
});

test('codeMatches true only for the right code+salt', async () => {
  const h = await hashCode('123456', 'salt');
  assert.equal(await codeMatches('123456', h, 'salt'), true);
  assert.equal(await codeMatches('654321', h, 'salt'), false);
  assert.equal(await codeMatches('123456', h, 'other-salt'), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './otp.ts'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/otp.ts
import { sha256Hex, constantTimeEqual } from './security.ts';

/** 6-digit numeric code from a CSPRNG; rejection-sampled to avoid modulo bias. */
export function generateCode(): string {
  const max = 1_000_000;
  const limit = Math.floor(0xffffffff / max) * max; // largest unbiased multiple
  const buf = new Uint32Array(1);
  let n: number;
  do { crypto.getRandomValues(buf); n = buf[0]!; } while (n >= limit);
  return (n % max).toString().padStart(6, '0');
}

export async function hashCode(code: string, salt: string): Promise<string> {
  return sha256Hex(`${code}::${salt}`);
}

export async function codeMatches(code: string, storedHash: string, salt: string): Promise<boolean> {
  const h = await hashCode(code, salt);
  return constantTimeEqual(h, storedHash);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/otp.ts src/lib/otp.test.ts
git commit -m "feat(lib): OTP generate/hash/match (CSPRNG, unbiased, constant-time) + tests"
```

---

### Task 4: env.ts — runtime config + feature flags

**Files:**
- Create: `src/lib/env.ts`

**Interfaces:**
- Consumes: `process.env` (runtime).
- Produces:
  - `env(k: string): string | undefined`
  - `flags(): { storeEnabled: boolean; emailEnabled: boolean }`
  - `config(): { cap; ipCap; otpTtlMs; otpMaxAttempts; supabaseUrl?; supabaseKey?; ipSalt; otpSalt; resendKey?; resendFrom }`
- Note: no test (thin `process.env` wrapper); exercised via store/email/route tests.

- [ ] **Step 1: Create env.ts**

```typescript
// src/lib/env.ts
// Runtime env access ONLY (process.env) — never import.meta.env (Vite would inline
// at build and strip adapters, so a secret added later in the dashboard would never
// take effect). Nothing here is bundled to the client.
export const env = (k: string): string | undefined => process.env[k];

export function flags() {
  return {
    storeEnabled: (env('WAITLIST_STORE') ?? 'none') === 'supabase',
    emailEnabled: (env('EMAIL_PROVIDER') ?? 'none') === 'resend',
  };
}

export function config() {
  return {
    cap: parseInt(env('WAITLIST_CAP') ?? '1000', 10),
    ipCap: parseInt(env('IP_CLAIM_CAP') ?? '3', 10),
    otpTtlMs: parseInt(env('OTP_TTL_MIN') ?? '10', 10) * 60_000,
    otpMaxAttempts: parseInt(env('OTP_MAX_ATTEMPTS') ?? '5', 10),
    supabaseUrl: env('SUPABASE_URL'),
    supabaseKey: env('SUPABASE_SERVICE_ROLE_KEY'),
    ipSalt: env('IP_HASH_SALT') ?? 'dev-insecure-ip-salt',
    otpSalt: env('OTP_SALT') ?? 'dev-insecure-otp-salt',
    resendKey: env('RESEND_API_KEY'),
    resendFrom: env('RESEND_FROM') ?? 'Angel0x1 <onboarding@resend.dev>',
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors from `env.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/env.ts
git commit -m "feat(lib): runtime env accessor + feature flags (process.env only)"
```

---

### Task 5: store.ts — Supabase adapter (REST + atomic RPC) with in-memory fallback

**Files:**
- Create: `src/lib/store.ts`
- Test: `src/lib/store.test.ts`

**Interfaces:**
- Consumes: `flags`, `config` from `./env.ts`.
- Produces (all async):
  - `putPending(p: { email: string; codeHash: string; ipHash: string; expiresAt: number }): Promise<void>`
  - `getPending(email: string): Promise<{ codeHash: string; ipHash: string; attempts: number; expiresAt: number } | null>`
  - `bumpAttempts(email: string): Promise<number>` — returns new attempts count
  - `deletePending(email: string): Promise<void>`
  - `reserveSpot(email: string, ipHash: string): Promise<'ok' | 'full' | 'ip_capped' | 'duplicate'>`
  - `countReserved(): Promise<number>`
  - `isReserved(email: string): Promise<boolean>`
- Behavior: when `flags().storeEnabled` is false, use a module-level in-memory Map so the flow works locally with no DB. When enabled, use Supabase REST/RPC with `apikey` + `Bearer` headers. **No SQL strings.**

- [ ] **Step 1: Write the failing test (in-memory mode — store disabled)**

```typescript
// src/lib/store.test.ts
// Runs in in-memory mode: WAITLIST_STORE is unset → storeEnabled=false.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { putPending, getPending, bumpAttempts, deletePending, reserveSpot, countReserved, isReserved, __resetMemoryStore } from './store.ts';

test('pending lifecycle in-memory', async () => {
  __resetMemoryStore();
  await putPending({ email: 'a@b.co', codeHash: 'h', ipHash: 'ip1', expiresAt: Date.now() + 10000 });
  const p = await getPending('a@b.co');
  assert.equal(p?.codeHash, 'h');
  assert.equal(p?.attempts, 0);
  assert.equal(await bumpAttempts('a@b.co'), 1);
  assert.equal(await bumpAttempts('a@b.co'), 2);
  await deletePending('a@b.co');
  assert.equal(await getPending('a@b.co'), null);
});

test('reserveSpot enforces caps and uniqueness in-memory', async () => {
  __resetMemoryStore(1000, 3); // cap=1000, ipCap=3
  assert.equal(await reserveSpot('a@b.co', 'ipX'), 'ok');
  assert.equal(await isReserved('a@b.co'), true);
  assert.equal(await reserveSpot('a@b.co', 'ipX'), 'duplicate');
  assert.equal(await reserveSpot('b@b.co', 'ipX'), 'ok');
  assert.equal(await reserveSpot('c@b.co', 'ipX'), 'ok');
  assert.equal(await reserveSpot('d@b.co', 'ipX'), 'ip_capped'); // 4th from ipX
  assert.equal(await countReserved(), 3);
});

test('reserveSpot returns full at cap', async () => {
  __resetMemoryStore(2, 100);
  assert.equal(await reserveSpot('a@b.co', 'i1'), 'ok');
  assert.equal(await reserveSpot('b@b.co', 'i2'), 'ok');
  assert.equal(await reserveSpot('c@b.co', 'i3'), 'full');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './store.ts'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/store.ts
import { flags, config } from './env.ts';

type Pending = { codeHash: string; ipHash: string; attempts: number; expiresAt: number };

// ── in-memory fallback (store disabled / local dev / tests) ──────────────────
let mem = { pending: new Map<string, Pending>(), reserved: new Map<string, string>(), cap: 1000, ipCap: 3 };
export function __resetMemoryStore(cap = 1000, ipCap = 3) {
  mem = { pending: new Map(), reserved: new Map(), cap, ipCap };
}

// ── Supabase REST helpers (only used when enabled) ───────────────────────────
function sb(path: string): string { return `${config().supabaseUrl}/rest/v1/${path}`; }
function sbHeaders(): Record<string, string> {
  const key = config().supabaseKey ?? '';
  return { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };
}

export async function putPending(p: { email: string; codeHash: string; ipHash: string; expiresAt: number }): Promise<void> {
  if (!flags().storeEnabled) {
    mem.pending.set(p.email, { codeHash: p.codeHash, ipHash: p.ipHash, attempts: 0, expiresAt: p.expiresAt });
    return;
  }
  // upsert on email PK; parameterized body — no SQL string
  const res = await fetch(sb('pending_reservations'), {
    method: 'POST',
    headers: { ...sbHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      email: p.email, code_hash: p.codeHash, ip_hash: p.ipHash,
      attempts: 0, expires_at: new Date(p.expiresAt).toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`putPending ${res.status}`);
}

export async function getPending(email: string): Promise<Pending | null> {
  if (!flags().storeEnabled) return mem.pending.get(email) ?? null;
  const res = await fetch(sb(`pending_reservations?email=eq.${encodeURIComponent(email)}&select=code_hash,ip_hash,attempts,expires_at`), { headers: sbHeaders() });
  if (!res.ok) throw new Error(`getPending ${res.status}`);
  const rows = await res.json() as any[];
  if (!rows.length) return null;
  const r = rows[0];
  return { codeHash: r.code_hash, ipHash: r.ip_hash, attempts: r.attempts, expiresAt: Date.parse(r.expires_at) };
}

export async function bumpAttempts(email: string): Promise<number> {
  if (!flags().storeEnabled) {
    const r = mem.pending.get(email); if (!r) return 0; r.attempts += 1; return r.attempts;
  }
  const res = await fetch(sb('rpc/bump_attempts'), {
    method: 'POST', headers: sbHeaders(), body: JSON.stringify({ p_email: email }),
  });
  if (!res.ok) throw new Error(`bumpAttempts ${res.status}`);
  return await res.json() as number;
}

export async function deletePending(email: string): Promise<void> {
  if (!flags().storeEnabled) { mem.pending.delete(email); return; }
  const res = await fetch(sb(`pending_reservations?email=eq.${encodeURIComponent(email)}`), { method: 'DELETE', headers: sbHeaders() });
  if (!res.ok) throw new Error(`deletePending ${res.status}`);
}

export async function reserveSpot(email: string, ipHash: string): Promise<'ok' | 'full' | 'ip_capped' | 'duplicate'> {
  if (!flags().storeEnabled) {
    if (mem.reserved.has(email)) return 'duplicate';
    if (mem.reserved.size >= mem.cap) return 'full';
    let perIp = 0; for (const v of mem.reserved.values()) if (v === ipHash) perIp++;
    if (perIp >= mem.ipCap) return 'ip_capped';
    mem.reserved.set(email, ipHash); mem.pending.delete(email); return 'ok';
  }
  const res = await fetch(sb('rpc/reserve_spot'), {
    method: 'POST', headers: sbHeaders(), body: JSON.stringify({ p_email: email, p_ip_hash: ipHash }),
  });
  if (!res.ok) throw new Error(`reserveSpot ${res.status}`);
  return await res.json() as 'ok' | 'full' | 'ip_capped' | 'duplicate';
}

export async function countReserved(): Promise<number> {
  if (!flags().storeEnabled) return mem.reserved.size;
  const res = await fetch(sb('reservations?select=count'), { headers: { ...sbHeaders(), 'Prefer': 'count=exact' } });
  const range = res.headers.get('content-range');
  return range ? parseInt(range.split('/')[1] ?? '0', 10) : 0;
}

export async function isReserved(email: string): Promise<boolean> {
  if (!flags().storeEnabled) return mem.reserved.has(email);
  const res = await fetch(sb(`reservations?email=eq.${encodeURIComponent(email)}&select=email`), { headers: sbHeaders() });
  if (!res.ok) return false;
  return ((await res.json()) as any[]).length > 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (store in-memory tests + earlier tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/store.ts src/lib/store.test.ts
git commit -m "feat(lib): Supabase store adapter (parameterized REST + atomic RPC) with in-memory fallback + tests"
```

---

### Task 6: email.ts — Resend adapter with log-only fallback

**Files:**
- Create: `src/lib/email.ts`
- Test: `src/lib/email.test.ts`

**Interfaces:**
- Consumes: `flags`, `config` from `./env.ts`; `SITE`, `activeSocials` from `../config/site.ts`.
- Produces:
  - `sendOtp(email: string, code: string): Promise<{ ok: boolean; devCode?: string }>` — when email disabled, returns `{ ok: true, devCode: code }` (surfaced only in dev) and does NOT send.
  - `sendConfirmation(email: string): Promise<{ ok: boolean }>` — never throws; logs on failure.
  - `otpHtml(code: string): string`, `otpText(code: string): string`, `confirmationHtml(): string` (pure, testable — no user HTML interpolation).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/email.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { otpHtml, otpText, confirmationHtml, sendOtp } from './email.ts';

test('otp templates contain the code and no scriptable injection point', () => {
  const html = otpHtml('123456');
  assert.ok(html.includes('123456'));
  assert.ok(!html.includes('<script'));
  assert.ok(otpText('123456').includes('123456'));
});

test('confirmation mentions socials and launch, no code', () => {
  const html = confirmationHtml();
  assert.ok(/instagram|x\.com/i.test(html));
  assert.ok(/launch/i.test(html));
});

test('sendOtp in disabled mode returns devCode and does not throw', async () => {
  const r = await sendOtp('a@b.co', '424242'); // EMAIL_PROVIDER unset → disabled
  assert.equal(r.ok, true);
  assert.equal(r.devCode, '424242');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './email.ts'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/email.ts
import { flags, config } from './env.ts';
import { SITE, activeSocials } from '../config/site.ts';

const socialLinks = () => activeSocials().map((s) => `<a href="${s.href}">${s.label}</a>`).join(' · ');
const socialText  = () => activeSocials().map((s) => `${s.label}: ${s.href}`).join('\n');

export function otpHtml(code: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:auto">
  <h2 style="letter-spacing:-.02em">Your Angel0x1 code</h2>
  <p style="color:#6B6560">Enter this code to reserve your spot. It expires in 10 minutes.</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:.3em;margin:24px 0">${code}</p>
  <p style="color:#9E978E;font-size:13px">If you didn't request this, ignore this email.</p>
</div>`;
}
export function otpText(code: string): string {
  return `Your Angel0x1 code is ${code}. It expires in 10 minutes. If you didn't request this, ignore this email.`;
}
export function confirmationHtml(): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:auto">
  <h2 style="letter-spacing:-.02em">Your spot is reserved 🎉</h2>
  <p style="color:#6B6560">You're one of the first 1,000. Your free lifetime access code will be emailed to you the moment Angel0x1 launches.</p>
  <p style="color:#6B6560">Until then, follow along: ${socialLinks()}</p>
  <p style="color:#9E978E;font-size:13px">All the intelligence, none of the surveillance.</p>
</div>`;
}

async function resendSend(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${config().resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config().resendFrom, to: [to], subject, html, text }),
  });
  return res.ok;
}

export async function sendOtp(email: string, code: string): Promise<{ ok: boolean; devCode?: string }> {
  if (!flags().emailEnabled) {
    console.log(`[email:dev] OTP for ${email} would be sent (code withheld from logs in prod)`);
    return { ok: true, devCode: code };
  }
  const ok = await resendSend(email, `${SITE.name} — your code`, otpHtml(code), otpText(code));
  return { ok };
}

export async function sendConfirmation(email: string): Promise<{ ok: boolean }> {
  if (!flags().emailEnabled) { console.log(`[email:dev] confirmation for ${email} skipped`); return { ok: true }; }
  try {
    const ok = await resendSend(email, `${SITE.name} — spot reserved`, confirmationHtml(), 'Your spot is reserved. Your code arrives at launch. Follow us for updates.');
    return { ok };
  } catch (e) {
    console.error('[email] confirmation failed (non-fatal)', e);
    return { ok: false };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email.ts src/lib/email.test.ts
git commit -m "feat(lib): Resend email adapter (OTP + confirmation) with log-only fallback + tests"
```

---

### Task 7: db SQL — schema + atomic RPCs

**Files:**
- Create: `db/01_schema.sql`, `db/02_reserve_rpc.sql`

**Interfaces:**
- Produces: tables `pending_reservations`, `reservations`; functions `reserve_spot(p_email text, p_ip_hash text) returns text`, `bump_attempts(p_email text) returns int`. These are what `store.ts` calls via `rpc/*`.
- No automated test (SQL is applied manually in Supabase); validated in Task 13 integration + Task 14 E2E.

- [ ] **Step 1: Write the schema**

```sql
-- db/01_schema.sql — run FIRST in Supabase SQL editor.
create table if not exists pending_reservations (
  email      text primary key,
  code_hash  text        not null,
  ip_hash    text        not null,
  attempts   int         not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists pending_ip_hash_idx on pending_reservations (ip_hash);

create table if not exists reservations (
  email      text primary key,
  ip_hash    text        not null,
  created_at timestamptz not null default now()
);
create index if not exists reservations_ip_hash_idx on reservations (ip_hash);

-- Row Level Security ON with NO policies → the anon/public key can do nothing.
-- Only the service-role key (used solely server-side) bypasses RLS.
alter table pending_reservations enable row level security;
alter table reservations         enable row level security;
```

- [ ] **Step 2: Write the RPCs (atomic)**

```sql
-- db/02_reserve_rpc.sql — run SECOND.
create or replace function reserve_spot(p_email text, p_ip_hash text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare total int; per_ip int;
begin
  select count(*) into total from reservations;
  if total >= 1000 then return 'full'; end if;
  select count(*) into per_ip from reservations where ip_hash = p_ip_hash;
  if per_ip >= 3 then return 'ip_capped'; end if;
  insert into reservations(email, ip_hash) values (p_email, p_ip_hash);
  delete from pending_reservations where email = p_email;
  return 'ok';
exception when unique_violation then
  return 'duplicate';
end $$;

create or replace function bump_attempts(p_email text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update pending_reservations set attempts = attempts + 1
    where email = p_email
    returning attempts into n;
  return coalesce(n, 0);
end $$;
```

- [ ] **Step 3: Sanity check (local, optional — requires psql; otherwise validated in Supabase)**

If `psql` is available against a local Postgres, running both files should create 2 tables + 2 functions with no error. Otherwise this is applied in Supabase during Task 13.

- [ ] **Step 4: Commit**

```bash
git add db/01_schema.sql db/02_reserve_rpc.sql
git commit -m "feat(db): schema (pending + reservations, RLS on) + atomic reserve_spot/bump_attempts RPCs"
```

---

### Task 8: /api/reserve/request — step 1 (send OTP)

**Files:**
- Create: `src/pages/api/reserve/request.ts`

**Interfaces:**
- Consumes: `clientIp`, `ipHash`, `validEmail`, `rateLimit` (security.ts); `generateCode`, `hashCode` (otp.ts); `isReserved`, `countReserved`, `putPending`, `getPending` (store.ts); `sendOtp` (email.ts); `config`, `flags` (env.ts).
- Produces: `POST` handler. Response contract: always `{ ok: true }` on accepted request (+ `devCode` only when email disabled); `429` when throttled; `422` invalid email; `400` bad body. **Never reveals** whether the email is new/pending/reserved. Also returns nothing that leaks list state except a generic `full` when the list is full.

- [ ] **Step 1: Write the route**

```typescript
// src/pages/api/reserve/request.ts
import type { APIRoute } from 'astro';
import { clientIp, ipHash, validEmail, rateLimit } from '../../../lib/security.ts';
import { generateCode, hashCode } from '../../../lib/otp.ts';
import { isReserved, countReserved, putPending } from '../../../lib/store.ts';
import { sendOtp } from '../../../lib/email.ts';
import { config, flags } from '../../../lib/env.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const ip = clientIp(request);
  if (rateLimit(`req:ip:${ip}`, 5, 60_000)) {
    return Response.json({ ok: false, error: 'Too many requests — slow down.' }, { status: 429 });
  }

  let body: { email?: unknown; _hp?: unknown };
  try { body = await request.json(); } catch { return Response.json({ ok: false, error: 'Bad request.' }, { status: 400 }); }

  // Honeypot: pretend success, do nothing.
  if (body._hp) return Response.json({ ok: true });

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!validEmail(email)) return Response.json({ ok: false, error: 'Invalid email.' }, { status: 422 });

  // Per-email throttle: ≤1 code / 60s, ≤5 / day. (Generic 429; no enumeration.)
  if (rateLimit(`req:email60:${email}`, 1, 60_000)) return Response.json({ ok: true });
  if (rateLimit(`req:emailday:${email}`, 5, 86_400_000)) return Response.json({ ok: true });

  const { cap, otpTtlMs, otpSalt, ipSalt } = config();

  try {
    // If already reserved, or list full, do not issue a code — but respond generically.
    if (await isReserved(email)) return Response.json({ ok: true });
    if ((await countReserved()) >= cap) return Response.json({ ok: false, error: 'full' }, { status: 200 });

    const code = generateCode();
    const codeHash = await hashCode(code, otpSalt);
    const hashedIp = await ipHash(ip, ipSalt);
    await putPending({ email, codeHash, ipHash: hashedIp, expiresAt: Date.now() + otpTtlMs });

    const sent = await sendOtp(email, code);
    if (!sent.ok) return Response.json({ ok: false, error: 'Could not send code — try again.' }, { status: 502 });

    // devCode is surfaced ONLY when the email provider is disabled (local/preview testing).
    return Response.json(flags().emailEnabled ? { ok: true } : { ok: true, devCode: sent.devCode });
  } catch (e) {
    console.error('[reserve/request] error', e);
    return Response.json({ ok: false, error: 'Server error — please try again.' }, { status: 500 });
  }
};
```

- [ ] **Step 2: Build to verify the route compiles + bundles**

Run: `npm run build`
Expected: Complete! with the new function bundled. No type errors.

- [ ] **Step 3: Manual smoke (dev, store+email disabled)**

Run:
```bash
npm run build && npx vercel dev --listen 3000 &  # or: npm run dev (astro) for route testing
sleep 4
curl -s -X POST localhost:3000/api/reserve/request -H 'content-type: application/json' -d '{"email":"a@b.co"}'
```
Expected: `{"ok":true,"devCode":"NNNNNL"}` (6 digits). Invalid email → 422. Rapid repeat within 60s → `{"ok":true}` (throttled, generic).

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/reserve/request.ts
git commit -m "feat(api): reserve/request — OTP issue with honeypot, throttles, generic responses"
```

---

### Task 9: /api/reserve/verify — step 2 (verify → reserve) + count retarget

**Files:**
- Create: `src/pages/api/reserve/verify.ts`
- Modify: `src/pages/api/waitlist/count.ts`
- Delete: `src/pages/api/waitlist.ts`

**Interfaces:**
- verify Consumes: `clientIp`, `ipHash`, `validEmail`, `rateLimit` (security.ts); `codeMatches` (otp.ts); `getPending`, `bumpAttempts`, `deletePending`, `reserveSpot`, `countReserved` (store.ts); `sendConfirmation` (email.ts); `config` (env.ts).
- verify Produces: `POST` → `{ ok: true, remaining }` on success; `{ ok: false, error: 'invalid'|'expired'|'full'|'ip_capped' }` with appropriate status; generic where possible.
- count Produces: `GET` → `{ reserved, cap }`, edge-cached 60s.

- [ ] **Step 1: Write the verify route**

```typescript
// src/pages/api/reserve/verify.ts
import type { APIRoute } from 'astro';
import { clientIp, ipHash, validEmail, rateLimit } from '../../../lib/security.ts';
import { codeMatches } from '../../../lib/otp.ts';
import { getPending, bumpAttempts, deletePending, reserveSpot, countReserved } from '../../../lib/store.ts';
import { sendConfirmation } from '../../../lib/email.ts';
import { config } from '../../../lib/env.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const ip = clientIp(request);
  if (rateLimit(`vrf:ip:${ip}`, 10, 60_000)) {
    return Response.json({ ok: false, error: 'Too many requests — slow down.' }, { status: 429 });
  }

  let body: { email?: unknown; code?: unknown };
  try { body = await request.json(); } catch { return Response.json({ ok: false, error: 'Bad request.' }, { status: 400 }); }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!validEmail(email) || !/^[0-9]{6}$/.test(code)) {
    return Response.json({ ok: false, error: 'invalid' }, { status: 422 });
  }

  const { otpSalt, otpMaxAttempts, ipSalt, cap } = config();

  try {
    const pending = await getPending(email);
    if (!pending) return Response.json({ ok: false, error: 'invalid' }, { status: 422 });
    if (Date.now() > pending.expiresAt) { await deletePending(email); return Response.json({ ok: false, error: 'expired' }, { status: 410 }); }
    if (pending.attempts >= otpMaxAttempts) { await deletePending(email); return Response.json({ ok: false, error: 'expired' }, { status: 410 }); }

    const match = await codeMatches(code, pending.codeHash, otpSalt);
    if (!match) {
      const n = await bumpAttempts(email);
      if (n >= otpMaxAttempts) await deletePending(email);
      return Response.json({ ok: false, error: 'invalid' }, { status: 422 });
    }

    // Verified. Reserve atomically using the SAME ip the code was requested from
    // is not required; use current request ip_hash for the cap (consistent with pending.ipHash).
    const hashedIp = pending.ipHash || (await ipHash(ip, ipSalt));
    const result = await reserveSpot(email, hashedIp);
    if (result === 'ok' || result === 'duplicate') {
      await sendConfirmation(email); // non-fatal
      const reserved = await countReserved();
      return Response.json({ ok: true, remaining: Math.max(0, cap - reserved) });
    }
    // 'full' | 'ip_capped'
    await deletePending(email);
    return Response.json({ ok: false, error: result }, { status: 409 });
  } catch (e) {
    console.error('[reserve/verify] error', e);
    return Response.json({ ok: false, error: 'Server error — please try again.' }, { status: 500 });
  }
};
```

- [ ] **Step 2: Retarget the count endpoint**

Replace the body of `src/pages/api/waitlist/count.ts` with:

```typescript
import type { APIRoute } from 'astro';
import { countReserved } from '../../../lib/store.ts';
import { config } from '../../../lib/env.ts';

export const prerender = false;

export const GET: APIRoute = async () => {
  const { cap } = config();
  let reserved = 0;
  try { reserved = await countReserved(); } catch { /* return 0 on error */ }
  return Response.json(
    { reserved, cap },
    { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' } },
  );
};
```

- [ ] **Step 3: Delete the old waitlist route**

```bash
git rm src/pages/api/waitlist.ts
```

- [ ] **Step 4: Build to verify everything compiles**

Run: `npm run build`
Expected: Complete! `/api/reserve/request`, `/api/reserve/verify`, `/api/waitlist/count` all bundled; no type errors.

- [ ] **Step 5: Manual smoke — full flow (dev, store+email in-memory/disabled)**

Run (astro dev is enough for API routes):
```bash
npm run dev &
sleep 4
CODE=$(curl -s -X POST localhost:4321/api/reserve/request -H 'content-type: application/json' -d '{"email":"z@b.co"}' | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).devCode))')
echo "code=$CODE"
curl -s -X POST localhost:4321/api/reserve/verify -H 'content-type: application/json' -d "{\"email\":\"z@b.co\",\"code\":\"$CODE\"}"
curl -s localhost:4321/api/waitlist/count
```
Expected: verify → `{"ok":true,"remaining":999}`; count → `{"reserved":1,"cap":1000}`. Wrong code → `{"ok":false,"error":"invalid"}`.

Note: astro `dev` restarts reset in-memory state per process; that's expected without Supabase.

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/reserve/verify.ts src/pages/api/waitlist/count.ts
git commit -m "feat(api): reserve/verify (OTP check → atomic reserve) + retarget count to reservations; drop old waitlist route"
```

---

### Task 10: Vendor Lenis + integrate momentum scroll

**Files:**
- Create: `public/scripts/lenis.min.js`
- Modify: `public/scripts/reveal.js`, `src/layouts/Base.astro`

**Interfaces:**
- Produces: a global smooth-scroll driven by Lenis when motion is allowed; native scroll otherwise. `reveal.js` owns the single `requestAnimationFrame` loop (Lenis raf + parallax + progress bar).

- [ ] **Step 1: Vendor Lenis (pinned version, self-hosted — no CDN at runtime)**

```bash
# Fetch the pinned UMD build into public/ so CSP script-src 'self' holds.
curl -fsSL https://unpkg.com/lenis@1.3.26/dist/lenis.min.js -o public/scripts/lenis.min.js
head -c 120 public/scripts/lenis.min.js   # sanity: should be minified JS, not an error page
```
Expected: a minified JS file (~ tens of KB). If `curl` is unavailable, download `lenis@1.3.26/dist/lenis.min.js` by any means and place it at that path. The UMD build exposes `window.Lenis`.

- [ ] **Step 2: Load Lenis before reveal.js in Base.astro**

In `src/layouts/Base.astro`, replace the single reveal script tag with (order matters — Lenis first):

```html
    <script src="/scripts/lenis.min.js"></script>
    <script type="module" src="/scripts/reveal.js"></script>
```

- [ ] **Step 3: Integrate Lenis into reveal.js's raf loop**

Edit `public/scripts/reveal.js` — inside `init()`, before the `frame`/`onScroll` wiring, add Lenis setup and drive it from the existing rAF. Replace the current scroll-listener approach with a unified loop:

```javascript
    // Momentum scroll (Lenis, self-hosted). Disabled under reduced-motion.
    var lenis = null;
    if (!reduce && typeof window.Lenis === 'function') {
      lenis = new window.Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true });
    }

    function raf(time) {
      if (lenis) lenis.raf(time);
      frame();                 // existing: progress bar + parallax
      window.requestAnimationFrame(raf);
    }
    window.requestAnimationFrame(raf);
```

Keep the existing IntersectionObserver reveal block as-is. Remove the old `window.addEventListener('scroll', onScroll ...)` lines only if you moved `frame()` into `raf` (otherwise leave them; double-driving is harmless but redundant — prefer removing). Ensure `frame()` no longer depends on the scroll event to update the progress bar.

- [ ] **Step 4: Build + manual check**

Run: `npm run build && npm run preview &` then open the preview URL.
Expected: buttery momentum scroll on desktop; with OS "reduce motion" enabled, native scroll and no Lenis. No CSP errors in console (all scripts same-origin).

- [ ] **Step 5: Commit**

```bash
git add public/scripts/lenis.min.js public/scripts/reveal.js src/layouts/Base.astro
git commit -m "feat(motion): vendor Lenis 1.3.26 + unified rAF (momentum scroll, reduced-motion safe)"
```

---

### Task 11: reserve.js — two-step form controller + counter

**Files:**
- Create: `public/scripts/reserve.js`
- (the markup it targets is created in Task 12; this task delivers the script and is verified after Task 12's smoke test — commit here, verify there.)

**Interfaces:**
- Consumes DOM ids/classes produced by Task 12: `#reserve-form`, `#reserve-email`, `#reserve-code-row` (hidden initially), `#reserve-code`, `#reserve-submit` (label span `.btn-label`), `#reserve-msg`, hidden `input[name=website]` honeypot, `#counter` (persistent), `[data-counter]` (any counter mirror).
- Produces: progressive-enhancement controller. Step 1 posts email → reveals code step. Step 2 posts code → success state with socials.

- [ ] **Step 1: Write the controller**

```javascript
/* Reserve flow (two-step, OTP). Plain static module — CSP script-src 'self'.
   No secrets client-side; all sensitive work is server-side in /api/reserve/*. */
(function () {
  var form = document.getElementById('reserve-form');
  if (!form) return;
  var email = document.getElementById('reserve-email');
  var codeRow = document.getElementById('reserve-code-row');
  var code = document.getElementById('reserve-code');
  var submit = document.getElementById('reserve-submit');
  var msg = document.getElementById('reserve-msg');
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var step = 1;

  function setCounter(reserved, cap) {
    var remaining = Math.max(0, cap - reserved);
    document.querySelectorAll('[data-counter]').forEach(function (el) {
      el.textContent = remaining > 0
        ? remaining.toLocaleString() + ' of ' + cap.toLocaleString() + ' spots left'
        : 'All ' + cap.toLocaleString() + ' spots reserved — join the general list soon';
    });
  }
  fetch('/api/waitlist/count').then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { if (d && typeof d.reserved === 'number') setCounter(d.reserved, d.cap); })
    .catch(function () {});

  function setLoading(on, label) {
    var l = submit.querySelector('.btn-label'); if (l) l.textContent = label;
    submit.disabled = on; email.disabled = on && step === 1; if (code) code.disabled = on;
  }
  function show(text, kind) { msg.textContent = text; msg.className = 'reserve-msg eyebrow ' + (kind || ''); }
  function fail(text) { show(text, 'err'); }

  function toStep2() {
    step = 2;
    codeRow.hidden = false;
    email.setAttribute('readonly', 'readonly');
    code.focus();
    var l = submit.querySelector('.btn-label'); if (l) l.textContent = 'Verify & reserve';
    show('We emailed you a 6-digit code. Enter it to lock in your spot.', 'ok');
  }
  function done(remaining) {
    form.innerHTML = '';
    show("You're in. Your launch code arrives when we ship — follow along below.", 'ok');
    if (typeof remaining === 'number') {
      document.querySelectorAll('[data-counter]').forEach(function (el) {
        el.textContent = remaining.toLocaleString() + ' spots left';
      });
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var hp = (form.elements.namedItem('website') || {}).value || '';
    if (hp) { done(); return; }

    if (step === 1) {
      var val = email.value.trim().toLowerCase();
      if (!EMAIL_RE.test(val)) { fail('Please enter a valid email.'); email.focus(); return; }
      setLoading(true, 'Sending code…');
      fetch('/api/reserve/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: val, _hp: hp }) })
        .then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); })
        .then(function (r) {
          if (r.d && r.d.error === 'full') { fail('All spots are reserved right now.'); return; }
          if (r.s === 429) { fail('Too many requests — wait a moment.'); return; }
          if (!r.d || !r.d.ok) { fail('Could not send a code — try again.'); return; }
          if (r.d.devCode && code) code.value = r.d.devCode; // dev/preview only
          toStep2();
        })
        .catch(function () { fail('Something went wrong — try again.'); })
        .finally(function () { setLoading(false, 'Verify & reserve'); });
    } else {
      var c = (code.value || '').trim();
      if (!/^[0-9]{6}$/.test(c)) { fail('Enter the 6-digit code.'); code.focus(); return; }
      setLoading(true, 'Verifying…');
      fetch('/api/reserve/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.value.trim().toLowerCase(), code: c }) })
        .then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); })
        .then(function (r) {
          if (r.d && r.d.ok) { done(r.d.remaining); return; }
          var err = r.d && r.d.error;
          if (err === 'expired') fail('That code expired — start again.');
          else if (err === 'full') fail('The last spot just went. So close!');
          else if (err === 'ip_capped') fail('Reservation limit reached for this network.');
          else fail('That code is not right — try again.');
        })
        .catch(function () { fail('Something went wrong — try again.'); })
        .finally(function () { setLoading(false, 'Verify & reserve'); });
    }
  });
})();
```

- [ ] **Step 2: Commit (verified in Task 12)**

```bash
git add public/scripts/reserve.js
git commit -m "feat(web): two-step OTP reserve controller + live counter hydration"
```

---

### Task 12: Mobile-first minimal redesign — nav+overlay, hero, reserve section, socials, persistent counter

**Files:**
- Modify: `src/pages/index.astro`, `src/layouts/Base.astro`, `src/styles/global.css`

**Interfaces:**
- Consumes: `SITE`, `activeSocials` (config/site.ts); `Mark` component; DOM ids consumed by `reserve.js` (Task 11) and a mobile-menu toggle handled by a tiny same-origin script.
- Produces: the highlighted, phone-first reserve experience with a persistent `[data-counter]`.

- [ ] **Step 1: Add a menu toggle script (same-origin, CSP-safe)**

Create `public/scripts/menu.js`:

```javascript
/* Mobile menu overlay toggle. Static module, CSP script-src 'self'. */
(function () {
  var btn = document.getElementById('menu-btn');
  var overlay = document.getElementById('menu-overlay');
  if (!btn || !overlay) return;
  function set(open) {
    overlay.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
  }
  btn.addEventListener('click', function () { set(!overlay.classList.contains('is-open')); });
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay || e.target.closest('[data-close]') || e.target.tagName === 'A') set(false);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
})();
```

Load it in `Base.astro` after reveal.js:
```html
    <script type="module" src="/scripts/menu.js"></script>
```

- [ ] **Step 2: Replace the nav + hero + waitlist markup in `index.astro`**

Replace the `<header class="nav">` block with a mobile-first nav that carries the persistent counter and a hamburger, plus a full-screen overlay. Add `---` frontmatter import: `import { SITE, activeSocials } from '../config/site.ts';` and `const socials = activeSocials();`.

```astro
  <!-- NAV -->
  <header class="nav">
    <div class="wrap nav-in">
      <a href="/" class="nav-mark" aria-label="Angel0x1 — home"><Mark size={52} /></a>
      <span class="nav-counter eyebrow t-red" data-counter aria-live="polite">Reserve your spot</span>
      <nav class="nav-links">
        <a href="#reserve" class="btn btn--ghost btn--sm swap"><span>Reserve</span><span aria-hidden="true">Reserve</span></a>
      </nav>
      <button id="menu-btn" class="menu-btn" aria-label="Menu" aria-expanded="false" aria-controls="menu-overlay">
        <span></span><span></span>
      </button>
    </div>
  </header>

  <!-- MOBILE MENU OVERLAY -->
  <div id="menu-overlay" class="menu-overlay" role="dialog" aria-modal="true" aria-label="Menu">
    <button class="menu-close eyebrow" data-close aria-label="Close menu">Close ✕</button>
    <nav class="menu-nav">
      <a href="#vision">What it is</a>
      <a href="#reserve">Reserve a spot</a>
    </nav>
    <p class="eyebrow t-red menu-counter" data-counter>Reserve your spot</p>
    <div class="menu-socials">
      {socials.map((s) => <a href={s.href} class="eyebrow" target="_blank" rel="me noopener">{s.label}</a>)}
    </div>
  </div>
```

Update the hero scarcity line to use `SITE.copy.heroScarcity` and change the hero CTA text to "Reserve your spot". Change hero `<h1>` copy if desired but keep brand voice.

- [ ] **Step 3: Replace the waitlist section with the two-step reserve section**

Replace the `<section class="section waitlist ...">` block:

```astro
  <!-- RESERVE (the highlighted feature) -->
  <section class="section reserve center" id="reserve">
    <div class="reserve-glow" aria-hidden="true"></div>
    <div class="wrap center">
      <div class="reserve-mark" data-parallax="0.08" aria-hidden="true"><Mark size={112} /></div>
      <p class="eyebrow" data-reveal>{SITE.copy.reserveEyebrow}</p>
      <h2 class="h2 measure" data-reveal>{SITE.copy.reserveHeadline}</h2>
      <p class="lede measure rd-1" data-reveal>{SITE.copy.reserveSub}</p>
      <p class="reserve-count eyebrow t-red rd-2" data-counter data-reveal aria-live="polite">Reserve your spot</p>

      <form class="reserve-form rd-2" id="reserve-form" data-reveal novalidate>
        <input class="vh" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
        <div class="reserve-row">
          <label for="reserve-email" class="vh">Email address</label>
          <input id="reserve-email" name="email" type="email" inputmode="email" placeholder="you@email.com" autocomplete="email" required class="reserve-input" />
        </div>
        <div class="reserve-row" id="reserve-code-row" hidden>
          <label for="reserve-code" class="vh">6-digit code</label>
          <input id="reserve-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" placeholder="6-digit code" class="reserve-input" />
        </div>
        <button type="submit" class="btn reserve-submit" id="reserve-submit"><span class="btn-label">Reserve your spot</span></button>
        <p class="reserve-note eyebrow faint">Email only. No newsletters, no sharing. A code confirms it's really you.</p>
      </form>
      <!-- msg lives OUTSIDE the form: reserve.js clears form.innerHTML on success, so the
           success text must be written to an element that survives that clear. -->
      <p class="reserve-msg eyebrow" id="reserve-msg" aria-live="polite"></p>
    </div>
  </section>
```

Update the footer to render `socials` and swap the script include at the bottom of `index.astro` from `waitlist.js` to `reserve.js`:

```astro
  <script type="module" src="/scripts/reserve.js"></script>
```

Delete `public/scripts/waitlist.js`:
```bash
git rm public/scripts/waitlist.js
```

- [ ] **Step 4: Add mobile-first CSS to `global.css`**

Append (mobile-first: base styles are the phone; enhance upward):

```css
/* ── nav (mobile-first) ─────────────────────────────────────────────── */
.nav-counter { display: none; }                 /* hidden on phone; shown ≥720px */
.menu-btn { display: inline-flex; flex-direction: column; gap: 5px; background: none;
  border: 0; padding: 12px; cursor: pointer; min-width: 44px; min-height: 44px; align-items: center; justify-content: center; }
.menu-btn span { width: 22px; height: 2px; background: var(--ink); display: block; }
.nav-links { display: none; }

.menu-overlay { position: fixed; inset: 0; z-index: 120; background: var(--paper);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px;
  opacity: 0; pointer-events: none; transform: translateY(-8px);
  transition: opacity .4s var(--ease), transform .4s var(--ease); }
.menu-overlay.is-open { opacity: 1; pointer-events: auto; transform: none; }
.menu-close { position: absolute; top: 22px; right: 22px; background: none; border: 0; cursor: pointer; color: var(--faint); }
.menu-nav { display: flex; flex-direction: column; gap: 18px; text-align: center; }
.menu-nav a { font-size: clamp(28px, 8vw, 44px); font-weight: 600; letter-spacing: -0.03em; }
.menu-socials { display: flex; gap: 22px; }
.menu-socials a:hover, .menu-nav a:hover { color: var(--red); }

/* letter-swap micro-interaction (pointer only) */
.swap { position: relative; overflow: hidden; }
.swap span { display: inline-block; transition: transform .3s var(--ease); }
.swap span:nth-child(2) { position: absolute; left: 0; top: 100%; }
@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  .swap:hover span:nth-child(1) { transform: translateY(-100%); }
  .swap:hover span:nth-child(2) { transform: translateY(-100%); }
}

/* ── reserve section ────────────────────────────────────────────────── */
.reserve { position: relative; overflow: hidden; gap: 20px; }
.reserve-glow { position: absolute; inset: 0; background: radial-gradient(ellipse 60% 60% at 50% 28%, rgba(179,58,43,0.09) 0%, transparent 70%); pointer-events: none; }
.reserve-mark { margin-bottom: 8px; filter: drop-shadow(0 16px 30px rgba(26,23,20,0.12)); }
.reserve .h2, .reserve .lede { margin-inline: auto; }
.reserve-count { font-size: 13px; }
.reserve-form { width: 100%; max-width: 460px; margin: 20px auto 0; display: flex; flex-direction: column; gap: 12px; }
.reserve-row { display: flex; }
.reserve-input { flex: 1; min-width: 0; width: 100%; font-family: var(--sans); font-size: 16px; /* ≥16px: no iOS zoom */
  background: var(--panel); border: 1px solid var(--line); color: var(--ink);
  border-radius: 16px; padding: 16px 20px; transition: border-color .25s, box-shadow .25s; }
#reserve-code { letter-spacing: .35em; text-align: center; font-variant-numeric: tabular-nums; }
.reserve-input:focus { outline: none; border-color: var(--ink); box-shadow: 0 0 0 4px rgba(26,23,20,0.05); }
.reserve-submit { width: 100%; justify-content: center; min-height: 52px; border-radius: 16px; }
.reserve-msg { min-height: 16px; letter-spacing: .14em; }
.reserve-msg.ok { color: var(--red); } .reserve-msg.err { color: #c0392b; }
.reserve-note { margin-top: 2px; }

/* ── ≥720px: reveal inline nav + counter, roomier reserve ───────────── */
@media (min-width: 720px) {
  .nav-counter { display: inline; }
  .nav-links { display: flex; align-items: center; gap: 20px; }
  .menu-btn { display: none; }
  .reserve-row { }
  .reserve-form { max-width: 520px; }
}
```

- [ ] **Step 5: Build + mobile smoke test**

Run: `npm run build && npm run preview`
Then, using Playwright MCP or a resized browser at 390×844:
- Hamburger opens the full-screen overlay; Esc/tap-link closes it; socials point to `x.com/angel0x1_` and `instagram.com/angel0x1_`.
- Reserve: enter email → code row appears (dev code auto-filled in preview) → verify → success text + counter updates.
- No console/CSP errors. Tap targets ≥44px. No horizontal scroll at 360px.

- [ ] **Step 6: Commit**

```bash
git add src/pages/index.astro src/layouts/Base.astro src/styles/global.css public/scripts/menu.js
git commit -m "feat(web): mobile-first minimal redesign — overlay nav, persistent counter, two-step reserve, socials"
```

---

### Task 13: Docs + env template + legal copy

**Files:**
- Modify: `.env.example`, `README.md`, `src/pages/privacy.astro`, `src/pages/terms.astro`
- Create: `SETUP.md`

**Interfaces:** none (docs + copy). Ensures no stale "5,000" copy and gives the user an ordered connect guide.

- [ ] **Step 1: Rewrite `.env.example`** to document exactly the keys from the Global Constraints (WAITLIST_STORE, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WAITLIST_CAP, IP_HASH_SALT, OTP_SALT, IP_CLAIM_CAP, OTP_TTL_MIN, OTP_MAX_ATTEMPTS, EMAIL_PROVIDER, RESEND_API_KEY, RESEND_FROM) with comments that each is server-only and that socials live in `src/config/site.ts`.

- [ ] **Step 2: Write `SETUP.md`** — ordered steps:
  1. Deploy to Vercel (root dir, framework auto), get the free `*.vercel.app` URL.
  2. Create Supabase project; run `db/01_schema.sql` then `db/02_reserve_rpc.sql`; copy URL + service-role key.
  3. Set Vercel env: `WAITLIST_STORE=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `IP_HASH_SALT` (`openssl rand -hex 32`), `OTP_SALT` (`openssl rand -hex 32`), `WAITLIST_CAP=1000`.
  4. Create Resend account; verify domain (or test with `onboarding@resend.dev` to your own inbox); set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `RESEND_FROM`.
  5. Redeploy. Test the full flow. Buy `angel0x1.com` and attach when ready.
  Include the `openssl` commands verbatim and a note that free-tier Resend is 100/day.

- [ ] **Step 3: Fix legal + meta copy** — grep and replace stale numbers/claims:

```bash
grep -rniE "5[, ]?000|free for life|first 5" src/pages src/layouts
```
Update `privacy.astro`, `terms.astro`, and `Base.astro` description so they say "first 1,000", describe email-OTP verification (we store email + a hashed IP; a one-time code verifies the address), and keep the no-account/on-device framing. Update `terms.astro` §5 waitlist section to 1,000 and add a line that verification uses a one-time email code.

- [ ] **Step 4: Update `README.md`** — reflect reserve/* endpoints, OTP flow, Supabase tables, Resend, Lenis, and the src/lib + db + config layout. Point to `SETUP.md`.

- [ ] **Step 5: Verify no stale copy remains**

Run: `grep -rniE "5[, ]?000|free for life" src/ ; echo "exit:$?"`
Expected: no matches in shipping copy (exit 1 from grep = none found).

- [ ] **Step 6: Commit**

```bash
git add .env.example SETUP.md README.md src/pages/privacy.astro src/pages/terms.astro src/layouts/Base.astro
git commit -m "docs+legal: SETUP guide, env template, 1,000/OTP copy across site and policies"
```

---

### Task 14: Live integration — Supabase + Resend verification (requires accounts)

**Files:** none (configuration + verification). This task is the "connect the websites" gate.

**Interfaces:** none. Produces a verified live preview.

- [ ] **Step 1:** Create Supabase project; run both `db/*.sql` files in the SQL editor; confirm 2 tables + 2 functions exist.
- [ ] **Step 2:** Set the Vercel env vars from `SETUP.md` (store + salts + cap). Redeploy the preview.
- [ ] **Step 3: Verify persistence + atomic caps against the live DB**

```bash
BASE=https://<your-preview>.vercel.app
# happy path
R=$(curl -s -X POST $BASE/api/reserve/request -H 'content-type: application/json' -d '{"email":"you@yourdomain.com"}')
echo "$R"   # with email provider still off: {"ok":true,"devCode":"..."}; with Resend on: {"ok":true}
```
With Resend on, read the code from your inbox; then verify. Confirm `/api/waitlist/count` increments and a duplicate email returns success-but-no-new-row (count unchanged).

- [ ] **Step 4:** Enable Resend (`EMAIL_PROVIDER=resend`, key, from). Redeploy. Confirm OTP email + confirmation email both arrive; confirm `devCode` no longer appears in the API response.
- [ ] **Step 5:** Manually attempt abuse on the preview: 4th distinct email from the same network → `ip_capped`; wrong code 5× → invalidated; expired code (wait >10 min) → `expired`. Record results.
- [ ] **Step 6:** No commit (config only). Note results in the PR/issue.

---

### Task 15: Security review (parallel agents) + fixes

**Files:** potentially any (fixes only).

**Interfaces:** none. Produces a clean security bill of health on the real diff.

- [ ] **Step 1:** Ensure the branch builds and `npm test` passes.
- [ ] **Step 2:** Run the security review via parallel agents (per `superpowers:dispatching-parallel-agents` + the `/security-review` skill) against the full diff vs `main`. Dimensions to cover in parallel: (a) secret/env leakage into client bundle, (b) injection (SQL/RPC/email header/HTML), (c) OTP logic (brute force, timing, expiry, replay, enumeration), (d) rate-limit/abuse bypass (header spoofing, IP cap races), (e) CSP/headers regressions.
- [ ] **Step 3:** Independently verify: `grep -rniE "SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|OTP_SALT|IP_HASH_SALT" dist/ .vercel/output 2>/dev/null` → expected: **no matches** (secrets never in built client output).
- [ ] **Step 4:** Triage findings; fix confirmed issues with a test where applicable; re-run `npm test` + `npm run build`.
- [ ] **Step 5: Commit fixes**

```bash
git add -A && git commit -m "security: address review findings (see body)"
```

---

### Task 16: Final verification + merge

**Files:** none.

- [ ] **Step 1:** `npm run typecheck && npm test && npm run build` — all green. Paste output.
- [ ] **Step 2:** Confirm CSP unchanged in `vercel.json` and no new external origins were introduced in any client script.
- [ ] **Step 3:** Full mobile E2E on the preview (390px): reserve a real spot end-to-end with a real emailed code; counter decrements; both emails received; overlay + socials correct.
- [ ] **Step 4:** Use `superpowers:finishing-a-development-branch` to merge to `main`; deploy production; attach domain when purchased.

---

## Self-Review

**Spec coverage:** 1,000/no-payment (T1,T7,T9), email-OTP verify (T3,T8,T9), live counter (T9,T11,T12), Supabase persistence (T5,T7,T14), Resend emails (T6,T14), abuse/IP caps + throttles (T2,T5,T7,T8), no-SQL-injection + no-client-secrets + CSP (constraints enforced T5/T6/T10/T15), mobile-first minimal + K95 nav/overlay/letter-swap/persistent counter (T12), socials @angel0x1_ (T1,T12,T13), Lenis momentum scroll (T10), arranged folders + SETUP (T1,T7,T13), free hosting/domain (T13 SETUP, T16), parallel security review (T15). All spec sections map to a task.

**Placeholder scan:** No TBD/TODO in code steps; every code step contains full source. (T13/T14 are doc/config tasks whose deliverables are prose/《openssl》commands, appropriately described with exact keys and commands.)

**Type consistency:** `reserveSpot` returns `'ok'|'full'|'ip_capped'|'duplicate'` in store.ts (T5), the RPC (T7), and both routes (T8/T9). `countReserved(): number` used by count route + reserve.js counter (`{reserved,cap}`). OTP: `generateCode/hashCode/codeMatches` names consistent T3→T8/T9. `putPending/getPending/bumpAttempts/deletePending` names consistent T5→T8/T9. DOM ids in reserve.js (T11) match markup (T12): `reserve-form/-email/-code-row/-code/-submit/-msg`, `[data-counter]`, honeypot `name=website`.
