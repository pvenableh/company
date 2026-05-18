/**
 * Portal approve — token-authenticated approval of a Studio post.
 *
 * Phase 5 of the retainer/social plan. Authenticates via the `approval_token`
 * stamped by the server when the post moved to `in_review`. No user session
 * required so the same endpoint can be used from an email-only link, but if
 * a portal-user session IS present we'll attribute `approved_by` to them.
 *
 * Body:
 *   { token: string, note?: string }
 *
 * On success:
 *   - approval_state → 'approved'
 *   - approved_at    → now
 *   - approved_by    → portal user id when resolvable, else null
 */
import { z } from 'zod';
import { getSocialPostById, updateSocialPost } from '~~/server/utils/social-directus';

const bodySchema = z.object({
	token: z.string().min(8).max(128),
	note: z.string().max(2000).optional(),
});

export default defineEventHandler(async (event) => {
	const id = getRouterParam(event, 'id');
	if (!id) {
		throw createError({ statusCode: 400, message: 'Post ID required' });
	}

	const body = await readBody(event);
	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) {
		throw createError({
			statusCode: 400,
			message: 'Validation failed',
			data: parsed.error.flatten(),
		});
	}

	const post = await getSocialPostById(id);
	if (!post) {
		throw createError({ statusCode: 404, message: 'Post not found' });
	}
	if (!post.approval_token || post.approval_token !== parsed.data.token) {
		throw createError({ statusCode: 403, message: 'Invalid approval token' });
	}
	if (post.approval_state !== 'in_review' && post.approval_state !== 'requested_changes') {
		throw createError({
			statusCode: 400,
			message: `Cannot approve a post in state: ${post.approval_state}`,
		});
	}

	let approverId: string | null = null;
	try {
		const session = await getUserSession(event);
		const sessionUserId = (session as any)?.user?.id as string | undefined;
		if (sessionUserId) approverId = sessionUserId;
	} catch {
		approverId = null;
	}

	const updated = await updateSocialPost(id, {
		approval_state: 'approved',
		approved_by: approverId,
		approved_at: new Date().toISOString(),
	} as any);

	return { data: updated };
});
