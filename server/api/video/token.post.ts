// server/api/video/token.post.ts
import twilio from 'twilio';

interface TokenRequestBody {
	roomName: string;
	identity?: string;
}

export default defineEventHandler(async (event) => {
	try {
		const config = useRuntimeConfig();

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

		// Validate Twilio credentials
		if (!config.twilioAccountSid || !config.twilioApiKey || !config.twilioApiSecret) {
			throw createError({
				statusCode: 500,
				message: 'Video service is not configured',
			});
		}

		// Determine identity
		let identity: string;

		if (session?.user) {
			// Authenticated user
			identity = `${session.user.first_name || ''} ${session.user.last_name || ''}`.trim();
			if (!identity) {
				identity = session.user.email?.split('@')[0] || `user-${session.user.id.substring(0, 8)}`;
			}
		} else if (body.identity) {
			// Guest with provided identity
			identity = body.identity;
		} else {
			// Anonymous guest
			identity = `Guest-${Math.random().toString(36).substring(2, 8)}`;
		}

		// Create access token
		const AccessToken = twilio.jwt.AccessToken;
		const VideoGrant = AccessToken.VideoGrant;

		const token = new AccessToken(config.twilioAccountSid, config.twilioApiKey, config.twilioApiSecret, {
			identity,
			ttl: 3600, // Token valid for 1 hour
		});

		// Create video grant for the specific room
		const videoGrant = new VideoGrant({
			room: body.roomName,
		});

		token.addGrant(videoGrant);

		return {
			success: true,
			data: {
				token: token.toJwt(),
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
