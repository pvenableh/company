// server/utils/llm/tool-proposals.ts
/**
 * Outbound/destructive AI tool calls are NOT executed inline. Instead they are
 * translated into a `pending` ai_actions row (the HITL approval queue) and only
 * take effect once a human approves them via POST /api/ai/actions/[id]/approve,
 * which dispatches through the executor registry (ai-action-executors.ts).
 *
 * This module is the producer half of that contract: it maps a proposal tool's
 * input to the EXACT payload shape the matching executor expects
 * (docs/ai-action-payloads.md) and logs it `pending`. The executor and this
 * producer must agree on the shape — if they drift the executor gets `undefined`.
 *
 * Non-outbound tools (reschedule_project, update_field, add_task,
 * generate_documents) stay inline in tool-handlers.ts — they create drafts or
 * mutate the user's own operational records and are already reversible in-app.
 *
 * The result shape mirrors ToolHandlerResult so chat.post.ts can treat proposed
 * and executed tool calls uniformly when streaming `tool_done` back to the model.
 */
import { readUsers, readItem } from '@directus/sdk';
import { logAiAction } from '~~/server/utils/ai-actions';
import { UPDATE_FIELD_ALLOWLIST } from '~~/server/utils/ai-action-executors';
import type { ToolHandlerResult } from './tool-handlers';

/** Normalize the various assignee shapes a task tool may emit into a uuid list. */
function extractAssignees(t: Record<string, any>): string[] {
  const out: string[] = [];
  const push = (v: any) => { if (v != null && v !== '') out.push(String(v)); };
  if (Array.isArray(t.assigned_to)) t.assigned_to.forEach(push);
  if (Array.isArray(t.assignee_ids)) t.assignee_ids.forEach(push);
  push(t.assignee_id);
  push(t.assignee);
  return Array.from(new Set(out));
}

