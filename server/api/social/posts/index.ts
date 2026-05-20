/**
 * Social Posts API
 * GET /api/social/posts — List posts (with filters)
 * POST /api/social/posts — Create and optionally schedule a post
 */
import { z } from 'zod';
import { getSocialPosts, createSocialPost, logSocialActivity } from '~~/server/utils/social-directus';
import { requireSocialOrg } from '~~/server/utils/social-tenancy';
import { findOrCreateInboxPlan, getContentPlanById } from '~~/server/utils/content-plans';
import type { SocialPostTarget } from '~~/shared/social';

const platformTargetSchema = z.object({
	platform: z.enum(['instagram', 'tiktok', 'linkedin', 'facebook', 'threads']),
	account_id: z.string().uuid().optional(),
	account_name: z.string().optional(),
	options: z.record(z.unknown()).optional(),
});

const APPROVAL_STATES = [
	'draft',
	'in_review',
	'requested_changes',
	'approved',
	'rejected',
	'scheduled',
	'published',
] as const;

const createPostSchema = z.object({
	caption: z.string().min(1).max(4000),
	media_urls: z.array(z.string().url()).max(10).default([]),
	media_types: z
		.array(z.enum(['image', 'video']))
		.max(10)
		.default([]),
	thumbnail_url: z.string().url().optional(),
	platforms: z.array(platformTargetSchema).default([]),
	post_type: z.enum(['image', 'video', 'carousel', 'reel', 'story', 'text', 'article']),
	scheduled_at: z.string().datetime().optional(),
	status: z.enum(['draft', 'scheduled']).default('draft'),
	client: z.string().uuid().nullable().optional(),
	cta_url: z.string().url().max(500).nullable().optional(),
	cta_label: z.string().max(80).nullable().optional(),
	// Phase 3 — Studio fields
	project: z.string().uuid().nullable().optional(),
	target_client: z.string().uuid().nullable().optional(),
	approval_state: z.enum(APPROVAL_STATES).default('draft'),
	design_image_url: z.string().url().max(500).nullable().optional(),
	figma_frame_url: z.string().url().max(500).nullable().optional(),
	target_month: z.string().nullable().optional(),
	/** Optional — explicit plan attachment. When omitted, the server
	 *  finds-or-creates an Inbox plan for (organization, target_month). */
	content_plan: z.number().int().nullable().optional(),
}).refine(
	(data) => {
		if (data.status === 'scheduled') {
			return data.platforms.length >= 1
				&& data.platforms.every((p) => p.account_id && p.account_name)
				&& !!data.scheduled_at;
		}
		return true;
	},
	{ message: 'Scheduled posts require at least one account and a schedule time' },
);

export default defineEventHandler(async (event) => {
	const { organizationId, userId } = await requireSocialOrg(event);
	const method = getMethod(event);

	// ── GET: List posts ──
	if (method === 'GET') {
		const query = getQuery(event);
		const clientFilter = query.client as string | undefined;
		const projectFilter = query.project as string | undefined;
		const targetClientFilter = query.target_client as string | undefined;
		const posts = await getSocialPosts(organizationId, {
			status: query.status as string | undefined,
			scheduled_after: query.scheduled_after as string | undefined,
			scheduled_before: query.scheduled_before as string | undefined,
			client: clientFilter === 'null' ? null : clientFilter,
			project: projectFilter === 'null' ? null : projectFilter,
			target_client: targetClientFilter === 'null' ? null : targetClientFilter,
			approval_state: query.approval_state as string | undefined,
			limit: query.limit ? Number(query.limit) : 50,
		});
		return { data: posts };
	}

	// ── POST: Create post ──
	if (method === 'POST') {
		const body = await readBody(event);
		const parsed = createPostSchema.safeParse(body);

		if (!parsed.success) {
			throw createError({
				statusCode: 400,
				message: 'Validation failed',
				data: parsed.error.flatten(),
			});
		}

		const data = parsed.data;

		// Auto-attach to a content plan. Explicit content_plan wins (the plan
		// editor uses this); otherwise find-or-create the per-org Inbox plan
		// for the post's target_month (or current month, or null if no month
		// can be derived — matches the backfill keying so re-imports cluster
		// cleanly). Explicit content_plan IDs are verified to live in the
		// caller's org before we trust them.
		let resolvedPlanId: number | null = null;
		if (data.content_plan != null) {
			const requested = await getContentPlanById(data.content_plan, { organization: organizationId });
			if (!requested) {
				throw createError({ statusCode: 400, message: 'Invalid content_plan' });
			}
			resolvedPlanId = requested.id;
		} else {
			const monthAnchor =
				data.target_month ??
				(data.scheduled_at ? `${data.scheduled_at.slice(0, 7)}-01` : firstOfThisMonth());
			try {
				const inbox = await findOrCreateInboxPlan(organizationId, monthAnchor, userId);
				resolvedPlanId = inbox.id;
			} catch (err) {
				console.error('[social/posts] inbox plan find-or-create failed', err);
			}
		}

		// Worker polls for posts with status='scheduled' and scheduled_at <= now
		const post = await createSocialPost({
			organization: organizationId,
			client: data.client ?? null,
			caption: data.caption,
			media_urls: data.media_urls,
			media_types: data.media_types,
			thumbnail_url: data.thumbnail_url || null,
			platforms: data.platforms as SocialPostTarget[],
			post_type: data.post_type,
			scheduled_at: data.scheduled_at || new Date().toISOString(),
			status: data.status,
			publish_results: null,
			published_at: null,
			error_message: null,
			created_by: userId,
			cta_url: data.cta_url ?? null,
			cta_label: data.cta_label ?? null,
			project: data.project ?? null,
			target_client: data.target_client ?? null,
			approval_state: data.approval_state,
			design_image_url: data.design_image_url ?? null,
			figma_frame_url: data.figma_frame_url ?? null,
			target_month: data.target_month ?? null,
			content_plan: resolvedPlanId,
		} as any);

		// Log activity
		await logSocialActivity({
			action: data.status === 'scheduled' ? 'post_scheduled' : 'post_created',
			entity_type: 'post',
			entity_id: post.id,
			details: { platforms: data.platforms.map((p) => p.platform) },
		});

		return {
			data: post,
			message: data.status === 'scheduled' ? `Post scheduled for ${data.scheduled_at}` : 'Post saved as draft',
		};
	}

	throw createError({ statusCode: 405, message: 'Method not allowed' });
});

function firstOfThisMonth(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
