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
}

export interface LogTouchpointInput {
	organization: string;
	client?: string | null;
	project?: string | null;
	/** Client contact ids to tag (m2m). */
	contactIds?: string[];
	type: string;
	summary?: string;
	note?: string;
	occurred_at?: string;
	awaiting_response?: boolean;
	/** Non-contact tags (team members / portal users) kept as JSON. */
	participants?: TouchpointParticipant[];
}

const TP_FIELDS = [
	'id', 'type', 'summary', 'note', 'occurred_at', 'awaiting_response',
	'is_response', 'response_note', 'participants', 'date_created', 'client', 'project',
	'contacts.id', 'contacts.contacts_id.id', 'contacts.contacts_id.first_name',
	'contacts.contacts_id.last_name', 'contacts.contacts_id.email',
	'user_created.id', 'user_created.first_name', 'user_created.last_name', 'user_created.avatar',
];

export function useTouchpoints() {
	const items = useDirectusItems('touchpoints');

	function buildFilter(scope: TouchpointScope): Record<string, any> | null {
		// Most specific wins: a project view shows the project's touches; a
		// contact view shows that contact's; a client view shows the client's.
		if (scope.projectId) return { project: { _eq: scope.projectId } };
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
			type: input.type,
			summary: input.summary || null,
			note: input.note || null,
			occurred_at: input.occurred_at || new Date().toISOString(),
			awaiting_response: input.awaiting_response ?? false,
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
