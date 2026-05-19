// server/api/portal/summary.get.ts
/**
 * GET /api/portal/summary
 *
 * Cross-cutting roll-up for the portal Home and the app-hub pages.
 * Returns three sections:
 *
 *  - `attention`: prioritized list of items needing the client's
 *    action (proposals to review, contracts to sign, invoices due,
 *    open tickets). Drives the Home page's "Needs your attention"
 *    card.
 *
 *  - `kpis`: one headline number per app — outstanding $, active
 *    projects, pending proposals, etc. Drives the Home roll-up strip
 *    and each hub's KPI tiles.
 *
 *  - `activity`: most-recent items across collections, merged by
 *    `date_updated`. Drives the Home activity feed.
 *
 * All queries fan out in parallel through the admin token; scope is
 * enforced via `requirePortalContext` and per-collection client/org
 * filters that mirror /api/portal/items.
 *
 * Read-only — never mutates.
 */

import { readItems, aggregate } from '@directus/sdk';
import { requirePortalContext } from '~~/server/utils/portal-auth';

type AttentionSeverity = 'urgent' | 'normal' | 'info';
type AttentionType = 'proposal' | 'contract' | 'invoice' | 'ticket';

interface AttentionItem {
  id: string;
  type: AttentionType;
  label: string;
  detail: string;
  href: string;
  dueDate?: string | null;
  severity: AttentionSeverity;
}

interface ActivityItem {
  id: string;
  type: 'project' | 'ticket' | 'invoice' | 'proposal' | 'contract';
  title: string;
  detail: string;
  href: string;
  timestamp: string;
}

interface SummaryResponse {
  attention: AttentionItem[];
  kpis: {
    progress: { activeProjects: number; openTickets: number };
    billing: { outstandingTotal: number; pendingProposals: number; unsignedContracts: number };
    performance: { campaignsThisMonth: number };
    messages: { channelCount: number };
  };
  activity: ActivityItem[];
}

const ACTIVE_PROJECT_STATUSES = ['Pending', 'Scheduled', 'In Progress'];
const OPEN_TICKET_STATUSES = ['Pending', 'Scheduled', 'In Progress'];

