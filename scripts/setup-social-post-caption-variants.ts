#!/usr/bin/env npx tsx
/**
 * Directus social_posts.caption_variants field — Setup Script
 *
 * Adds a single nullable JSON field that holds per-platform caption forks
 * for the Composition Canvas master-variant composer (P2 of the redesign).
 *
 * Shape:
 *   caption_variants: Partial<Record<SocialPlatform, string>> | null
 *
 *   null  = every channel publishes the master `caption` (in-sync).
 *   {…}   = any present key forks that platform's variant; absent keys
 *           still inherit master. Empty string in a key explicitly forks
 *           to "post nothing for this channel" (rare — UI shows a warning).
 *
 * Why JSON not five columns: only ~5 platforms today and the publish path
 * is the only reader. A JSON blob keeps the schema flat and the per-row
 * cost near zero for the common case (null).
 *
 * Run once:
 *
 *   pnpm tsx scripts/setup-social-post-caption-variants.ts
 *
 * Then regenerate types:
 *
 *   pnpm generate:types
 *
 * Idempotent: re-running is safe, field create skips on 409.
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

async function setupField() {
	console.log('\n=== social_posts.caption_variants ===');

	await createField('social_posts', {
		field: 'caption_variants',
		type: 'json',
		meta: {
			special: ['cast-json'],
			interface: 'input-code',
			width: 'full',
			options: { language: 'JSON', lineNumber: true },
			note: 'Per-platform caption forks. null = all channels publish the master caption. Shape: { instagram?: string, linkedin?: string, facebook?: string, threads?: string, tiktok?: string }.',
			hidden: false,
		},
		schema: { is_nullable: true },
	});
}

async function main() {
	console.log('==========================================');
	console.log('  social_posts caption_variants — Setup');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);
	console.log('');

	await setupField();

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
