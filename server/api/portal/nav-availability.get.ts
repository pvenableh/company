// server/api/portal/nav-availability.get.ts
/**
 * GET /api/portal/nav-availability
 *
 * Returns booleans for which optional portal nav items have content for
 * the current portal user. The layout uses these to hide buttons that
 * would otherwise lead to empty pages.
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

  // Aggregates run in parallel; each returns the count for the relevant
  // collection scoped to the user's client.
  const [
    socialAccounts,
    socialPosts,
    emailCampaigns,
    marketingCampaigns,
    proposals,
    contracts,
  ] = await Promise.all([
    directus.request(aggregate('social_accounts', {
      aggregate: { count: '*' },
      query: { filter: { _and: [orgFilter, clientFilter] } },
    })).catch(() => [{ count: 0 }]),
    directus.request(aggregate('social_posts', {
      aggregate: { count: '*' },
      query: { filter: { _and: [orgFilter, clientFilter] } },
    })).catch(() => [{ count: 0 }]),
    directus.request(aggregate('email_campaigns', {
      aggregate: { count: '*' },
      query: { filter: { _and: [orgFilter, clientFilter] } },
    })).catch(() => [{ count: 0 }]),
    directus.request(aggregate('marketing_campaigns', {
      aggregate: { count: '*' },
      query: { filter: { _and: [orgFilter, clientFilter] } },
    })).catch(() => [{ count: 0 }]),
    directus.request(aggregate('proposals', {
      aggregate: { count: '*' },
      query: { filter: { _and: [orgFilter, clientFilter] } },
    })).catch(() => [{ count: 0 }]),
    directus.request(aggregate('contracts', {
      aggregate: { count: '*' },
      query: { filter: { _and: [orgFilter, clientFilter] } },
    })).catch(() => [{ count: 0 }]),
  ]);

  const toCount = (rows: any[]) => Number(rows?.[0]?.count ?? 0);

  return {
    social: toCount(socialAccounts) > 0 || toCount(socialPosts) > 0,
    marketing: toCount(emailCampaigns) > 0 || toCount(marketingCampaigns) > 0,
    proposals: toCount(proposals) > 0,
    contracts: toCount(contracts) > 0,
  };
});
