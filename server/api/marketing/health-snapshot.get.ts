/**
 * Marketing Health Snapshot — Pure algorithmic analysis, no AI tokens used.
 *
 * Returns computed marketing health scores, content velocity,
 * audience metrics, and channel performance from raw data.
 *
 * Query: organizationId (required)
 */
import { getMarketingContext } from '~/server/utils/marketing-intelligence';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const query = getQuery(event);
  const organizationId = query.organizationId as string;
  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'organizationId is required' });
  }

  const directus = await getUserDirectus(event);

  try {
    const ctx = await getMarketingContext(directus, organizationId);

    // --- Compute marketing health score (0-100) ---
    const scores: number[] = [];

    // Audience score: contact base + subscription rate
    const subRate = ctx.contacts.total > 0
      ? ctx.contacts.subscribedCount / ctx.contacts.total
      : 0;
    const audienceScore = Math.min(100, Math.round(
      (ctx.contacts.total > 0 ? 25 : 0)
      + Math.min(25, ctx.contacts.recentGrowth * 2.5)
      + (subRate * 50),
    ));
    scores.push(audienceScore);

    // Content velocity: social activity
    const socialPostCount = ctx.social.postsLast30Days || 0;
    const connectedPlatforms = ctx.social.connectedPlatforms?.length || 0;
    const failedPosts = ctx.social.recentPosts?.filter((p: any) => p.status === 'failed').length || 0;
    const socialScore = Math.min(100, Math.round(
      (socialPostCount > 0 ? 20 : 0)
      + Math.min(30, socialPostCount * 3)
      + Math.min(30, connectedPlatforms * 15)
      + (failedPosts === 0 ? 20 : Math.max(0, 20 - failedPosts * 10)),
    ));
    scores.push(socialScore);

    // Email marketing score
    const emailScore = Math.min(100, Math.round(
      (ctx.email.totalCampaigns > 0 ? 30 : 0)
      + Math.min(30, ctx.email.recentCampaigns.length * 10)
      + Math.min(40, ctx.email.totalSubscribers * 0.4),
    ));
    scores.push(emailScore);

    // Revenue correlation score
    const totalRevenue = ctx.revenue.monthlyTrend.reduce((sum, m) => sum + m.total, 0);
    const revenueScore = Math.min(100, Math.round(
      (totalRevenue > 0 ? 40 : 0)
      + (ctx.revenue.monthlyTrend.length >= 3 ? 20 : 0)
      + Math.min(40, (ctx.clients.total || 0) * 4),
    ));
    scores.push(revenueScore);

    const healthScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    // --- Revenue trend ---
    const trend = ctx.revenue.monthlyTrend || [];
    let revenueTrend: 'up' | 'down' | 'flat' = 'flat';
    if (trend.length >= 2) {
      const recent = trend[trend.length - 1].total;
      const previous = trend[trend.length - 2].total;
      if (recent > previous * 1.1) revenueTrend = 'up';
      else if (recent < previous * 0.9) revenueTrend = 'down';
    }

    // --- Alerts ---
    const alerts: Array<{ type: 'warning' | 'danger' | 'info' | 'success'; message: string }> = [];

    if (failedPosts > 0) {
      alerts.push({ type: 'danger', message: `${failedPosts} social post${failedPosts > 1 ? 's' : ''} failed to publish` });
    }
    if (connectedPlatforms === 0) {
      alerts.push({ type: 'warning', message: 'No social accounts connected' });
    }
    if (ctx.contacts.recentGrowth > 10) {
      alerts.push({ type: 'success', message: `${ctx.contacts.recentGrowth} new contacts this month` });
    }
    if (ctx.email.totalSubscribers === 0 && ctx.contacts.total > 0) {
      alerts.push({ type: 'info', message: 'Consider building a mailing list from your contacts' });
    }

    return {
      healthScore,
      breakdown: {
        audience: audienceScore,
        social: socialScore,
        email: emailScore,
        revenue: revenueScore,
      },
      alerts,
      metrics: {
        totalContacts: ctx.contacts.total,
        subscribedContacts: ctx.contacts.subscribedCount,
        contactGrowth: ctx.contacts.recentGrowth,
        subscriptionRate: Math.round(subRate * 100),
        socialPostsLast30Days: socialPostCount,
        connectedPlatforms,
        failedPosts,
        totalCampaigns: ctx.email.totalCampaigns,
        recentCampaigns: ctx.email.recentCampaigns.length,
        totalSubscribers: ctx.email.totalSubscribers,
        mailingLists: ctx.email.mailingListCount,
        totalRevenue,
        revenueTrend,
        monthlyRevenue: ctx.revenue.monthlyTrend,
        totalClients: ctx.clients.total,
      },
      topTags: ctx.contacts.topTags,
    };
  } catch (error: any) {
    console.error('[marketing/health-snapshot] Failed:', error.message);
    throw createError({ statusCode: 500, message: 'Failed to compute marketing health snapshot' });
  }
});
