#!/usr/bin/env npx tsx
/**
 * Directus organizations.email_reply_to — Setup Script
 *
 * Adds the single per-org override that Stage 1 of the branded email
 * shell needs: the address recipients hit when they reply to an
 * org-branded transactional email. Empty → fall back to the global
 * SENDGRID_REPLY_TO_EMAIL.
 *
 * From-address stays global (`hello@earnest.guru`) — Stage 4 is when
 * per-org sending domains land. This is the lighter visible knob until
 * then.
 *
 * Run once:
 *   pnpm tsx scripts/setup-organizations-email-reply-to-field.ts
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
	console.log('  organizations.email_reply_to — Field Setup');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	await createField('organizations', {
		field: 'email_reply_to',
		type: 'string',
		meta: {
			interface: 'input',
			display: 'raw',
			note: 'Address recipients hit when they reply to an org-branded transactional email (notifications, meeting/video invites). Empty falls back to the global Earnest reply-to.',
			options: { placeholder: 'team@yourdomain.com' },
			width: 'half',
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
