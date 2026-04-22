/**
 * Entity Context — Builds focused context for a specific entity (client, project, invoice).
 *
 * Used by chat.post.ts when the user is viewing an entity detail page.
 * Queries Directus with admin token, returns formatted text truncated to ~800 tokens.
 */

import { readItem, readItems } from '@directus/sdk';

const ENTITY_TOKEN_BUDGET = 800;

function truncate(text: string, maxTokens: number = ENTITY_TOKEN_BUDGET): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + '\n[...truncated]';
}

export async function getEntityContext(
  entityType: string,
  entityId: string,
  organizationId: string,
): Promise<string> {
  try {
    const directus = getTypedDirectus();
    const now = new Date();

    if (entityType === 'client') {
      return await buildClientContext(directus, entityId, now);
    } else if (entityType === 'project') {
      return await buildProjectContext(directus, entityId, now);
    } else if (entityType === 'invoice') {
      return await buildInvoiceContext(directus, entityId, now);
    } else if (entityType === 'lead') {
      return await buildLeadContext(directus, entityId, now);
    } else if (entityType === 'contact') {
      return await buildContactContext(directus, entityId, now);
    } else if (entityType === 'proposal') {
      return await buildProposalContext(directus, entityId, now);
    } else if (entityType === 'ticket') {
      return await buildTicketContext(directus, entityId, now);
    } else if (entityType === 'team') {
      return await buildTeamContext(directus, entityId, now);
    } else if (entityType === 'channel') {
      return await buildChannelContext(directus, entityId, now);
    } else if (entityType === 'project_event') {
      return await buildProjectEventContext(directus, entityId, now);
    } else if (entityType === 'email') {
      return await buildEmailTemplateContext(directus, entityId, now);
    } else if (entityType === 'list') {
      return await buildListContext(directus, entityId, now);
    } else if (entityType === 'social_post') {
      return await buildSocialPostContext(directus, entityId, now);
    }
    return '';
  } catch (err: any) {
    console.error(`[entity-context] Failed to build ${entityType} context:`, err.message);
    return '';
  }
}

// ─── Client Context ─────────────────────────────────────────────────────────

async function buildClientContext(directus: any, clientId: string, now: Date): Promise<string> {
  const [client, invoices, projects, contacts, connections] = await Promise.all([
    directus.request(
      readItem('clients', clientId, {
        fields: ['id', 'name', 'status', 'account_state', 'industry', 'date_created', 'date_updated',
          'brand_direction', 'goals', 'target_audience', 'location', 'website', 'notes',
          'parent_client.id', 'parent_client.name'],
      }),
    ).catch(() => null) as Promise<any>,

    directus.request(
      readItems('invoices', {
        filter: { client: { _eq: clientId } },
        fields: ['id', 'status', 'total_amount', 'due_date', 'invoice_code'],
        sort: ['-due_date'],
        limit: 20,
      }),
    ).catch(() => []) as Promise<any[]>,

    directus.request(
      readItems('projects', {
        filter: { client: { _eq: clientId } },
        fields: ['id', 'title', 'status', 'due_date', 'contract_value'],
        sort: ['-date_created'],
        limit: 15,
      }),
    ).catch(() => []) as Promise<any[]>,

    directus.request(
      readItems('contacts', {
        filter: { client: { _eq: clientId } },
        fields: ['id', 'first_name', 'last_name', 'email', 'job_title', 'category'],
        limit: 10,
      }),
    ).catch(() => []) as Promise<any[]>,

    directus.request(
      readItems('contact_connections', {
        filter: { client: { _eq: clientId } },
        fields: ['id', 'role', 'introduced_by', 'notes',
          'contact.id', 'contact.first_name', 'contact.last_name', 'contact.email', 'contact.category', 'contact.company'],
        limit: 20,
      }),
    ).catch(() => []) as Promise<any[]>,
  ]);

  if (!client) return '';

  const lines: string[] = [];
  lines.push(`CURRENT FOCUS: Client "${client.name}"`);

  // [Source: Client Profile]
  lines.push('[Source: Client Profile]');
  lines.push(`Account state: ${client.account_state || 'unknown'}`);
  lines.push(`Lifecycle: ${client.status || 'published'}`);
  if (client.industry) lines.push(`Industry: ${client.industry}`);
  if (client.location) lines.push(`Location: ${client.location}`);
  if (client.website) lines.push(`Website: ${client.website}`);

  if (client.date_updated) {
    const daysAgo = Math.floor((now.getTime() - new Date(client.date_updated).getTime()) / (1000 * 60 * 60 * 24));
    lines.push(`Last activity: ${daysAgo} days ago`);
  }

  // Brand [Source: Client Profile]
  if (client.brand_direction || client.goals || client.target_audience) {
    lines.push('');
    lines.push('BRAND:');
    if (client.brand_direction) lines.push(`  Direction: ${client.brand_direction}`);
    if (client.goals) lines.push(`  Goals: ${client.goals}`);
    if (client.target_audience) lines.push(`  Audience: ${client.target_audience}`);
  }

  // Parent client (if this is a sub-brand)
  if (client.parent_client?.name) {
    lines.push('');
    lines.push(`[Source: Client Hierarchy]`);
    lines.push(`Sub-brand of: ${client.parent_client.name} (id: ${client.parent_client.id})`);
  }

  // Contacts [Source: Contacts]
  if (contacts.length > 0) {
    lines.push('');
    lines.push(`[Source: Contacts]`);
    lines.push(`CONTACTS (${contacts.length}):`);
    contacts.slice(0, 5).forEach((c: any) => {
      const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
      const cat = c.category ? ` [${c.category}]` : '';
      lines.push(`  - ${name}${cat}${c.job_title ? ` — ${c.job_title}` : ''}${c.email ? ` (${c.email})` : ''}`);
    });
  }

  // Partner/connector links (non-employment relationships)
  if (connections.length > 0) {
    lines.push('');
    lines.push(`[Source: Partner Connections]`);
    lines.push(`PARTNERS/CONNECTORS (${connections.length}):`);
    connections.slice(0, 10).forEach((c: any) => {
      const name = `${c.contact?.first_name || ''} ${c.contact?.last_name || ''}`.trim() || c.contact?.email || 'Unknown';
      const company = c.contact?.company ? ` (${c.contact.company})` : '';
      const dir = c.introduced_by === 'partner' ? ' · they introduced us'
        : c.introduced_by === 'us' ? ' · we introduced them' : '';
      lines.push(`  - ${name}${company} [${c.role || 'other'}]${dir}`);
    });
  }

  // Projects [Source: Projects]
  if (projects.length > 0) {
    const active = projects.filter((p: any) => ['Pending', 'Scheduled', 'In Progress'].includes(p.status));
    lines.push('');
    lines.push(`[Source: Projects]`);
    lines.push(`PROJECTS (${projects.length} total, ${active.length} active):`);
    projects.slice(0, 8).forEach((p: any) => {
      const isOverdue = p.due_date && new Date(p.due_date) < now && ['Pending', 'Scheduled', 'In Progress'].includes(p.status);
      lines.push(`  - ${p.title} — ${p.status}${p.due_date ? `, due ${p.due_date}` : ''}${p.contract_value ? ` [$${p.contract_value.toLocaleString()}]` : ''}${isOverdue ? ' OVERDUE' : ''}`);
    });
  }

  // Invoices [Source: Invoices]
  if (invoices.length > 0) {
    const pending = invoices.filter((i: any) => ['pending', 'processing'].includes(i.status));
    const overdue = pending.filter((i: any) => i.due_date && new Date(i.due_date) < now);
    const totalOutstanding = pending.reduce((s: number, i: any) => s + (i.total_amount || 0), 0);
    const totalOverdue = overdue.reduce((s: number, i: any) => s + (i.total_amount || 0), 0);

    lines.push('');
    lines.push(`[Source: Invoices]`);
    lines.push(`INVOICES (${invoices.length} total, ${pending.length} outstanding — $${totalOutstanding.toLocaleString()}):`);
    if (overdue.length > 0) {
      lines.push(`  ${overdue.length} OVERDUE totaling $${totalOverdue.toLocaleString()}`);
    }
    pending.slice(0, 5).forEach((i: any) => {
      const isOverdue = i.due_date && new Date(i.due_date) < now;
      lines.push(`  - ${i.invoice_code || 'Invoice'} — $${(i.total_amount || 0).toLocaleString()}, ${i.status}${i.due_date ? `, due ${i.due_date}` : ''}${isOverdue ? ' OVERDUE' : ''}`);
    });
  }

  if (client.notes) {
    lines.push('');
    lines.push(`[Source: Client Profile]`);
    lines.push(`NOTES: ${client.notes}`);
  }

  lines.push('');
  lines.push('Focus your reasoning on this client. Reference their data directly. When citing data, include the [Source: X] tag so the user knows where it came from.');

  return truncate(lines.join('\n'));
}

