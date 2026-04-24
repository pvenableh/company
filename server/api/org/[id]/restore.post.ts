// POST /api/org/:id/restore
// Reverse of archive.post.ts.
//
// 1. Demo accounts blocked via requireOrgRole.
// 2. Requester must be an active owner of THIS org.
// 3. Clear organizations.archived_at.
// 4. If the org has a Stripe subscription that was flagged
//    cancel_at_period_end=true AND hasn't yet reached the period end,
//    flip it back. If the subscription is fully 'canceled' (past period
//    end), we can't resume it from the server — the user must
//    re-subscribe via checkout. Surface that distinction in the response.

import { readItem, updateItem } from '@directus/sdk';
import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
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
			message: 'Only the organization owner can restore it',
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

	if (!org.archived_at) {
		return {
			success: true,
			alreadyActive: true,
			stripe: null,
			resubscribeRequired: false,
		};
	}

	// ── Clear archive timestamp ──────────────────────────────────────────────
	await directus.request(
		updateItem('organizations', orgId, { archived_at: null }),
	);

	// ── Reactivate Stripe subscription if possible ───────────────────────────
	let stripeResult: {
		id: string;
		status: string;
		cancel_at_period_end: boolean;
	} | null = null;
	let resubscribeRequired = false;

	if (org.stripe_subscription_id) {
		try {
			const stripe = useStripe();
			const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id);

			if (sub.status === 'canceled') {
				// Past period end — Stripe won't let us flip the flag.
				// Caller must route the user back to checkout.
				resubscribeRequired = true;
				stripeResult = {
					id: sub.id,
					status: sub.status,
					cancel_at_period_end: sub.cancel_at_period_end,
				};
			} else if (sub.cancel_at_period_end) {
				const updated = await stripe.subscriptions.update(org.stripe_subscription_id, {
					cancel_at_period_end: false,
				});
				stripeResult = {
					id: updated.id,
					status: updated.status,
					cancel_at_period_end: updated.cancel_at_period_end,
				};
			} else {
				// Already active with no cancel flag — nothing to do.
				stripeResult = {
					id: sub.id,
					status: sub.status,
					cancel_at_period_end: sub.cancel_at_period_end,
				};
			}
		} catch (err: any) {
			console.error(
				`[org/restore] Stripe lookup/update failed for org=${orgId} sub=${org.stripe_subscription_id}:`,
				err?.message || err,
			);
		}
	}

	console.log(
		`[audit] org.restore org=${orgId} name="${org.name}" user=${userId} stripe=${
			stripeResult ? `${stripeResult.id}/${stripeResult.status}` : 'none'
		}${resubscribeRequired ? ' resubscribe_required' : ''}`,
	);

	return {
		success: true,
		alreadyActive: false,
		stripe: stripeResult,
		resubscribeRequired,
	};
});
