/**
 * Activity feed for /apps/clients/[id].
 *
 * Aggregates recent activity across the noun graph rooted at a client:
 *   - invoices (created; "paid" event keys off date_updated when status flipped)
 *   - tickets (opened)
 *   - projects (created)
 *   - project_events (created)
 *   - video_meetings (started, when an actual_start exists)
 *   - tasks (completed; via project.client = id)
 *
 * Composes at read time — no aggregation table. Each source is queried
 * with its own filter, mapped to a normalized ActivityRow, then merged
 * and sorted by date desc. Pagination uses a simple offset cursor.
 *
 * v1 scope. Out of scope (deferred to a follow-up if usage warrants):
 *   - marketing_touches per-contact send events
 *   - meeting_notes (deeper FK walk than Phase 7 budget)
 *   - appointments (no direct client FK; goes via lead → client)
 *   - messages (no per-message timestamps surfaced)
 */
import { readItems } from '@directus/sdk';

interface ActivityRow {
  id: string;
  kind:
    | 'invoice_created'
    | 'invoice_paid'
    | 'ticket_opened'
    | 'project_created'
    | 'project_event_created'
    | 'meeting_started'
    | 'task_completed';
  ts: string;
  title: string;
  subtitle?: string | null;
  href?: string | null;
  icon: string;
}

