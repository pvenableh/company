// server/utils/ai-action-executors.ts
/**
 * Earnest AI action executors — the server-side registry that turns an approved
 * `ai_actions` row into a real effect.
 *
 * Phase 3 wired the approval queue end-to-end: an outbound/destructive action is
 * logged `pending`, a human approves it via POST /api/ai/actions/[id]/approve,
 * and that endpoint dispatches the row through the executor registered here for
 * its `action_type`.
 *
 * Phase 4 (this file) makes the queue live. Three action types now have real
 * executors, shipped in blast-radius order and against the fixed payload
 * contracts in docs/ai-action-payloads.md:
 *   - create_tasks — batch-create tasks (org-verify any project/client link).
 *   - update_field — one allow-listed field on one org-verified row.
 *   - send_email   — render an org-branded email; genuinely outbound, so it
 *                    DEFAULTS to dry-run (gated on AI_SEND_EMAIL_DRYRUN).
 *
 * Executor contract: `(ctx: { action, userId, organizationId }) => Promise<result>`.
 * Returning a plain object stores it as the row's `result`. THROWING marks the
 * action `failed` with the error message (the approve endpoint surfaces it).
 * A missing/unregistered executor is a clear 400 (never a 500).
 *
 * Two cross-cutting conventions from the contract doc:
 *   - Provenance — tag every AI-created effect (`ai_suggested` on tasks;
 *     `categories:['ai-action']` + `sendCollection:'ai_actions'` on emails).
 *   - Fail-soft vs fail-hard — a bad *link* (row in another org) degrades
 *     gracefully (drop the link, keep going); a bad *core* param (unknown
 *     collection, off-allowlist field, missing recipient, transport error)
 *     throws so the row lands `failed` with a readable reason.
 *
 * All writes use the admin server client (getServerDirectus) — the approve
 * endpoint already membership-verified the caller, and the ai_actions row
 * carries the true org + acting user for the audit trail.
 */

import { createItem, updateItem, readItem, readItems } from '@directus/sdk';
import { renderOrgEmail } from '~~/server/utils/email-shell';
import { fetchOrgBrand, sendBrandedEmail } from '~~/server/utils/email-send';

export interface ExecutorContext {
  /** The full ai_actions row being executed (id, payload, entity_type, …). */
  action: Record<string, any>;
  /** Directus user id of the approver. */
  userId: string;
  /** Organization id the action belongs to (already membership-verified). */
  organizationId: string;
}

export type AiActionExecutor = (ctx: ExecutorContext) => Promise<Record<string, any>>;

// ── shared helpers ────────────────────────────────────────────────────────────

function resolveId(value: any): string | null {
  if (value == null) return null;
  if (typeof value === 'object') return value.id != null ? String(value.id) : null;
  return String(value);
}

/**
 * Load a row's owning-org id via a (possibly dotted) org field path, or null if
 * the row is missing / unreadable. Used to org-verify links + targets before we
 * touch them.
 */
async function loadOrgId(
  directus: ReturnType<typeof getServerDirectus>,
  collection: string,
  id: string | number,
  orgField: string,
): Promise<string | null> {
  try {
    const row = (await directus.request(
      readItem(collection as any, id, { fields: ['id', orgField] as any }),
    )) as any;
    if (!row) return null;
    const raw = orgField.split('.').reduce((acc: any, key) => (acc == null ? acc : acc[key]), row);
    return resolveId(raw);
  } catch {
    return null;
  }
}

// ── create_tasks ──────────────────────────────────────────────────────────────
// Lowest risk: internal rows only, nothing outbound. See CreateTasksPayload in
// docs/ai-action-payloads.md.

const createTasksExecutor: AiActionExecutor = async ({ action, organizationId }) => {
  const entries = Array.isArray(action?.payload?.tasks) ? action.payload.tasks : [];
  if (!entries.length) throw new Error('create_tasks payload has no tasks');

  const directus = getServerDirectus();
  const created: string[] = [];

  for (const t of entries) {
    const title = (t?.title ?? '').toString().trim();
    if (!title) continue; // skip an empty entry; don't fail the batch

    const fields: Record<string, any> = {
      title,
      organization_id: organizationId,
      status: 'new',
      ai_suggested: true,
    };
    if (t.description != null) fields.description = t.description;
    if (t.priority) fields.priority = t.priority;
    if (t.schedule) fields.schedule = t.schedule;
    if (t.due_date) fields.due_date = t.due_date;
    if (t.category) fields.category = t.category;
    if (Array.isArray(t.assigned_to) && t.assigned_to.length) {
      fields.assigned_to = t.assigned_to
        .filter(Boolean)
        .map((uid: string) => ({ directus_users_id: uid }));
    }

    // Org-verify links before attaching — a link into another org is dropped
    // (fail-soft), the task is still created.
    if (t.project_id) {
      const orgId = await loadOrgId(directus, 'projects', t.project_id, 'organization');
      if (orgId === organizationId) fields.project_id = t.project_id;
    }
    if (t.client_id) {
      const orgId = await loadOrgId(directus, 'clients', t.client_id, 'organization');
      if (orgId === organizationId) fields.client_id = t.client_id;
    }

    const row = (await directus.request(
      createItem('tasks' as any, fields, { fields: ['id'] as any }),
    )) as any;
    if (row?.id != null) created.push(String(row.id));
  }

  if (!created.length) throw new Error('create_tasks produced no tasks (all entries were empty)');

  return { created, count: created.length };
};

