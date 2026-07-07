#!/usr/bin/env npx tsx
/**
 * Directus `ai_actions` Collection — Setup Script
 *
 * Backs the Earnest AI human-in-the-loop (HITL) action layer + audit log.
 * Every action Earnest AI proposes (generate a proposal/contract, draft an
 * email, create tasks, …) is persisted here as a row the user reviews. The
 * same row is the permanent audit trail once approved/executed.
 *
 * Lifecycle (status):
 *   pending   — AI proposed it; awaiting user review
 *   approved  — user approved; about to execute
 *   rejected  — user declined; never executed
 *   executed  — the real mutation ran (result holds created ids etc.)
 *   failed    — execution attempted and errored (error holds the message)
 *
 * Safe/non-outbound actions (e.g. creating a DRAFT document) may be written
 * straight to `executed` — the draft itself is the reviewable artifact and
 * nothing leaves the system until the user finalises/sends it. Outbound or
 * destructive actions (send email, publish) MUST start `pending`.
 *
 * Modeled on scripts/setup-contact-connections-collection.ts (helpers copied
 * verbatim) and the ai_usage_logs field conventions.
 *
 * Usage:
 *   pnpm tsx scripts/setup-ai-actions-collection.ts
 *   # then: pnpm tsx scripts/setup-ai-actions-permissions.ts --apply
 *   # then: npm run generate:types
 *
 * Prerequisites:
 *   - Directus running with `organizations` collection
 *   - DIRECTUS_SERVER_TOKEN (admin) env var set
 *
 * NOTE: Directus auto-mode can block schema pushes; if so, run this manually
 * against the target Directus with an admin token (same pattern as the other
 * setup-*-collection.ts scripts). This does nothing until it is actually run.
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
	console.log(`  Creating relation: ${data.collection}.${data.field} -> ${data.related_collection}`);
	const { error } = await directusRequest('/relations', 'POST', data);
	if (error === 'already_exists') { console.log(`    -> Already exists, skipping`); return true; }
	if (error) { console.error(`    -> Error: ${error}`); return false; }
	console.log(`    -> Created`);
	return true;
}

async function setupAiActions() {
	console.log('\n=== ai_actions ===');

	await createCollection('ai_actions', {
		icon: 'smart_toy',
		note: 'Earnest AI proposed actions (HITL review queue) + permanent audit log.',
		color: '#6366F1',
		hidden: false,
		singleton: false,
		accountability: 'all',
		archive_field: 'status',
		archive_value: 'rejected',
		display_template: '{{action_type}} — {{status}} ({{title}})',
	});

	// ── Ownership / scoping ──────────────────────────────────────────────────
	await createField('ai_actions', {
		field: 'organization',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{name}}' }, note: 'Owning organization.' },
		schema: { is_nullable: true },
	});
	await createField('ai_actions', {
		field: 'user',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{first_name}} {{last_name}}' }, note: 'User who triggered the AI action.' },
		schema: { is_nullable: true },
	});

	// ── What & lifecycle ─────────────────────────────────────────────────────
	await createField('ai_actions', {
		field: 'action_type',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			required: true,
			options: {
				allowOther: true,
				choices: [
					{ text: 'Generate documents (proposal/contract)', value: 'generate_documents' },
					{ text: 'Draft email', value: 'draft_email' },
					{ text: 'Send email', value: 'send_email' },
					{ text: 'Create tasks', value: 'create_tasks' },
					{ text: 'Create project', value: 'create_project' },
					{ text: 'Add events', value: 'add_event' },
					{ text: 'Create invoice', value: 'create_invoice' },
					{ text: 'Update field', value: 'update_field' },
					{ text: 'Other', value: 'other' },
				],
			},
			note: 'The kind of action proposed. Free values allowed as the tool set grows.',
		},
		schema: { is_nullable: false },
	});
	await createField('ai_actions', {
		field: 'status',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			required: true,
			display: 'labels',
			options: {
				choices: [
					{ text: 'Pending review', value: 'pending' },
					{ text: 'Approved', value: 'approved' },
					{ text: 'Rejected', value: 'rejected' },
					{ text: 'Executed', value: 'executed' },
					{ text: 'Failed', value: 'failed' },
				],
			},
			note: 'HITL lifecycle. Outbound/destructive actions start pending; safe draft-creation may start executed.',
		},
		schema: { is_nullable: false, default_value: 'pending' },
	});
	await createField('ai_actions', {
		field: 'title',
		type: 'string',
		meta: { interface: 'input', note: 'Human-readable one-line summary of the proposed action.' },
		schema: { is_nullable: true },
	});

	// ── Payload / preview / result ───────────────────────────────────────────
	await createField('ai_actions', {
		field: 'payload',
		type: 'json',
		meta: { interface: 'input-code', options: { language: 'json' }, note: 'The action parameters (tool input).' },
		schema: {},
	});
	await createField('ai_actions', {
		field: 'preview',
		type: 'json',
		meta: { interface: 'input-code', options: { language: 'json' }, note: 'Optional preview of what will happen on approval.' },
		schema: {},
	});
	await createField('ai_actions', {
		field: 'result',
		type: 'json',
		meta: { interface: 'input-code', options: { language: 'json' }, note: 'Execution result (created ids, etc.).' },
		schema: {},
	});
	await createField('ai_actions', {
		field: 'error',
		type: 'text',
		meta: { interface: 'input-multiline', note: 'Error message when status=failed.' },
		schema: { is_nullable: true },
	});

	// ── Related entity (optional) ────────────────────────────────────────────
	await createField('ai_actions', {
		field: 'entity_type',
		type: 'string',
		meta: { interface: 'input', note: 'Optional related collection (e.g. "leads", "projects").' },
		schema: { is_nullable: true },
	});
	await createField('ai_actions', {
		field: 'entity_id',
		type: 'string',
		meta: { interface: 'input', note: 'Optional related record id.' },
		schema: { is_nullable: true },
	});
	await createField('ai_actions', {
		field: 'session_id',
		type: 'string',
		meta: { interface: 'input', note: 'Optional ai_chat_sessions id that produced this action.' },
		schema: { is_nullable: true },
	});

	// ── Approval audit ───────────────────────────────────────────────────────
	await createField('ai_actions', {
		field: 'approved_by',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{first_name}} {{last_name}}' }, note: 'User who approved/rejected.' },
		schema: { is_nullable: true },
	});
	await createField('ai_actions', {
		field: 'approved_at',
		type: 'timestamp',
		meta: { interface: 'datetime', note: 'When approved/rejected.' },
		schema: { is_nullable: true },
	});
	await createField('ai_actions', {
		field: 'executed_at',
		type: 'timestamp',
		meta: { interface: 'datetime', note: 'When the action executed.' },
		schema: { is_nullable: true },
	});

	// ── System timestamps ────────────────────────────────────────────────────
	await createField('ai_actions', {
		field: 'date_created',
		type: 'timestamp',
		meta: { interface: 'datetime', special: ['date-created'], readonly: true, hidden: true, width: 'half' },
		schema: {},
	});
	await createField('ai_actions', {
		field: 'date_updated',
		type: 'timestamp',
		meta: { interface: 'datetime', special: ['date-updated'], readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	// ── Relations ──────────────────────────────────────────────────────────────
	await createRelation({
		collection: 'ai_actions',
		field: 'organization',
		related_collection: 'organizations',
		schema: { on_delete: 'SET NULL' },
		meta: { sort_field: null },
	});
	await createRelation({
		collection: 'ai_actions',
		field: 'user',
		related_collection: 'directus_users',
		schema: { on_delete: 'SET NULL' },
		meta: { sort_field: null },
	});
	await createRelation({
		collection: 'ai_actions',
		field: 'approved_by',
		related_collection: 'directus_users',
		schema: { on_delete: 'SET NULL' },
		meta: { sort_field: null },
	});
}

async function main() {
	console.log('==========================================');
	console.log('  ai_actions — Collection Setup');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	await setupAiActions();

	console.log('');
	console.log('==========================================');
	console.log('  Done');
	console.log('==========================================');
	console.log('Next:');
	console.log('  1. pnpm tsx scripts/setup-ai-actions-permissions.ts --apply');
	console.log('  2. npm run generate:types');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
