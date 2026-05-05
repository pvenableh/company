/**
 * Analytics API
 * GET /api/social/analytics — Get analytics overview with optional filters
 */

import { getAnalyticsSnapshots, getSocialAccounts, getSocialAccountById } from '~~/server/utils/social-directus'
import { requireSocialOrg } from '~~/server/utils/social-tenancy'

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireSocialOrg(event)
  const query = getQuery(event)
  const accountId = query.account_id as string | undefined
  const startDate = query.start_date as string | undefined
  const endDate = query.end_date as string | undefined

  try {
    // If specific account requested — verify it belongs to this org
    if (accountId) {
      const acc = await getSocialAccountById(accountId, organizationId)
      if (!acc) {
        throw createError({ statusCode: 404, message: 'Account not found' })
      }
      const snapshots = await getAnalyticsSnapshots({
        social_account: accountId,
        snapshot_type: 'account',
        captured_after: startDate,
        captured_before: endDate,
        limit: 100,
      })

      const latest = snapshots[0]
      const previous = snapshots[snapshots.length - 1]

      // Return the SAME overview+accounts shape as the all-accounts branch so
      // the dashboard's empty-state guard (`platformBreakdown.length > 0`) and
      // KPI mapper both work identically when an account is filtered.
      let totalReach = 0
      let totalImpressions = 0
      let totalProfileViews = 0
      let totalWebsiteClicks = 0
      let totalPostEngagements = 0
      let totalVideoViews = 0
      for (const s of snapshots) {
        const m = (s.metrics as any) || {}
        if (m.reach) totalReach += m.reach
        if (m.impressions) totalImpressions += m.impressions
        if (m.page_impressions) totalImpressions += m.page_impressions
        if (m.profile_views) totalProfileViews += m.profile_views
        if (m.website_clicks) totalWebsiteClicks += m.website_clicks
        if (m.page_post_engagements) totalPostEngagements += m.page_post_engagements
        if (m.video_views) totalVideoViews += m.video_views
      }

      const latestMetrics = (latest?.metrics as any) || {}
      const totalFollowers = latestMetrics.followers_count ?? latestMetrics.follower_count ?? 0

      return {
        data: {
          account_id: accountId,
          // Legacy fields kept for any caller that already consumes them
          snapshots,
          current: latest?.metrics || null,
          previous: previous?.metrics || null,
          // Unified overview + accounts so the dashboard renders the same way
          overview: {
            total_accounts: 1,
            total_followers: totalFollowers,
            total_reach: totalReach,
            total_impressions: totalImpressions,
            total_profile_views: totalProfileViews,
            total_website_clicks: totalWebsiteClicks,
            total_post_engagements: totalPostEngagements,
            total_video_views: totalVideoViews,
            avg_engagement_rate: latestMetrics.engagement_rate ?? 0,
            snapshot_count: snapshots.length,
          },
          accounts: latest
            ? [
                {
                  account_id: accountId,
                  platform: acc.platform,
                  account_name: acc.account_name,
                  metrics: latest.metrics,
                  captured_at: latest.captured_at,
                },
              ]
            : [],
        },
      }
    }

    // Aggregate across all org accounts.
    //
    // Two semantics in play:
    //   - **Cumulative-per-day** metrics (reach, impressions, profile_views,
    //     website_clicks, page_post_engagements, page_fan_adds) — each daily
    //     snapshot is a per-day count, so the period total = sum across all
    //     snapshots in [startDate, endDate].
    //   - **Stock** metrics (followers_count / follower_count) — each snapshot
    //     is a point-in-time stock value, so the period "current" = the latest
    //     snapshot in the window.
    //
    // The previous implementation took the latest snapshot's reach/impressions
    // as the period totals, which made the date range picker a no-op.
    const accounts = await getSocialAccounts(organizationId, { status: 'active' })

    const allSnapshots = []
    for (const account of accounts) {
      // Limit upper-bounded to 90 (= MAX_DAYS in backfill) — one row per day max.
      const snapshots = await getAnalyticsSnapshots({
        social_account: account.id,
        snapshot_type: 'account',
        captured_after: startDate,
        captured_before: endDate,
        limit: 90,
      })
      allSnapshots.push(...snapshots.map((s) => ({ ...s, account })))
    }

    // Track latest per-account for stock metrics + per-account exposure
    const latestByAccount = new Map()
    for (const snapshot of allSnapshots) {
      const existing = latestByAccount.get(snapshot.social_account)
      if (!existing || new Date(snapshot.captured_at) > new Date(existing.captured_at)) {
        latestByAccount.set(snapshot.social_account, snapshot)
      }
    }

    // Stock: sum latest follower_count across accounts
    let totalFollowers = 0
    let engagementSum = 0
    let engagementCount = 0
    for (const snapshot of latestByAccount.values()) {
      const metrics = snapshot.metrics as any
      if (metrics.followers_count) totalFollowers += metrics.followers_count
      if (metrics.follower_count) totalFollowers += metrics.follower_count
      if (metrics.engagement_rate) {
        engagementSum += metrics.engagement_rate
        engagementCount++
      }
    }

    // Cumulative: sum across every snapshot in the range
    let totalReach = 0
    let totalImpressions = 0
    let totalProfileViews = 0
    let totalWebsiteClicks = 0
    let totalPostEngagements = 0
    let totalVideoViews = 0
    for (const snapshot of allSnapshots) {
      const metrics = (snapshot as any).metrics as Record<string, number>
      if (metrics.reach) totalReach += metrics.reach
      if (metrics.impressions) totalImpressions += metrics.impressions
      if (metrics.page_impressions) totalImpressions += metrics.page_impressions
      if (metrics.profile_views) totalProfileViews += metrics.profile_views
      if (metrics.website_clicks) totalWebsiteClicks += metrics.website_clicks
      if (metrics.page_post_engagements) totalPostEngagements += metrics.page_post_engagements
      if (metrics.video_views) totalVideoViews += metrics.video_views
    }

    return {
      data: {
        overview: {
          total_accounts: accounts.length,
          total_followers: totalFollowers,
          total_reach: totalReach,
          total_impressions: totalImpressions,
          total_profile_views: totalProfileViews,
          total_website_clicks: totalWebsiteClicks,
          total_post_engagements: totalPostEngagements,
          total_video_views: totalVideoViews,
          avg_engagement_rate: engagementCount > 0 ? engagementSum / engagementCount : 0,
          snapshot_count: allSnapshots.length,
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
    console.warn('[Social Analytics API] Error:', error.message || error)
    return {
      data: {
        overview: {
          total_accounts: 0,
          total_followers: 0,
          total_reach: 0,
          total_impressions: 0,
          avg_engagement_rate: 0,
        },
        accounts: [],
      },
    }
  }
})
