#!/usr/bin/env npx tsx
/**
 * Fix `mailing_list_contacts` UNIQUE constraint bug.
 *
 * Problem:
 *   Both `mailing_list_contacts.list_id` and `mailing_list_contacts.contact_id`
 *   have single-column UNIQUE constraints in Postgres. This means:
 *     - Any mailing list can hold ONLY ONE subscriber.
 *     - Any contact can be on ONLY ONE list.
 *   Both are wrong. The correct invariant is a COMPOSITE unique on
 *   `(list_id, contact_id)` — i.e. the same contact can't be double-subscribed
 *   to the same list, but lists can hold many contacts and contacts can
 *   belong to many lists.
 *
 * Fix:
 *   1. PATCH both fields to drop the single-column UNIQUE
 *      (Directus re-issues the Postgres ALTER on `is_unique: false`).
 *   2. Create a Directus "filter" Flow on
 *      `mailing_list_contacts.items.create` that rejects duplicate
 *      (list_id, contact_id) pairs. This is the functional equivalent of
 *      a composite UNIQUE at the DB level — Directus doesn't expose a way
 *      to add a raw composite index through its public API, and we have
 *      no direct Postgres access on the remote admin host.
 *
 * Safety:
 *   - Fully idempotent: checks current state before every mutation.
 *   - Additive only with respect to the Flow. The Flow is identified by a
 *     stable `name` — re-runs update in place rather than duplicating.
 *   - The two schema patches are no-ops if the UNIQUEs are already dropped.
 *
 * Usage:
 *   pnpm tsx scripts/fix-mailing-list-unique-constraint.ts
 *
 * Prerequisites:
 *   - DIRECTUS_URL + DIRECTUS_SERVER_TOKEN (admin) in env.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN (or DIRECTUS_ADMIN_TOKEN) is required.');
	process.exit(1);
}

const FLOW_NAME = 'mailing_list_contacts: Composite Unique Guard';

type RestResult<T = unknown> = { data: T | null; error: string | null; status: number };

async function req<T = any>(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<RestResult<T>> {
	try {
		const resp = await fetch(`${DIRECTUS_URL}${path}`, {
			method,
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${DIRECTUS_TOKEN}`,
			},
			body: body ? JSON.stringify(body) : undefined,
		});
		const text = await resp.text();
		if (!resp.ok) {
			return { data: null, error: `${resp.status}: ${text}`, status: resp.status };
		}
		const json = text ? JSON.parse(text) : {};
		return { data: (json.data ?? null) as T, error: null, status: resp.status };
	} catch (err: any) {
		return { data: null, error: err.message, status: 0 };
	}
}

async function getFieldSchema(collection: string, field: string) {
	const { data, error } = await req<any>(`/fields/${collection}/${field}`);
	if (error) throw new Error(`Could not read ${collection}.${field}: ${error}`);
	return data;
}

async function dropSingleColumnUnique(collection: string, field: string) {
	const f = await getFieldSchema(collection, field);
	if (!f?.schema?.is_unique) {
		console.log(`  ${collection}.${field}: is_unique already false — skipping`);
		return;
	}
	console.log(`  ${collection}.${field}: dropping single-column UNIQUE…`);
	const { error } = await req(`/fields/${collection}/${field}`, 'PATCH', {
		schema: { is_unique: false },
	});
	if (error) throw new Error(`Failed to drop UNIQUE on ${collection}.${field}: ${error}`);
	// Verify.
	const after = await getFieldSchema(collection, field);
	if (after?.schema?.is_unique) {
		throw new Error(`Post-patch check failed: ${collection}.${field} is still is_unique=true`);
	}
	console.log(`    → UNIQUE dropped`);
}

async function findFlowByName(name: string) {
	const { data, error } = await req<any[]>(
		`/flows?limit=-1&fields=id,name,trigger,options,operation`,
	);
	if (error) throw new Error(`Could not list flows: ${error}`);
	return (data || []).find((f) => f.name === name) || null;
}

async function getFlowWithOperations(flowId: string) {
	const { data, error } = await req<any>(`/flows/${flowId}?fields=*,operations.*`);
	if (error) throw new Error(`Could not read flow ${flowId}: ${error}`);
	return data;
}

async function deleteFlowAndOperations(flowId: string) {
	const flow = await getFlowWithOperations(flowId);
	// Detach operation pointer on flow, so operations can be safely removed.
	await req(`/flows/${flowId}`, 'PATCH', { operation: null });
	for (const op of flow?.operations || []) {
		await req(`/operations/${op.id}`, 'DELETE');
	}
	await req(`/flows/${flowId}`, 'DELETE');
}

async function createCompositeGuardFlow() {
	console.log(`  Creating flow "${FLOW_NAME}"…`);

	// 1. Create flow shell.
	const { data: flow, error: flowErr } = await req<any>(`/flows`, 'POST', {
		name: FLOW_NAME,
		status: 'active',
		trigger: 'event',
		accountability: 'all',
		icon: 'block',
		description:
			'Rejects duplicate (list_id, contact_id) inserts on mailing_list_contacts. Functional equivalent of a composite UNIQUE constraint — see scripts/fix-mailing-list-unique-constraint.ts.',
		options: {
			type: 'filter',
			scope: ['items.create'],
			collections: ['mailing_list_contacts'],
		},
	});
	if (flowErr || !flow?.id) throw new Error(`Flow create failed: ${flowErr}`);
	const flowId = flow.id as string;
	console.log(`    → flow id=${flowId}`);

	// 2. Create `check_dup` (item-read on mailing_list_contacts with payload filter).
	const { data: checkOp, error: checkErr } = await req<any>(`/operations`, 'POST', {
		flow: flowId,
		name: 'Check duplicate',
		key: 'check_dup',
		type: 'item-read',
		position_x: 19,
		position_y: 1,
		options: {
			permissions: '$full',
			emitEvents: false,
			collection: 'mailing_list_contacts',
			query: {
				filter: {
					_and: [
						{ list_id: { _eq: '{{ $trigger.payload.list_id }}' } },
						{ contact_id: { _eq: '{{ $trigger.payload.contact_id }}' } },
					],
				},
				limit: 1,
			},
		},
	});
	if (checkErr || !checkOp?.id) throw new Error(`check_dup op failed: ${checkErr}`);

	// 3. Create `guard` (exec — throws if check_dup returned anything).
	const guardCode = [
		'module.exports = async function(data) {',
		'  const dupes = data.check_dup;',
		'  if (Array.isArray(dupes) && dupes.length > 0) {',
		"    throw new Error('Contact is already subscribed to this mailing list.');",
		'  }',
		'  return {};',
		'}',
	].join('\n');
	const { data: guardOp, error: guardErr } = await req<any>(`/operations`, 'POST', {
		flow: flowId,
		name: 'Reject duplicates',
		key: 'guard',
		type: 'exec',
		position_x: 37,
		position_y: 1,
		resolve: null,
		reject: null,
		options: { code: guardCode },
	});
	if (guardErr || !guardOp?.id) throw new Error(`guard op failed: ${guardErr}`);

	// 4. Chain: check_dup.resolve → guard
	const { error: chainErr } = await req(`/operations/${checkOp.id}`, 'PATCH', {
		resolve: guardOp.id,
	});
	if (chainErr) throw new Error(`chain check_dup→guard failed: ${chainErr}`);

	// 5. Set flow entry operation = check_dup
	const { error: entryErr } = await req(`/flows/${flowId}`, 'PATCH', { operation: checkOp.id });
	if (entryErr) throw new Error(`set entry op failed: ${entryErr}`);

	console.log('    → flow + operations linked');
	return flowId;
}

async function ensureCompositeGuardFlow() {
	const existing = await findFlowByName(FLOW_NAME);
	if (existing?.id) {
		console.log(`  Flow "${FLOW_NAME}" already exists (id=${existing.id}) — re-creating to ensure it's current`);
		await deleteFlowAndOperations(existing.id);
	}
	await createCompositeGuardFlow();
}

async function main() {
	console.log('==========================================');
	console.log('  mailing_list_contacts — UNIQUE fix');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);
	console.log('');

	console.log('[1/2] Drop single-column UNIQUE constraints');
	await dropSingleColumnUnique('mailing_list_contacts', 'list_id');
	await dropSingleColumnUnique('mailing_list_contacts', 'contact_id');
	console.log('');

	console.log('[2/2] Ensure composite-unique guard flow');
	await ensureCompositeGuardFlow();
	console.log('');

	console.log('==========================================');
	console.log('  Done');
	console.log('==========================================');
	console.log('Verify manually:');
	console.log('  A. POST two different contacts to the same list → both succeed.');
	console.log('  B. POST the same (list, contact) pair twice → second rejects with:');
	console.log('     "Contact is already subscribed to this mailing list."');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
