// src/lib/email.ts
import { flags, config } from './env.ts';
import { SITE, activeSocials } from '../config/site.ts';

const socialLinks = () => activeSocials().map((s) => `<a href="${s.href}">${s.label}</a>`).join(' · ');

export function otpHtml(code: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:auto">
  <h2 style="letter-spacing:-.02em">Your Angel0x1 code</h2>
  <p style="color:#6B6560">Enter this code to reserve your spot. It expires in 10 minutes.</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:.3em;margin:24px 0">${code}</p>
  <p style="color:#9E978E;font-size:13px">If you didn't request this, ignore this email.</p>
</div>`;
}
export function otpText(code: string): string {
  return `Your Angel0x1 code is ${code}. It expires in 10 minutes. If you didn't request this, ignore this email.`;
}
export function confirmationHtml(): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:auto">
  <h2 style="letter-spacing:-.02em">Your spot is reserved 🎉</h2>
  <p style="color:#6B6560">You're one of the first 1,000. Your code for 3 months of Angel free will be emailed to you the moment Angel0x1 launches.</p>
  <p style="color:#6B6560">Until then, follow along: ${socialLinks()}</p>
  <p style="color:#9E978E;font-size:13px">All the intelligence, none of the surveillance.</p>
</div>`;
}

async function resendSend(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config().resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config().resendFrom, to: [to], subject, html, text }),
  });
  return res.ok;
}

export async function sendOtp(email: string, code: string): Promise<{ ok: boolean; devCode?: string }> {
  if (!flags().emailEnabled) {
    console.log(`[email:dev] OTP for ${email} issued (returned in dev response, not logged as plaintext in prod)`);
    return { ok: true, devCode: code };
  }
  const ok = await resendSend(email, `${SITE.name} — your code`, otpHtml(code), otpText(code));
  return { ok };
}

export async function sendConfirmation(email: string): Promise<{ ok: boolean }> {
  if (!flags().emailEnabled) {
    console.log(`[email:dev] confirmation for ${email} skipped`);
    return { ok: true };
  }
  try {
    const ok = await resendSend(
      email,
      `${SITE.name} — spot reserved`,
      confirmationHtml(),
      'Your spot is reserved. Your code arrives at launch. Follow us for updates.',
    );
    return { ok };
  } catch (e) {
    console.error('[email] confirmation failed (non-fatal)', e);
    return { ok: false };
  }
}
