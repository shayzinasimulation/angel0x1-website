// src/lib/env.ts
// Runtime env access ONLY (process.env) — never import.meta.env (Vite would inline
// at build and strip adapters, so a secret added later in the dashboard would never
// take effect). Nothing here is bundled to the client.
export const env = (k: string): string | undefined => process.env[k];

const DEV_IP_SALT = 'dev-insecure-ip-salt';
const DEV_OTP_SALT = 'dev-insecure-otp-salt';

/** True on a Vercel production deployment. Used to fail CLOSED: dev-only
 *  conveniences (returning the OTP in the response, weak default salts) must never
 *  activate in production, even if email/salts were left unconfigured.
 *  We key on VERCEL_ENV (authoritative: 'production' only on prod deploys, 'preview'
 *  on previews, unset locally) — NOT NODE_ENV, which `astro build`/`preview` set to
 *  'production' locally and would trip the guard during local testing. */
export function isProd(): boolean {
  return env('VERCEL_ENV') === 'production';
}

export function flags() {
  return {
    storeEnabled: (env('WAITLIST_STORE') ?? 'none') === 'supabase',
    emailEnabled: (env('EMAIL_PROVIDER') ?? 'none') === 'resend',
  };
}

/** May the plaintext OTP be returned to the client (dev/preview testing only)?
 *  Only when email is OFF *and* we are not in production. In production this is
 *  always false — the code must be emailed, never handed to the caller. */
export function devCodeAllowed(): boolean {
  return !flags().emailEnabled && !isProd();
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

export function config() {
  return {
    cap: parseInt(env('WAITLIST_CAP') ?? '1000', 10),
    ipCap: parseInt(env('IP_CLAIM_CAP') ?? '3', 10),
    otpTtlMs: parseInt(env('OTP_TTL_MIN') ?? '10', 10) * 60_000,
    otpMaxAttempts: parseInt(env('OTP_MAX_ATTEMPTS') ?? '5', 10),
    supabaseUrl: env('SUPABASE_URL'),
    supabaseKey: env('SUPABASE_SERVICE_ROLE_KEY'),
    // Weak defaults exist ONLY for local dev; assertProdConfig() blocks them in prod.
    ipSalt: env('IP_HASH_SALT') ?? DEV_IP_SALT,
    otpSalt: env('OTP_SALT') ?? DEV_OTP_SALT,
    resendKey: env('RESEND_API_KEY'),
    resendFrom: env('RESEND_FROM') ?? 'Angel0x1 <onboarding@resend.dev>',
  };
}
