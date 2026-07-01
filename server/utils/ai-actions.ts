// server/utils/ai-actions.ts
/**
 * Earnest AI action layer — the human-in-the-loop (HITL) queue + audit log.
 *
 * Every action Earnest AI proposes or takes is recorded in the `ai_actions`
 * collection (see scripts/setup-ai-actions-collection.ts). This is both the
 * review queue for outbound/destructive actions AND the permanent audit trail.
 *
 * Design:
 *  - Safe, non-outbound actions (creating a DRAFT proposal/contract) are logged
 *    straight to status 'executed' — the draft itself is the reviewable artifact
 *    and nothing leaves the system until the user finalises/sends it.
 *  - Outbound/destructive actions (send email, publish) MUST be logged 'pending'
 *    and only executed after the user approves them.
 *
 * All writes go through the server (admin) client and are fire-and-forget: a
 * missing collection or permission must NEVER break the underlying feature, so
 * every call is wrapped and failures are swallowed with a warning. The audit
 * log is inert until scripts/setup-ai-actions-collection.ts has been run.
 */

import { createItem, updateItem } from '@directus/sdk';

export type AiActionStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';

export interface LogAiActionParams {
  organizationId?: string | null;
  userId?: string | null;
  actionType: string;
  status: AiActionStatus;
  title?: string;
  payload?: Record<string, any> | null;
  preview?: Record<string, any> | null;
  result?: Record<string, any> | null;
  error?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  sessionId?: string | null;
}

/**
 * Record an AI action. Returns the created row id, or null if logging failed
 * (which never propagates — the caller's real work must not depend on it).
 */
export async function logAiAction(params: LogAiActionParams): Promise<string | number | null> {
  try {
    const directus = getTypedDirectus();
    const now = new Date().toISOString();
    const created = await directus.request(
      createItem('ai_actions' as any, {
        organization: params.organizationId || null,
        user: params.userId || null,
        action_type: params.actionType,
        status: params.status,
        title: params.title || null,
        payload: params.payload ?? null,
        preview: params.preview ?? null,
        result: params.result ?? null,
        error: params.error ?? null,
        entity_type: params.entityType ?? null,
        entity_id: params.entityId ?? null,
        session_id: params.sessionId ?? null,
        executed_at: params.status === 'executed' ? now : null,
      }),
    ) as any;
    return created?.id ?? null;
  } catch (err: any) {
    console.warn('[ai-actions] logAiAction failed (audit log inert until collection is set up):', err?.message);
    return null;
  }
}

/**
 * Update an existing action row (e.g. pending -> executed after approval).
 * Fire-and-forget; never throws.
 */
export async function updateAiAction(id: string | number, patch: Partial<{
  status: AiActionStatus;
  result: Record<string, any> | null;
  error: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  executedAt: string | null;
}>): Promise<void> {
  try {
    const directus = getTypedDirectus();
    await directus.request(
      updateItem('ai_actions' as any, id, {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.result !== undefined ? { result: patch.result } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
        ...(patch.approvedBy !== undefined ? { approved_by: patch.approvedBy } : {}),
        ...(patch.approvedAt !== undefined ? { approved_at: patch.approvedAt } : {}),
        ...(patch.executedAt !== undefined ? { executed_at: patch.executedAt } : {}),
      }),
    );
  } catch (err: any) {
    console.warn('[ai-actions] updateAiAction failed:', err?.message);
  }
}
