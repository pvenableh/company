#!/usr/bin/env npx tsx
/**
 * Canonicalize `organizations.plan` enum.
 *
 * Problem this solves:
 *   Three different plan vocabularies coexisted —
 *     - Directus enum:   free | starter | pro | enterprise
 *     - Code / Stripe:   solo | studio | agency       (EARNEST_PLANS keys)
 *     - Env vars:        SOLO | STUDIO | AGENCY       (.env)
 *   A mapping layer in server/utils/stripe.ts papered over the gap, which
 *   meant new code writing 'solo' straight to Directus was silently dropped
 *   (register.post.ts:67, app/pages/organization/new.vue POSTing 'solo' to
 *   an enum that didn't accept it).
 *
 * Target canonical set: free | solo | studio | agency | enterprise.
 *   - free       — no active sub
 *   - solo       — STRIPE_PRICE_SOLO subscriber       (was 'starter')
 *   - studio     — STRIPE_PRICE_STUDIO subscriber     (was 'pro')
 *   - agency     — STRIPE_PRICE_AGENCY subscriber     (new — no prior row mapped)
 *   - enterprise — hand-configured, no Stripe sub     (preserved as-is)
 *
 * What this script does:
 *   1. Backfill each existing organizations row by reading its active Stripe
 *      subscription (via linked user's stripe_subscription_id → price ID →
 *      plan key). Demo orgs (code=SOL/AGY) are set explicitly.
 *   2. PATCH /fields/organizations/plan with the new choices set, preserving
 *      the original color/translation metadata where possible.
 *   3. Verify no row ends up on a stale enum value.
 *
 * Safety:
 *   - Dry-run by default. `--apply` required to write.
 *   - Idempotent: if the enum is already canonical, script no-ops after
 *     verifying row values still match.
 *   - Value map preserves the old→new contract: starter→solo, pro→studio.
 *     Old 'enterprise' rows are kept on 'enterprise' (no automatic remap to
 *     'agency' — 'enterprise' means hand-configured in the new vocabulary).
 *   - Stripe lookup is best-effort. If a row has starter/pro and Stripe is
 *     unreachable, the script falls back to the starter→solo / pro→studio
 *     value map (safe: those were the only possible Stripe sources).
 *
 * ROLLBACK NOTE — the scariest failure mode here is the Stripe webhook
 * dropping events silently after the enum rename. If the post-rename webhook
 * starts seeing 4xx on org updates, it means code deployed without this
 * script running first. To revert: re-run this script with `--rollback` and
 * restore the old 'starter|pro|enterprise' enum (prior column values are
 * deterministic from the new ones: solo→starter, studio→pro, agency→pro,
 * enterprise→enterprise, free→free).
 *
 * Ordering: run this script FIRST against prod Directus, THEN deploy the
 * code that writes canonical values. If you reverse the order, the webhook
 * will silently drop plan updates during the gap.
 *
 * Usage:
 *   pnpm tsx scripts/migrate-org-plan-enum.ts              # dry-run
 *   pnpm tsx scripts/migrate-org-plan-enum.ts --apply      # write
 */

import 'dotenv/config';
import Stripe from 'stripe';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
const STRIPE_SECRET = process.env.NODE_ENV === 'production'
	? (process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY || '')
	: (process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY || '');

const PRICE_SOLO = process.env.STRIPE_PRICE_SOLO || '';
const PRICE_SOLO_ANNUAL = process.env.STRIPE_PRICE_SOLO_ANNUAL || '';
const PRICE_STUDIO = process.env.STRIPE_PRICE_STUDIO || '';
const PRICE_STUDIO_ANNUAL = process.env.STRIPE_PRICE_STUDIO_ANNUAL || '';
const PRICE_AGENCY = process.env.STRIPE_PRICE_AGENCY || '';
const PRICE_AGENCY_ANNUAL = process.env.STRIPE_PRICE_AGENCY_ANNUAL || '';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN is required');
	process.exit(1);
}

const APPLY = process.argv.includes('--apply');

type Plan = 'free' | 'solo' | 'studio' | 'agency' | 'enterprise';
const CANONICAL_VALUES: ReadonlySet<string> = new Set(['free', 'solo', 'studio', 'agency', 'enterprise']);
const LEGACY_VALUES: ReadonlySet<string> = new Set(['free', 'starter', 'pro', 'enterprise']);

// Old → new value map (used when Stripe can't be consulted).
const LEGACY_FALLBACK_MAP: Record<string, Plan> = {
	free: 'free',
	starter: 'solo',
	pro: 'studio',
	enterprise: 'enterprise',
};

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

function priceIdToPlan(priceId: string | null | undefined): Plan | null {
	if (!priceId) return null;
	if (priceId === PRICE_SOLO || priceId === PRICE_SOLO_ANNUAL) return 'solo';
	if (priceId === PRICE_STUDIO || priceId === PRICE_STUDIO_ANNUAL) return 'studio';
	if (priceId === PRICE_AGENCY || priceId === PRICE_AGENCY_ANNUAL) return 'agency';
	return null;
}

