/**
 * Add 'Threads' to the platform dropdown on social_threads + social_activity.
 *
 * Idempotent — safe to re-run. Only updates field.meta.options.choices; no DB-level
 * column change because the field is varchar and the enum is enforced at the UI layer.
 *
 * Usage:
 *   pnpm tsx scripts/patch-social-inbox-add-threads.ts          # dry-run
 *   pnpm tsx scripts/patch-social-inbox-add-threads.ts --apply  # actually write
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
const APPLY = process.argv.includes('--apply');

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN is required');
	process.exit(1);
}

const desiredChoices = [
	{ text: 'Facebook', value: 'facebook' },
	{ text: 'Instagram', value: 'instagram' },
	{ text: 'Threads', value: 'threads' },
];

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${DIRECTUS_TOKEN}`,
			'Content-Type': 'application/json',
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`${method} ${path} → ${res.status}: ${text}`);
	}
	return (await res.json()) as T;
}

async function patchField(collection: string) {
	const { data: field } = await api<{ data: { meta: { options?: { choices?: Array<{ text: string; value: string }> } } } }>(
		'GET',
		`/fields/${collection}/platform`,
	);

	const current = field.meta?.options?.choices || [];
	const hasThreads = current.some((c) => c.value === 'threads');

	if (hasThreads) {
		console.log(`  ${collection}.platform — already includes 'threads', skipping`);
		return;
	}

	console.log(`  ${collection}.platform — adding 'threads' (was: ${current.map((c) => c.value).join(', ')})`);

	if (!APPLY) return;

	await api('PATCH', `/fields/${collection}/platform`, {
		meta: {
			options: { choices: desiredChoices },
		},
	});
}

async function main() {
	console.log(`\n${APPLY ? 'APPLY' : 'DRY-RUN'} mode — Directus: ${DIRECTUS_URL}\n`);
	await patchField('social_threads');
	await patchField('social_activity');
	console.log(`\nDone. ${APPLY ? '' : '(no changes written — pass --apply to commit)'}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
