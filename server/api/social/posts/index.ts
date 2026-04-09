/**
 * Social Posts API
 * GET /api/social/posts — List posts (with filters)
 * POST /api/social/posts — Create and optionally schedule a post
 */
import { z } from 'zod';
import { getSocialPosts, createSocialPost, logSocialActivity } from '~/server/utils/social-directus';
import type { SocialPostTarget } from '~~/types/social';

const platformTargetSchema = z.object({
	platform: z.enum(['instagram', 'tiktok', 'linkedin', 'facebook', 'threads']),
	account_id: z.string().uuid().optional(),
	account_name: z.string().optional(),
	options: z.record(z.unknown()).optional(),
});

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
	const method = getMethod(event);

	// ── GET: List posts ──
	if (method === 'GET') {
		try {
			const query = getQuery(event);
			const posts = await getSocialPosts({
				status: query.status as string | undefined,
				scheduled_after: query.scheduled_after as string | undefined,
				scheduled_before: query.scheduled_before as string | undefined,
				limit: query.limit ? Number(query.limit) : 50,
			});
			return { data: posts };
		} catch (error: any) {
			console.warn('[Social Posts API] GET error:', error.message || error);
			return { data: [] };
		}
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

		// Create post in Directus
		// Worker polls for posts with status='scheduled' and scheduled_at <= now
		const post = await createSocialPost({
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
			created_by: null, // TODO: get from session
		});

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
