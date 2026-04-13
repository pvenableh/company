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
    }
    return '';
  } catch (err: any) {
    console.error(`[entity-context] Failed to build ${entityType} context:`, err.message);
    return '';
  }
}

// ─── Client Context ─────────────────────────────────────────────────────────

async function buildClientContext(directus: any, clientId: string, now: Date): Promise<string> {
  const [client, invoices, projects, contacts] = await Promise.all([
    directus.request(
      readItem('clients', clientId, {
        fields: ['id', 'name', 'status', 'industry', 'date_created', 'date_updated',
          'brand_direction', 'goals', 'target_audience', 'location', 'website', 'notes'],
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
        fields: ['id', 'first_name', 'last_name', 'email', 'job_title'],
        limit: 10,
      }),
    ).catch(() => []) as Promise<any[]>,
  ]);

  if (!client) return '';

  const lines: string[] = [];
  lines.push(`CURRENT FOCUS: Client "${client.name}"`);

  // [Source: Client Profile]
  lines.push('[Source: Client Profile]');
  lines.push(`Status: ${client.status || 'unknown'}`);
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

  // Contacts [Source: Contacts]
  if (contacts.length > 0) {
    lines.push('');
    lines.push(`[Source: Contacts]`);
    lines.push(`CONTACTS (${contacts.length}):`);
    contacts.slice(0, 5).forEach((c: any) => {
      const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
      lines.push(`  - ${name}${c.job_title ? ` — ${c.job_title}` : ''}${c.email ? ` (${c.email})` : ''}`);
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
