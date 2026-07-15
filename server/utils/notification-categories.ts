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
// Reactions are the noisy category: their EMAIL is opt-IN (off by default) and
// they never push, but a user can now enable reaction emails if they want them.
// Per-channel gating (bell / email / push) lives in notify-event.ts.

export type NotificationCategory =
	| 'conversations'
	| 'reactions'
	| 'tickets'
	| 'tasks'
	| 'projects'
	| 'invoices'
	| 'contracts'
	| 'proposals'
	| 'meetings';

/**
 * Categories HARD-blocked from ever emailing, regardless of user prefs. Now
 * empty — reactions are gated by an opt-in default in notify-event.ts instead
 * of a hard lock, so users can choose to receive them. Kept as an export for
 * API stability / future policy blocks.
 */
export const NEVER_EMAIL: ReadonlySet<NotificationCategory> = new Set();

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
		case 'tasks': return 'tasks';
		case 'project_events': return 'projects';
		case 'invoices': return 'invoices';
		case 'contracts': return 'contracts';
		case 'proposals': return 'proposals';
		case 'video_meetings': return 'meetings';
		case 'appointments': return 'meetings';
		case 'messages': return 'conversations';
		case 'comments': return 'conversations';
		// Studio posts are project work-items in the retainer model; route
		// review-time notifications through the projects category so portal
		// users use a single toggle for "work I'm reviewing".
		case 'social_posts': return 'projects';
		default: return null;
	}
}
