/**
 * Single Post API
 * GET /api/social/posts/:id — Get post details
 * PATCH /api/social/posts/:id — Update post
 * DELETE /api/social/posts/:id — Delete post
 */

import { z } from 'zod';
import {
	getSocialPostById,
	updateSocialPost,
	deleteSocialPost,
	logSocialActivity,
} from '~~/server/utils/social-directus';
import { requireSocialOrg } from '~~/server/utils/social-tenancy';

const updatePostSchema = z.object({
	caption: z.string().min(1).max(2200).optional(),
	media_urls: z.array(z.string().url()).min(1).max(10).optional(),
	media_types: z.array(z.enum(['image', 'video'])).optional(),
	thumbnail_url: z.string().url().optional().nullable(),
	platforms: z
		.array(
			z.object({
				platform: z.enum(['instagram', 'tiktok']),
				account_id: z.string().uuid(),
				account_name: z.string(),
				options: z.record(z.unknown()).optional(),
			}),
		)
		.optional(),
	post_type: z.enum(['image', 'video', 'carousel', 'reel', 'story']).optional(),
	scheduled_at: z.string().datetime().optional(),
	status: z.enum(['draft', 'scheduled']).optional(),
});

export default defineEventHandler(async (event) => {
	const { organizationId } = await requireSocialOrg(event);
	const method = getMethod(event);
	const id = getRouterParam(event, 'id');

	if (!id) {
		throw createError({ statusCode: 400, message: 'Post ID required' });
	}

	// ── GET: Single post ──
	if (method === 'GET') {
		const post = await getSocialPostById(id, organizationId);

		if (!post) {
			throw createError({ statusCode: 404, message: 'Post not found' });
		}

		return { data: post };
	}

	// ── PATCH: Update post ──
	if (method === 'PATCH') {
		const existing = await getSocialPostById(id, organizationId);
		if (!existing) {
			throw createError({ statusCode: 404, message: 'Post not found' });
		}

		// Can only edit drafts and scheduled posts
		if (!['draft', 'scheduled'].includes(existing.status)) {
			throw createError({
				statusCode: 400,
				message: `Cannot edit post with status: ${existing.status}`,
			});
		}

		const body = await readBody(event);
		const parsed = updatePostSchema.safeParse(body);

		if (!parsed.success) {
			throw createError({
				statusCode: 400,
				message: 'Validation failed',
				data: parsed.error.flatten(),
			});
		}

		// Worker polls for scheduled posts, so just update the record
		// Status changes and schedule_at changes are picked up automatically
		const updated = await updateSocialPost(id, parsed.data as any);

		return { data: updated };
	}

	// ── DELETE: Remove post ──
	if (method === 'DELETE') {
		const existing = await getSocialPostById(id, organizationId);
		if (!existing) {
			throw createError({ statusCode: 404, message: 'Post not found' });
		}

		await deleteSocialPost(id);

		await logSocialActivity({
			action: 'post_deleted',
			entity_type: 'post',
			entity_id: id,
		});

		return { success: true };
	}

	throw createError({ statusCode: 405, message: 'Method not allowed' });
});
