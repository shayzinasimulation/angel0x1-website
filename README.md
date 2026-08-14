# Angel0x1 — Web

The marketing site + waitlist for Angel0x1. Static-first Astro, deployed on Vercel.
Minimal, on-brand, and built so **no secret can ever reach the browser**.

## Stack

- **Astro 5** — every marketing page is prerendered static HTML.
- **`@astrojs/vercel`** — only `/api/waitlist` and `/api/waitlist/count` run as
  serverless functions (marked `export const prerender = false`).
- **Zero third-party runtime**: no external fonts, no analytics, no trackers, no
  client-side keys. The animated mark, art, and scroll motion are all original
  SVG/CSS.

## Develop

```bash
cd web
npm install
npm run dev      # http://localhost:4321
npm run build    # production build → dist/ + .vercel/output/
```

## Deploy (Vercel)

1. Import the repo in Vercel and set **Root Directory = `web`**.
2. Framework preset: **Astro** (auto-detected). Build command `npm run build`,
   output handled by the Vercel adapter.
3. Add a custom domain when ready.

Nothing else is required — the site works immediately with the waitlist in
"accept + log" mode (see below).

## Wiring real waitlist storage (later)

The waitlist endpoint (`src/pages/api/waitlist.ts`) uses a pluggable adapter and
reads config **at runtime from `process.env`** — never `import.meta.env` (which Vite
would inline at build time and strip the adapter). Until you configure a store it
validates + accepts emails and logs a notice; nothing is persisted.

To turn on Supabase storage:

1. Create a free Supabase project and a table:
   ```sql
   create table waitlist (
     email text primary key,
     created_at timestamptz default now()
   );
   ```
2. In **Vercel → Project → Settings → Environment Variables** (Production), set:
   - `WAITLIST_STORE=supabase`
   - `SUPABASE_URL=https://<project>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY=<service-role-key>`  ← **server-only secret**
   - `WAITLIST_LIFETIME_CAP=5000`
3. Redeploy. The live `X / 5000 remaining` counter hydrates from
   `/api/waitlist/count`.

`.env.example` documents these. Copy it to `.env` for local testing only — `.env`
is gitignored and must never be committed.

> Any other store (Vercel KV, Cloudflare D1, Buttondown, ConvertKit…) drops into the
> `store()` function without touching the route logic or the client.

## Security posture

- **No secrets in the client bundle.** Secrets are read with `process.env` inside
  serverless functions only; the service-role key never appears in any file served
  to the browser. Verified in the build output.
- **Strict CSP** (`vercel.json`): `default-src 'self'`, `script-src 'self'`,
  `object-src 'none'`, `frame-ancestors 'none'`, plus HSTS, `X-Content-Type-Options`,
  `Referrer-Policy`, and a locked-down `Permissions-Policy`.
- **Input hardening** on `/api/waitlist`: server-side email validation (mirrors the
  client), a hidden honeypot field, and a per-IP rate limit.
- **No accounts, no login** on the site — nothing to leak.
- The build ships no inline scripts/styles (`inlineStylesheets: 'never'`), so the CSP
  needs no `'unsafe-inline'`.

## Structure

```
web/
├─ src/
│  ├─ components/Mark.astro        # animated winged-eye (matches the app icon)
│  ├─ layouts/Base.astro           # <head>, meta, global CSS + reveal script
│  ├─ pages/
│  │  ├─ index.astro               # hero · about · roadmap · waitlist · footer
│  │  ├─ privacy.astro · terms.astro
│  │  └─ api/waitlist.ts · api/waitlist/count.ts   # serverless only
│  └─ styles/global.css
├─ public/
│  ├─ scripts/reveal.js · waitlist.js   # external same-origin modules (CSP-safe)
│  └─ favicon.svg · robots.txt
├─ vercel.json                     # security headers + CSP
└─ .env.example                    # env template (never put real secrets here)
```
