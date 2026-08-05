#!/usr/bin/env npx tsx
/**
 * Org file-storage accounting fields — Setup Script
 *
 * Adds two counters to the `organizations` collection so we can enforce a
 * per-org storage quota and show a usage meter:
 *   - storage_used_bytes  : cached running total of stored file bytes for the
 *                           org (fast path for enforcement; self-healed by
 *                           recomputeOrgStorage which sums the org folder tree).
 *   - storage_extra_bytes : extra allotment purchased via the extra_storage_100
 *                           add-on, added on top of the plan's storageBytes.
 *
 * The effective limit = EARNEST_PLANS[plan].storageBytes + storage_extra_bytes
 * (enterprise / null plan = unlimited). See server/utils/storage-enforcement.ts.
 *
 *   pnpm tsx scripts/setup-org-storage-fields.ts
 *
 * Idempotent. Additive only.
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!DIRECTUS_TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

async function directusRequest(path: string, method = 'GET', body?: unknown) {
  const r = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) {
    if (r.status === 409) return { error: 'already_exists' };
    if (r.status === 400 && /already exists|already has an associated/i.test(text)) return { error: 'already_exists' };
    return { error: `${r.status}: ${text}` };
  }
  return { error: null };
}

async function createField(collection: string, field: Record<string, any>) {
  console.log(`  Field: ${collection}.${field.field}`);
  const { error } = await directusRequest(`/fields/${collection}`, 'POST', field);
  if (error === 'already_exists') return console.log('    -> exists, skip');
  if (error) return console.error('    -> Error:', error);
  console.log('    -> created');
}

async function main() {
  console.log('=== organizations: storage accounting fields ===');
  console.log(`Directus URL: ${DIRECTUS_URL}`);

  await createField('organizations', {
    field: 'storage_used_bytes', type: 'bigInteger',
    meta: { interface: 'input', readonly: true, note: 'Cached total stored file bytes (self-healed by recompute).', width: 'half' },
    schema: { default_value: 0 },
  });
  await createField('organizations', {
    field: 'storage_extra_bytes', type: 'bigInteger',
    meta: { interface: 'input', note: 'Extra storage purchased via add-on, added to the plan allotment.', width: 'half' },
    schema: { default_value: 0 },
  });

  console.log('Done.');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
