// server/api/home/pursuits.get.ts
//
// A compact, read-only snapshot for the home "Pursuits" widget: the newest few
// leads, proposals, and pitch pages for the org, in one round trip. Deliberately
// tiny — just what a glanceable card needs (a label, a status, a date, a deep
// link). The full boards live under People > Pursuits.
//
// Uses the caller's own Directus token so row-level permissions apply for free,
// and fetches each collection in its own try/catch: a user who can't see one of
// the three (or a collection that isn't provisioned) just gets an empty section
// instead of a 403 that would blank the whole widget.

import { readItems } from '@directus/sdk';

const fullName = (f?: string | null, l?: string | null) => `${f || ''} ${l || ''}`.trim();

export default defineEventHandler(async (event) => {
	await requireUserSession(event);
	const organization = String(getQuery(event).organization || '');
	if (!organization) throw createError({ statusCode: 400, message: 'organization is required' });

	const directus = await getUserDirectus(event);

	// ── Leads (newest, still open) ──────────────────────────────────────────
	const leads = await directus
		.request(
			readItems('leads', {
				filter: {
					organization: { _eq: organization },
					stage: { _nin: ['won', 'lost'] },
				},
				fields: [
					'id', 'stage', 'source', 'estimated_value', 'date_created',
					'related_contact.first_name', 'related_contact.last_name', 'related_contact.company',
				],
				sort: ['-date_created'],
				limit: 4,
			}),
		)
		.then((rows: any[]) =>
			(rows || []).map((r) => ({
				id: r.id,
				label:
					fullName(r.related_contact?.first_name, r.related_contact?.last_name) ||
					r.related_contact?.company ||
					`Lead #${r.id}`,
				sub: r.related_contact?.company || null,
				stage: r.stage || null,
				value: r.estimated_value ?? null,
				date: r.date_created,
				to: `/leads/${r.id}`,
			})),
		)
		.catch(() => [] as any[]);

	// ── Proposals (newest) ──────────────────────────────────────────────────
	const proposals = await directus
		.request(
			readItems('proposals', {
				filter: { organization: { _eq: organization } },
				fields: [
					'id', 'title', 'total_value', 'proposal_status', 'date_created',
					'client.name',
					'lead.related_contact.first_name', 'lead.related_contact.last_name',
					'contact.first_name', 'contact.last_name',
				],
				sort: ['-date_created'],
				limit: 4,
			}),
		)
		.then((rows: any[]) =>
			(rows || []).map((r) => ({
				id: r.id,
				label: r.title || 'Untitled proposal',
				sub:
					r.client?.name ||
					fullName(r.lead?.related_contact?.first_name, r.lead?.related_contact?.last_name) ||
					fullName(r.contact?.first_name, r.contact?.last_name) ||
					null,
				status: r.proposal_status || null,
				value: r.total_value ?? null,
				date: r.date_created,
				to: `/apps/clients?view=pursuits&lens=proposals`,
			})),
		)
		.catch(() => [] as any[]);

	// ── Pitch pages (newest) ────────────────────────────────────────────────
	const pitches = await directus
		.request(
			readItems('pitch_pages', {
				filter: { organization: { _eq: organization } },
				fields: [
					'id', 'title', 'client_name', 'token', 'status', 'view_count', 'date_created',
					'client.name',
					'lead.related_contact.first_name', 'lead.related_contact.last_name',
					'contact.first_name', 'contact.last_name',
				],
				sort: ['-date_created'],
				limit: 4,
			}),
		)
		.then((rows: any[]) =>
			(rows || []).map((r) => ({
				id: r.id,
				label: r.title || 'Untitled pitch',
				sub:
					r.client?.name ||
					fullName(r.lead?.related_contact?.first_name, r.lead?.related_contact?.last_name) ||
					fullName(r.contact?.first_name, r.contact?.last_name) ||
					r.client_name ||
					null,
				status: r.status || null,
				views: r.view_count ?? 0,
				date: r.date_created,
				to: `/apps/clients?view=pursuits&lens=pitches`,
			})),
		)
		.catch(() => [] as any[]);

	return { leads, proposals, pitches };
});
