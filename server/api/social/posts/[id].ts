/**
 * Single Post API
 * GET /api/social/posts/:id — Get post details
 * PATCH /api/social/posts/:id — Update post
 * DELETE /api/social/posts/:id — Delete post
 */

import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import {
	getSocialPostById,
	updateSocialPost,
	deleteSocialPost,
	logSocialActivity,
} from '~~/server/utils/social-directus';
import { requireSocialOrg } from '~~/server/utils/social-tenancy';
import { emitNotification } from '~~/server/utils/notify-event';
import { getClientPortalRecipients } from '~~/server/utils/notificationRecipients';

const APPROVAL_STATES = [
	'draft',
	'in_review',
	'requested_changes',
	'approved',
	'rejected',
	'scheduled',
	'published',
] as const;

const updatePostSchema = z.object({
	caption: z.string().min(1).max(4000).optional(),
	media_urls: z.array(z.string().url()).max(10).optional(),
	media_types: z.array(z.enum(['image', 'video'])).optional(),
	thumbnail_url: z.string().url().optional().nullable(),
	platforms: z
		.array(
			z.object({
				platform: z.enum(['instagram', 'tiktok', 'linkedin', 'facebook', 'threads']),
				account_id: z.string().uuid().optional(),
				account_name: z.string().optional(),
				options: z.record(z.unknown()).optional(),
			}),
		)
		.optional(),
	post_type: z.enum(['image', 'video', 'carousel', 'reel', 'story', 'text', 'article']).optional(),
	scheduled_at: z.string().datetime().optional(),
	status: z.enum(['draft', 'scheduled']).optional(),
	client: z.string().uuid().nullable().optional(),
	cta_url: z.string().url().max(500).nullable().optional(),
	cta_label: z.string().max(80).nullable().optional(),
	// Phase 3 — Studio fields
	project: z.string().uuid().nullable().optional(),
	target_client: z.string().uuid().nullable().optional(),
	approval_state: z.enum(APPROVAL_STATES).optional(),
	design_image_url: z.string().url().max(500).nullable().optional(),
	figma_frame_url: z.string().url().max(500).nullable().optional(),
	target_month: z.string().nullable().optional(),
});

export default defineEventHandler(async (event) => {
	const { organizationId, userId } = await requireSocialOrg(event);
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

		const patch: Record<string, unknown> = { ...parsed.data };

		// Approval-state side-effects. Server is the only writer for
		// approval_token / approved_by / approved_at.
		if (parsed.data.approval_state && parsed.data.approval_state !== existing.approval_state) {
			const next = parsed.data.approval_state;
			if (next === 'in_review' && !existing.approval_token) {
				patch.approval_token = randomBytes(24).toString('hex');
			}
			if (next === 'approved' || next === 'rejected') {
				patch.approved_by = userId;
				patch.approved_at = new Date().toISOString();
			}
			if (next === 'draft' || next === 'requested_changes') {
				patch.approved_by = null;
				patch.approved_at = null;
			}
		}

		// Worker polls for scheduled posts, so just update the record
		// Status changes and schedule_at changes are picked up automatically
		const updated = await updateSocialPost(id, patch as any);

		// Notify portal users when the post enters `in_review` so they know
		// something is waiting on their approval. Fire-and-forget so a
		// notification failure never blocks the state change itself.
		if (
			parsed.data.approval_state === 'in_review'
			&& existing.approval_state !== 'in_review'
			&& updated.target_client
		) {
			(async () => {
				try {
					const directus = getServerDirectus();
					const recipientIds = await getClientPortalRecipients(directus, updated.target_client!);
					if (recipientIds.length) {
						const subject = 'A post is ready for your review';
						const preview = (updated.caption || '').slice(0, 140);
						const message = preview
							? `Your team submitted a draft for approval: "${preview}${(updated.caption || '').length > 140 ? '…' : ''}"`
							: 'Your team submitted a draft for approval.';
						await emitNotification({
							category: 'projects',
							type: 'social_post_in_review',
							collection: 'social_posts',
							itemId: updated.id,
							orgId: organizationId,
							actorId: userId,
							recipientIds,
							subject,
							message,
							link: '/portal/content',
						});
					}
				} catch (err) {
					console.error('[social-posts] in_review notification failed:', err);
				}
			})();
		}

		return { data: updated };
	}

	// ── DELETE: Remove post ──
	if (method === 'DELETE') {
		const existing = await getSocialPostById(id, organizationId);
		if (!existing) {
			throw createError({ statusCode: 404, message: 'Post not found' });
		}

		// Only drafts/scheduled/failed can be removed. Posts that went live stay
		// — they're a record of what was published. Delete from each platform directly
		// if you need to retract them.
		if (!['draft', 'scheduled', 'failed'].includes(existing.status)) {
			throw createError({
				statusCode: 400,
				message: `Cannot delete a ${existing.status} post. Posts that went live stay in your history — delete from each platform directly to retract.`,
			});
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
