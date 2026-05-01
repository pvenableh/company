/**
 * Public, unauth endpoint to fetch a contract by its `signing_token`.
 * Used by the /contracts/sign/[token] page so unauthenticated signers can
 * load + sign without a Directus session.
 *
 * Returns only the fields needed to render the document — never the org's
 * private fields (e.g. plan, addons, billing).
 */
import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const token = getRouterParam(event, 'token');
	if (!token) throw createError({ statusCode: 400, message: 'token required' });

	const directus = getTypedDirectus();

	const rows = await directus.request(
		readItems('contracts', {
			fields: [
				'id', 'title', 'date_sent', 'valid_until', 'effective_date',
				'total_value', 'contract_status', 'blocks',
				'signed_at', 'signed_by_name', 'signed_by_email',
				'organization.id', 'organization.name', 'organization.logo',
				'organization.address', 'organization.phone', 'organization.email', 'organization.website',
				'organization.plan', 'organization.whitelabel',
				'contact.first_name', 'contact.last_name', 'contact.email', 'contact.company',
			],
			filter: { signing_token: { _eq: token } },
			limit: 1,
		}),
	) as any[];

	const contract = rows?.[0];
	if (!contract) throw createError({ statusCode: 404, message: 'Contract not found' });

	return contract;
});
