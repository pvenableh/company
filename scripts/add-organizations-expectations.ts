#!/usr/bin/env npx tsx
/**
 * Add `organizations.expectations` — what the owner said they want from Earnest.
 *
 * Captured in the onboarding "Expectations" step (the chip picks + freeform,
 * e.g. "Save me time, Chase the money for me. Just make invoicing painless.").
 * Durable org context: like `goals` / `brand_direction`, it feeds how Earnest
 * shows up for the org. Optional / nullable.
 *
 * Idempotent. Run:
 *   pnpm tsx scripts/add-organizations-expectations.ts
 *
 * After running, regenerate types:
 *   pnpm generate:types
 *
 * Then flip `EXPECTATIONS_PERSIST = true` in app/pages/organization/new.vue so
 * the wizard starts sending the field.
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
  console.log('\n── organizations.expectations Setup ──\n');
  console.log(`Directus: ${DIRECTUS_URL}\n`);

  await createField('organizations', 'expectations', {
    type: 'text',
    meta: {
      interface: 'input-multiline',
      display: 'raw',
      note: 'What the owner said they want from Earnest at signup. Feeds AI context. Optional.',
      group: null,
      width: 'full',
      options: { placeholder: 'e.g. Save me time, chase the money for me…' },
      hidden: false,
    },
    schema: { is_nullable: true, default_value: null },
  });

  console.log('\n── Done ──\n');
  console.log('Next: pnpm generate:types, then flip EXPECTATIONS_PERSIST in app/pages/organization/new.vue.');
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
