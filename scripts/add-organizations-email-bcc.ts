#!/usr/bin/env npx tsx
/**
 * Add `organizations.email_bcc` — optional per-org monitoring BCC.
 *
 * When set, every branded email sent for that org (sendBrandedEmail) is also
 * BCC'd to this address so the org admin gets a copy for their records. Optional
 * — blank/null means only the global SENDGRID_BCC_EMAIL applies. Edited in
 * Organization → Email Branding.
 *
 * Idempotent. Run:
 *   pnpm tsx scripts/add-organizations-email-bcc.ts
 *
 * After running, regenerate types:
 *   pnpm generate:types
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
  process.exit(1);
}

async function directusRequest<T = unknown>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' = 'GET',
  body?: unknown,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await fetch(`${DIRECTUS_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) {
      const err = text ? JSON.parse(text) : {};
      return { data: null, error: err.errors?.[0]?.message || `HTTP ${response.status}` };
    }
    const json = text ? JSON.parse(text) : {};
    return { data: json.data ?? null, error: null };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
}

async function fieldExists(collection: string, field: string): Promise<boolean> {
  const { error } = await directusRequest(`/fields/${collection}/${field}`);
  return !error;
}

async function createField(collection: string, field: string, config: any): Promise<void> {
  if (await fieldExists(collection, field)) {
    console.log(`  ✓ ${collection}.${field} already exists`);
    return;
  }
  const { error } = await directusRequest(`/fields/${collection}`, 'POST', { field, ...config });
  if (error) console.error(`  ✗ ${collection}.${field} failed: ${error}`);
  else console.log(`  + ${collection}.${field} created`);
}

async function main() {
  console.log('\n── organizations.email_bcc Setup ──\n');
  console.log(`Directus: ${DIRECTUS_URL}\n`);

  await createField('organizations', 'email_bcc', {
    type: 'string',
    meta: {
      interface: 'input',
      display: 'raw',
      note: 'Optional monitoring BCC. When set, every email sent for this org is also BCC\'d here. Leave blank to use only the global BCC.',
      group: null,
      width: 'half',
      options: { placeholder: 'records@yourdomain.com' },
      hidden: false,
    },
    schema: { is_nullable: true, default_value: null },
  });

  console.log('\n── Done ──\n');
  console.log('Next: pnpm generate:types (optional — code casts around the type).');
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
