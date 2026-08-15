# Angel0x1 — Reserve-Your-Spot Waitlist + Refined Site — Design

**Date:** 2026-08-16
**Status:** Approved (pending user review of this doc)
**Author:** brainstorming session

---

## 1. Summary

Evolve the existing Astro + Vercel marketing site into a launch-ready
"reserve your spot" waitlist with a **live spots-remaining counter**, a
**persisted email backend**, an **automated confirmation email**, and a
**refined (not rebuilt) visual design** with smoother scrolling and richer
motion. Security is a first-class requirement: no SQL injection, no secrets in
the client, hardened against abuse, reviewed by a dedicated security pass before
completion.

The brand aesthetic stays: **warm-white / Apple-spacious canvas, red-iris accent,
the winged-eye mark.** We refine and tighten it — we do not redesign it.

---

## 2. Goals & non-goals

### Goals
- **1,000 free spots**, email only, **no payment**.
- **Live counter**: "X of 1,000 spots left", accurate and abuse-resistant.
- **Persisted storage** of reservations (currently emails are only logged, never saved).
- **Abuse resistance**: one reservation per email; one IP cannot farm many emails.
- **Automated confirmation email**: "your spot is reserved — access code arrives at
  app launch; until then follow IG / X / Discord".
- **Refined design**: momentum smooth-scroll, richer scroll-linked motion, refined
  graphics, fewer/stronger sections — same white brand.
- **Free hosting + free test URL** today; clean path to the real domain later.
- **Security**: no SQL injection, no secrets client-side, strict CSP preserved,
  reviewed by parallel security agents on the real diff.

### Non-goals (YAGNI)
- No unique access codes generated now (codes are issued in-app at launch).
- No in-app redemption flow.
- No payments / Stripe / $1 fee (explicitly dropped by user decision).
- No user accounts, login, or dashboard.
- No newsletter/marketing automation beyond the single confirmation email.
- No analytics/trackers (brand is privacy-first; none today, none added).
- No visual rebrand (dark mode, new palette) — refine current only.

---

## 3. Decisions (locked with user)

| Topic | Decision |
|-------|----------|
| Model | 1,000 free spots, email only, no payment |
| Uniqueness | One reservation per email (DB-enforced) |
| IP abuse | One IP-hash may claim at most **3** emails |
| Access code | **Not now** — emailed at app launch |
| Confirmation email | Auto-sent; content points to IG / X / Discord |
| Storage | Supabase (free Postgres), already scaffolded |
| Email provider | Resend (free tier, server-side SDK) |
| Hosting | Vercel free tier |
| Test URL | `*.vercel.app` (free) now; buy `angel0x1.com` at launch |
| Visual direction | **Refine current white aesthetic** (+ momentum scroll, richer motion) |

---

## 4. Architecture

Static-first Astro on Vercel. Marketing pages are prerendered HTML. Only three
serverless functions render on-demand (`export const prerender = false`), where a
storage secret can live safely in host env.

```
Browser (static HTML + CSP 'self')
   │  POST /api/waitlist   { email, _hp }
   ▼
Vercel serverless function  (secrets in process.env only)
   ├─ rate-limit (per-IP, in-memory)         [exists]
   ├─ honeypot check                          [exists]
   ├─ email validation (server mirror)        [exists]
   ├─ IP-hash abuse cap (≤3 per IP-hash)      [NEW]
   ├─ Supabase insert (atomic, unique email)  [NEW: wire real store]
   └─ Resend confirmation email               [NEW]
   ▼
Supabase Postgres  (service-role key, server-only)
   reservations(email PK, ip_hash, created_at)

GET /api/waitlist/count  →  { reserved, cap:1000 }  (edge-cached 60s)  [exists, retarget]
```

### Components / units (each independently understandable & testable)

1. **`store` adapter** (`src/pages/api/waitlist.ts`) — persists a reservation.
   - Input: normalized email, ip_hash. Output: `{ ok, duplicate }`.
   - Depends on: Supabase REST + service key from `process.env`.
   - No SQL strings — parameterized REST calls only.
2. **`ipHash` util** — `SHA-256(ip + IP_HASH_SALT)`, hex. Privacy: raw IP never stored.
3. **`abuseCap` check** — counts existing rows for this ip_hash; rejects if ≥ cap.
   - Enforced atomically via a Postgres constraint/RPC to avoid race conditions.