// ── update_field ──────────────────────────────────────────────────────────────
// Reversible, narrow-by-design: one field on one row, and only field/collection
// pairs in this hard-coded allow-list. The safety is entirely in the allow-list
// — never a free-form update. See UpdateFieldPayload in the contract doc.

export const UPDATE_FIELD_ALLOWLIST: Record<string, string[]> = {
  leads: ['status', 'stage'],
  clients: ['status'],
  projects: ['status'],
  tasks: ['status', 'priority', 'schedule', 'due_date'],
};

// Org column per allow-listed collection (tasks uses organization_id).
export const UPDATE_ORG_FIELD: Record<string, string> = {
  leads: 'organization',
  clients: 'organization',
  projects: 'organization',
  tasks: 'organization_id',
};

const updateFieldExecutor: AiActionExecutor = async ({ action, organizationId }) => {
  const payload = action?.payload || {};
  const collection = (payload.collection ?? '').toString();
  const field = (payload.field ?? '').toString();
  const id = payload.id;
  const value = payload.value;

  // 1. Allow-list gate (fail-hard).
  const allowedFields = UPDATE_FIELD_ALLOWLIST[collection];
  if (!allowedFields) throw new Error(`update_field: collection "${collection}" is not allow-listed`);
  if (!allowedFields.includes(field)) {
    throw new Error(`update_field: field "${field}" is not allow-listed for "${collection}"`);
  }
  if (id == null || id === '') throw new Error('update_field: id is required');

  const directus = getServerDirectus();

  // 2. Org-verify the target row (fail-hard — a cross-org id is not a link we
  //    can silently drop, it's the whole action).
  const orgField = UPDATE_ORG_FIELD[collection];
  if (!orgField) throw new Error(`update_field: no org column mapped for "${collection}"`);
  let previous: unknown;
  try {
    const row = (await directus.request(
      readItem(collection as any, id, { fields: ['id', field, orgField] as any }),
    )) as any;
    if (!row) throw new Error('not found');
    const rowOrg = resolveId(orgField.split('.').reduce((acc: any, k) => (acc == null ? acc : acc[k]), row));
    if (rowOrg !== organizationId) throw new Error('belongs to another organization');
    // 3. Capture previous value for a one-click manual undo + clean audit line.
    previous = row[field];
  } catch (err: any) {
    throw new Error(`update_field: ${collection} ${id} — ${err?.message || 'access denied'}`);
  }

  // 4. Apply.
  await directus.request(updateItem(collection as any, id, { [field]: value }));

  return { collection, id, field, previous, value };
};

/**
 * Reverse an already-executed `update_field` action — the one-click undo behind
 * POST /api/ai/actions/[id]/undo. Because the executor captured `previous`, undo
 * is just writing it back, gated by the SAME safety net as the forward path:
 *   - only executed update_field rows with a complete result;
 *   - collection/field still on the allow-list;
 *   - target row still in the caller's org;
 *   - AND the field still holds the value we set — if someone changed it since,
 *     we ABORT rather than clobber their edit.
 * Returns the revert descriptor; THROWS a readable Error otherwise.
 */
export async function undoUpdateField(
  action: Record<string, any>,
  organizationId: string,
): Promise<Record<string, any>> {
  if (action?.action_type !== 'update_field') throw new Error('undo: not an update_field action');
  if (action?.status !== 'executed') throw new Error(`undo: action is ${action?.status}, not executed`);

  const result = action?.result || {};
  const collection = (result.collection ?? '').toString();
  const field = (result.field ?? '').toString();
  const id = result.id;
  const previous = result.previous;
  const applied = result.value;
  if (!collection || !field || id == null || id === '') {
    throw new Error('undo: action result is missing collection/field/id (nothing to reverse)');
  }
  if (result.undone) throw new Error('undo: this action was already undone');

  // Allow-list gate (defense in depth — never trust the stored result blindly).
  const allowedFields = UPDATE_FIELD_ALLOWLIST[collection];
  if (!allowedFields || !allowedFields.includes(field)) {
    throw new Error(`undo: ${collection}.${field} is not allow-listed`);
  }

  const directus = getServerDirectus();
  const orgField = UPDATE_ORG_FIELD[collection];
  if (!orgField) throw new Error(`undo: no org column mapped for "${collection}"`);

  let current: unknown;
  try {
    const row = (await directus.request(
      readItem(collection as any, id, { fields: ['id', field, orgField] as any }),
    )) as any;
    if (!row) throw new Error('not found');
    const rowOrg = resolveId(orgField.split('.').reduce((acc: any, k) => (acc == null ? acc : acc[k]), row));
    if (rowOrg !== organizationId) throw new Error('belongs to another organization');
    current = row[field];
  } catch (err: any) {
    throw new Error(`undo: ${collection} ${id} — ${err?.message || 'access denied'}`);
  }

  // Don't clobber a later edit: only revert if the field still holds what we set.
  if (JSON.stringify(current) !== JSON.stringify(applied)) {
    throw new Error(`undo: ${collection}.${field} changed since execution — not reverting`);
  }

  await directus.request(updateItem(collection as any, id, { [field]: previous }));

  return { collection, id, field, revertedTo: previous, from: applied };
}

