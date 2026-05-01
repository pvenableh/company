/**
 * Convert a proposal into a draft contract. Copies title, blocks, total,
 * contact, lead, organization. The new contract starts in `draft` status
 * with a fresh `signing_token` so it can be sent for signature later.
 *
 * Why a server route: the create permission on `contracts` is FK-walked by
 * organization, but Directus 11 doesn't enforce FK-walked filters on
 * `create` — hence the admin-token + requireOrgMembership pattern used
 * elsewhere (messages, marketing-campaigns).
 */
import { readItem, createItem } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

export default defineEventHandler(async (event) => {
	const proposalId = getRouterParam(event, 'proposalId');
	if (!proposalId) throw createError({ statusCode: 400, message: 'proposalId required' });

	const directus = getTypedDirectus();

	const proposal = await directus.request(
		readItem('proposals', proposalId, {
			fields: ['id', 'title', 'organization', 'contact', 'lead', 'total_value', 'blocks', 'valid_until'],
		}),
	).catch(() => null) as any;
	if (!proposal) throw createError({ statusCode: 404, message: 'Proposal not found' });
	if (!proposal.organization) throw createError({ statusCode: 422, message: 'Proposal has no organization' });

	await requireOrgMembership(event, proposal.organization);

	const created = await directus.request(
		createItem('contracts', {
			title: proposal.title || 'Untitled Contract',
			organization: proposal.organization,
			contact: proposal.contact || null,
			lead: proposal.lead || null,
			proposal: proposal.id,
			total_value: proposal.total_value ?? null,
			valid_until: proposal.valid_until ?? null,
			blocks: Array.isArray(proposal.blocks) ? proposal.blocks : [],
			contract_status: 'draft',
			signing_token: crypto.randomUUID(),
		}),
	) as any;

	return { id: created.id };
});
