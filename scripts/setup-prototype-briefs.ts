#!/usr/bin/env npx tsx
/**
 * Directus `prototype_briefs` collection — setup script.
 *
 * A prototype brief is a Claude Code build prompt Earnest generates from a pitch
 * or a proposal (idea + brand + target + spec) so a developer can build a
 * bespoke prototype (like the Myles pitch). Briefs are PERSISTED for historical
 * reference — you can re-copy, diff, or regenerate them.
 *
 * Admin-only (like ai_actions): all reads/writes go through the server endpoints
 * under /api/ai/generate-prototype-brief and /api/prototype-briefs — no client
 * row perms. Link columns (lead/client/contact/pitch/proposal) are plain typed
 * columns (not enforced FK relations) to avoid the Directus-11 create-perm
 * FK-walk quirk; only `organization` is a real m2o.
 *
 * Modeled on scripts/setup-director-sessions-collection.ts (helpers verbatim).
 * Additive + idempotent — safe to re-run.
 *
 *   pnpm tsx scripts/setup-prototype-briefs.ts
 *   # generate:types optional — endpoints use `'prototype_briefs' as any`.
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN required');
  process.exit(1);
}

async function directusRequest(path: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', body?: unknown) {
  try {
    const res = await fetch(`${DIRECTUS_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 409) return { error: 'already_exists' as const };
      if (res.status === 400 && /already exists|already has an associated/i.test(text)) return { error: 'already_exists' as const };
      return { error: `${res.status}: ${text}` };
    }
    return { error: null };
  } catch (err: any) {
    return { error: err.message };
  }
}

async function createCollection(collection: string, meta: Record<string, any>) {
  console.log(`  Collection: ${collection}`);
  const { error } = await directusRequest('/collections', 'POST', { collection, meta, schema: {} });
  console.log(error === 'already_exists' ? '    -> exists, skip' : error ? `    -> ERR ${error}` : '    -> created');
}
async function createField(collection: string, field: Record<string, any>) {
  console.log(`  Field: ${collection}.${field.field}`);
  const { error } = await directusRequest(`/fields/${collection}`, 'POST', field);
  console.log(error === 'already_exists' || error?.includes('already exists') ? '    -> exists, skip' : error ? `    -> ERR ${error}` : '    -> created');
}
async function createRelation(data: Record<string, any>) {
  console.log(`  Relation: ${data.collection}.${data.field} -> ${data.related_collection}`);
  const { error } = await directusRequest('/relations', 'POST', data);
  console.log(error === 'already_exists' ? '    -> exists, skip' : error ? `    -> ERR ${error}` : '    -> created');
}

async function main() {
  console.log('=== prototype_briefs setup ===');
  console.log('Directus URL:', DIRECTUS_URL);

  await createCollection('prototype_briefs', {
    icon: 'terminal',
    note: 'A Claude Code build brief generated from a pitch or proposal — the idea + brand + target + spec a developer runs to build a bespoke prototype. Persisted for history.',
    color: '#6366F1',
    hidden: false,
    singleton: false,
    accountability: 'all',
    display_template: '{{title}} ({{source}} · {{status}})',
  });

  await createField('prototype_briefs', {
    field: 'organization', type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{name}}' }, note: 'Owning organization.' },
    schema: { is_nullable: true },
  });
  await createField('prototype_briefs', {
    field: 'source', type: 'string',
    meta: { interface: 'select-dropdown', options: { choices: [{ text: 'Pitch', value: 'pitch' }, { text: 'Proposal', value: 'proposal' }, { text: 'Manual', value: 'manual' }] }, note: 'Where the brief was generated from.' },
    schema: { is_nullable: false, default_value: 'manual' },
  });
  await createField('prototype_briefs', { field: 'title', type: 'string', meta: { interface: 'input' }, schema: { is_nullable: true } });
  await createField('prototype_briefs', { field: 'brief_markdown', type: 'text', meta: { interface: 'input-multiline', note: 'The Claude Code prompt (markdown).' }, schema: { is_nullable: true } });
  await createField('prototype_briefs', { field: 'inputs_json', type: 'json', meta: { interface: 'input-code', options: { language: 'json' }, note: 'Context snapshot used to generate the brief.' }, schema: {} });
  await createField('prototype_briefs', {
    field: 'status', type: 'string',
    meta: { interface: 'select-dropdown', options: { choices: [{ text: 'Draft', value: 'draft' }, { text: 'Final', value: 'final' }] } },
    schema: { is_nullable: false, default_value: 'draft' },
  });
  await createField('prototype_briefs', { field: 'version', type: 'integer', meta: { interface: 'input' }, schema: { is_nullable: false, default_value: 1 } });
  // Plain link columns (no enforced FK — server writes these; we query by id).
  await createField('prototype_briefs', { field: 'lead', type: 'integer', meta: { interface: 'input', note: 'Linked lead id (plain).' }, schema: { is_nullable: true } });
  await createField('prototype_briefs', { field: 'client', type: 'uuid', meta: { interface: 'input', note: 'Linked client id (plain).' }, schema: { is_nullable: true } });
  await createField('prototype_briefs', { field: 'contact', type: 'uuid', meta: { interface: 'input', note: 'Linked contact id (plain).' }, schema: { is_nullable: true } });
  await createField('prototype_briefs', { field: 'pitch', type: 'integer', meta: { interface: 'input', note: 'Linked pitch_pages id (plain).' }, schema: { is_nullable: true } });
  await createField('prototype_briefs', { field: 'proposal', type: 'uuid', meta: { interface: 'input', note: 'Linked proposals id (plain).' }, schema: { is_nullable: true } });

  await createField('prototype_briefs', { field: 'user_created', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['user-created'], readonly: true, hidden: true, width: 'half' }, schema: {} });
  await createField('prototype_briefs', { field: 'date_created', type: 'timestamp', meta: { interface: 'datetime', special: ['date-created'], readonly: true, hidden: true, width: 'half' }, schema: {} });
  await createField('prototype_briefs', { field: 'date_updated', type: 'timestamp', meta: { interface: 'datetime', special: ['date-updated'], readonly: true, hidden: true, width: 'half' }, schema: {} });

  await createRelation({ collection: 'prototype_briefs', field: 'organization', related_collection: 'organizations', schema: { on_delete: 'CASCADE' }, meta: { sort_field: null } });
  await createRelation({ collection: 'prototype_briefs', field: 'user_created', related_collection: 'directus_users', schema: { on_delete: 'SET NULL' }, meta: { sort_field: null } });

  console.log('\nDone. Endpoints use the collection via admin token.');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
