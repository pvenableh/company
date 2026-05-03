/**
 * Compute an ISO timestamp for when an OAuth token expires.
 *
 * Many providers (notably Meta/Facebook) omit `expires_in` from token responses
 * when the issued token doesn't expire. Passing undefined/NaN through date math
 * produces an Invalid Date which throws on .toISOString().
 *
 * This helper guards against missing/invalid values by falling back to a sane
 * default (60 days, which matches Meta's long-lived token lifetime).
 */
export function computeTokenExpiry(
  expiresInSec: number | undefined | null,
  fallbackDays = 60,
): string {
  const sec =
    typeof expiresInSec === 'number' && Number.isFinite(expiresInSec) && expiresInSec > 0
      ? expiresInSec
      : fallbackDays * 86400
  return new Date(Date.now() + sec * 1000).toISOString()
}
