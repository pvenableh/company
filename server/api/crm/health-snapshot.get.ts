/**
 * CRM Health Snapshot — Pure algorithmic analysis, no AI tokens used.
 *
 * Returns computed health scores, overdue items, revenue trends, and
 * key metrics derived directly from CRM data. Replaces the AI-powered
 * overview for instant page-load display.
 *
 * Query: organizationId (required)
 */
import { getCRMContext } from '~/server/utils/crm-intelligence';

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
    const ctx = await getCRMContext(directus, organizationId, userId);

    // --- Compute health score from data (0-100) ---
    const scores: number[] = [];

    // Contact health (0-100): more contacts + growth = better
    const contactScore = Math.min(100, Math.round(
      (ctx.contacts.total > 0 ? 30 : 0)
      + Math.min(30, ctx.contacts.recentGrowth * 3)
      + (ctx.contacts.subscribedCount / Math.max(1, ctx.contacts.total)) * 40,
    ));
    scores.push(contactScore);

    // Project health: penalize overdue, reward active
    const projectScore = ctx.projects.total > 0
      ? Math.max(0, 100 - (ctx.projects.overdue.length * 20) - (ctx.projects.tasksPending > 20 ? 10 : 0))
      : 50; // neutral if no projects
    scores.push(projectScore);

    // Ticket health: penalize overdue + unassigned
    const ticketScore = ctx.tickets.totalLast30Days > 0
      ? Math.max(0, 100
          - (ctx.tickets.overdue.length * 15)
          - (ctx.tickets.unassigned * 5)
          + (ctx.tickets.avgResolutionDays != null && ctx.tickets.avgResolutionDays <= 3 ? 15 : 0))
      : 70;
    scores.push(Math.min(100, ticketScore));

    // Invoice health: penalize outstanding, reward consistent revenue
    const invoiceScore = Math.max(0, Math.min(100,
      80
      - (ctx.invoices.outstanding.length * 10)
      + (ctx.invoices.monthlyTrend.length >= 3 ? 10 : 0)
      + (ctx.invoices.totalOutstanding === 0 ? 10 : 0),
    ));
    scores.push(invoiceScore);

    // Deal health: pipeline value + conversion rate
    const dealScore = Math.min(100,
      (ctx.deals.open > 0 ? 30 : 0)
      + Math.min(30, (ctx.deals.conversionRate || 0) / 2)
      + (ctx.deals.overdueFollowUps.length === 0 ? 20 : Math.max(0, 20 - ctx.deals.overdueFollowUps.length * 5))
      + (ctx.deals.pipelineValue > 0 ? 20 : 0),
    );
    scores.push(dealScore);

    const healthScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    // --- Build alerts (rule-based, no AI) ---
    const alerts: Array<{ type: 'warning' | 'danger' | 'info' | 'success'; message: string }> = [];

    if (ctx.tickets.overdue.length > 0) {
      alerts.push({ type: 'danger', message: `${ctx.tickets.overdue.length} overdue ticket${ctx.tickets.overdue.length > 1 ? 's' : ''} need attention` });
    }
    if (ctx.projects.overdue.length > 0) {
      alerts.push({ type: 'danger', message: `${ctx.projects.overdue.length} project${ctx.projects.overdue.length > 1 ? 's' : ''} past deadline` });
    }
    if (ctx.invoices.totalOutstanding > 0) {
      alerts.push({ type: 'warning', message: `$${ctx.invoices.totalOutstanding.toLocaleString()} in overdue invoices` });
    }
    if (ctx.deals.overdueFollowUps.length > 0) {
      alerts.push({ type: 'warning', message: `${ctx.deals.overdueFollowUps.length} deal follow-up${ctx.deals.overdueFollowUps.length > 1 ? 's' : ''} overdue` });
    }
    if (ctx.tickets.unassigned > 2) {
      alerts.push({ type: 'info', message: `${ctx.tickets.unassigned} unassigned tickets` });
    }
    if (ctx.contacts.recentGrowth > 5) {
      alerts.push({ type: 'success', message: `${ctx.contacts.recentGrowth} new contacts this month` });
    }
    if (ctx.projects.dueSoon.length > 0) {
      alerts.push({ type: 'info', message: `${ctx.projects.dueSoon.length} project${ctx.projects.dueSoon.length > 1 ? 's' : ''} due within 7 days` });
    }

    // --- Revenue trend (simple direction) ---
    const trend = ctx.invoices.monthlyTrend;
    let revenueTrend: 'up' | 'down' | 'flat' = 'flat';
    if (trend.length >= 2) {
      const recent = trend[trend.length - 1].total;
      const previous = trend[trend.length - 2].total;
      if (recent > previous * 1.1) revenueTrend = 'up';
      else if (recent < previous * 0.9) revenueTrend = 'down';
    }

    return {
      healthScore,
      breakdown: {
        contacts: contactScore,
        projects: projectScore,
        tickets: Math.min(100, ticketScore),
        invoices: invoiceScore,
        deals: dealScore,
      },
      alerts,
      metrics: {
        totalContacts: ctx.contacts.total,
        contactGrowth: ctx.contacts.recentGrowth,
        activeProjects: ctx.projects.total,
        overdueProjects: ctx.projects.overdue.length,
        overdueTickets: ctx.tickets.overdue.length,
        unassignedTickets: ctx.tickets.unassigned,
        avgResolutionDays: ctx.tickets.avgResolutionDays,
        totalRevenue6Mo: ctx.invoices.totalRevenue6Months,
        outstandingAmount: ctx.invoices.totalOutstanding,
        pipelineValue: ctx.deals.pipelineValue,
        openDeals: ctx.deals.open,
        dealConversionRate: ctx.deals.conversionRate,
        revenueTrend,
        monthlyRevenue: ctx.invoices.monthlyTrend,
        topClients: ctx.invoices.topClients,
      },
      // Pass through overdue items for display
      overdueTickets: ctx.tickets.overdue.slice(0, 5),
      overdueProjects: ctx.projects.overdue.slice(0, 5),
      outstandingInvoices: ctx.invoices.outstanding.slice(0, 5),
      overdueFollowUps: ctx.deals.overdueFollowUps.slice(0, 5),
      // Include brand context so the UI can display org/client brand info
      brandContext: ctx.brandContext || null,
    };
  } catch (error: any) {
    console.error('[crm/health-snapshot] Failed:', error.message);
    throw createError({ statusCode: 500, message: 'Failed to compute CRM health snapshot' });
  }
});
