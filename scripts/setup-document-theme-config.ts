#!/usr/bin/env npx tsx
/**
 * Adds `organizations.document_theme_config` (json) — the customization layer
 * for the Document Theme Studio. Holds optional `--doc-*` overrides
 * (bg, fg, rule, headingFont, bodyFont, metaTransform, metaTracking,
 * cardRadius) layered on top of the base `document_theme`.
 *
 * Idempotent — re-runs safely.
 *
 *   pnpm tsx scripts/setup-document-theme-config.ts
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!DIRECTUS_TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

async function directusRequest(path: string, method = 'POST', body?: unknown) {
  const r = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) {
    if (r.status === 400 && /already exists/i.test(text)) return 'already_exists';
    return `${r.status}: ${text}`;
  }
  return null;
}

async function main() {
  console.log('Adding organizations.document_theme_config ...');
  const err = await directusRequest('/fields/organizations', 'POST', {
    field: 'document_theme_config',
    type: 'json',
    meta: {
      interface: 'input-code',
      options: { language: 'json' },
      note: 'Visual overrides layered on top of the base document theme (set via the Document Theme Studio).',
      special: ['cast-json'],
    },
    schema: { is_nullable: true },
  });
  if (err === 'already_exists') console.log('  document_theme_config -> already exists');
  else if (err) { console.error('  document_theme_config -> error:', err); process.exit(1); }
  else console.log('  document_theme_config -> created');
  console.log('Done.');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
