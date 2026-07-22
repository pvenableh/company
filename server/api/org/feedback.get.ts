// server/api/org/feedback.get.ts
/**
 * GET /api/org/feedback?org=<id>
 *
 * Aggregated client feedback for one organization — the data behind the org
 * feedback hub. Reads on the admin token (so no staff read-perms on the private
 * `agency_ratings` collection are needed) after authorizing the caller as an
 * org manager+ OR a platform admin (who may pass any org). This single endpoint
 * powers both the per-org staff hub and the cross-org platform view.
 *
 * Returns: { org, agency, projects, tickets } — each { avg, count, recent[] }.
 */
import { readItems, readUsers } from '@directus/sdk';
import { authorizeOrgInsight } from '~~/server/utils/platform';

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

export default defineEventHandler(async (event) => {
  const orgId = String(getQuery(event).org || '');
  await authorizeOrgInsight(event, orgId);

  const directus = getServerDirectus();

  // Private agency ratings (client field is a plain uuid — resolve names after).
  const agencyRows = (await directus.request(readItems('agency_ratings', {
    filter: { organization: { _eq: orgId }, status: { _eq: 'published' } },
    fields: ['id', 'rating', 'comment', 'date_created', 'client', 'user'],
    sort: ['-date_created'],
    limit: 200,
  }))) as Array<{ id: number; rating: number; comment: string | null; date_created: string; client: string | null; user: string | null }>;

  // Resolve client + user display names for the recent list.
  const clientIds = [...new Set(agencyRows.map((r) => r.client).filter(Boolean))] as string[];
  const userIds = [...new Set(agencyRows.map((r) => r.user).filter(Boolean))] as string[];
  const [clients, users] = await Promise.all([
    clientIds.length ? directus.request(readItems('clients', { filter: { id: { _in: clientIds } }, fields: ['id', 'name'], limit: 200 })) as Promise<Array<{ id: string; name: string }>> : Promise.resolve([]),
    userIds.length ? directus.request(readUsers({ filter: { id: { _in: userIds } }, fields: ['id', 'first_name', 'last_name'], limit: 200 })) as Promise<Array<{ id: string; first_name: string; last_name: string }>> : Promise.resolve([]),
  ]);
  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name || null;
  const userName = (id: string | null) => {
    const u = users.find((x) => x.id === id);
    return u ? [u.first_name, u.last_name].filter(Boolean).join(' ') : null;
  };

  // Delivered-work CSAT lives on the items themselves (client is an FK — walk it).
  const csatFields = ['id', 'title', 'csat_rating', 'csat_comment', 'csat_submitted_at', 'client.name'] as const;
  const [projectRows, ticketRows] = await Promise.all([
    directus.request(readItems('projects', {
      filter: { organization: { _eq: orgId }, csat_rating: { _nnull: true } },
      fields: csatFields as any,
      sort: ['-csat_submitted_at'],
      limit: 200,
    })) as Promise<any[]>,
    directus.request(readItems('tickets', {
      filter: { organization: { _eq: orgId }, csat_rating: { _nnull: true } },
      fields: csatFields as any,
      sort: ['-csat_submitted_at'],
      limit: 200,
    })) as Promise<any[]>,
  ]);

  const mapCsat = (rows: any[]) => rows.map((r) => ({
    id: r.id,
    title: r.title,
    rating: r.csat_rating,
    comment: r.csat_comment || null,
    date: r.csat_submitted_at,
    clientName: typeof r.client === 'object' ? r.client?.name : null,
  }));

  return {
    org: orgId,
    agency: {
      avg: avg(agencyRows.map((r) => r.rating)),
      count: agencyRows.length,
      recent: agencyRows.slice(0, 20).map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        date: r.date_created,
        clientName: clientName(r.client),
        userName: userName(r.user),
      })),
    },
    projects: {
      avg: avg(projectRows.map((r) => r.csat_rating)),
      count: projectRows.length,
      recent: mapCsat(projectRows).slice(0, 20),
    },
    tickets: {
      avg: avg(ticketRows.map((r) => r.csat_rating)),
      count: ticketRows.length,
      recent: mapCsat(ticketRows).slice(0, 20),
    },
  };
});
