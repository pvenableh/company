// server/api/portal/nav-availability.get.ts
/**
 * GET /api/portal/nav-availability
 *
 * Returns booleans for which portal apps have content for the current
 * portal user. The layout uses these to hide rail chips that would
 * otherwise lead to empty hubs. Booleans are app-shaped, not section-
 * shaped: `progress`, `billing`, `performance`, `messages`.
 *
 * Each flag rolls up the underlying collections — Progress is on if any
 * of projects/tasks/tickets has rows, Billing is on if any of invoices/
 * proposals/contracts has rows, etc.
 *
 * Cheap aggregate counts only — no row data leaves the server.
 */

import { aggregate } from '@directus/sdk';
import { requirePortalContext } from '~~/server/utils/portal-auth';

export default defineEventHandler(async (event) => {
  const ctx = await requirePortalContext(event);
  const directus = getServerDirectus();

  const orgFilter = { organization: { _eq: ctx.organizationId } };
  const clientFilter = { client: { _in: ctx.scopedClientIds } };

  const count = (collection: string) =>
    directus
      .request(aggregate(collection as never, {
        aggregate: { count: '*' },
        query: { filter: { _and: [orgFilter, clientFilter] } },
      }))
      .catch(() => [{ count: 0 }]);

  const [
    projects,
    tickets,
    tasks,
    invoices,
    proposals,
    contracts,
    socialAccounts,
    socialPosts,
    emailCampaigns,
    marketingCampaigns,
    channels,
  ] = await Promise.all([
    count('projects'),
    count('tickets'),
    count('tasks'),
    count('invoices'),
    count('proposals'),
    count('contracts'),
    count('social_accounts'),
    count('social_posts'),
    count('email_campaigns'),
    count('marketing_campaigns'),
    count('channels'),
  ]);

  const toCount = (rows: unknown) => {
    const r = (rows as Array<{ count?: number | string | null }> | null) ?? [];
    return Number(r[0]?.count ?? 0);
  };

  const hasProgress = toCount(projects) > 0 || toCount(tickets) > 0 || toCount(tasks) > 0;
  const hasBilling = toCount(invoices) > 0 || toCount(proposals) > 0 || toCount(contracts) > 0;
  const hasPerformance = toCount(socialAccounts) > 0 || toCount(socialPosts) > 0
    || toCount(emailCampaigns) > 0 || toCount(marketingCampaigns) > 0;
  const hasMessages = toCount(channels) > 0;

  return {
    progress: hasProgress,
    billing: hasBilling,
    performance: hasPerformance,
    messages: hasMessages,
  };
});
