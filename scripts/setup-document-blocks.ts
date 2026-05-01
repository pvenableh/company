#!/usr/bin/env npx tsx
/**
 * Directus document_blocks Collection — Setup Script
 *
 * Reusable content blocks (bio, references, deliverables, terms, NDA
 * clauses, case studies, etc.) that compose into proposals + contracts.
 * One library per org; blocks are referenced from documents via the
 * proposals.blocks / contracts.blocks json arrays.
 *
 *   pnpm tsx scripts/setup-document-blocks.ts
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

async function setupDocumentBlocks() {
  console.log('\n=== document_blocks ===');

  await createCollection('document_blocks', {
    icon: 'view_module',
    note: 'Reusable content blocks (bio, references, deliverables, terms, NDA, case studies) composed into proposals + contracts',
    color: '#6366F1',
    hidden: false,
    singleton: false,
    accountability: 'all',
    sort_field: 'sort',
    display_template: '{{name}}',
    archive_field: 'status',
    archive_value: 'archived',
    unarchive_value: 'draft',
  });

  // System fields
  await createField('document_blocks', {
    field: 'id', type: 'uuid',
    meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
    schema: { is_primary_key: true, has_auto_increment: false },
  });
  await createField('document_blocks', {
    field: 'status', type: 'string',
    meta: {
      interface: 'select-dropdown', width: 'half',
      options: { choices: [
        { text: 'Published', value: 'published' },
        { text: 'Draft', value: 'draft' },
        { text: 'Archived', value: 'archived' },
      ] },
    },
    schema: { default_value: 'published' },
  });
  await createField('document_blocks', {
    field: 'sort', type: 'integer',
    meta: { interface: 'input', hidden: true }, schema: {},
  });
  await createField('document_blocks', {
    field: 'date_created', type: 'timestamp',
    meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: {},
  });
  await createField('document_blocks', {
    field: 'date_updated', type: 'timestamp',
    meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: {},
  });
  await createField('document_blocks', {
    field: 'user_created', type: 'uuid',
    meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' }, schema: {},
  });
  await createField('document_blocks', {
    field: 'user_updated', type: 'uuid',
    meta: { special: ['user-updated'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' }, schema: {},
  });

  // Domain fields
  await createField('document_blocks', {
    field: 'name', type: 'string',
    meta: { interface: 'input', required: true, note: 'e.g. "Studio bio", "Standard NDA terms"' },
    schema: { is_nullable: false },
  });
  await createField('document_blocks', {
    field: 'category', type: 'string',
    meta: {
      interface: 'select-dropdown', width: 'half',
      options: { allowOther: true, choices: [
        { text: 'Bio / About', value: 'bio' },
        { text: 'References', value: 'references' },
        { text: 'Case Study', value: 'case_study' },
        { text: 'Scope / Deliverables', value: 'deliverables' },
        { text: 'Pricing', value: 'pricing' },
        { text: 'Timeline', value: 'timeline' },
        { text: 'Terms', value: 'terms' },
        { text: 'NDA', value: 'nda' },
        { text: 'Cover', value: 'cover' },
        { text: 'Other', value: 'other' },
      ] },
      note: 'Filter / group in the picker',
    },
    schema: { default_value: 'other' },
  });
  await createField('document_blocks', {
    field: 'description', type: 'text',
    meta: { interface: 'input-multiline', width: 'half', note: 'One-liner shown in the block picker' },
    schema: {},
  });
  await createField('document_blocks', {
    field: 'content', type: 'text',
    meta: {
      interface: 'input-rich-text-md',
      note: 'Block content (markdown). Renders into proposals + contracts. Per-document overrides don\'t mutate this.',
    },
    schema: {},
  });
  await createField('document_blocks', {
    field: 'applies_to', type: 'json',
    meta: {
      interface: 'select-multiple-dropdown',
      width: 'half',
      options: { choices: [
        { text: 'Proposals', value: 'proposals' },
        { text: 'Contracts', value: 'contracts' },
      ] },
      note: 'Which document types can use this block',
    },
    schema: { default_value: ['proposals', 'contracts'] },
  });

  // Tenant FK
  await createField('document_blocks', {
    field: 'organization', type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, hidden: true, note: 'Owning organization' },
    schema: { is_nullable: false },
  });
  await createRelation({
    collection: 'document_blocks',
    field: 'organization',
    related_collection: 'organizations',
    schema: { on_delete: 'CASCADE' },
    meta: { sort_field: null },
  });
}

async function setupPerms() {
  console.log('\n=== Permissions: Client Manager / document_blocks ===');
  await upsertPerm('document_blocks', 'read', ORG_SCOPE);
  await upsertPerm('document_blocks', 'update', ORG_SCOPE);
  await upsertPerm('document_blocks', 'delete', ORG_SCOPE);
  await upsertPerm('document_blocks', 'create', ORG_SCOPE, ORG_SCOPE);
}

async function main() {
  console.log('==========================================');
  console.log('  document_blocks — Setup');
  console.log('==========================================');
  console.log(`Directus URL: ${DIRECTUS_URL}`);
  await setupDocumentBlocks();
  await setupPerms();
  console.log('\n==========================================');
  console.log('  Done');
  console.log('==========================================');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
