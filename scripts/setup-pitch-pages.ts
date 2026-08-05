#!/usr/bin/env npx tsx
/**
 * Directus pitch_pages Collection — Setup Script
 *
 * Stores bespoke, self-contained HTML "pitch" pages (a full standalone document
 * with its own design system) that are served byte-for-byte to a prospective
 * client behind a shareable link. Each row carries an unguessable `token` (the
 * share capability), an optional `password_hash` and `expires_at` for gating,
 * and a `status` (draft / published / revoked). The public serve endpoint reads
 * this with the admin server token, so NO anon/public read permission is granted
 * here — the collection stays unlistable and the token is the only capability.
 *
 *   pnpm tsx scripts/setup-pitch-pages.ts
 *
 * Idempotent. Additive only (creates collection/fields/relation/permissions).
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!DIRECTUS_TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

const POLICY_CLIENT_MANAGER = '012beff9-150c-49e9-a284-1a7e2757e0dd';
const ORG_SCOPE = { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } };

async function directusRequest<T = unknown>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const r = await fetch(`${DIRECTUS_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    if (!r.ok) {
      if (r.status === 409) return { data: null, error: 'already_exists' };
      if (r.status === 400 && /already exists|already has an associated/i.test(text)) return { data: null, error: 'already_exists' };
      return { data: null, error: `${r.status}: ${text}` };
    }
    return { data: text ? (JSON.parse(text).data ?? null) : null, error: null };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
}

async function createCollection(collection: string, meta: Record<string, any>) {
  console.log(`  Creating collection: ${collection}`);
  const { error } = await directusRequest('/collections', 'POST', { collection, meta, schema: {} });
  if (error === 'already_exists') return console.log(`    -> Already exists, skipping`), true;
  if (error) return console.error(`    -> Error: ${error}`), false;
  console.log(`    -> Created`);
  return true;
}

async function createField(collection: string, field: Record<string, any>) {
  console.log(`  Creating field: ${collection}.${field.field}`);
  const { error } = await directusRequest(`/fields/${collection}`, 'POST', field);
  if (error === 'already_exists' || error?.includes('already exists')) return console.log(`    -> Already exists, skipping`), true;
  if (error) return console.error(`    -> Error: ${error}`), false;
  console.log(`    -> Created`);
  return true;
}

async function createRelation(data: Record<string, any>) {
  console.log(`  Creating relation: ${data.collection}.${data.field} -> ${data.related_collection}`);
  const { error } = await directusRequest('/relations', 'POST', data);
  if (error === 'already_exists') return console.log(`    -> Already exists, skipping`), true;
  if (error) return console.error(`    -> Error: ${error}`), false;
  console.log(`    -> Created`);
  return true;
}

async function upsertPerm(collection: string, action: string, permissions: any, validation: any = null) {
  console.log(`  Perm: Client Manager.${collection}.${action}`);
  const filter = encodeURIComponent(JSON.stringify({
    _and: [
      { policy: { _eq: POLICY_CLIENT_MANAGER } },
      { collection: { _eq: collection } },
      { action: { _eq: action } },
    ],
  }));
  const existing = await directusRequest<any[]>(`/permissions?filter=${filter}&fields=id&limit=1`);
  if (existing.data && existing.data.length > 0) {
    const id = existing.data[0].id;
    const { error } = await directusRequest(`/permissions/${id}`, 'PATCH', { permissions, validation, fields: ['*'] });
    if (error) return console.error(`    -> PATCH error: ${error}`), false;
    console.log(`    -> Updated #${id}`);
    return true;
  }
  const { error } = await directusRequest('/permissions', 'POST', {
    policy: POLICY_CLIENT_MANAGER, collection, action, permissions, validation, fields: ['*'],
  });
  if (error) return console.error(`    -> POST error: ${error}`), false;
  console.log(`    -> Created`);
  return true;
}

async function setupPitchPages() {
  console.log('\n=== pitch_pages ===');

  await createCollection('pitch_pages', {
    icon: 'auto_awesome',
    note: 'Bespoke standalone HTML pitch pages served behind a gated share link.',
    color: '#D4AC63',
    hidden: false,
    singleton: false,
    accountability: 'all',
    sort_field: 'sort',
    display_template: '{{title}}',
    archive_field: 'status',
    archive_value: 'revoked',
    unarchive_value: 'draft',
  });

  // System
  await createField('pitch_pages', {
    field: 'id', type: 'uuid',
    meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
    schema: { is_primary_key: true, has_auto_increment: false },
  });
  await createField('pitch_pages', {
    field: 'status', type: 'string',
    meta: {
      interface: 'select-dropdown', width: 'half',
      options: { choices: [
        { text: 'Draft', value: 'draft' },
        { text: 'Published', value: 'published' },
        { text: 'Revoked', value: 'revoked' },
      ] },
    },
    schema: { default_value: 'draft' },
  });
  await createField('pitch_pages', { field: 'sort', type: 'integer', meta: { interface: 'input', hidden: true }, schema: {} });
  await createField('pitch_pages', {
    field: 'date_created', type: 'timestamp',
    meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: {},
  });
  await createField('pitch_pages', {
    field: 'date_updated', type: 'timestamp',
    meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: {},
  });
  await createField('pitch_pages', {
    field: 'user_created', type: 'uuid',
    meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' }, schema: {},
  });
  await createField('pitch_pages', {
    field: 'user_updated', type: 'uuid',
    meta: { special: ['user-updated'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' }, schema: {},
  });

  // Domain
  await createField('pitch_pages', {
    field: 'title', type: 'string',
    meta: { interface: 'input', required: true, note: 'Internal name, e.g. "Myles Restaurant Group — Private Events"' },
    schema: { is_nullable: false },
  });
  await createField('pitch_pages', {
    field: 'client_name', type: 'string',
    meta: { interface: 'input', width: 'half', note: 'Prospective client this pitch is for' }, schema: {},
  });
  await createField('pitch_pages', {
    field: 'slug', type: 'string',
    meta: { interface: 'input', width: 'half', note: 'Human-friendly slug (optional; token is the real capability)' },
    schema: {},
  });
  await createField('pitch_pages', {
    field: 'token', type: 'string',
    meta: { interface: 'input', readonly: true, note: 'Unguessable share capability — used in the public /p/<token> URL' },
    schema: { is_unique: true },
  });
  await createField('pitch_pages', {
    field: 'html', type: 'text',
    meta: {
      interface: 'input-code', options: { language: 'htmlmixed', lineNumber: true },
      note: 'The full standalone HTML document, served byte-for-byte to the client.',
    },
    schema: {},
  });
  await createField('pitch_pages', {
    field: 'password_hash', type: 'string',
    meta: { interface: 'input', readonly: true, hidden: true, note: 'scrypt hash of the optional access password' },
    schema: {},
  });
  await createField('pitch_pages', {
    field: 'expires_at', type: 'timestamp',
    meta: { interface: 'datetime', width: 'half', note: 'After this the link stops working (null = never expires)' },
    schema: {},
  });
  await createField('pitch_pages', {
    field: 'view_count', type: 'integer',
    meta: { interface: 'input', readonly: true, width: 'half' },
    schema: { default_value: 0 },
  });
  await createField('pitch_pages', {
    field: 'last_viewed_at', type: 'timestamp',
    meta: { interface: 'datetime', readonly: true, width: 'half' }, schema: {},
  });

  // FK -> organizations (org-scoped)
  await createField('pitch_pages', {
    field: 'organization', type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o', special: ['m2o'], required: true, hidden: true,
      options: { template: '{{name}}' },
    },
    schema: { is_nullable: false },
  });
  await createRelation({
    collection: 'pitch_pages', field: 'organization', related_collection: 'organizations',
    schema: { on_delete: 'CASCADE' }, meta: { sort_field: null },
  });
}

async function setupPerms() {
  console.log('\n=== Permissions: Client Manager / pitch_pages ===');
  // Org members author their own org's pitches. The PUBLIC serve endpoint uses
  // the admin server token, so no anon/public read permission is granted here.
  await upsertPerm('pitch_pages', 'read', ORG_SCOPE);
  await upsertPerm('pitch_pages', 'update', ORG_SCOPE);
  await upsertPerm('pitch_pages', 'delete', ORG_SCOPE);
  await upsertPerm('pitch_pages', 'create', ORG_SCOPE, ORG_SCOPE);
}

async function main() {
  console.log('==========================================');
  console.log('  pitch_pages — Setup');
  console.log('==========================================');
  console.log(`Directus URL: ${DIRECTUS_URL}`);
  await setupPitchPages();
  await setupPerms();
  console.log('\n==========================================');
  console.log('  Done');
  console.log('==========================================');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
