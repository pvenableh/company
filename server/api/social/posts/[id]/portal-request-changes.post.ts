/**
 * Portal request-changes — token-authenticated change request.
 *
 * Phase 5 of the retainer/social plan. Authenticates via the `approval_token`
 * stamped on the in_review transition. Moves the post back to
 * `requested_changes` so the agency can iterate. Clears any prior approval.
 *
 * Body:
 *   { token: string, note?: string }
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
	if (post.approval_state !== 'in_review' && post.approval_state !== 'approved') {
		throw createError({
			statusCode: 400,
			message: `Cannot request changes on a post in state: ${post.approval_state}`,
		});
	}

	const updated = await updateSocialPost(id, {
		approval_state: 'requested_changes',
		approved_by: null,
		approved_at: null,
	} as any);

	return { data: updated };
});
