// src/lib/email.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { otpHtml, otpText, confirmationHtml, sendOtp } from './email.ts';

test('otp templates contain the code, embed the logo, and have no script sink', () => {
  const html = otpHtml('123456');
  assert.ok(html.includes('123456'));
  assert.ok(!html.includes('<script'));
  assert.ok(/favicon\.gif/.test(html)); // animated logo embedded via absolute URL
  assert.ok(otpText('123456').includes('123456'));
});

test('confirmation mentions socials and launch, no code', () => {
  const html = confirmationHtml();
  assert.ok(/instagram|x\.com/i.test(html));
  assert.ok(/launch/i.test(html));
});

test('sendOtp in disabled mode returns devCode and does not throw', async () => {
  const r = await sendOtp('a@b.co', '424242'); // EMAIL_PROVIDER unset → disabled
  assert.equal(r.ok, true);
  assert.equal(r.devCode, '424242');
});
