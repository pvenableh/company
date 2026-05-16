// server/api/video/token.post.ts
// Generates a Daily.co meeting token for a participant.

interface TokenRequestBody {
	roomName: string;
	identity?: string;
}

export default defineEventHandler(async (event) => {
	try {
		// Get session to identify current user (optional for guests)
		let session = null;
		try {
			session = await getUserSession(event);
		} catch {
			// No session - that's fine for guests
		}

		// Get request body
		const body = await readBody<TokenRequestBody>(event);

		if (!body.roomName) {
			throw createError({
				statusCode: 400,
				message: 'Room name is required',
			});
		}

		// Determine identity and whether this is the owner
		let identity: string;
		let userId: string | undefined;
		let isOwner = false;
		let autoStartTranscription = false;
		let autoStartRecording = false;

		if (session?.user) {
			// Authenticated user
			userId = session.user.id;
			identity = `${session.user.first_name || ''} ${session.user.last_name || ''}`.trim();
			if (!identity) {
				identity = session.user.email?.split('@')[0] || `user-${session.user.id.substring(0, 8)}`;
			}

			// Check if this user is the host of the meeting + pick up the
			// transcription/recording opt-in flags so we can hand them to
			// Daily's token-level `auto_start_*` properties (more reliable
			// than client-side startTranscription() after wrap).
			//
			// Failures here used to be swallowed silently, which meant the
			// host's token would quietly drop `auto_start_*` whenever the
			// Directus call hiccuped — recording/transcription mysteriously
			// stopped auto-starting with no log line to diagnose. We now log
			// every failure mode so operators can see what happened, but
			// still degrade gracefully (continue as non-owner) so a transient
			// Directus blip doesn't 500 the join.
			try {
				const directus = getTypedDirectus();
				const { readItems } = await import('@directus/sdk');
				const meetings = await directus.request(
					readItems('video_meetings', {
						filter: { room_name: { _eq: body.roomName } },
						fields: ['host_user', 'transcription_enabled', 'recording_enabled'] as any,
						limit: 1,
					}),
				);
				if (meetings.length === 0) {
					console.warn('[video/token] host check: no video_meetings row for', body.roomName);
				} else if ((meetings[0] as any)?.host_user !== userId) {
					// Not an error — just a guest token request. Logged at info
					// level so we can still trace "why didn't auto-start fire?"
					// from the line above.
				} else {
					isOwner = true;
					const meetingRow = meetings[0] as any;
					autoStartTranscription = !!meetingRow.transcription_enabled;
					autoStartRecording = !!meetingRow.recording_enabled;
				}
			} catch (err) {
				console.error('[video/token] host check failed for', body.roomName, err);
				// Continue as non-owner — better to issue a guest-tier token
				// than to 500 the join. The user can still manually flip the
				// host-only pills mid-call.
			}
		} else if (body.identity) {
			// Guest with provided identity
			identity = body.identity;
		} else {
			// Anonymous guest
			identity = `Guest-${Math.random().toString(36).substring(2, 8)}`;
		}

		// Anonymous guests get redirected to the marketing follow-up page when
		// they click Leave. Logged-in users MUST NOT get this redirect — our
		// `left-meeting` listener navigates the parent to /meetings/[id], and
		// Daily's iframe redirect races that and wins, kicking the host off to
		// the marketing page instead of the recap.
		let redirectOnExit: string | undefined;
		if (!session?.user) {
			const config = useRuntimeConfig();
			const marketingUrl = (config.public as any)?.marketingUrl || 'https://earnest.guru';
			redirectOnExit = `${marketingUrl.replace(/\/$/, '')}/meeting-follow-up`;
		}

		// Generate Daily.co meeting token
		const token = await createDailyMeetingToken({
			roomName: body.roomName,
			userId,
			userName: identity,
			isOwner,
			redirectOnExit,
			autoStartTranscription,
			autoStartRecording,
		});

		return {
			success: true,
			data: {
				token,
				identity,
				roomName: body.roomName,
			},
		};
	} catch (error) {
		const err = error as any;
		console.error('Error generating video token:', err);

		throw createError({
			statusCode: err.statusCode || 500,
			message: err.message || 'Failed to generate video token',
		});
	}
});
