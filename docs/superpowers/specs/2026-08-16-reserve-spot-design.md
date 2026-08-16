# Angel0x1 — Reserve-Your-Spot Waitlist (Email OTP Verified) + Refined Site — Design

**Date:** 2026-08-16
**Status:** Approved direction; updated with email-OTP verification + folder layout
**Author:** brainstorming session

---

## 1. Summary

Evolve the existing Astro + Vercel marketing site into a launch-ready
**"reserve your spot"** waitlist with:

- **Email OTP verification** — you enter your email, receive a 6-digit code,
  enter it, and only *then* is your spot reserved. Proves the inbox is real and
  makes abuse (fake/farmed emails) effectively impossible.
- a **live spots-remaining counter** ("X of 1,000 left"),
- a **persisted backend** (Supabase) — emails are actually stored (today they are
  only logged),
- an **automated confirmation email** after verification (points to IG / X / Discord;
  the access code arrives at app launch),
- a **refined** (not rebuilt) visual design: momentum smooth-scroll + richer motion,
  same warm-white / red-iris brand.

Security is first-class: **no SQL injection, no secrets in the client, OTP hashed &
constant-time compared, hardened against abuse,** reviewed by a dedicated parallel
security pass before completion.

---

## 2. Goals & non-goals

### Goals
- **1,000 free spots**, email only, **no payment**.
- **Verified email**: OTP (one-time passcode) confirms the inbox before a spot counts.
- **Live counter**: "X of 1,000 spots left", accurate and abuse-resistant.
- **Persisted storage** of reservations.
- **Abuse resistance**: one reservation per email; one IP cannot farm many emails;
  OTP cannot be spammed at a victim; codes cannot be brute-forced.
- **Automated confirmation email** after verification.
- **Refined design**: momentum smooth-scroll, richer scroll motion, refined graphics,
  fewer/stronger sections — same white brand.
- **Very arranged folders** so the structure is self-explanatory.
- **Free hosting + free test URL** today; clean path to a real domain later.
- **Security**: no SQL injection, no client secrets, strict CSP preserved, parallel
  security review on the real diff.

### Non-goals (YAGNI)
- No unique access codes now (codes issued in-app at launch).
- No in-app redemption flow.
- No payments / Stripe / $1 fee (dropped by user decision).
- No user accounts, login, sessions, or dashboard (OTP is single-use, stateless —
  not a login).
- No newsletter automation beyond confirmation + OTP emails.
- No analytics/trackers.
- No visual rebrand (dark mode / new palette).

---

## 3. Decisions (locked with user)

| Topic | Decision |
|-------|----------|
| Model | 1,000 free spots, email only, no payment |
| Verification | **Email OTP** — 6-digit code, must be entered to reserve |
| Uniqueness | One reservation per email (DB primary key) |
| IP abuse | One IP-hash may hold at most **3** verified reservations |
| Access code | Not now — emailed at app launch |
| Confirmation email | Auto-sent after verification; points to IG / X / Discord |
| Storage | Supabase (free Postgres) |
| Email provider | Resend (free: 100/day, 3k/mo, 1 domain) |
| Smooth scroll | Lenis 1.3.26, self-hosted (CSP-safe) |
| Hosting | Vercel free tier |
| Test URL | `*.vercel.app` (free) now |
| Free domain | See §8 — `.vercel.app` now; buy `angel0x1.com` at launch |
| Visual direction | Refine current white aesthetic |
| Dependencies | Keep near-zero: Supabase & Resend via raw `fetch` (no SDKs → smaller supply-chain surface). Only Lenis is vendored. |

---

## 4. Architecture

Static-first Astro on Vercel. Marketing pages prerendered. Three on-demand
serverless functions (`export const prerender = false`) where secrets live in host env.

### Two-step verified flow