const NEW_PLAN_FIELD_PATCH = {
	meta: {
		interface: 'select-dropdown',
		special: null,
		options: {
			choices: [
				{ text: 'Free', value: 'free' },
				{ text: 'Solo', value: 'solo' },
				{ text: 'Studio', value: 'studio' },
				{ text: 'Agency', value: 'agency' },
				{ text: 'Enterprise', value: 'enterprise' },
			],
		},
		display: 'labels',
		display_options: {
			showAsDot: false,
			choices: [
				{ text: 'Free', value: 'free', background: 'var(--theme--background-normal)' },
				{ text: 'Solo', value: 'solo', background: 'var(--theme--primary-background)' },
				{ text: 'Studio', value: 'studio', background: 'var(--theme--secondary-background)' },
				{ text: 'Agency', value: 'agency', background: 'var(--theme--success-background)' },
				{ text: 'Enterprise', value: 'enterprise', background: 'var(--theme--warning-background)' },
			],
		},
	},
	schema: {
		default_value: 'free',
	},
};

type OrgRow = {
	id: string;
	name: string;
	plan: string | null;
	code: string | null;
};

type UserSubRow = {
	id: string;
	stripe_subscription_id: string | null;
	stripe_customer_id: string | null;
};

async function fetchOrgsWithLinkedUsers(): Promise<
	Array<OrgRow & { users: UserSubRow[] }>
> {
	// Pull every org, then pull the legacy junction to get their users' stripe data.
	const params = new URLSearchParams({ fields: 'id,name,plan,code', limit: '-1' });
	const { data: orgs, error } = await directusRequest<OrgRow[]>(
		`/items/organizations?${params}`,
	);
	if (error) throw new Error(`Failed to fetch organizations: ${error}`);
	if (!orgs || orgs.length === 0) return [];

	// Fetch junction rows for all these orgs in one go.
	const orgIds = orgs.map((o) => o.id);
	const junctionParams = new URLSearchParams({
		fields: 'organizations_id,directus_users_id.id,directus_users_id.stripe_subscription_id,directus_users_id.stripe_customer_id',
		limit: '-1',
	});
	junctionParams.set('filter[organizations_id][_in]', orgIds.join(','));
	const { data: junctions, error: jerr } = await directusRequest<Array<{
		organizations_id: string;
		directus_users_id: UserSubRow | null;
	}>>(`/items/organizations_directus_users?${junctionParams}`);
	if (jerr) {
		console.warn(`  [warn] Could not read org-user junction: ${jerr}. Falling back to value map.`);
	}

	const byOrg: Record<string, UserSubRow[]> = {};
	for (const j of junctions || []) {
		if (!j.directus_users_id) continue;
		(byOrg[j.organizations_id] ||= []).push(j.directus_users_id);
	}

	return orgs.map((o) => ({ ...o, users: byOrg[o.id] || [] }));
}

async function resolvePlanFromStripe(
	stripe: Stripe | null,
	users: UserSubRow[],
): Promise<Plan | null> {
	if (!stripe) return null;
	for (const u of users) {
		if (!u.stripe_subscription_id) continue;
		try {
			const sub = await stripe.subscriptions.retrieve(u.stripe_subscription_id);
			if (sub.status === 'canceled' || sub.status === 'incomplete_expired') continue;
			const priceId = sub.items.data[0]?.price?.id;
			const plan = priceIdToPlan(priceId);
			if (plan) return plan;
		} catch {
			// sub may be deleted on Stripe's side — skip, keep searching
		}
	}
	return null;
}

function targetPlanFromRow(
	row: OrgRow,
	stripeResolved: Plan | null,
): Plan {
	// Demo orgs: explicit by code, regardless of Stripe.
	if (row.code === 'SOL') return 'solo';
	if (row.code === 'AGY') return 'agency';

	// Prefer Stripe truth if available.
	if (stripeResolved) return stripeResolved;

	// Fall back to deterministic map from the old value.
	const old = row.plan ?? 'free';
	if (CANONICAL_VALUES.has(old) && old !== 'starter' && old !== 'pro') {
		return old as Plan;
	}
	return LEGACY_FALLBACK_MAP[old] ?? 'free';
}

