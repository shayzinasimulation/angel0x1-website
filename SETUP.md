# Angel0x1 — Setup & Launch Guide

Everything you need to take this from local preview → fully live. Follow in order.
The site is built to run at **every** stage, so you can stop anywhere and still have
a working site.

---

## Stage 0 — Run it locally (no accounts, 1 minute)

```bash
npm install
npm run dev        # → http://localhost:4321
```

In this mode the reserve flow works end-to-end **without** a database or email
provider: the 6-digit code is returned in the API response and auto-filled in the
form so you can test the whole thing. Nothing is persisted (resets on restart).

Other commands:

```bash
npm test           # run the zero-dependency unit tests (security, otp, store, email)
npm run typecheck  # astro check (types)
npm run build      # production build
```

---

## Stage 1 — Deploy to Vercel (free, get a public URL)

1. Push this repo to GitHub.
2. Go to <https://vercel.com>, **Add New → Project**, import the repo.
3. Framework preset: **Astro** (auto-detected). Leave defaults; deploy.
4. You get a free URL like `https://angel0x1.vercel.app`. The site is live —
   reserve flow still in local/in-memory mode until Stage 2.

---

## Stage 2 — Persist reservations with Supabase (free Postgres)

1. Create a project at <https://supabase.com> (free tier).
2. In the Supabase dashboard → **SQL Editor**, paste and run **`db/01_schema.sql`**,
   then **`db/02_reserve_rpc.sql`** (in that order). This creates the two tables,
   turns on Row Level Security, and installs the atomic `reserve_spot` /
   `bump_attempts` functions.
3. In Supabase → **Project Settings → API**, copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** (under "Project API keys" — the secret one) →
     `SUPABASE_SERVICE_ROLE_KEY`
4. Generate two random salts locally:
   ```bash
   openssl rand -hex 32   # use for IP_HASH_SALT
   openssl rand -hex 32   # use for OTP_SALT
   ```
5. In **Vercel → Project → Settings → Environment Variables** (Production), add:
   | Key | Value |
   |-----|-------|
   | `WAITLIST_STORE` | `supabase` |
   | `SUPABASE_URL` | your project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | your service_role key |
   | `IP_HASH_SALT` | first `openssl` value |
   | `OTP_SALT` | second `openssl` value |
   | `WAITLIST_CAP` | `1000` |
6. **Redeploy** (Vercel → Deployments → ⋯ → Redeploy). Reservations now persist and
   the live counter reads from the database.

> The **service_role key is a secret.** It only ever lives in Vercel's server env and
> in serverless functions. It is never in any file sent to the browser (verified in
> the build). Row Level Security is on with no policies, so even the public anon key
> could not read or write these tables.

---

## Stage 3 — Send real emails with Resend (free)

Until this stage, the reserve flow works but shows the code on-screen instead of
emailing it.

1. Create an account at <https://resend.com> (free: **100 emails/day, 3,000/month**).
2. **To test immediately without a domain:** Resend lets you send from
   `onboarding@resend.dev` to *your own* account email. Good enough to see the real
   emails arrive.
3. **To email anyone (required for launch):** add and verify a domain in Resend
   (**Domains → Add Domain**), then add the SPF/DKIM DNS records Resend shows you to
   your domain's DNS. Once verified, set the From address to `hello@angel0x1.com`.
4. In Resend → **API Keys**, create a key.
5. In **Vercel → Environment Variables**, add:
   | Key | Value |
   |-----|-------|
   | `EMAIL_PROVIDER` | `resend` |
   | `RESEND_API_KEY` | your Resend key |
   | `RESEND_FROM` | `Angel0x1 <onboarding@resend.dev>` (or `hello@angel0x1.com` once verified) |
6. **Redeploy.** Now reserving sends a real OTP email, and verifying sends the
   confirmation email. The `devCode` no longer appears in API responses.

---

## Stage 4 — Custom domain (optional, ~$10/yr)

- **Free option for testing:** the `*.vercel.app` URL works forever.
- **For launch:** buy `angel0x1.com` (Cloudflare Registrar or Namecheap are cheap and
  clean). In **Vercel → Settings → Domains**, add it and follow the DNS instructions.
  The code already expects `https://angel0x1.com`.
- Avoid free TLDs like `.tk`/`.ml` — they hurt trust and email deliverability.

---

## Where things live

| What | Where |
|------|-------|
| Public config (socials, cap, copy) | `src/config/site.ts` |
| Secrets & server config | Vercel env vars (template in `.env.example`) |
| Server logic (hashing, OTP, store, email) | `src/lib/` |
| API endpoints | `src/pages/api/reserve/*`, `src/pages/api/waitlist/count.ts` |
| Database SQL | `db/01_schema.sql`, `db/02_reserve_rpc.sql` |
| Front-end scripts | `public/scripts/` (reserve, reveal+Lenis, menu) |

## Social links

Set in `src/config/site.ts`:
- X: `https://x.com/angel0x1_`
- Instagram: `https://instagram.com/angel0x1_`
- Discord: empty by default — add the invite URL there and it appears automatically
  in the menu, footer, and confirmation email.
