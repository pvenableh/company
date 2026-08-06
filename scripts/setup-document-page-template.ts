#!/usr/bin/env npx tsx
/**
 * Adds `organizations.document_page_template` (json) — the running page-chrome
 * config for document PDF export (proposals / contracts / invoices). Holds an
 * optional running header + footer + page numbers drawn onto EVERY exported
 * page (the cover/title page is skipped). Shape (all optional):
 *   { enabled, show_logo, header_text, footer_text,
 *     show_page_numbers, page_number_format }
 *
 * Applied by DocumentPdfGenerator.vue at export time; edited via the
 * Document Page Template card in org settings.
 *
 * Idempotent — re-runs safely.
 *
 *   pnpm tsx scripts/setup-document-page-template.ts
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
  console.log('Adding organizations.document_page_template ...');
  const err = await directusRequest('/fields/organizations', 'POST', {
    field: 'document_page_template',
    type: 'json',
    meta: {
      interface: 'input-code',
      options: { language: 'json' },
      note: 'Running header/footer + page numbers drawn on every exported PDF page (set via the Page Template card in document settings).',
      special: ['cast-json'],
    },
    schema: { is_nullable: true },
  });
  if (err === 'already_exists') console.log('  document_page_template -> already exists');
  else if (err) { console.error('  document_page_template -> error:', err); process.exit(1); }
  else console.log('  document_page_template -> created');
  console.log('Done.');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
