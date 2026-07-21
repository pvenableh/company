// PATCH /api/org/:id/payment-settings
//
// Update the org's invoice-payment fee policy from the Billing surface "Fees"
// tab: whether Stripe's card / ACH processing fee is passed to the payer.
//
// Written with the admin token after gating (org_settings update, owner/admin/
// manager) so it isn't subject to field-level client perms on the two new
// columns. Demo accounts are blocked (real billing behavior).
import { updateItem } from '@directus/sdk';

interface Body {
	passCardFee?: boolean;
	passAchFee?: boolean;
}

export default defineEventHandler(async (event) => {
	const orgId = getRouterParam(event, 'id');
	if (!orgId) throw createError({ statusCode: 400, message: 'Organization id is required' });

	await requireNotDemoSession(event);
	await requireOrgPermission(event, orgId, 'org_settings', 'update');

	const body = await readBody<Body>(event);
	const patch: Record<string, boolean> = {};
	if (typeof body?.passCardFee === 'boolean') patch.pass_card_fee = body.passCardFee;
	if (typeof body?.passAchFee === 'boolean') patch.pass_ach_fee = body.passAchFee;
	if (!Object.keys(patch).length) {
		throw createError({ statusCode: 400, message: 'No fee settings provided' });
	}

	const directus = getTypedDirectus();
	const updated = (await directus.request(
		updateItem('organizations', orgId, patch),
	)) as { pass_card_fee?: boolean | null; pass_ach_fee?: boolean | null };

	return {
		passCardFee: updated?.pass_card_fee !== false,
		passAchFee: updated?.pass_ach_fee === true,
	};
});
