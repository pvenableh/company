// server/utils/client-scorecard.ts
/**
 * Per-client rating scorecard for a focused Director's Office meeting on a client.
 *
 * Combines VALUE (paid revenue + active project value), EFFORT (tasks + logged
 * lead activities against the client), and HEALTH (recency, overdue AR, active
 * work) into a deterministic A–F rating. The rating is computed here (consistent,
 * auditable); the LLM narrates the verdict. Surfaces the effort-vs-return signal
 * at the account level ("you're over-servicing a low-return client").
 *
 * Admin-client reads; caller has membership-verified. Returns null if the client
 * isn't in the org (cross-org guard).
 */
import { readItem, readItems, aggregate } from '@directus/sdk';

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const ACTIVE_PROJECT = ['Pending', 'Scheduled', 'In Progress'];

function resolveId(v: any): string | null {
  if (v == null) return null;
  return typeof v === 'object' ? (v.id != null ? String(v.id) : null) : String(v);
}

export type ClientRating = 'A' | 'B' | 'C' | 'D' | 'F';

export interface ClientRatingInputs {
  revenue: number;
  activeProjects: number;
  activeContractValue: number;
  overdueAR: number;
  staleDays: number | null;
  effortTotal: number;
}

/**
 * The single source of truth for the A–F rating, so the deep-dive scorecard and
 * the batch card scores agree. Rewards realized revenue + active work; penalizes
 * overdue AR, staleness, and high effort with little return.
 */
export function computeClientRating(x: ClientRatingInputs): { rating: ClientRating; score: number } {
  let score = 0;
  score += Math.min(x.revenue / 5000, 3);              // revenue signal (0–3)
  if (x.activeProjects > 0) score += 1;                // active engagement
  if (x.activeContractValue > 0) score += 0.5;
  if (x.overdueAR > 0) score -= 2;                     // not paying
  if (x.staleDays != null && x.staleDays > 60) score -= 1; // gone quiet
  if (x.effortTotal >= 5 && x.revenue === 0) score -= 2;   // chasing, no return
  else if (x.effortTotal >= 8 && x.revenue < x.effortTotal * 200) score -= 1; // over-servicing
  const rating: ClientRating = score >= 4 ? 'A' : score >= 2 ? 'B' : score >= 0 ? 'C' : score >= -2 ? 'D' : 'F';
  return { rating, score };
}

export interface ClientScorecard {
  clientName: string;
  rating: ClientRating;
  value: { revenue: number; activeProjects: number; activeContractValue: number };
  effort: { tasks: number; leadActivities: number; total: number };
  health: { staleDays: number | null; overdueAR: number; outstandingAR: number };
  text: string;
}

export async function buildClientScorecard(
  directus: any, clientId: string, organizationId: string, now: Date,
): Promise<ClientScorecard | null> {
  const ri = readItems as any;
  const rItem = readItem as any;
  const [client, invoices, projects, leads, tasks] = await Promise.all([
    directus.request(rItem('clients', clientId, {
      fields: ['id', 'name', 'date_updated', 'account_state', 'organization'],
    })).catch(() => null) as Promise<any>,
    directus.request(ri('invoices', { filter: { client: { _eq: clientId } }, fields: ['total_amount', 'status', 'due_date'], limit: 500 })).catch(() => []) as Promise<any[]>,
    directus.request(ri('projects', { filter: { client: { _eq: clientId } }, fields: ['status', 'contract_value'], limit: 200 })).catch(() => []) as Promise<any[]>,
    directus.request(ri('leads', { filter: { resulting_client: { _eq: clientId } }, fields: ['id'], limit: 200 })).catch(() => []) as Promise<any[]>,
    directus.request(ri('tasks', { filter: { client_id: { _eq: clientId } }, fields: ['id'], limit: 500 })).catch(() => []) as Promise<any[]>,
  ]);

  if (!client) return null;
  if (resolveId(client.organization) !== organizationId) return null; // cross-org guard

  const nowIso = now.toISOString().split('T')[0]!;
  const revenue = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + (Number(i.total_amount) || 0), 0);
  const activeProj = projects.filter((p) => ACTIVE_PROJECT.includes(p.status));
  const activeContractValue = activeProj.reduce((s, p) => s + (Number(p.contract_value) || 0), 0);
  const outstanding = invoices.filter((i) => ['pending', 'processing'].includes(i.status));
  const outstandingAR = outstanding.reduce((s, i) => s + (Number(i.total_amount) || 0), 0);
  const overdueAR = outstanding.filter((i) => i.due_date && i.due_date < nowIso).reduce((s, i) => s + (Number(i.total_amount) || 0), 0);
  const staleDays = client.date_updated ? Math.floor((now.getTime() - new Date(client.date_updated).getTime()) / 86400000) : null;

  // Effort: tasks on the client + logged activities on the client's leads.
  let leadActivities = 0;
  if (leads.length) {
    try {
      const rows = (await directus.request((aggregate as any)('touchpoints', {
        aggregate: { count: ['*'] },
        query: { filter: { lead: { _in: leads.map((l) => l.id) } } },
      }))) as any[];
      leadActivities = Number(rows?.[0]?.count ?? 0);
    } catch { /* best-effort */ }
  }
  const effortTotal = tasks.length + leadActivities;

  const { rating, score } = computeClientRating({
    revenue, activeProjects: activeProj.length, activeContractValue, overdueAR, staleDays, effortTotal,
  });

  const lines: string[] = [`[Source: Client Scorecard] ${client.name}`];
  lines.push(`Computed rating: ${rating} (score ${score.toFixed(1)}).`);
  lines.push(`Value: ${money(revenue)} realized revenue; ${activeProj.length} active project(s) worth ${money(activeContractValue)} in contracts.`);
  lines.push(`Effort: ${tasks.length} task(s) + ${leadActivities} logged lead activit${leadActivities === 1 ? 'y' : 'ies'} = ${effortTotal} touch-points.`);
  lines.push(`Health: ${outstandingAR > 0 ? `${money(outstandingAR)} outstanding AR (${money(overdueAR)} overdue)` : 'no outstanding AR'}; ${staleDays != null ? `last activity ${staleDays}d ago` : 'no recorded activity'}.`);
  if (effortTotal >= 5 && revenue === 0) lines.push('FLAG: significant effort logged against this account with $0 realized revenue — an effort-vs-return problem.');

  return {
    clientName: client.name,
    rating,
    value: { revenue, activeProjects: activeProj.length, activeContractValue },
    effort: { tasks: tasks.length, leadActivities, total: effortTotal },
    health: { staleDays, overdueAR, outstandingAR },
    text: lines.join('\n'),
  };
}

