#!/usr/bin/env npx tsx
/**
 * Portal feedback fields — Setup Script
 *
 * Adds the schema behind two client-portal feedback features:
 *
 *   1. CSAT (client satisfaction) on delivered work. Clients rate a resolved
 *      ticket / completed project 1–5 with an optional note. Written by the
 *      scope-checked server endpoint POST /api/portal/csat (admin token), so
 *      NO portal write-perm is needed; read rides the existing `fields:['*']`
 *      read perms on both Client + Client Manager policies.
 *        tickets.csat_rating        integer 1–5, nullable
 *        tickets.csat_comment       text, nullable
 *        tickets.csat_submitted_at  timestamp, nullable
 *        projects.<same three>
 *
 *   2. Request-changes feedback on a content-plan post. When a client clicks
 *      "Request Changes" they can say WHAT to change; the note lands here and
 *      surfaces to staff on the post.
 *        social_posts.client_feedback  text, nullable
 *
 * Usage:
 *   pnpm tsx scripts/setup-portal-feedback-fields.ts            # dry-run
 *   pnpm tsx scripts/setup-portal-feedback-fields.ts --apply    # mutate
 * Then:
 *   pnpm generate:types
 *
 * Idempotent: field create skips on 409 / already-exists.
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
const APPLY = process.argv.includes('--apply');

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN is required');
	process.exit(1);
}

async function directusRequest(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<{ error: string | null }> {
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
			if (response.status === 409) return { error: 'already_exists' };
			if (response.status === 400 && /already exists/i.test(text)) return { error: 'already_exists' };
			return { error: `${response.status}: ${text}` };
		}
		return { error: null };
	} catch (err: any) {
		return { error: err.message };
	}
}

async function createField(collection: string, field: Record<string, any>) {
	if (!APPLY) {
		console.log(`  [dry-run] would create ${collection}.${field.field}`);
		return true;
	}
	console.log(`  Creating field: ${collection}.${field.field}`);
	const { error } = await directusRequest(`/fields/${collection}`, 'POST', field);
	if (error === 'already_exists') {
		console.log(`    -> Already exists, skipping`);
		return true;
	}
	if (error) {
		console.error(`    -> Error: ${error}`);
		return false;
	}
	console.log(`    -> Created`);
	return true;
}

const csatRating = {
	field: 'csat_rating',
	type: 'integer',
	meta: {
		interface: 'select-radio',
		display: 'raw',
		options: { choices: [1, 2, 3, 4, 5].map((n) => ({ text: `${n}★`, value: n })) },
		note: 'Client satisfaction rating (1–5) submitted from the portal when the work was delivered. Written by /api/portal/csat.',
		width: 'half',
		readonly: true,
	},
	schema: { is_nullable: true },
};

const csatComment = {
	field: 'csat_comment',
	type: 'text',
	meta: {
		interface: 'input-multiline',
		note: 'Optional free-text the client left with their CSAT rating.',
		width: 'full',
		readonly: true,
	},
	schema: { is_nullable: true },
};

const csatSubmittedAt = {
	field: 'csat_submitted_at',
	type: 'timestamp',
	meta: {
		interface: 'datetime',
		display: 'datetime',
		display_options: { relative: true },
		note: 'When the client submitted their CSAT rating. Null = not yet rated.',
		width: 'half',
		readonly: true,
	},
	schema: { is_nullable: true },
};

async function main() {
	console.log('==========================================');
	console.log('  Portal feedback fields — Setup');
	console.log(`  mode: ${APPLY ? 'APPLY' : 'dry-run'}`);
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	for (const collection of ['tickets', 'projects']) {
		await createField(collection, csatRating);
		await createField(collection, csatComment);
		await createField(collection, csatSubmittedAt);
	}

	await createField('social_posts', {
		field: 'client_feedback',
		type: 'text',
		meta: {
			interface: 'input-multiline',
			note: 'Feedback the client left when requesting changes on this post from the portal review.',
			width: 'full',
		},
		schema: { is_nullable: true },
	});

	console.log('');
	console.log('Done.', APPLY ? 'Next: pnpm generate:types' : 'Dry-run — pass --apply to commit.');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