/** Resolve user uuids → display names for the approval preview (best-effort). */
async function resolveUserNames(userIds: string[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return {};
  try {
    const directus = getTypedDirectus();
    const rows = await directus.request(readUsers({
      filter: { id: { _in: ids } } as any,
      fields: ['id', 'first_name', 'last_name', 'email'] as any,
      limit: -1,
    })) as any[];
    const map: Record<string, string> = {};
    for (const u of rows || []) {
      map[u.id] = [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.email || 'Teammate';
    }
    return map;
  } catch {
    return {};
  }
}

/** Tool names whose effects are outbound/destructive → propose, don't execute. */
export const PROPOSAL_TOOLS = new Set<string>(['send_email', 'create_project', 'add_event', 'create_invoice', 'create_ticket', 'create_content_plan']);

/** Normalize AI line items into clean {description, rate, quantity, product?} rows. */
function normalizeLineItems(raw: any): Array<Record<string, any>> {
  return (Array.isArray(raw) ? raw : [])
    .map((li) => {
      const description = (li?.description ?? '').toString().trim();
      const rate = Number(li?.rate);
      if (!description || !Number.isFinite(rate)) return null;
      const q = Number(li?.quantity);
      const quantity = Number.isFinite(q) && q > 0 ? q : 1;
      const item: Record<string, any> = { description, rate: Math.round(rate * 100) / 100, quantity };
      if (li.product) item.product = String(li.product);
      return item;
    })
    .filter(Boolean) as Array<Record<string, any>>;
}

function fmtUsd(n: number): string {
  return `$${(Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Normalize a raw tasks array (AI shape) into clean {title, due_date?, priority?} rows. */
function normalizeTasks(raw: any): Array<Record<string, any>> {
  return (Array.isArray(raw) ? raw : [])
    .map((t) => {
      const title = (t?.title ?? '').toString().trim();
      if (!title) return null;
      const task: Record<string, any> = { title };
      if (t.due_date) task.due_date = String(t.due_date);
      if (t.priority) task.priority = String(t.priority);
      return task;
    })
    .filter(Boolean) as Array<Record<string, any>>;
}

/** Normalize a raw events array, carrying nested tasks. Returns cleaned events + total task count. */
function normalizeEvents(raw: any): { events: Array<Record<string, any>>; taskCount: number } {
  const events: Array<Record<string, any>> = [];
  let taskCount = 0;
  for (const e of Array.isArray(raw) ? raw : []) {
    const title = (e?.title ?? '').toString().trim();
    if (!title) continue;
    const ev: Record<string, any> = { title };
    if (e.event_date) ev.event_date = String(e.event_date);
    if (e.end_date) ev.end_date = String(e.end_date);
    if (e.description) ev.description = String(e.description);
    // A payment_amount marks this as a Financial billing milestone.
    const pay = Number(e.payment_amount);
    if (Number.isFinite(pay) && pay > 0) ev.payment_amount = Math.round(pay * 100) / 100;
    const tasks = normalizeTasks(e.tasks);
    if (tasks.length) { ev.tasks = tasks; taskCount += tasks.length; }
    events.push(ev);
  }
  return { events, taskCount };
}

export function isProposalTool(name: string): boolean {
  return PROPOSAL_TOOLS.has(name);
}

export interface ProposalContext {
  organizationId: string;
  userId: string;
  sessionId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

/**
 * Translate an outbound tool call into a pending ai_actions row. Returns a
 * ToolHandlerResult describing the proposal (never actually performs the effect).
 */
export async function proposeToolCall(
  toolName: string,
  input: Record<string, any>,
  ctx: ProposalContext,
): Promise<ToolHandlerResult> {
  switch (toolName) {
    case 'send_email':
      return await proposeSendEmail(input, ctx);
    case 'create_project':
      return await proposeCreateProject(input, ctx);
    case 'add_event':
      return await proposeAddEvent(input, ctx);
    case 'create_invoice':
      return await proposeCreateInvoice(input, ctx);
    case 'create_ticket':
      return await proposeCreateTicket(input, ctx);
    case 'create_content_plan':
      return await proposeCreateContentPlan(input, ctx);
    default:
      return { success: false, summary: '', error: `Unknown proposal tool: ${toolName}` };
  }
}

// ── create_content_plan ──────────────────────────────────────────────────────
// Approval-gated: a DRAFT content plan (the container that groups a month /
// campaign of social posts). The executor writes the content_plans row in
// state:'draft' on approval. Nothing is scheduled or published. entity_type/id
// point at the client (if linked) so the row surfaces on that client's activity.
async function proposeCreateContentPlan(
  input: Record<string, any>,
  ctx: ProposalContext,
): Promise<ToolHandlerResult> {
  const isClientFocus = ctx.entityType === 'client' || ctx.entityType === 'clients';
  const isProjectFocus = ctx.entityType === 'project' || ctx.entityType === 'projects';
  const clientId = input.client_id ?? (isClientFocus ? ctx.entityId : null);
  const projectId = input.project_id ?? (isProjectFocus ? ctx.entityId : null);

  const title = (input.title ?? '').toString().trim() || 'Content plan';
  const planType = ['monthly_cadence', 'campaign', 'launch', 'custom'].includes(input.plan_type)
    ? String(input.plan_type)
    : 'monthly_cadence';
  const themes = Array.isArray(input.themes)
    ? input.themes.map((t: any) => String(t).trim()).filter(Boolean)
    : [];

  const payload: Record<string, any> = {
    title,
    objective: input.objective ? String(input.objective) : null,
    strategy: input.strategy ? String(input.strategy) : null,
    themes,
    plan_type: planType,
    target_month: input.target_month ? String(input.target_month) : null,
    client_id: clientId ?? null,
    project_id: projectId ?? null,
  };

  const rowTitle = `Create content plan "${title}"${themes.length ? ` (${themes.length} theme${themes.length !== 1 ? 's' : ''})` : ''}`;
  const preview = {
    kind: 'create_content_plan' as const,
    title,
    objective: payload.objective,
    strategy: payload.strategy,
    themes,
    plan_type: planType,
    target_month: payload.target_month,
  };

  const actionId = await logAiAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    actionType: 'create_content_plan',
    status: 'pending',
    title: rowTitle,
    payload,
    preview,
    entityType: clientId ? 'clients' : (projectId ? 'projects' : 'content_plans'),
    entityId: clientId ?? projectId ?? null,
    sessionId: ctx.sessionId ?? null,
  });
  if (actionId == null) return { success: false, summary: '', error: 'Could not queue the content plan for approval. Please try again.' };

  return {
    success: true,
    summary: `Proposed: ${rowTitle}. It's waiting in your AI Activity queue for approval — nothing has been created yet.`,
    data: { actionId, proposed: true, status: 'pending' },
  };
}

// ── create_ticket ──────────────────────────────────────────────────────────
async function proposeCreateTicket(
  input: Record<string, any>,
  ctx: ProposalContext,
): Promise<ToolHandlerResult> {
  const title = (input.title ?? '').toString().trim();
  if (!title) return { success: false, summary: '', error: 'title is required to create a ticket' };

  const isClient = ctx.entityType === 'client' || ctx.entityType === 'clients';
  const isProject = ctx.entityType === 'project' || ctx.entityType === 'projects';
  const clientId = input.client_id ?? (isClient ? ctx.entityId : null);
  const projectId = input.project_id ?? (isProject ? ctx.entityId : null);
  const tasks = normalizeTasks(input.tasks);

  const payload: Record<string, any> = {
    title,
    client_id: clientId ?? null,
    project_id: projectId ?? null,
    description: input.description ? String(input.description) : null,
    priority: input.priority ?? null,
    tasks,
  };

  const rowTitle = `Create ticket "${title}"${tasks.length ? ` with ${tasks.length} task${tasks.length !== 1 ? 's' : ''}` : ''}`;
  const preview = { kind: 'create_ticket' as const, title, priority: input.priority ?? null, tasks: tasks.map((t) => t.title) };

  const actionId = await logAiAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    actionType: 'create_ticket',
    status: 'pending',
    title: rowTitle,
    payload,
    preview,
    entityType: projectId ? 'projects' : (clientId ? 'clients' : 'tickets'),
    entityId: projectId ?? clientId ?? null,
    sessionId: ctx.sessionId ?? null,
  });
  if (actionId == null) return { success: false, summary: '', error: 'Could not queue the ticket for approval. Please try again.' };

  return {
    success: true,
    summary: `Proposed: ${rowTitle}. It's waiting in your AI Activity queue for approval — nothing has been created yet.`,
    data: { actionId, proposed: true, status: 'pending' },
  };
}