// ── send_email ────────────────────────────────────────────────────────────────
// Irreversible → last to ship, and DEFAULTS to dry-run. The full render + audit
// path runs for real while AI_SEND_EMAIL_DRYRUN is unset/'true'; flip it to
// 'false' in a properly-configured env to actually transmit. See SendEmailPayload.

const sendEmailExecutor: AiActionExecutor = async ({ action, organizationId }) => {
  const payload = action?.payload || {};
  const subject = (payload.subject ?? '').toString().trim();
  const bodyHtml = (payload.bodyHtml ?? '').toString();
  if (!subject) throw new Error('send_email: subject is required');
  if (!bodyHtml.trim()) throw new Error('send_email: bodyHtml is required');

  const directus = getServerDirectus();

  // Resolve the recipient: explicit `to`, otherwise an org-verified contact.
  let to = (payload.to ?? '').toString().trim();
  if (!to && payload.contactId != null && payload.contactId !== '') {
    const rows = (await directus.request(
      readItems('contacts' as any, {
        filter: {
          _and: [
            { id: { _eq: payload.contactId } },
            { organizations: { organizations_id: { _eq: organizationId } } },
          ],
        },
        fields: ['id', 'email'] as any,
        limit: 1,
      }),
    )) as any[];
    const contact = rows?.[0];
    if (!contact) throw new Error(`send_email: contact ${payload.contactId} not found in this organization`);
    to = (contact.email ?? '').toString().trim();
    if (!to) throw new Error(`send_email: contact ${payload.contactId} has no email address`);
  }
  if (!to) throw new Error('send_email: no recipient (provide `to` or an org-verified `contactId`)');

  const org = await fetchOrgBrand(organizationId);

  const cta = payload.cta && payload.cta.label && payload.cta.url
    ? { label: String(payload.cta.label), url: String(payload.cta.url) }
    : null;

  const { html, text } = renderOrgEmail({
    org,
    subject,
    heading: (payload.heading ?? subject).toString(),
    bodyHtml,
    cta,
  });

  // Default to dry-run: the email is fully rendered but NOT transmitted unless
  // AI_SEND_EMAIL_DRYRUN is explicitly 'false'.
  if (process.env.AI_SEND_EMAIL_DRYRUN !== 'false') {
    return { sent: false, dryRun: true, to, subject };
  }

  const res = await sendBrandedEmail({
    to,
    subject,
    html,
    text,
    org,
    replyTo: payload.replyTo ?? null,
    categories: ['transactional', 'ai-action'],
    sendCollection: 'ai_actions',
    sendId: action.id,
  });
  if (!res.sent) throw new Error(res.reason || 'Email transport failed');

  return { sent: true, to, subject };
};

// ── stubs for not-yet-outbound types ──────────────────────────────────────────
// generate_documents draft-creation is non-outbound and logged straight to
// `executed`, so it never flows through approval — but we register a stub anyway
// so an operator can't wedge the queue by hand-creating one. draft_email/other
// have no real effect yet.
function makeStub(actionType: string): AiActionExecutor {
  return async ({ action }) => ({
    stub: true,
    action_type: actionType,
    note: 'Approved and dispatched. No real outbound effect is wired yet for this action type.',
    payload: action?.payload ?? null,
  });
}

/**
 * Registry keyed by action_type. Real executors for create_tasks / update_field
 * / send_email; stubs for the rest.
 */
const EXECUTORS: Record<string, AiActionExecutor> = {
  create_tasks: createTasksExecutor,
  update_field: updateFieldExecutor,
  send_email: sendEmailExecutor,
  generate_documents: makeStub('generate_documents'),
  draft_email: makeStub('draft_email'),
  other: makeStub('other'),
};

/**
 * Resolve the executor for an action_type, or null if none is registered.
 * The approve endpoint turns null into a 400 (never a 500).
 */
export function getExecutor(actionType: string): AiActionExecutor | null {
  return EXECUTORS[actionType] || null;
}
