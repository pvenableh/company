// server/utils/notificationRecipients.ts
/**
 * Resolves which users should receive notifications for a given event.
 *
 * Each branch in `resolveNotificationTargets` returns one or more
 * `NotificationTarget`s — { recipientId, category, subject, message, ... }.
 * The trigger endpoint hands these to `emitNotification` which does the
 * actual bell + email fan-out (with pref checks).
 *
 * Portal-aware: most "X happened" events also notify portal users on the
 * client that owns the X. Portal recipients are resolved via
 * `getClientPortalRecipients` — it walks UP the parent_client chain (up to
 * 2 hops) so a portal user rooted on a parent client sees activity on
 * descendant clients.
 */

import { readItems, readItem } from '@directus/sdk';
import { parseMentions } from './mentionParser';
import type { NotificationCategory } from './notification-categories';

interface NotificationEvent {
	collection: string;
	action: 'create' | 'update' | 'delete';
	item: Record<string, any>;
	itemId: string;
	userId: string;
	orgId?: string;
	/** Optional: the previous version of the item for diff-based triggers.
	 * Set this when the caller has access to the pre-update state — lets us
	 * notify only on meaningful field changes rather than every PATCH. */
	previousItem?: Record<string, any>;
	/** When true, suppress the portal-user fan-out entirely — only internal
	 * staff (assignees + org admins) are notified. Used by the inline
	 * return-leg callers (a client just signed/paid/approved): we notify the
	 * agency, never echo the action back to the client. Defaults to false so
	 * the Flow-webhook path keeps its existing portal behaviour. */
	staffOnly?: boolean;
}

export interface NotificationTarget {
	recipientId: string;
	category: NotificationCategory;
	type: string;
	subject: string;
	message: string;
	/** Item the bell row points at (the parent, e.g. the ticket, not the comment). */
	collection: string;
	itemId: string;
	/** Optional structured metadata to stash on the row (e.g. reaction emoji). */
	metadata?: Record<string, any>;
}

export async function resolveNotificationTargets(
	directus: any,
	event: NotificationEvent,
): Promise<NotificationTarget[]> {
	const targets: NotificationTarget[] = [];
	const { collection, action, item, itemId, userId, orgId, previousItem, staffOnly } = event;

	try {
		switch (collection) {
			case 'comments':
				await resolveCommentTargets(directus, item, itemId, userId, targets, staffOnly);
				break;

			case 'reactions':
				await resolveReactionTargets(directus, item, userId, targets);
				break;

			case 'tickets':
				if (action === 'create') {
					await resolveTicketCreateTargets(directus, item, itemId, userId, orgId, targets, staffOnly);
				} else if (action === 'update') {
					await resolveTicketUpdateTargets(directus, item, previousItem, itemId, userId, targets, staffOnly);
				}
				break;

			case 'tasks':
				if (action === 'update') {
					await resolveTaskUpdateTargets(item, itemId, userId, targets);
				}
				break;

			case 'projects':
				if (action === 'update') {
					await resolveProjectUpdateTargets(directus, item, previousItem, itemId, userId, targets, staffOnly);
				}
				break;

			case 'invoices':
				if (action === 'update' || action === 'create') {
					await resolveInvoiceTargets(directus, item, previousItem, itemId, userId, orgId, targets, staffOnly);
				}
				break;

			case 'contracts':
				if (action === 'update' || action === 'create') {
					await resolveContractTargets(directus, item, previousItem, itemId, userId, orgId, targets, staffOnly);
				}
				break;

			case 'proposals':
				if (action === 'update' || action === 'create') {
					await resolveProposalTargets(directus, item, previousItem, itemId, userId, orgId, targets);
				}
				break;

			case 'project_events':
				if (action === 'create' || action === 'update') {
					await resolveProjectEventTargets(directus, item, userId, targets);
				}
				break;

			case 'video_meetings':
				if (action === 'create') {
					await resolveVideoMeetingTargets(item, itemId, userId, targets);
				}
				break;

			// ── Return-leg inbound events (always staff-only) ──────────────────
			case 'csat':
				await resolveCsatTargets(directus, item, userId, orgId, targets);
				break;

			case 'content_plans':
				await resolveContentPlanTargets(directus, item, itemId, userId, orgId, targets);
				break;

			case 'social_posts':
				// Only the request-changes signal routes here (assigned staffer).
				await resolveSocialPostChangeTargets(directus, item, itemId, userId, orgId, targets);
				break;
		}
	} catch (err) {
		console.error(`[notificationRecipients] Error resolving targets for ${collection}:`, err);
	}

	return targets;
}

