/**
 * Unified Inbox — aggregates inbound signals across all surfaces.
 *
 * Sources:
 *  - Social activity (comments + mentions + DMs on connected accounts)
 *  - Comments on tickets/projects in the user's org (including from portal users)
 *  - Directus notifications for the current user
 *
 * Returns a unified flat list of InboxItem, newest first, with source-typed
 * links so the page can route the click to the right place.
 *
 * Query: organizationId, limit (default 50)
 */
import { readItems, readMe } from '@directus/sdk';

export interface InboxItem {
	id: string;
	source: 'social' | 'comment' | 'notification' | 'message';
	type: string;
	title: string;
	preview: string | null;
	actor: { name: string | null; avatar: string | null };
	createdAt: string;
	read: boolean;
	link: string;
	context?: { label: string; icon: string } | null;
	meta?: Record<string, any>;
}

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

	const query = getQuery(event);
	const orgId = query.organizationId as string;
	const limit = Math.min(200, Math.max(10, Number(query.limit) || 50));
	if (!orgId) throw createError({ statusCode: 400, message: 'organizationId is required' });

	const directus = await getUserDirectus(event);
	setResponseHeader(event, 'Cache-Control', 'private, max-age=15');

	const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

	// ─── 1. Social activity ───
	let social: any[] = [];
	try {
		const res = await $fetch('/api/social/activity', {
			query: { limit },
			headers: getRequestHeaders(event) as any,
		}).catch(() => ({ data: [] }));
		social = ((res as any)?.data || []) as any[];
	} catch {
		social = [];
	}

	// ─── 2. Comments authored by anyone *except* me, on items in my org ───
	let comments: any[] = [];
	try {
		comments = (await directus.request(readItems('comments', {
			filter: {
				date_created: { _gte: thirtyDaysAgo },
				user: { _neq: userId },
			},
			fields: [
				'id', 'comment', 'collection', 'item', 'tickets_id', 'date_created', 'is_resolved',
				'user.id', 'user.first_name', 'user.last_name', 'user.avatar',
			],
			sort: ['-date_created'],
			limit,
		}))) as any[];
	} catch {
		comments = [];
	}

	// ─── 3. Directus system notifications for me ───
	let notifs: any[] = [];
	try {
		const me = (await directus.request(readMe({ fields: ['id'] }))) as any;
		notifs = (await directus.request(readItems('directus_notifications' as any, {
			filter: {
				recipient: { _eq: me?.id || userId },
				timestamp: { _gte: thirtyDaysAgo },
			},
			fields: ['id', 'subject', 'message', 'timestamp', 'status', 'collection', 'item'],
			sort: ['-timestamp'],
			limit,
		}))) as any[];
	} catch {
		notifs = [];
	}

	const items: InboxItem[] = [];

	// Map social
	for (const a of social) {
		const platform = a.platform || 'social';
		const action = a.type === 'mention' ? 'mentioned you'
			: a.type === 'reaction' ? 'reacted to your post'
			: a.type === 'follow' ? 'followed you'
			: a.type === 'lead' ? 'sent a lead'
			: 'commented on your post';
		items.push({
			id: `social:${a.id}`,
			source: 'social',
			type: a.type,
			title: action,
			preview: a.preview || null,
			actor: { name: a.actor_name || a.account?.account_name || null, avatar: a.account?.profile_picture_url || null },
			createdAt: a.created_at,
			read: !!a.read,
			link: '/social/inbox',
			context: { label: platform, icon: `simple-icons:${platform}` },
			meta: { activityId: a.id, platform },
		});
	}

	// Map comments
	for (const c of comments) {
		const author = c.user && typeof c.user === 'object'
			? ([c.user.first_name, c.user.last_name].filter(Boolean).join(' ') || null)
			: null;
		const collection = c.collection || (c.tickets_id ? 'tickets' : null);
		const itemId = c.item || c.tickets_id;
		let link = '/';
		let contextLabel = 'comment';
		if (collection === 'tickets') { link = `/tickets/${itemId}`; contextLabel = 'ticket'; }
		else if (collection === 'projects') { link = `/projects/${itemId}`; contextLabel = 'project'; }
		else if (collection === 'video_meetings') { link = `/meetings/${itemId}`; contextLabel = 'meeting'; }
		else if (collection) { link = `/${collection}/${itemId}`; contextLabel = collection; }

		const preview = (c.comment || '').replace(/<[^>]+>/g, '').slice(0, 160);
		items.push({
			id: `comment:${c.id}`,
			source: 'comment',
			type: 'comment',
			title: `${author || 'Someone'} commented`,
			preview: preview || null,
			actor: { name: author, avatar: c.user?.avatar || null },
			createdAt: c.date_created,
			read: !!c.is_resolved,
			link,
			context: { label: contextLabel, icon: 'lucide:message-square' },
			meta: { commentId: c.id, collection, itemId },
		});
	}

	// Map notifications
	for (const n of notifs) {
		const collection = n.collection;
		const itemId = n.item;
		let link = '/';
		if (collection === 'tickets') link = `/tickets/${itemId}`;
		else if (collection === 'projects') link = `/projects/${itemId}`;
		else if (collection === 'video_meetings') link = `/meetings/${itemId}`;
		else if (collection === 'invoices') link = `/invoices/${itemId}`;
		else if (collection) link = `/${collection}/${itemId}`;

		items.push({
			id: `notif:${n.id}`,
			source: 'notification',
			type: 'notification',
			title: n.subject || 'Notification',
			preview: n.message || null,
			actor: { name: null, avatar: null },
			createdAt: n.timestamp,
			read: n.status !== 'inbox',
			link,
			context: collection ? { label: collection, icon: 'lucide:bell' } : null,
			meta: { notificationId: n.id, collection, itemId },
		});
	}

	items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
	const limited = items.slice(0, limit);

	const counts = {
		total: limited.length,
		unread: limited.filter((i) => !i.read).length,
		bySource: {
			social: limited.filter((i) => i.source === 'social').length,
			comment: limited.filter((i) => i.source === 'comment').length,
			notification: limited.filter((i) => i.source === 'notification').length,
		},
	};

	return { items: limited, counts };
});
