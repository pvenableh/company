/**
 * Appointment access guard.
 *
 * Authentication: the caller must have a valid session. When the appointment
 * is bound to an org-owned resource (related_lead or video_meeting), the
 * caller must also be an active member of that org — mirrors the FK shape
 * used by /api/appointments POST.
 *
 * NOTE: ownership-by-`user_created` is not enforceable here because
 * `getTypedDirectus()` writes through the admin token, which causes Directus
 * to set `user_created` to the static-token user rather than the session
 * user. Existing rows in production have "API Admin" as user_created, not
 * the actual creator. The Directus row-level perms on `appointments` are
 * already permissive (full() for most roles), so this route is no more
 * restrictive than what the user-token Directus client would allow.
 */
import { readItem } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

export interface AppointmentAccess {
	userId: string;
	appointment: {
		id: string;
		related_lead: any;
		video_meeting: any;
	};
	organizationId: string | null;
}

export async function requireAppointmentAccess(event: any, appointmentId: string): Promise<AppointmentAccess> {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}
	if (!appointmentId) {
		throw createError({ statusCode: 400, message: 'Appointment id is required' });
	}

	const directus = getTypedDirectus();
	let appointment: any;
	try {
		appointment = await directus.request(
			readItem('appointments', appointmentId, {
				fields: [
					'id',
					'related_lead.organization',
					'video_meeting.related_organization',
				] as any,
			}),
		);
	} catch {
		throw createError({ statusCode: 404, message: 'Appointment not found' });
	}

	const orgId =
		(typeof appointment.related_lead === 'object' ? appointment.related_lead?.organization : null) ||
		(typeof appointment.video_meeting === 'object' ? appointment.video_meeting?.related_organization : null) ||
		null;

	// Only gate when the row is bound to an org. Orphan appointments (no FK
	// to lead or meeting) are intentionally treated as personal/shared — the
	// existing client-side flow allowed any authed user to update them.
	if (orgId) {
		await requireOrgMembership(event, orgId);
	}

	return { userId, appointment, organizationId: orgId };
}