// ── Comments ───────────────────────────────────────────────────────────────────

async function resolveCommentTargets(
	directus: any,
	item: Record<string, any>,
	itemId: string,
	userId: string,
	targets: NotificationTarget[],
	staffOnly?: boolean,
) {
	const text = item.content || item.comment || '';
	const parentCollection = item.collection;
	const parentId = item.item;

	const mentions = parseMentions(text);
	const mentioned = new Set(mentions.filter((m) => m && m !== userId));

	for (const id of mentioned) {
		targets.push({
			recipientId: id,
			category: 'conversations',
			type: 'mention',
			subject: 'You were mentioned in a comment',
			message: truncateText(text, 160),
			collection: parentCollection || 'comments',
			itemId: parentId || itemId,
		});
	}

	if (!parentCollection || !parentId) return;

	// Staff: existing assignees on the parent item.
	const staff = await getItemAssignees(directus, parentCollection, parentId);
	for (const id of staff) {
		if (id === userId || mentioned.has(id)) continue;
		targets.push({
			recipientId: id,
			category: 'conversations',
			type: 'comment',
			subject: `New comment on ${formatCollectionName(parentCollection)}`,
			message: truncateText(text, 160),
			collection: parentCollection,
			itemId: parentId,
		});
	}

	// Portal users: anyone whose client_portal_users.client is an ancestor
	// of the parent item's client (or the client itself).
	const clientId = staffOnly ? null : await getItemClientId(directus, parentCollection, parentId);
	if (clientId) {
		const portalRecipients = await getClientPortalRecipients(directus, clientId);
		for (const id of portalRecipients) {
			if (id === userId || mentioned.has(id)) continue;
			if (staff.includes(id)) continue;
			targets.push({
				recipientId: id,
				category: 'conversations',
				type: 'comment',
				subject: `New comment on ${formatCollectionName(parentCollection)}`,
				message: truncateText(text, 160),
				collection: parentCollection,
				itemId: parentId,
			});
		}
	}
}

// ── Reactions ──────────────────────────────────────────────────────────────────

async function resolveReactionTargets(
	directus: any,
	item: Record<string, any>,
	userId: string,
	targets: NotificationTarget[],
) {
	// Reactions schema uses `table` not `collection`. Accept both for forward-
	// compat with anything that sends a normalized "collection" key.
	const reactedCollection = item.table || item.collection;
	const reactedItem = item.item;
	if (!reactedCollection || !reactedItem) return;

	const authorId = await getItemAuthor(directus, reactedCollection, reactedItem);
	if (!authorId || authorId === userId) return;

	const emoji = item.reaction || item.emoji || item.value || '';
	targets.push({
		recipientId: authorId,
		category: 'reactions',
		type: 'reaction',
		subject: `New reaction`,
		message: emoji ? `Someone reacted ${emoji} to your ${formatCollectionName(reactedCollection)}` : `Someone reacted to your ${formatCollectionName(reactedCollection)}`,
		collection: reactedCollection,
		itemId: reactedItem,
		metadata: { emoji },
	});
}

// ── Tickets ────────────────────────────────────────────────────────────────────

