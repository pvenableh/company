/**
 * Social Posts API
 * GET /api/social/posts — List posts (with filters)
 * POST /api/social/posts — Create and optionally schedule a post
 */
import { z } from 'zod';
import { getSocialPosts, createSocialPost, logSocialActivity } from '~/server/utils/social-directus';
import type { SocialPostTarget } from '~/types/social';

const createPostSchema = z.object({
	caption: z.string().min(1).max(4000),
	media_urls: z.array(z.string().url()).min(1).max(10),
	media_types: z
		.array(z.enum(['image', 'video']))
		.min(1)
		.max(10),
	thumbnail_url: z.string().url().optional(),
	platforms: z
		.array(
			z.object({
				platform: z.enum(['instagram', 'tiktok']),
				account_id: z.string().uuid(),
				account_name: z.string(),
				options: z.record(z.unknown()).optional(),
			}),
		)
		.min(1),
	post_type: z.enum(['image', 'video', 'carousel', 'reel', 'story']),
	scheduled_at: z.string().datetime(),
	status: z.enum(['draft', 'scheduled']).default('scheduled'),
});

export default defineEventHandler(async (event) => {
	const method = getMethod(event);

	// ── GET: List posts ──
	if (method === 'GET') {
		const query = getQuery(event);
		const posts = await getSocialPosts({
			status: query.status as string | undefined,
			scheduled_after: query.scheduled_after as string | undefined,
			scheduled_before: query.scheduled_before as string | undefined,
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

		// Create post in Directus
		// Worker polls for posts with status='scheduled' and scheduled_at <= now
		const post = await createSocialPost({
			caption: data.caption,
			media_urls: data.media_urls,
			media_types: data.media_types,
			thumbnail_url: data.thumbnail_url || null,
			platforms: data.platforms as SocialPostTarget[],
			post_type: data.post_type,
			scheduled_at: data.scheduled_at,
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
