// server/api/video/setup-webhook.post.ts
/**
 * One-time setup: register the Daily.co webhook endpoint.
 * Call this once after deploying, or when the webhook URL changes.
 *
 * POST /api/video/setup-webhook
 * Body: { url?: string }  — optional override, defaults to {siteUrl}/api/video/webhook
 *
 * Requires admin authentication.
 *
 * Daily.co docs: https://docs.daily.co/reference/rest-api/webhooks/create
 */

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const config = useRuntimeConfig();
	const body = await readBody(event);
	const baseUrl = body?.url || config.public.siteUrl || 'https://earnest.guru';
	const webhookUrl = `${baseUrl}/api/video/webhook`;

	const dailyApiKey = (config as any).dailyApiKey || process.env.DAILY_API_KEY;
	if (!dailyApiKey) {
		throw createError({ statusCode: 500, message: 'DAILY_API_KEY is not configured' });
	}

	try {
		// Check if a webhook already exists
		const listRes = await fetch('https://api.daily.co/v1/webhooks', {
			headers: { 'Authorization': `Bearer ${dailyApiKey}` },
		});
		const existing = await listRes.json();

		if (existing?.data?.length > 0) {
			// Update the existing webhook
			const existingId = existing.data[0].uuid;
			const updateRes = await fetch(`https://api.daily.co/v1/webhooks/${existingId}`, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${dailyApiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					url: webhookUrl,
					eventTypes: [
						'meeting.started',
						'meeting.ended',
						'meeting.participant-joined',
						'meeting.participant-left',
						'recording.ready-to-download',
					],
				}),
			});
			const updated = await updateRes.json();
			return { success: true, action: 'updated', webhook: updated };
		}

		// Create a new webhook
		const createRes = await fetch('https://api.daily.co/v1/webhooks', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${dailyApiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				url: webhookUrl,
				eventTypes: [
					'meeting.started',
					'meeting.ended',
					'meeting.participant-joined',
					'meeting.participant-left',
					'recording.ready-to-download',
				],
			}),
		});

		if (!createRes.ok) {
			const error = await createRes.text();
			throw new Error(`Daily.co webhook registration failed: ${error}`);
		}

		const created = await createRes.json();
		return { success: true, action: 'created', webhook: created };
	} catch (error: any) {
		console.error('[video/setup-webhook] Error:', error);
		throw createError({
			statusCode: 500,
			message: error.message || 'Failed to register Daily.co webhook',
		});
	}
});
