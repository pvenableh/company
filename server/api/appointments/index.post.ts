/**
 * Create a calendar appointment.
 *
 * Why a server route: Directus 11 doesn't enforce FK walks on the `create`
 * permission filter, so the Client Manager `appointments.create` perm shape
 * `_or [related_lead.org, video_meeting.related_organization, both _null]`
 * can be bypassed at the API level — a logged-in user could POST an
 * appointment whose `related_lead` or `video_meeting` points to another
 * tenant's row. This route validates org membership before inserting.
 */
import { readItem, createItem } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

interface CreateAppointmentBody {
  title?: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  status?: string;
  is_video?: boolean;
  meeting_link?: string;
  room_name?: string;
  related_lead?: number | null;
  video_meeting?: string | null;
  external_event_id?: string | null;
  google_event_id?: string | null;
  outlook_event_id?: string | null;
  reminder_sent?: boolean;
  [key: string]: unknown;
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const body = await readBody<CreateAppointmentBody>(event);
  if (!body?.start_time) {
    throw createError({ statusCode: 400, message: 'start_time is required' });
  }
  if (!body?.end_time) {
    throw createError({ statusCode: 400, message: 'end_time is required' });
  }

  const directus = getTypedDirectus();

  // Validate any FK that pins this appointment to an org-owned resource.
  if (body.related_lead != null) {
    const lead = await directus.request(
      readItem('leads', body.related_lead, { fields: ['id', 'organization'] }),
    ).catch(() => null) as { id: number; organization: string | null } | null;
    if (!lead) throw createError({ statusCode: 404, message: 'Lead not found' });
    if (!lead.organization) throw createError({ statusCode: 422, message: 'Lead has no organization' });
    await requireOrgMembership(event, lead.organization);
  }

  if (body.video_meeting != null) {
    const meeting = await directus.request(
      readItem('video_meetings', body.video_meeting, { fields: ['id', 'related_organization'] }),
    ).catch(() => null) as { id: string; related_organization: string | null } | null;
    if (!meeting) throw createError({ statusCode: 404, message: 'Video meeting not found' });
    if (!meeting.related_organization) throw createError({ statusCode: 422, message: 'Video meeting has no organization' });
    await requireOrgMembership(event, meeting.related_organization);
  }

  const created = await directus.request(
    createItem('appointments', {
      ...body,
      user_created: userId,
      status: body.status ?? 'published',
    }),
  );

  return created;
});
