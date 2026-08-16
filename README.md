# Angel0x1 — Web

The marketing site + **reserve-your-spot** waitlist for Angel0x1. Static-first Astro,
deployed on Vercel. Minimal, mobile-first, on-brand, and built so **no secret can ever
reach the browser**.

## What it does

- **1,000 free lifetime spots**, email only, no payment.
- **Email-verified**: you enter your email → get a 6-digit code → enter it → your spot
  is reserved. Unverified emails never count, which makes fake/farmed signups pointless.
- **Live counter** — "X of 1,000 spots left" — in the nav, hero, menu, and reserve section.
- **Automated emails** (via Resend): the code, then a confirmation pointing to the socials.
- **Abuse-resistant**: one spot per email (DB primary key), a per-network cap using a
  salted **hash** of the IP (never the raw IP), honeypot, rate limits, and OTP brute-force
  protection.

## Stack

- **Astro** — every marketing page is prerendered static HTML.
- **`@astrojs/vercel`** — only the API routes run as serverless functions
  (`export const prerender = false`): `/api/reserve/request`, `/api/reserve/verify`,
  `/api/waitlist/count`.
- **No runtime npm dependencies** — Supabase & Resend are called via raw `fetch`; only
  Lenis (smooth scroll) is vendored as a static file. Small supply-chain surface.
- **Zero third-party client runtime**: no external fonts, analytics, trackers, or
  client-side keys. The mark, art, and motion are original SVG/CSS.

## Develop

```bash
npm install
npm run dev        # http://localhost:4321  (full flow works with no accounts;
                   #   the code is returned in the API response for testing)
npm test           # zero-dependency unit tests (node:test): security, otp, store, email
npm run typecheck  # astro check
npm run build      # production build → dist/ + .vercel/output/
```

## Deploy & connect services

See **[`SETUP.md`](./SETUP.md)** for the full ordered walkthrough:

1. Deploy to Vercel (free `*.vercel.app` URL).
2. Supabase (free Postgres) — run `db/01_schema.sql` then `db/02_reserve_rpc.sql`, set
   env vars → reservations persist.
3. Resend (free) — verify a domain or test to your own inbox → real emails send.
4. Buy `angel0x1.com` and attach when ready.

Every stage is optional — the site runs at each step.

## Configuration

- **Secrets & server config** → Vercel env vars, documented in **`.env.example`**
  (`WAITLIST_STORE`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WAITLIST_CAP`,
  `IP_HASH_SALT`, `OTP_SALT`, `IP_CLAIM_CAP`, `OTP_TTL_MIN`, `OTP_MAX_ATTEMPTS`,
  `EMAIL_PROVIDER`, `RESEND_API_KEY`, `RESEND_FROM`). Read only via `process.env` on the
  server — never `import.meta.env`.
- **Public config** (social links, the 1,000 cap, headline copy) → `src/config/site.ts`.
  Socials: X `@angel0x1_`, Instagram `@angel0x1_`, Discord optional.

## Security posture

- **No secrets in the client bundle.** All secrets read via `process.env` inside
  serverless functions only; verified by grepping the build output.
- **No SQL injection.** No SQL strings are ever built in JS — all DB access is via
  Supabase's parameterized REST API and a parameterized `reserve_spot` RPC. Row Level
  Security is on (no policies), so the anon key can't touch the tables.
- **OTP hardening.** 6-digit CSPRNG code, stored only as a salted SHA-256 hash,
  10-minute expiry, 5-attempt cap, constant-time comparison, per-email + per-IP throttles.
- **Privacy.** We store a salted hash of the IP for abuse control, never the raw IP.
- **Strict CSP** (`vercel.json`): `default-src 'self'`, `script-src 'self'`,
  `connect-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, plus HSTS and a
  locked-down `Permissions-Policy`. No inline scripts/styles (`inlineStylesheets: 'never'`);
  Lenis is self-hosted so the CSP needs no relaxation.
- **Fail safe.** DB errors return 500 with nothing leaked; a failed confirmation email
  never blocks a reservation; responses are generic (no email enumeration).

## Structure

```
├─ src/
│  ├─ components/Mark.astro         # animated winged-eye
│  ├─ config/site.ts                # PUBLIC config: socials, cap, copy
│  ├─ layouts/Base.astro            # <head>, meta, scripts (Lenis, reveal, menu)
│  ├─ lib/                          # server-only logic (never shipped to browser)
│  │  ├─ env.ts                     #   runtime env + feature flags
│  │  ├─ security.ts                #   sha256, ipHash, validation, constant-time, rate limit
│  │  ├─ otp.ts                     #   6-digit code generate/hash/verify
│  │  ├─ store.ts                   #   Supabase REST/RPC adapter (+ in-memory fallback)
│  │  ├─ email.ts                   #   Resend adapter (+ log-only fallback)
│  │  └─ *.test.ts                  #   zero-dependency unit tests
│  ├─ pages/
│  │  ├─ index.astro                # hero · about · privacy · reserve · footer
│  │  ├─ privacy.astro · terms.astro
│  │  └─ api/
│  │     ├─ reserve/request.ts      #   step 1: issue OTP
│  │     ├─ reserve/verify.ts       #   step 2: verify → reserve
│  │     └─ waitlist/count.ts       #   live counter (edge-cached)
│  └─ styles/global.css
├─ public/scripts/                  # reserve.js · reveal.js · menu.js · lenis.min.js
├─ db/                              # 01_schema.sql · 02_reserve_rpc.sql (paste into Supabase)
├─ vercel.json                      # security headers + CSP
├─ .env.example                     # env template (never put real secrets here)
└─ SETUP.md                         # ordered deploy + connect guide
```
