/**
 * Synthetic backfill data for demo social accounts.
 *
 * The demo workspaces (`metadata.demo === true` on social_accounts) seed
 * placeholder access tokens that don't decrypt and would never authenticate
 * against the real Graph API. So for those accounts we skip the network
 * round-trip entirely and produce plausible-looking historical metrics so
 * the analytics surfaces and the "Fetch history" CTA both light up.
 *
 * Production accounts (any account without `metadata.demo`) hit the real
 * adapter path — this helper is never called for them.
 */
import type { SocialAccount, SocialPlatform } from '~~/shared/social'
import { getSocialPosts } from '~~/server/utils/social-directus'

export function isDemoAccount(account: SocialAccount): boolean {
	const md = (account.metadata ?? {}) as Record<string, unknown>
	return md.demo === true
}

interface DailyMetrics {
	date: string
	metrics: Record<string, number>
}

interface RecentPostRef {
	platformPostId: string
	createdAt: string
}

/**
 * Deterministic-ish PRNG so the same account+day always produces the same
 * numbers — keeps re-runs idempotent at the value level.
 */
function seedFor(seed: string): () => number {
	let h = 2166136261 >>> 0
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i)
		h = Math.imul(h, 16777619)
	}
	return () => {
		h += 0x6d2b79f5
		let t = h
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

function dailyMetricsFor(
	platform: SocialPlatform,
	date: Date,
	rng: () => number,
	dayIndex: number,
): Record<string, number> {
	// Mild week-over-week growth + weekday lift to feel real.
	const dow = date.getUTCDay() // 0..6
	const weekdayLift = dow >= 1 && dow <= 4 ? 1.15 : 0.85
	const trend = 1 + dayIndex * 0.012
	const base = 90 + Math.floor(rng() * 130)
	const reach = Math.floor(base * weekdayLift * trend)
	const impressions = Math.floor(reach * (1.4 + rng() * 0.4))

	if (platform === 'instagram') {
		return {
			reach,
			impressions,
			profile_views: Math.floor(reach * (0.06 + rng() * 0.04)),
			website_clicks: Math.floor(reach * (0.01 + rng() * 0.015)),
		}
	}
	// facebook
	return {
		page_impressions: impressions,
		page_post_engagements: Math.floor(reach * (0.05 + rng() * 0.04)),
		page_fan_adds: Math.floor(rng() * 4),
	}
}

export function generateSyntheticHistory(
	account: SocialAccount,
	days: number,
): DailyMetrics[] {
	const out: DailyMetrics[] = []
	const rng = seedFor(`${account.id}:${account.platform}:hist`)
	const now = new Date()
	for (let i = days - 1; i >= 0; i--) {
		const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
		const iso = d.toISOString().slice(0, 10)
		out.push({
			date: iso,
			metrics: dailyMetricsFor(account.platform, d, rng, days - 1 - i),
		})
	}
	return out
}

/**
 * Pull up to `max` recent published posts from social_posts for this demo
 * account. The post's id doubles as the synthetic platformPostId so the
 * idempotency dedupe key inside the backfill route still works.
 */
export async function listSyntheticRecentPosts(
	account: SocialAccount,
	max: number,
): Promise<RecentPostRef[]> {
	try {
		const orgId = (account.organization as any)?.id || (account.organization as unknown as string)
		const posts = await getSocialPosts(orgId, { status: 'published', limit: max })
		return posts.map((p) => ({
			platformPostId: `demo_${p.id}`,
			createdAt: p.published_at || p.scheduled_at || new Date().toISOString(),
		}))
	} catch {
		return []
	}
}

export function syntheticPostInsights(
	platform: SocialPlatform,
	platformPostId: string,
): Record<string, number> {
	const rng = seedFor(`${platformPostId}:${platform}:post`)
	const reach = 60 + Math.floor(rng() * 240)
	const impressions = Math.floor(reach * (1.3 + rng() * 0.5))
	const likes = Math.floor(reach * (0.04 + rng() * 0.06))
	const comments = Math.floor(reach * (0.005 + rng() * 0.01))
	const saves = Math.floor(reach * (0.01 + rng() * 0.015))
	const shares = Math.floor(reach * (0.003 + rng() * 0.008))
	const engagement = likes + comments + saves + shares
	if (platform === 'instagram') {
		return { reach, impressions, likes, comments, saves, shares, engagement }
	}
	return {
		post_impressions: impressions,
		post_reach: reach,
		post_engaged_users: engagement,
		post_clicks: Math.floor(reach * (0.01 + rng() * 0.02)),
	}
}
