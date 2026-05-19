// server/utils/notify-event.ts
// emitNotification — single fan-out helper for every notification source.
//
// For each (deduped) recipient:
//   1. Insert (or upsert, for reactions) a `directus_notifications` row.
//   2. If the category is emailable AND the recipient's prefs allow it,
//      send a SendGrid email via `sendNotificationEmail`.
//
// Reaction category is never emailed, even when the recipient has
// `notification_preferences.reactions === true`. The toggle only controls
// whether the bell row is created at all.
//
// Recipient pref lookup happens here (single source of truth) so callers
// don't each have to re-implement the master-toggle / per-category check.

import { createNotification, readNotifications, readUsers, updateNotification } from '@directus/sdk';
import { ctaLabelFor, sendNotificationEmail } from './notification-emails';
import { fetchOrgBrand } from './email-send';
import { NEVER_EMAIL, type NotificationCategory } from './notification-categories';
import { pushToUser } from './web-push';

interface EmitArgs {
	category: NotificationCategory;
	/** Stable string used by the bell to filter type chips. */
	type?: string;
	/** The parent item the notification points at — what the user clicks through to. */
	collection: string;
	itemId: string;
	/** Optional org scope — written onto the row so admin queries can filter. */
	orgId?: string | null;
	/** Notification author (skipped from recipient list). */
	actorId?: string | null;
	actorName?: string | null;
	recipientIds: string[];
	subject: string;
	message: string;
	/** Absolute URL to the item; if relative, callers should prepend the app base. */
	link?: string | null;
	/** Optional metadata stuffed into the row's metadata JSON column. */
	metadata?: Record<string, any>;
}

interface RecipientRow {
	id: string;
	email: string | null;
	first_name: string | null;
	last_name: string | null;
	email_notifications: boolean | null;
	notification_preferences: Record<string, boolean> | null;
}

const RECIPIENT_FIELDS = [
	'id',
	'email',
	'first_name',
	'last_name',
	'email_notifications',
	'notification_preferences',
] as const;

/**
 * Returns true if this category is allowed to send an email to this recipient.
 * Bell rows are still created regardless — emailability only controls SendGrid.
 */
function emailAllowed(recipient: RecipientRow, category: NotificationCategory): boolean {
	if (NEVER_EMAIL.has(category)) return false;
	if (recipient.email_notifications === false) return false;
	if (!recipient.email) return false;
	const prefs = recipient.notification_preferences || {};
	if (prefs._all === false) return false;
	// Per-category opt-out: only suppress on explicit false. Missing key = opt-in.
	if (prefs[category] === false) return false;
	return true;
}

/**
 * Same check, but for the bell row itself. Right now the only category that
 * the toggle suppresses at the bell level is reactions — every other
 * category always writes a bell row, and the toggle only controls email.
 * (Rationale: if you turned off "Invoices" emails, you probably still want
 * to know in-app. Reactions are noise-heavy, so the toggle is bell-level.)
 */
function bellAllowed(recipient: RecipientRow, category: NotificationCategory): boolean {
	if (category !== 'reactions') return true;
	const prefs = recipient.notification_preferences || {};
	return prefs.reactions !== false;
}

/**
 * Whether to fan out a Web Push for this recipient + category. Push is
 * gated on the per-category opt-out (same as email) but NOT on the
 * `email_notifications` master toggle — push is its own channel. The
 * reactions category never pushes (mirrors the email NEVER_EMAIL rule —
 * lock-screen noise is worse than inbox noise).
 *
 * No "master push" pref key: enabling push is opt-in already (the user
 * must explicitly subscribe in NotificationsMenu). If the subscription
 * exists, they want to be pinged.
 */
function pushAllowed(recipient: RecipientRow, category: NotificationCategory): boolean {
	if (NEVER_EMAIL.has(category)) return false;
	const prefs = recipient.notification_preferences || {};
	if (prefs._all === false) return false;
	if (prefs[category] === false) return false;
	return true;
}

