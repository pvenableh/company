#!/usr/bin/env node
/**
 * Real-auth refresh burst (production, highest fidelity).
 *
 * Exercises the GENUINE Directus refresh-token rotation: fires N concurrent
 * POST /api/auth/refresh with a real session cookie. With the cross-instance
 * dedup in place, every request should return 200 — the one elected rotator
 * rotates the single-use token and the losers ride the published result. Before
 * the fix, the losers 401'd (and the session died). So a spread of 401s here is
 * the failure signal.
 *
 * Use a THROWAWAY / demo account (e.g. demo@earnest.guru), NOT a real user — the
 * burst rotates that account's refresh token, invalidating its current cookie
 * (a re-login/refresh restores it). Grab a FRESH cookie right before running.
 *
 * How to get the cookie: sign in as the demo account in a browser, open
 * DevTools → Application → Cookies → copy the `nuxt-session` cookie value (or the
 * whole Cookie header). Pass the full `name=value` pair(s).
 *
 * Usage:
 *   EARNEST_COOKIE='nuxt-session=...' node scripts/prod-refresh-burst.mjs
 *   EARNEST_COOKIE='nuxt-session=...' BASE_URL=https://app.earnest.guru N=10 node scripts/prod-refresh-burst.mjs
 */
const BASE_URL = (process.env.BASE_URL || "https://app.earnest.guru").replace(/\/$/, "");
const COOKIE = process.env.EARNEST_COOKIE;
const N = Number(process.env.N || 10);

if (!COOKIE) {
  console.error("✗ EARNEST_COOKIE env is required (a demo/throwaway account session cookie).");
  process.exit(2);
}

const headers = { cookie: COOKIE, "content-type": "application/json" };

async function status(path, method = "GET") {
  const res = await fetch(`${BASE_URL}${path}`, { method, headers });
  return res.status;
}

// Pre-flight: confirm the cookie is a live session before we hammer it.
const pre = await status("/api/auth/me");
if (pre !== 200) {
  console.error(`✗ Pre-check /api/auth/me returned ${pre} — cookie is not a valid session. Grab a fresh one.`);
  process.exit(2);
}
console.log(`Pre-check OK. Firing ${N} concurrent POST /api/auth/refresh at ${BASE_URL}\n`);

const results = await Promise.allSettled(
  Array.from({ length: N }, () => status("/api/auth/refresh", "POST"))
);

const dist = {};
let errors = 0;
for (const r of results) {
  if (r.status === "fulfilled") dist[r.value] = (dist[r.value] || 0) + 1;
  else errors++;
}

console.log("status distribution:", JSON.stringify(dist), errors ? `network-errors=${errors}` : "");

const ok = dist[200] || 0;
const unauthorized = dist[401] || 0;

if (unauthorized > 0) {
  console.error(
    `\n✗ FAIL — ${unauthorized}/${N} refreshes returned 401. The concurrent burst lost the ` +
      `rotation race (dedup not collapsing across instances). Investigate.`
  );
  process.exit(1);
}
if (ok !== N || errors) {
  console.warn(`\n⚠ ${ok}/${N} returned 200 (rest: ${JSON.stringify(dist)}). No 401s, but not a clean sweep — re-run.`);
  process.exit(0);
}
console.log(`\n✓ PASS — all ${N} concurrent refreshes returned 200. No session lost to the rotation race.`);
