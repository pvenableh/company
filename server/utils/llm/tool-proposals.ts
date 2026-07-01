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
import { logAiAction } from '~~/server/utils/ai-actions';
import { UPDATE_FIELD_ALLOWLIST } from '~~/server/utils/ai-action-executors';
import type { ToolHandlerResult } from './tool-handlers';

/** Tool names whose effects are outbound/destructive → propose, don't execute. */
export const PROPOSAL_TOOLS = new Set<string>(['send_email']);

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
    default:
      return { success: false, summary: '', error: `Unknown proposal tool: ${toolName}` };
  }
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
      return task;
    })
    .filter(Boolean) as Record<string, any>[];

  if (!tasks.length) return { success: false, summary: '', error: 'create_tasks needs at least one task with a title' };

  const payload = { tasks };
  const title = tasks.length === 1 ? `Create task: ${tasks[0]!.title}` : `Create ${tasks.length} tasks`;
  const preview = {
    kind: 'create_tasks' as const,
    source: 'director',
    planId: ctx.planId,
    tasks: tasks.map((t) => t.title),
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
