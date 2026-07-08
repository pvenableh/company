// server/api/portal/proposal-action.post.ts
/**
 * POST /api/portal/proposal-action
 *
 * Lets a client portal user accept or decline a proposal sent to their org.
 * Verifies the proposal's organization matches the caller's portal context
 * before flipping `proposal_status`. Admin previews are read-only and rejected.
 *
 * Body: { proposalId: string, action: 'accept' | 'decline' | 'view' }
 */

import { readItem, updateItem } from '@directus/sdk';
import { requirePortalContext } from '~~/server/utils/portal-auth';
import { notifyEvent } from '~~/server/utils/notify-event';
import { writeClientTimeline } from '~~/server/utils/write-timeline';

const ACTION_TO_STATUS: Record<string, string> = {
	accept: 'accepted',
	decline: 'declined',
	view: 'viewed',
};

export default defineEventHandler(async (event) => {
	const ctx = await requirePortalContext(event);

	if (ctx.isPreview) {
		throw createError({ statusCode: 403, message: 'Portal preview is read-only — this action would write on behalf of the client.' });
	}

	const body = await readBody(event);
	const proposalId = body?.proposalId as string | undefined;
	const action = body?.action as string | undefined;

	if (!proposalId) throw createError({ statusCode: 400, message: 'proposalId is required' });
	if (!action || !ACTION_TO_STATUS[action]) {
		throw createError({ statusCode: 400, message: 'action must be one of accept | decline | view' });
	}

	const directus = getServerDirectus();

	let row: any;
	try {
		row = await directus.request(
			readItem('proposals', proposalId, {
				fields: ['id', 'organization', 'proposal_status', 'title', 'client'],
			}),
		);
	} catch {
		throw createError({ statusCode: 404, message: 'Proposal not found' });
	}

	const proposalOrg = typeof row?.organization === 'object' ? row.organization?.id : row?.organization;
	if (!proposalOrg || proposalOrg !== ctx.organizationId) {
		throw createError({ statusCode: 404, message: 'Proposal not found' });
	}

	// Don't downgrade — once accepted/declined, ignore subsequent 'view' marks.
	const terminal = new Set(['accepted', 'declined']);
	if (terminal.has(row.proposal_status) && action === 'view') {
		return { ok: true, proposal_status: row.proposal_status, skipped: true };
	}

	// Decline / accept require the proposal to currently be sent or viewed.
	if (action !== 'view' && !['sent', 'viewed'].includes(row.proposal_status)) {
		throw createError({
			statusCode: 409,
			message: `Cannot ${action} a proposal in "${row.proposal_status}" state.`,
		});
	}

	const update: Record<string, any> = {
		proposal_status: ACTION_TO_STATUS[action],
	};
	if (action === 'accept') update.accepted_at = new Date().toISOString();
	if (action === 'decline') update.declined_at = new Date().toISOString();

	try {
		await directus.request(updateItem('proposals', proposalId, update));
	} catch (err: any) {
		// Some installations don't have accepted_at/declined_at columns yet —
		// retry with status only so the action still succeeds.
		if (action !== 'view') {
			await directus.request(updateItem('proposals', proposalId, { proposal_status: ACTION_TO_STATUS[action] }));
		} else {
			throw err;
		}
	}

	// ── Return leg (accept/decline only; 'view' is not an event) ────────────
	if (action === 'accept' || action === 'decline') {
		const newStatus = ACTION_TO_STATUS[action];
		const proposalTitle = row.title || 'Proposal';
		const clientId = typeof row.client === 'object' ? row.client?.id : row.client;

		void notifyEvent({
			directus,
			collection: 'proposals',
			action: 'update',
			item: { proposal_status: newStatus, title: proposalTitle, organization: ctx.organizationId },
			previousItem: { proposal_status: row.proposal_status },
			itemId: String(proposalId),
			userId: '', // portal actor is not a staff directus user
			orgId: ctx.organizationId,
			staffOnly: true,
		}).catch((e) => console.warn('[portal/proposal-action] notify failed:', e));

		// Proposals are often pre-client (lead/contact-based); writeClientTimeline
		// no-ops when there's no client to scope the row to.
		void writeClientTimeline({
			organizationId: ctx.organizationId,
			clientId,
			verb: action === 'accept' ? 'proposal.accepted' : 'proposal.declined',
			title: action === 'accept' ? `${proposalTitle} accepted` : `${proposalTitle} declined`,
			actorType: 'client',
			sourceCollection: 'proposals',
			sourceId: proposalId,
			href: `/proposals/${proposalId}`,
			icon: action === 'accept' ? 'lucide:check-circle' : 'lucide:x-circle',
		});
	}

	return { ok: true, proposal_status: ACTION_TO_STATUS[action] };
});
