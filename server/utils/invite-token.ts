// server/utils/invite-token.ts
/**
 * Stateless, signed, EXPIRING tokens for org/portal invite links.
 *
 * The invite link used to carry only the `org_memberships` (or
 * `client_portal_users`) row id — an unguessable UUID, but with NO signature
 * and NO expiry, so a leaked link (forwarded email, browser history, proxy
 * logs) worked forever and a guessed/enumerated id could be replayed. This
 * binds the membership id into an HMAC-signed token with an embedded expiry so
 * invite-details + accept-invite can reject forged or stale links — without a
 * schema change (no per-row token column to store/rotate).
 *
 * Note: post-acceptance replay is already blocked separately — accept-invite
 * only sets a new user's password while the row is still `invited`/`pending`,
 * and flips it to `active` on accept, so a re-used link can't reset an active
 * account's password. This adds forgery + expiry protection on top.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function secret(): string {
  // NUXT_SESSION_PASSWORD is always configured (nuxt-auth-utils requires it);
  // fall back to the Directus service token so the util never signs with a
  // weak constant. Never expose either value — only the HMAC leaves this file.
  return process.env.NUXT_SESSION_PASSWORD || process.env.DIRECTUS_SERVER_TOKEN || '';
}

/** Sign a membership id into an expiring token: `<base64url(payload)>.<hmac>`. */
export function signInviteToken(membershipId: string, ttlMs: number = DEFAULT_TTL_MS): string {
  const payload = Buffer.from(JSON.stringify({ m: membershipId, exp: Date.now() + ttlMs })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/**
 * Verify a token belongs to `membershipId`, is well-signed, and hasn't expired.
 * Returns true only when all three hold. Constant-time signature comparison.
 */
export function verifyInviteToken(token: unknown, membershipId: string): boolean {
  if (typeof token !== 'string' || !token || !membershipId) return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data?.m !== membershipId) return false;
    if (typeof data?.exp !== 'number' || Date.now() > data.exp) return false;
    return true;
  } catch {
    return false;
  }
}
