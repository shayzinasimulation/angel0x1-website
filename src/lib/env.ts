// src/lib/env.ts
// Runtime env access ONLY (process.env) — never import.meta.env (Vite would inline
// at build and strip adapters, so a secret added later in the dashboard would never
// take effect). Nothing here is bundled to the client.
export const env = (k: string): string | undefined => process.env[k];

const DEV_IP_SALT = 'dev-insecure-ip-salt';
const DEV_OTP_SALT = 'dev-insecure-otp-salt';

/** True on ANY Vercel deployment (production OR preview). Vercel sets VERCEL=1 on
 *  every deployment; it is unset when running locally. Used to guarantee the OTP is
 *  never returned in a response served from a real URL — only on localhost. */
export function isDeployed(): boolean {
  return !!env('VERCEL');
}

/** True on a Vercel production deployment. Used to fail CLOSED: dev-only
 *  conveniences (weak default salts, unconfigured email) must never activate in
 *  production. We key on VERCEL_ENV (authoritative: 'production' only on prod
 *  deploys, 'preview' on previews, unset locally) — NOT NODE_ENV, which
 *  `astro build`/`preview` set to 'production' locally. */
export function isProd(): boolean {
  return env('VERCEL_ENV') === 'production';
}

export function flags() {
  return {
    storeEnabled: (env('WAITLIST_STORE') ?? 'none') === 'supabase',
    emailEnabled: (env('EMAIL_PROVIDER') ?? 'none') === 'resend',
  };
}

/** May the plaintext OTP be returned to the client? ONLY on a true local dev machine
 *  (not deployed anywhere) AND when email is off. On any deployed URL — production or
 *  preview — this is always false, so the code is only ever delivered by email and can
 *  never be read from the network response. */
export function devCodeAllowed(): boolean {
  return !isDeployed() && !flags().emailEnabled;
}

/** Fail closed on a misconfigured production deploy. Called at the top of the
 *  reserve routes so a prod instance can never run with insecure defaults. */
export function assertProdConfig(): void {
  if (!isProd()) return;
  const problems: string[] = [];
  if (!flags().emailEnabled) problems.push('EMAIL_PROVIDER must be "resend" in production');
  if ((env('IP_HASH_SALT') ?? '') === '') problems.push('IP_HASH_SALT is required in production');
  if ((env('OTP_SALT') ?? '') === '') problems.push('OTP_SALT is required in production');
  if (problems.length) throw new Error(`[config] insecure production configuration: ${problems.join('; ')}`);
}

/** Parse an int env var, falling back to `def` for unset, empty, OR non-numeric
 *  values. Guards against NaN (which would serialize to null in JSON and break the
 *  counter) when a platform exposes an unset var as '' rather than undefined. */
function intEnv(key: string, def: number): number {
  const raw = env(key);
  if (raw == null || raw.trim() === '') return def;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : def;
}

export function config() {
  return {
    cap: intEnv('WAITLIST_CAP', 1000),
    ipCap: intEnv('IP_CLAIM_CAP', 3),
    otpTtlMs: intEnv('OTP_TTL_MIN', 10) * 60_000,
    otpMaxAttempts: intEnv('OTP_MAX_ATTEMPTS', 5),
    supabaseUrl: env('SUPABASE_URL'),
    supabaseKey: env('SUPABASE_SERVICE_ROLE_KEY'),
    // Weak defaults exist ONLY for local dev; assertProdConfig() blocks them in prod.
    ipSalt: env('IP_HASH_SALT') ?? DEV_IP_SALT,
    otpSalt: env('OTP_SALT') ?? DEV_OTP_SALT,
    resendKey: env('RESEND_API_KEY'),
    resendFrom: env('RESEND_FROM') ?? 'Angel0x1 <onboarding@resend.dev>',
  };
}
