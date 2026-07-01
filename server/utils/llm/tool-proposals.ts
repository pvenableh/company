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
