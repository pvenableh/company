#!/usr/bin/env npx tsx
/**
 * Directus contracts Collection — Setup Script
 *
 * Mirrors the proposals shape (title, dates, total, blocks, contact, lead,
 * organization) plus signing fields (signed_at, signed_by_*, signature_data,
 * signing_token). Connected back to the source proposal via `proposal` FK.
 *
 *   pnpm tsx scripts/setup-contracts.ts
 *
 * Idempotent.
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

async function setupContracts() {
  console.log('\n=== contracts ===');

  await createCollection('contracts', {
    icon: 'gavel',
    note: 'Client-signable contracts. Mirrors proposals + adds signature fields.',
    color: '#0EA5E9',
    hidden: false,
    singleton: false,
    accountability: 'all',
    sort_field: 'sort',
    display_template: '{{title}}',
    archive_field: 'status',
    archive_value: 'archived',
    unarchive_value: 'draft',
  });

  // System
  await createField('contracts', {
    field: 'id', type: 'uuid',
    meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
    schema: { is_primary_key: true, has_auto_increment: false },
  });
  await createField('contracts', {
    field: 'status', type: 'string',
    meta: {
      interface: 'select-dropdown',
      options: { choices: [
        { text: 'Published', value: 'published' },
        { text: 'Draft', value: 'draft' },
        { text: 'Archived', value: 'archived' },
      ] },
    },
    schema: { default_value: 'published' },
  });
  await createField('contracts', { field: 'sort', type: 'integer', meta: { interface: 'input', hidden: true }, schema: {} });
  await createField('contracts', {
    field: 'date_created', type: 'timestamp',
    meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: {},
  });
  await createField('contracts', {
    field: 'date_updated', type: 'timestamp',
    meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: {},
  });
  await createField('contracts', {
    field: 'user_created', type: 'uuid',
    meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' }, schema: {},
  });
  await createField('contracts', {
    field: 'user_updated', type: 'uuid',
    meta: { special: ['user-updated'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' }, schema: {},
  });

  // Domain
  await createField('contracts', {
    field: 'title', type: 'string',
    meta: { interface: 'input', required: true, note: 'e.g. "Master Services Agreement — Atlas Fintech"' },
    schema: { is_nullable: false },
  });
  await createField('contracts', {
    field: 'contract_status', type: 'string',
    meta: {
      interface: 'select-dropdown', width: 'half',
      options: { choices: [
        { text: 'Draft', value: 'draft' },
        { text: 'Sent', value: 'sent' },
        { text: 'Signed', value: 'signed' },
        { text: 'Declined', value: 'declined' },
        { text: 'Cancelled', value: 'cancelled' },
        { text: 'Expired', value: 'expired' },
      ] },
    },
    schema: { default_value: 'draft' },
  });
  await createField('contracts', {
    field: 'total_value', type: 'decimal',
    meta: { interface: 'input', width: 'half', options: { iconLeft: 'attach_money' } },
    schema: { numeric_precision: 12, numeric_scale: 2 },
  });
  await createField('contracts', {
    field: 'date_sent', type: 'date',
    meta: { interface: 'datetime', width: 'half' }, schema: {},
  });
  await createField('contracts', {
    field: 'valid_until', type: 'date',
    meta: { interface: 'datetime', width: 'half', note: 'After this, the unsigned contract auto-expires' }, schema: {},
  });
  await createField('contracts', {
    field: 'effective_date', type: 'date',
    meta: { interface: 'datetime', width: 'half', note: 'When the agreement takes effect (often signing date)' }, schema: {},
  });
  await createField('contracts', {
    field: 'notes', type: 'text',
    meta: { interface: 'input-multiline', note: 'Internal notes (not rendered to the client). Use blocks for the contract body.' },
    schema: {},
  });
  await createField('contracts', {
    field: 'blocks', type: 'json',
    meta: {
      interface: 'input-code', options: { language: 'json' },
      note: 'Ordered array of block entries: { block_id, heading, content, page_break_after }',
      special: ['cast-json'],
    },
    schema: {},
  });
  await createField('contracts', {
    field: 'file', type: 'uuid',
    meta: { interface: 'file', note: 'Final signed PDF (uploaded post-signing)' },
    schema: {},
  });

  // Signature fields
  await createField('contracts', {
    field: 'signed_at', type: 'timestamp',
    meta: { interface: 'datetime', readonly: true, width: 'half', note: 'Timestamp of signature' }, schema: {},
  });
  await createField('contracts', {
    field: 'signed_by_name', type: 'string',
    meta: { interface: 'input', readonly: true, width: 'half' }, schema: {},
  });
  await createField('contracts', {
    field: 'signed_by_email', type: 'string',
    meta: { interface: 'input', readonly: true, width: 'half' }, schema: {},
  });
  await createField('contracts', {
    field: 'signed_by_ip', type: 'string',
    meta: { interface: 'input', readonly: true, width: 'half', hidden: true }, schema: {},
  });
  await createField('contracts', {
    field: 'signature_data', type: 'text',
    meta: { interface: 'input-multiline', readonly: true, hidden: true, note: 'Typed-name string OR data-URL of drawn signature' },
    schema: {},
  });
  await createField('contracts', {
    field: 'signing_token', type: 'string',
    meta: { interface: 'input', readonly: true, hidden: true, note: 'UUID for the public unauth signing URL' },
    schema: {},
  });

  // FKs
  await createField('contracts', {
    field: 'organization', type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, hidden: true },
    schema: { is_nullable: false },
  });
  await createRelation({
    collection: 'contracts', field: 'organization', related_collection: 'organizations',
    schema: { on_delete: 'CASCADE' }, meta: { sort_field: null },
  });

  await createField('contracts', {
    field: 'contact', type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], note: 'Recipient — usually the client signer' },
    schema: {},
  });
  await createRelation({
    collection: 'contracts', field: 'contact', related_collection: 'contacts',
    schema: { on_delete: 'SET NULL' }, meta: { sort_field: null },
  });

  await createField('contracts', {
    field: 'lead', type: 'integer',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'] },
    schema: {},
  });
  await createRelation({
    collection: 'contracts', field: 'lead', related_collection: 'leads',
    schema: { on_delete: 'SET NULL' }, meta: { sort_field: null },
  });

  await createField('contracts', {
    field: 'proposal', type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], note: 'Source proposal (if generated from one)' },
    schema: {},
  });
  await createRelation({
    collection: 'contracts', field: 'proposal', related_collection: 'proposals',
    schema: { on_delete: 'SET NULL' }, meta: { sort_field: null },
  });
}

async function setupPerms() {
  console.log('\n=== Permissions: Client Manager / contracts ===');
  await upsertPerm('contracts', 'read', ORG_SCOPE);
  await upsertPerm('contracts', 'update', ORG_SCOPE);
  await upsertPerm('contracts', 'delete', ORG_SCOPE);
  await upsertPerm('contracts', 'create', ORG_SCOPE, ORG_SCOPE);
}

async function main() {
  console.log('==========================================');
  console.log('  contracts — Setup');
  console.log('==========================================');
  console.log(`Directus URL: ${DIRECTUS_URL}`);
  await setupContracts();
  await setupPerms();
  console.log('\n==========================================');
  console.log('  Done');
  console.log('==========================================');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
