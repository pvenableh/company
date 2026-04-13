// server/utils/ai-notices.ts
/**
 * Shared AI notice generators for proactive business insights.
 * Pure data analysis — no LLM calls.
 *
 * Used by:
 *   - server/api/ai/notices.get.ts (entity-scoped, user request)
 *   - server/api/ai/notices/check.post.ts (org-wide cron, notification bridge)
 */

import { readItem, readItems } from '@directus/sdk';

export interface AINotice {
  id: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  type: 'warning' | 'insight' | 'suggestion';
  icon: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionRoute?: string;
  /** Entity this notice is about (used for notification routing) */
  entityType?: string;
  entityId?: string;
}

// ─── Client Notices ──────────────────────────────────────────────────────────

export async function generateClientNotices(
  directus: any, clientId: string, organizationId: string, now: Date,
): Promise<AINotice[]> {
  const notices: AINotice[] = [];

  const [client, invoices, projects] = await Promise.all([
    directus.request(
      readItem('clients', clientId, {
        fields: ['id', 'name', 'status', 'date_updated', 'brand_direction', 'goals', 'target_audience', 'location'],
      }),
    ).catch(() => null) as Promise<any>,

    directus.request(
      readItems('invoices', {
        filter: {
          _and: [
            { client: { _eq: clientId } },
            { status: { _in: ['pending', 'processing'] } },
          ],
        },
        fields: ['id', 'status', 'total_amount', 'due_date'],
        limit: 50,
      }),
    ).catch(() => []) as Promise<any[]>,

    directus.request(
      readItems('projects', {
        filter: {
          _and: [
            { client: { _eq: clientId } },
            { status: { _in: ['Pending', 'Scheduled', 'In Progress'] } },
          ],
        },
        fields: ['id'],
        limit: 20,
      }),
    ).catch(() => []) as Promise<any[]>,
  ]);

  if (!client) return notices;

  // Stale relationship
  if (client.date_updated) {
    const daysInactive = Math.floor((now.getTime() - new Date(client.date_updated).getTime()) / (1000 * 60 * 60 * 24));
    if (daysInactive >= 30) {
      notices.push({
        id: `client-stale-${clientId}`,
        priority: 'high',
        type: 'warning',
        icon: 'i-heroicons-clock',
        title: `No activity in ${daysInactive} days`,
        description: `${client.name} hasn't had any updates in over a month. Consider reaching out to maintain the relationship.`,
        actionLabel: 'Draft follow-up',
        actionRoute: '/command-center/ai',
        entityType: 'client',
        entityId: clientId,
      });
    } else if (daysInactive >= 14) {
      notices.push({
        id: `client-quiet-${clientId}`,
        priority: 'medium',
        type: 'insight',
        icon: 'i-heroicons-clock',
        title: `${daysInactive} days since last activity`,
        description: `It's been a while since any updates for ${client.name}. A quick check-in could strengthen the relationship.`,
        entityType: 'client',
        entityId: clientId,
      });
    }
  }

  // Overdue invoices
  const overdueInvoices = (invoices || []).filter((i: any) => i.due_date && new Date(i.due_date) < now);
  if (overdueInvoices.length > 0) {
    const total = overdueInvoices.reduce((sum: number, i: any) => sum + (i.total_amount || 0), 0);
    notices.push({
      id: `client-overdue-invoices-${clientId}`,
      priority: overdueInvoices.length >= 3 ? 'urgent' : 'high',
      type: 'warning',
      icon: 'i-heroicons-banknotes',
      title: `${overdueInvoices.length} overdue invoice${overdueInvoices.length > 1 ? 's' : ''} — $${total.toLocaleString()}`,
      description: `There ${overdueInvoices.length === 1 ? 'is' : 'are'} ${overdueInvoices.length} unpaid invoice${overdueInvoices.length > 1 ? 's' : ''} past the due date for this client.`,
      actionLabel: 'View invoices',
      actionRoute: '/invoices',
      entityType: 'client',
      entityId: clientId,
    });
  }

  // Brand profile incomplete
  const hasBrand = client.brand_direction || client.goals || client.target_audience;
  if (!hasBrand) {
    notices.push({
      id: `client-brand-${clientId}`,
      priority: 'low',
      type: 'suggestion',
      icon: 'i-heroicons-paint-brush',
      title: 'Brand profile incomplete',
      description: 'Add brand direction, goals, and target audience to get more personalized AI assistance for this client.',
      entityType: 'client',
      entityId: clientId,
    });
  }

  // No active projects
  if ((projects || []).length === 0 && client.status === 'active') {
    notices.push({
      id: `client-no-projects-${clientId}`,
      priority: 'low',
      type: 'insight',
      icon: 'i-heroicons-folder-open',
      title: 'No active projects',
      description: `${client.name} has no projects in progress. This could be an opportunity to propose new work.`,
      entityType: 'client',
      entityId: clientId,
    });
  }

  return notices;
}

