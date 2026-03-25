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

		if (session?.user) {
			// Authenticated user
			userId = session.user.id;
			identity = `${session.user.first_name || ''} ${session.user.last_name || ''}`.trim();
			if (!identity) {
				identity = session.user.email?.split('@')[0] || `user-${session.user.id.substring(0, 8)}`;
			}

			// Check if this user is the host of the meeting
			try {
				const directus = getTypedDirectus();
				const { readItems } = await import('@directus/sdk');
				const meetings = await directus.request(
					readItems('video_meetings', {
						filter: { room_name: { _eq: body.roomName } },
						fields: ['host_user'],
						limit: 1,
					}),
				);
				if (meetings.length > 0 && (meetings[0] as any)?.host_user === userId) {
					isOwner = true;
				}
			} catch {
				// If we can't check host status, default to non-owner
			}
		} else if (body.identity) {
			// Guest with provided identity
			identity = body.identity;
		} else {
			// Anonymous guest
			identity = `Guest-${Math.random().toString(36).substring(2, 8)}`;
		}

		// Generate Daily.co meeting token
		const token = await createDailyMeetingToken({
			roomName: body.roomName,
			userId,
			userName: identity,
			isOwner,
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
