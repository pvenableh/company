/**
 * useProjectTouchpoints — CRUD for a project's communication log
 * (project_touchpoints). Mirrors useCardDesk's activity helpers: log a touch,
 * mark a response, tag participants. Org-scoped by Directus row filters; the
 * caller passes the project's organization so the create permission (keyed on
 * the denormalized `organization` column) is satisfied.
 */
import type { ProjectTouchpoint } from '~~/shared/directus';
import type { TouchpointParticipant } from '~/utils/project-touchpoints';

export interface LogTouchpointInput {
	project: string;
	organization: string;
	type: string;
	summary?: string;
	note?: string;
	occurred_at?: string;
	awaiting_response?: boolean;
	participants?: TouchpointParticipant[];
}

export function useProjectTouchpoints() {
	const items = useDirectusItems('project_touchpoints');

	async function listForProject(projectId: string): Promise<ProjectTouchpoint[]> {
		if (!projectId) return [];
		return (await items.list({
			fields: [
				'id', 'type', 'summary', 'note', 'occurred_at', 'awaiting_response',
				'is_response', 'response_note', 'participants', 'date_created',
				'user_created.id', 'user_created.first_name', 'user_created.last_name', 'user_created.avatar',
			],
			filter: { project: { _eq: projectId } },
			sort: ['-occurred_at', '-date_created'],
			limit: 100,
		})) as ProjectTouchpoint[];
	}

	async function logTouchpoint(input: LogTouchpointInput): Promise<ProjectTouchpoint> {
		const payload: Record<string, any> = {
			project: input.project,
			organization: input.organization,
			type: input.type,
			summary: input.summary || null,
			note: input.note || null,
			occurred_at: input.occurred_at || new Date().toISOString(),
			awaiting_response: input.awaiting_response ?? false,
			participants: input.participants?.length ? input.participants : null,
		};
		return (await items.create(payload)) as ProjectTouchpoint;
	}

	/** Mark a touchpoint as having received a response (clears awaiting flag). */
	async function markResponded(id: number | string, responseNote?: string): Promise<ProjectTouchpoint> {
		return (await items.update(String(id), {
			is_response: true,
			awaiting_response: false,
			response_note: responseNote || null,
		})) as ProjectTouchpoint;
	}

	async function updateTouchpoint(id: number | string, patch: Partial<ProjectTouchpoint>): Promise<ProjectTouchpoint> {
		return (await items.update(String(id), patch as Record<string, any>)) as ProjectTouchpoint;
	}

	async function deleteTouchpoint(id: number | string): Promise<void> {
		await items.delete(String(id));
	}

	return { listForProject, logTouchpoint, markResponded, updateTouchpoint, deleteTouchpoint };
}
