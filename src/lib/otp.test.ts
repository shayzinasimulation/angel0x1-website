// src/lib/otp.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCode, hashCode, codeMatches } from './otp.ts';

test('generateCode is 6 digits', () => {
  for (let i = 0; i < 200; i++) assert.match(generateCode(), /^[0-9]{6}$/);
});

test('generateCode is not trivially constant', () => {
  const set = new Set(Array.from({ length: 50 }, () => generateCode()));
  assert.ok(set.size > 1);
});

test('hashCode never returns the plaintext code', async () => {
  const h = await hashCode('123456', 'salt');
  assert.notEqual(h, '123456');
  assert.match(h, /^[0-9a-f]{64}$/);
});

test('codeMatches true only for the right code+salt', async () => {
  const h = await hashCode('123456', 'salt');
  assert.equal(await codeMatches('123456', h, 'salt'), true);
  assert.equal(await codeMatches('654321', h, 'salt'), false);
  assert.equal(await codeMatches('123456', h, 'other-salt'), false);
});
