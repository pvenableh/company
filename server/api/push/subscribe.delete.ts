// DELETE /api/push/subscribe — remove a push subscription by endpoint. Used
// when the user disables push in settings, or when the browser hands us a
// fresh subscription (the old endpoint is stale).
//
// Auth-gated: a user can only delete subscriptions owned by them.

import { deleteItems, readItems } from '@directus/sdk'

interface UnsubscribeBody {
	endpoint?: string
}

export default defineEventHandler(async (event) => {
	const session = await getUserSession(event)
	const userId = (session?.user as any)?.id
	if (!userId) {
		throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
	}

	const body = (await readBody<UnsubscribeBody>(event)) || {}
	const endpoint = body.endpoint
	if (!endpoint) {
		throw createError({ statusCode: 400, statusMessage: 'endpoint required' })
	}

	const directus = getServerDirectus()
	try {
		const rows = (await directus.request(
			readItems('push_subscriptions' as any, {
				filter: {
					_and: [{ endpoint: { _eq: endpoint } }, { user: { _eq: userId } }],
				} as any,
				fields: ['id'] as any,
				limit: 1,
			} as any),
		)) as any[]
		const id = rows?.[0]?.id
		if (!id) return { deleted: false }
		await directus.request(deleteItems('push_subscriptions' as any, [id]))
		return { deleted: true }
	} catch (err: any) {
		console.error('[push/subscribe.delete] failed:', err?.message || err)
		throw createError({ statusCode: 500, statusMessage: 'Could not remove subscription' })
	}
})
