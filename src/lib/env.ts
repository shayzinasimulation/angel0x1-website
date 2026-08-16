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