```
STEP 1 — request code
  Browser  ──POST /api/reserve/request { email, _hp } ─▶  serverless
      rate-limit (per-IP + per-email) · honeypot · validate email
      reject if email already verified · reject if IP already has 3 verified
      generate 6-digit OTP → store pending(email, code_hash, ip_hash, expires, attempts=0)
      send OTP email (Resend)
      return { ok:true }   ← generic; never reveals if email is new/known

STEP 2 — verify code
  Browser  ──POST /api/reserve/verify { email, code } ─▶  serverless
      look up pending · check expiry · check attempts<5 · constant-time compare hash
      on match → RPC reserve_spot(email, ip_hash)  [atomic: re-checks global+IP caps,
                 inserts into reservations, deletes pending]  → { ok | full | ip_capped }
      send confirmation email (Resend, non-fatal on failure)
      return { ok:true, remaining }

COUNTER
  Browser  ──GET /api/waitlist/count ─▶  { reserved, cap:1000 }   (edge-cached 60s)
```

### Components / units (each independently understandable & testable)

Server-only logic lives in `src/lib/` so routes stay thin:

1. **`src/lib/env.ts`** — typed, runtime (`process.env`) access to secrets. Never
   `import.meta.env` (Vite would inline it).
2. **`src/lib/security.ts`** — `validEmail`, `clientIp`, `ipHash` (SHA-256 of
   `ip+salt`), in-memory rate limiter, `constantTimeEqual`.
3. **`src/lib/otp.ts`** — `generateCode` (crypto-random 6 digits), `hashCode`
   (SHA-256 of `code+salt`), `verifyCode` (constant-time).
4. **`src/lib/store.ts`** — Supabase adapter: `putPending`, `getPending`,
   `bumpAttempts`, `reserveSpot` (RPC), `countReserved`, `countIpReserved`. All via
   parameterized REST/RPC — **no SQL strings built in JS**.
5. **`src/lib/email.ts`** — Resend adapter: `sendOtp`, `sendConfirmation`. Fixed
   templates; only interpolates the validated email + the numeric code.
6. **Routes** `src/pages/api/reserve/request.ts`, `verify.ts`, `waitlist/count.ts` —
   thin orchestration over `lib/`.
7. **Front-end** `public/scripts/reserve.js` — two-step form (email → code → done),
   `aria-live` status, all states; retargeted copy.
8. **Motion** `public/scripts/reveal.js` + `public/scripts/lenis.min.js` — momentum
   scroll + reveals, `prefers-reduced-motion` aware.

---

## 5. Data model

```sql
-- Unverified requests. Rows are short-lived (expire) and do NOT consume a spot.
create table pending_reservations (
  email      text primary key,
  code_hash  text        not null,             -- sha256(code + OTP_SALT); never plaintext
  ip_hash    text        not null,             -- sha256(ip + IP_HASH_SALT); never raw IP
  attempts   int         not null default 0,   -- verify attempts, cap 5
  expires_at timestamptz not null,             -- now() + 10 min
  created_at timestamptz not null default now()
);
create index pending_ip_hash_idx on pending_reservations (ip_hash);

-- Verified reservations. These are what count toward the 1,000.
create table reservations (
  email      text primary key,                 -- one reservation per email
  ip_hash    text        not null,
  created_at timestamptz not null default now()
);
create index reservations_ip_hash_idx on reservations (ip_hash);
```

### Atomic reserve (why an RPC)
Global cap + per-IP cap + insert + pending-delete must be atomic, or two concurrent
verifies both see "999 / 2 IP" and slip past. A single Postgres function does it in
one transaction:

```sql
create or replace function reserve_spot(p_email text, p_ip_hash text)
returns text                                   -- 'ok' | 'full' | 'ip_capped' | 'duplicate'
language plpgsql security definer as $$
declare total int; per_ip int;
begin
  select count(*) into total  from reservations;
  if total >= 1000 then return 'full'; end if;
  select count(*) into per_ip from reservations where ip_hash = p_ip_hash;
  if per_ip >= 3 then return 'ip_capped'; end if;
  insert into reservations(email, ip_hash) values (p_email, p_ip_hash);
  delete from pending_reservations where email = p_email;
  return 'ok';
exception when unique_violation then return 'duplicate';
end $$;
```

Counter = `1000 − count(reservations)` (verified only). Pending rows never consume a
spot; if the list fills between request and verify, verify returns `full` honestly.

---

## 6. Security posture (the "bulletproof" requirement)