// ── create_invoice ─────────────────────────────────────────────────────────
// Approval-gated: the invoice + line items are queued; the executor generates
// the invoice code and totals on approval. Line items need a description + rate.
function idOf(v: any): string | null {
  if (v == null) return null;
  return typeof v === 'object' ? (v.id != null ? String(v.id) : null) : String(v);
}

async function proposeCreateInvoice(
  input: Record<string, any>,
  ctx: ProposalContext,
): Promise<ToolHandlerResult> {
  const directus = getTypedDirectus();
  const orgId = ctx.organizationId;

  // Billing source — explicit ids or the focused entity.
  const contractId = input.from_contract_id ?? (ctx.entityType === 'contract' || ctx.entityType === 'contracts' ? ctx.entityId : null);
  const eventId = input.project_event_id ?? (ctx.entityType === 'project_event' ? ctx.entityId : null);
  const projectId = input.project_id ?? (ctx.entityType === 'project' || ctx.entityType === 'projects' ? ctx.entityId : null);
  const isClientFocus = ctx.entityType === 'client' || ctx.entityType === 'clients';

  let clientId: string | null = input.client_id ?? null;
  let projectEventId: string | null = null;
  let seededLine: Record<string, any> | null = null;

  // Bill from a contract → pull its client + total value.
  if (contractId) {
    const c = (await directus.request(
      readItem('contracts' as any, contractId, { fields: ['id', 'title', 'total_value', 'organization', 'client'] as any }),
    ).catch(() => null)) as any;
    if (!c) return { success: false, summary: '', error: 'Contract not found' };
    if (idOf(c.organization) !== orgId) return { success: false, summary: '', error: 'Contract belongs to another organization' };
    if (!clientId) clientId = idOf(c.client);
    const amt = Number(c.total_value);
    if (Number.isFinite(amt) && amt > 0) seededLine = { description: (c.title || 'Contract').toString(), quantity: 1, rate: Math.round(amt * 100) / 100 };
  }

  // Bill a project milestone → pull the project client + milestone amount + link.
  if (eventId) {
    const ev = (await directus.request(
      readItem('project_events' as any, eventId, { fields: ['id', 'title', 'payment_amount', 'amount', 'project.id', 'project.client', 'project.organization'] as any }),
    ).catch(() => null)) as any;
    if (!ev) return { success: false, summary: '', error: 'Milestone event not found' };
    if (idOf(ev.project?.organization) !== orgId) return { success: false, summary: '', error: 'Milestone belongs to another organization' };
    projectEventId = String(ev.id);
    if (!clientId) clientId = idOf(ev.project?.client);
    const amt = Number(ev.payment_amount ?? ev.amount);
    if (!seededLine && Number.isFinite(amt) && amt > 0) seededLine = { description: `${ev.title || 'Milestone'} — milestone payment`, quantity: 1, rate: Math.round(amt * 100) / 100 };
  }

  // Bill from a project → pull its client (no amount seeded; needs explicit line items).
  if (!clientId && projectId) {
    const p = (await directus.request(
      readItem('projects' as any, projectId, { fields: ['id', 'client', 'organization'] as any }),
    ).catch(() => null)) as any;
    if (!p) return { success: false, summary: '', error: 'Project not found' };
    if (idOf(p.organization) !== orgId) return { success: false, summary: '', error: 'Project belongs to another organization' };
    clientId = idOf(p.client);
    if (!clientId) return { success: false, summary: '', error: 'This project has no client set — assign a client to it first, or pass client_id' };
  }

  if (!clientId && isClientFocus) clientId = ctx.entityId ?? null;
  if (!clientId) {
    return { success: false, summary: '', error: 'create_invoice needs a client — focus a client, contract, milestone, or project, or pass client_id' };
  }

  let lineItems = normalizeLineItems(input.line_items);
  if (!lineItems.length && seededLine) lineItems = [seededLine];
  if (!lineItems.length) {
    return { success: false, summary: '', error: 'create_invoice needs at least one line item (or a contract / milestone amount to bill from)' };
  }

  const subtotal = lineItems.reduce((s, li) => s + li.quantity * li.rate, 0);

  const payload = {
    client_id: String(clientId),
    invoice_date: input.invoice_date ? String(input.invoice_date) : null,
    due_date: input.due_date ? String(input.due_date) : null,
    line_items: lineItems,
    project_event_id: projectEventId,
  };

  const rowTitle = `Create invoice — ${fmtUsd(subtotal)} (${lineItems.length} item${lineItems.length !== 1 ? 's' : ''})`;
  const preview = {
    kind: 'create_invoice' as const,
    subtotal,
    due_date: payload.due_date,
    lineItems: lineItems.map((li) => ({ description: li.description, quantity: li.quantity, rate: li.rate, amount: Math.round(li.quantity * li.rate * 100) / 100 })),
    fromContract: !!contractId,
    linkedMilestone: !!projectEventId,
  };

  const actionId = await logAiAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    actionType: 'create_invoice',
    status: 'pending',
    title: rowTitle,
    payload,
    preview,
    entityType: projectEventId ? 'project_events' : 'clients',
    entityId: projectEventId ?? String(clientId),
    sessionId: ctx.sessionId ?? null,
  });
  if (actionId == null) return { success: false, summary: '', error: 'Could not queue the invoice for approval. Please try again.' };

  return {
    success: true,
    summary: `Proposed: ${rowTitle}. It's waiting in your AI Activity queue for approval — no invoice has been created yet.`,
    data: { actionId, proposed: true, status: 'pending' },
  };
}

