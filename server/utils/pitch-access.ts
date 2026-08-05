// server/utils/pitch-access.ts
/**
 * Access control for gated pitch pages.
 *
 * Two independent mechanisms:
 *  - Password: a `password_hash` stored on the pitch_pages row (scrypt, salted).
 *    Verified on POST /api/p/[token]/unlock; on success we issue a short-lived
 *    signed unlock cookie so the raw content endpoint can serve without
 *    re-prompting.
 *  - Unlock cookie: a stateless HMAC-signed token bound to the pitch's share
 *    `token` with an embedded expiry — same shape as server/utils/invite-token.ts.
 *    No DB column needed; a leaked/stale cookie can't be replayed after `exp`.
 *
 * Link-level expiry (`expires_at`) and revocation (`status`) are enforced
 * separately in the endpoints against the stored row.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const UNLOCK_TTL_MS = 12 * 60 * 60 * 1000; // 12h — long enough for a review session
export const PITCH_UNLOCK_COOKIE = 'pitch_unlock';

function secret(): string {
  // Mirror invite-token.ts: NUXT_SESSION_PASSWORD is always configured; fall
  // back to the Directus service token so we never sign with a weak constant.
  return process.env.NUXT_SESSION_PASSWORD || process.env.DIRECTUS_SERVER_TOKEN || '';
}

/** Hash a plaintext access password as `salt:scryptHash` (both hex). */
export function hashPitchPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/** Constant-time verify of a plaintext password against a stored `salt:hash`. */
export function verifyPitchPassword(password: string, stored: unknown): boolean {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** Sign an unlock token bound to a pitch share token: `<base64url(payload)>.<hmac>`. */
export function signPitchUnlock(pitchToken: string, ttlMs: number = UNLOCK_TTL_MS): string {
  const payload = Buffer.from(JSON.stringify({ t: pitchToken, exp: Date.now() + ttlMs })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** True only when the cookie is well-signed, unexpired, and bound to `pitchToken`. */
export function verifyPitchUnlock(cookie: unknown, pitchToken: string): boolean {
  if (typeof cookie !== 'string' || !cookie || !pitchToken) return false;
  const dot = cookie.lastIndexOf('.');
  if (dot <= 0) return false;
  const payload = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);

  const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data?.t !== pitchToken) return false;
    if (typeof data?.exp !== 'number' || Date.now() > data.exp) return false;
    return true;
  } catch {
    return false;
  }
}
