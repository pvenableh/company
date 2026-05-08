// GET /api/stripe/connect/status?organizationId=…
//
// Live snapshot of a connected account. We re-fetch from Stripe instead of
// trusting the locally-mirrored `stripe_account_status` field because:
//   - Phase 1 has no Connect webhook yet (Phase 4) — the local mirror would
//     never tick from `pending` to `active` otherwise.
//   - The Express onboarding return page polls this endpoint to know when
//     to flip the UI from "Continue onboarding" to the active state.
//
// Side effect: if Stripe shows a state that differs from the cached value,
// we PATCH it back so other callers (banner, AI broker) stay in sync.
import { readItem, updateItem } from '@directus/sdk';
import { useStripe } from '~~/server/utils/stripe';

type ConnectStatus = 'none' | 'pending' | 'active' | 'restricted';

function deriveStatus(account: any): ConnectStatus {
	if (!account) return 'none';
	if (account.charges_enabled && account.payouts_enabled) return 'active';
	const reqs = account.requirements || {};
	const hasDisablingReqs =
		(reqs.disabled_reason && reqs.disabled_reason !== 'requirements.pending_verification') ||
		(Array.isArray(reqs.currently_due) && reqs.currently_due.length > 0 && account.details_submitted);
	if (hasDisablingReqs) return 'restricted';
	return 'pending';
}

export default defineEventHandler(async (event) => {
	const query = getQuery(event);
	const orgId = (query.organizationId as string | undefined) || (query.orgId as string | undefined);
	if (!orgId) {
		throw createError({ statusCode: 400, message: 'organizationId is required' });
	}

	// `read` is sufficient — anyone with read access to org settings can see
	// the activation state. Only `update` callers can kick off onboarding.
	await requireOrgPermission(event, orgId, 'org_settings', 'read');

	const directus = getTypedDirectus();
	const org = (await directus.request(
		readItem('organizations', orgId, {
			fields: ['id', 'stripe_account_id', 'stripe_account_status'],
		}),
	)) as {
		id: string;
		stripe_account_id?: string | null;
		stripe_account_status?: ConnectStatus | null;
	} | null;

	if (!org) {
		throw createError({ statusCode: 404, message: 'Organization not found' });
	}

	if (!org.stripe_account_id) {
		return {
			status: 'none' as ConnectStatus,
			accountId: null,
			chargesEnabled: false,
			payoutsEnabled: false,
			detailsSubmitted: false,
			requirements: null,
		};
	}

	const stripe = useStripe();
	const account = await stripe.accounts.retrieve(org.stripe_account_id);
	const liveStatus = deriveStatus(account);

	if (liveStatus !== org.stripe_account_status) {
		await directus
			.request(
				updateItem('organizations', orgId, {
					stripe_account_status: liveStatus,
				}),
			)
			.catch((err) => {
				console.warn('Failed to mirror stripe_account_status:', err?.message || err);
			});
	}

	return {
		status: liveStatus,
		accountId: account.id,
		chargesEnabled: !!account.charges_enabled,
		payoutsEnabled: !!account.payouts_enabled,
		detailsSubmitted: !!account.details_submitted,
		requirements: account.requirements
			? {
					currentlyDue: account.requirements.currently_due || [],
					eventuallyDue: account.requirements.eventually_due || [],
					pastDue: account.requirements.past_due || [],
					disabledReason: account.requirements.disabled_reason || null,
				}
			: null,
	};
});
