// src/lib/email.ts
import { flags, config } from './env.ts';
import { SITE, activeSocials } from '../config/site.ts';

// Social row for emails: real IG/X brand icons as hosted PNGs (email clients strip
// SVG, so we use raster images at absolute URLs). Falls back to a text link for any
// social without an icon (e.g. Discord).
const ICON_FILE: Record<string, string> = { instagram: 'ig.png', x: 'x.png' };
function socialLinks(): string {
  const base = config().siteUrl;
  return activeSocials()
    .map((s) => {
      const icon = ICON_FILE[s.key];
      if (icon) {
        return `<a href="${s.href}" style="text-decoration:none;display:inline-block;margin:0 8px;"><img src="${base}/email/${icon}" width="22" height="22" alt="${s.label}" style="display:inline-block;border:0;outline:none;vertical-align:middle;"></a>`;
      }
      return `<a href="${s.href}" style="color:#B33A2B;text-decoration:none;font-weight:600;margin:0 8px;">${s.label}</a>`;
    })
    .join('');
}

/**
 * Branded, email-client-safe shell: table layout + inline styles only (no external
 * CSS, no SVG — both are stripped by Gmail/Outlook). The animated logo is loaded from
 * an ABSOLUTE https URL (config().siteUrl) so it renders in every client. Warm-white
 * canvas, red iris accent — the site's aesthetic, carried into the inbox.
 */
function shell(inner: string): string {
  const logo = `${config().siteUrl}/favicon.gif`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F4F1EC;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EC;">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#FCFBF9;border:1px solid #ECE7E0;border-radius:20px;overflow:hidden;">
      <tr><td align="center" style="padding:40px 40px 8px;">
        <img src="${logo}" width="60" height="60" alt="Angel0x1" style="display:block;border:0;outline:none;">
      </td></tr>
      <tr><td align="center" style="padding:10px 40px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:#9E978E;font-weight:600;margin-bottom:18px;">Angel0x1</div>
        ${inner}
      </td></tr>
      <tr><td style="padding:0 40px;"><div style="border-top:1px solid #ECE7E0;"></div></td></tr>
      <tr><td align="center" style="padding:22px 40px 34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="font-size:13px;color:#6B6560;margin-bottom:10px;">${socialLinks()}</div>
        <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#B7AFA5;">All the intelligence · none of the surveillance</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export function otpHtml(code: string): string {
  return shell(`
    <h1 style="margin:0 0 12px;font-size:26px;line-height:1.15;letter-spacing:-0.02em;color:#1A1714;font-weight:600;">Your code</h1>
    <p style="margin:0 0 26px;font-size:15px;line-height:1.55;color:#6B6560;">Enter this to reserve your spot. It expires in 10&nbsp;minutes.</p>
    <div style="display:inline-block;padding:18px 28px;background:#FFFFFF;border:1px solid #E7E1D9;border-radius:14px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:0.34em;color:#1A1714;">${code}</div>
    <p style="margin:26px 0 0;font-size:12px;line-height:1.5;color:#B7AFA5;">If you didn't request this, you can safely ignore this email — no spot is reserved without this code.</p>
  `);
}

export function otpText(code: string): string {
  return `Your Angel0x1 code is ${code}. It expires in 10 minutes. If you didn't request this, ignore this email.`;
}

export function confirmationHtml(): string {
  return shell(`
    <h1 style="margin:0 0 12px;font-size:26px;line-height:1.15;letter-spacing:-0.02em;color:#1A1714;font-weight:600;">Your spot is reserved.</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#6B6560;">You're one of the first <strong style="color:#1A1714;">1,000</strong>. Your code for <strong style="color:#1A1714;">3 months of Angel free</strong> will arrive by email the moment we launch.</p>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#6B6560;">Until then, follow along — that's where launch day drops first.</p>
  `);
}

export function confirmationText(): string {
  return `Your spot is reserved. You're one of the first 1,000 — your code for 3 months of Angel free arrives by email at launch. Follow along for updates.`;
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
      confirmationText(),
    );
    return { ok };
  } catch (e) {
    console.error('[email] confirmation failed (non-fatal)', e);
    return { ok: false };
  }
}
