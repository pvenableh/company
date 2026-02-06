/**
 * Analytics API
 * GET /api/social/analytics — Get analytics overview with optional filters
 */

import { getAnalyticsSnapshots, getSocialAccounts } from '~/server/utils/social-directus'
import type { SocialPlatform } from '~/types/social'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const accountId = query.account_id as string | undefined
  const startDate = query.start_date as string | undefined
  const endDate = query.end_date as string | undefined

  try {
    // If specific account requested
    if (accountId) {
      const snapshots = await getAnalyticsSnapshots({
        social_account: accountId,
        snapshot_type: 'account',
        captured_after: startDate,
        captured_before: endDate,
        limit: 100,
      })

      // Get latest snapshot for current metrics
      const latest = snapshots[0]
      const previous = snapshots[snapshots.length - 1]

      return {
        data: {
          account_id: accountId,
          snapshots,
          current: latest?.metrics || null,
          previous: previous?.metrics || null,
        },
      }
    }

    // Aggregate across all accounts
    const accounts = await getSocialAccounts({ status: 'active' })

    const allSnapshots = []
    for (const account of accounts) {
      const snapshots = await getAnalyticsSnapshots({
        social_account: account.id,
        snapshot_type: 'account',
        captured_after: startDate,
        captured_before: endDate,
        limit: 10,
      })
      allSnapshots.push(...snapshots.map((s) => ({ ...s, account })))
    }

    // Aggregate metrics
    const latestByAccount = new Map()
    for (const snapshot of allSnapshots) {
      const existing = latestByAccount.get(snapshot.social_account)
      if (!existing || new Date(snapshot.captured_at) > new Date(existing.captured_at)) {
        latestByAccount.set(snapshot.social_account, snapshot)
      }
    }

    let totalFollowers = 0
    let totalReach = 0
    let totalImpressions = 0
    let engagementSum = 0
    let engagementCount = 0

    for (const snapshot of latestByAccount.values()) {
      const metrics = snapshot.metrics as any
      if (metrics.followers_count) totalFollowers += metrics.followers_count
      if (metrics.follower_count) totalFollowers += metrics.follower_count
      if (metrics.reach) totalReach += metrics.reach
      if (metrics.impressions) totalImpressions += metrics.impressions
      if (metrics.engagement_rate) {
        engagementSum += metrics.engagement_rate
        engagementCount++
      }
    }

    return {
      data: {
        overview: {
          total_accounts: accounts.length,
          total_followers: totalFollowers,
          total_reach: totalReach,
          total_impressions: totalImpressions,
          avg_engagement_rate: engagementCount > 0 ? engagementSum / engagementCount : 0,
        },
        accounts: Array.from(latestByAccount.entries()).map(([id, snapshot]) => ({
          account_id: id,
          platform: (snapshot as any).account.platform,
          account_name: (snapshot as any).account.account_name,
          metrics: snapshot.metrics,
          captured_at: snapshot.captured_at,
        })),
      },
    }
  } catch (error: any) {
    console.error('[api:analytics] Error:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to fetch analytics',
    })
  }
})