Keep (existing): strict CSP `default-src 'self'`, HSTS preload, `X-Content-Type-Options`,
locked `Permissions-Policy`, no inline scripts/styles, honeypot, per-IP rate limit,
server-side validation, no secrets in client bundle.

Add / verify:

- **No SQL injection** — zero dynamically-built SQL. Supabase REST + parameterized
  RPC only; user input is a *parameter*, never concatenated.
- **No secrets client-side** — `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
  `IP_HASH_SALT`, `OTP_SALT` read via `process.env` in functions only. Verified by
  grepping the built client bundle.
- **OTP hardening**:
  - 6-digit code from a CSPRNG (`crypto.getRandomValues`).
  - Stored only as `sha256(code + OTP_SALT)` — never plaintext, in DB or logs.
  - **Constant-time** hash comparison (no early-exit timing leak).
  - **10-minute expiry**; **max 5 attempts** then the pending row is invalidated.
  - **Request throttle**: ≤1 code per email per 60s, ≤5/day per email, plus per-IP cap
    on pending rows → cannot spam a victim's inbox or brute-force.
  - Generic responses — never reveal whether an email is new, pending, or reserved.
- **Privacy** — store `ip_hash`, never the raw IP; salt is a server secret.
- **CSP unchanged** — Lenis self-hosted under `public/scripts/` (`script-src 'self'`);
  all browser fetches are same-origin (`connect-src 'self'`); Supabase/Resend calls are
  server→server, not subject to browser CSP.
- **Email injection safe** — fixed templates; the only interpolated values are the
  validated email (in `to`) and the numeric code. No user-supplied HTML.
- **Fail closed / safe** — DB error → 500, nothing leaked. Confirmation-email failure
  is non-fatal (spot still reserved, logged). OTP-email failure → 500, no pending
  orphan surfaced to user.
- **Dedicated security review** — `/security-review` via **parallel agents** on the
  real diff before "done". Findings triaged + fixed.

### Threat model
| Attack | Mitigation |
|--------|-----------|
| Fake / farmed emails | **OTP** — must open the inbox; unverified never counts |
| Same email claims twice | Email is PK → duplicate rejected atomically |
| One person, many emails, same IP | IP-hash cap (≤3) enforced atomically in RPC |
| OTP brute force | 6 digits + 5-attempt cap + 10-min expiry + hashed compare |
| OTP spam / email bombing a victim | Per-email 60s + 5/day throttle; per-IP pending cap |
| Botnet mass signup | Honeypot + rate limit + OTP + global 1,000 cap |
| Counter hammering → DB cost/DoS | Count endpoint edge-cached 60s |
| Header spoof to evade limits | Trust platform header; rightmost XFF hop |
| Secret leakage | Secrets only in `process.env`; bundle grep in verification |
| SQL injection | No SQL strings; parameterized REST/RPC only |
| Timing attack on code | Constant-time comparison |
| Enumeration (is email registered?) | Generic responses at both steps |

---

## 7. Design refinement (visual)

Refine the current warm-white aesthetic. No palette change. **Mobile-first and
very minimal** — the phone experience is the primary target; the desktop layout is
the enhancement. **The waitlist/reserve flow is the highlighted feature of the whole
site**, surfaced persistently, not just in one section.

### Inspiration adapted from k95.it (kept on-brand, not copied)
- **Minimal fixed nav + full-screen hamburger overlay on mobile** — logo left, a single
  "Reserve" CTA right; on small screens the menu opens a full-screen overlay with large
  tap targets (links + socials + the live counter).
- **Big editorial hero** — one strong headline, generous whitespace, a single living
  graphic (the winged-eye Mark), a "Scroll" cue.
- **Letter-swap hover micro-interaction** on nav/CTA labels (premium detail); pointer-only,
  disabled on touch and under `prefers-reduced-motion`.
- **Persistent live counter** (their footer "12 / 20" motif) → our **"X / 1000 reserved"**,
  shown in the nav/overlay and the reserve section, so the scarcity is always visible.
- **Gallery-like restraint** — fewer sections, heavier whitespace, optimized assets, motion
  used sparingly and purposefully.

### Socials (confirmed handles)
- **X / Twitter**: `@angel0x1_` → `https://x.com/angel0x1_`
- **Instagram**: `@angel0x1_` → `https://instagram.com/angel0x1_`
- **Discord**: link TBD (optional; omitted gracefully if unset).
- Socials appear in: the footer, the mobile menu overlay, the reserve success state, and
  both emails. Handles/URLs centralized in one config so they're edited in a single place.

