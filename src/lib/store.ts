// src/lib/store.ts
import { flags, config } from './env.ts';

type Pending = { codeHash: string; ipHash: string; attempts: number; expiresAt: number };

// ── in-memory fallback (store disabled / local dev / tests) ──────────────────
let mem = { pending: new Map<string, Pending>(), reserved: new Map<string, string>(), cap: 1000, ipCap: 3 };
export function __resetMemoryStore(cap = 1000, ipCap = 3) {
  mem = { pending: new Map(), reserved: new Map(), cap, ipCap };
}

// ── Supabase REST helpers (only used when enabled) ───────────────────────────
function sb(path: string): string {
  return `${config().supabaseUrl}/rest/v1/${path}`;
}
function sbHeaders(): Record<string, string> {
  const key = config().supabaseKey ?? '';
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

export async function putPending(p: {
  email: string;
  codeHash: string;
  ipHash: string;
  expiresAt: number;
}): Promise<void> {
  if (!flags().storeEnabled) {
    mem.pending.set(p.email, { codeHash: p.codeHash, ipHash: p.ipHash, attempts: 0, expiresAt: p.expiresAt });
    return;
  }
  // upsert on email PK; parameterized body — no SQL string
  const res = await fetch(sb('pending_reservations'), {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      email: p.email,
      code_hash: p.codeHash,
      ip_hash: p.ipHash,
      attempts: 0,
      expires_at: new Date(p.expiresAt).toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`putPending ${res.status}`);
}

export async function getPending(email: string): Promise<Pending | null> {
  if (!flags().storeEnabled) return mem.pending.get(email) ?? null;
  const res = await fetch(
    sb(`pending_reservations?email=eq.${encodeURIComponent(email)}&select=code_hash,ip_hash,attempts,expires_at`),
    { headers: sbHeaders() },
  );
  if (!res.ok) throw new Error(`getPending ${res.status}`);
  const rows = (await res.json()) as any[];
  if (!rows.length) return null;
  const r = rows[0];
  return { codeHash: r.code_hash, ipHash: r.ip_hash, attempts: r.attempts, expiresAt: Date.parse(r.expires_at) };
}

export async function bumpAttempts(email: string): Promise<number> {
  if (!flags().storeEnabled) {
    const r = mem.pending.get(email);
    if (!r) return 0;
    r.attempts += 1;
    return r.attempts;
  }
  const res = await fetch(sb('rpc/bump_attempts'), {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify({ p_email: email }),
  });
  if (!res.ok) throw new Error(`bumpAttempts ${res.status}`);
  return (await res.json()) as number;
}

export async function deletePending(email: string): Promise<void> {
  if (!flags().storeEnabled) {
    mem.pending.delete(email);
    return;
  }
  const res = await fetch(sb(`pending_reservations?email=eq.${encodeURIComponent(email)}`), {
    method: 'DELETE',
    headers: sbHeaders(),
  });
  if (!res.ok) throw new Error(`deletePending ${res.status}`);
}

export async function reserveSpot(email: string, ipHash: string): Promise<'ok' | 'full' | 'ip_capped' | 'duplicate'> {
  if (!flags().storeEnabled) {
    if (mem.reserved.has(email)) {
      mem.pending.delete(email); // match SQL: clear pending on duplicate too (no replay / resend)
      return 'duplicate';
    }
    if (mem.reserved.size >= mem.cap) return 'full';
    let perIp = 0;
    for (const v of mem.reserved.values()) if (v === ipHash) perIp++;
    if (perIp >= mem.ipCap) return 'ip_capped';
    mem.reserved.set(email, ipHash);
    mem.pending.delete(email);
    return 'ok';
  }
  const res = await fetch(sb('rpc/reserve_spot'), {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify({ p_email: email, p_ip_hash: ipHash }),
  });
  if (!res.ok) throw new Error(`reserveSpot ${res.status}`);
  return (await res.json()) as 'ok' | 'full' | 'ip_capped' | 'duplicate';
}

export async function countReserved(): Promise<number> {
  if (!flags().storeEnabled) return mem.reserved.size;
  const res = await fetch(sb('reservations?select=count'), {
    headers: { ...sbHeaders(), Prefer: 'count=exact' },
  });
  const range = res.headers.get('content-range');
  return range ? parseInt(range.split('/')[1] ?? '0', 10) : 0;
}

export async function isReserved(email: string): Promise<boolean> {
  if (!flags().storeEnabled) return mem.reserved.has(email);
  const res = await fetch(sb(`reservations?email=eq.${encodeURIComponent(email)}&select=email`), {
    headers: sbHeaders(),
  });
  if (!res.ok) return false;
  return ((await res.json()) as any[]).length > 0;
}
