/**
 * useTouchpoints — CRUD for the general communication log (`touchpoints`).
 *
 * A touchpoint can attach to any mix of client / project / contacts. Org-scoped
 * by Directus row filters; the caller passes the owning `organization` so the
 * create permission (keyed on the denormalized `organization` column) is met.
 *
 * Replaces useProjectTouchpoints (project-only). Client contacts are a real m2m
 * relation; `participants` JSON remains for non-contact tags (team / portal).
 */
import type { TouchpointParticipant } from '~/utils/touchpoints';

export interface TouchpointScope {
	clientId?: string | null;
	projectId?: string | null;
	contactId?: string | null;
	/** A lead's touches — pursuit history before a client exists. */
	leadId?: string | number | null;
}

export interface LogTouchpointInput {
	organization: string;
	client?: string | null;
	project?: string | null;
	/** Lead this touch is about (pursuit tracking). */
	lead?: string | number | null;
	/** Client contact ids to tag (m2m). */
	contactIds?: string[];
	type: string;
	summary?: string;
	note?: string;
	occurred_at?: string;
	awaiting_response?: boolean;
	/** How it landed (absorbed from lead_activities.outcome). */
	outcome?: string | null;
	/** Planned follow-up. */
	next_action?: string | null;
	next_action_date?: string | null;
	/** Non-contact tags (team members / portal users) kept as JSON. */
	participants?: TouchpointParticipant[];
}

const TP_FIELDS = [
	'id', 'type', 'summary', 'note', 'occurred_at', 'awaiting_response',
	'is_response', 'response_note', 'participants', 'date_created', 'client', 'project',
	'lead', 'outcome', 'next_action', 'next_action_date',
	'contacts.id', 'contacts.contacts_id.id', 'contacts.contacts_id.first_name',
	'contacts.contacts_id.last_name', 'contacts.contacts_id.email',
	'user_created.id', 'user_created.first_name', 'user_created.last_name', 'user_created.avatar',
];

export function useTouchpoints() {
	const items = useDirectusItems('touchpoints');

	function buildFilter(scope: TouchpointScope): Record<string, any> | null {
		// Most specific wins: a project view shows the project's touches; a lead
		// view its pursuit history; a contact view that contact's; a client view
		// the client's.
		if (scope.projectId) return { project: { _eq: scope.projectId } };
		if (scope.leadId != null) return { lead: { _eq: scope.leadId } };
		if (scope.contactId) return { contacts: { contacts_id: { _eq: scope.contactId } } };
		if (scope.clientId) return { client: { _eq: scope.clientId } };
		return null;
	}

	async function listForScope(scope: TouchpointScope): Promise<any[]> {
		const filter = buildFilter(scope);
		if (!filter) return [];
		return (await items.list({
			fields: TP_FIELDS,
			filter,
			sort: ['-occurred_at', '-date_created'],
			limit: 100,
		})) as any[];
	}

	async function logTouchpoint(input: LogTouchpointInput): Promise<any> {
		const payload: Record<string, any> = {
			organization: input.organization,
			client: input.client || null,
			project: input.project || null,
			lead: input.lead ?? null,
			type: input.type,
			summary: input.summary || null,
			note: input.note || null,
			occurred_at: input.occurred_at || new Date().toISOString(),
			awaiting_response: input.awaiting_response ?? false,
			outcome: input.outcome || null,
			next_action: input.next_action || null,
			next_action_date: input.next_action_date || null,
			participants: input.participants?.length ? input.participants : null,
		};
		// Directus m2m create: array of junction rows referencing the related pk.
		if (input.contactIds?.length) payload.contacts = input.contactIds.map((id) => ({ contacts_id: id }));
		return await items.create(payload);
	}

	async function markResponded(id: number | string, responseNote?: string): Promise<any> {
		return await items.update(String(id), {
			is_response: true,
			awaiting_response: false,
			response_note: responseNote || null,
		});
	}

	async function updateTouchpoint(id: number | string, patch: Record<string, any>): Promise<any> {
		return await items.update(String(id), patch);
	}

	async function deleteTouchpoint(id: number | string): Promise<void> {
		await items.delete(String(id));
	}

	return { listForScope, logTouchpoint, markResponded, updateTouchpoint, deleteTouchpoint };
}
