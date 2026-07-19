// server/utils/personal-agenda.ts
/**
 * The "My work" board packet — a personal Director's Office agenda scoped to ONE
 * user's own assignments (their tasks + tickets), instead of the whole org.
 *
 * This is what powers a private "Director's Room for my week": any user (admin
 * or not) can convene a review of just their own work without exposing org-wide
 * financials or other people's accounts. It returns the SAME agenda shape as
 * collectDirectorAgenda so the office renders it identically — the advisors are
 * simply "My Tasks" and "My Tickets".
 *
 * All reads are via the admin client and every query is wrapped: a bad filter or
 * missing collection yields an empty group, never a crash (the office then just
 * shows "all clear").
 */
import { readItems } from '@directus/sdk';

type Priority = 'urgent' | 'high' | 'medium' | 'low';

interface PersonalNotice {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  entityType?: string;
  entityId?: string;
}
export interface PersonalGroup {
  subject: string;
  label: string;
  topPriority: Priority;
  notices: PersonalNotice[];
  proposedCount: number;
}
export interface PersonalAgenda {
  mode: 'mine';
  groups: PersonalGroup[];
  totalNotices: number;
  totalProposed: number;
}

const PRIORITY_RANK: Record<Priority, number> = { urgent: 3, high: 2, medium: 1, low: 0 };
function topPriority(notices: PersonalNotice[]): Priority {
  return notices.reduce<Priority>((acc, n) => (PRIORITY_RANK[n.priority] > PRIORITY_RANK[acc] ? n.priority : acc), 'low');
}

const DONE_TASK_STATUSES = ['done', 'complete', 'completed', 'cancelled', 'canceled', 'archived'];
const CLOSED_TICKET_STATUSES = ['Resolved', 'Closed', 'Cancelled', 'Canceled'];

function daysUntil(dateStr: string | null | undefined, now: Date): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr).getTime();
  if (!isFinite(d)) return null;
  return Math.floor((d - now.getTime()) / 86400000);
}

async function personalTaskGroup(directus: any, organizationId: string, userId: string, now: Date): Promise<PersonalGroup | null> {
  try {
    const rows = await directus.request((readItems as any)('tasks', {
      filter: {
        _and: [
          { organization_id: { _eq: organizationId } },
          { assigned_to: { directus_users_id: { _eq: userId } } },
          { status: { _nin: DONE_TASK_STATUSES } },
        ],
      } as any,
      fields: ['id', 'title', 'status', 'priority', 'due_date'],
      sort: ['due_date'],
      limit: 40,
    } as any)) as any[];
    const notices: PersonalNotice[] = [];
    for (const t of rows || []) {
      const dd = daysUntil(t.due_date, now);
      const highPri = String(t.priority || '').toLowerCase() === 'high' || String(t.priority || '').toLowerCase() === 'urgent';
      let priority: Priority;
      let note: string;
      if (dd != null && dd < 0) { priority = 'urgent'; note = `Overdue by ${Math.abs(dd)}d — close it out or reschedule.`; }
      else if (dd != null && dd <= 3) { priority = 'high'; note = `Due ${dd === 0 ? 'today' : `in ${dd}d`}.`; }
      else if (highPri) { priority = 'medium'; note = `${t.priority} priority${dd != null ? ` · due in ${dd}d` : ' · no due date'}.`; }
      else if (dd == null) { priority = 'low'; note = 'No due date set — schedule it or drop it.'; }
      else { priority = 'low'; note = `Due in ${dd}d.`; }
      notices.push({ id: `mytask-${t.id}`, title: t.title || 'Untitled task', description: note, priority, entityType: 'task', entityId: String(t.id) });
      if (notices.length >= 12) break;
    }
    if (!notices.length) return null;
    // Urgent/overdue first.
    notices.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
    return { subject: 'tasks', label: 'My Tasks', topPriority: topPriority(notices), notices, proposedCount: 0 };
  } catch {
    return null;
  }
}

async function personalTicketGroup(directus: any, organizationId: string, userId: string, now: Date): Promise<PersonalGroup | null> {
  try {
    const rows = await directus.request((readItems as any)('tickets', {
      filter: {
        _and: [
          { organization: { _eq: organizationId } },
          { assigned_to: { directus_users_id: { _eq: userId } } },
          { status: { _nin: CLOSED_TICKET_STATUSES } },
        ],
      } as any,
      fields: ['id', 'title', 'subject', 'status', 'priority', 'due_date'],
      sort: ['due_date'],
      limit: 30,
    } as any)) as any[];
    const notices: PersonalNotice[] = [];
    for (const t of rows || []) {
      const dd = daysUntil(t.due_date, now);
      const highPri = String(t.priority || '').toLowerCase() === 'high' || String(t.priority || '').toLowerCase() === 'urgent';
      let priority: Priority;
      let note: string;
      if (dd != null && dd < 0) { priority = 'urgent'; note = `Overdue by ${Math.abs(dd)}d.`; }
      else if (dd != null && dd <= 3) { priority = 'high'; note = `Due ${dd === 0 ? 'today' : `in ${dd}d`}.`; }
      else if (highPri) { priority = 'medium'; note = `${t.priority} priority.`; }
      else { priority = 'low'; note = `Open · ${t.status || 'Pending'}.`; }
      notices.push({ id: `myticket-${t.id}`, title: t.title || t.subject || 'Support ticket', description: note, priority, entityType: 'ticket', entityId: String(t.id) });
      if (notices.length >= 10) break;
    }
    if (!notices.length) return null;
    notices.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
    return { subject: 'tickets', label: 'My Tickets', topPriority: topPriority(notices), notices, proposedCount: 0 };
  } catch {
    return null;
  }
}

/** Build the personal ("My work") agenda for one user in one org. */
export async function collectPersonalAgenda(
  directus: any,
  organizationId: string,
  userId: string,
  now: Date = new Date(),
): Promise<PersonalAgenda> {
  const [tasks, tickets] = await Promise.all([
    personalTaskGroup(directus, organizationId, userId, now),
    personalTicketGroup(directus, organizationId, userId, now),
  ]);
  const groups = [tasks, tickets].filter(Boolean) as PersonalGroup[];
  const totalNotices = groups.reduce((n, g) => n + g.notices.length, 0);
  return { mode: 'mine', groups, totalNotices, totalProposed: 0 };
}
