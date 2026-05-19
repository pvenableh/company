// POST /api/push/subscribe — upsert a push subscription for the signed-in
// user. The browser calls this after a successful pushManager.subscribe(),
// passing the endpoint + crypto keys.
//
// We upsert by endpoint (the unique identifier the push service issued) so
// repeated calls from the same device don't pile up rows. Origin defaults
// to the request host, but is also accepted in the body for tests.

import { createItem, readItems, updateItem } from '@directus/sdk'

interface SubscribeBody {
	endpoint?: string
	keys?: { p256dh?: string; auth?: string }
	origin?: string
	user_agent?: string
}

export default defineEventHandler(async (event) => {
	const session = await getUserSession(event)
	const userId = (session?.user as any)?.id
	if (!userId) {
		throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
	}

	const body = (await readBody<SubscribeBody>(event)) || {}
	const endpoint = body.endpoint
	const p256dh = body.keys?.p256dh
	const auth = body.keys?.auth
	if (!endpoint || !p256dh || !auth) {
		throw createError({ statusCode: 400, statusMessage: 'endpoint + keys.p256dh + keys.auth required' })
	}

	const hdrs = getRequestHeaders(event)
	const origin =
		body.origin ||
		hdrs.origin ||
		(hdrs.host ? `https://${hdrs.host}` : '') ||
		'unknown'
	const userAgent = body.user_agent || hdrs['user-agent'] || null

	const directus = getServerDirectus()

	// Look for an existing row with this endpoint (the push service issues a
	// stable URL per device + origin + subscription).
	let existing: any = null
	try {
		const rows = (await directus.request(
			readItems('push_subscriptions' as any, {
				filter: { endpoint: { _eq: endpoint } } as any,
				fields: ['id', 'user'] as any,
				limit: 1,
			} as any),
		)) as any[]
		existing = rows?.[0] || null
	} catch (err) {
		console.error('[push/subscribe] lookup failed:', err)
	}

	try {
		if (existing) {
			await directus.request(
				updateItem('push_subscriptions' as any, existing.id, {
					user: userId,
					origin,
					p256dh,
					auth,
					user_agent: userAgent,
				} as any),
			)
			return { id: existing.id, upserted: true }
		}
		const created: any = await directus.request(
			createItem('push_subscriptions' as any, {
				user: userId,
				origin,
				endpoint,
				p256dh,
				auth,
				user_agent: userAgent,
			} as any),
		)
		return { id: created?.id, upserted: false }
	} catch (err: any) {
		console.error('[push/subscribe] write failed:', err?.message || err)
		throw createError({ statusCode: 500, statusMessage: 'Could not save subscription' })
	}
})
