// server/api/video/meetings/[id]/chat-messages.post.ts
// Persists a Daily prebuilt chat message into meeting_chat_messages.
// Called by the meeting page when it intercepts a `chat-msg` app-message
// event from the wrapped Daily iframe.
//
// Auth/perm — delegated to `requireMeetingAccess` so the rules match every
// other meeting route (host OR active member of the meeting's owning org,
// resolved across related_organization / project.organization /
// project_event.project.organization).
//
// Dedup — every connected client may attempt to log a chat message they
// received (the front-end no longer gates on host-only, so the host's own
// outbound messages get captured by the other participants' tabs). We dedupe
// on (meeting, sender_session_id, sent_at_minute, message) to collapse the
// duplicate writes that come from N receivers each POSTing the same line.
import { createItem, readItems } from '@directus/sdk';
import { requireMeetingAccess } from '~~/server/utils/meeting-perms';

interface CaptureBody {
	message?: string;
	senderName?: string;
	senderSessionId?: string;
	sentAt?: string; // ISO
}

export default defineEventHandler(async (event) => {
	const meetingId = getRouterParam(event, 'id');
	if (!meetingId) throw createError({ statusCode: 400, message: 'meeting id required' });

	// Canonical meeting access guard — handles host check + org-membership
	// walk across related_organization / project / project_event. Throws
	// 401/403/404 with the same shape as every other meeting route.
	await requireMeetingAccess(event, meetingId);

	const body = await readBody<CaptureBody>(event);
	const text = String(body?.message || '').trim();
	if (!text) throw createError({ statusCode: 400, message: 'message required' });

	// Best-effort length cap. Daily's chat itself caps at ~4000; cap a bit
	// higher for safety.
	const message = text.length > 5000 ? text.slice(0, 5000) : text;

	const senderName = (body.senderName || '').slice(0, 200) || null;
	const senderSessionId = (body.senderSessionId || '').slice(0, 64) || null;
	const sentAt = body.sentAt && !Number.isNaN(Date.parse(body.sentAt))
		? body.sentAt
		: new Date().toISOString();

	const directus = getTypedDirectus();

	// Dedup: N participants each POST the same chat line. Skip if we already
	// have an exact match within a ±5s window on the same sender_session_id +
	// message text. (sender_session_id is Daily's stable per-tab id, so it's
	// the strongest dedupe key when we have it; we still scope by meeting so
	// a re-used session id across meetings can't collide.)
	const sentMs = Date.parse(sentAt);
	const windowStart = new Date(sentMs - 5000).toISOString();
	const windowEnd = new Date(sentMs + 5000).toISOString();

	try {
		const existing = await directus.request(
			readItems('meeting_chat_messages' as any, {
				filter: {
					_and: [
						{ meeting: { _eq: meetingId } },
						{ message: { _eq: message } },
						{ sent_at: { _between: [windowStart, windowEnd] } },
						senderSessionId
							? { sender_session_id: { _eq: senderSessionId } }
							: { sender_name: { _eq: senderName || '' } },
					],
				},
				fields: ['id'],
				limit: 1,
			} as any),
		) as any[];

		if (existing?.length) {
			return { success: true, deduped: true };
		}
	} catch (err: any) {
		// Dedup query failure shouldn't block the insert — log and continue.
		console.warn('[chat-messages] dedup query failed:', err?.message || err);
	}

	await directus.request(
		createItem('meeting_chat_messages', {
			meeting: meetingId,
			message,
			sender_name: senderName,
			sender_session_id: senderSessionId,
			sent_at: sentAt,
		} as any),
	);

	return { success: true };
});
