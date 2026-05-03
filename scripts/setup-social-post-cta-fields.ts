#!/usr/bin/env npx tsx
/**
 * Directus social_posts.cta_url + cta_label fields — Setup Script
 *
 * Adds two optional text fields so the AI Social Wizard's "call to action"
 * choice persists onto the draft and can be appended into the published
 * caption (and link-unfurled by LinkedIn / Facebook / Threads via OG tags).
 *
 * Run once:
 *
 *   pnpm tsx scripts/setup-social-post-cta-fields.ts
 *
 * Then regenerate types:
 *
 *   pnpm generate:types
 *
 * Idempotent: re-running is safe, field create skips on 409 / already-exists.
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
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
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
			if (response.status === 409) return { data: null, error: 'already_exists' };
			if (response.status === 400 && /already exists/i.test(text)) return { data: null, error: 'already_exists' };
			return { data: null, error: `${response.status}: ${text}` };
		}

		const json = text ? JSON.parse(text) : {};
		return { data: json.data ?? null, error: null };
	} catch (err: any) {
		return { data: null, error: err.message };
	}
}

async function createField(collection: string, field: Record<string, any>) {
	console.log(`  Creating field: ${collection}.${field.field}`);
	const { error } = await directusRequest(`/fields/${collection}`, 'POST', field);
	if (error === 'already_exists' || error?.includes('already exists')) {
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

async function setupCtaFields() {
	console.log('\n=== social_posts.cta_url + cta_label ===');

	await createField('social_posts', {
		field: 'cta_url',
		type: 'string',
		meta: {
			interface: 'input',
			width: 'full',
			note: 'Optional URL appended to the caption at publish time. LinkedIn / Facebook / Threads will fetch OG tags and render a link card.',
			options: { placeholder: 'https://example.com/landing-page' },
		},
		schema: { is_nullable: true, max_length: 500 },
	});

	await createField('social_posts', {
		field: 'cta_label',
		type: 'string',
		meta: {
			interface: 'input',
			width: 'half',
			note: 'Short call-to-action label rendered alongside the URL (e.g. "Visit Website", "Book a Call").',
			options: { placeholder: 'Visit Website' },
		},
		schema: { is_nullable: true, max_length: 80 },
	});
}

async function main() {
	console.log('==========================================');
	console.log('  social_posts CTA fields — Setup');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);
	console.log('');

	await setupCtaFields();

	console.log('');
	console.log('==========================================');
	console.log('  Done');
	console.log('==========================================');
	console.log('Next: pnpm generate:types');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
