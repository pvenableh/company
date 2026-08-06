#!/usr/bin/env npx tsx
/**
 * Additive fields to classify + cross-link pitches / prototypes.
 *
 *   pitch_pages.kind        'pitch' | 'prototype' (default 'pitch') — a prototype
 *                           is a bespoke built page served via the same /p/<token>
 *                           mechanism, just flagged so it's distinguishable.
 *   pitch_pages.proposal    plain uuid link to a proposal (a pitch OR prototype
 *                           can reference the proposal it supports).
 *   prototype_briefs.result_pitch  plain int — the pitch_pages id of the BUILT
 *                           prototype, so the brief closes the loop:
 *                           pitch → brief → prototype  and  proposal → brief → prototype.
 *
 * Plain link columns (no enforced FK) — matches setup-prototype-briefs.ts and
 * dodges the Directus-11 create-perm FK-walk quirk. Idempotent + additive.
 *
 *   pnpm tsx scripts/setup-pitch-prototype-fields.ts
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!DIRECTUS_TOKEN) { console.error('Error: DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

async function req(path: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', body?: unknown) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 409 || (res.status === 400 && /already exists/i.test(text))) return { error: 'already_exists' as const };
    return { error: `${res.status}: ${text}` };
  }
  return { error: null };
}
async function createField(collection: string, field: Record<string, any>) {
  console.log(`  ${collection}.${field.field}`);
  const { error } = await req(`/fields/${collection}`, 'POST', field);
  console.log(error === 'already_exists' || error?.includes('already exists') ? '    -> exists, skip' : error ? `    -> ERR ${error}` : '    -> created');
}

async function main() {
  console.log('=== pitch/prototype classification + cross-links ===');
  console.log('Directus URL:', DIRECTUS_URL);

  await createField('pitch_pages', {
    field: 'kind', type: 'string',
    meta: { interface: 'select-dropdown', options: { choices: [{ text: 'Pitch', value: 'pitch' }, { text: 'Prototype', value: 'prototype' }] }, note: 'Pitch (positioning page) or Prototype (bespoke built page). Both serve via /p/<token>.', width: 'half' },
    schema: { is_nullable: false, default_value: 'pitch' },
  });
  await createField('pitch_pages', {
    field: 'proposal', type: 'uuid',
    meta: { interface: 'input', note: 'Linked proposal id (plain) — the proposal this pitch/prototype supports.', width: 'half' },
    schema: { is_nullable: true },
  });
  await createField('prototype_briefs', {
    field: 'result_pitch', type: 'integer',
    meta: { interface: 'input', note: 'pitch_pages id of the BUILT prototype (closes brief → prototype).' },
    schema: { is_nullable: true },
  });

  console.log('\nDone.');
}
main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
