#!/usr/bin/env npx tsx
/**
 * Directus contact_connections Collection — Setup Script
 *
 * Creates the contact_connections collection + fields + two m2o relations
 * + two inverse o2m aliases. Represents a connector/partner relationship
 * between a Contact (typically category='partner') and a Client.
 *
 * Why this collection exists:
 *   `Contact.client` single-FK already models "where they work" (employment).
 *   A referral partner / vendor / board member / investor / consultant
 *   legitimately connects to *multiple* clients without being employed by
 *   any of them. `contact_connections` records those cross-client links
 *   without promoting the employment FK to an M2M that 95% of contacts
 *   wouldn't use.
 *
 * Schema:
 *   - id (auto-increment int)
 *   - contact      -> contacts (m2o, required, CASCADE)
 *   - client       -> clients  (m2o, required, CASCADE)
 *   - role         enum: referral_partner | vendor | board | consultant | investor | other
 *   - introduced_by enum (nullable): partner | us
 *   - notes        text (nullable)
 *   - sort, date_created, user_created (audit)
 *
 * Inverse aliases:
 *   - contacts.connections (o2m, reverse of contact_connections.contact)
 *   - clients.partner_connections (o2m, reverse of contact_connections.client)
 *
 * Safety:
 *   - Idempotent: re-running is safe; creates skip on 409 / already-exists.
 *   - Additive only: no existing columns, data, or relations are touched.
 *
 * Usage:
 *   pnpm tsx scripts/setup-contact-connections-collection.ts
 *
 * After running, apply permissions:
 *   pnpm tsx scripts/setup-contact-connections-permissions.ts --apply
 *
 * Prerequisites:
 *   - Directus instance running with `contacts` + `clients` collections
 *   - DIRECTUS_SERVER_TOKEN env var set (admin-level)
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
): Promise<{ data: T | null; error: string | null; status: number }> {
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
			if (response.status === 409) return { data: null, error: 'already_exists', status: response.status };
			if (response.status === 400 && /already exists|already has an associated/i.test(text)) {
				return { data: null, error: 'already_exists', status: response.status };
			}
			return { data: null, error: `${response.status}: ${text}`, status: response.status };
		}

		const json = text ? JSON.parse(text) : {};
		return { data: (json.data ?? null) as T, error: null, status: response.status };
	} catch (err: any) {
		return { data: null, error: err.message, status: 0 };
	}
}

async function createCollection(collection: string, meta: Record<string, any>) {
	console.log(`  Creating collection: ${collection}`);
	const { error } = await directusRequest('/collections', 'POST', { collection, meta, schema: {} });
	if (error === 'already_exists') { console.log(`    -> Already exists, skipping`); return true; }
	if (error) { console.error(`    -> Error: ${error}`); return false; }
	console.log(`    -> Created`);
	return true;
}

async function createField(collection: string, field: Record<string, any>) {
	console.log(`  Creating field: ${collection}.${field.field}`);
	const { error } = await directusRequest(`/fields/${collection}`, 'POST', field);
	if (error === 'already_exists' || error?.includes('already exists')) { console.log(`    -> Already exists, skipping`); return true; }
	if (error) { console.error(`    -> Error: ${error}`); return false; }
	console.log(`    -> Created`);
	return true;
}

async function createRelation(data: Record<string, any>) {
	const label = `${data.collection}.${data.field} -> ${data.related_collection}` +
		(data.meta?.one_field ? ` (o2m alias: ${data.related_collection}.${data.meta.one_field})` : '');
	console.log(`  Creating relation: ${label}`);
	const { error } = await directusRequest('/relations', 'POST', data);
	if (error === 'already_exists') { console.log(`    -> Already exists, skipping`); return true; }
	if (error) { console.error(`    -> Error: ${error}`); return false; }
	console.log(`    -> Created`);
	return true;
}

async function fieldExists(collection: string, field: string): Promise<boolean> {
	const { status } = await directusRequest(`/fields/${collection}/${field}`);
	return status === 200;
}

async function relationHasAlias(childCollection: string, childFkField: string, aliasField: string): Promise<boolean> {
	const { data } = await directusRequest<any[]>('/relations?limit=-1');
	if (!data) return false;
	const rel = data.find((r) => r.collection === childCollection && r.field === childFkField);
	return !!rel && rel.meta?.one_field === aliasField;
}

async function ensureInverseAlias(
	parentCollection: string,
	aliasField: string,
	childCollection: string,
	childFkField: string,
	note: string,
) {
	// 1. Alias field on parent
	if (!(await fieldExists(parentCollection, aliasField))) {
		console.log(`  Creating alias field: ${parentCollection}.${aliasField}`);
		const { error } = await directusRequest(`/fields/${parentCollection}`, 'POST', {
			collection: parentCollection,
			field: aliasField,
			type: 'alias',
			meta: {
				interface: 'list-o2m',
				special: ['o2m'],
				note,
			},
			schema: null,
		});
		if (error && error !== 'already_exists' && !error.includes('already exists')) {
			console.error(`    -> Error: ${error}`);
			return false;
		}
		console.log(`    -> Created`);
	} else {
		console.log(`  Alias field ${parentCollection}.${aliasField} already exists — skipping`);
	}

	// 2. Relation meta.one_field binding
	if (!(await relationHasAlias(childCollection, childFkField, aliasField))) {
		const patchPath = `/relations/${childCollection}/${childFkField}`;
		console.log(`  PATCH ${patchPath} — set meta.one_field = "${aliasField}"`);
		const { data: relData } = await directusRequest<any[]>('/relations?limit=-1');
		const existingMeta = relData?.find((r) => r.collection === childCollection && r.field === childFkField)?.meta ?? {};
		const { error } = await directusRequest(patchPath, 'PATCH', {
			meta: { ...existingMeta, one_field: aliasField },
		});
		if (error) {
			console.error(`    -> Error: ${error}`);
			return false;
		}
		console.log(`    -> Patched`);
	} else {
		console.log(`  Relation ${childCollection}.${childFkField} already exposes ${aliasField} — skipping`);
	}

	return true;
}

// ─── Schema Definition ────────────────────────────────────────────────────────

async function setupContactConnections() {
	console.log('\n=== contact_connections ===');

	await createCollection('contact_connections', {
		icon: 'hub',
		note: 'Cross-client relationships for partners/connectors. Contact.client still represents employment; this surfaces non-employment links.',
		color: '#8B5CF6',
		hidden: false,
		singleton: false,
		accountability: 'all',
		sort_field: 'sort',
		display_template: '{{contact.first_name}} {{contact.last_name}} — {{client.name}} ({{role}})',
	});

	await createField('contact_connections', {
		field: 'id',
		type: 'integer',
		meta: { interface: 'input', readonly: true, hidden: true },
		schema: { is_primary_key: true, has_auto_increment: true },
	});

	await createField('contact_connections', {
		field: 'sort',
		type: 'integer',
		meta: { interface: 'input', hidden: true },
		schema: {},
	});

	await createField('contact_connections', {
		field: 'date_created',
		type: 'timestamp',
		meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createField('contact_connections', {
		field: 'user_created',
		type: 'uuid',
		meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createField('contact_connections', {
		field: 'contact',
		type: 'uuid',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			required: true,
			options: { template: '{{first_name}} {{last_name}} — {{email}}' },
			note: 'The connector (usually category=partner)',
		},
		schema: { is_nullable: false },
	});

	await createField('contact_connections', {
		field: 'client',
		type: 'uuid',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			required: true,
			options: { template: '{{name}}' },
			note: 'The client this contact has a relationship with (beyond employment)',
		},
		schema: { is_nullable: false },
	});

	await createField('contact_connections', {
		field: 'role',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			required: true,
			options: {
				choices: [
					{ text: 'Referral Partner', value: 'referral_partner' },
					{ text: 'Vendor', value: 'vendor' },
					{ text: 'Board Member', value: 'board' },
					{ text: 'Consultant', value: 'consultant' },
					{ text: 'Investor', value: 'investor' },
					{ text: 'Other', value: 'other' },
				],
			},
			display: 'labels',
			note: 'Nature of the connection',
		},
		schema: { is_nullable: false, default_value: 'referral_partner' },
	});

	await createField('contact_connections', {
		field: 'introduced_by',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			options: {
				allowNone: true,
				choices: [
					{ text: 'Partner introduced us', value: 'partner' },
					{ text: 'We introduced them', value: 'us' },
				],
			},
			display: 'labels',
			note: 'Direction of the introduction (for referral attribution)',
		},
		schema: {},
	});

	await createField('contact_connections', {
		field: 'notes',
		type: 'text',
		meta: { interface: 'input-multiline', note: 'Optional free-form context about the relationship' },
		schema: {},
	});

	// M2O relations
	await createRelation({
		collection: 'contact_connections',
		field: 'contact',
		related_collection: 'contacts',
		schema: { on_delete: 'CASCADE' },
		meta: { sort_field: null },
	});

	await createRelation({
		collection: 'contact_connections',
		field: 'client',
		related_collection: 'clients',
		schema: { on_delete: 'CASCADE' },
		meta: { sort_field: null },
	});

	// Inverse O2M aliases — so /contacts/[id] and /clients/[id] can project connections inline.
	await ensureInverseAlias(
		'contacts',
		'connections',
		'contact_connections',
		'contact',
		'Cross-client connections. Inverse of contact_connections.contact.',
	);

	await ensureInverseAlias(
		'clients',
		'partner_connections',
		'contact_connections',
		'client',
		'Partner/connector relationships pointing at this client. Inverse of contact_connections.client.',
	);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	console.log('==========================================');
	console.log('  contact_connections — Collection Setup');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);
	console.log('');

	await setupContactConnections();

	console.log('');
	console.log('==========================================');
	console.log('  Done');
	console.log('==========================================');
	console.log('Next:');
	console.log('  1. pnpm tsx scripts/setup-contact-connections-permissions.ts --apply');
	console.log('  2. npm run generate:types');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
