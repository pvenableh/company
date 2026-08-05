/**
 * Public, unauth metadata for a pitch page. Drives the /p/[token] "envelope"
 * (lock screen + unavailable states) WITHOUT ever returning the pitch HTML.
 *
 * Returns 200 for every gate state (the envelope renders the right UI from
 * `state`) rather than throwing, so a revoked/expired link still gets a
 * branded message instead of a raw error. Never reveals whether a password is
 * correct — only whether one is required and whether this browser is unlocked.
 */
import { PITCH_UNLOCK_COOKIE, verifyPitchUnlock } from '~~/server/utils/pitch-access';
import { fetchPitchByToken, pitchGateState } from '~~/server/utils/pitch-pages';

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') || '';
  const row = await fetchPitchByToken(token);
  const state = pitchGateState(row);

  if (!row || state !== 'ok') {
    return { state, title: null, client_name: null, requires_password: false, unlocked: false };
  }

  const requiresPassword = !!row.password_hash;
  const unlocked = !requiresPassword
    || verifyPitchUnlock(getCookie(event, PITCH_UNLOCK_COOKIE), row.token);

  return {
    state: 'ok' as const,
    title: row.title,
    client_name: row.client_name,
    requires_password: requiresPassword,
    unlocked,
  };
});