async function resolveTicketUpdateTargets(
	directus: any,
	item: Record<string, any>,
	previousItem: Record<string, any> | undefined,
	itemId: string,
	userId: string,
	targets: NotificationTarget[],
	staffOnly?: boolean,
) {
	const statusChanged = item.status && (!previousItem || previousItem.status !== item.status);
	const assignmentChanged = item.assigned_to && (!previousItem || JSON.stringify(previousItem.assigned_to) !== JSON.stringify(item.assigned_to));

	if (!statusChanged && !assignmentChanged) return;

	// Staff assignees + portal users on the ticket's client share this branch.
	const staff = await getItemAssignees(directus, 'tickets', itemId);
	const clientId = staffOnly ? null : await getItemClientId(directus, 'tickets', itemId);
	const portal = clientId ? await getClientPortalRecipients(directus, clientId) : [];
	const recipients = unique([...staff, ...portal]);

	if (statusChanged) {
		for (const id of recipients) {
			if (id === userId) continue;
			targets.push({
				recipientId: id,
				category: 'tickets',
				type: 'ticket.status_changed',
				subject: `Ticket status: ${formatStatus(item.status)}`,
				message: item.title || 'Ticket updated',
				collection: 'tickets',
				itemId,
			});
		}
	}

	if (assignmentChanged) {
		const assignees = await getItemAssignees(directus, 'tickets', itemId);
		for (const id of assignees) {
			if (id === userId) continue;
			targets.push({
				recipientId: id,
				category: 'tickets',
				type: 'ticket.assigned',
				subject: 'You were assigned to a ticket',
				message: item.title || 'New ticket assignment',
				collection: 'tickets',
				itemId,
			});
		}
	}
}

// ── Ticket create (new ticket opened) ──────────────────────────────────────────
// The Flow-webhook resolver only handled updates. A brand-new ticket — often
// opened by a client in the portal — needs to reach the agency. Notify current
// assignees plus org admins so nothing lands unwatched. Portal fan-out is
// suppressed under staffOnly (the client who opened it doesn't need an echo).

async function resolveTicketCreateTargets(
	directus: any,
	item: Record<string, any>,
	itemId: string,
	userId: string,
	orgId: string | undefined,
	targets: NotificationTarget[],
	staffOnly?: boolean,
) {
	const staff = await getItemAssignees(directus, 'tickets', itemId);
	const admins = orgId ? await getOrgAdmins(directus, orgId) : [];
	const clientId = staffOnly ? null : await getItemClientId(directus, 'tickets', itemId);
	const portal = clientId ? await getClientPortalRecipients(directus, clientId) : [];
	const recipients = unique([...staff, ...admins, ...portal]);

	const title = item.title || 'New ticket';
	for (const id of recipients) {
		if (id === userId) continue;
		targets.push({
			recipientId: id,
			category: 'tickets',
			type: 'ticket.created',
			subject: `New ticket: ${title}`,
			message: item.priority ? `${formatStatus(item.priority)} priority` : 'A new ticket was opened.',
			collection: 'tickets',
			itemId,
		});
	}
}

// ── Tasks (staff-only, no portal fan-out) ─────────────────────────────────────

async function resolveTaskUpdateTargets(
	item: Record<string, any>,
	itemId: string,
	userId: string,
	targets: NotificationTarget[],
) {
	// tasks.assigned_to is an m2m junction — the change-listener payload may
	// arrive as either the raw array or a partial set of junction rows. We
	// notify every new assignee that isn't the actor themselves.
	const assignments = Array.isArray(item.assigned_to) ? item.assigned_to : [];
	for (const assignment of assignments) {
		const assigneeId = typeof assignment === 'string'
			? assignment
			: typeof assignment?.directus_users_id === 'object'
				? assignment.directus_users_id?.id
				: assignment?.directus_users_id;
		if (!assigneeId || assigneeId === userId) continue;
		targets.push({
			recipientId: assigneeId,
			category: 'projects',
			type: 'task.assigned',
			subject: 'You were assigned to a task',
			message: item.title || 'New task assignment',
			collection: 'tasks',
			itemId,
		});
	}
}

// ── Projects ───────────────────────────────────────────────────────────────────

