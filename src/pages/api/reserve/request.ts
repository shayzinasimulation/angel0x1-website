// src/pages/api/reserve/request.ts
import type { APIRoute } from 'astro';
import { clientIp, ipHash, validEmail, canonicalizeEmail, rateLimit } from '../../../lib/security.ts';
import { generateCode, hashCode } from '../../../lib/otp.ts';
import { isReserved, countReserved, putPending, getPending } from '../../../lib/store.ts';
import { sendOtp } from '../../../lib/email.ts';
import { config, devCodeAllowed, assertProdConfig } from '../../../lib/env.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  // Fail closed: a production instance missing EMAIL_PROVIDER or the salts must not run
  // with insecure defaults (would otherwise hand out the OTP / use a public salt).
  try {
    assertProdConfig();
  } catch (e) {
    console.error('[reserve/request]', e);
    return Response.json({ ok: false, error: 'Service unavailable.' }, { status: 503 });
  }

  const ip = clientIp(request);
  if (rateLimit(`req:ip:${ip}`, 5, 60_000)) {
    return Response.json({ ok: false, error: 'Too many requests — slow down.' }, { status: 429 });
  }

  let body: { email?: unknown; _hp?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Bad request.' }, { status: 400 });
  }

  // Honeypot: pretend success, do nothing.
  if (body._hp) return Response.json({ ok: true });

  const raw = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!validEmail(raw)) return Response.json({ ok: false, error: 'Invalid email.' }, { status: 422 });
  // Canonical form (strips gmail dots/+tags) is the key for storage + throttling so one
  // inbox can't mint many "distinct" addresses.
  const email = canonicalizeEmail(raw);

  // First-layer per-instance throttle (cheap). The real cross-instance throttle is the
  // DB pending-row age check below.
  if (rateLimit(`req:ip:day:${ip}`, 50, 86_400_000)) return Response.json({ ok: true });

  const { cap, otpTtlMs, otpSalt, ipSalt } = config();

  try {
    // If already reserved, or the list is full, don't issue a code — respond generically.
    if (await isReserved(email)) return Response.json({ ok: true });
    if ((await countReserved()) >= cap) return Response.json({ ok: false, error: 'full' }, { status: 200 });

    // Cross-instance 60s throttle: if a code was issued < 60s ago (derived from the
    // pending row's expiry), don't send another. Prevents email-bombing across instances.
    const existing = await getPending(email);
    if (existing) {
      const issuedAt = existing.expiresAt - otpTtlMs;
      if (Date.now() - issuedAt < 60_000) return Response.json({ ok: true });
    }

    const code = generateCode();
    const codeHash = await hashCode(code, otpSalt);
    const hashedIp = await ipHash(ip, ipSalt);
    await putPending({ email, codeHash, ipHash: hashedIp, expiresAt: Date.now() + otpTtlMs });

    const sent = await sendOtp(email, code);
    if (!sent.ok) return Response.json({ ok: false, error: 'Could not send code — try again.' }, { status: 502 });

    // devCode is surfaced ONLY in non-production when email is disabled (local/preview).
    return Response.json(devCodeAllowed() ? { ok: true, devCode: sent.devCode } : { ok: true });
  } catch (e) {
    console.error('[reserve/request] error', e);
    return Response.json({ ok: false, error: 'Server error — please try again.' }, { status: 500 });
  }
};
