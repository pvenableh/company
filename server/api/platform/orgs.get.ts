// server/api/platform/orgs.get.ts
/**
 * GET /api/platform/orgs
 *
 * Cross-org roster for the platform console (Earnest creator only). Each org
 * with feedback + usage + revenue + health, computed with grouped aggregates
 * (one query per source, not N). Revenue is summed in JS — `amount` is a string
 * column, so a SQL SUM() 500s.
 */
import { readItems, aggregate } from '@directus/sdk';
import { requirePlatformAdmin } from '~~/server/utils/platform';

const PENDING_PAY = ['processing', 'requires_payment_method', 'canceled'];

export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event);
  const directus = getServerDirectus();

  const [orgs, agencyAgg, projectCsatAgg, ticketCsatAgg, memberAgg, projectAgg, ticketAgg, lastEventAgg, payments] = await Promise.all([
    directus.request(readItems('organizations', { fields: ['id', 'name', 'logo', 'archived_at'], sort: ['name'], limit: -1 })) as Promise<Array<{ id: string; name: string; logo: string | null; archived_at: string | null }>>,
    directus.request(aggregate('agency_ratings', { aggregate: { count: '*', avg: ['rating'] }, groupBy: ['organization'] })) as Promise<any[]>,
    directus.request(aggregate('projects', { aggregate: { count: '*', avg: ['csat_rating'] }, groupBy: ['organization'], query: { filter: { csat_rating: { _nnull: true } } } } as any)) as Promise<any[]>,
    directus.request(aggregate('tickets', { aggregate: { count: '*', avg: ['csat_rating'] }, groupBy: ['organization'], query: { filter: { csat_rating: { _nnull: true } } } } as any)) as Promise<any[]>,
    directus.request(aggregate('org_memberships', { aggregate: { count: '*' }, groupBy: ['organization'], query: { filter: { status: { _eq: 'active' }, role: { slug: { _neq: 'client' } } } } } as any)) as Promise<any[]>,
    directus.request(aggregate('projects', { aggregate: { count: '*' }, groupBy: ['organization'], query: { filter: { status: { _neq: 'Archived' } } } } as any)) as Promise<any[]>,
    directus.request(aggregate('tickets', { aggregate: { count: '*' }, groupBy: ['organization'], query: { filter: { status: { _neq: 'Completed' } } } } as any)) as Promise<any[]>,
    directus.request(aggregate('product_events', { aggregate: { max: ['date_created'] }, groupBy: ['organization'] } as any)) as Promise<any[]>,
    directus.request(readItems('payments_received', { fields: ['organization', 'amount', 'stripe_status'], limit: -1 })) as Promise<Array<{ organization: string | null; amount: string | null; stripe_status: string | null }>>,
  ]);

  const scalarBy = (rows: any[], read: (r: any) => number) => {
    const m = new Map<string, number>();
    for (const r of rows || []) {
      const org = r.organization ?? r.group?.organization;
      if (org) m.set(org, read(r));
    }
    return m;
  };
  const agency = scalarBy(agencyAgg, (r) => Math.round(Number(r.avg?.rating ?? 0) * 10) / 10);
  const agencyN = scalarBy(agencyAgg, (r) => Number(r.count ?? 0));
  const pCsat = scalarBy(projectCsatAgg, (r) => Number(r.avg?.csat_rating ?? 0));
  const pCsatN = scalarBy(projectCsatAgg, (r) => Number(r.count ?? 0));
  const tCsat = scalarBy(ticketCsatAgg, (r) => Number(r.avg?.csat_rating ?? 0));
  const tCsatN = scalarBy(ticketCsatAgg, (r) => Number(r.count ?? 0));
  const members = scalarBy(memberAgg, (r) => Number(r.count ?? 0));
  const activeProjects = scalarBy(projectAgg, (r) => Number(r.count ?? 0));
  const openTickets = scalarBy(ticketAgg, (r) => Number(r.count ?? 0));
  const lastActive = new Map<string, string>();
  for (const r of lastEventAgg || []) {
    const org = r.organization ?? r.group?.organization;
    if (org) lastActive.set(org, r.max?.date_created ?? null);
  }

  // Revenue collected — NET of refunds/disputes. Refunds + lost chargebacks on
  // invoice payments are modeled as NEGATIVE payments_received rows (see
  // apply-refund-adjustment.ts / apply-dispute-adjustment.ts), so summing every
  // non-pending row already nets them out. We also track the refunded magnitude
  // separately so the console can show gross vs refunded, and flag disputes.
  const revenue = new Map<string, number>(); // net collected
  const refunded = new Map<string, number>(); // magnitude of negative rows
  const disputedOrgs = new Set<string>();
  for (const p of payments || []) {
    if (!p.organization || PENDING_PAY.includes(p.stripe_status || '')) continue;
    const amt = Number(p.amount ?? 0);
    revenue.set(p.organization, (revenue.get(p.organization) ?? 0) + amt);
    if (amt < 0) refunded.set(p.organization, (refunded.get(p.organization) ?? 0) + Math.abs(amt));
    const ss = String(p.stripe_status || '');
    if (ss === 'disputed' || ss.startsWith('dispute')) disputedOrgs.add(p.organization);
  }

  return orgs.map((o) => {
    const csatCount = (pCsatN.get(o.id) ?? 0) + (tCsatN.get(o.id) ?? 0);
    const csatAvg = csatCount
      ? Math.round((((pCsat.get(o.id) ?? 0) * (pCsatN.get(o.id) ?? 0) + (tCsat.get(o.id) ?? 0) * (tCsatN.get(o.id) ?? 0)) / csatCount) * 10) / 10
      : 0;
    return {
      id: o.id,
      name: o.name,
      logo: o.logo,
      archived: !!o.archived_at,
      agency: { avg: agency.get(o.id) ?? 0, count: agencyN.get(o.id) ?? 0 },
      csat: { avg: csatAvg, count: csatCount },
      members: members.get(o.id) ?? 0,
      activeProjects: activeProjects.get(o.id) ?? 0,
      openTickets: openTickets.get(o.id) ?? 0,
      revenue: Math.round(revenue.get(o.id) ?? 0), // net of refunds/disputes
      refunded: Math.round(refunded.get(o.id) ?? 0),
      disputed: disputedOrgs.has(o.id),
      lastActive: lastActive.get(o.id) ?? null,
    };
  });
});