// ── create_project ─────────────────────────────────────────────────────────
// Approval-gated: a whole project (with its events + tasks) is queued as one
// pending row. The executor (ai-action-executors.ts createProjectExecutor)
// creates the tree on approval. entity_type/id point at the client (if linked)
// so the row surfaces on that client's activity; there's no project id yet.
async function proposeCreateProject(
  input: Record<string, any>,
  ctx: ProposalContext,
): Promise<ToolHandlerResult> {
  const title = (input.title ?? '').toString().trim();
  if (!title) return { success: false, summary: '', error: 'title is required to create a project' };

  const isClientFocus = ctx.entityType === 'client' || ctx.entityType === 'clients';
  const clientId = input.client_id ?? (isClientFocus ? ctx.entityId : null);

  const { events, taskCount: eventTaskCount } = normalizeEvents(input.events);
  const projectTasks = normalizeTasks(input.tasks);
  const totalTasks = eventTaskCount + projectTasks.length;

  const payload: Record<string, any> = {
    title,
    client_id: clientId ?? null,
    description: input.description ? String(input.description) : null,
    start_date: input.start_date ? String(input.start_date) : null,
    due_date: input.due_date ? String(input.due_date) : null,
    events,
    tasks: projectTasks,
  };

  const parts: string[] = [];
  if (events.length) parts.push(`${events.length} event${events.length !== 1 ? 's' : ''}`);
  if (totalTasks) parts.push(`${totalTasks} task${totalTasks !== 1 ? 's' : ''}`);
  const rowTitle = `Create project "${title}"${parts.length ? ` with ${parts.join(' and ')}` : ''}`;

  const preview = {
    kind: 'create_project' as const,
    title,
    description: payload.description,
    start_date: payload.start_date,
    due_date: payload.due_date,
    events: events.map((e) => ({ title: e.title, event_date: e.event_date ?? null, taskCount: ((e.tasks as any[]) || []).length, payment_amount: (e as any).payment_amount ?? null })),
    projectTaskCount: projectTasks.length,
  };

  const actionId = await logAiAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    actionType: 'create_project',
    status: 'pending',
    title: rowTitle,
    payload,
    preview,
    entityType: clientId ? 'clients' : 'projects',
    entityId: clientId ?? null,
    sessionId: ctx.sessionId ?? null,
  });
  if (actionId == null) return { success: false, summary: '', error: 'Could not queue the project for approval. Please try again.' };

  return {
    success: true,
    summary: `Proposed: ${rowTitle}. It's waiting in your AI Activity queue for approval — nothing has been created yet.`,
    data: { actionId, proposed: true, status: 'pending' },
  };
}

