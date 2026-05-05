/**
 * Per-account historical backfill.
 * POST /api/social/accounts/:id/backfill
 *
 * Body: { days?: number }
 *   default 28 (Meta's typical retention window for page/IG insights)
 *   max 90 (anything past 28 will mostly come back empty — flagged in UI)
 *
 * Walks two passes for the requested account:
 *   1. Daily account snapshots — fetches one row per day from
 *      adapter.getAccountMetricsHistory and writes a snapshot per day.
 *   2. Per-post snapshots — lists recent posts (up to MAX_POSTS), fetches
 *      adapter.getPostInsights, writes one snapshot per post.
 *
 * Idempotent: skips days/posts that already have a snapshot from the same day,
 * so re-clicking the button after a partial run picks up where it left off.
 *
 * Tradeoffs (matching the project_social_historical_backfill.md notes):
 *  - Meta retention: capped at 90 days; out-of-window days return empty data.
 *  - Rate limits: sequential per call with PACE_MS sleep between Graph hits.
 *  - Threads: rejected with 400 — Threads has no historical insights endpoint.
 */

import { z } from 'zod'
import { facebookAdapter } from '~~/server/adapters/facebook'
import { instagramAdapter } from '~~/server/adapters/instagram'
import { requireSocialOrg } from '~~/server/utils/social-tenancy'
import {
  getSocialAccountById,
  getDecryptedAccessToken,
  getAnalyticsSnapshots,
  createAnalyticsSnapshot,
} from '~~/server/utils/social-directus'
import {
  isDemoAccount,
  generateSyntheticHistory,
  listSyntheticRecentPosts,
  syntheticPostInsights,
} from '~~/server/utils/social-demo-backfill'
import type { PlatformAdapter } from '~~/server/adapters/types'
import type { SocialPlatform } from '~~/shared/social'

const MAX_DAYS = 90
const DEFAULT_DAYS = 28
const MAX_POSTS = 25
const PACE_MS = 200

const adapterByPlatform: Partial<Record<SocialPlatform, PlatformAdapter>> = {
  facebook: facebookAdapter,
  instagram: instagramAdapter,
}

