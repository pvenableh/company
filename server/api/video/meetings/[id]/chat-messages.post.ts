// server/api/video/meetings/[id]/chat-messages.post.ts
// Persists a Daily prebuilt chat message into meeting_chat_messages.
// Called by the meeting page when it intercepts a `chat-msg` app-message
// event from the wrapped Daily iframe.
import { createItem, readItem } from '@directus/sdk';

interface CaptureBody {
	message?: string;
	senderName?: string;
	senderSessionId?: string;
	sentAt?: string; // ISO
}

export default defineEventHandler(async (event) => {
	const session = await getUserSession(event);
	if (!session?.user?.id) {
		throw createError({ statusCode: 401, message: 'Unauthorized' });
	}

	const meetingId = getRouterParam(event, 'id');
	if (!meetingId) throw createError({ statusCode: 400, message: 'meeting id required' });

	const body = await readBody<CaptureBody>(event);
	const text = String(body?.message || '').trim();
	if (!text) throw createError({ statusCode: 400, message: 'message required' });

	// Best-effort length cap to keep one chat row from blowing up. Daily's chat
	// itself caps at 4000-ish; cap a bit higher for safety.
	const message = text.length > 5000 ? text.slice(0, 5000) : text;

	const directus = getTypedDirectus();

	// Confirm the user is host or shares an org with the meeting before letting
	// them record into our log. Anyone in the meeting will trigger a capture, but
	// only authenticated participants should land rows in our DB.
	const meeting = (await directus
		.request(
			readItem('video_meetings', meetingId, {
				fields: ['id', 'host_user', 'related_organization'],
			}),
		)
		.catch(() => null)) as any;

	if (!meeting) throw createError({ statusCode: 404, message: 'Meeting not found' });

	const userOrgs: string[] = ((session.user as any).organizations || []).map((o: any) => o?.organizations_id || o?.id || o).filter(Boolean);
	const isHost = meeting.host_user === session.user.id;
	const orgMatch = meeting.related_organization && userOrgs.includes(meeting.related_organization);
	if (!isHost && !orgMatch) {
		throw createError({ statusCode: 403, message: 'Not allowed to log chat for this meeting' });
	}

	const sentAt = body.sentAt && !Number.isNaN(Date.parse(body.sentAt)) ? body.sentAt : new Date().toISOString();

	await directus.request(
		createItem('meeting_chat_messages', {
			meeting: meetingId,
			message,
			sender_name: (body.senderName || '').slice(0, 200) || null,
			sender_session_id: (body.senderSessionId || '').slice(0, 64) || null,
			sent_at: sentAt,
		} as any),
	);

	return { success: true };
});