// ── add_event ──────────────────────────────────────────────────────────────
// Approval-gated: adds events (+ their tasks) to an EXISTING project.
async function proposeAddEvent(
  input: Record<string, any>,
  ctx: ProposalContext,
): Promise<ToolHandlerResult> {
  const isProjectFocus = ctx.entityType === 'project' || ctx.entityType === 'projects';
  const projectId = input.project_id ?? (isProjectFocus ? ctx.entityId : null);
  if (!projectId) {
    return { success: false, summary: '', error: 'add_event needs a project_id (or focus the chat on a project)' };
  }

  const { events, taskCount } = normalizeEvents(input.events);
  if (!events.length) return { success: false, summary: '', error: 'add_event needs at least one event with a title' };

  const payload = { project_id: String(projectId), events };

  const parts = [`${events.length} event${events.length !== 1 ? 's' : ''}`];
  if (taskCount) parts.push(`${taskCount} task${taskCount !== 1 ? 's' : ''}`);
  const rowTitle = `Add ${parts.join(' and ')} to project`;

  const preview = {
    kind: 'add_event' as const,
    events: events.map((e) => ({ title: e.title, event_date: e.event_date ?? null, taskCount: ((e.tasks as any[]) || []).length, payment_amount: (e as any).payment_amount ?? null })),
  };

  const actionId = await logAiAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    actionType: 'add_event',
    status: 'pending',
    title: rowTitle,
    payload,
    preview,
    entityType: 'projects',
    entityId: String(projectId),
    sessionId: ctx.sessionId ?? null,
  });
  if (actionId == null) return { success: false, summary: '', error: 'Could not queue the events for approval. Please try again.' };

  return {
    success: true,
    summary: `Proposed: ${rowTitle}. Waiting in your AI Activity queue for approval.`,
    data: { actionId, proposed: true, status: 'pending' },
  };
}

