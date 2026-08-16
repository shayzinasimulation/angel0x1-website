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
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Bad request.' }, { status: 400 });
  }

  // Honeypot: pretend success, do nothing.
  if (body._hp) return Response.json({ ok: true });

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!validEmail(email)) return Response.json({ ok: false, error: 'Invalid email.' }, { status: 422 });

  // Per-email throttle: ≤1 code / 60s, ≤5 / day. Generic 200 (no enumeration).
  if (rateLimit(`req:email60:${email}`, 1, 60_000)) return Response.json({ ok: true });
  if (rateLimit(`req:emailday:${email}`, 5, 86_400_000)) return Response.json({ ok: true });

  const { cap, otpTtlMs, otpSalt, ipSalt } = config();

  try {
    // If already reserved, or the list is full, don't issue a code — respond generically.
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