async function resolveProjectUpdateTargets(
	directus: any,
	item: Record<string, any>,
	previousItem: Record<string, any> | undefined,
	itemId: string,
	userId: string,
	targets: NotificationTarget[],
	staffOnly?: boolean,
) {
	const statusChanged = item.status && (!previousItem || previousItem.status !== item.status);
	const dueDateChanged = item.due_date && (!previousItem || previousItem.due_date !== item.due_date);
	const completionChanged = 'completion_date' in item && (!previousItem || previousItem.completion_date !== item.completion_date);

	if (!statusChanged && !dueDateChanged && !completionChanged) return;

	const staff = await getItemAssignees(directus, 'projects', itemId);
	const clientId = staffOnly ? null : await getItemClientId(directus, 'projects', itemId);
	const portal = clientId ? await getClientPortalRecipients(directus, clientId) : [];
	const recipients = unique([...staff, ...portal]);

	const title = item.title || 'Project updated';

	if (completionChanged && item.completion_date) {
		for (const id of recipients) {
			if (id === userId) continue;
			targets.push({
				recipientId: id,
				category: 'projects',
				type: 'project.completed',
				subject: 'Project completed',
				message: `"${title}" has been marked complete.`,
				collection: 'projects',
				itemId,
			});
		}
		return;
	}

	if (statusChanged) {
		for (const id of recipients) {
			if (id === userId) continue;
			targets.push({
				recipientId: id,
				category: 'projects',
				type: 'project.status_changed',
				subject: `Project status: ${formatStatus(item.status)}`,
				message: title,
				collection: 'projects',
				itemId,
			});
		}
	}

	if (dueDateChanged) {
		for (const id of recipients) {
			if (id === userId) continue;
			targets.push({
				recipientId: id,
				category: 'projects',
				type: 'project.due_date_changed',
				subject: 'Project due date updated',
				message: `"${title}" is now due ${formatDate(item.due_date)}.`,
				collection: 'projects',
				itemId,
			});
		}
	}
}

// ── Invoices ───────────────────────────────────────────────────────────────────

async function resolveInvoiceTargets(
	directus: any,
	item: Record<string, any>,
	previousItem: Record<string, any> | undefined,
	itemId: string,
	userId: string,
	orgId: string | undefined,
	targets: NotificationTarget[],
	staffOnly?: boolean,
) {
	// Trigger on the meaningful transitions only:
	//   - sent: pending → processing (we issue the invoice)
	//   - paid: anything → paid
	const status = item.status;
	const prevStatus = previousItem?.status;
	const issued = status === 'processing' && prevStatus !== 'processing';
	const paid = status === 'paid' && prevStatus !== 'paid';
	if (!issued && !paid) return;

	const clientId = staffOnly ? null : (typeof item.client === 'object' ? item.client?.id : item.client);
	const staff = orgId ? await getOrgAdmins(directus, orgId) : [];
	const portal = clientId ? await getClientPortalRecipients(directus, clientId) : [];
	const recipients = unique([...staff, ...portal]);

	const ref = item.invoice_code || item.title || 'Invoice';

	for (const id of recipients) {
		if (id === userId) continue;
		if (issued) {
			targets.push({
				recipientId: id,
				category: 'invoices',
				type: 'invoice.issued',
				subject: `Invoice issued: ${ref}`,
				message: `Invoice ${ref} has been sent.`,
				collection: 'invoices',
				itemId,
			});
		} else if (paid) {
			targets.push({
				recipientId: id,
				category: 'invoices',
				type: 'invoice.paid',
				subject: `Invoice paid: ${ref}`,
				message: `Invoice ${ref} has been paid.`,
				collection: 'invoices',
				itemId,
			});
		}
	}
}

// ── Contracts ──────────────────────────────────────────────────────────────────

async function resolveContractTargets(
	directus: any,
	item: Record<string, any>,
	previousItem: Record<string, any> | undefined,
	itemId: string,
	userId: string,
	orgId: string | undefined,
	targets: NotificationTarget[],
	staffOnly?: boolean,
) {
	const cs = item.contract_status;
	const prev = previousItem?.contract_status;
	const sent = cs === 'sent' && prev !== 'sent';
	const signed = cs === 'signed' && prev !== 'signed';
	if (!sent && !signed) return;

	const clientId = staffOnly ? null : (typeof item.client === 'object' ? item.client?.id : item.client);
	const staff = orgId ? await getOrgAdmins(directus, orgId) : [];
	const portal = clientId ? await getClientPortalRecipients(directus, clientId) : [];
	const recipients = unique([...staff, ...portal]);

	const ref = item.title || 'Contract';

	for (const id of recipients) {
		if (id === userId) continue;
		if (sent) {
			targets.push({
				recipientId: id,
				category: 'contracts',
				type: 'contract.sent',
				subject: `Contract sent: ${ref}`,
				message: `"${ref}" has been sent for signature.`,
				collection: 'contracts',
				itemId,
			});
		} else if (signed) {
			targets.push({
				recipientId: id,
				category: 'contracts',
				type: 'contract.signed',
				subject: `Contract signed: ${ref}`,
				message: `"${ref}" has been signed.`,
				collection: 'contracts',
				itemId,
			});
		}
	}
}

