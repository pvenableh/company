#!/usr/bin/env npx tsx
/**
 * Trim `ai_preferences.persona` field choices to the two live personas.
 *
 * Context: commit c723d3f8 (2026-07-07/08) reduced personas 4 → 2 in the app
 * and narrowed the TS type to `default | director` (Buddy/Motivator retired,
 * folded into the warm default). The prod Directus field, however, still lists
 * `default | director | buddy | motivator`, so `pnpm generate:types`
 * re-introduces `buddy | motivator` into shared/directus.ts every run (had to be
 * hand-reverted during Sprint 1 return-leg work).
 *
 * This script PATCHes the field's meta.options.choices down to:
 *   - default  → "Earnest"
 *   - director → "The Director"
 * so the generated type matches the code and the diff stays empty.
 *
 * Safety:
 *   - Dry-run by default. Requires `--apply` to write.
 *   - Idempotent: no-ops if the field already has exactly the two choices.
 *   - Reports any rows still on a retired persona value. Those are harmless —
 *     the app treats any unknown persona as 'default' on read (useAIPersona's
 *     `activePersona` falls back to personas[0]) — but the count is surfaced so
 *     you can optionally normalize them.
 *
 * The DB column (varchar/255) and default ('default') are untouched — only the
 * Directus field meta choices change.
 *
 * Usage:
 *   npx tsx scripts/setup-ai-persona-choices.ts            # dry-run
 *   npx tsx scripts/setup-ai-persona-choices.ts --apply    # write
 *
 * Then: `pnpm generate:types` and confirm `git diff shared/directus.ts` is empty
 * for the persona line.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');

/** The canonical live persona choices — must mirror app/composables/useAIPersona.ts. */
const LIVE_CHOICES = [
  { text: 'Earnest', value: 'default' },
  { text: 'The Director', value: 'director' },
];
const LIVE_VALUES = LIVE_CHOICES.map((c) => c.value);

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

async function main() {
  console.log(`\n${APPLY ? '🔧 APPLY' : '🔍 DRY-RUN'} mode — Directus: ${DIRECTUS_URL}`);

  // 1. Read the current field meta for idempotency.
  console.log('\n── Checking current ai_preferences.persona field config…');
  const { data: field, error: fieldErr } = await directusRequest<any>('/fields/ai_preferences/persona');
  if (fieldErr) throw new Error(`Failed to read field: ${fieldErr}`);

  const currentChoices: Array<{ text?: string; value: string }> = field?.meta?.options?.choices ?? [];
  const currentValues = currentChoices.map((c) => c.value);
  console.log(`  current choices: ${currentValues.join(' | ') || '(empty)'}`);

  const alreadyTrimmed =
    currentValues.length === LIVE_VALUES.length &&
    LIVE_VALUES.every((v, i) => currentValues[i] === v);

  // 2. Surface any rows still on a retired persona (informational only).
  console.log('\n── Scanning ai_preferences rows for retired persona values…');
  const { data: rows, error: rowsErr } = await directusRequest<Array<{ id: number; persona: string | null }>>(
    '/items/ai_preferences?fields=id,persona&limit=-1',
  );
  if (rowsErr) throw new Error(`Failed to fetch ai_preferences: ${rowsErr}`);
  const legacy = (rows || []).filter((r) => r.persona && !LIVE_VALUES.includes(r.persona));
  if (legacy.length > 0) {
    console.log(`  ⚠ ${legacy.length} row(s) on a retired persona (read as 'default' by the app):`);
    for (const r of legacy.slice(0, 10)) console.log(`    - id=${r.id}  persona="${r.persona}"`);
    if (legacy.length > 10) console.log(`    … and ${legacy.length - 10} more`);
    console.log('  (Harmless — no migration required. Left as-is.)');
  } else {
    console.log(`  ✓ No rows on retired personas (scanned ${rows?.length ?? 0}).`);
  }

  if (alreadyTrimmed) {
    console.log('\n  ✓ Nothing to do. Field already lists exactly: default | director.');
    return;
  }

  console.log('\nPlan:');
  console.log('  PATCH /fields/ai_preferences/persona');
  console.log(`    options.choices → ${LIVE_VALUES.join(' | ')}`);

  if (!APPLY) {
    console.log('\nThis was a DRY RUN. Re-run with --apply to write.');
    return;
  }

  // 3. Merge: preserve all existing meta.options, replace only choices.
  const nextOptions = { ...(field?.meta?.options ?? {}), choices: LIVE_CHOICES };
  const { error: patchErr } = await directusRequest('/fields/ai_preferences/persona', 'PATCH', {
    meta: { options: nextOptions },
  });
  if (patchErr) {
    console.error(`\n✗ Patch failed: ${patchErr}`);
    process.exit(1);
  }
  console.log('\n✓ ai_preferences.persona now lists exactly: default | director.');
  console.log('\nNext:');
  console.log('  - `pnpm generate:types`');
  console.log('  - `git diff shared/directus.ts` should be empty for the persona line.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