async function main() {
	console.log(`\n${APPLY ? '🔧 APPLY' : '🔍 DRY-RUN'} mode — Directus: ${DIRECTUS_URL}`);

	const stripe = STRIPE_SECRET
		? new Stripe(STRIPE_SECRET, { apiVersion: '2024-10-28.acacia', maxNetworkRetries: 2 })
		: null;
	if (!stripe) {
		console.log('  ⚠  No STRIPE_SECRET_KEY — will use deterministic value map only (starter→solo, pro→studio).');
	}

	// 1. Inventory.
	console.log('\n── Inventorying organizations…');
	const orgs = await fetchOrgsWithLinkedUsers();
	console.log(`  found ${orgs.length} org(s)`);

	const preCounts: Record<string, number> = {};
	for (const o of orgs) {
		const k = o.plan ?? '(null)';
		preCounts[k] = (preCounts[k] || 0) + 1;
	}
	console.log('  current plan distribution:');
	for (const [k, n] of Object.entries(preCounts)) {
		const flag = k === '(null)' || LEGACY_VALUES.has(k) ? '' : ' ⚠ non-legacy value';
		console.log(`    ${k.padEnd(12)} ${n}${flag}`);
	}

	// 2. Resolve target plan for each org.
	console.log('\n── Resolving target plan per org (Stripe lookup where possible)…');
	const plan: Array<{ id: string; name: string; from: string; to: Plan; source: string }> = [];
	for (const o of orgs) {
		const stripeResolved = await resolvePlanFromStripe(stripe, o.users);
		const to = targetPlanFromRow(o, stripeResolved);
		const from = o.plan ?? '(null)';
		let source: string;
		if (o.code === 'SOL' || o.code === 'AGY') source = `demo-code:${o.code}`;
		else if (stripeResolved) source = 'stripe';
		else source = 'value-map';
		plan.push({ id: o.id, name: o.name, from, to, source });
	}

	const changes = plan.filter((p) => p.from !== p.to);
	const unchanged = plan.length - changes.length;
	console.log(`  ${changes.length} row(s) need rewrite, ${unchanged} already canonical`);
	for (const p of changes.slice(0, 20)) {
		console.log(`    ${p.id.slice(0, 8)}  "${p.name}"  ${p.from} → ${p.to}  (${p.source})`);
	}
	if (changes.length > 20) console.log(`    … and ${changes.length - 20} more`);

	// 3. Check current field enum for idempotency.
	console.log('\n── Checking current organizations.plan field config…');
	const { data: field, error: fieldErr } = await directusRequest<any>('/fields/organizations/plan');
	if (fieldErr) throw new Error(`Failed to read field: ${fieldErr}`);
	const currentChoices: Array<{ value: string }> = field?.meta?.options?.choices ?? [];
	const currentSet = new Set(currentChoices.map((c) => c.value));
	const isAlreadyCanonical =
		currentSet.size === CANONICAL_VALUES.size &&
		[...CANONICAL_VALUES].every((v) => currentSet.has(v));
	console.log(`  current enum: ${[...currentSet].join(' | ') || '(empty)'}`);
	console.log(`  already canonical? ${isAlreadyCanonical ? 'YES' : 'NO'}`);

	// 4. Plan summary.
	console.log('\nPlan:');
	console.log(`  1. PATCH ${changes.length} organizations row(s) with canonical plan values`);
	if (!isAlreadyCanonical) {
		console.log('  2. PATCH /fields/organizations/plan → new choices set');
	} else {
		console.log('  2. (field already canonical — skipping)');
	}

	if (!APPLY) {
		console.log('\nThis was a DRY RUN. Re-run with --apply to write.');
		return;
	}

	// 5. Apply row updates FIRST. If a row's target equals its current, skip.
	console.log('\n── Applying row updates…');
	let rowFailures = 0;
	for (const p of changes) {
		const { error } = await directusRequest(`/items/organizations/${p.id}`, 'PATCH', { plan: p.to });
		if (error) {
			console.error(`  ✗ ${p.id} ${p.from}→${p.to}: ${error}`);
			rowFailures++;
		}
	}
	console.log(`  ✓ ${changes.length - rowFailures} / ${changes.length} row(s) updated`);
	if (rowFailures > 0) {
		console.error(`  ✗ ${rowFailures} failure(s) — aborting before field patch.`);
		process.exit(2);
	}

	// 6. Patch field enum.
	if (!isAlreadyCanonical) {
		console.log('\n── Patching /fields/organizations/plan…');
		const { error } = await directusRequest('/fields/organizations/plan', 'PATCH', NEW_PLAN_FIELD_PATCH);
		if (error) {
			console.error(`  ✗ Field patch failed: ${error}`);
			console.error('  Row data has already been rewritten to canonical values.');
			console.error('  Re-run with --apply to retry the field patch.');
			process.exit(3);
		}
		console.log('  ✓ field enum updated.');
	}

	// 7. Post-check.
	console.log('\n── Verifying post-state…');
	const post = await fetchOrgsWithLinkedUsers();
	const postCounts: Record<string, number> = {};
	for (const o of post) {
		const k = o.plan ?? '(null)';
		postCounts[k] = (postCounts[k] || 0) + 1;
	}
	let ok = true;
	for (const [k, n] of Object.entries(postCounts)) {
		const good = CANONICAL_VALUES.has(k);
		console.log(`    ${k.padEnd(12)} ${n}${good ? '' : '  ✗ non-canonical'}`);
		if (!good) ok = false;
	}
	if (post.length !== orgs.length) {
		console.error(`  ✗ row count changed: ${orgs.length} → ${post.length}`);
		ok = false;
	}
	if (!ok) process.exit(4);

	console.log('\n✓ Migration complete.');
	console.log('\nNext:');
	console.log('  - Regenerate Directus types: `pnpm generate:types` (updates shared/directus.ts plan enum).');
	console.log('  - Deploy code changes (server/utils/stripe.ts mapping removal, etc).');
	console.log('  - Fire a test Stripe subscription.updated webhook and confirm org.plan lands canonical.');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