// ── Proposals (staff-only) ─────────────────────────────────────────────────────
// Proposals are pre-client by design — they reference contacts/leads, not
// clients. Portal users only see them once they're attached as inherited from
// their client/lead chain, which is rare enough we keep proposal notifications
// staff-only.

async function resolveProposalTargets(
	directus: any,
	item: Record<string, any>,
	previousItem: Record<string, any> | undefined,
	itemId: string,
	userId: string,
	orgId: string | undefined,
	targets: NotificationTarget[],
) {
	const ps = item.proposal_status;
	const prev = previousItem?.proposal_status;
	// The portal decline action writes 'declined'; some flows use 'rejected'.
	// Treat both as the same decline event.
	const isDecline = (s: string | undefined) => s === 'rejected' || s === 'declined';
	const sent = ps === 'sent' && prev !== 'sent';
	const accepted = ps === 'accepted' && prev !== 'accepted';
	const rejected = isDecline(ps) && !isDecline(prev);
	if (!sent && !accepted && !rejected) return;

	const staff = orgId ? await getOrgAdmins(directus, orgId) : [];
	const ref = item.title || 'Proposal';

	for (const id of staff) {
		if (id === userId) continue;
		if (sent) {
			targets.push({
				recipientId: id,
				category: 'proposals',
				type: 'proposal.sent',
				subject: `Proposal sent: ${ref}`,
				message: `"${ref}" has been sent.`,
				collection: 'proposals',
				itemId,
			});
		} else if (accepted) {
			targets.push({
				recipientId: id,
				category: 'proposals',
				type: 'proposal.accepted',
				subject: `Proposal accepted: ${ref}`,
				message: `"${ref}" was accepted.`,
				collection: 'proposals',
				itemId,
			});
		} else if (rejected) {
			targets.push({
				recipientId: id,
				category: 'proposals',
				type: 'proposal.rejected',
				subject: `Proposal declined: ${ref}`,
				message: `"${ref}" was declined.`,
				collection: 'proposals',
				itemId,
			});
		}
	}
}

// ── Project events (staff assignees only) ─────────────────────────────────────

async function resolveProjectEventTargets(
	directus: any,
	item: Record<string, any>,
	userId: string,
	targets: NotificationTarget[],
) {
	if (!item.project) return;
	const projectId = typeof item.project === 'object' ? item.project.id : item.project;
	const assignees = await getItemAssignees(directus, 'projects', projectId);
	for (const id of assignees) {
		if (id === userId) continue;
		targets.push({
			recipientId: id,
			category: 'projects',
			type: 'project_event',
			subject: 'Project event updated',
			message: item.title || item.description || 'Project activity',
			collection: 'projects',
			itemId: projectId,
		});
	}
}

// ── Video meeting booked ────────────────────────────────────────────────────────
// A public/portal booking has no Directus-user actor (the invitee is external),
// so the caller passes userId='' — meaning the host is NOT skipped and gets the
// notification. `attendees` (collective bookings, Phase 5) also get pinged.

async function resolveVideoMeetingTargets(
	item: Record<string, any>,
	itemId: string,
	userId: string,
	targets: NotificationTarget[],
) {
	const recipients = new Set<string>();
	const host = typeof item.host_user === 'object' ? item.host_user?.id : item.host_user;
	if (host) recipients.add(host);
	for (const a of item.attendees || []) {
		const id = typeof a === 'object' ? a?.directus_user ?? a?.id : a;
		if (id) recipients.add(String(id));
	}

	const who = item.invitee_name || item.invitee_email || 'a guest';
	for (const id of recipients) {
		if (!id || id === userId) continue;
		targets.push({
			recipientId: id,
			category: 'meetings',
			type: 'meeting_booked',
			subject: 'New meeting booked',
			message: item.title || `Meeting with ${who}`,
			collection: 'video_meetings',
			itemId,
		});
	}
}

// ── CSAT (client rated delivered work) ─────────────────────────────────────────
// Staff-only by nature. Every rating pings the item's assignees; a low score
// (≤2) additionally escalates to org admins so a dissatisfied client surfaces
// loudly. Caller passes collection='csat', itemId=<ticket/project id> and
// item={ source_collection, rating, comment, title }.

