/**
 * Meeting access guard.
 *
 * `requireMeetingAccess(event, meetingId)` — authenticate the caller and
 * confirm they're allowed to read/write notes on the meeting. Returns the
 * resolved meeting + the org id we used to gate. The host (or anyone in the
 * meeting's owning org) qualifies. The org id is resolved off whichever of
 * `related_organization`, `project.organization`, or
 * `project_event.project.organization` is populated, since
 * `related_organization` is sometimes stale on older rows (see
 * project_messages_appointments_leak_close memo).
 */
import { readItem } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

export interface MeetingAccess {
	userId: string;
	meeting: { id: string; host_user: any; related_organization: any; project: any; project_event: any };
	organizationId: string | null;
	isHost: boolean;
}

export async function requireMeetingAccess(event: any, meetingId: string): Promise<MeetingAccess> {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}
	if (!meetingId) {
		throw createError({ statusCode: 400, message: 'Meeting id is required' });
	}

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
				] as any,
			}),
		);
	} catch {
		throw createError({ statusCode: 404, message: 'Meeting not found' });
	}

	const orgId =
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
		if (!orgId) {
			throw createError({ statusCode: 403, message: 'Not authorised for this meeting' });
		}
		await requireOrgMembership(event, orgId);
	}

	return { userId, meeting, organizationId: orgId, isHost };
}
