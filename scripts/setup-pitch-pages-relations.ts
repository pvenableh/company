#!/usr/bin/env npx tsx
/**
 * Directus pitch_pages — Relational links (lead / client / contact)
 *
 * Phase 1 of the "Pursuits" merge: a pitch page used to relate to a prospect
 * only through the free-text `client_name` string. This adds three OPTIONAL
 * m2o links so a pitch can be attached to a real record — mirroring the shape
 * `proposals` already has (proposals carry optional client + lead + contact):
 *
 *   pitch_pages.lead    -> leads        (SET NULL)   the pursuit/opportunity
 *   pitch_pages.client  -> clients      (SET NULL)   an existing client
 *   pitch_pages.contact -> contacts     (SET NULL)   the person
 *
 * All three are nullable — a quick one-off pitch can still be created with just
 * a typed `client_name`. `on_delete: SET NULL` so removing a lead/client/contact
 * never destroys the pitch artifact (unlike the organization FK, which cascades).
 *
 *   pnpm tsx scripts/setup-pitch-pages-relations.ts
 *
 * Idempotent. Additive only (creates fields + relations, updates perms).
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

async function setupRelations() {
  console.log('\n=== pitch_pages: lead / client / contact links ===');

  // lead -> leads (the pursuit/opportunity this pitch supports)
  // NB: leads.id is an INTEGER auto-increment PK (clients.id / contacts.id are
  // uuid), so this m2o field must be `integer` to satisfy the FK constraint.
  await createField('pitch_pages', {
    field: 'lead', type: 'integer',
    meta: {
      interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half',
      options: { template: '{{related_contact.first_name}} {{related_contact.last_name}}' },
      note: 'The pursuit/lead this pitch is for (optional).',
    },
    schema: { is_nullable: true },
  });
  await createRelation({
    collection: 'pitch_pages', field: 'lead', related_collection: 'leads',
    schema: { on_delete: 'SET NULL' }, meta: { sort_field: null },
  });

  // client -> clients (an existing client this pitch is for)
  await createField('pitch_pages', {
    field: 'client', type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half',
      options: { template: '{{name}}' },
      note: 'An existing client this pitch is for (optional).',
    },
    schema: { is_nullable: true },
  });
  await createRelation({
    collection: 'pitch_pages', field: 'client', related_collection: 'clients',
    schema: { on_delete: 'SET NULL' }, meta: { sort_field: null },
  });

  // contact -> contacts (the person this pitch is aimed at)
  await createField('pitch_pages', {
    field: 'contact', type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half',
      options: { template: '{{first_name}} {{last_name}}' },
      note: 'The person this pitch is aimed at (optional).',
    },
    schema: { is_nullable: true },
  });
  await createRelation({
    collection: 'pitch_pages', field: 'contact', related_collection: 'contacts',
    schema: { on_delete: 'SET NULL' }, meta: { sort_field: null },
  });
}

async function setupPerms() {
  console.log('\n=== Permissions: Client Manager / pitch_pages (re-assert org scope) ===');
  // Re-assert full-field org-scoped perms so the three new fields are writable.
  await upsertPerm('pitch_pages', 'read', ORG_SCOPE);
  await upsertPerm('pitch_pages', 'update', ORG_SCOPE);
  await upsertPerm('pitch_pages', 'create', ORG_SCOPE, ORG_SCOPE);
}

async function main() {
  console.log('==========================================');
  console.log('  pitch_pages — Relational links');
  console.log('==========================================');
  console.log(`Directus URL: ${DIRECTUS_URL}`);
  await setupRelations();
  await setupPerms();
  console.log('\n==========================================');
  console.log('  Done');
  console.log('==========================================');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