async function resolveCsatTargets(
	directus: any,
	item: Record<string, any>,
	userId: string,
	orgId: string | undefined,
	targets: NotificationTarget[],
) {
	const itemId = String(item.source_id || item.itemId || '');
	if (!itemId) return;
	const src = item.source_collection === 'projects' ? 'projects' : 'tickets';
	const rating = Number(item.rating);
	const low = Number.isFinite(rating) && rating <= 2;

	const assignees = await getItemAssignees(directus, src, itemId);
	const admins = low && orgId ? await getOrgAdmins(directus, orgId) : [];
	const recipients = unique([...assignees, ...admins]);

	const cat = src === 'projects' ? 'projects' : 'tickets';
	const label = item.title || (src === 'projects' ? 'Project' : 'Ticket');
	const message = item.comment
		? truncateText(item.comment, 160)
		: `Client rated their experience ${rating}/5.`;

	for (const id of recipients) {
		if (id === userId) continue;
		targets.push({
			recipientId: id,
			category: cat,
			type: low ? 'csat.low' : 'csat.received',
			subject: low ? `Low satisfaction (${rating}/5): ${label}` : `New rating (${rating}/5): ${label}`,
			message,
			collection: src,
			itemId,
		});
	}
}

// ── Content plan approved (client signed off on the plan) ──────────────────────
// Staff-only. Reaches the plan's creator, the project's assignees, and org
// admins so the agency knows work can proceed.

async function resolveContentPlanTargets(
	directus: any,
	item: Record<string, any>,
	itemId: string,
	userId: string,
	orgId: string | undefined,
	targets: NotificationTarget[],
) {
	const title = item.title || 'Content plan';
	const projectId = typeof item.project === 'object' ? item.project?.id : item.project;
	const assignees = projectId ? await getItemAssignees(directus, 'projects', projectId) : [];
	const creator = typeof item.user_created === 'object' ? item.user_created?.id : item.user_created;
	const admins = orgId ? await getOrgAdmins(directus, orgId) : [];
	const recipients = unique([creator, ...assignees, ...admins].filter(Boolean) as string[]);

	for (const id of recipients) {
		if (id === userId) continue;
		targets.push({
			recipientId: id,
			category: 'projects',
			type: 'content_plan.approved',
			subject: `Plan approved: ${title}`,
			message: `The client approved "${title}".`,
			collection: 'content_plans',
			itemId,
		});
	}
}

// ── Social post — client requested changes ─────────────────────────────────────
// GUARDRAIL: this is internal WIP. Route ONLY to the assigned staffer(s) — the
// post creator, project assignees, and org admins — NEVER to portal users. A
// client's request-changes note must not fan back out to other portal users.

