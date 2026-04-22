// server/utils/ai-notices.ts
/**
 * Shared AI notice generators for proactive business insights.
 * Pure data analysis — no LLM calls.
 *
 * Used by:
 *   - server/api/ai/notices.get.ts (entity-scoped, user request)
 *   - server/api/ai/notices/check.ts (org-wide cron, notification bridge)
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
        fields: ['id', 'name', 'status', 'account_state', 'date_updated', 'brand_direction', 'goals', 'target_audience', 'location'],
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
  if ((projects || []).length === 0 && client.account_state === 'active') {
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

// ─── Lead Notices ────────────────────────────────────────────────────────────

export async function generateLeadNotices(
  directus: any, leadId: string, organizationId: string, now: Date,
): Promise<AINotice[]> {
  const notices: AINotice[] = [];
  const leadKey = Number.isFinite(Number(leadId)) ? Number(leadId) : leadId;

  const lead = await directus.request(
    readItem('leads', leadKey as any, {
      fields: [
        'id', 'stage', 'priority', 'lead_score', 'estimated_value', 'next_follow_up',
        'date_updated', 'assigned_to',
        'related_contact.first_name', 'related_contact.last_name', 'related_contact.company',
        'related_contact.email_bounced', 'related_contact.email_subscribed',
      ],
    }),
  ).catch(() => null) as any;

  if (!lead) return notices;

  const stage = lead.stage || 'new';
  if (stage === 'won' || stage === 'lost') return notices;

  const contactName = lead.related_contact
    ? `${lead.related_contact.first_name || ''} ${lead.related_contact.last_name || ''}`.trim()
    : '';
  const label = contactName || lead.related_contact?.company || `Lead ${lead.id}`;

  // Follow-up overdue
  if (lead.next_follow_up) {
    const daysOverdue = Math.floor((now.getTime() - new Date(lead.next_follow_up).getTime()) / (1000 * 60 * 60 * 24));
    if (daysOverdue > 0) {
      notices.push({
        id: `lead-followup-overdue-${lead.id}`,
        priority: daysOverdue >= 7 ? 'urgent' : daysOverdue >= 3 ? 'high' : 'medium',
        type: 'warning',
        icon: 'i-heroicons-clock',
        title: `Follow-up ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue`,
        description: `${label} was due for a follow-up on ${lead.next_follow_up.split('T')[0]}. Reach out to keep the deal warm.`,
        actionLabel: 'Draft follow-up',
        actionRoute: '/command-center/ai',
        entityType: 'lead',
        entityId: String(lead.id),
      });
    }
  }

  // High-value lead unclaimed
  if (!lead.assigned_to && (lead.lead_score || 0) >= 70) {
    notices.push({
      id: `lead-unassigned-hot-${lead.id}`,
      priority: 'high',
      type: 'warning',
      icon: 'i-heroicons-user-plus',
      title: 'High-score lead unassigned',
      description: `${label} has a lead score of ${lead.lead_score} but no owner. Assign it before momentum stalls.`,
      entityType: 'lead',
      entityId: String(lead.id),
    });
  }

  // Stale (no updates)
  if (lead.date_updated) {
    const daysStale = Math.floor((now.getTime() - new Date(lead.date_updated).getTime()) / (1000 * 60 * 60 * 24));
    if (daysStale >= 30) {
      notices.push({
        id: `lead-stale-${lead.id}`,
        priority: 'medium',
        type: 'insight',
        icon: 'i-heroicons-clock',
        title: `No activity in ${daysStale} days`,
        description: `${label} hasn't had any updates in over a month. Log an activity or move the stage.`,
        entityType: 'lead',
        entityId: String(lead.id),
      });
    }
  }

  // Primary contact email bounced
  if (lead.related_contact?.email_bounced) {
    notices.push({
      id: `lead-contact-bounced-${lead.id}`,
      priority: 'medium',
      type: 'warning',
      icon: 'i-heroicons-envelope',
      title: 'Primary contact email bounced',
      description: `Emails to ${label}'s contact are bouncing. Update the email or switch channels.`,
      entityType: 'lead',
      entityId: String(lead.id),
    });
  }

  // No follow-up scheduled on active lead
  if (!lead.next_follow_up && ['contacted', 'qualified', 'proposal_sent', 'negotiating'].includes(stage)) {
    notices.push({
      id: `lead-no-followup-${lead.id}`,
      priority: 'low',
      type: 'suggestion',
      icon: 'i-heroicons-calendar-days',
      title: 'No follow-up scheduled',
      description: `${label} is in "${stage}" with no next-step date. Add a follow-up to keep the pipeline moving.`,
      entityType: 'lead',
      entityId: String(lead.id),
    });
  }

  return notices;
}

// ─── Proposal Notices ────────────────────────────────────────────────────────

export async function generateProposalNotices(
  directus: any, proposalId: string, organizationId: string, now: Date,
): Promise<AINotice[]> {
  const notices: AINotice[] = [];

  const proposal = await directus.request(
    readItem('proposals', proposalId, {
      fields: ['id', 'title', 'proposal_status', 'total_value', 'valid_until', 'date_sent', 'date_created'],
    }),
  ).catch(() => null) as any;

  if (!proposal) return notices;

  const status = proposal.proposal_status || 'draft';
  if (status === 'accepted' || status === 'rejected') return notices;

  const label = proposal.title || 'Proposal';
  const value = proposal.total_value ? ` ($${Number(proposal.total_value).toLocaleString()})` : '';

  // Expired / expiring
  if (proposal.valid_until && status !== 'draft') {
    const daysUntil = Math.ceil((new Date(proposal.valid_until).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil < 0) {
      const daysExpired = Math.abs(daysUntil);
      notices.push({
        id: `proposal-expired-${proposal.id}`,
        priority: daysExpired <= 14 ? 'urgent' : 'high',
        type: 'warning',
        icon: 'i-heroicons-exclamation-triangle',
        title: `Proposal expired ${daysExpired} day${daysExpired > 1 ? 's' : ''} ago`,
        description: `"${label}"${value} passed its valid-until date. Renew or close it out.`,
        entityType: 'proposal',
        entityId: String(proposal.id),
      });
    } else if (daysUntil <= 7) {
      notices.push({
        id: `proposal-expiring-${proposal.id}`,
        priority: daysUntil <= 3 ? 'high' : 'medium',
        type: 'warning',
        icon: 'i-heroicons-calendar',
        title: `Expires in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`,
        description: `"${label}"${value} is close to its expiration date. Follow up or extend before it lapses.`,
        entityType: 'proposal',
        entityId: String(proposal.id),
      });
    }
  }

  // Sent with no response
  if ((status === 'sent' || status === 'viewed') && proposal.date_sent) {
    const daysSinceSent = Math.floor((now.getTime() - new Date(proposal.date_sent).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceSent >= 14) {
      notices.push({
        id: `proposal-no-response-${proposal.id}`,
        priority: daysSinceSent >= 30 ? 'high' : 'medium',
        type: 'warning',
        icon: 'i-heroicons-chat-bubble-left-ellipsis',
        title: `No response in ${daysSinceSent} days`,
        description: `"${label}" was ${status} ${daysSinceSent} days ago with no update. A check-in could unblock a decision.`,
        actionLabel: 'Draft follow-up',
        actionRoute: '/command-center/ai',
        entityType: 'proposal',
        entityId: String(proposal.id),
      });
    }
  }

  // Draft idle
  if (status === 'draft' && proposal.date_created) {
    const daysIdle = Math.floor((now.getTime() - new Date(proposal.date_created).getTime()) / (1000 * 60 * 60 * 24));
    if (daysIdle >= 14) {
      notices.push({
        id: `proposal-draft-idle-${proposal.id}`,
        priority: 'low',
        type: 'suggestion',
        icon: 'i-heroicons-document-text',
        title: `Draft idle for ${daysIdle} days`,
        description: `"${label}" has been a draft for ${daysIdle} days. Finish and send, or archive if stale.`,
        entityType: 'proposal',
        entityId: String(proposal.id),
      });
    }
  }

  return notices;
}

// ─── Contact Notices ─────────────────────────────────────────────────────────

export async function generateContactNotices(
  directus: any, contactId: string, organizationId: string, now: Date,
): Promise<AINotice[]> {
  const notices: AINotice[] = [];

  const contact = await directus.request(
    readItem('contacts', contactId, {
      fields: [
        'id', 'first_name', 'last_name', 'email', 'phone',
        'email_bounced', 'email_bounce_type', 'email_subscribed', 'email_unsubscribed_at',
        'total_emails_sent', 'total_opens', 'last_opened_at',
      ],
    }),
  ).catch(() => null) as any;

  if (!contact) return notices;

  const name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email || 'This contact';

  // Email bounced
  if (contact.email_bounced) {
    notices.push({
      id: `contact-email-bounced-${contact.id}`,
      priority: 'medium',
      type: 'warning',
      icon: 'i-heroicons-envelope',
      title: 'Email is bouncing',
      description: `${name}'s email${contact.email_bounce_type ? ` (${contact.email_bounce_type})` : ''} is bouncing. Update the address to keep outreach deliverable.`,
      entityType: 'contact',
      entityId: contact.id,
    });
  }

  // Unsubscribed
  if (contact.email_subscribed === false && !contact.email_bounced) {
    notices.push({
      id: `contact-unsubscribed-${contact.id}`,
      priority: 'low',
      type: 'insight',
      icon: 'i-heroicons-no-symbol',
      title: 'Unsubscribed from email',
      description: `${name} has unsubscribed from marketing email. Use direct outreach channels instead.`,
      entityType: 'contact',
      entityId: contact.id,
    });
  }

  // Disengaged
  const sent = contact.total_emails_sent || 0;
  const opens = contact.total_opens || 0;
  if (sent >= 5 && contact.email_subscribed !== false && !contact.email_bounced) {
    const daysSinceOpen = contact.last_opened_at
      ? Math.floor((now.getTime() - new Date(contact.last_opened_at).getTime()) / (1000 * 60 * 60 * 24))
      : Infinity;
    if (opens === 0 || daysSinceOpen >= 90) {
      notices.push({
        id: `contact-disengaged-${contact.id}`,
        priority: 'low',
        type: 'insight',
        icon: 'i-heroicons-eye-slash',
        title: opens === 0 ? `No opens across ${sent} emails` : `No opens in ${daysSinceOpen}+ days`,
        description: `${name} hasn't engaged with recent email. Consider re-engagement content or pausing sends.`,
        entityType: 'contact',
        entityId: contact.id,
      });
    }
  }

  // Missing contact detail
  if (!contact.email && !contact.phone) {
    notices.push({
      id: `contact-no-channels-${contact.id}`,
      priority: 'low',
      type: 'suggestion',
      icon: 'i-heroicons-identification',
      title: 'No email or phone on file',
      description: `${name} has no contact method recorded. Add at least one so outreach is possible.`,
      entityType: 'contact',
      entityId: contact.id,
    });
  }

  return notices;
}

// ─── Ticket Notices ──────────────────────────────────────────────────────────

export async function generateTicketNotices(
  directus: any, ticketId: string, organizationId: string, now: Date,
): Promise<AINotice[]> {
  const notices: AINotice[] = [];

  const ticket = await directus.request(
    readItem('tickets', ticketId, {
      fields: [
        'id', 'title', 'status', 'priority', 'due_date', 'date_created',
        'assigned_to.id',
      ],
    }),
  ).catch(() => null) as any;

  if (!ticket) return notices;

  const status = ticket.status || 'Pending';
  if (status === 'Completed' || status === 'Archived') return notices;

  const label = ticket.title || 'Ticket';
  const priority = ticket.priority || 'medium';
  const assigneeCount = Array.isArray(ticket.assigned_to) ? ticket.assigned_to.length : 0;

  // Overdue
  if (ticket.due_date) {
    const daysOverdue = Math.floor((now.getTime() - new Date(ticket.due_date).getTime()) / (1000 * 60 * 60 * 24));
    if (daysOverdue > 0) {
      const isHigh = priority === 'high';
      notices.push({
        id: `ticket-overdue-${ticket.id}`,
        priority: isHigh ? 'urgent' : daysOverdue >= 7 ? 'high' : 'medium',
        type: 'warning',
        icon: 'i-heroicons-exclamation-triangle',
        title: `${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue`,
        description: `"${label}" was due ${ticket.due_date}. ${isHigh ? 'High-priority ticket — ' : ''}update status or reschedule.`,
        entityType: 'ticket',
        entityId: ticket.id,
      });
    } else if (daysOverdue >= -3 && priority === 'high') {
      const daysUntil = Math.abs(daysOverdue);
      notices.push({
        id: `ticket-due-soon-${ticket.id}`,
        priority: 'high',
        type: 'warning',
        icon: 'i-heroicons-calendar',
        title: `High-priority ticket due in ${daysUntil}d`,
        description: `"${label}" is due ${ticket.due_date}. Confirm ownership and timeline.`,
        entityType: 'ticket',
        entityId: ticket.id,
      });
    }
  }

  // High priority, no assignee
  if (priority === 'high' && assigneeCount === 0) {
    notices.push({
      id: `ticket-high-unassigned-${ticket.id}`,
      priority: 'high',
      type: 'warning',
      icon: 'i-heroicons-user-plus',
      title: 'High-priority ticket unassigned',
      description: `"${label}" is marked high priority but has no assignee. Assign it so someone owns resolution.`,
      entityType: 'ticket',
      entityId: ticket.id,
    });
  }

  // Aging open ticket
  if (ticket.date_created) {
    const ageDays = Math.floor((now.getTime() - new Date(ticket.date_created).getTime()) / (1000 * 60 * 60 * 24));
    if (ageDays >= 60) {
      notices.push({
        id: `ticket-aging-${ticket.id}`,
        priority: 'medium',
        type: 'insight',
        icon: 'i-heroicons-clock',
        title: `Open for ${ageDays} days`,
        description: `"${label}" has been open for over two months. Consider breaking it down, closing as stale, or re-scoping.`,
        entityType: 'ticket',
        entityId: ticket.id,
      });
    }
  }

  return notices;
}

// ─── Team Notices ────────────────────────────────────────────────────────────

export async function generateTeamNotices(
  directus: any, teamId: string, organizationId: string, now: Date,
): Promise<AINotice[]> {
  const notices: AINotice[] = [];

  const [team, goals] = await Promise.all([
    directus.request(
      readItem('teams', teamId, {
        fields: [
          'id', 'name', 'active',
          'users.id',
          'assigned_clients.id',
        ],
      }),
    ).catch(() => null) as Promise<any>,

    directus.request(
      readItems('team_goals', {
        filter: { team: { _eq: teamId } },
        fields: ['id', 'title', 'target_date', 'progress'],
        limit: 30,
      }),
    ).catch(() => []) as Promise<any[]>,
  ]);

  if (!team) return notices;
  if (team.active === false) return notices;

  const label = team.name || 'This team';
  const memberCount = Array.isArray(team.users) ? team.users.length : 0;
  const clientCount = Array.isArray(team.assigned_clients) ? team.assigned_clients.length : 0;

  // No members
  if (memberCount === 0) {
    notices.push({
      id: `team-no-members-${team.id}`,
      priority: 'high',
      type: 'warning',
      icon: 'i-heroicons-user-group',
      title: 'No members assigned',
      description: `${label} has no team members. Add members so work can be routed here.`,
      entityType: 'team',
      entityId: team.id,
    });
  }

  // No clients assigned
  if (clientCount === 0 && memberCount > 0) {
    notices.push({
      id: `team-no-clients-${team.id}`,
      priority: 'low',
      type: 'suggestion',
      icon: 'i-heroicons-building-office-2',
      title: 'No clients assigned',
      description: `${label} has members but no assigned clients. Assign accounts to clarify ownership.`,
      entityType: 'team',
      entityId: team.id,
    });
  }

  // Overdue goals
  const overdueGoals = (goals || []).filter((g: any) =>
    g.target_date && new Date(g.target_date) < now && (g.progress ?? 0) < 100,
  );
  if (overdueGoals.length > 0) {
    const sample = overdueGoals.slice(0, 2).map((g: any) => g.title).filter(Boolean).join(', ');
    notices.push({
      id: `team-goals-overdue-${team.id}`,
      priority: overdueGoals.length >= 3 ? 'high' : 'medium',
      type: 'warning',
      icon: 'i-heroicons-flag',
      title: `${overdueGoals.length} goal${overdueGoals.length > 1 ? 's' : ''} past target`,
      description: `${sample}${overdueGoals.length > 2 ? ` and ${overdueGoals.length - 2} more` : ''} ${overdueGoals.length === 1 ? 'is' : 'are'} past the target date and not complete.`,
      entityType: 'team',
      entityId: team.id,
    });
  }

  return notices;
}

/** Priority sort order for notices */
export const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