export async function emitNotification(args: EmitArgs): Promise<{ bellSent: number; emailSent: number }> {
	const {
		category,
		type,
		collection,
		itemId,
		orgId,
		actorId,
		actorName,
		recipientIds,
		subject,
		message,
		link,
		metadata,
	} = args;

	const unique = Array.from(new Set(recipientIds)).filter((id) => id && id !== actorId);
	if (unique.length === 0) return { bellSent: 0, emailSent: 0 };

	const directus = getServerDirectus();
	const config = useRuntimeConfig();

	// Resolve org brand once — every recipient on this fan-out shares the
	// same org chrome. Null falls through to Earnest branding inside
	// sendNotificationEmail.
	const orgBrand = orgId ? await fetchOrgBrand(orgId) : null;

	let recipients: RecipientRow[] = [];
	try {
		recipients = (await directus.request(
			readUsers({
				filter: { id: { _in: unique } } as any,
				fields: RECIPIENT_FIELDS as any,
				limit: -1,
			}),
		)) as any;
	} catch (err) {
		console.error('[notify-event] failed to load recipients:', err);
		return { bellSent: 0, emailSent: 0 };
	}

	let bellSent = 0;
	let emailSent = 0;

	await Promise.allSettled(
		recipients.map(async (recipient) => {
			if (bellAllowed(recipient, category)) {
				try {
					if (category === 'reactions') {
						await upsertReactionBell({
							directus,
							recipientId: recipient.id,
							actorId,
							actorName,
							subject,
							message,
							collection,
							itemId,
						});
					} else {
						await directus.request(
							createNotification({
								recipient: recipient.id,
								sender: actorId || undefined,
								subject,
								message,
								collection,
								item: itemId,
								status: 'inbox',
							} as any),
						);
					}
					bellSent++;
				} catch (err) {
					console.error('[notify-event] bell write failed for', recipient.id, err);
				}
			}

			// Push fanout — fire-and-forget. Don't await; we don't want
			// notification latency on the request that triggered the fanout.
			if (pushAllowed(recipient, category)) {
				void pushToUser(recipient.id, {
					title: subject,
					body: stripHtmlTags(message) || subject,
					url: link || undefined,
					tag: `${collection}:${itemId}`,
					data: { category, collection, itemId },
				});
			}

			if (!emailAllowed(recipient, category)) return;

			const recipientName = recipient.first_name || recipient.email?.split('@')[0] || 'there';
			try {
				await sendNotificationEmail({
					to: recipient.email!,
					recipientName,
					subject,
					heading: subject,
					body: stripHtmlTags(message) || subject,
					link: link || null,
					ctaLabel: ctaLabelFor(category),
					org: orgBrand,
				});
				emailSent++;
			} catch (err) {
				console.error('[notify-event] email failed for', recipient.email, err);
			}
		}),
	);

	return { bellSent, emailSent };
}

interface UpsertArgs {
	directus: any;
	recipientId: string;
	actorId?: string | null;
	actorName?: string | null;
	subject: string;
	message: string;
	collection: string;
	itemId: string;
}

/**
 * Reactions are noisy. Rather than one bell row per reaction, look for an
 * existing **unread** row for the same recipient + item and — if it's
 * clearly a reaction row (subject begins with "New reaction" / "Someone
 * reacted") — update it in place by bumping its timestamp and folding the
 * latest actor into the message. Once the user reads it, the next reaction
 * starts a fresh row.
 *
 * Without a `metadata` JSON column on directus_notifications we can't
 * track an actor list cleanly, so this is best-effort: it dedupes
 * runaway-reaction noise but doesn't enumerate every actor.
 */
async function upsertReactionBell(args: UpsertArgs) {
	const { directus, recipientId, actorId, actorName, subject, message, collection, itemId } = args;

	let existing: any[] = [];
	try {
		existing = (await directus.request(
			readNotifications({
				filter: {
					_and: [
						{ recipient: { _eq: recipientId } },
						{ status: { _eq: 'inbox' } },
						{ collection: { _eq: collection } },
						{ item: { _eq: itemId } },
					],
				} as any,
				fields: ['id', 'subject', 'message'] as any,
				limit: 5,
				sort: ['-timestamp'] as any,
			}),
		)) as any[];
	} catch (err) {
		console.error('[notify-event] reaction lookup failed:', err);
	}

	const candidate = existing.find((row: any) => {
		const s = String(row?.subject || '').toLowerCase();
		return s.includes('reaction') || s.includes('reacted');
	});

	if (candidate) {
		const actorLabel = actorName || 'Someone';
		const folded = `${actorLabel} and others reacted`;
		try {
			await directus.request(
				updateNotification(candidate.id, {
					subject: 'New reactions',
					message: folded,
					sender: actorId || undefined,
				} as any),
			);
			return;
		} catch (err) {
			console.error('[notify-event] reaction upsert failed; falling through to insert:', err);
		}
	}

	await directus.request(
		createNotification({
			recipient: recipientId,
			sender: actorId || undefined,
			subject,
			message,
			collection,
			item: itemId,
			status: 'inbox',
		} as any),
	);
}

function stripHtmlTags(html: string | null | undefined): string {
	if (!html) return '';
	return html.replace(/<[^>]*>?/gm, '');
}
