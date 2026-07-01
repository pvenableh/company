// server/utils/ai-action-executors.ts
/**
 * Earnest AI action executors — the server-side registry that turns an approved
 * `ai_actions` row into a real effect.
 *
 * Phase 3 of the HITL action layer wires the approval queue end-to-end: an
 * outbound/destructive action is logged `pending`, a human approves it via
 * POST /api/ai/actions/[id]/approve, and that endpoint dispatches the row
 * through the executor registered here for its `action_type`.
 *
 * Deliberately conservative for now:
 *  - Every known `action_type` has a STUB executor so the queue is exercisable
 *    end-to-end without sending/mutating anything real. Stubs echo the payload
 *    back as the result and mark themselves `stub: true`.
 *  - Real outbound wiring (send_email, etc.) replaces a stub one at a time.
 *  - An unknown/unregistered action_type is NOT a 500 — the approve endpoint
 *    surfaces `getExecutor()` returning null as a clear 400.
 *
 * An executor receives the full action row + the approving context and returns
 * a plain `result` object to be stored on the row. Throwing marks the action
 * `failed` with the error message (handled by the approve endpoint).
 */

export interface ExecutorContext {
  /** The full ai_actions row being executed (id, payload, entity_type, …). */
  action: Record<string, any>;
  /** Directus user id of the approver. */
  userId: string;
  /** Organization id the action belongs to (already membership-verified). */
  organizationId: string;
}

export type AiActionExecutor = (ctx: ExecutorContext) => Promise<Record<string, any>>;

/**
 * A stub executor: performs no outbound effect, just records that approval
 * was dispatched. Used until the real effect is wired for that action_type.
 */
function makeStub(actionType: string): AiActionExecutor {
  return async ({ action }) => ({
    stub: true,
    action_type: actionType,
    note: 'Approved and dispatched. No real outbound effect is wired yet for this action type.',
    payload: action?.payload ?? null,
  });
}

/**
 * Registry keyed by action_type. Seeded with a stub per known type from
 * shared/directus.ts (AiAction.action_type). Real executors replace stubs here.
 *
 * Note: `generate_documents` draft-creation is non-outbound and is logged
 * straight to `executed`, so it never flows through approval — but we register
 * a stub anyway so an operator can't wedge the queue by hand-creating one.
 */
const EXECUTORS: Record<string, AiActionExecutor> = {
  generate_documents: makeStub('generate_documents'),
  draft_email: makeStub('draft_email'),
  send_email: makeStub('send_email'),
  create_tasks: makeStub('create_tasks'),
  update_field: makeStub('update_field'),
  other: makeStub('other'),
};

/**
 * Resolve the executor for an action_type, or null if none is registered.
 * The approve endpoint turns null into a 400 (never a 500).
 */
export function getExecutor(actionType: string): AiActionExecutor | null {
  return EXECUTORS[actionType] || null;
}
