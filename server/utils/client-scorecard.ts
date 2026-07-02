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
      const rows = (await directus.request((aggregate as any)('lead_activities', {
        aggregate: { count: ['*'] },
        query: { filter: { lead: { _in: leads.map((l) => l.id) } } },
      }))) as any[];
      leadActivities = Number(rows?.[0]?.count ?? 0);
    } catch { /* best-effort */ }
  }
  const effortTotal = tasks.length + leadActivities;

  // ── Deterministic rating ──
  // Rewards realized revenue + active work; penalizes overdue AR, staleness, and
  // high effort with little return.
  let score = 0;
  score += Math.min(revenue / 5000, 3);              // revenue signal (0–3)
  if (activeProj.length > 0) score += 1;             // active engagement
  if (activeContractValue > 0) score += 0.5;
  if (overdueAR > 0) score -= 2;                      // not paying
  if (staleDays != null && staleDays > 60) score -= 1; // gone quiet
  if (effortTotal >= 5 && revenue === 0) score -= 2;  // chasing, no return
  else if (effortTotal >= 8 && revenue < effortTotal * 200) score -= 1; // over-servicing

  const rating: ClientRating = score >= 4 ? 'A' : score >= 2 ? 'B' : score >= 0 ? 'C' : score >= -2 ? 'D' : 'F';

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