const PAGE_SIZE = 25;

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'id');
  if (!clientId) {
    throw createError({ statusCode: 400, message: 'Client id is required' });
  }

  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const directus = getTypedDirectus();

  // Resolve the client's organization and verify the caller is a member.
  const clientRow = await directus
    .request(readItems('clients', { filter: { id: { _eq: clientId } }, fields: ['id', 'organization'], limit: 1 }))
    .catch(() => []) as any[];
  const orgId = clientRow?.[0]?.organization;
  if (!orgId) throw createError({ statusCode: 404, message: 'Client not found' });
  await requireOrgMembership(event, String(orgId));

  const query = getQuery(event);
  const offset = Math.max(0, Number(query.offset ?? 0));
  const filter = String(query.filter ?? 'all'); // all | meetings | money | projects | tickets

  const want = (chips: string[]) => filter === 'all' || chips.includes(filter);

  // Pull each source in parallel. Each query uses its own filter shape.
  // We over-fetch a bit per source so the merged list still has enough
  // rows after pagination.
  const SLICE = 60;

  const [invoices, tickets, projects, projectEvents, meetings, tasks] = await Promise.all([
    want(['money']) ? directus.request(readItems('invoices', {
      filter: { client: { _eq: clientId } },
      fields: ['id', 'invoice_code', 'status', 'total_amount', 'date_created', 'date_updated', 'invoice_date'],
      sort: ['-date_created'],
      limit: SLICE,
    })).catch((err) => { console.error('[activity] invoices query failed', err?.message); return []; }) as Promise<any[]> : Promise.resolve([]),

    want(['tickets']) ? directus.request(readItems('tickets', {
      filter: { client: { _eq: clientId } },
      fields: ['id', 'title', 'status', 'priority', 'date_created'],
      sort: ['-date_created'],
      limit: SLICE,
    })).catch(() => []) as Promise<any[]> : Promise.resolve([]),

    want(['projects']) ? directus.request(readItems('projects', {
      filter: { client: { _eq: clientId } },
      fields: ['id', 'title', 'status', 'date_created'],
      sort: ['-date_created'],
      limit: SLICE,
    })).catch(() => []) as Promise<any[]> : Promise.resolve([]),

    want(['projects']) ? directus.request(readItems('project_events', {
      filter: { project: { client: { _eq: clientId } } },
      fields: ['id', 'title', 'status', 'date_created', 'event_date', 'project.id', 'project.title'],
      sort: ['-date_created'],
      limit: SLICE,
    })).catch(() => []) as Promise<any[]> : Promise.resolve([]),

    want(['meetings']) ? directus.request(readItems('video_meetings', {
      filter: {
        actual_start: { _nnull: true },
        project: { client: { _eq: clientId } },
      },
      fields: ['id', 'title', 'status', 'actual_start', 'recording_url', 'project.id', 'project.title'],
      sort: ['-actual_start'],
      limit: SLICE,
    })).catch(() => []) as Promise<any[]> : Promise.resolve([]),

    want(['projects']) ? directus.request(readItems('tasks', {
      filter: {
        status: { _eq: 'completed' },
        project_id: { client: { _eq: clientId } },
      },
      fields: ['id', 'title', 'date_completed', 'project_id.id', 'project_id.title'],
      sort: ['-date_completed'],
      limit: SLICE,
    })).catch(() => []) as Promise<any[]> : Promise.resolve([]),
  ]);

  const rows: ActivityRow[] = [];

  for (const inv of invoices as any[]) {
    if (inv.date_created) {
      rows.push({
        id: `invoice-created-${inv.id}`,
        kind: 'invoice_created',
        ts: inv.date_created,
        title: `Invoice ${inv.invoice_code || ''} created`,
        subtitle: inv.total_amount != null ? `$${Number(inv.total_amount).toLocaleString()}` : null,
        href: `/invoices/${inv.id}`,
        icon: 'lucide:file-text',
      });
    }
    // No dedicated paid_date column — surface the paid event via date_updated
    // when status is 'paid'. Skipped if status flipped via a different update.
    if (inv.status === 'paid' && inv.date_updated) {
      rows.push({
        id: `invoice-paid-${inv.id}`,
        kind: 'invoice_paid',
        ts: inv.date_updated,
        title: `Invoice ${inv.invoice_code || ''} paid`,
        subtitle: inv.total_amount != null ? `$${Number(inv.total_amount).toLocaleString()}` : null,
        href: `/invoices/${inv.id}`,
        icon: 'lucide:circle-check',
      });
    }
  }

  for (const t of tickets as any[]) {
    if (!t.date_created) continue;
    rows.push({
      id: `ticket-${t.id}`,
      kind: 'ticket_opened',
      ts: t.date_created,
      title: t.title || 'Ticket',
      subtitle: t.priority ? `${t.priority} priority` : null,
      href: `/tickets/${t.id}`,
      icon: 'lucide:ticket',
    });
  }

  for (const p of projects as any[]) {
    if (!p.date_created) continue;
    rows.push({
      id: `project-${p.id}`,
      kind: 'project_created',
      ts: p.date_created,
      title: p.title || 'Project',
      subtitle: p.status || null,
      href: `/projects/${p.id}`,
      icon: 'lucide:folder-kanban',
    });
  }

  for (const pe of projectEvents as any[]) {
    if (!pe.date_created) continue;
    rows.push({
      id: `event-${pe.id}`,
      kind: 'project_event_created',
      ts: pe.date_created,
      title: pe.title || 'Project event',
      subtitle: pe.project?.title ? `in ${pe.project.title}` : null,
      href: pe.project?.id ? `/projects/${pe.project.id}` : null,
      icon: 'lucide:circle-dot',
    });
  }

  for (const m of meetings as any[]) {
    if (!m.actual_start) continue;
    rows.push({
      id: `meeting-${m.id}`,
      kind: 'meeting_started',
      ts: m.actual_start,
      title: m.title || 'Meeting',
      subtitle: m.project?.title ? `in ${m.project.title}` : null,
      href: `/meetings/${m.id}`,
      icon: 'lucide:video',
    });
  }

  for (const t of tasks as any[]) {
    if (!t.date_completed) continue;
    rows.push({
      id: `task-${t.id}`,
      kind: 'task_completed',
      ts: t.date_completed,
      title: t.title || 'Task',
      subtitle: t.project_id?.title ? `in ${t.project_id.title}` : null,
      href: t.project_id?.id ? `/projects/${t.project_id.id}` : null,
      icon: 'lucide:check-square',
    });
  }

  rows.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));

  const slice = rows.slice(offset, offset + PAGE_SIZE);
  return {
    rows: slice,
    nextOffset: offset + slice.length < rows.length ? offset + slice.length : null,
    total: rows.length,
  };
});
