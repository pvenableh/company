/**
 * Public, unauth password check for a gated pitch page. On a correct password
 * we set a short-lived, HMAC-signed unlock cookie (scoped to this pitch's
 * token) so the raw endpoint will serve without re-prompting.
 *
 * Returns 404 for links that aren't live (so a revoked/expired link behaves
 * identically to a nonexistent one), 400 if the pitch isn't password-gated,
 * and 401 on a wrong password.
 */
import {
  PITCH_UNLOCK_COOKIE, signPitchUnlock, verifyPitchPassword,
} from '~~/server/utils/pitch-access';
import { fetchPitchByToken, pitchGateState } from '~~/server/utils/pitch-pages';

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') || '';
  const body = await readBody<{ password?: string }>(event).catch(() => ({}));
  const password = typeof body?.password === 'string' ? body.password : '';

  const row = await fetchPitchByToken(token);
  if (pitchGateState(row) !== 'ok' || !row) {
    throw createError({ statusCode: 404, message: 'Not found' });
  }
  if (!row.password_hash) {
    throw createError({ statusCode: 400, message: 'This link is not password protected.' });
  }
  if (!password || !verifyPitchPassword(password, row.password_hash)) {
    throw createError({ statusCode: 401, message: 'Incorrect password.' });
  }

  setCookie(event, PITCH_UNLOCK_COOKIE, signPitchUnlock(row.token), {
    httpOnly: true,
    secure: !import.meta.dev,
    sameSite: 'lax',
    path: `/`,
    maxAge: 12 * 60 * 60, // 12h, matches the signed token TTL
  });

  return { ok: true };
});
