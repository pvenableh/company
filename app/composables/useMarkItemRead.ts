/**
 * useMarkItemRead — auto-archive bell rows when the user opens the item.
 *
 * Drop into a detail page's setup block:
 *
 *   useMarkItemRead('tickets', ticketId);
 *
 * On mount (and whenever `itemId` changes) it queries the current user's
 * unread notifications for that (collection, item) pair and archives
 * them. Quietly no-ops on SSR, when the user isn't logged in, or when
 * there's nothing to mark.
 *
 * Why server-side: marking-read is a write against directus_notifications.
 * The endpoint already exists for the bell — we just call it with a list.
 *
 * Cascades to the rail badges + the bell's unread count for free since
 * both read off the same realtime subscription.
 */

import { unref, type MaybeRefOrGetter } from 'vue';

export function useMarkItemRead(
	collection: string,
	itemId: MaybeRefOrGetter<string | null | undefined>,
) {
	const { user } = useUserSession();
	const { readNotifications } = useDirectusNotifications();
	// Use the bell's markAsRead path (status='archived'), not the polyfill
	// `markMultipleAsRead` on useDirectusNotifications (which sets read=true
	// but doesn't move rows out of inbox — that field-vs-status divergence is
	// a known wart, but for now the canonical "read" is status=archived).
	const { markAsRead } = useNotifications();

	async function run() {
		if (!import.meta.client) return;
		const id = typeof itemId === 'function' ? (itemId as any)() : unref(itemId as any);
		if (!id || !user.value?.id) return;

		try {
			const rows = (await readNotifications({
				filter: {
					_and: [
						{ recipient: { _eq: user.value.id } },
						{ status: { _eq: 'inbox' } },
						{ collection: { _eq: collection } },
						{ item: { _eq: id } },
					],
				},
				fields: ['id'],
				limit: 50,
			})) as Array<{ id: string }>;

			const ids = (rows || []).map((r) => r.id).filter(Boolean);
			if (ids.length === 0) return;
			await Promise.allSettled(ids.map((rowId) => markAsRead(rowId)));
		} catch (err) {
			// Non-fatal — the user can still see + mark them via the bell.
			console.warn('[useMarkItemRead] could not mark notifications read:', err);
		}
	}

	onMounted(() => {
		run();
	});

	watch(
		() => (typeof itemId === 'function' ? (itemId as any)() : unref(itemId as any)),
		(next, prev) => {
			if (next && next !== prev) run();
		},
	);
}
