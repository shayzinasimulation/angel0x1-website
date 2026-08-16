// src/lib/store.test.ts
// Runs in in-memory mode: WAITLIST_STORE is unset → storeEnabled=false.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  putPending, getPending, bumpAttempts, deletePending, reserveSpot, countReserved, isReserved, __resetMemoryStore,
} from './store.ts';

test('pending lifecycle in-memory', async () => {
  __resetMemoryStore();
  await putPending({ email: 'a@b.co', codeHash: 'h', ipHash: 'ip1', expiresAt: Date.now() + 10000 });
  const p = await getPending('a@b.co');
  assert.equal(p?.codeHash, 'h');
  assert.equal(p?.attempts, 0);
  assert.equal(await bumpAttempts('a@b.co'), 1);
  assert.equal(await bumpAttempts('a@b.co'), 2);
  await deletePending('a@b.co');
  assert.equal(await getPending('a@b.co'), null);
});

test('reserveSpot enforces caps and uniqueness in-memory', async () => {
  __resetMemoryStore(1000, 3); // cap=1000, ipCap=3
  assert.equal(await reserveSpot('a@b.co', 'ipX'), 'ok');
  assert.equal(await isReserved('a@b.co'), true);
  assert.equal(await reserveSpot('a@b.co', 'ipX'), 'duplicate');
  assert.equal(await reserveSpot('b@b.co', 'ipX'), 'ok');
  assert.equal(await reserveSpot('c@b.co', 'ipX'), 'ok');
  assert.equal(await reserveSpot('d@b.co', 'ipX'), 'ip_capped'); // 4th from ipX
  assert.equal(await countReserved(), 3);
});

test('reserveSpot returns full at cap', async () => {
  __resetMemoryStore(2, 100);
  assert.equal(await reserveSpot('a@b.co', 'i1'), 'ok');
  assert.equal(await reserveSpot('b@b.co', 'i2'), 'ok');
  assert.equal(await reserveSpot('c@b.co', 'i3'), 'full');
});
