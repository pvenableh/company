// server/api/ai/meeting-summary.post.ts
/**
 * Generate (or regenerate) the AI summary for a video meeting.
 *
 * The Daily transcript.ready-to-download webhook auto-triggers this for
 * meetings with stored transcripts; this endpoint exists for manual retries
 * and for meetings where someone clicks "Regenerate" on the recap page.
 */

import { readItem } from '@directus/sdk';
import { generateAndSaveMeetingSummary } from '~~/server/utils/meeting-summary';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

interface Body {
	meetingId?: string;
}

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const body = await readBody<Body>(event);
	const meetingId = body?.meetingId;
	if (!meetingId) {
		throw createError({ statusCode: 400, message: 'meetingId is required' });
	}

	// Org-membership check: meeting must be on an org the user belongs to.
	// We do this by reading host_user.organizations or attendees.directus_user.organizations.
	// Simplest correct path: only allow the host or someone in a matching org_membership.
	const directus = getTypedDirectus();
	let meeting: any;
	try {
		meeting = await directus.request(
			readItem('video_meetings', meetingId, {
				fields: [
					'id',
					'host_user',
					'related_organization',
					'project.organization',
					'project_event.project.organization',
					'transcript_text',
				] as any,
			}),
		);
	} catch (err: any) {
		throw createError({ statusCode: 404, message: 'Meeting not found' });
	}

	const meetingOrgId =
		(typeof meeting.related_organization === 'object' ? meeting.related_organization?.id : meeting.related_organization) ||
		(typeof meeting.project === 'object' && typeof meeting.project?.organization === 'object'
			? meeting.project.organization.id
			: typeof meeting.project === 'object' ? meeting.project?.organization : null) ||
		(typeof meeting.project_event === 'object' && typeof meeting.project_event?.project === 'object'
			? (typeof meeting.project_event.project.organization === 'object'
				? meeting.project_event.project.organization.id
				: meeting.project_event.project.organization)
			: null);

	const hostId = typeof meeting.host_user === 'object' ? meeting.host_user?.id : meeting.host_user;
	const isHost = hostId === userId;

	if (!isHost) {
		if (!meetingOrgId) {
			throw createError({ statusCode: 403, message: 'Not authorised for this meeting' });
		}
		await requireOrgMembership(event, meetingOrgId);
	}

	if (!meeting.transcript_text) {
		throw createError({
			statusCode: 409,
			message: 'No transcript yet. Start transcription during the meeting (host menu) and try again after it ends.',
		});
	}

	try {
		const result = await generateAndSaveMeetingSummary(meetingId);

		// Best-effort usage logging (uses session token).
		if (result.usage) {
			await logAIUsage({
				event,
				endpoint: 'meeting-summary',
				model: result.model,
				inputTokens: result.usage.inputTokens,
				outputTokens: result.usage.outputTokens,
				organizationId: meetingOrgId || undefined,
				metadata: { meeting_id: meetingId },
			}).catch(() => {});
		}

		return {
			success: true,
			summary: result.summary,
			action_items: result.action_items,
		};
	} catch (err: any) {
		throw createError({ statusCode: 500, message: err.message || 'Summary generation failed' });
	}
});
