// server/utils/notification-categories.ts
// Shared category definitions for the portal/staff notification system.
//
// Categories serve three jobs at once:
//   1. The user-visible groupings in the Settings panel (and the labels they
//      see for toggles).
//   2. The keys in `directus_users.notification_preferences` JSON map —
//      `{ conversations: true, reactions: false, ... }`. Falsey = opt-out.
//   3. The grouping key for rail-badge counts.
//
// Reactions are special: even when `notification_preferences.reactions` is
// true, email is never sent for that category. The toggle controls only
// whether bell rows are created at all.

export type NotificationCategory =
	| 'conversations'
	| 'reactions'
	| 'tickets'
	| 'projects'
	| 'invoices'
	| 'contracts'
	| 'proposals'
	| 'meetings';

export const NEVER_EMAIL: ReadonlySet<NotificationCategory> = new Set(['reactions']);

/**
 * Maps the source collection of a notification (the *parent* item — the
 * ticket/project/invoice/etc., NOT the comments/reactions wrapper) onto its
 * notification category. Used by rail-badge grouping and email category
 * dispatch.
 */
export function categoryForCollection(collection: string | null | undefined): NotificationCategory | null {
	if (!collection) return null;
	switch (collection) {
		case 'tickets': return 'tickets';
		case 'projects': return 'projects';
		case 'project_tasks': return 'projects';
		case 'project_events': return 'projects';
		case 'invoices': return 'invoices';
		case 'contracts': return 'contracts';
		case 'proposals': return 'proposals';
		case 'video_meetings': return 'meetings';
		case 'appointments': return 'meetings';
		case 'messages': return 'conversations';
		case 'comments': return 'conversations';
		default: return null;
	}
}
