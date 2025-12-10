// server/api/video/token.post.ts
// Generate Twilio video token for joining a room

import twilio from 'twilio';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const body = await readBody(event);

	const { roomName, identity } = body;

	if (!roomName) {
		throw createError({ statusCode: 400, message: 'roomName is required' });
	}

	if (!identity) {
		throw createError({ statusCode: 400, message: 'identity is required' });
	}

	try {
		const { AccessToken } = twilio.jwt;
		const { VideoGrant } = AccessToken;

		// Create access token
		const token = new AccessToken(config.twilioAccountSid, config.twilioApiKey, config.twilioApiSecret, { identity });

		// Grant access to Video
		const videoGrant = new VideoGrant({
			room: roomName,
		});
		token.addGrant(videoGrant);

		// Set token TTL (1 hour)
		token.ttl = 3600;

		return {
			token: token.toJwt(),
			identity,
			roomName,
		};
	} catch (error: any) {
		console.error('Token generation error:', error);
		throw createError({
			statusCode: 500,
			message: error.message || 'Failed to generate token',
		});
	}
});
