// server/api/email/held/[id]/discard.post.ts
/**
 * Discard a held money-email draft — mark it 'discarded' so it drops out of the
 * outbox without ever being sent. Org-scoped: the caller must belong to the
 * draft's org. A draft already 'sent' cannot be discarded.
 */
import { readItem, updateItem } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	if (!(session as any).user?.id) throw createError({ statusCode: 401, message: 'Authentication required' });

	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, message: 'draft id is required' });

	const directus = getServerDirectus();

	const draft = (await directus.request(
		readItem('held_emails' as any, id, { fields: ['id', 'organization', 'status'] as any }),
	)) as any;

	if (!draft) throw createError({ statusCode: 404, message: 'Draft not found' });

	const orgId = typeof draft.organization === 'object' ? draft.organization?.id : draft.organization;
	if (!orgId) throw createError({ statusCode: 400, message: 'Draft has no organization — cannot authorize.' });
	await requireOrgMembership(event, String(orgId));

	if (draft.status === 'sent') {
		throw createError({ statusCode: 409, message: 'Draft was already sent — cannot discard.' });
	}

	await directus.request(updateItem('held_emails' as any, id, { status: 'discarded' } as any));

	return { discarded: true, id };
});
