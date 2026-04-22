#!/usr/bin/env npx tsx
/**
 * Add two O2M alias fields (Tier 2 item J — inverse relations):
 *
 *   1. `contacts.leads`    — reverse of `leads.related_contact` (m2o)
 *   2. `clients.contacts`  — reverse of `contacts.client` (m2o)
 *
 * Why: today `/contacts/[id]` and `/clients/[id]` fetch related records via
 * separate filtered queries. With these aliases, callers can project
 * `fields: ['*', 'leads.*']` or `['*', 'contacts.*']` in a single fetch.
 * Typegen also surfaces the inverse on the generated TS types.
 *
 * Safety:
 * - Both aliases are virtual fields. No database columns are created.
 * - No data migration. FKs (`leads.related_contact`, `contacts.client`) are
 *   untouched — the inverses read through them.
 * - Dry-run by default. Requires `--apply` to write.
 * - Idempotent: skips any alias + relation-meta that's already in place.
 *
 * Usage:
 *   pnpm tsx scripts/setup-inverse-relation-aliases.ts          # dry-run
 *   pnpm tsx scripts/setup-inverse-relation-aliases.ts --apply  # write
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');

type InverseSpec = {
  /** Parent collection that gets the alias field (O2M side). */
  parentCollection: string;
  /** Name of the alias field on the parent collection. */
  aliasField: string;
  /** Child collection that already has the FK (M2O side). */
  childCollection: string;
  /** Name of the FK field on the child collection. */
  childFkField: string;
  /** Human-readable note stored on the field meta. */
  note: string;
};

const INVERSES: InverseSpec[] = [
  {
    parentCollection: 'contacts',
    aliasField: 'leads',
    childCollection: 'leads',
    childFkField: 'related_contact',
    note: 'Leads associated with this contact. Inverse of leads.related_contact.',
  },
  {
    parentCollection: 'clients',
    aliasField: 'contacts',
    childCollection: 'contacts',
    childFkField: 'client',
    note: 'Contacts who belong to this client. Inverse of contacts.client.',
  },
];

async function directusRequest<T = unknown>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
): Promise<{ data: T | null; error: string | null; status: number }> {
  const response = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) return { data: null, error: `${response.status}: ${text}`, status: response.status };
  const json = text ? JSON.parse(text) : {};
  return { data: (json.data ?? null) as T, error: null, status: response.status };
}

async function fieldExists(collection: string, field: string): Promise<boolean> {
  const { data, status } = await directusRequest<any>(`/fields/${collection}/${field}`);
  return status === 200 && !!data;
}

async function findRelation(childCollection: string, childFkField: string): Promise<any | null> {
  const { data } = await directusRequest<any[]>('/relations?limit=-1');
  if (!data) return null;
  return data.find((r) => r.collection === childCollection && r.field === childFkField) || null;
}

async function processInverse(spec: InverseSpec): Promise<{ planned: string[]; apply: () => Promise<void> }> {
  const { parentCollection, aliasField, childCollection, childFkField, note } = spec;
  const label = `${parentCollection}.${aliasField} ⇐ ${childCollection}.${childFkField}`;

  const hasField = await fieldExists(parentCollection, aliasField);
  const relation = await findRelation(childCollection, childFkField);
  const hasRelationMeta = !!relation;
  const hasAlias = relation?.meta?.one_field === aliasField;

  console.log(`\n── ${label}`);
  console.log(`  alias field ${parentCollection}.${aliasField}:       ${hasField ? 'present' : 'missing'}`);
  console.log(`  relation row for ${childCollection}.${childFkField}: ${hasRelationMeta ? 'present' : 'missing'}`);
  console.log(`    meta.one_field === "${aliasField}":                 ${hasAlias ? 'yes' : 'no'}`);

  const planned: string[] = [];
  const actions: Array<() => Promise<void>> = [];

  if (!hasField) {
    planned.push(`POST /fields/${parentCollection} — create alias field \`${aliasField}\``);
    actions.push(async () => {
      const fieldPayload = {
        collection: parentCollection,
        field: aliasField,
        type: 'alias',
        meta: {
          interface: 'list-o2m',
          special: ['o2m'],
          note,
        },
        schema: null,
      };
      const { error } = await directusRequest(`/fields/${parentCollection}`, 'POST', fieldPayload);
      if (error) throw new Error(`Create field ${parentCollection}.${aliasField} failed: ${error}`);
      console.log(`  ✓ Created ${parentCollection}.${aliasField} alias field`);
    });
  } else {
    planned.push(`skip: alias field ${parentCollection}.${aliasField} already exists`);
  }

  if (!hasRelationMeta) {
    planned.push(
      `POST /relations — register ${childCollection}.${childFkField} → ${parentCollection} (one_field: "${aliasField}")`,
    );
    actions.push(async () => {
      const relationCreatePayload = {
        collection: childCollection,
        field: childFkField,
        related_collection: parentCollection,
        meta: {
          one_field: aliasField,
          one_deselect_action: 'nullify',
          sort_field: null,
          junction_field: null,
        },
      };
      const { error } = await directusRequest('/relations', 'POST', relationCreatePayload);
      if (error) throw new Error(`Create relation for ${childCollection}.${childFkField} failed: ${error}`);
      console.log(`  ✓ Created relation row with meta.one_field = "${aliasField}"`);
    });
  } else if (!hasAlias) {
    const patchPath = `/relations/${childCollection}/${childFkField}`;
    planned.push(`PATCH ${patchPath} — set meta.one_field = "${aliasField}"`);
    actions.push(async () => {
      const { error } = await directusRequest(patchPath, 'PATCH', {
        meta: { ...(relation.meta ?? {}), one_field: aliasField },
      });
      if (error) throw new Error(`Patch relation ${patchPath} failed: ${error}`);
      console.log(`  ✓ Patched relation to expose ${aliasField} o2m alias`);
    });
  } else {
    planned.push(`skip: relation already exposes ${aliasField}`);
  }

  return {
    planned,
    apply: async () => {
      for (const action of actions) await action();
    },
  };
}

async function main() {
  console.log(`\n${APPLY ? '🔧 APPLY' : '🔍 DRY-RUN'} mode — Directus: ${DIRECTUS_URL}`);

  const results = [];
  for (const spec of INVERSES) {
    results.push(await processInverse(spec));
  }

  console.log('\nPlan:');
  results.forEach((r, i) => {
    console.log(`  [${i + 1}] ${INVERSES[i]!.parentCollection}.${INVERSES[i]!.aliasField}:`);
    r.planned.forEach((line) => console.log(`      - ${line}`));
  });
  console.log('');

  if (!APPLY) {
    console.log('This was a DRY RUN. Re-run with --apply to write changes.');
    return;
  }

  for (const r of results) await r.apply();

  console.log('\nDone. Next:');
  console.log('  1. `npm run generate:types` to refresh shared/directus.ts');
  console.log('  2. Refactor the filtered fetches in /contacts/[id] and /clients/[id] to use O2M projections');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
