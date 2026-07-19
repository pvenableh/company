#!/usr/bin/env npx tsx
/**
 * Directus `product_events` collection — a small, GENERIC product-usage sink.
 *
 * The app has no working client analytics (gtag is installed but has no
 * measurement id; no PostHog/Segment). This is a lightweight, first-party
 * events table in the spirit of `upsell_events`: one row per meaningful UI
 * interaction, written by the admin-token server route
 * (`POST /api/telemetry/event`) so the collection needs NO client perms.
 * Read back through Directus admin / a future reporting route.
 *
 * Generic on purpose (not home-specific): `event` is a namespaced slug
 * (e.g. `home.mode_flipped`) and `props` is a small JSON blob, so any surface
 * can log to it without a schema change. First consumer is the presence home
 * (see project_presence_home): adoption (presence↔classic flips), conversation
 * starts, Continue-chip offered/resumed, command-center reveals.
 *
 * Additive + idempotent. Dry-run by default; --apply to write.
 *   pnpm tsx scripts/setup-product-events-collection.ts           # dry-run
 *   pnpm tsx scripts/setup-product-events-collection.ts --apply   # write
 * Then run `pnpm generate:types` (or the hand-added ProductEvent type stands in).
 */
import 'dotenv/config';

const URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) { console.error('DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN required'); process.exit(1); }

const APPLY = process.argv.includes('--apply');

async function req(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) {
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
    console.log('Would create collection product_events with fields:');
    console.log('  event (string, required — namespaced slug e.g. home.mode_flipped),');
    console.log('  source (string — UI surface e.g. presence-home),');
    console.log('  user (m2o users), organization (m2o organizations),');
    console.log('  props (json — small payload), date_created (timestamp).');
    console.log('\nWritten by admin-token /api/telemetry/event; no client perms.');
    console.log('\nDRY RUN. Re-run with --apply to write.');
    return;
  }

  await collection('product_events', {
    icon: 'insights',
    note: 'Generic first-party product-usage events (e.g. presence home adoption). Admin-written; no client perms.',
    hidden: false, singleton: false, sort_field: null, archive_field: null,
  });

  await field('product_events', { field: 'event', type: 'string', meta: { interface: 'input', required: true, note: 'Namespaced event slug, e.g. home.mode_flipped' }, schema: {} });
  await field('product_events', { field: 'source', type: 'string', meta: { interface: 'input', note: 'UI surface, e.g. presence-home' }, schema: {} });
  await field('product_events', { field: 'user', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], note: 'Who triggered it (null for anon/system)' }, schema: {} });
  await field('product_events', { field: 'organization', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], note: 'Active organization' }, schema: {} });
  await field('product_events', { field: 'props', type: 'json', meta: { interface: 'input-code', options: { language: 'json' }, note: 'Small event payload, e.g. { from, to }' }, schema: {} });
  await field('product_events', { field: 'date_created', type: 'timestamp', meta: { interface: 'datetime', special: ['date-created'], readonly: true }, schema: {} });

  await relation({ collection: 'product_events', field: 'user', related_collection: 'directus_users', meta: { sort_field: null }, schema: { on_delete: 'SET NULL' } });
  await relation({ collection: 'product_events', field: 'organization', related_collection: 'organizations', meta: { sort_field: null }, schema: { on_delete: 'SET NULL' } });

  console.log('\n✅ product_events ready. Run `pnpm generate:types` (or keep the hand-added ProductEvent type).');
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