export default defineEventHandler(async (event): Promise<SummaryResponse> => {
  const ctx = await requirePortalContext(event);
  const directus = getServerDirectus();

  const orgEq = { organization: { _eq: ctx.organizationId } };
  const clientIn = { client: { _in: ctx.scopedClientIds } };
  const orgAndClient = { _and: [orgEq, clientIn] };

  const nowIso = new Date().toISOString().slice(0, 10);

  // Run all fan-out reads in parallel — each lookup is independent.
  // Counts use aggregate(); attention/activity feeds use readItems with tight
  // limits. The projects/tickets aggregates are NOT also re-fetched as rows
  // — the active project count is the only thing the UI needs for that KPI.
  const [
    unpaidInvoices,
    pendingProposals,
    unsignedContracts,
    activeProjectAgg,
    openTicketRows,
    monthlyCampaignAgg,
    channelAgg,
    recentInvoices,
    recentTickets,
    recentProjects,
  ] = await Promise.all([
    directus
      .request(
        readItems('invoices', {
          filter: {
            _and: [
              { client: { _in: ctx.scopedClientIds } },
              { status: { _in: ['pending', 'processing'] } },
            ],
          },
          fields: ['id', 'invoice_code', 'due_date', 'total_amount', 'status', 'date_updated'],
          sort: ['due_date'],
          limit: 50,
        }),
      )
      .catch(() => [] as Array<Record<string, unknown>>),
    directus
      .request(
        readItems('proposals', {
          filter: {
            _and: [
              orgEq,
              { proposal_status: { _in: ['sent', 'viewed'] } },
            ],
          },
          fields: ['id', 'title', 'date_sent', 'valid_until', 'date_updated'],
          sort: ['-date_sent'],
          limit: 20,
        }),
      )
      .catch(() => [] as Array<Record<string, unknown>>),
    directus
      .request(
        readItems('contracts', {
          filter: {
            _and: [
              orgAndClient,
              { contract_status: { _eq: 'sent' } },
            ],
          },
          fields: ['id', 'title', 'date_sent', 'valid_until', 'date_updated'],
          sort: ['-date_sent'],
          limit: 20,
        }),
      )
      .catch(() => [] as Array<Record<string, unknown>>),
    directus
      .request(
        aggregate('projects', {
          aggregate: { count: '*' },
          query: { filter: { _and: [orgAndClient, { status: { _in: ACTIVE_PROJECT_STATUSES } }] } },
        }),
      )
      .catch(() => [{ count: 0 }]),
    // Open tickets — fetch the actual rows so we can surface the high-priority
    // ones in the attention list AND count them for the KPI. Cap matches the
    // attention-list slice; KPI says "X+ open" if we hit the cap.
    directus
      .request(
        readItems('tickets', {
          filter: {
            _and: [
              orgAndClient,
              { status: { _in: OPEN_TICKET_STATUSES } },
            ],
          },
          fields: ['id', 'title', 'priority', 'due_date', 'date_updated'],
          sort: ['-date_updated'],
          limit: 100,
        }),
      )
      .catch(() => [] as Array<Record<string, unknown>>),
    directus
      .request(
        aggregate('marketing_campaigns', {
          aggregate: { count: '*' },
          query: {
            filter: {
              _and: [
                orgEq,
                { date_created: { _gte: thirtyDaysAgoIso() } },
              ],
            },
          },
        }),
      )
      .catch(() => [{ count: 0 }]),
    directus
      .request(
        aggregate('channels', {
          aggregate: { count: '*' },
          query: { filter: orgAndClient },
        }),
      )
      .catch(() => [{ count: 0 }]),
    // Recent rows for the activity feed.
    directus
      .request(
        readItems('invoices', {
          filter: { client: { _in: ctx.scopedClientIds } },
          fields: ['id', 'invoice_code', 'status', 'total_amount', 'date_updated'],
          sort: ['-date_updated'],
          limit: 5,
        }),
      )
      .catch(() => [] as Array<Record<string, unknown>>),
    directus
      .request(
        readItems('tickets', {
          filter: orgAndClient,
          fields: ['id', 'title', 'status', 'priority', 'date_updated'],
          sort: ['-date_updated'],
          limit: 5,
        }),
      )
      .catch(() => [] as Array<Record<string, unknown>>),
    directus
      .request(
        readItems('projects', {
          filter: orgAndClient,
          fields: ['id', 'title', 'status', 'date_updated'],
          sort: ['-date_updated'],
          limit: 5,
        }),
      )
      .catch(() => [] as Array<Record<string, unknown>>),
  ]);

  // ── Build attention list ────────────────────────────────────────────
  const attention: AttentionItem[] = [];

  for (const p of unpaidInvoices as Array<Record<string, unknown>>) {
    const due = (p.due_date as string | null) ?? null;
    const overdue = due && due < nowIso;
    const total = Number(p.total_amount ?? 0);
    attention.push({
      id: String(p.id),
      type: 'invoice',
      label: `Invoice ${p.invoice_code ?? '#' + String(p.id).slice(0, 6)}`,
      detail: overdue
        ? `Past due — ${formatCurrency(total)}`
        : `Due ${due ? formatDate(due) : 'soon'} — ${formatCurrency(total)}`,
      href: `/portal/invoices/${p.id}`,
      dueDate: due,
      severity: overdue ? 'urgent' : 'normal',
    });
  }

  for (const p of pendingProposals as Array<Record<string, unknown>>) {
    attention.push({
      id: String(p.id),
      type: 'proposal',
      label: (p.title as string) ?? 'Untitled proposal',
      detail: 'Awaiting your review',
      href: `/portal/proposals/${p.id}`,
      dueDate: (p.valid_until as string | null) ?? null,
      severity: 'normal',
    });
  }

  for (const c of unsignedContracts as Array<Record<string, unknown>>) {
    attention.push({
      id: String(c.id),
      type: 'contract',
      label: (c.title as string) ?? 'Untitled contract',
      detail: 'Awaiting signature',
      href: `/portal/contracts/${c.id}`,
      dueDate: (c.valid_until as string | null) ?? null,
      severity: 'urgent',
    });
  }

  // Tickets aren't strictly "needing client action" but they often do
  // (questions, approvals). Surface the highest-priority open ones.
  const openTicketsArr = openTicketRows as Array<Record<string, unknown>>;
  for (const t of openTicketsArr.slice(0, 3)) {
    if ((t.priority as string | null) !== 'high') continue;
    attention.push({
      id: String(t.id),
      type: 'ticket',
      label: (t.title as string) ?? 'Open ticket',
      detail: 'High priority — open',
      href: `/portal/tickets/${t.id}`,
      severity: 'info',
    });
  }

  // ── KPI roll-up ────────────────────────────────────────────────────
  const toCount = (rows: unknown) => {
    const r = (rows as Array<{ count?: number | string | null }> | null) ?? [];
    return Number(r[0]?.count ?? 0);
  };

  const outstandingTotal = (unpaidInvoices as Array<Record<string, unknown>>).reduce(
    (sum, inv) => sum + Number(inv.total_amount ?? 0),
    0,
  );

  const kpis: SummaryResponse['kpis'] = {
    progress: {
      activeProjects: toCount(activeProjectAgg),
      openTickets: openTicketsArr.length,
    },
    billing: {
      outstandingTotal,
      pendingProposals: (pendingProposals as unknown[]).length,
      unsignedContracts: (unsignedContracts as unknown[]).length,
    },
    performance: {
      campaignsThisMonth: toCount(monthlyCampaignAgg),
    },
    messages: {
      channelCount: toCount(channelAgg),
    },
  };

  // ── Activity feed ──────────────────────────────────────────────────
  const activity: ActivityItem[] = [];

  for (const inv of recentInvoices as Array<Record<string, unknown>>) {
    activity.push({
      id: String(inv.id),
      type: 'invoice',
      title: `Invoice ${inv.invoice_code ?? '#' + String(inv.id).slice(0, 6)}`,
      detail: `${labelize(inv.status as string)} · ${formatCurrency(Number(inv.total_amount ?? 0))}`,
      href: `/portal/invoices/${inv.id}`,
      timestamp: (inv.date_updated as string) ?? '',
    });
  }

  for (const t of recentTickets as Array<Record<string, unknown>>) {
    activity.push({
      id: String(t.id),
      type: 'ticket',
      title: (t.title as string) ?? 'Ticket',
      detail: `${labelize(t.status as string)}${t.priority ? ` · ${labelize(t.priority as string)} priority` : ''}`,
      href: `/portal/tickets/${t.id}`,
      timestamp: (t.date_updated as string) ?? '',
    });
  }

  for (const p of recentProjects as Array<Record<string, unknown>>) {
    activity.push({
      id: String(p.id),
      type: 'project',
      title: (p.title as string) ?? 'Project',
      detail: labelize(p.status as string),
      href: `/portal/projects/${p.id}`,
      timestamp: (p.date_updated as string) ?? '',
    });
  }

  activity.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  return {
    attention,
    kpis,
    activity: activity.slice(0, 10),
  };
});

function thirtyDaysAgoIso(): string {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function labelize(s: string | null | undefined): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