async function proposeSendEmail(
  input: Record<string, any>,
  ctx: ProposalContext,
  previewExtra?: Record<string, any>,
): Promise<ToolHandlerResult> {
  const subject = (input.subject ?? '').toString().trim();
  const bodyHtml = (input.body_html ?? '').toString();
  const to = (input.to ?? '').toString().trim();
  const contactId = input.contact_id ?? null;

  if (!subject) return { success: false, summary: '', error: 'subject is required' };
  if (!bodyHtml.trim()) return { success: false, summary: '', error: 'body_html is required' };
  if (!to && (contactId == null || contactId === '')) {
    return { success: false, summary: '', error: 'Provide either `to` or a `contact_id` to resolve the recipient' };
  }

  // Map to the SendEmailPayload contract shape (docs/ai-action-payloads.md).
  const payload: Record<string, any> = {
    subject,
    bodyHtml,
    to: to || undefined,
    contactId: contactId ?? null,
    heading: input.heading ? String(input.heading) : undefined,
    cta: input.cta_label && input.cta_url
      ? { label: String(input.cta_label), url: String(input.cta_url) }
      : null,
    replyTo: input.reply_to ? String(input.reply_to) : null,
  };

  const recipientLabel = to || `contact ${contactId}`;
  const title = `Email to ${recipientLabel}: ${subject}`;

  // Human-readable preview so an approver sees exactly what will go out BEFORE
  // approving — critical once AI_SEND_EMAIL_DRYRUN=false makes this a real send.
  const preview = {
    kind: 'email' as const,
    to: to || null,
    contactId: contactId ?? null,
    subject,
    heading: payload.heading ?? subject,
    bodyHtml,
    cta: payload.cta,
    ...(previewExtra || {}),
  };

  const actionId = await logAiAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    actionType: 'send_email',
    status: 'pending',
    title,
    payload,
    preview,
    entityType: ctx.entityType ?? null,
    entityId: ctx.entityId ?? null,
    sessionId: ctx.sessionId ?? null,
  });

  if (actionId == null) {
    return { success: false, summary: '', error: 'Could not queue the email for approval. Please try again.' };
  }

  return {
    success: true,
    summary: `Proposed an email to ${recipientLabel} ("${subject}"). It is waiting in your AI Activity queue for approval — nothing has been sent yet.`,
    data: { actionId, proposed: true, status: 'pending', to: to || null, contactId: contactId ?? null, subject },
  };
}

// ── Director's Office plan steps ──────────────────────────────────────────────
// The Director's Office is propose-only: EVERY step Claude plans (not just the
// outbound send_email) becomes a pending ai_actions row. This maps each planned
// tool call to the exact executor payload contract (docs/ai-action-payloads.md)
// and tags the row with a shared planId + source:'director' so the office can
// group + refresh the plan. Reversibility + allow-lists are still enforced by the
// executor on approval; we validate up-front here too so a step that can't
// possibly execute isn't queued.

