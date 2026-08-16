// src/lib/otp.ts
import { sha256Hex, constantTimeEqual } from './security.ts';

/** 6-digit numeric code from a CSPRNG; rejection-sampled to avoid modulo bias. */
export function generateCode(): string {
  const max = 1_000_000;
  const limit = Math.floor(0xffffffff / max) * max; // largest unbiased multiple
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0]!;
  } while (n >= limit);
  return (n % max).toString().padStart(6, '0');
}

export async function hashCode(code: string, salt: string): Promise<string> {
  return sha256Hex(`${code}::${salt}`);
}

export async function codeMatches(code: string, storedHash: string, salt: string): Promise<boolean> {
  const h = await hashCode(code, salt);
  return constantTimeEqual(h, storedHash);
}