async function resolveSocialPostChangeTargets(
	directus: any,
	item: Record<string, any>,
	itemId: string,
	userId: string,
	orgId: string | undefined,
	targets: NotificationTarget[],
) {
	const projectId = typeof item.project === 'object' ? item.project?.id : item.project;
	const assignees = projectId ? await getItemAssignees(directus, 'projects', projectId) : [];
	const creator = typeof item.user_created === 'object' ? item.user_created?.id : item.user_created;
	const admins = orgId ? await getOrgAdmins(directus, orgId) : [];
	const recipients = unique([creator, ...assignees, ...admins].filter(Boolean) as string[]);

	const feedback = item.client_feedback
		? truncateText(item.client_feedback, 160)
		: 'The client requested changes on a post.';

	for (const id of recipients) {
		if (id === userId) continue;
		targets.push({
			recipientId: id,
			category: 'projects',
			type: 'social_post.changes_requested',
			subject: 'Changes requested on a post',
			message: feedback,
			collection: 'social_posts',
			itemId,
		});
	}
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const PORTAL_USER_FK_FIELDS: Record<string, string> = {
	tickets: 'client',
	projects: 'client',
	invoices: 'client',
	contracts: 'client',
};

async function getItemClientId(directus: any, collection: string, itemId: string): Promise<string | null> {
	const fk = PORTAL_USER_FK_FIELDS[collection];
	if (!fk) return null;
	try {
		const item = await directus.request(readItem(collection, itemId, { fields: [fk] })) as any;
		const raw = item?.[fk];
		if (!raw) return null;
		return typeof raw === 'object' ? raw.id ?? null : raw;
	} catch {
		return null;
	}
}

/**
 * Walk UP the parent_client chain (up to 2 hops) from `clientId`, then
 * return all active client_portal_users whose root client is in the
 * resulting set. Portal scope walks DOWN from the user's root, so a
 * notification on a leaf client should reach portal users rooted on
 * itself OR any ancestor (1-2 hops up).
 */
export async function getClientPortalRecipients(
	directus: any,
	clientId: string,
): Promise<string[]> {
	try {
		const eligibleRoots = new Set<string>([clientId]);
		let cursor = clientId;
		for (let i = 0; i < 2; i++) {
			let parent: any;
			try {
				parent = await directus.request(readItem('clients', cursor, { fields: ['parent_client'] }));
			} catch {
				break;
			}
			const next = typeof parent?.parent_client === 'object' ? parent.parent_client?.id : parent?.parent_client;
			if (!next || eligibleRoots.has(next)) break;
			eligibleRoots.add(next);
			cursor = next;
		}

		const rows = await directus.request(
			readItems('client_portal_users', {
				filter: {
					_and: [
						{ status: { _eq: 'active' } },
						{ client: { _in: Array.from(eligibleRoots) } },
					],
				} as any,
				fields: ['user'] as any,
				limit: -1,
			}),
		) as any[];

		return rows
			.map((r) => (typeof r.user === 'object' ? r.user?.id : r.user))
			.filter(Boolean) as string[];
	} catch (err) {
		console.error('[notificationRecipients] getClientPortalRecipients failed:', err);
		return [];
	}
}

async function getItemAssignees(directus: any, collection: string, itemId: string): Promise<string[]> {
	try {
		const item = await directus.request(readItem(collection, itemId, {
			fields: ['assigned_to.directus_users_id', 'assigned_to.id'] as any,
		})) as any;

		if (!item?.assigned_to) return [];

		const arr = Array.isArray(item.assigned_to) ? item.assigned_to : [item.assigned_to];
		return arr
			.map((entry: any) => {
				if (!entry) return null;
				if (typeof entry === 'string') return entry;
				if (typeof entry === 'object') {
					// Junction-table shape: { id, directus_users_id }
					const u = entry.directus_users_id ?? entry.user ?? entry.id;
					if (!u) return null;
					return typeof u === 'object' ? u.id : u;
				}
				return null;
			})
			.filter(Boolean);
	} catch {
		return [];
	}
}

async function getItemAuthor(directus: any, collection: string, itemId: string): Promise<string | null> {
	try {
		const item = await directus.request(readItem(collection, itemId, {
			fields: ['user_created', 'user'] as any,
		})) as any;

		const raw = item?.user_created ?? item?.user;
		if (!raw) return null;
		return typeof raw === 'object' ? raw.id : raw;
	} catch {
		return null;
	}
}

async function getOrgAdmins(directus: any, orgId: string): Promise<string[]> {
	try {
		const memberships = await directus.request(readItems('org_memberships', {
			filter: {
				_and: [
					{ organization: { _eq: orgId } },
					{ status: { _eq: 'active' } },
					{ role: { slug: { _in: ['owner', 'admin'] } } },
				],
			},
			fields: ['user'],
			limit: 100,
		})) as any[];

		return memberships
			.map((m: any) => typeof m.user === 'object' ? m.user.id : m.user)
			.filter(Boolean);
	} catch {
		return [];
	}
}

function unique(ids: string[]): string[] {
	return Array.from(new Set(ids.filter(Boolean)));
}

function truncateText(text: string | null | undefined, maxLength: number): string {
	if (!text) return '';
	const clean = text.replace(/<[^>]*>/g, '');
	if (clean.length <= maxLength) return clean;
	return clean.substring(0, maxLength) + '...';
}

function formatCollectionName(collection: string): string {
	const names: Record<string, string> = {
		tickets: 'ticket',
		projects: 'project',
		tasks: 'task',
		project_events: 'project',
		comments: 'comment',
		messages: 'message',
		invoices: 'invoice',
		contracts: 'contract',
		proposals: 'proposal',
		video_meetings: 'meeting',
	};
	return names[collection] || collection;
}

function formatStatus(status: string): string {
	return String(status).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string): string {
	try {
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	} catch {
		return iso;
	}
}
