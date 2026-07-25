#!/usr/bin/env node
/**
 * Cross-instance refresh-dedup probe (production self-test).
 *
 * Fires N concurrent requests at /api/_diag/refresh-dedup with a shared run key.
 * Vercel spreads them across lambda instances; each runs the REAL coordination
 * lock against the live Redis with a synthetic counter (no auth touched). If the
 * lock works, exactly ONE response reports role `rotated` and every response
 * sees `count === 1`. A second `rotated` or any `count > 1` means two instances
 * rotated — the bug this fix exists to prevent.
 *
 * Requires DIAG_SECRET to be set in the deployment's env (Vercel) AND passed here.
 *
 * Usage:
 *   DIAG_SECRET=... node scripts/prod-dedup-probe.mjs
 *   DIAG_SECRET=... BASE_URL=https://app.earnest.guru N=16 ROUNDS=5 node scripts/prod-dedup-probe.mjs
 */
import { randomUUID } from "node:crypto";

const BASE_URL = (process.env.BASE_URL || "https://app.earnest.guru").replace(/\/$/, "");
const SECRET = process.env.DIAG_SECRET;
const N = Number(process.env.N || 16);
const ROUNDS = Number(process.env.ROUNDS || 5);

if (!SECRET) {
  console.error("✗ DIAG_SECRET env is required (must match the value set in the deployment).");
  process.exit(2);
}

async function onePass(round) {
  const key = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const url = `${BASE_URL}/api/_diag/refresh-dedup?key=${encodeURIComponent(key)}`;

  const settled = await Promise.allSettled(
    Array.from({ length: N }, () =>
      fetch(url, { headers: { "x-diag-secret": SECRET } }).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
        return r.json();
      })
    )
  );

  const ok = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
  const failed = settled.filter((s) => s.status === "rejected").map((s) => String(s.reason));

  const rotators = ok.filter((r) => r.role === "rotated").length;
  const maxCount = ok.reduce((m, r) => Math.max(m, Number(r.count) || 0), 0);
  const instances = new Set(ok.map((r) => r.instanceId));
  const roles = ok.reduce((acc, r) => ((acc[r.role] = (acc[r.role] || 0) + 1), acc), {});

  const pass = failed.length === 0 && rotators === 1 && maxCount === 1;
  console.log(
    `round ${round}: ${pass ? "PASS" : "FAIL"} — rotators=${rotators} maxCount=${maxCount} ` +
      `instances=${instances.size} roles=${JSON.stringify(roles)}` +
      (failed.length ? ` errors=${failed.length} (${failed[0]})` : "")
  );

  return { pass, instances: instances.size, failed: failed.length };
}

console.log(`Probing ${BASE_URL} — N=${N} concurrent × ${ROUNDS} rounds\n`);

let allPass = true;
let maxInstances = 0;
for (let i = 1; i <= ROUNDS; i++) {
  const r = await onePass(i);
  allPass = allPass && r.pass;
  maxInstances = Math.max(maxInstances, r.instances);
}

console.log("");
if (!allPass) {
  console.error("✗ FAIL — the distributed lock let more than one instance rotate. Investigate.");
  process.exit(1);
}
if (maxInstances < 2) {
  console.warn(
    "⚠ INCONCLUSIVE — every request hit a single instance across all rounds, so " +
      "cross-instance behavior wasn't exercised. Re-run with higher N/ROUNDS, or during traffic."
  );
  process.exit(0);
}
console.log(`✓ PASS — dedup held across up to ${maxInstances} instances in one burst. Lock is sound in prod.`);
