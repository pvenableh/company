/**
 * useUnreadByCategory — group the bell's unread notifications by category.
 *
 * Reads off `useNotifications().notifications` (the realtime-backed list
 * of inbox rows) and returns a `{ [category]: count }` map plus a tiny
 * `countFor(category)` helper. The rail components consume `countFor` to
 * render a badge on each nav chip, so the same source-of-truth that
 * drives the bell drives the rail badges — no extra query.
 *
 * Category resolution: heuristic from `subject` + `collection`. The
 * Directus `directus_notifications` system collection doesn't carry a
 * metadata JSON column out of the box, so we don't try to read one. If a
 * future migration adds it, this composable can prefer a stamped value
 * over the heuristic.
 */

import type { Ref } from 'vue';

type CategoryKey =
	| 'conversations'
	| 'reactions'
	| 'tickets'
	| 'projects'
	| 'invoices'
	| 'contracts'
	| 'proposals'
	| 'meetings';

interface BellRow {
	id?: string;
	collection?: string | null;
	subject?: string | null;
}

function categoryFor(notification: BellRow): CategoryKey | null {
	const subject = (notification?.subject || '').toLowerCase();
	if (subject.includes('react')) return 'reactions';
	if (subject.includes('mention')) return 'conversations';
	if (subject.startsWith('new comment') || subject.includes('comment on')) return 'conversations';

	switch (notification?.collection) {
		case 'comments':
		case 'messages':
			return 'conversations';
		case 'tickets':
			return 'tickets';
		case 'projects':
		case 'project_tasks':
		case 'project_events':
			return 'projects';
		case 'invoices':
			return 'invoices';
		case 'contracts':
			return 'contracts';
		case 'proposals':
			return 'proposals';
		case 'video_meetings':
		case 'appointments':
			return 'meetings';
		default:
			return null;
	}
}

export function useUnreadByCategory() {
	const { notifications } = useNotifications();
	const rows = notifications as Ref<BellRow[]>;

	const counts = computed<Record<string, number>>(() => {
		const out: Record<string, number> = {};
		const list = rows.value ?? [];
		for (const row of list) {
			const cat = categoryFor(row);
			if (!cat) continue;
			out[cat] = (out[cat] || 0) + 1;
		}
		return out;
	});

	function countFor(category: string | null | undefined): number {
		if (!category) return 0;
		return counts.value[category] ?? 0;
	}

	return { counts, countFor };
}