### Mobile-first specifics
- Base styles target ~360–430px width first; layout scales up with `min-width` queries.
- Reserve form: single full-width email field → full-width 6-digit code entry
  (`inputmode="numeric"`, `autocomplete="one-time-code"`, `pattern="[0-9]*"` so iOS/Android
  surface the numeric keypad and OS autofill of the SMS/email code where supported).
- All tap targets ≥ 44×44px; sticky bottom "Reserve" affordance on mobile so the primary
  action is always one thumb-tap away.
- Momentum scroll (Lenis) tuned for touch; respects reduced-motion.

- **Momentum smooth-scroll** — Lenis (self-hosted), custom `raf` loop, disabled under
  `prefers-reduced-motion` (native scroll fallback).
- **Motion** — keep IO reveals; add scroll-scrubbed parallax on the marks, tighter
  easing, staggered section reveals.
- **Sections (trimmed, stronger)** — Hero → soul line → What it is → Progression →
  Privacy → **Reserve (finale, live counter + two-step form)** → Footer. More whitespace.
- **Graphics** — refine the winged-eye Mark (cleaner draw-in, calmer idle), softer
  glows, optional cheap CSS grain.
- **Reserve section** — the climax: live "X of 1,000 spots left"; step 1 email field →
  step 2 code field (6 boxes or one input) → success "You're in — follow us" with
  IG / X / Discord.
- **Copy** — "first 5,000 free for life" → **"first 1,000 reserve a free lifetime
  spot"** across hero, waitlist, meta, legal.

### Accessibility
- All motion gated behind `prefers-reduced-motion`.
- Labels, `aria-live` status on both steps, focus-visible preserved. AA contrast unchanged.

---

## 8. Hosting & the free domain (concrete)

- **Hosting**: Vercel free tier (already targeted).
- **Free test URL today**: `angel0x1.vercel.app` on first deploy — enough to test
  counter, OTP, storage, and email end-to-end.
- **Free real domain options** (pick one when ready):
  1. **`*.vercel.app`** — free, instant, zero setup. *Recommended for testing.*
  2. **`angel0x1.js.org`** — free; requires a small PR to the js.org repo (JS projects).
  3. **`angel0x1.eu.org`** — free; approval can take days.
  4. Avoid **`.tk/.ml/.ga`** free TLDs — they wreck trust and email deliverability.
- **Recommended for launch**: buy **`angel0x1.com`** (~$10/yr, Cloudflare/Namecheap).
  The code already hardcodes `angel0x1.com`, and a real domain is required for good
  Resend deliverability (SPF/DKIM). Until then, Resend sends from `onboarding@resend.dev`
  to *your own* inbox for testing.

---

## 9. Configuration (env — all server-only)

```
# storage
WAITLIST_STORE=supabase|none
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...        # server-only secret
WAITLIST_CAP=1000

# abuse / crypto
IP_HASH_SALT=...                     # random 32+ bytes, server-only
OTP_SALT=...                         # random 32+ bytes, server-only
IP_CLAIM_CAP=3
OTP_TTL_MIN=10
OTP_MAX_ATTEMPTS=5

# email (Resend)
EMAIL_PROVIDER=resend|none
RESEND_API_KEY=...                   # server-only secret
RESEND_FROM="Angel0x1 <onboarding@resend.dev>"   # → hello@angel0x1.com once verified

# socials are PUBLIC, not secret → they live in src/config/site.ts (a shared
# constant imported by pages + emails), NOT in env. Confirmed handles:
#   X:  https://x.com/angel0x1_
#   IG: https://instagram.com/angel0x1_
#   Discord: optional; omitted from UI if left empty
```

### Graceful degradation (runs the instant it's deployed)
- `WAITLIST_STORE=none`: OTP flow runs in-memory/log mode for UI testing; nothing
  persisted. (Clearly labeled dev-only.)