// ─── Project Notices ─────────────────────────────────────────────────────────

export async function generateProjectNotices(
  directus: any, projectId: string, organizationId: string, now: Date,
): Promise<AINotice[]> {
  const notices: AINotice[] = [];

  const [project, tasks, team] = await Promise.all([
    directus.request(
      readItem('projects', projectId, {
        fields: ['id', 'title', 'status', 'due_date', 'start_date', 'client.name'],
      }),
    ).catch(() => null) as Promise<any>,

    directus.request(
      readItems('project_tasks', {
        filter: {
          _and: [
            { project: { _eq: projectId } },
            { completed: { _eq: false } },
          ],
        },
        fields: ['id', 'title', 'due_date', 'completed'],
        limit: 50,
      }),
    ).catch(() => []) as Promise<any[]>,

    directus.request(
      readItems('projects_directus_users', {
        filter: { projects_id: { _eq: projectId } },
        fields: ['id'],
        limit: 20,
      }),
    ).catch(() => []) as Promise<any[]>,
  ]);

  if (!project) return notices;

  // Project overdue
  if (project.due_date) {
    const dueDate = new Date(project.due_date);
    const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) {
      notices.push({
        id: `project-overdue-${projectId}`,
        priority: 'urgent',
        type: 'warning',
        icon: 'i-heroicons-exclamation-triangle',
        title: `Project is ${Math.abs(daysUntil)} day${Math.abs(daysUntil) > 1 ? 's' : ''} overdue`,
        description: `"${project.title}" was due ${project.due_date}. Review status and update the timeline or resolve blockers.`,
        entityType: 'project',
        entityId: projectId,
      });
    } else if (daysUntil <= 7) {
      notices.push({
        id: `project-deadline-${projectId}`,
        priority: daysUntil <= 3 ? 'high' : 'medium',
        type: 'warning',
        icon: 'i-heroicons-calendar',
        title: `Deadline in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`,
        description: `"${project.title}" is due ${project.due_date}. Make sure all tasks and deliverables are on track.`,
        entityType: 'project',
        entityId: projectId,
      });
    }
  }

  // Overdue tasks
  const overdueTasks = (tasks || []).filter((t: any) => t.due_date && new Date(t.due_date) < now);
  if (overdueTasks.length > 0) {
    notices.push({
      id: `project-overdue-tasks-${projectId}`,
      priority: overdueTasks.length >= 5 ? 'high' : 'medium',
      type: 'warning',
      icon: 'i-heroicons-clipboard-document-check',
      title: `${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}`,
      description: `There ${overdueTasks.length === 1 ? 'is' : 'are'} ${overdueTasks.length} task${overdueTasks.length > 1 ? 's' : ''} past their due date. Review and reprioritize to keep the project on track.`,
      entityType: 'project',
      entityId: projectId,
    });
  }

  // No team assigned
  if ((team || []).length === 0) {
    notices.push({
      id: `project-no-team-${projectId}`,
      priority: 'medium',
      type: 'suggestion',
      icon: 'i-heroicons-user-group',
      title: 'No team members assigned',
      description: 'This project has no assigned team. Add members to clarify ownership and responsibilities.',
      entityType: 'project',
      entityId: projectId,
    });
  }

  // Many pending tasks, no progress
  const pendingTasks = tasks || [];
  if (pendingTasks.length > 10) {
    notices.push({
      id: `project-task-backlog-${projectId}`,
      priority: 'low',
      type: 'insight',
      icon: 'i-heroicons-queue-list',
      title: `${pendingTasks.length} tasks pending`,
      description: 'Consider breaking this project into milestones or reprioritizing the task list to maintain momentum.',
      entityType: 'project',
      entityId: projectId,
    });
  }

  return notices;
}

