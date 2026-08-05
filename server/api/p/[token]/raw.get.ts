/**
 * Public, unauth endpoint that serves a pitch's HTML byte-for-byte as
 * text/html. Loaded inside the isolating <iframe> on /p/[token].
 *
 * Serves ONLY when the link is live (published + unexpired + not revoked) AND
 * either the pitch has no password or the request carries a valid unlock
 * cookie. Every other case returns 404 — not 403 — so the endpoint never leaks
 * whether a token exists, is locked, is expired, or was revoked. Mirrors the
 * serve-raw model of server/api/email/web-view/[id].get.ts.
 */
import { updateItem } from '@directus/sdk';
import { PITCH_UNLOCK_COOKIE, verifyPitchUnlock } from '~~/server/utils/pitch-access';
import { fetchPitchByToken, pitchGateState } from '~~/server/utils/pitch-pages';

const NOT_FOUND = () => createError({ statusCode: 404, message: 'Not found' });

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') || '';
  const row = await fetchPitchByToken(token);

  // Uniform 404 for every non-servable case — no record-existence leak.
  if (pitchGateState(row) !== 'ok' || !row?.html) throw NOT_FOUND();

  if (row.password_hash && !verifyPitchUnlock(getCookie(event, PITCH_UNLOCK_COOKIE), row.token)) {
    throw NOT_FOUND();
  }

  // Best-effort view tracking; never let a metrics write block the render.
  try {
    const directus = getServerDirectus();
    await directus.request(
      updateItem('pitch_pages', row.id, {
        view_count: (row.view_count ?? 0) + 1,
        last_viewed_at: new Date().toISOString(),
      } as any),
    );
  } catch { /* ignore */ }

  setHeader(event, 'Content-Type', 'text/html; charset=utf-8');
  // Private: this is gated content — never let a shared proxy/CDN cache it.
  setHeader(event, 'Cache-Control', 'private, no-store');
  // Defense in depth: the page is only ever framed by our own /p/[token].
  setHeader(event, 'X-Frame-Options', 'SAMEORIGIN');
  setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
  return row.html;
});
