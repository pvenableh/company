#!/usr/bin/env npx tsx
/**
 * Adds `organizations.whitelabel: boolean default false`.
 *
 * Powers the "Hide Powered by Earnest." toggle on the org settings page.
 * UI gates the toggle to paid plans (studio/agency/enterprise); render-side
 * helpers honor the flag only when the org's plan qualifies.
 *
 * Idempotent — re-runs safely.
 *
 *   pnpm tsx scripts/setup-organization-whitelabel.ts
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

async function main() {
  console.log('Adding organizations.whitelabel ...');
  const { error } = await directusRequest('/fields/organizations', 'POST', {
    field: 'whitelabel',
    type: 'boolean',
    meta: {
      interface: 'boolean',
      special: ['cast-boolean'],
      note: 'When true (and plan supports whitelabel), hides "Powered by Earnest." on client-facing documents.',
      width: 'half',
    },
    schema: { default_value: false, is_nullable: false },
  });
  if (error === 'already_exists') console.log('  -> Already exists');
  else if (error) { console.error('  -> Error:', error); process.exit(1); }
  else console.log('  -> Created');
  console.log('Done.');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
