// POST /api/stripe/connect/onboard
//
// Phase 1 of Stripe Connect Express. Creates the org's connected merchant
// account on first call (or reuses an existing one), then returns a hosted
// onboarding link the user is redirected to. Pre-fills business profile
// fields from the org row so the Express form has the lightest possible
// touch.
//
// Auth: caller must hold `org_settings:update` on the org. Demo workspaces
// are blocked — connecting a real Stripe account from a shared public login
// would be catastrophic.
import { readItem, updateItem } from '@directus/sdk';
import { useStripe } from '~~/server/utils/stripe';

interface OnboardBody {
	organizationId?: string;
	returnUrl?: string;
	refreshUrl?: string;
}

export default defineEventHandler(async (event) => {
	const body = await readBody<OnboardBody>(event);
	const orgId = body?.organizationId;
	if (!orgId) {
		throw createError({ statusCode: 400, message: 'organizationId is required' });
	}

	await requireNotDemoSession(event);
	await requireActiveOrg(orgId);
	await requireOrgPermission(event, orgId, 'org_settings', 'update');

	const directus = getTypedDirectus();
	const org = (await directus.request(
		readItem('organizations', orgId, {
			fields: [
				'id',
				'name',
				'website',
				'email',
				'brand_color',
				'stripe_account_id',
				'stripe_account_status',
				'stripe_account_country',
			],
		}),
	)) as {
		id: string;
		name?: string | null;
		website?: string | null;
		email?: string | null;
		brand_color?: string | null;
		stripe_account_id?: string | null;
		stripe_account_status?: string | null;
		stripe_account_country?: string | null;
	} | null;

	if (!org) {
		throw createError({ statusCode: 404, message: 'Organization not found' });
	}

	const stripe = useStripe();
	let accountId = org.stripe_account_id || null;

	if (!accountId) {
		const country = (org.stripe_account_country || 'US').toUpperCase();
		const brandColor = org.brand_color || undefined;
		// Strip leading # because Stripe rejects it on `branding.primary_color`.
		const primaryColor = brandColor && brandColor.startsWith('#') ? brandColor.slice(1) : brandColor;

		// Standard accounts: connected merchants pay Stripe fees, get the
		// full Stripe Dashboard, and Stripe carries negative-balance liability
		// (vs. Express where Earnest would). Slightly heavier onboarding form
		// is worth it for the trust signal of Stripe-branded KYC + the wider
		// payment-method support (Klarna, Afterpay, Cash App, Pay by Bank).
		const account = await stripe.accounts.create({
			type: 'standard',
			country,
			email: org.email || undefined,
			business_profile: {
				name: org.name || undefined,
				url: org.website || undefined,
				support_email: org.email || undefined,
			},
			capabilities: {
				card_payments: { requested: true },
				transfers: { requested: true },
				us_bank_account_ach_payments: country === 'US' ? { requested: true } : undefined,
			},
			metadata: {
				earnest_organization_id: orgId,
			},
		});

		accountId = account.id;

		await directus.request(
			updateItem('organizations', orgId, {
				stripe_account_id: accountId,
				stripe_account_status: 'pending',
			}),
		);
	}

	const baseUrl = getAppBaseUrl(event);
	const returnUrl = body?.returnUrl || `${baseUrl}/organization?tab=billing&onboarding=complete`;
	const refreshUrl = body?.refreshUrl || `${baseUrl}/organization?tab=billing&onboarding=refresh`;

	const link = await stripe.accountLinks.create({
		account: accountId,
		type: 'account_onboarding',
		return_url: returnUrl,
		refresh_url: refreshUrl,
	});

	return {
		accountId,
		url: link.url,
		expiresAt: link.expires_at,
	};
});