- `EMAIL_PROVIDER=none`: the code is shown in the server log / dev response instead of
  emailed, so the flow is testable before Resend is connected.
- Real values flip each subsystem on with no code change.

`.env.example` documents all keys (never real values).

---

## 10. Folder layout (arranged so it's self-explanatory)

```
Angel0x1-Website/
├─ README.md
├─ SETUP.md                      ← NEW: step-by-step "create & connect the accounts"
├─ docs/superpowers/specs/2026-08-16-reserve-spot-design.md
├─ db/                           ← NEW: SQL you paste into Supabase (in order)
│  ├─ 01_schema.sql
│  └─ 02_reserve_rpc.sql
├─ src/
│  ├─ components/Mark.astro
│  ├─ config/
│  │  └─ site.ts                 ← NEW: public site config (socials, cap, copy) — shared by pages + emails
│  ├─ layouts/Base.astro
│  ├─ lib/                       ← NEW: server-only logic (never shipped to browser)
│  │  ├─ env.ts
│  │  ├─ security.ts             ← ipHash, rate-limit, validation, constant-time eq
│  │  ├─ otp.ts                  ← generate / hash / verify code
│  │  ├─ store.ts                ← Supabase adapter (REST + RPC, parameterized)
│  │  └─ email.ts                ← Resend adapter (OTP + confirmation)
│  ├─ pages/
│  │  ├─ index.astro · privacy.astro · terms.astro
│  │  └─ api/
│  │     ├─ reserve/request.ts   ← step 1 (send OTP)
│  │     ├─ reserve/verify.ts    ← step 2 (verify → reserve)
│  │     └─ waitlist/count.ts    ← live counter
│  └─ styles/global.css
├─ public/
│  └─ scripts/
│     ├─ reserve.js              ← NEW: two-step form controller
│     ├─ reveal.js               ← reveals + parallax
│     └─ lenis.min.js            ← NEW: vendored smooth-scroll (self-hosted, MIT)
├─ vercel.json                   ← security headers + CSP
└─ .env.example                  ← env template (documented; no real values)
```

---

## 11. Testing

- **Unit**: `validEmail`, `ipHash`, `generateCode` (range/entropy), `hashCode`,
  `verifyCode` (constant-time, wrong code fails, expired fails, >5 attempts fails),
  count math (`remaining = max(0, cap − reserved)`).
- **Integration** (Supabase test project or mock): request→verify happy path;
  duplicate email → handled; 4th verified email from one ip_hash → `ip_capped`;
  1000th → `full`; expired code → rejected; 6th attempt → invalidated; malformed body
  → 400.
- **Security checks**: grep built client bundle for any secret/env leak; verify CSP
  headers on the preview; attempt header-spoof rate-limit bypass; confirm OTP never
  logged in plaintext.
- **Manual E2E on Vercel preview**: reserve a spot with a real code, watch counter
  decrement (after cache window), receive both emails.
- **Reduced-motion**: Lenis + reveals disabled.

---

## 12. Rollout

1. Build refined UI + OTP backend on a feature branch (graceful-degradation defaults).
2. Deploy Vercel preview (free URL), `WAITLIST_STORE=none`, `EMAIL_PROVIDER=none` →
   verify UI, motion, and flow (code shown in dev response).
3. Create Supabase project; run `db/01_schema.sql` + `db/02_reserve_rpc.sql`; set env;
   redeploy → verify persistence + counter.
4. Create Resend account; verify domain (or use `onboarding@resend.dev` to your inbox);
   set env → verify OTP + confirmation emails.
5. `/security-review` via parallel agents on the diff; fix findings.
6. Update legal copy (1,000 / no-payment / OTP). Point `angel0x1.com` when purchased.

---

## 13. What the user must provide

- **To build & test (free):** nothing — testable on `*.vercel.app`, code shown in dev
  mode before accounts exist.
- **To go live:**
  - **Supabase** free project → paste 3 env values (URL, service key) + run the 2 SQL files.
  - **Resend** free account → API key; a verified domain for sending to arbitrary users
    (or test to your own inbox first).
  - **IG / X / Discord** links.
  - **Domain** (`angel0x1.com`) when ready.
- I provide `SETUP.md` walking through each, in order.
