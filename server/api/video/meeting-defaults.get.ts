// GET /api/video/meeting-defaults?organization=ORG_ID
// Returns the resolved recording + transcription defaults the create-meeting
// modal should pre-fill, plus the per-feature availability flags + cost notes
// the modal surfaces inline.

import { requireOrgMembership } from '~~/server/utils/marketing-perms';

export default defineEventHandler(async (event) => {
	const session = await getUserSession(event);
	if (!session?.user?.id) {
		throw createError({ statusCode: 401, message: 'Unauthorized' });
	}

	const query = getQuery(event);
	const orgId = (query.organization as string | undefined)?.trim();
	if (!orgId) {
		throw createError({ statusCode: 400, message: 'organization is required' });
	}

	await requireOrgMembership(event, orgId);
	const defaults = await fetchOrgMeetingDefaults(orgId);
	return { data: defaults };
});