4. **`sendConfirmation`** (`src/lib/email.ts`, server-only) — Resend call; failure
   is non-fatal (reservation still succeeds; failure logged).
5. **`count` endpoint** — returns `{ reserved, cap }`; edge-cached.
6. **Front-end form + counter** (`public/scripts/waitlist.js`) — retargeted copy
   ("X of 1,000 spots left"), success state points to socials.
7. **Motion layer** (`public/scripts/reveal.js` + Lenis) — momentum scroll +
   scroll-linked reveals, all `prefers-reduced-motion` aware.

---

## 5. Data model

```sql
create table reservations (
  email      text primary key,                 -- one reservation per email
  ip_hash    text not null,                     -- SHA-256(ip + salt); never the raw IP
  created_at timestamptz not null default now()
);
create index reservations_ip_hash_idx on reservations (ip_hash);
```

- **Cap of 1,000**: enforced in the function by checking `count < cap` before insert,
  plus the count endpoint drives the UI. (A hard DB guard via RPC is included so a
  race cannot exceed 1,000.)
- **IP cap of 3**: `select count(*) where ip_hash = $1` < 3 before insert; wrapped in
  a single Postgres RPC (transaction) so concurrent requests cannot bypass it.

### Why an RPC (server-side function) for the write
Two independent checks (global cap, per-IP cap) + insert must be atomic. Doing them
as separate REST calls invites races (two requests both see 999). A single
`reserve_spot(email, ip_hash)` Postgres function performs check-and-insert in one
transaction and returns a typed result: `ok | duplicate | ip_capped | full`.

---

## 6. Security posture (the "bulletproof" requirement)

Existing (keep): strict CSP `default-src 'self'`, HSTS preload, `X-Content-Type-Options`,
locked `Permissions-Policy`, no inline scripts/styles, honeypot, per-IP rate limit,
server-side validation, no secrets in client bundle.

Added / verified for this work:

- **No SQL injection**: no dynamically-built SQL anywhere. All DB access is via
  Supabase REST (parameterized) or a parameterized RPC. User input is never
  concatenated into a query.
- **No secrets client-side**: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
  `IP_HASH_SALT` read via `process.env` in serverless functions only. Verified in
  build output (grep the client bundle in CI/manually).
- **Privacy**: store `ip_hash`, never raw IP. Salt is a server secret.
- **Abuse resistance**: honeypot + rate limit + unique-email + IP-hash cap + global cap.
- **CSP for Lenis**: Lenis is self-hosted under `public/scripts/` → still `script-src
  'self'`, no CSP relaxation, no CDN.
- **Email safety**: confirmation email is a fixed server-side template; the only
  interpolated value is the validated email in the "to" field — no user HTML.
- **Fail closed / fail safe**: DB error → 500, nothing leaked. Email send failure →
  reservation still recorded, error logged, user still sees success.
- **Rate-limit hardening**: keep per-IP in-memory limit; note in code that a
  cross-instance limiter (Upstash) is the upgrade path if abuse appears.
- **Dedicated security review**: run `/security-review` via **parallel agents**
  (`dispatching-parallel-agents`) against the actual diff before declaring done.
  Findings triaged and fixed.

### Threat model (abuse scenarios explicitly handled)
| Attack | Mitigation |
|--------|-----------|
| Same email claims repeatedly | Email is PK → duplicate rejected atomically |
| One person, many emails, same IP | IP-hash cap (≤3) in atomic RPC |
| Botnet mass-signup | Honeypot + rate limit + global 1,000 cap; deliverability of confirmation limited |
| Counter hammering → DB cost/DoS | Count endpoint edge-cached 60s; browsers revalidate |
| Header spoofing to evade rate limit | Trust platform header (`x-vercel-forwarded-for`), rightmost XFF hop |
| Secret leakage | Secrets only in `process.env`; bundle grep in verification |
| SQL injection | No SQL strings; parameterized REST/RPC only |
| XSS via email echo | No user input reflected into HTML; strict CSP; email template fixed |

---

## 7. Design refinement (visual)

**Direction: refine the current warm-white aesthetic.** No palette change.