// ─── Project Context ────────────────────────────────────────────────────────

async function buildProjectContext(directus: any, projectId: string, now: Date): Promise<string> {
  const [project, tasks, team, tickets] = await Promise.all([
    directus.request(
      readItem('projects', projectId, {
        fields: ['id', 'title', 'status', 'due_date', 'start_date', 'description',
          'contract_value', 'client.name', 'client.id'],
      }),
    ).catch(() => null) as Promise<any>,

    directus.request(
      readItems('project_tasks', {
        filter: { project: { _eq: projectId } },
        fields: ['id', 'title', 'status', 'completed', 'due_date', 'priority', 'assignee_id'],
        sort: ['-due_date'],
        limit: 30,
      }),
    ).catch(() => []) as Promise<any[]>,

    directus.request(
      readItems('projects_directus_users', {
        filter: { projects_id: { _eq: projectId } },
        fields: ['directus_users_id.first_name', 'directus_users_id.last_name'],
        limit: 20,
      }),
    ).catch(() => []) as Promise<any[]>,

    directus.request(
      readItems('tickets', {
        filter: { project: { _eq: projectId } },
        fields: ['id', 'title', 'status', 'priority'],
        sort: ['-date_created'],
        limit: 10,
      }),
    ).catch(() => []) as Promise<any[]>,
  ]);

  if (!project) return '';

  const lines: string[] = [];
  const clientName = (project.client as any)?.name;

  lines.push(`CURRENT FOCUS: Project "${project.title}"`);

  // [Source: Project Profile]
  lines.push('[Source: Project Profile]');
  lines.push(`Status: ${project.status || 'unknown'}`);
  if (clientName) lines.push(`Client: ${clientName}`);
  if (project.start_date) lines.push(`Start: ${project.start_date}`);
  if (project.due_date) {
    const daysUntil = Math.ceil((new Date(project.due_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    lines.push(`Deadline: ${project.due_date}${daysUntil < 0 ? ` (${Math.abs(daysUntil)}d OVERDUE)` : daysUntil <= 7 ? ` (${daysUntil}d remaining)` : ''}`);
  }
  if (project.contract_value) lines.push(`Value: $${project.contract_value.toLocaleString()}`);
  if (project.description) lines.push(`Description: ${project.description.substring(0, 200)}`);

  // Tasks [Source: Tasks]
  if (tasks.length > 0) {
    const completed = tasks.filter((t: any) => t.completed);
    const pending = tasks.filter((t: any) => !t.completed);
    const overdue = pending.filter((t: any) => t.due_date && new Date(t.due_date) < now);

    lines.push('');
    lines.push('[Source: Tasks]');
    lines.push(`TASKS (${tasks.length} total, ${completed.length} done, ${pending.length} pending${overdue.length ? `, ${overdue.length} overdue` : ''}):`);

    if (overdue.length > 0) {
      lines.push('  Overdue:');
      overdue.slice(0, 5).forEach((t: any) => {
        lines.push(`    - ${t.title} (was due ${t.due_date})`);
      });
    }
    pending.filter((t: any) => !overdue.includes(t)).slice(0, 5).forEach((t: any) => {
      lines.push(`  - ${t.title}${t.due_date ? ` (due ${t.due_date})` : ''}${t.priority ? ` [${t.priority}]` : ''}`);
    });
  }

  // Team [Source: Team]
  if (team.length > 0) {
    const names = team.map((m: any) => {
      const u = m.directus_users_id;
      return u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : '';
    }).filter(Boolean);
    if (names.length > 0) {
      lines.push('');
      lines.push('[Source: Team]');
      lines.push(`TEAM (${names.length}): ${names.join(', ')}`);
    }
  }

  // Tickets [Source: Tickets]
  if (tickets.length > 0) {
    const open = tickets.filter((t: any) => t.status !== 'closed' && t.status !== 'resolved');
    lines.push('');
    lines.push('[Source: Tickets]');
    lines.push(`TICKETS (${tickets.length} total, ${open.length} open):`);
    open.slice(0, 5).forEach((t: any) => {
      lines.push(`  - ${t.title} — ${t.status}${t.priority ? ` [${t.priority}]` : ''}`);
    });
  }

  lines.push('');
  lines.push('Focus your reasoning on this project. Reference its data directly. When citing data, include the [Source: X] tag so the user knows where it came from.');

  return truncate(lines.join('\n'));
}

// ─── Invoice Context ────────────────────────────────────────────────────────

async function buildInvoiceContext(directus: any, invoiceId: string, now: Date): Promise<string> {
  const [invoice, lineItems, payments] = await Promise.all([
    directus.request(
      readItem('invoices', invoiceId, {
        fields: ['id', 'invoice_code', 'status', 'total_amount', 'subtotal', 'tax_amount',
          'due_date', 'invoice_date', 'notes', 'client.name', 'client.id',
          'projects.projects_id.id', 'projects.projects_id.title'],
      }),
    ).catch(() => null) as Promise<any>,

    directus.request(
      readItems('invoice_items', {
        filter: { invoice: { _eq: invoiceId } },
        fields: ['id', 'description', 'quantity', 'unit_price', 'total'],
        limit: 20,
      }),
    ).catch(() => []) as Promise<any[]>,

    directus.request(
      readItems('payments', {
        filter: { invoice: { _eq: invoiceId } },
        fields: ['id', 'amount', 'status', 'date_created', 'payment_method'],
        sort: ['-date_created'],
        limit: 10,
      }),
    ).catch(() => []) as Promise<any[]>,
  ]);

  if (!invoice) return '';

  const lines: string[] = [];
  const clientName = (invoice.client as any)?.name;

  lines.push(`CURRENT FOCUS: Invoice "${invoice.invoice_code || invoiceId}"`);

  // [Source: Invoice Details]
  lines.push('[Source: Invoice Details]');
  lines.push(`Status: ${invoice.status || 'unknown'}`);
  if (clientName) lines.push(`Client: ${clientName}`);
  // Projects (M2M)
  const projectNames = (invoice.projects || [])
    .map((j: any) => j.projects_id?.title)
    .filter(Boolean);
  if (projectNames.length) lines.push(`Project${projectNames.length > 1 ? 's' : ''}: ${projectNames.join(', ')}`);
  lines.push(`Amount: $${(invoice.total_amount || 0).toLocaleString()}`);
  if (invoice.subtotal && invoice.tax_amount) {
    lines.push(`  Subtotal: $${invoice.subtotal.toLocaleString()}, Tax: $${invoice.tax_amount.toLocaleString()}`);
  }
  if (invoice.invoice_date) lines.push(`Issued: ${invoice.invoice_date}`);
  if (invoice.due_date) {
    const daysUntil = Math.ceil((new Date(invoice.due_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    lines.push(`Due: ${invoice.due_date}${daysUntil < 0 ? ` (${Math.abs(daysUntil)}d OVERDUE)` : daysUntil <= 7 ? ` (${daysUntil}d remaining)` : ''}`);
  }

  // Line items [Source: Line Items]
  if (lineItems.length > 0) {
    lines.push('');
    lines.push('[Source: Line Items]');
    lines.push(`LINE ITEMS (${lineItems.length}):`);
    lineItems.slice(0, 10).forEach((item: any) => {
      lines.push(`  - ${item.description || 'Item'} — ${item.quantity || 1} x $${(item.unit_price || 0).toLocaleString()} = $${(item.total || 0).toLocaleString()}`);
    });
  }

  // Payment history [Source: Payment History]
  if (payments.length > 0) {
    const totalPaid = payments.filter((p: any) => p.status === 'completed' || p.status === 'succeeded')
      .reduce((s: number, p: any) => s + (p.amount || 0), 0);
    lines.push('');
    lines.push('[Source: Payment History]');
    lines.push(`PAYMENTS (${payments.length}, total paid: $${totalPaid.toLocaleString()}):`);
    payments.slice(0, 5).forEach((p: any) => {
      lines.push(`  - $${(p.amount || 0).toLocaleString()} — ${p.status}${p.payment_method ? ` via ${p.payment_method}` : ''}${p.date_created ? ` on ${p.date_created.split('T')[0]}` : ''}`);
    });

    const remaining = (invoice.total_amount || 0) - totalPaid;
    if (remaining > 0) {
      lines.push(`  Balance remaining: $${remaining.toLocaleString()}`);
    }
  }

  if (invoice.notes) {
    lines.push('');
    lines.push('[Source: Invoice Details]');
    lines.push(`NOTES: ${invoice.notes}`);
  }

  lines.push('');
  lines.push('Focus your reasoning on this invoice. Reference its data directly. When citing data, include the [Source: X] tag so the user knows where it came from.');

  return truncate(lines.join('\n'));
}

// ─── Lead Context ───────────────────────────────────────────────────────────

async function buildLeadContext(directus: any, leadId: string, now: Date): Promise<string> {
  const leadKey = Number.isFinite(Number(leadId)) ? Number(leadId) : leadId;
  const [lead, activities] = await Promise.all([
    directus.request(
      readItem('leads', leadKey as any, {
        fields: [
          'id', 'stage', 'status', 'priority', 'lead_score', 'estimated_value', 'actual_value',
          'source', 'source_details', 'project_type', 'timeline', 'tags', 'notes',
          'date_created', 'date_updated', 'next_follow_up', 'closed_date', 'lost_reason',
          'related_contact.id', 'related_contact.first_name', 'related_contact.last_name',
          'related_contact.email', 'related_contact.company', 'related_contact.phone',
          'related_contact.email_subscribed', 'related_contact.email_bounced',
          'related_contact.total_emails_sent', 'related_contact.total_opens', 'related_contact.total_clicks',
          'related_contact.last_opened_at', 'related_contact.last_clicked_at',
          'assigned_to.id', 'assigned_to.first_name', 'assigned_to.last_name',
        ],
      }),
    ).catch(() => null) as Promise<any>,

    directus.request(
      readItems('lead_activities', {
        filter: { lead: { _eq: leadKey } },
        fields: ['id', 'activity_type', 'subject', 'description', 'outcome', 'next_action', 'activity_date'],
        sort: ['-activity_date'],
        limit: 10,
      }),
    ).catch(() => []) as Promise<any[]>,
  ]);

  if (!lead) return '';

  const lines: string[] = [];
  const contactName = lead.related_contact
    ? `${lead.related_contact.first_name || ''} ${lead.related_contact.last_name || ''}`.trim()
    : '';
  const label = contactName || lead.related_contact?.company || 'Lead';

  lines.push(`CURRENT FOCUS: Lead "${label}"`);
  lines.push('[Source: Lead Profile]');
  lines.push(`Stage: ${lead.stage || 'new'}`);
  if (lead.priority) lines.push(`Priority: ${lead.priority}`);
  if (lead.lead_score != null) lines.push(`Score: ${lead.lead_score}/100`);
  if (lead.estimated_value) lines.push(`Est. value: $${Number(lead.estimated_value).toLocaleString()}`);
  if (lead.project_type) lines.push(`Project type: ${lead.project_type}`);
  if (lead.timeline) lines.push(`Timeline: ${lead.timeline}`);
  if (lead.source) lines.push(`Source: ${lead.source}${lead.source_details ? ` (${lead.source_details})` : ''}`);
  if (lead.assigned_to) {
    const owner = `${lead.assigned_to.first_name || ''} ${lead.assigned_to.last_name || ''}`.trim();
    if (owner) lines.push(`Assigned to: ${owner}`);
  }
  if (lead.next_follow_up) {
    const daysUntil = Math.ceil((new Date(lead.next_follow_up).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    lines.push(`Next follow-up: ${lead.next_follow_up}${daysUntil < 0 ? ` (${Math.abs(daysUntil)}d OVERDUE)` : ''}`);
  }
  if (lead.tags?.length) lines.push(`Tags: ${lead.tags.join(', ')}`);
  if (lead.lost_reason) lines.push(`Lost reason: ${lead.lost_reason}`);

  if (lead.related_contact) {
    const c = lead.related_contact;
    lines.push('');
    lines.push('[Source: Contact]');
    lines.push(`Contact: ${contactName || '(no name)'}${c.company ? ` — ${c.company}` : ''}`);
    if (c.email) lines.push(`  Email: ${c.email}${c.email_bounced ? ' [BOUNCED]' : ''}${c.email_subscribed === false ? ' [UNSUBSCRIBED]' : ''}`);
    if (c.phone) lines.push(`  Phone: ${c.phone}`);
    if (c.total_emails_sent || c.total_opens || c.total_clicks) {
      lines.push(`  Email engagement: ${c.total_emails_sent || 0} sent · ${c.total_opens || 0} opens · ${c.total_clicks || 0} clicks`);
    }
    if (c.last_opened_at) lines.push(`  Last opened: ${c.last_opened_at.split('T')[0]}`);
    if (c.last_clicked_at) lines.push(`  Last clicked: ${c.last_clicked_at.split('T')[0]}`);
  }

  if (activities.length > 0) {
    lines.push('');
    lines.push('[Source: Activities]');
    lines.push(`RECENT ACTIVITY (${activities.length} of latest):`);
    activities.slice(0, 8).forEach((a: any) => {
      const when = a.activity_date ? a.activity_date.split('T')[0] : '';
      const outcome = a.outcome ? ` · ${a.outcome}` : '';
      lines.push(`  - ${when} [${a.activity_type || 'note'}] ${a.subject || ''}${outcome}`);
      if (a.next_action) lines.push(`      Next: ${a.next_action}`);
    });
  }

  if (lead.notes) {
    lines.push('');
    lines.push('[Source: Lead Profile]');
    lines.push(`NOTES: ${lead.notes}`);
  }

  lines.push('');
  lines.push('Focus your reasoning on this lead. Recommend next actions based on stage, engagement, and activity recency. When citing data, include the [Source: X] tag.');

  return truncate(lines.join('\n'));
}

// ─── Contact Context ────────────────────────────────────────────────────────

async function buildContactContext(directus: any, contactId: string, _now: Date): Promise<string> {
  // Fetch display name separately (cheap) so the header reads well even if the
  // summary helper returns empty. The helper itself parallels 3 queries inside.
  const [headerLookup, summary] = await Promise.all([
    directus.request(
      readItem('contacts', contactId, { fields: ['id', 'first_name', 'last_name', 'email'] }),
    ).catch(() => null) as Promise<any>,

    buildContactSummary(contactId),
  ]);

  if (!summary) return '';

  const name = `${headerLookup?.first_name || ''} ${headerLookup?.last_name || ''}`.trim()
    || headerLookup?.email || 'Contact';

  const lines: string[] = [];
  lines.push(`CURRENT FOCUS: Contact "${name}"`);
  lines.push(summary);
  lines.push('');
  lines.push('Focus your reasoning on this contact. Reference engagement, list membership, and lead history when relevant. When citing data, include the [Source: X] tag.');

  return truncate(lines.join('\n'));
}

// ─── Proposal Context ───────────────────────────────────────────────────────

async function buildProposalContext(directus: any, proposalId: string, now: Date): Promise<string> {
  const proposal = await directus.request(
    readItem('proposals', proposalId, {
      fields: [
        'id', 'title', 'proposal_status', 'total_value', 'valid_until', 'date_sent',
        'date_created', 'date_updated',
        'contact.id', 'contact.first_name', 'contact.last_name', 'contact.email', 'contact.company',
        'lead.id', 'lead.stage', 'lead.estimated_value',
        'organization.id', 'organization.name',
      ],
    }),
  ).catch(() => null) as any;

  if (!proposal) return '';

  const lines: string[] = [];
  lines.push(`CURRENT FOCUS: Proposal "${proposal.title || 'Untitled'}"`);

  lines.push('[Source: Proposal Profile]');
  lines.push(`Status: ${proposal.proposal_status || 'draft'}`);
  if (proposal.total_value) lines.push(`Value: $${Number(proposal.total_value).toLocaleString()}`);
  if (proposal.date_sent) {
    const daysSinceSent = Math.floor((now.getTime() - new Date(proposal.date_sent).getTime()) / (1000 * 60 * 60 * 24));
    lines.push(`Sent: ${proposal.date_sent.split('T')[0]} (${daysSinceSent}d ago)`);
  }
  if (proposal.valid_until) {
    const daysUntil = Math.ceil((new Date(proposal.valid_until).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    lines.push(`Expires: ${proposal.valid_until}${daysUntil < 0 ? ` (${Math.abs(daysUntil)}d EXPIRED)` : daysUntil <= 7 ? ` (${daysUntil}d remaining)` : ''}`);
  }

  if (proposal.contact) {
    const c = proposal.contact;
    const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
    lines.push('');
    lines.push('[Source: Recipient]');
    lines.push(`Recipient: ${name || '(no name)'}${c.company ? ` — ${c.company}` : ''}`);
    if (c.email) lines.push(`  Email: ${c.email}`);
  }

  if (proposal.lead) {
    lines.push('');
    lines.push('[Source: Linked Lead]');
    lines.push(`Lead stage: ${proposal.lead.stage}${proposal.lead.estimated_value ? ` (est. $${Number(proposal.lead.estimated_value).toLocaleString()})` : ''}`);
  }

  if (proposal.organization?.name) {
    lines.push('');
    lines.push(`Organization: ${proposal.organization.name}`);
  }

  lines.push('');
  lines.push('Focus your reasoning on this proposal. Recommend actions based on status (draft→ready-to-send, sent→follow up, expired→renew). When citing data, include the [Source: X] tag.');

  return truncate(lines.join('\n'));
}

// ─── Ticket Context ─────────────────────────────────────────────────────────

async function buildTicketContext(directus: any, ticketId: string, now: Date): Promise<string> {
  const ticket = await directus.request(
    readItem('tickets', ticketId, {
      fields: [
        'id', 'title', 'description', 'status', 'priority', 'due_date',
        'date_created', 'date_updated',
        'assigned_to.directus_users_id.id', 'assigned_to.directus_users_id.first_name',
        'assigned_to.directus_users_id.last_name',
        'project.id', 'project.title', 'project.status',
        'client.id', 'client.name',
        'organization.id', 'organization.name',
        'user_created.first_name', 'user_created.last_name',
      ],
    }),
  ).catch(() => null) as any;

  if (!ticket) return '';

  const lines: string[] = [];
  lines.push(`CURRENT FOCUS: Ticket "${ticket.title || 'Untitled'}"`);

  lines.push('[Source: Ticket Profile]');
  lines.push(`Status: ${ticket.status || 'open'}`);
  if (ticket.priority) lines.push(`Priority: ${ticket.priority}`);
  if (ticket.due_date) {
    const daysUntil = Math.ceil((new Date(ticket.due_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    lines.push(`Due: ${ticket.due_date}${daysUntil < 0 ? ` (${Math.abs(daysUntil)}d OVERDUE)` : daysUntil <= 7 ? ` (${daysUntil}d remaining)` : ''}`);
  }
  if (ticket.date_created) {
    const ageDays = Math.floor((now.getTime() - new Date(ticket.date_created).getTime()) / (1000 * 60 * 60 * 24));
    lines.push(`Age: ${ageDays} days`);
  }

  if (ticket.description) {
    lines.push('');
    lines.push('[Source: Ticket Profile]');
    lines.push(`Description: ${String(ticket.description).substring(0, 400)}`);
  }

  const assignees = (ticket.assigned_to || [])
    .map((a: any) => a.directus_users_id)
    .filter(Boolean)
    .map((u: any) => `${u.first_name || ''} ${u.last_name || ''}`.trim())
    .filter(Boolean);
  if (assignees.length > 0) {
    lines.push('');
    lines.push('[Source: Assignments]');
    lines.push(`Assigned to: ${assignees.join(', ')}`);
  }

  if (ticket.project?.title) {
    lines.push('');
    lines.push('[Source: Project]');
    lines.push(`Project: ${ticket.project.title} (${ticket.project.status || 'unknown'})`);
  }

  if (ticket.client?.name) {
    lines.push(`Client: ${ticket.client.name}`);
  }

  if (ticket.user_created) {
    const creator = `${ticket.user_created.first_name || ''} ${ticket.user_created.last_name || ''}`.trim();
    if (creator) lines.push(`Reported by: ${creator}`);
  }

  lines.push('');
  lines.push('Focus your reasoning on this ticket. Recommend next steps, prioritization, or delegation. When citing data, include the [Source: X] tag.');

  return truncate(lines.join('\n'));
}

// ─── Team Context ───────────────────────────────────────────────────────────

async function buildTeamContext(directus: any, teamId: string, now: Date): Promise<string> {
  const [team, projects, goals] = await Promise.all([
    directus.request(
      readItem('teams', teamId, {
        fields: [
          'id', 'name', 'description', 'focus', 'goals', 'status', 'active',
          'users.directus_users_id.id', 'users.directus_users_id.first_name',
          'users.directus_users_id.last_name', 'users.directus_users_id.email',
          'assigned_clients.clients_id.id', 'assigned_clients.clients_id.name',
        ],
      }),
    ).catch(() => null) as Promise<any>,

    directus.request(
      readItems('projects', {
        filter: { team: { _eq: teamId } },
        fields: ['id', 'title', 'status', 'due_date'],
        sort: ['-date_created'],
        limit: 10,
      }),
    ).catch(() => []) as Promise<any[]>,

    directus.request(
      readItems('team_goals', {
        filter: { team: { _eq: teamId } },
        fields: ['id', 'title', 'description', 'target_date', 'progress'],
        sort: ['sort', 'target_date'],
        limit: 10,
      }),
    ).catch(() => []) as Promise<any[]>,
  ]);

  if (!team) return '';

  const lines: string[] = [];
  lines.push(`CURRENT FOCUS: Team "${team.name || 'Team'}"`);

  lines.push('[Source: Team Profile]');
  if (team.focus) lines.push(`Focus: ${team.focus}`);
  if (team.description) lines.push(`Description: ${team.description}`);
  if (team.goals) lines.push(`Team goals: ${team.goals}`);
  if (team.active === false) lines.push('Status: INACTIVE');

  const members = (team.users || [])
    .map((m: any) => m.directus_users_id)
    .filter(Boolean)
    .map((u: any) => `${u.first_name || ''} ${u.last_name || ''}`.trim())
    .filter(Boolean);
  if (members.length > 0) {
    lines.push('');
    lines.push('[Source: Team Members]');
    lines.push(`MEMBERS (${members.length}): ${members.join(', ')}`);
  }

  const clients = (team.assigned_clients || [])
    .map((c: any) => c.clients_id?.name)
    .filter(Boolean);
  if (clients.length > 0) {
    lines.push('');
    lines.push(`[Source: Assigned Clients]`);
    lines.push(`CLIENTS (${clients.length}): ${clients.slice(0, 8).join(', ')}`);
  }

  if (projects.length > 0) {
    const active = projects.filter((p: any) => ['Pending', 'Scheduled', 'In Progress'].includes(p.status));
    lines.push('');
    lines.push('[Source: Team Projects]');
    lines.push(`PROJECTS (${projects.length} total, ${active.length} active):`);
    projects.slice(0, 8).forEach((p: any) => {
      const isOverdue = p.due_date && new Date(p.due_date) < now && active.includes(p);
      lines.push(`  - ${p.title} — ${p.status}${p.due_date ? `, due ${p.due_date}` : ''}${isOverdue ? ' OVERDUE' : ''}`);
    });
  }

  if (goals.length > 0) {
    lines.push('');
    lines.push('[Source: Team Goals]');
    lines.push(`GOALS (${goals.length}):`);
    goals.slice(0, 8).forEach((g: any) => {
      const pct = g.progress != null ? ` — ${g.progress}%` : '';
      const target = g.target_date ? ` (target ${g.target_date})` : '';
      lines.push(`  - ${g.title}${pct}${target}`);
    });
  }

  lines.push('');
  lines.push('Focus your reasoning on this team. Recommend actions around workload, goals, and team health. When citing data, include the [Source: X] tag.');

  return truncate(lines.join('\n'));
}

// ─── Channel Context ────────────────────────────────────────────────────────

async function buildChannelContext(directus: any, channelId: string, now: Date): Promise<string> {
  const [channel, messages] = await Promise.all([
    directus.request(
      readItem('channels', channelId, {
        fields: [
          'id', 'name', 'description', 'status', 'date_created', 'date_updated',
          'project.id', 'project.title', 'client.id', 'client.name',
          'ticket.id', 'ticket.title',
        ],
      }),
    ).catch(() => null) as Promise<any>,

    directus.request(
      readItems('messages', {
        filter: {
          _and: [
            { channel: { _eq: channelId } },
            { status: { _eq: 'published' } },
          ],
        },
        fields: ['id', 'text', 'date_created', 'user_created.first_name', 'user_created.last_name'],
        sort: ['-date_created'],
        limit: 20,
      }),
    ).catch(() => []) as Promise<any[]>,
  ]);

  if (!channel) return '';

  const lines: string[] = [];
  lines.push(`CURRENT FOCUS: Channel "#${channel.name || 'channel'}"`);

  lines.push('[Source: Channel Profile]');
  if (channel.description) lines.push(`Description: ${channel.description}`);
  if (channel.project?.title) lines.push(`Linked project: ${channel.project.title}`);
  if (channel.client?.name) lines.push(`Linked client: ${channel.client.name}`);
  if (channel.ticket?.title) lines.push(`Linked ticket: ${channel.ticket.title}`);

  if (messages.length > 0) {
    const participants = new Set<string>();
    messages.forEach((m: any) => {
      const u = m.user_created;
      if (u) {
        const name = `${u.first_name || ''} ${u.last_name || ''}`.trim();
        if (name) participants.add(name);
      }
    });
    const lastDate = messages[0]?.date_created;
    const lastDays = lastDate ? Math.floor((now.getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)) : null;

    lines.push('');
    lines.push('[Source: Recent Messages]');
    lines.push(`ACTIVITY: ${messages.length} recent messages from ${participants.size} people${lastDays != null ? ` · last message ${lastDays}d ago` : ''}`);

    // Strip HTML from tiptap content
    const stripHtml = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    messages.slice(0, 10).forEach((m: any) => {
      const u = m.user_created;
      const name = u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : 'unknown';
      const when = m.date_created ? m.date_created.split('T')[0] : '';
      const text = stripHtml(m.text || '').substring(0, 200);
      lines.push(`  - [${when}] ${name}: ${text}`);
    });
  }

  lines.push('');
  lines.push('Focus your reasoning on this channel. Summarize discussion, identify open threads, and suggest follow-ups. When citing data, include the [Source: X] tag.');

  return truncate(lines.join('\n'));
}

// ─── Project Event Context ──────────────────────────────────────────────────

async function buildProjectEventContext(directus: any, eventId: string, now: Date): Promise<string> {
  const [event, tasks] = await Promise.all([
    directus.request(
      readItem('project_events', eventId, {
        fields: [
          'id', 'title', 'description', 'content', 'status', 'type', 'priority',
          'event_date', 'date', 'end_date', 'duration_days', 'hours', 'payment_amount',
          'link', 'prototype_link', 'is_milestone', 'date_created',
          'project.id', 'project.title', 'project.status',
          'assigned_to.directus_users_id.first_name', 'assigned_to.directus_users_id.last_name',
        ],
      }),
    ).catch(() => null) as Promise<any>,

    directus.request(
      readItems('project_tasks', {
        filter: { event: { _eq: eventId } },
        fields: ['id', 'title', 'completed', 'due_date', 'priority'],
        sort: ['-due_date'],
        limit: 15,
      }),
    ).catch(() => []) as Promise<any[]>,
  ]);

  if (!event) return '';

  const lines: string[] = [];
  lines.push(`CURRENT FOCUS: Event "${event.title || 'Event'}"`);

  lines.push('[Source: Event Profile]');
  lines.push(`Status: ${event.status || 'unknown'}`);
  if (event.type) lines.push(`Type: ${event.type}`);
  if (event.priority) lines.push(`Priority: ${event.priority}`);
  if (event.is_milestone) lines.push('Milestone: yes');
  if (event.project?.title) lines.push(`Project: ${event.project.title} (${event.project.status || 'unknown'})`);
  if (event.event_date) lines.push(`Event date: ${event.event_date}`);
  if (event.date) lines.push(`Start date: ${event.date}`);
  if (event.end_date) lines.push(`End date: ${event.end_date}`);
  if (event.duration_days) lines.push(`Duration: ${event.duration_days} days`);
  if (event.hours) lines.push(`Hours: ${event.hours}`);
  if (event.payment_amount) lines.push(`Payment: $${Number(event.payment_amount).toLocaleString()}`);
  if (event.prototype_link) lines.push(`Prototype/Figma: ${event.prototype_link}`);
  if (event.link) lines.push(`Link: ${event.link}`);

  if (event.description) {
    lines.push('');
    lines.push('[Source: Event Profile]');
    lines.push(`Description: ${String(event.description).replace(/<[^>]+>/g, ' ').substring(0, 400)}`);
  }

  const assignees = (event.assigned_to || [])
    .map((a: any) => a.directus_users_id)
    .filter(Boolean)
    .map((u: any) => `${u.first_name || ''} ${u.last_name || ''}`.trim())
    .filter(Boolean);
  if (assignees.length > 0) {
    lines.push('');
    lines.push('[Source: Assignments]');
    lines.push(`Assigned to: ${assignees.join(', ')}`);
  }

  if (tasks.length > 0) {
    const completed = tasks.filter((t: any) => t.completed);
    const pending = tasks.filter((t: any) => !t.completed);
    lines.push('');
    lines.push('[Source: Tasks]');
    lines.push(`TASKS (${tasks.length} total, ${completed.length} done, ${pending.length} pending):`);
    pending.slice(0, 5).forEach((t: any) => {
      const overdue = t.due_date && new Date(t.due_date) < now ? ' OVERDUE' : '';
      lines.push(`  - ${t.title}${t.due_date ? ` (due ${t.due_date})` : ''}${t.priority ? ` [${t.priority}]` : ''}${overdue}`);
    });
  }

  lines.push('');
  lines.push('Focus your reasoning on this event. Recommend next steps, identify blockers, or draft team updates. When citing data, include the [Source: X] tag.');

  return truncate(lines.join('\n'));
}

// ─── Email Template Context ─────────────────────────────────────────────────

async function buildEmailTemplateContext(directus: any, templateId: string, now: Date): Promise<string> {
  const key = Number.isFinite(Number(templateId)) ? Number(templateId) : templateId;
  const [template, blocks] = await Promise.all([
    directus.request(
      readItem('email_templates', key as any, {
        fields: [
          'id', 'name', 'slug', 'type', 'status', 'subject_template', 'block_count',
          'include_header', 'include_footer', 'include_web_version_bar', 'is_starter',
          'date_created', 'date_updated',
        ],
      }),
    ).catch(() => null) as Promise<any>,

    directus.request(
      readItems('newsletter_blocks', {
        filter: { template: { _eq: key } },
        fields: ['id', 'block_type', 'title', 'sort'],
        sort: ['sort'],
        limit: 30,
      }),
    ).catch(() => []) as Promise<any[]>,
  ]);

  if (!template) return '';

  const lines: string[] = [];
  lines.push(`CURRENT FOCUS: Email template "${template.name || 'Template'}"`);

  lines.push('[Source: Template Profile]');
  lines.push(`Status: ${template.status || 'draft'}`);
  if (template.type) lines.push(`Type: ${template.type}`);
  if (template.subject_template) lines.push(`Subject: ${template.subject_template}`);
  if (template.block_count != null) lines.push(`Blocks: ${template.block_count}`);
  const flags: string[] = [];
  if (template.include_header) flags.push('header');
  if (template.include_footer) flags.push('footer');
  if (template.include_web_version_bar) flags.push('web-view bar');
  if (flags.length) lines.push(`Includes: ${flags.join(', ')}`);
  if (template.is_starter) lines.push('Starter template: yes');

  if (blocks.length > 0) {
    lines.push('');
    lines.push('[Source: Template Blocks]');
    lines.push(`BLOCKS (${blocks.length}):`);
    blocks.slice(0, 15).forEach((b: any, i: number) => {
      lines.push(`  ${i + 1}. ${b.block_type || 'block'}${b.title ? ` — ${b.title}` : ''}`);
    });
  }

  lines.push('');
  lines.push('Focus your reasoning on this email template. Suggest copy improvements, subject-line ideas, and block recommendations. When citing data, include the [Source: X] tag.');

  return truncate(lines.join('\n'));
}

// ─── Mailing List Context ───────────────────────────────────────────────────

async function buildListContext(directus: any, listId: string, now: Date): Promise<string> {
  const key = Number.isFinite(Number(listId)) ? Number(listId) : listId;
  const [list, recentSubscribers] = await Promise.all([
    directus.request(
      readItem('mailing_lists', key as any, {
        fields: [
          'id', 'name', 'slug', 'description', 'status', 'subscriber_count',
          'is_default', 'double_opt_in', 'date_created', 'date_updated',
        ],
      }),
    ).catch(() => null) as Promise<any>,

    directus.request(
      readItems('mailing_list_contacts', {
        filter: {
          _and: [
            { list_id: { _eq: key } },
            { subscribed: { _eq: true } },
          ],
        },
        fields: [
          'id', 'date_subscribed', 'source',
          'contact_id.first_name', 'contact_id.last_name', 'contact_id.email',
          'contact_id.total_opens', 'contact_id.total_clicks', 'contact_id.last_opened_at',
        ],
        sort: ['-date_subscribed'],
        limit: 30,
      }),
    ).catch(() => []) as Promise<any[]>,
  ]);

  if (!list) return '';

  const lines: string[] = [];
  lines.push(`CURRENT FOCUS: Mailing list "${list.name || 'List'}"`);

  lines.push('[Source: List Profile]');
  lines.push(`Status: ${list.status || 'active'}`);
  if (list.description) lines.push(`Description: ${list.description}`);
  lines.push(`Subscribers: ${list.subscriber_count || recentSubscribers.length}`);
  if (list.is_default) lines.push('Default list: yes');
  if (list.double_opt_in) lines.push('Double opt-in: yes');

  if (recentSubscribers.length > 0) {
    const totalOpens = recentSubscribers.reduce((s: number, r: any) => s + (r.contact_id?.total_opens || 0), 0);
    const totalClicks = recentSubscribers.reduce((s: number, r: any) => s + (r.contact_id?.total_clicks || 0), 0);
    const recentlyEngaged = recentSubscribers.filter((r: any) => r.contact_id?.last_opened_at && new Date(r.contact_id.last_opened_at) > new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)).length;

    lines.push('');
    lines.push('[Source: Subscriber Engagement]');
    lines.push(`ENGAGEMENT (top ${recentSubscribers.length} subscribers): ${totalOpens} total opens · ${totalClicks} total clicks · ${recentlyEngaged} opened in last 30d`);

    lines.push('');
    lines.push('[Source: Recent Subscribers]');
    lines.push(`RECENT SUBSCRIBERS (${Math.min(recentSubscribers.length, 10)}):`);
    recentSubscribers.slice(0, 10).forEach((r: any) => {
      const c = r.contact_id;
      if (!c) return;
      const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email;
      const when = r.date_subscribed ? r.date_subscribed.split('T')[0] : '';
      lines.push(`  - ${name}${when ? ` (joined ${when})` : ''}${r.source ? ` · via ${r.source}` : ''}`);
    });
  }

  lines.push('');
  lines.push('Focus your reasoning on this list. Suggest segments, evaluate engagement, and recommend outreach. When citing data, include the [Source: X] tag.');

  return truncate(lines.join('\n'));
}

// ─── Social Post Context ────────────────────────────────────────────────────

async function buildSocialPostContext(directus: any, postId: string, now: Date): Promise<string> {
  const post = await directus.request(
    readItem('social_posts', postId, {
      fields: [
        'id', 'caption', 'post_type', 'post_status', 'status', 'platforms',
        'media_urls', 'media_types', 'scheduled_at', 'published_at', 'error_message',
        'date_created', 'date_updated',
      ],
    }),
  ).catch(() => null) as any;

  if (!post) return '';

  const lines: string[] = [];
  lines.push(`CURRENT FOCUS: Social post "${String(post.caption || '').slice(0, 40) || 'Post'}"`);

  lines.push('[Source: Post Profile]');
  lines.push(`Status: ${post.status || 'draft'}${post.post_status ? ` (${post.post_status})` : ''}`);
  if (post.post_type) lines.push(`Type: ${post.post_type}`);

  const platforms = Array.isArray(post.platforms)
    ? post.platforms.map((p: any) => p?.platform || p?.account_name).filter(Boolean)
    : [];
  if (platforms.length) lines.push(`Platforms: ${platforms.join(', ')}`);

  if (post.scheduled_at) {
    const scheduled = new Date(post.scheduled_at);
    const daysUntil = Math.ceil((scheduled.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    lines.push(`Scheduled: ${post.scheduled_at}${daysUntil < 0 ? ` (${Math.abs(daysUntil)}d PAST SCHEDULED)` : daysUntil === 0 ? ' (TODAY)' : ` (in ${daysUntil}d)`}`);
  }
  if (post.published_at) lines.push(`Published: ${post.published_at}`);
  if (post.error_message) lines.push(`Error: ${post.error_message}`);

  const mediaCount = Array.isArray(post.media_urls) ? post.media_urls.length : 0;
  if (mediaCount) lines.push(`Media: ${mediaCount} item(s)${Array.isArray(post.media_types) ? ` (${[...new Set(post.media_types)].join(', ')})` : ''}`);

  if (post.caption) {
    const captionLen = String(post.caption).length;
    lines.push('');
    lines.push('[Source: Caption]');
    lines.push(`Caption (${captionLen} chars):`);
    lines.push(String(post.caption).substring(0, 1500));
    if (captionLen > 1500) lines.push('[...truncated]');
  }

  lines.push('');
  lines.push('Focus your reasoning on this social post. Suggest caption tightening, hashtags, timing, or platform-specific tweaks. When citing data, include the [Source: X] tag.');

  return truncate(lines.join('\n'));
}
