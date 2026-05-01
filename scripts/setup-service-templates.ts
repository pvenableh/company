#!/usr/bin/env npx tsx
/**
 * Directus service_templates Collection — Setup Script
 *
 * Creates the `service_templates` collection that powers the AI proposal
 * draft flow on /leads/[id]. Each template is org-scoped and represents a
 * reusable service offering (e.g. "Brand Identity Package", "Monthly
 * Retainer") with default scope copy + total + duration that the AI
 * proposal-drafter can pick from.
 *
 * Runs setup + tenant-scoped perms in one shot.
 *
 *   pnpm tsx scripts/setup-service-templates.ts
 *
 * Idempotent: re-runs are safe.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
  process.exit(1);
}

const POLICY_CLIENT_MANAGER = '012beff9-150c-49e9-a284-1a7e2757e0dd';
const ORG_SCOPE = { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } };

// ─── API Helper ───────────────────────────────────────────────────────────────

async function directusRequest<T = unknown>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await fetch(`${DIRECTUS_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) {
      if (response.status === 409) return { data: null, error: 'already_exists' };
      if (response.status === 400 && /already exists|already has an associated/i.test(text)) {
        return { data: null, error: 'already_exists' };
      }
      return { data: null, error: `${response.status}: ${text}` };
    }
    const json = text ? JSON.parse(text) : {};
    return { data: json.data ?? null, error: null };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
}

async function createCollection(collection: string, meta: Record<string, any>) {
  console.log(`  Creating collection: ${collection}`);
  const { error } = await directusRequest('/collections', 'POST', { collection, meta, schema: {} });
  if (error === 'already_exists') { console.log(`    -> Already exists, skipping`); return true; }
  if (error) { console.error(`    -> Error: ${error}`); return false; }
  console.log(`    -> Created`);
  return true;
}

async function createField(collection: string, field: Record<string, any>) {
  console.log(`  Creating field: ${collection}.${field.field}`);
  const { error } = await directusRequest(`/fields/${collection}`, 'POST', field);
  if (error === 'already_exists' || error?.includes('already exists')) {
    console.log(`    -> Already exists, skipping`);
    return true;
  }
  if (error) { console.error(`    -> Error: ${error}`); return false; }
  console.log(`    -> Created`);
  return true;
}

async function createRelation(data: Record<string, any>) {
  console.log(`  Creating relation: ${data.collection}.${data.field} -> ${data.related_collection}`);
  const { error } = await directusRequest('/relations', 'POST', data);
  if (error === 'already_exists') { console.log(`    -> Already exists, skipping`); return true; }
  if (error) { console.error(`    -> Error: ${error}`); return false; }
  console.log(`    -> Created`);
  return true;
}

async function upsertPerm(collection: string, action: string, permissions: any, validation: any = null) {
  console.log(`  Perm: Client Manager.${collection}.${action}`);
  const filterParam = encodeURIComponent(JSON.stringify({
    _and: [
      { policy: { _eq: POLICY_CLIENT_MANAGER } },
      { collection: { _eq: collection } },
      { action: { _eq: action } },
    ],
  }));
  const existing = await directusRequest<any[]>(`/permissions?filter=${filterParam}&fields=id&limit=1`);
  if (existing.data && existing.data.length > 0) {
    const id = existing.data[0].id;
    const { error } = await directusRequest(`/permissions/${id}`, 'PATCH', { permissions, validation, fields: ['*'] });
    if (error) { console.error(`    -> PATCH error: ${error}`); return false; }
    console.log(`    -> Updated #${id}`);
    return true;
  }
  const { error } = await directusRequest('/permissions', 'POST', {
    policy: POLICY_CLIENT_MANAGER, collection, action, permissions, validation, fields: ['*'],
  });
  if (error) { console.error(`    -> POST error: ${error}`); return false; }
  console.log(`    -> Created`);
  return true;
}

// ─── Schema Definition ────────────────────────────────────────────────────────

async function setupServiceTemplates() {
  console.log('\n=== service_templates ===');

  await createCollection('service_templates', {
    icon: 'description',
    note: 'Reusable service offerings (scope, total, duration) the AI proposal-drafter picks from on /leads/[id]',
    color: '#8B5CF6',
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
  await createField('service_templates', {
    field: 'id', type: 'uuid',
    meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
    schema: { is_primary_key: true, has_auto_increment: false },
  });
  await createField('service_templates', {
    field: 'status', type: 'string',
    meta: {
      interface: 'select-dropdown', width: 'half',
      options: { choices: [
        { text: 'Published', value: 'published' },
        { text: 'Draft', value: 'draft' },
        { text: 'Archived', value: 'archived' },
      ] },
      note: 'Only `published` templates show in the AI draft picker',
    },
    schema: { default_value: 'published' },
  });
  await createField('service_templates', {
    field: 'sort', type: 'integer',
    meta: { interface: 'input', hidden: true }, schema: {},
  });
  await createField('service_templates', {
    field: 'date_created', type: 'timestamp',
    meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
    schema: {},
  });
  await createField('service_templates', {
    field: 'date_updated', type: 'timestamp',
    meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
    schema: {},
  });
  await createField('service_templates', {
    field: 'user_created', type: 'uuid',
    meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' },
    schema: {},
  });
  await createField('service_templates', {
    field: 'user_updated', type: 'uuid',
    meta: { special: ['user-updated'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' },
    schema: {},
  });

  // Domain fields
  await createField('service_templates', {
    field: 'name', type: 'string',
    meta: { interface: 'input', required: true, note: 'e.g. "Brand Identity Package"' },
    schema: { is_nullable: false },
  });
  await createField('service_templates', {
    field: 'category', type: 'string',
    meta: {
      interface: 'select-dropdown', width: 'half',
      options: { allowOther: true, choices: [
        { text: 'Branding', value: 'branding' },
        { text: 'Web', value: 'web' },
        { text: 'Marketing', value: 'marketing' },
        { text: 'Retainer', value: 'retainer' },
        { text: 'Other', value: 'other' },
      ] },
    },
    schema: { default_value: 'other' },
  });
  await createField('service_templates', {
    field: 'description', type: 'text',
    meta: { interface: 'input-multiline', note: 'One-liner shown in the picker' },
    schema: {},
  });
  await createField('service_templates', {
    field: 'scope_template', type: 'text',
    meta: {
      interface: 'input-rich-text-md',
      note: 'Default scope copy. Use plain text or markdown — the AI will adapt this to the lead\'s context (industry, brief, etc.) when drafting the proposal.',
    },
    schema: {},
  });
  await createField('service_templates', {
    field: 'default_total', type: 'decimal',
    meta: { interface: 'input', width: 'half', options: { iconLeft: 'attach_money' }, note: 'Reference base price' },
    schema: { numeric_precision: 12, numeric_scale: 2 },
  });
  await createField('service_templates', {
    field: 'default_duration_days', type: 'integer',
    meta: { interface: 'input', width: 'half', note: 'Typical project length' },
    schema: {},
  });

  // Tenant FK
  await createField('service_templates', {
    field: 'organization', type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, hidden: true, note: 'Owning organization' },
    schema: { is_nullable: false },
  });
  await createRelation({
    collection: 'service_templates',
    field: 'organization',
    related_collection: 'organizations',
    schema: { on_delete: 'CASCADE' },
    meta: { sort_field: null },
  });
}

async function setupPerms() {
  console.log('\n=== Permissions: Client Manager / service_templates ===');
  // Read/update/delete: org-scoped row filter (Directus enforces these on the existing row).
  await upsertPerm('service_templates', 'read', ORG_SCOPE);
  await upsertPerm('service_templates', 'update', ORG_SCOPE);
  await upsertPerm('service_templates', 'delete', ORG_SCOPE);
  // Create: validation field enforces tenant scope at insert time (Directus
  // 11 ignores `permissions` on create even for direct fields).
  await upsertPerm('service_templates', 'create', ORG_SCOPE, ORG_SCOPE);
}

async function main() {
  console.log('==========================================');
  console.log('  service_templates — Setup');
  console.log('==========================================');
  console.log(`Directus URL: ${DIRECTUS_URL}`);

  await setupServiceTemplates();
  await setupPerms();

  console.log('\n==========================================');
  console.log('  Done');
  console.log('==========================================');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