// ── Batch: score every client in one org (for cards / lists) ─────────────────
// Constant number of BULK queries regardless of client count — never per-client
// fan-out. Used by GET /api/crm/client-scores.

export interface ClientScore {
  clientId: string;
  name: string;
  rating: ClientRating;
  revenue: number;
  activeProjects: number;
  effort: number;
  overdueAR: number;
  outstandingAR: number;
  staleDays: number | null;
}

export async function buildOrgClientScores(
  directus: any, organizationId: string, now: Date,
): Promise<Record<string, ClientScore>> {
  const ri = readItems as any;
  const [clients, invoices, projects, tasks, leads] = await Promise.all([
    directus.request(ri('clients', {
      filter: { organization: { _eq: organizationId } },
      fields: ['id', 'name', 'date_updated'], limit: 1000,
    })).catch(() => []) as Promise<any[]>,
    directus.request(ri('invoices', {
      filter: { client: { organization: { _eq: organizationId } } },
      fields: ['total_amount', 'status', 'due_date', 'client'], limit: 5000,
    })).catch(() => []) as Promise<any[]>,
    directus.request(ri('projects', {
      filter: { _and: [{ organization: { _eq: organizationId } }, { status: { _in: ACTIVE_PROJECT } }] },
      fields: ['client', 'contract_value', 'status'], limit: 2000,
    })).catch(() => []) as Promise<any[]>,
    directus.request(ri('tasks', {
      filter: { organization_id: { _eq: organizationId } },
      fields: ['client_id'], limit: 5000,
    })).catch(() => []) as Promise<any[]>,
    directus.request(ri('leads', {
      filter: { _and: [{ organization: { _eq: organizationId } }, { resulting_client: { _nnull: true } }] },
      fields: ['id', 'resulting_client'], limit: 2000,
    })).catch(() => []) as Promise<any[]>,
  ]);

  const nowIso = now.toISOString().split('T')[0]!;

  // Per-client accumulators.
  type Acc = { revenue: number; overdueAR: number; outstandingAR: number; activeProjects: number; activeContractValue: number; tasks: number; leadActivities: number };
  const acc = new Map<string, Acc>();
  const ensure = (id: string): Acc => {
    let a = acc.get(id);
    if (!a) { a = { revenue: 0, overdueAR: 0, outstandingAR: 0, activeProjects: 0, activeContractValue: 0, tasks: 0, leadActivities: 0 }; acc.set(id, a); }
    return a;
  };

  for (const inv of invoices) {
    const cid = resolveId(inv.client); if (!cid) continue;
    const a = ensure(cid); const amt = Number(inv.total_amount) || 0;
    if (inv.status === 'paid') a.revenue += amt;
    else if (['pending', 'processing'].includes(inv.status)) {
      a.outstandingAR += amt;
      if (inv.due_date && inv.due_date < nowIso) a.overdueAR += amt;
    }
  }
  for (const p of projects) {
    const cid = resolveId(p.client); if (!cid) continue;
    const a = ensure(cid); a.activeProjects += 1; a.activeContractValue += Number(p.contract_value) || 0;
  }
  for (const t of tasks) {
    const cid = resolveId(t.client_id); if (!cid) continue;
    ensure(cid).tasks += 1;
  }

  // Lead activities → per client (via lead.resulting_client).
  const leadToClient = new Map<string, string>();
  for (const l of leads) {
    const cid = resolveId(l.resulting_client); if (cid) leadToClient.set(String(l.id), cid);
  }
  if (leadToClient.size) {
    try {
      const rows = (await directus.request((aggregate as any)('touchpoints', {
        aggregate: { count: ['*'] },
        groupBy: ['lead'],
        query: { filter: { lead: { _in: [...leadToClient.keys()] } } },
      }))) as any[];
      for (const r of rows) {
        const cid = leadToClient.get(String(r.lead));
        if (cid) ensure(cid).leadActivities += Number(r.count ?? 0);
      }
    } catch { /* best-effort */ }
  }

  const out: Record<string, ClientScore> = {};
  for (const c of clients) {
    const id = String(c.id);
    const a = acc.get(id) || ensure(id);
    const staleDays = c.date_updated ? Math.floor((now.getTime() - new Date(c.date_updated).getTime()) / 86400000) : null;
    const effortTotal = a.tasks + a.leadActivities;
    const { rating } = computeClientRating({
      revenue: a.revenue, activeProjects: a.activeProjects, activeContractValue: a.activeContractValue,
      overdueAR: a.overdueAR, staleDays, effortTotal,
    });
    out[id] = {
      clientId: id, name: c.name, rating,
      revenue: a.revenue, activeProjects: a.activeProjects, effort: effortTotal,
      overdueAR: a.overdueAR, outstandingAR: a.outstandingAR, staleDays,
    };
  }
  return out;
}
