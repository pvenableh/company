// POST /api/org/:id/archive
// Archive-first soft-delete for an organization.
//
// 1. Demo accounts blocked via requireOrgRole (hard-block).
// 2. Requester must be an active owner of THIS org.
// 3. If the org has a Stripe subscription, flip cancel_at_period_end=true
//    so the customer keeps service through their paid period. Restore
//    within the period just clears the flag (see restore.post.ts). The
//    Stripe webhook will then flip org.plan to 'free' after the period
//    ends; we do not pre-emptively null out stripe_subscription_id here
//    so restore() can still resume it.
// 4. Set organizations.archived_at = now(). No hard delete happens here —
//    the Session 5 cleanup cron is what eventually DELETEs the row.
//
// Out of scope (Session 5): query-gating archived orgs from list views.
// Short-term, an archived org's data will still surface in some views.

import { readItem, updateItem } from '@directus/sdk';
import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	// Demo hard-block + "you are owner of *some* org" sanity gate.
	const { userId } = await requireOrgRole(event, ['owner']);

	const orgId = getRouterParam(event, 'id');
	if (!orgId) {
		throw createError({ statusCode: 400, message: 'Organization id is required' });
	}

	const directus = getServerDirectus();

	// ── Org-specific owner check ─────────────────────────────────────────────
	const memberships = await directus.request(
		readItems('org_memberships', {
			filter: {
				_and: [
					{ user: { _eq: userId } },
					{ organization: { _eq: orgId } },
					{ status: { _eq: 'active' } },
				],
			},
			fields: ['id', 'role.slug'],
			limit: 1,
		}),
	) as any[];

	const roleSlug = memberships[0]?.role?.slug;
	if (roleSlug !== 'owner') {
		throw createError({
			statusCode: 403,
			message: 'Only the organization owner can archive it',
		});
	}

	// ── Load org ─────────────────────────────────────────────────────────────
	const org = await directus.request(
		readItem('organizations', orgId, {
			fields: ['id', 'name', 'archived_at', 'stripe_subscription_id'],
		}),
	) as any;

	if (!org) {
		throw createError({ statusCode: 404, message: 'Organization not found' });
	}

	if (org.archived_at) {
		// Idempotent: already archived.
		return {
			success: true,
			alreadyArchived: true,
			archivedAt: org.archived_at,
			stripe: null,
		};
	}

	// ── Cancel Stripe subscription at period end ─────────────────────────────
	let stripeResult: {
		id: string;
		status: string;
		cancel_at_period_end: boolean;
		current_period_end: number | null;
	} | null = null;

	if (org.stripe_subscription_id) {
		try {
			const stripe = useStripe();
			const sub = await stripe.subscriptions.update(org.stripe_subscription_id, {
				cancel_at_period_end: true,
			});
			stripeResult = {
				id: sub.id,
				status: sub.status,
				cancel_at_period_end: sub.cancel_at_period_end,
				current_period_end: sub.current_period_end ?? null,
			};
		} catch (err: any) {
			// Don't block archive on Stripe errors — the org should still get
			// soft-deleted locally. Surface for manual reconciliation.
			console.error(
				`[org/archive] Stripe cancel failed for org=${orgId} sub=${org.stripe_subscription_id}:`,
				err?.message || err,
			);
		}
	}

	// ── Soft-delete ──────────────────────────────────────────────────────────
	const archivedAt = new Date().toISOString();
	await directus.request(
		updateItem('organizations', orgId, { archived_at: archivedAt }),
	);

	console.log(
		`[audit] org.archive org=${orgId} name="${org.name}" user=${userId} stripe=${
			stripeResult ? `${stripeResult.id}@period_end` : 'none'
		} at=${archivedAt}`,
	);

	return {
		success: true,
		alreadyArchived: false,
		archivedAt,
		stripe: stripeResult,
	};
});
