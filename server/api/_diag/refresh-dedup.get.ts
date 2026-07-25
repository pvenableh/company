// server/api/_diag/refresh-dedup.get.ts
/**
 * Production self-test for the cross-instance refresh dedup.
 *
 * Runs the REAL `coordinatedRotate` machinery (the same distributed lock that
 * guards token refresh) against the live Redis under an isolated `authprobe:`
 * namespace — no Directus call, no sessions, no real tokens touched. Fire this
 * concurrently from an external client (scripts/prod-dedup-probe.mjs): Vercel
 * spreads the requests across lambda instances and, if the lock works, exactly
 * ONE response reports role `rotated` and every response sees `count === 1`.
 *
 * SECURITY: inert by default. Returns 404 unless `DIAG_SECRET` is set in the
 * environment, and 403 unless the caller presents it (header `x-diag-secret`
 * or `?secret=`). Only writes ephemeral `authprobe:*` keys (30s TTL). Remove
 * the env var to fully disable.
 */
export default defineEventHandler(async (event) => {
  const secret = process.env.DIAG_SECRET;
  // No secret configured → this diagnostic does not exist.
  if (!secret) {
    throw createError({ statusCode: 404, statusMessage: "Not Found" });
  }

  const query = getQuery(event);
  const provided = getHeader(event, "x-diag-secret") || (query.secret as string);
  if (provided !== secret) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }

  const key = String(query.key || "");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) {
    throw createError({
      statusCode: 400,
      statusMessage: "key required (1–64 url-safe chars)",
    });
  }

  const result = await runDedupProbe(key);
  return { ok: true, ...result };
});