export interface DirectorStepContext extends ProposalContext {
  /** Shared id grouping every step of one plan. */
  planId: string;
  /** The agenda subject this plan addresses (for the audit row's context). */
  subject?: string | null;
}

/**
 * Translate one planned tool call into a pending ai_actions row. Supports the
 * three action types with real executors (create_tasks / update_field /
 * send_email). Returns a ToolHandlerResult whose `data.actionId` the plan
 * endpoint collects.
 */
export async function proposeDirectorStep(
  toolName: string,
  input: Record<string, any>,
  ctx: DirectorStepContext,
): Promise<ToolHandlerResult> {
  switch (toolName) {
    case 'send_email':
      return await proposeSendEmail(input, ctx, { source: 'director', planId: ctx.planId });
    case 'update_field':
      return await proposeDirectorUpdateField(input, ctx);
    case 'add_task':
    case 'create_tasks':
      return await proposeDirectorCreateTasks(input, ctx);
    case 'reschedule_project':
      return await proposeDirectorReschedule(input, ctx);
    default:
      return { success: false, summary: '', error: `Unsupported director step: ${toolName}` };
  }
}

async function proposeDirectorReschedule(
  input: Record<string, any>,
  ctx: DirectorStepContext,
): Promise<ToolHandlerResult> {
  const projectId = input.project_id ?? input.projectId ?? input.entity_id;
  if (!projectId) return { success: false, summary: '', error: 'reschedule_project needs project_id' };
  if (input.delta_days == null && input.new_start_date == null) {
    return { success: false, summary: '', error: 'reschedule_project needs delta_days or new_start_date' };
  }

  const payload: Record<string, any> = {
    project_id: projectId,
    shift_events: input.shift_events !== false,
    shift_tasks: input.shift_tasks !== false,
  };
  if (input.delta_days != null) payload.delta_days = Math.round(Number(input.delta_days));
  if (input.new_start_date != null) payload.new_start_date = String(input.new_start_date);

  const title = input.delta_days != null
    ? `Reschedule project by ${payload.delta_days} day${Math.abs(payload.delta_days) === 1 ? '' : 's'}`
    : `Reschedule project to start ${payload.new_start_date}`;
  const preview = {
    kind: 'reschedule_project' as const,
    source: 'director',
    planId: ctx.planId,
    ...payload,
  };

  const actionId = await logAiAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    actionType: 'reschedule_project',
    status: 'pending',
    title,
    payload,
    preview,
    entityType: 'projects',
    entityId: String(projectId),
    sessionId: ctx.sessionId ?? null,
  });
  if (actionId == null) return { success: false, summary: '', error: 'Could not queue the reschedule.' };

  return {
    success: true,
    summary: `Proposed: ${title}. Waiting for your approval.`,
    data: { actionId, proposed: true, status: 'pending', project_id: projectId },
  };
}

async function proposeDirectorUpdateField(
  input: Record<string, any>,
  ctx: DirectorStepContext,
): Promise<ToolHandlerResult> {
  const collection = (input.entity_type ?? input.collection ?? '').toString().trim();
  const field = (input.field ?? '').toString().trim();
  const id = input.entity_id ?? input.id;
  const value = input.value;

  if (!collection || !field) return { success: false, summary: '', error: 'update_field needs entity_type + field' };
  if (id == null || id === '') return { success: false, summary: '', error: 'update_field needs entity_id' };

  // Gate on the same allow-list the executor enforces — don't queue a step that
  // is guaranteed to fail on approval.
  const allowed = UPDATE_FIELD_ALLOWLIST[collection];
  if (!allowed || !allowed.includes(field)) {
    return { success: false, summary: '', error: `update_field: ${collection}.${field} is not allow-listed` };
  }

  const payload = { collection, id, field, value };
  const title = `Set ${collection} ${field} → ${String(value)}`;
  const preview = {
    kind: 'update_field' as const,
    source: 'director',
    planId: ctx.planId,
    collection, id, field, value,
  };

  const actionId = await logAiAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    actionType: 'update_field',
    status: 'pending',
    title,
    payload,
    preview,
    entityType: collection,
    entityId: String(id),
    sessionId: ctx.sessionId ?? null,
  });
  if (actionId == null) return { success: false, summary: '', error: 'Could not queue the field update.' };

  return {
    success: true,
    summary: `Proposed: ${title}. Waiting for your approval.`,
    data: { actionId, proposed: true, status: 'pending', collection, id, field, value },
  };
}

