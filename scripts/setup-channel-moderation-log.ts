#!/usr/bin/env npx tsx
/**
 * Directus `channel_moderation_log` collection — Phase F moderation audit trail.
 * (See project_channels_apps_home → Phase F.)
 *
 * One row per moderation event in a channel: a manager hiding/removing a message,
 * or a member reporting one. Written by admin-token server routes
 * (`/api/messages/[id]/moderate`, `/api/channels/[channel]/report`); NO client
 * perms — read back through a manager-gated server route. Snapshots the message
 * author + a text snippet so the record survives a hard `remove`.
 *
 * Additive + idempotent. Dry-run by default; --apply to write.
 *   pnpm tsx scripts/setup-channel-moderation-log.ts           # dry-run
 *   pnpm tsx scripts/setup-channel-moderation-log.ts --apply   # write
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
    console.log('Would create collection channel_moderation_log with fields:');
    console.log('  channel (m2o channels), organization (m2o organizations), moderator (m2o users),');
    console.log('  action (hide|remove|report), reason (text), message_id (uuid string),');
    console.log('  message_author (m2o users), message_snippet (text), date_created (timestamp).');
    console.log('\nDRY RUN. Re-run with --apply to write.');
    return;
  }

  await collection('channel_moderation_log', {
    icon: 'gavel',
    note: 'Phase F moderation audit trail — hide/remove/report events per channel',
    hidden: false, singleton: false, sort_field: null, archive_field: null,
  });

  await field('channel_moderation_log', { field: 'channel', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true }, schema: {} });
  await field('channel_moderation_log', { field: 'organization', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true }, schema: {} });
  await field('channel_moderation_log', { field: 'moderator', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], note: 'Who took the action (null for anon/system)' }, schema: {} });
  await field('channel_moderation_log', {
    field: 'action', type: 'string',
    meta: { interface: 'select-dropdown', required: true, options: { choices: [
      { text: 'Hide', value: 'hide' }, { text: 'Remove', value: 'remove' }, { text: 'Report', value: 'report' },
    ] } },
    schema: {},
  });
  await field('channel_moderation_log', { field: 'reason', type: 'text', meta: { interface: 'input-multiline', note: 'Report reason / moderator note' }, schema: {} });
  await field('channel_moderation_log', { field: 'message_id', type: 'uuid', meta: { interface: 'input', note: 'Target message id (plain — the row may be hard-deleted)' }, schema: {} });
  await field('channel_moderation_log', { field: 'message_author', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], note: 'Snapshot: who wrote the moderated message' }, schema: {} });
  await field('channel_moderation_log', { field: 'message_snippet', type: 'text', meta: { interface: 'input-multiline', note: 'Snapshot: stripped text of the moderated message' }, schema: {} });
  await field('channel_moderation_log', { field: 'date_created', type: 'timestamp', meta: { interface: 'datetime', special: ['date-created'], readonly: true }, schema: {} });

  await relation({ collection: 'channel_moderation_log', field: 'channel', related_collection: 'channels', meta: { sort_field: null }, schema: { on_delete: 'CASCADE' } });
  await relation({ collection: 'channel_moderation_log', field: 'organization', related_collection: 'organizations', meta: { sort_field: null }, schema: { on_delete: 'CASCADE' } });
  await relation({ collection: 'channel_moderation_log', field: 'moderator', related_collection: 'directus_users', meta: { sort_field: null }, schema: { on_delete: 'SET NULL' } });
  await relation({ collection: 'channel_moderation_log', field: 'message_author', related_collection: 'directus_users', meta: { sort_field: null }, schema: { on_delete: 'SET NULL' } });

  console.log('\n✅ channel_moderation_log ready. Run `pnpm generate:types`.');
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
