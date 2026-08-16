// src/lib/security.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validEmail, canonicalizeEmail, sha256Hex, ipHash, constantTimeEqual, rateLimit, clientIp,
} from './security.ts';

test('validEmail accepts normal, rejects junk, overlong, and injection metacharacters', () => {
  assert.equal(validEmail('a@b.co'), true);
  assert.equal(validEmail('foo.bar+tag@gmail.com'), true);
  assert.equal(validEmail('no-at'), false);
  assert.equal(validEmail('a@b'), false);
  assert.equal(validEmail('a b@c.co'), false);
  assert.equal(validEmail('x'.repeat(320) + '@b.co'), false);
  // injection metacharacters must be rejected (defense-in-depth)
  assert.equal(validEmail('a&or=(x)@b.co'), false);
  assert.equal(validEmail("x'or'1'='1@b.co"), false);
  assert.equal(validEmail('a<img>@b.co'), false);
  assert.equal(validEmail('a,select@b.co'), false);
  // no leading/trailing/double dots
  assert.equal(validEmail('.a@b.co'), false);
  assert.equal(validEmail('a..b@c.co'), false);
});

test('canonicalizeEmail strips gmail dots and +tags, lowercases', () => {
  assert.equal(canonicalizeEmail('Foo.Bar+promo@gmail.com'), 'foobar@gmail.com');
  assert.equal(canonicalizeEmail('f.o.o@googlemail.com'), 'foo@gmail.com');
  assert.equal(canonicalizeEmail('user+x@fastmail.com'), 'user@fastmail.com'); // +tag stripped, dots kept
  assert.equal(canonicalizeEmail('a.b@fastmail.com'), 'a.b@fastmail.com');     // non-gmail dots preserved
  assert.equal(canonicalizeEmail('Plain@Example.COM'), 'plain@example.com');
});

test('sha256Hex is deterministic, 64 hex chars', async () => {
  const h = await sha256Hex('hello');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, await sha256Hex('hello'));
  assert.notEqual(h, await sha256Hex('world'));
});

test('ipHash depends on salt and never equals raw ip', async () => {
  const a = await ipHash('1.2.3.4', 'salt-a');
  const b = await ipHash('1.2.3.4', 'salt-b');
  assert.notEqual(a, b);
  assert.notEqual(a, '1.2.3.4');
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('constantTimeEqual', () => {
  assert.equal(constantTimeEqual('abcdef', 'abcdef'), true);
  assert.equal(constantTimeEqual('abcdef', 'abcdeg'), false);
  assert.equal(constantTimeEqual('abc', 'abcd'), false);
});

test('clientIp prefers vercel header then real-ip then rightmost xff', () => {
  const mk = (h: Record<string, string>) => new Request('https://x/', { headers: h });
  assert.equal(clientIp(mk({ 'x-vercel-forwarded-for': '9.9.9.9, 1.1.1.1' })), '9.9.9.9');
  assert.equal(clientIp(mk({ 'x-real-ip': '2.2.2.2' })), '2.2.2.2');
  assert.equal(clientIp(mk({ 'x-forwarded-for': 'a, b, 3.3.3.3' })), '3.3.3.3');
  assert.equal(clientIp(mk({})), 'unknown');
});

test('rateLimit blocks after max in window', () => {
  const key = 'test-key-' + Math.floor(performance.now());
  assert.equal(rateLimit(key, 2, 60_000), false); // 1st
  assert.equal(rateLimit(key, 2, 60_000), false); // 2nd
  assert.equal(rateLimit(key, 2, 60_000), true);  // 3rd → limited
});
