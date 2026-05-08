// POST /api/stripe/connect/refresh-link
//
// Returns a Stripe Account Link so an org can re-enter onboarding (e.g.
// after Stripe flagged additional verification, or the initial link
// expired). Picks the link type based on account state: until
// `details_submitted` flips true Stripe only accepts `account_onboarding`
// links; after that, `account_update` is the right type for editing.
import { readItem } from '@directus/sdk';
import { useStripe } from '~~/server/utils/stripe';

interface RefreshBody {
	organizationId?: string;
	returnUrl?: string;
	refreshUrl?: string;
}

export default defineEventHandler(async (event) => {
	const body = await readBody<RefreshBody>(event);
	const orgId = body?.organizationId;
	if (!orgId) {
		throw createError({ statusCode: 400, message: 'organizationId is required' });
	}

	await requireNotDemoSession(event);
	await requireActiveOrg(orgId);
	await requireOrgPermission(event, orgId, 'org_settings', 'update');

	const directus = getTypedDirectus();
	const org = (await directus.request(
		readItem('organizations', orgId, { fields: ['id', 'stripe_account_id'] }),
	)) as { id: string; stripe_account_id?: string | null } | null;

	if (!org?.stripe_account_id) {
		throw createError({
			statusCode: 412,
			message: 'This organization has not started Stripe onboarding yet.',
		});
	}

	const stripe = useStripe();
	const baseUrl = process.env.APP_URL || 'http://127.0.0.1:3000';
	const returnUrl = body?.returnUrl || `${baseUrl}/organization?tab=billing&onboarding=updated`;
	const refreshUrl = body?.refreshUrl || `${baseUrl}/organization?tab=billing&onboarding=refresh`;

	const account = await stripe.accounts.retrieve(org.stripe_account_id);
	const linkType: 'account_update' | 'account_onboarding' = account.details_submitted
		? 'account_update'
		: 'account_onboarding';

	const link = await stripe.accountLinks.create({
		account: org.stripe_account_id,
		type: linkType,
		return_url: returnUrl,
		refresh_url: refreshUrl,
	});

	return {
		accountId: org.stripe_account_id,
		url: link.url,
		expiresAt: link.expires_at,
	};
});
