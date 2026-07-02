// server/utils/revenue-intel.ts
/**
 * Revenue opportunity + effort-vs-return intel for the Director's money mode.
 *
 * - buildOpportunityIntel: where the best money is — top revenue clients, best
 *   service/product lines (from paid-invoice line items), and the hottest
 *   pipeline (open leads weighted by stage). Answers "where should I focus to
 *   grow revenue?".
 * - buildColdEffortIntel: the "wasted effort" reality check — open leads with
 *   lots of logged follow-ups/activities but no close (high effort, no return).
 *
 * Admin-client reads; caller has membership-verified. Never throws — a failed
 * sub-query degrades to empty so the meeting still opens.
 */
import { readItems, aggregate } from '@directus/sdk';

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

// Probability-ish weights so pipeline value reflects how close a lead is.
const STAGE_WEIGHT: Record<string, number> = {
  new: 0.1, contacted: 0.2, qualified: 0.4, proposal_sent: 0.6, negotiating: 0.8,
};

function leadLabel(l: any): string {
  const c = l?.related_contact;
  const name = c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : '';
  return name || c?.company || `Lead ${l?.id ?? ''}`.trim();
}

export interface OpportunityIntel {
  topClients: { name: string; revenue: number }[];
  topServiceLines: { name: string; revenue: number }[];
  pipeline: { weightedValue: number; openCount: number; top: { label: string; value: number; stage: string }[] };
  text: string;
}

export async function buildOpportunityIntel(
  directus: any, organizationId: string, now: Date, windowMonths = 6,
): Promise<OpportunityIntel> {
  const windowStartIso = new Date(now.getFullYear(), now.getMonth() - windowMonths, 1)
    .toISOString().split('T')[0]!;
  const ri = readItems as any;
  const orgInvoiceScope = { _or: [{ bill_to: { _eq: organizationId } }, { client: { organization: { _eq: organizationId } } }] };

  const [paid, lineItems, leads] = await Promise.all([
    directus.request(ri('invoices', {
      filter: { _and: [{ status: { _eq: 'paid' } }, { invoice_date: { _gte: windowStartIso } }, orgInvoiceScope] },
      fields: ['total_amount', 'client.name'], limit: 1000,
    })).catch(() => []) as Promise<any[]>,
    directus.request(ri('line_items', {
      filter: { invoice_id: { _and: [{ status: { _eq: 'paid' } }, { invoice_date: { _gte: windowStartIso } }, orgInvoiceScope] } },
      fields: ['amount', 'rate', 'quantity', 'product.name'], limit: 3000,
    })).catch(() => []) as Promise<any[]>,
    directus.request(ri('leads', {
      filter: { _and: [{ organization: { _eq: organizationId } }, { stage: { _nin: ['won', 'lost'] } }] },
      fields: ['id', 'estimated_value', 'stage', 'related_contact.first_name', 'related_contact.last_name', 'related_contact.company'],
      limit: 400,
    })).catch(() => []) as Promise<any[]>,
  ]);

  const clientRev = new Map<string, number>();
  for (const inv of paid) {
    const n = inv.client?.name || 'Unknown client';
    clientRev.set(n, (clientRev.get(n) || 0) + (Number(inv.total_amount) || 0));
  }
  const topClients = [...clientRev.entries()].map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  const prodRev = new Map<string, number>();
  for (const li of lineItems) {
    const n = li.product?.name || 'Unlabeled';
    const amt = Number(li.amount) || (Number(li.rate) || 0) * (Number(li.quantity) || 1);
    prodRev.set(n, (prodRev.get(n) || 0) + amt);
  }
  const topServiceLines = [...prodRev.entries()].map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  let weightedValue = 0;
  const openLeads = leads.map((l) => {
    const value = Number(l.estimated_value) || 0;
    const w = STAGE_WEIGHT[l.stage || 'new'] ?? 0.1;
    weightedValue += value * w;
    return { label: leadLabel(l), value, stage: l.stage || 'new', weighted: value * w };
  });
  const top = openLeads.sort((a, b) => b.weighted - a.weighted).slice(0, 5)
    .map(({ label, value, stage }) => ({ label, value, stage }));
  const pipeline = { weightedValue, openCount: leads.length, top };

  const lines: string[] = ['[Source: Revenue Opportunity]'];
  if (topClients.length) {
    lines.push(`Top revenue clients (paid, last ${windowMonths}mo): ${topClients.map((c) => `${c.name} ${money(c.revenue)}`).join(', ')}.`);
  }
  if (topServiceLines.length) {
    lines.push(`Best-earning service/product lines: ${topServiceLines.map((s) => `${s.name} ${money(s.revenue)}`).join(', ')}.`);
  }
  lines.push(`Open pipeline: ${pipeline.openCount} lead(s), stage-weighted value ~${money(pipeline.weightedValue)}.`);
  if (top.length) {
    lines.push(`Hottest opportunities: ${top.map((t) => `${t.label} ${money(t.value)} (${t.stage})`).join(', ')}.`);
  }

  return { topClients, topServiceLines, pipeline, text: lines.join('\n') };
}

export interface ColdEffortIntel {
  coldLeads: { label: string; activityCount: number; stage: string; value: number; staleDays: number | null }[];
  text: string;
}

/** Open leads with many logged follow-ups but no close = effort with little return. */
export async function buildColdEffortIntel(
  directus: any, organizationId: string, now: Date, minActivities = 3,
): Promise<ColdEffortIntel> {
  const ri = readItems as any;
  const leads = (await directus.request(ri('leads', {
    filter: { _and: [{ organization: { _eq: organizationId } }, { stage: { _nin: ['won', 'lost'] } }] },
    fields: ['id', 'stage', 'estimated_value', 'date_updated', 'related_contact.first_name', 'related_contact.last_name', 'related_contact.company'],
    limit: 400,
  })).catch(() => [])) as any[];
  if (!leads.length) return { coldLeads: [], text: '' };

  // Activity counts per lead (the follow-up/contact log).
  const counts = new Map<string, number>();
  try {
    const rows = (await directus.request((aggregate as any)('lead_activities', {
      aggregate: { count: ['*'] },
      groupBy: ['lead'],
      query: { filter: { lead: { _in: leads.map((l) => l.id) } } },
    }))) as any[];
    for (const r of rows) counts.set(String(r.lead), Number(r.count ?? 0));
  } catch { /* no activity aggregation available → no cold flags */ }

  const coldLeads = leads
    .map((l) => ({
      label: leadLabel(l),
      activityCount: counts.get(String(l.id)) || 0,
      stage: l.stage || 'new',
      value: Number(l.estimated_value) || 0,
      staleDays: l.date_updated ? Math.floor((now.getTime() - new Date(l.date_updated).getTime()) / 86400000) : null,
    }))
    .filter((c) => c.activityCount >= minActivities)
    .sort((a, b) => b.activityCount - a.activityCount)
    .slice(0, 6);

  if (!coldLeads.length) return { coldLeads: [], text: '' };

  const lines: string[] = ['[Source: Effort vs Return]'];
  lines.push(`Open leads with heavy follow-up but no close (>=${minActivities} logged activities, still not won):`);
  for (const c of coldLeads) {
    lines.push(`  - ${c.label}: ${c.activityCount} activities, stage ${c.stage}, est. ${money(c.value)}${c.staleDays != null ? `, last touch ${c.staleDays}d ago` : ''}.`);
  }
  return { coldLeads, text: lines.join('\n') };
}
