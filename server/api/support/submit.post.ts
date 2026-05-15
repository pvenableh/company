// server/api/support/submit.post.ts
/**
 * POST /api/support/submit
 *
 * Any signed-in user (staff member or portal user) can submit a bug
 * report / feature request / question / generic feedback through this
 * route. The ticket is created in the dedicated "Earnest" support
 * organization, NOT the reporter's own org — that's the whole point.
 *
 * We can't grant every user a Directus role in the Support org, so the
 * write goes through the server token after gating on a real user
 * session. Same trust boundary as marketing-perms.ts.
 *
 * The reporter's identity, URL, viewport, and UA are appended to the
 * ticket description as a "── Reporter context ──" block so triage has
 * everything in one place without schema changes.
 *
 * Body:
 *   {
 *     type:        'bug' | 'feature' | 'question' | 'feedback',
 *     title:       string,                       // required
 *     description: string,                       // optional but encouraged
 *     priority?:   'low' | 'medium' | 'high',
 *     url?:        string,                       // page where reporter hit issue
 *     viewport?:   { width: number; height: number },
 *     userAgent?:  string,
 *     build?:      string,                       // commit sha if exposed
 *   }
 */

import { createItem, readUser, updateItem } from '@directus/sdk';

type SupportType = 'bug' | 'feature' | 'question' | 'feedback';

const TYPE_PREFIX: Record<SupportType, string> = {
	bug: '[Bug]',
	feature: '[Feature]',
	question: '[Question]',
	feedback: '[Feedback]',
};

const VALID_PRIORITIES = ['low', 'medium', 'high'] as const;

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const config = useRuntimeConfig();
	const supportOrgId = (config as any).earnestSupportOrgId as string;
	if (!supportOrgId) {
		throw createError({
			statusCode: 503,
			message:
				'Support inbox is not configured. Set EARNEST_SUPPORT_ORG_ID after running scripts/setup-earnest-support-org.ts.',
		});
	}

	const body = await readBody(event);

	const type: SupportType = (['bug', 'feature', 'question', 'feedback'] as const).includes(body?.type)
		? body.type
		: 'bug';

	const rawTitle = (body?.title ?? '').toString().trim();
	if (!rawTitle) {
		throw createError({ statusCode: 400, message: 'title is required' });
	}
	if (rawTitle.length > 200) {
		throw createError({ statusCode: 400, message: 'title must be 200 characters or less' });
	}

	const userMessage = body?.description ? body.description.toString().trim() : '';

	const priority: 'low' | 'medium' | 'high' = VALID_PRIORITIES.includes(body?.priority)
		? body.priority
		: 'medium';

	const directus = getTypedDirectus();

	// Best-effort reporter context — never let lookup failures block submission.
	let reporterEmail = (session as any).user?.email ?? '';
	let reporterName = '';
	try {
		const u: any = await directus.request(
			readUser(userId, { fields: ['email', 'first_name', 'last_name'] }),
		);
		reporterEmail = u?.email ?? reporterEmail;
		reporterName = [u?.first_name, u?.last_name].filter(Boolean).join(' ');
	} catch {
		// fall through — we still have the session email
	}

	const url = body?.url ? String(body.url).slice(0, 500) : '';
	const userAgent = body?.userAgent ? String(body.userAgent).slice(0, 400) : '';
	const viewport =
		body?.viewport && Number.isFinite(body.viewport.width) && Number.isFinite(body.viewport.height)
			? `${body.viewport.width}×${body.viewport.height}`
			: '';
	const buildSha = body?.build ? String(body.build).slice(0, 80) : '';

	const contextLines = [
		`Reporter: ${reporterName || '(unknown)'} <${reporterEmail || 'no-email'}> · user_id=${userId}`,
		url ? `URL: ${url}` : '',
		viewport ? `Viewport: ${viewport}` : '',
		userAgent ? `UA: ${userAgent}` : '',
		buildSha ? `Build: ${buildSha}` : '',
		`Submitted: ${new Date().toISOString()}`,
	].filter(Boolean);

	const composedDescription = [
		userMessage || '(no description provided)',
		'',
		'── Reporter context ──',
		...contextLines,
	].join('\n');

	const ticket: any = await directus.request(
		createItem('tickets', {
			title: `${TYPE_PREFIX[type]} ${rawTitle}`,
			description: composedDescription,
			organization: supportOrgId,
			status: 'Pending',
			priority,
		} as any),
	);

	// Directus auto-sets `user_created` from the authenticated user — since we're
	// hitting it with the server token, the field would otherwise show the
	// service account. Re-stamp it with the real reporter so /api/support/tickets
	// can filter by `user_created._eq: userId`.
	if (ticket?.id) {
		try {
			await directus.request(
				updateItem('tickets', ticket.id, { user_created: userId } as any),
			);
		} catch {
			// Non-fatal: ticket is still in the inbox; the reporter just won't see
			// it on their dashboard until staff reassigns `user_created`.
		}
	}

	return {
		ok: true,
		id: ticket?.id ?? null,
		type,
	};
});
