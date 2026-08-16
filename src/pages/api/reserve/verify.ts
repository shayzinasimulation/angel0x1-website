// src/pages/api/reserve/verify.ts
import type { APIRoute } from 'astro';
import { clientIp, ipHash, validEmail, canonicalizeEmail, rateLimit } from '../../../lib/security.ts';
import { codeMatches } from '../../../lib/otp.ts';
import { getPending, bumpAttempts, deletePending, reserveSpot, countReserved } from '../../../lib/store.ts';
import { sendConfirmation } from '../../../lib/email.ts';
import { config, assertProdConfig } from '../../../lib/env.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    assertProdConfig();
  } catch (e) {
    console.error('[reserve/verify]', e);
    return Response.json({ ok: false, error: 'Service unavailable.' }, { status: 503 });
  }

  const ip = clientIp(request);
  if (rateLimit(`vrf:ip:${ip}`, 10, 60_000)) {
    return Response.json({ ok: false, error: 'Too many requests — slow down.' }, { status: 429 });
  }

  let body: { email?: unknown; code?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Bad request.' }, { status: 400 });
  }

  const raw = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!validEmail(raw) || !/^[0-9]{6}$/.test(code)) {
    return Response.json({ ok: false, error: 'invalid' }, { status: 422 });
  }
  const email = canonicalizeEmail(raw); // same key as request used to store the pending row

  const { otpSalt, otpMaxAttempts, ipSalt, cap } = config();

  try {
    const pending = await getPending(email);
    if (!pending) return Response.json({ ok: false, error: 'invalid' }, { status: 422 });
    if (Date.now() > pending.expiresAt) {
      await deletePending(email);
      return Response.json({ ok: false, error: 'expired' }, { status: 410 });
    }

    // Increment the attempt counter ATOMICALLY *before* comparing (act-then-check).
    // This bounds guesses to otpMaxAttempts even under concurrent verifies: the
    // (max+1)-th caller atomically gets n > max and is rejected before any compare.
    // Gating on the stale `pending.attempts` read instead would let a burst of
    // concurrent requests all pass a "0 attempts" snapshot and brute-force the code.
    const n = await bumpAttempts(email);
    if (n === 0) return Response.json({ ok: false, error: 'invalid' }, { status: 422 }); // row vanished
    if (n > otpMaxAttempts) {
      await deletePending(email);
      return Response.json({ ok: false, error: 'expired' }, { status: 410 });
    }

    const match = await codeMatches(code, pending.codeHash, otpSalt);
    if (!match) {
      if (n >= otpMaxAttempts) await deletePending(email);
      return Response.json({ ok: false, error: 'invalid' }, { status: 422 });
    }

    // Verified. Reserve atomically (RPC serializes cap checks). Use the ip_hash
    // captured at request time so the per-IP cap can't be dodged by switching IP now.
    const hashedIp = pending.ipHash || (await ipHash(ip, ipSalt));
    const result = await reserveSpot(email, hashedIp);
    if (result === 'ok' || result === 'duplicate') {
      await deletePending(email); // idempotent; RPC already clears it, this covers in-memory + safety
      await sendConfirmation(email); // non-fatal
      const reserved = await countReserved();
      return Response.json({ ok: true, remaining: Math.max(0, cap - reserved) });
    }
    // 'full' | 'ip_capped'
    await deletePending(email);
    return Response.json({ ok: false, error: result }, { status: 409 });
  } catch (e) {
    console.error('[reserve/verify] error', e);
    return Response.json({ ok: false, error: 'Server error — please try again.' }, { status: 500 });
  }
};
