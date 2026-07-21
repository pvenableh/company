// GET /api/org/:id/payment-settings
//
// The org's invoice-payment fee policy, for the Billing surface "Fees" tab.
// Returns whether Stripe's card/ACH processing fee is passed to the payer or
// absorbed by the org, plus the read-only Earnest platform fee status.
//
// Gated to members with org_settings read (owner/admin/manager).
import { readItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const orgId = getRouterParam(event, 'id');
	if (!orgId) throw createError({ statusCode: 400, message: 'Organization id is required' });

	await requireOrgPermission(event, orgId, 'org_settings', 'read');

	const directus = getTypedDirectus();
	const org = (await directus.request(
		readItem('organizations', orgId, { fields: ['id', 'pass_card_fee', 'pass_ach_fee', 'wholesale_pricing'] }),
	)) as { pass_card_fee?: boolean | null; pass_ach_fee?: boolean | null; wholesale_pricing?: boolean | null } | null;

	const config = useRuntimeConfig() as any;
	const bps = parseInt(String(config.stripePlatformFeeBps || '0'), 10) || 0;
	const wholesale = !!org?.wholesale_pricing;

	return {
		// Defaults mirror the client fee calc: card passed, ACH absorbed.
		passCardFee: org?.pass_card_fee !== false,
		passAchFee: org?.pass_ach_fee === true,
		wholesale,
		// Earnest's own application fee (read-only). Waived entirely for wholesale.
		platformFeeBps: wholesale ? 0 : bps,
		platformFeePercent: wholesale ? 0 : bps / 100,
	};
});
