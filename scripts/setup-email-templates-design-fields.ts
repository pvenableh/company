#!/usr/bin/env npx tsx
/**
 * email_templates design fields — Setup Script
 *
 * Adds the per-template design knobs the Newsletter Block Builder exposes
 * in its "Email Settings" drawer. These previously lived as hardcoded
 * values inside useTemplateBuilder.assembleMjml() (font Arial 15px on a
 * #f4f4f4 body), so every template baked the same look — users had no way
 * to change body background, font family, font size, text color, or even
 * the email subject from the builder UI.
 *
 * New fields:
 *   - subject_template — already existed; we don't touch it here.
 *   - design_settings  — JSON blob: { body_background, font_family,
 *     font_size, text_color }. Nullable; missing keys fall back to the
 *     historical defaults at compile time.
 *
 * Run once:
 *   pnpm tsx scripts/setup-email-templates-design-fields.ts
 * Then:
 *   pnpm generate:types
 *
 * Idempotent: field create skips on 409 / already-exists.
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

async function main() {
	console.log('==========================================');
	console.log('  email_templates.design_settings — Field Setup');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	await createField('email_templates', {
		field: 'design_settings',
		type: 'json',
		meta: {
			interface: 'input-code',
			display: 'raw',
			note: 'Per-template design tokens used by the block builder. Shape: { body_background, font_family, font_size, text_color }. Null fields fall back to defaults at MJML compile time.',
			options: { language: 'JSON' },
			width: 'full',
			special: ['cast-json'],
		},
		schema: { is_nullable: true },
	});

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
