/**
 * Daily metrics-refresh cron.
 *
 * Two passes per tick:
 *   1. Account-level snapshots — for every active social_accounts row across
 *      all orgs, call adapter.getAccountMetrics() and write one
 *      social_analytics_snapshots row keyed snapshot_type='account'.
 *   2. Post-level snapshots — for every social_posts row published in the last
 *      7 days (insights settle ~24h post-publish; we keep a fresh window),
 *      call adapter.getPostInsights() per platform target and write
 *      snapshot_type='post' rows.
 *
 * Auth: Bearer cronSecret OR admin user session (matches publish-scheduled).
 * Method: GET (Vercel Cron) or POST (manual).
 *
 * Per-account / per-post errors are swallowed and counted; one bad account
 * never aborts the rest of the tick.
 */

import { facebookAdapter } from '~~/server/adapters/facebook'
import { instagramAdapter } from '~~/server/adapters/instagram'
import { threadsAdapter } from '~~/server/adapters/threads'
import {
  findActiveSocialAccountsAcrossOrgs,
  findRecentlyPublishedPostsAcrossOrgs,
  createAnalyticsSnapshot,
} from '~~/server/utils/social-directus'
import { safeDecryptSocialToken } from '~~/server/utils/social-crypto'
import type { PlatformAdapter } from '~~/server/adapters/types'
import type { SocialAccount, SocialPlatform, PublishResult } from '~~/shared/social'

const POST_INSIGHTS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const adapterByPlatform: Partial<Record<SocialPlatform, PlatformAdapter>> = {
  facebook: facebookAdapter,
  instagram: instagramAdapter,
  threads: threadsAdapter,
}

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  const config = useRuntimeConfig()
  const cronSecret = (config as any).cronSecret || (config.public as any)?.cronSecret
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // authenticated as cron
  } else {
    const session = await requireUserSession(event)
    const userId = (session as any).user?.id
    if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' })
  }

  const capturedAt = new Date().toISOString()

  // ── Pass 1: account-level snapshots ──
  const accounts = await findActiveSocialAccountsAcrossOrgs()
  let accountsProcessed = 0
  let accountsFailed = 0

  for (const account of accounts) {
    const adapter = adapterByPlatform[account.platform]
    if (!adapter?.getAccountMetrics) continue

    const accessToken = safeDecryptSocialToken(account.access_token)
    if (!accessToken) {
      accountsFailed++
      console.warn(`[social:refresh-metrics] account ${account.id} (${account.platform}) — token decrypt failed`)
      continue
    }

    try {
      const metrics = await adapter.getAccountMetrics(account.platform_user_id, accessToken)
      await createAnalyticsSnapshot({
        social_account: account.id,
        snapshot_type: 'account',
        captured_at: capturedAt,
        metrics,
      })
      accountsProcessed++
    } catch (err: any) {
      accountsFailed++
      console.warn(
        `[social:refresh-metrics] account ${account.id} (${account.platform}) — ${err?.message || err}`,
      )
    }
  }

  // ── Pass 2: per-post snapshots ──
  const since = new Date(Date.now() - POST_INSIGHTS_WINDOW_MS).toISOString()
  const recentPosts = await findRecentlyPublishedPostsAcrossOrgs({ sinceIso: since })
  const accountById = new Map<string, SocialAccount>(accounts.map((a) => [a.id, a]))

  let postsProcessed = 0
  let postsFailed = 0

  for (const post of recentPosts) {
    const results = (Array.isArray(post.publish_results) ? post.publish_results : []) as PublishResult[]

    for (const result of results) {
      if (!result.success || !result.platform_post_id) continue
      const adapter = adapterByPlatform[result.platform]
      if (!adapter?.getPostInsights) continue

      const account = accountById.get(result.account_id)
      if (!account) continue

      const accessToken = safeDecryptSocialToken(account.access_token)
      if (!accessToken) {
        postsFailed++
        continue
      }

      try {
        const metrics = await adapter.getPostInsights(result.platform_post_id, accessToken)
        await createAnalyticsSnapshot({
          social_account: account.id,
          social_post: post.id,
          snapshot_type: 'post',
          captured_at: capturedAt,
          metrics,
        })
        postsProcessed++
      } catch (err: any) {
        postsFailed++
        console.warn(
          `[social:refresh-metrics] post ${post.id} target ${result.platform}/${result.platform_post_id} — ${err?.message || err}`,
        )
      }
    }
  }

  return {
    ok: true,
    captured_at: capturedAt,
    accounts: { processed: accountsProcessed, failed: accountsFailed, total: accounts.length },
    posts: { processed: postsProcessed, failed: postsFailed, total: recentPosts.length },
  }
})
