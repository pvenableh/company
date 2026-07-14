/**
 * Daily demo-org token top-up cron.
 *
 * The two shared public demo workspaces are capped at ~100k tokens
 * (ai_token_limit_monthly + ai_token_balance) as a spend safety net. This cron
 * resets that budget daily so a busy demo day never dead-ends the AI for later
 * visitors, and — when the demo mock is flipped OFF (NUXT_PUBLIC_DEMO_AI_MOCK
 * =false) and real AI is in play — bounds real spend to ~100k tokens/day.
 *
 * With the mock ON (default), deduction is skipped entirely, so this is belt +
 * suspenders. Enforcement lives in server/utils/ai-token-enforcement.ts.
 *
 * Auth: `cronSecret` Bearer header (Vercel Cron) — same convention as
 * /api/cron/project-digests. Manual triggers require an owner/admin session.
 */

import { readItems, updateItem } from '@directus/sdk';

const DEMO_ORG_SLUGS = ['earnest-demo-solo', 'earnest-demo-agency'];
const DEMO_TOKEN_CAP = 100_000;

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const cronSecret = (config as any).cronSecret;
	const authHeader = getHeader(event, 'authorization');

	if (authHeader === `Bearer ${cronSecret}` && cronSecret) {
		// authenticated via cron secret
	} else {
		const session = await requireUserSession(event);
		const userId = (session as any).user?.id;
		if (!userId) {
			throw createError({ statusCode: 401, message: 'Authentication required' });
		}
		try {
			await requireOrgRole(event, ['owner', 'admin']);
		} catch {
			throw createError({ statusCode: 403, message: 'Manual trigger requires owner/admin role' });
		}
	}

	const directus = getTypedDirectus();
	const orgs = (await directus.request(
		readItems('organizations', {
			filter: { slug: { _in: DEMO_ORG_SLUGS } },
			fields: ['id', 'slug'],
			limit: 10,
		}),
	)) as Array<{ id: string; slug: string }>;

	const results: Array<{ slug: string; ok: boolean }> = [];
	for (const org of orgs) {
		try {
			await directus.request(
				updateItem('organizations', org.id, {
					ai_token_limit_monthly: DEMO_TOKEN_CAP,
					ai_token_balance: DEMO_TOKEN_CAP,
					ai_tokens_used_this_period: 0,
				}),
			);
			results.push({ slug: org.slug, ok: true });
		} catch (err: any) {
			console.error(`[demo-token-topup] failed for ${org.slug}:`, err?.message);
			results.push({ slug: org.slug, ok: false });
		}
	}

	return { ok: true, cap: DEMO_TOKEN_CAP, topped_up: results };
});
