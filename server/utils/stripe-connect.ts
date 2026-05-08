// Shared helper used by the Phase 3 Connect surface routes (balance,
// transactions, refunds, payouts). Each route reads `?organizationId=…`,
// confirms the caller has invoice-read access, and resolves the org's
// connected account id — 412 if the account isn't yet active.
import { readItem } from '@directus/sdk';
import type { CrudAction } from '~~/shared/permissions';

export interface RequireConnectedAccountResult {
	organizationId: string;
	stripeAccountId: string;
}

export async function requireConnectedAccount(
	event: any,
	options: {
		action?: CrudAction;
		organizationId?: string;
	} = {},
): Promise<RequireConnectedAccountResult> {
	const action: CrudAction = options.action || 'read';

	let orgId = options.organizationId;
	if (!orgId) {
		const query = getQuery(event);
		orgId = (query.organizationId as string | undefined) || (query.orgId as string | undefined);
	}
	if (!orgId) {
		throw createError({ statusCode: 400, message: 'organizationId is required' });
	}

	await requireOrgPermission(event, orgId, 'invoices', action);

	const directus = getTypedDirectus();
	const org = (await directus.request(
		readItem('organizations', orgId, {
			fields: ['id', 'stripe_account_id', 'stripe_account_status'],
		}),
	)) as { id: string; stripe_account_id?: string | null; stripe_account_status?: string | null } | null;

	if (!org?.stripe_account_id) {
		throw createError({
			statusCode: 412,
			message: 'This organization has not connected a Stripe account yet.',
		});
	}
	if (org.stripe_account_status !== 'active') {
		throw createError({
			statusCode: 412,
			message: 'This organization is still finishing Stripe onboarding.',
		});
	}

	return { organizationId: orgId, stripeAccountId: org.stripe_account_id };
}
