// server/api/video/token.post.ts
// Generates Twilio Video access token for participants

import twilio from 'twilio';

const { AccessToken } = twilio.jwt;
const { VideoGrant } = AccessToken;

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();

	console.log('='.repeat(60));
	console.log('🎫 VIDEO TOKEN REQUEST');
	console.log('='.repeat(60));

	try {
		const body = await readBody(event);

		const { roomName, identity, password } = body;

		if (!roomName) {
			throw createError({
				statusCode: 400,
				message: 'Room name is required',
			});
		}

		if (!identity) {
			throw createError({
				statusCode: 400,
				message: 'Identity (participant name) is required',
			});
		}

		console.log(`Room: ${roomName}`);
		console.log(`Identity: ${identity}`);

		// Get Twilio credentials
		const twilioAccountSid = config.twilioAccountSid as string;
		const twilioApiKey = config.twilioApiKey as string;
		const twilioApiSecret = config.twilioApiSecret as string;

		if (!twilioAccountSid || !twilioApiKey || !twilioApiSecret) {
			console.error('❌ Missing Twilio credentials');
			throw createError({
				statusCode: 500,
				message: 'Video service not configured',
			});
		}

		// Optional: Verify meeting password from Directus
		if (password !== undefined) {
			const directusUrl = config.public.directusUrl;
			const directusToken = config.directusServerToken as string;

			if (directusUrl && directusToken) {
				const { createDirectus, rest, staticToken, readItems } = await import('@directus/sdk');
				const directus = createDirectus(directusUrl).with(rest()).with(staticToken(directusToken));

				try {
					const meetings = await directus.request(
						readItems('video_meetings', {
							filter: { room_name: { _eq: roomName } },
							limit: 1,
						}),
					);

					if (meetings.length > 0) {
						const meeting = meetings[0] as any;

						// Check if meeting requires password
						if (meeting.password && meeting.password !== password) {
							throw createError({
								statusCode: 401,
								message: 'Invalid meeting password',
							});
						}

						// Check if meeting is cancelled
						if (meeting.status === 'cancelled') {
							throw createError({
								statusCode: 410,
								message: 'This meeting has been cancelled',
							});
						}
					}
				} catch (dbError: any) {
					if (dbError.statusCode) throw dbError;
					console.error('⚠️ Could not verify meeting:', dbError);
				}
			}
		}

		// Create access token
		const token = new AccessToken(twilioAccountSid, twilioApiKey, twilioApiSecret, {
			identity: identity,
			ttl: 14400, // 4 hours
		});

		// Grant access to the video room
		const videoGrant = new VideoGrant({
			room: roomName,
		});
		token.addGrant(videoGrant);

		const jwt = token.toJwt();
		console.log('✅ Token generated');

		return {
			success: true,
			token: jwt,
			identity,
			roomName,
		};
	} catch (error: any) {
		console.error('❌ TOKEN ERROR:', error);

		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to generate token',
		});
	}
});
