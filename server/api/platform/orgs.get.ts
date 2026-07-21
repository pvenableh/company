// server/api/platform/orgs.get.ts
/**
 * GET /api/platform/orgs
 *
 * Cross-org roster for the platform console (Earnest creator only). Every org
 * with a one-line feedback summary (agency avg/count + delivered-CSAT avg),
 * computed with grouped aggregates so it's one query per source, not N.
 */
import { readItems, aggregate } from '@directus/sdk';
import { requirePlatformAdmin } from '~~/server/utils/platform';

export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event);
  const directus = getServerDirectus();

  const [orgs, agencyAgg, projectAgg, ticketAgg] = await Promise.all([
    directus.request(readItems('organizations', {
      fields: ['id', 'name', 'logo', 'archived_at'],
      sort: ['name'],
      limit: -1,
    })) as Promise<Array<{ id: string; name: string; logo: string | null; archived_at: string | null }>>,
    directus.request(aggregate('agency_ratings', { aggregate: { count: '*', avg: ['rating'] }, groupBy: ['organization'] })) as Promise<any[]>,
    directus.request(aggregate('projects', { aggregate: { count: '*', avg: ['csat_rating'] }, groupBy: ['organization'], query: { filter: { csat_rating: { _nnull: true } } } } as any)) as Promise<any[]>,
    directus.request(aggregate('tickets', { aggregate: { count: '*', avg: ['csat_rating'] }, groupBy: ['organization'], query: { filter: { csat_rating: { _nnull: true } } } } as any)) as Promise<any[]>,
  ]);

  const byOrg = (rows: any[], key: string) => {
    const m = new Map<string, { count: number; avg: number }>();
    for (const r of rows || []) {
      const org = r.organization ?? r.group?.organization;
      if (!org) continue;
      m.set(org, { count: Number(r.count ?? 0), avg: Math.round(Number(r.avg?.[key] ?? 0) * 10) / 10 });
    }
    return m;
  };
  const agency = byOrg(agencyAgg, 'rating');
  const projects = byOrg(projectAgg, 'csat_rating');
  const tickets = byOrg(ticketAgg, 'csat_rating');

  return orgs.map((o) => {
    const a = agency.get(o.id);
    const p = projects.get(o.id);
    const t = tickets.get(o.id);
    const csatCount = (p?.count ?? 0) + (t?.count ?? 0);
    const csatAvg = csatCount
      ? Math.round((((p?.avg ?? 0) * (p?.count ?? 0) + (t?.avg ?? 0) * (t?.count ?? 0)) / csatCount) * 10) / 10
      : 0;
    return {
      id: o.id,
      name: o.name,
      logo: o.logo,
      archived: !!o.archived_at,
      agency: { avg: a?.avg ?? 0, count: a?.count ?? 0 },
      csat: { avg: csatAvg, count: csatCount },
    };
  });
});