// ─── Invoice Notices ─────────────────────────────────────────────────────────

export async function generateInvoiceNotices(
  directus: any, invoiceId: string, organizationId: string, now: Date,
): Promise<AINotice[]> {
  const notices: AINotice[] = [];

  const invoice = await directus.request(
    readItem('invoices', invoiceId, {
      fields: ['id', 'status', 'total_amount', 'due_date', 'invoice_date', 'client', 'invoice_code'],
    }),
  ).catch(() => null) as any;

  if (!invoice) return notices;

  const clientId = typeof invoice.client === 'object' ? invoice.client?.id : invoice.client;

  // Invoice overdue
  if (invoice.due_date && invoice.status !== 'paid') {
    const dueDate = new Date(invoice.due_date);
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysOverdue > 0) {
      notices.push({
        id: `invoice-overdue-${invoiceId}`,
        priority: daysOverdue >= 30 ? 'urgent' : daysOverdue >= 14 ? 'high' : 'medium',
        type: 'warning',
        icon: 'i-heroicons-exclamation-triangle',
        title: `Invoice is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} past due`,
        description: `${invoice.invoice_code || 'This invoice'} for $${(invoice.total_amount || 0).toLocaleString()} was due ${invoice.due_date}. Send a payment reminder or follow up with the client.`,
        actionLabel: 'Draft reminder',
        actionRoute: '/command-center/ai',
        entityType: 'invoice',
        entityId: invoiceId,
      });
    } else if (daysOverdue >= -7) {
      const daysUntil = Math.abs(daysOverdue);
      notices.push({
        id: `invoice-due-soon-${invoiceId}`,
        priority: daysUntil <= 2 ? 'medium' : 'low',
        type: 'insight',
        icon: 'i-heroicons-calendar',
        title: `Due in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`,
        description: `Payment of $${(invoice.total_amount || 0).toLocaleString()} is due ${invoice.due_date}.`,
        entityType: 'invoice',
        entityId: invoiceId,
      });
    }
  }

  // Client has other overdue invoices
  if (clientId) {
    try {
      const otherOverdue = await directus.request(
        readItems('invoices', {
          filter: {
            _and: [
              { client: { _eq: clientId } },
              { id: { _neq: invoiceId } },
              { status: { _in: ['pending', 'processing'] } },
              { due_date: { _lt: now.toISOString() } },
            ],
          },
          fields: ['id', 'total_amount'],
          limit: 20,
        }),
      ) as any[];

      if (otherOverdue && otherOverdue.length > 0) {
        const otherTotal = otherOverdue.reduce((sum: number, i: any) => sum + (i.total_amount || 0), 0);
        notices.push({
          id: `invoice-client-overdue-${invoiceId}`,
          priority: 'high',
          type: 'warning',
          icon: 'i-heroicons-banknotes',
          title: `Client has ${otherOverdue.length} other overdue invoice${otherOverdue.length > 1 ? 's' : ''}`,
          description: `This client owes an additional $${otherTotal.toLocaleString()} across ${otherOverdue.length} other overdue invoice${otherOverdue.length > 1 ? 's' : ''}. Consider a consolidated follow-up.`,
          actionLabel: 'View all invoices',
          actionRoute: '/invoices',
          entityType: 'invoice',
          entityId: invoiceId,
        });
      }
    } catch { /* non-critical */ }
  }

  // High-value invoice
  if ((invoice.total_amount || 0) >= 5000 && invoice.status !== 'paid') {
    notices.push({
      id: `invoice-high-value-${invoiceId}`,
      priority: 'low',
      type: 'insight',
      icon: 'i-heroicons-currency-dollar',
      title: 'High-value invoice',
      description: `This $${(invoice.total_amount || 0).toLocaleString()} invoice is significant. A personal follow-up can help ensure timely payment.`,
      entityType: 'invoice',
      entityId: invoiceId,
    });
  }

  return notices;
}

/** Priority sort order for notices */
export const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
