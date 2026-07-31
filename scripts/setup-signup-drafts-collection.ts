#!/usr/bin/env npx tsx
/**
 * Directus `signup_drafts` collection — the resumable state of an in-progress
 * public signup, BEFORE any user/org exists.
 *
 * Phase 3 of the onboarding reimagining moves account creation to the END of
 * the flow (password-at-end). Step 1 (email + name) creates a draft row keyed by
 * an unguessable `token`; the wizard persists its answers into `state` as the
 * user goes; the final "Set your password" step calls /api/signup/complete which
 * mints the real user + org + trial in one transaction, then marks the draft
 * `completed` and links the org. Abandoned drafts (status `active`, stale
 * `last_activity`) are the source for resume-link reminder emails (Phase 4).
 *
 * Written ONLY by admin-token server routes (/api/signup/*), so the collection
 * needs NO client/public permissions — it holds a pre-account email + business
 * answers and must never be world-readable.
 *
 * Additive + idempotent. Dry-run by default; --apply to write.
 *   pnpm tsx scripts/setup-signup-drafts-collection.ts           # dry-run
 *   pnpm tsx scripts/setup-signup-drafts-collection.ts --apply   # write
 * Then run `pnpm generate:types`.
 */
import 'dotenv/config';

const URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) { console.error('DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN required'); process.exit(1); }

const APPLY = process.argv.includes('--apply');

async function req(path: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', body?: unknown) {
  const r = await fetch(`${URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) {
    if (r.status === 409) return { error: 'already_exists' };
    if (text.includes('already exists')) return { error: 'already_exists' };
    return { error: `${r.status}: ${text}` };
  }
  return { error: null };
}

async function collection(name: string, meta: Record<string, any>) {
  const { error } = await req('/collections', 'POST', { collection: name, meta, schema: {} });
  console.log(`  collection ${name}: ${error === 'already_exists' ? 'exists' : error ? `ERROR ${error}` : 'created'}`);
}
async function field(coll: string, f: Record<string, any>) {
  const { error } = await req(`/fields/${coll}`, 'POST', f);
  console.log(`  field ${coll}.${f.field}: ${error === 'already_exists' ? 'exists' : error ? `ERROR ${error}` : 'created'}`);
}
async function relation(rel: Record<string, any>) {
  const { error } = await req('/relations', 'POST', rel);
  console.log(`  relation ${rel.collection}.${rel.field}→${rel.related_collection}: ${error === 'already_exists' ? 'exists' : error ? `ERROR ${error}` : 'created'}`);
}

async function main() {
  console.log(`\n${APPLY ? '🔧 APPLY' : '🔍 DRY-RUN'} — Directus: ${URL}\n`);
  if (!APPLY) {
    console.log('Would create collection signup_drafts with fields:');
    console.log('  token (string, required, unique — unguessable client key),');
    console.log('  email (string), first_name (string), last_name (string),');
    console.log('  state (json — serialized wizard answers),');
    console.log('  status (string, default "active" — active|completed|abandoned),');
    console.log('  organization (m2o organizations — set on completion),');
    console.log('  last_activity (timestamp), completed_at (timestamp),');
    console.log('  date_created / date_updated (timestamps).');
    console.log('\nWritten by admin-token /api/signup/*; NO client perms.');
    console.log('\nDRY RUN. Re-run with --apply to write.');
    return;
  }

  await collection('signup_drafts', {
    icon: 'draft',
    note: 'Resumable in-progress public signups (pre-account). Admin-written by /api/signup/*; no client perms.',
    hidden: false, singleton: false, sort_field: null, archive_field: 'status', archive_value: 'abandoned', unarchive_value: 'active',
  });

  await field('signup_drafts', { field: 'token', type: 'string', meta: { interface: 'input', required: true, note: 'Unguessable client key for this draft', readonly: true }, schema: { is_unique: true } });
  await field('signup_drafts', { field: 'email', type: 'string', meta: { interface: 'input', note: 'Email captured at step 1' }, schema: {} });
  await field('signup_drafts', { field: 'first_name', type: 'string', meta: { interface: 'input' }, schema: {} });
  await field('signup_drafts', { field: 'last_name', type: 'string', meta: { interface: 'input' }, schema: {} });
  await field('signup_drafts', { field: 'state', type: 'json', meta: { interface: 'input-code', options: { language: 'json' }, note: 'Serialized wizard answers' }, schema: {} });
  await field('signup_drafts', { field: 'status', type: 'string', meta: { interface: 'select-dropdown', options: { choices: [{ text: 'Active', value: 'active' }, { text: 'Completed', value: 'completed' }, { text: 'Abandoned', value: 'abandoned' }] }, note: 'Lifecycle' }, schema: { default_value: 'active' } });
  await field('signup_drafts', { field: 'organization', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], note: 'Org minted on completion (null until then)' }, schema: {} });
  await field('signup_drafts', { field: 'last_activity', type: 'timestamp', meta: { interface: 'datetime', note: 'Last time the draft was touched — drives abandonment reminders' }, schema: {} });
  await field('signup_drafts', { field: 'completed_at', type: 'timestamp', meta: { interface: 'datetime', readonly: true }, schema: {} });
  await field('signup_drafts', { field: 'date_created', type: 'timestamp', meta: { interface: 'datetime', special: ['date-created'], readonly: true }, schema: {} });
  await field('signup_drafts', { field: 'date_updated', type: 'timestamp', meta: { interface: 'datetime', special: ['date-updated'], readonly: true }, schema: {} });

  await relation({ collection: 'signup_drafts', field: 'organization', related_collection: 'organizations', meta: { sort_field: null }, schema: { on_delete: 'SET NULL' } });

  console.log('\n✅ signup_drafts ready. Run `pnpm generate:types`.');
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