async function proposeDirectorCreateTasks(
  input: Record<string, any>,
  ctx: DirectorStepContext,
): Promise<ToolHandlerResult> {
  // Accept either add_task's single-task shape or a create_tasks `tasks` array.
  const rawTasks: any[] = Array.isArray(input.tasks)
    ? input.tasks
    : [{
        title: input.title,
        description: input.description,
        priority: input.priority,
        schedule: input.schedule,
        due_date: input.due_date,
        category: input.category,
        project_id: input.project_id,
        client_id: input.client_id,
      }];

  // Single add_task shape carries the assignee at the top level.
  const singleAssignees = Array.isArray(input.tasks) ? [] : extractAssignees(input);

  const tasks = rawTasks
    .map((t) => {
      const title = (t?.title ?? '').toString().trim();
      if (!title) return null;
      const task: Record<string, any> = { title };
      if (t.description) task.description = String(t.description);
      if (t.priority) task.priority = t.priority;
      if (t.schedule) task.schedule = t.schedule;
      if (t.due_date) task.due_date = t.due_date;
      if (t.category) task.category = t.category;
      if (t.project_id) task.project_id = t.project_id;
      if (t.client_id) task.client_id = t.client_id;
      // Carry the assignee(s) through so approved tasks are actually assigned —
      // the executor reads `assigned_to` (array of user uuids).
      const assignees = extractAssignees(t).concat(singleAssignees);
      if (assignees.length) task.assigned_to = Array.from(new Set(assignees));
      return task;
    })
    .filter(Boolean) as Record<string, any>[];

  if (!tasks.length) return { success: false, summary: '', error: 'create_tasks needs at least one task with a title' };

  // Resolve assignee names for the approval preview so the human sees who each
  // task will go to BEFORE approving.
  const allAssignees = Array.from(new Set(tasks.flatMap((t) => (t.assigned_to as string[]) || [])));
  const nameMap = allAssignees.length ? await resolveUserNames(allAssignees) : {};

  const payload = { tasks };
  const title = tasks.length === 1 ? `Create task: ${tasks[0]!.title}` : `Create ${tasks.length} tasks`;
  const preview = {
    kind: 'create_tasks' as const,
    source: 'director',
    planId: ctx.planId,
    // Titles kept as a plain string[] for backward-compat with existing preview
    // renderers; assignee names ride alongside for the Director's Office card.
    tasks: tasks.map((t) => t.title),
    taskAssignees: tasks.map((t) => ((t.assigned_to as string[]) || []).map((id) => nameMap[id] || 'Teammate')),
    assignees: Array.from(new Set(Object.values(nameMap))),
  };

  const actionId = await logAiAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    actionType: 'create_tasks',
    status: 'pending',
    title,
    payload,
    preview,
    entityType: ctx.entityType ?? null,
    entityId: ctx.entityId ?? null,
    sessionId: ctx.sessionId ?? null,
  });
  if (actionId == null) return { success: false, summary: '', error: 'Could not queue the tasks.' };

  return {
    success: true,
    summary: `Proposed: ${title}. Waiting for your approval.`,
    data: { actionId, proposed: true, status: 'pending', count: tasks.length },
  };
}