- **Momentum smooth-scroll**: integrate **Lenis** (~3kb, self-hosted, MIT).
  `prefers-reduced-motion` disables it (native scroll fallback).
- **Motion**: keep the existing IntersectionObserver reveals; add gentle
  scroll-scrubbed parallax on the hero mark and waitlist mark (already have
  `data-parallax`), tighten easing, stagger section reveals.
- **Sections (trimmed, stronger)**: Hero → soul line → What it is (triad) →
  Progression (3 steps) → Privacy → **Reserve (finale, with live counter)** → Footer.
  Consolidate any redundant copy; more whitespace; larger type rhythm.
- **Graphics**: refine the winged-eye `Mark` (cleaner draw-in, calmer idle),
  soften glows, add an optional subtle grain overlay (CSS, cheap).
- **Reserve section is the climax**: prominent live "X of 1,000 spots left",
  single email field, "Reserve my spot" CTA; success state shows "You're in —
  follow us" with IG / X / Discord links.
- **Copy changes**: "first 5,000 free for life" → **"first 1,000 reserve a free
  lifetime spot"** across hero, waitlist, meta, and legal pages.

### Accessibility
- All motion gated behind `prefers-reduced-motion`.
- Form labels, `aria-live` status, focus-visible states preserved.
- Color contrast unchanged (already AA on white).

---

## 8. Hosting & domain

- **Hosting**: Vercel free tier (already targeted by `@astrojs/vercel`).
- **Free test URL**: `angel0x1.vercel.app` on first deploy — enough to test the
  counter, form, storage, and email end-to-end.
- **Domain**: keep code's `site: 'https://angel0x1.com'`. Recommend buying
  `angel0x1.com` (~$10/yr, Cloudflare/Namecheap) at launch. Avoid free TLDs
  (`.tk`/`.ml`) — they damage trust and email deliverability for a privacy brand.
- **Email DNS**: when Resend is enabled, add its SPF/DKIM records to the domain.

---

## 9. Configuration (env — all server-only)

```
WAITLIST_STORE=supabase
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...        # server-only secret
WAITLIST_CAP=1000                    # renamed from WAITLIST_LIFETIME_CAP
IP_HASH_SALT=...                     # server-only secret (random 32+ bytes)
IP_CLAIM_CAP=3
RESEND_API_KEY=...                   # server-only secret
RESEND_FROM="Angel0x1 <hello@angel0x1.com>"
SOCIAL_IG=...  SOCIAL_X=...  SOCIAL_DISCORD=...   # used in email + footer
```

`.env.example` updated to document these (no real values, ever committed).

### Fallback behavior (graceful degradation)
- `WAITLIST_STORE=none` (default until configured): validate + accept + log, do not
  persist — site is deployable immediately, counter shows cap.
- No `RESEND_API_KEY`: skip email send, still record reservation, still show success.

---

## 10. Testing

- **Unit**: `validEmail`, `ipHash`, abuse-cap logic, count math (remaining = cap − reserved,
  floored at 0).
- **Integration** (against Supabase test project or mock): duplicate email → 409;
  4th email from same ip_hash → capped; 1000th reservation → full; malformed body → 400.
- **Security checks**: grep built client bundle for any secret/env leakage; verify CSP
  headers on deployed preview; attempt header-spoof rate-limit bypass.
- **Manual E2E on Vercel preview**: reserve a spot, see counter decrement (after cache
  window), receive confirmation email.
- **Reduced-motion**: verify Lenis + reveals disabled.

---

## 11. Rollout

1. Build refined UI + backend on a feature branch.
2. Deploy Vercel preview (free URL) with `WAITLIST_STORE=none` → verify UI/motion.
3. Create Supabase project + table + RPC; set env; redeploy → verify persistence + counter.
4. Enable Resend + DNS → verify confirmation email.
5. Run `/security-review` via parallel agents on the diff; fix findings.
6. Update legal copy (1,000 / no-payment). Point domain when purchased.

---

## 12. What the user must provide

- **To build & test (free):** nothing — testable on `*.vercel.app`.
- **To go live:** Supabase project (3 env values), Resend account + domain DNS
  (for auto-email), IG / X / Discord links, and the domain purchase when ready.
