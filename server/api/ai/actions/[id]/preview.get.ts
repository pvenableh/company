// server/api/ai/actions/[id]/preview.get.ts
/**
 * Read the rendered send-log for a send_email ai_actions row — the preview
 * surface behind the outbound gate.
 *
 * For an EXECUTED send_email row, the executor stored the fully-rendered
 * { to, subject, html, text } + the gate decision on the row's `result` (whether
 * or not it actually transmitted). This endpoint returns that so a human can
 * eyeball exactly what was sent / would be sent, and see WHY the gate held it.
 *
 * Same admin-client + requireOrgMembership auth as the sibling action endpoints;
 * client-side ai_actions perms are intentionally NOT relied upon.
 *
 * 404 if missing / not a send_email; 409 if the row hasn't been executed yet (no
 * rendered result to show — edit + approve it first).
 */
import { readItem } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, message: 'Action id is required' });

	const directus = getTypedDirectus();
	const action = (await directus
		.request(readItem('ai_actions' as any, id, {
			fields: ['id', 'organization', 'action_type', 'status', 'result', 'title'],
		}))
		.catch(() => null)) as any;
	if (!action) throw createError({ statusCode: 404, message: 'Action not found' });
	if (action.action_type !== 'send_email') {
		throw createError({ statusCode: 404, message: 'Not an email action' });
	}

	const organizationId = typeof action.organization === 'object' ? action.organization?.id : action.organization;
	if (!organizationId) throw createError({ statusCode: 400, message: 'Action has no organization' });
	await requireOrgMembership(event, String(organizationId));

	const result = action.result || {};
	const preview = result.preview || null;
	if (!preview) {
		throw createError({
			statusCode: 409,
			message: `No rendered preview yet (action is ${action.status}) — approve it to render the email`,
		});
	}

	return {
		id: action.id,
		status: action.status,
		transmitted: result.sent === true,
		gate: result.gate ?? null,
		to: preview.to ?? result.to ?? null,
		subject: preview.subject ?? result.subject ?? null,
		html: preview.html ?? null,
		text: preview.text ?? null,
	};
});