const bodySchema = z.object({
  days: z.number().int().min(1).max(MAX_DAYS).optional(),
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireSocialOrg(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Account ID required' })

  const account = await getSocialAccountById(id, organizationId)
  if (!account) throw createError({ statusCode: 404, message: 'Account not found' })

  const adapter = adapterByPlatform[account.platform]
  if (!adapter?.getAccountMetricsHistory) {
    throw createError({
      statusCode: 400,
      message: `Backfill is not supported for ${account.platform} accounts. Only Facebook and Instagram retain historical insights.`,
    })
  }

  const body = await readBody(event).catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: 'Validation failed', data: parsed.error.flatten() })
  }
  const days = parsed.data.days ?? DEFAULT_DAYS

  const demoMode = isDemoAccount(account)
  // Demo accounts seed placeholder tokens that don't decrypt and would never
  // authenticate against the real Graph API. Skip the network round-trip and
  // synthesize plausible historical data so the analytics surfaces light up.
  const accessToken = demoMode ? null : await getDecryptedAccessToken(id)
  if (!demoMode && !accessToken) {
    throw createError({ statusCode: 400, message: 'Account token could not be decrypted — try reconnecting.' })
  }

  const now = new Date()
  const sinceDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const sinceUnix = Math.floor(sinceDate.getTime() / 1000)
  const untilUnix = Math.floor(now.getTime() / 1000)

  // ── Pass 1: daily account history ──
  let daysProcessed = 0
  let daysSkipped = 0
  let daysFailed = 0

  // Pull existing account-snapshots in the window once so we can skip
  // already-captured days without N round-trips.
  const existingAccountSnapshots = await getAnalyticsSnapshots({
    social_account: id,
    snapshot_type: 'account',
    captured_after: sinceDate.toISOString(),
    captured_before: now.toISOString(),
    limit: MAX_DAYS,
  }).catch(() => [])
  const existingAccountDays = new Set(
    existingAccountSnapshots.map((s) => (s.captured_at || '').slice(0, 10)).filter(Boolean),
  )

  let history: Array<{ date: string; metrics: Record<string, number> }> = []
  if (demoMode) {
    history = generateSyntheticHistory(account, days)
  } else {
    try {
      history = await adapter.getAccountMetricsHistory(
        account.platform_user_id,
        accessToken!,
        sinceUnix,
        untilUnix,
      )
    } catch (err: any) {
      console.warn(`[social:backfill] account-history fetch failed for ${id}: ${err?.message || err}`)
      daysFailed = days
    }
  }

  for (const row of history) {
    if (existingAccountDays.has(row.date)) {
      daysSkipped++
      continue
    }
    try {
      // Use end-of-day as captured_at so the date filter on /social/analytics
      // groups the snapshot under the correct day in any timezone.
      const capturedAt = new Date(`${row.date}T23:59:59Z`).toISOString()
      await createAnalyticsSnapshot({
        social_account: id,
        snapshot_type: 'account',
        captured_at: capturedAt,
        metrics: row.metrics,
      })
      daysProcessed++
    } catch (err: any) {
      daysFailed++
      console.warn(`[social:backfill] account snapshot ${row.date} failed: ${err?.message || err}`)
    }
    if (!demoMode) await sleep(PACE_MS)
  }

  // ── Pass 2: recent posts ──
  let postsProcessed = 0
  let postsSkipped = 0
  let postsFailed = 0

  let recentPosts: Array<{ platformPostId: string; createdAt: string }> = []
  if (demoMode) {
    recentPosts = await listSyntheticRecentPosts(account, MAX_POSTS)
  } else if (adapter.listRecentPostIds && adapter.getPostInsights) {
    try {
      recentPosts = await adapter.listRecentPostIds(account.platform_user_id, accessToken!, MAX_POSTS)
    } catch (err: any) {
      console.warn(`[social:backfill] listRecentPostIds failed for ${id}: ${err?.message || err}`)
    }
  }

  // Idempotency for posts: skip platform-post ids whose metrics row was
  // already written today. social_post is null on historical/external posts so
  // we dedupe by the `_platform_post_id` we stash inside the metrics blob.
  const existingPostSnapshots = await getAnalyticsSnapshots({
    social_account: id,
    snapshot_type: 'post',
    captured_after: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    captured_before: now.toISOString(),
    limit: 200,
  }).catch(() => [])
  const capturedTodayPlatformIds = new Set(
    existingPostSnapshots
      .map((s) => (s.metrics as any)?._platform_post_id)
      .filter((v): v is string => typeof v === 'string'),
  )

  for (const post of recentPosts) {
    if (capturedTodayPlatformIds.has(post.platformPostId)) {
      postsSkipped++
      continue
    }

    try {
      const metrics = demoMode
        ? syntheticPostInsights(account.platform, post.platformPostId)
        : await adapter.getPostInsights!(post.platformPostId, accessToken!)
      await createAnalyticsSnapshot({
        social_account: id,
        snapshot_type: 'post',
        captured_at: new Date().toISOString(),
        // social_posts.id only exists for posts created through Earnest. For
        // historical posts published outside Earnest we keep the platform id
        // inside the metrics blob so the analytics UI can link back.
        metrics: { ...metrics, _platform_post_id: post.platformPostId, _post_created_at: post.createdAt },
      })
      postsProcessed++
    } catch (err: any) {
      postsFailed++
      console.warn(`[social:backfill] post insights ${post.platformPostId} failed: ${err?.message || err}`)
    }
    if (!demoMode) await sleep(PACE_MS)
  }

  return {
    ok: true,
    account_id: id,
    platform: account.platform,
    days_requested: days,
    days_returned_by_platform: history.length,
    days_processed: daysProcessed,
    days_skipped: daysSkipped,
    days_failed: daysFailed,
    posts_requested: recentPosts.length,
    posts_processed: postsProcessed,
    posts_skipped: postsSkipped,
    posts_failed: postsFailed,
    note: demoMode
      ? 'Demo account — synthetic history generated (no Graph API call).'
      : days > 28
        ? 'Meta retains roughly 28 days of account-level insights — days beyond that may have come back empty.'
        : undefined,
  }
})
