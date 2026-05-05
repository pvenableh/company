#!/usr/bin/env npx tsx
/**
 * Adds `organizations.document_theme` (enum) and `organizations.document_accent`
 * (string, hex). Powers the shared theme system across invoices, proposals,
 * and contracts. Read by Invoice.vue / proposal+contract previews to apply
 * a `.doc-theme--{theme}` class on the document shell.
 *
 * Idempotent — re-runs safely.
 *
 *   pnpm tsx scripts/setup-document-themes.ts
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!DIRECTUS_TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

async function directusRequest<T = unknown>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
): Promise<{ data: T | null; error: string | null }> {
  const r = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) {
    if (r.status === 400 && /already exists/i.test(text)) return { data: null, error: 'already_exists' };
    return { data: null, error: `${r.status}: ${text}` };
  }
  return { data: text ? (JSON.parse(text).data ?? null) : null, error: null };
}

async function addField(field: string, payload: any) {
  const { error } = await directusRequest(`/fields/organizations`, 'POST', { field, ...payload });
  if (error === 'already_exists') console.log(`  ${field} -> already exists`);
  else if (error) { console.error(`  ${field} -> error:`, error); process.exit(1); }
  else console.log(`  ${field} -> created`);
}

async function main() {
  console.log('Adding organizations.document_theme + document_accent ...');

  await addField('document_theme', {
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      options: {
        choices: [
          { text: 'Classic — clean white, sans-serif', value: 'classic' },
          { text: 'Editorial — warm cream, serif body', value: 'editorial' },
          { text: 'Mono — minimal, brand accent', value: 'mono' },
        ],
      },
      note: 'Applied across invoices, proposals, and contracts sent from this organization.',
      width: 'half',
    },
    schema: { default_value: 'classic', is_nullable: false },
  });

  await addField('document_accent', {
    type: 'string',
    meta: {
      interface: 'select-color',
      note: 'Used by the Mono theme as the brand accent. Defaults to a neutral gray.',
      width: 'half',
    },
    schema: { default_value: '#1f2937', is_nullable: true, max_length: 9 },
  });

  console.log('Done.');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
