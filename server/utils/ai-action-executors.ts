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
import { renderBrandedTemplate } from '~~/server/utils/email-templates';
import { fetchOrgBrand, sendBrandedEmail } from '~~/server/utils/email-send';
import { evaluateOutboundGate } from '~~/server/utils/outbound-gate';

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
  projects: ['status', 'title', 'description', 'start_date', 'due_date', 'contract_value'],
  tasks: ['status', 'priority', 'schedule', 'due_date'],
  proposals: ['proposal_status', 'title'],
  contracts: ['contract_status', 'title'],
  invoices: ['status', 'due_date'],
};

// Org column per allow-listed collection (tasks uses organization_id).
export const UPDATE_ORG_FIELD: Record<string, string> = {
  leads: 'organization',
  clients: 'organization',
  projects: 'organization',
  tasks: 'organization_id',
  proposals: 'organization',
  contracts: 'organization',
  // invoices have no direct organization column — scope via the client.
  invoices: 'client.organization',
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
// Irreversible → last to ship. Transmit is decided by the per-org / per-template
// OUTBOUND GATE (server/utils/outbound-gate.ts), NOT the old global
// AI_SEND_EMAIL_DRYRUN boolean: an org must be on OUTBOUND_EMAIL_ALLOWED_ORGS
// (default deny-all) and the template on OUTBOUND_EMAIL_ALLOWED_TEMPLATES
// (default 'generic'), with OUTBOUND_EMAIL_KILL as a master off-switch.
//
// Either way the email is FULLY RENDERED and the rendered { to, subject, html,
// text } + the gate decision are ALWAYS returned as the action `result` — so
// every send, transmitted or held, leaves a previewable send-log row (surfaced
// by GET /api/ai/actions/[id]/preview). Only when the gate allows do we hand off
// to SendGrid.

const AI_EMAIL_TEMPLATE = 'generic';

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

  // bodyHtml is AI-composed HTML — injected via the template's {{{ }}} exactly
  // as the previous org shell placed it (same trust model).
  const { html, text } = await renderBrandedTemplate(AI_EMAIL_TEMPLATE, {
    subject,
    preheader: subject,
    heading: (payload.heading ?? subject).toString(),
    bodyHtml,
    ctaUrl: cta?.url || '',
    ctaLabel: cta?.label || '',
  }, { org });

  // Always carry the rendered preview + gate decision so a held email is still a
  // complete send-log row (previewable, auditable) — not just a "sent:false".
  const preview = { to, subject, html, text };
  const gate = evaluateOutboundGate({ channel: 'ai_email', orgId: organizationId, template: AI_EMAIL_TEMPLATE });

  // Gate held it: fully rendered but NOT transmitted. Record why.
  if (!gate.allowed) {
    return { sent: false, dryRun: true, to, subject, gate: { allowed: false, reason: gate.reason }, preview };
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

  return { sent: true, to, subject, gate: { allowed: true, reason: gate.reason }, preview };
};

// ── reschedule_project ─────────────────────────────────────────────────────────
// Shifts a project's start/deadline by a delta (or to an explicit new start) and
// cascades that same shift to its events + dated tasks. Mirrors the inline
// tool-handlers logic (handleRescheduleProject) but runs from an approved
// ai_actions row via the admin client. Reversible in spirit (re-run with the
// negated delta), org-verified, fail-hard on a cross-org / missing project.
const rescheduleProjectExecutor: AiActionExecutor = async ({ action, organizationId }) => {
  const payload = action?.payload || {};
  const projectId = payload.project_id ?? payload.projectId;
  const shiftEvents = payload.shift_events !== false;
  const shiftTasks = payload.shift_tasks !== false;
  if (!projectId) throw new Error('reschedule_project: project_id is required');

  const directus = getServerDirectus();

  const project = (await directus.request(
    readItem('projects' as any, projectId, { fields: ['id', 'title', 'start_date', 'due_date', 'organization'] as any }),
  )) as any;
  if (!project) throw new Error('reschedule_project: project not found');
  if (resolveId(project.organization) !== organizationId) {
    throw new Error('reschedule_project: project belongs to another organization');
  }

  // Resolve the day delta from delta_days or an explicit new_start_date.
  let delta: number;
  if (payload.delta_days != null) {
    delta = Math.round(Number(payload.delta_days));
  } else if (payload.new_start_date != null) {
    if (!project.start_date) throw new Error('reschedule_project: project has no start_date — provide delta_days instead');
    delta = Math.round(
      (new Date(payload.new_start_date).getTime() - new Date(project.start_date).getTime()) / (1000 * 60 * 60 * 24),
    );
  } else {
    throw new Error('reschedule_project: provide delta_days or new_start_date');
  }
  if (!Number.isFinite(delta)) throw new Error('reschedule_project: could not compute a valid day delta');
  if (delta === 0) return { project_id: projectId, delta: 0, eventsShifted: 0, tasksShifted: 0, note: 'No change — dates already correct.' };

  const shiftDate = (dateStr: string | null | undefined): string | null => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    d.setDate(d.getDate() + delta);
    return d.toISOString().split('T')[0]!;
  };

  const projectUpdate: Record<string, any> = {};
  if (project.start_date) projectUpdate.start_date = shiftDate(project.start_date);
  if (project.due_date) projectUpdate.due_date = shiftDate(project.due_date);
  if (Object.keys(projectUpdate).length) {
    await directus.request(updateItem('projects' as any, projectId, projectUpdate));
  }

  let eventsShifted = 0;
  let tasksShifted = 0;

  if (shiftEvents) {
    const events = (await directus.request(
      readItems('project_events' as any, {
        filter: { project: { _eq: projectId } }, fields: ['id', 'event_date', 'end_date'] as any, limit: 200,
      }),
    )) as any[];
    for (const ev of events) {
      const evUpdate: Record<string, any> = {};
      if (ev.event_date) evUpdate.event_date = shiftDate(ev.event_date);
      if (ev.end_date) evUpdate.end_date = shiftDate(ev.end_date);
      if (Object.keys(evUpdate).length) {
        await directus.request(updateItem('project_events' as any, ev.id, evUpdate));
        eventsShifted++;
      }
    }
  }

  if (shiftTasks) {
    const tasks = (await directus.request(
      readItems('tasks' as any, {
        filter: { _and: [{ project_id: { _eq: projectId } }, { due_date: { _nnull: true } }] },
        fields: ['id', 'due_date'] as any, limit: 500,
      }),
    )) as any[];
    for (const t of tasks) {
      if (t.due_date) {
        await directus.request(updateItem('tasks' as any, t.id, { due_date: shiftDate(t.due_date) }));
        tasksShifted++;
      }
    }
  }

  return {
    project_id: projectId,
    delta,
    eventsShifted,
    tasksShifted,
    newStartDate: projectUpdate.start_date ?? null,
    newDueDate: projectUpdate.due_date ?? null,
  };
};

// ── create_project / add_event ─────────────────────────────────────────────────
// Internal creation (no outbound effect), but blast-radius is a whole tree of
// rows, so it's approval-gated: proposed pending (tool-proposals.ts) and only
// created here on approve. Writes use the admin client; the project's org is set
// from the membership-verified action, and any client link is org-verified.

/** Create one task row. Returns true if created, false if the title was empty. */
async function createTaskRow(
  directus: ReturnType<typeof getServerDirectus>,
  t: Record<string, any>,
): Promise<boolean> {
  const title = (t?.title ?? '').toString().trim();
  if (!title) return false;
  const fields: Record<string, any> = {
    title,
    organization_id: t.organization_id,
    status: 'new',
    schedule: 'unscheduled',
    ai_suggested: true,
  };
  if (t.category) fields.category = t.category;
  if (t.project_id) fields.project_id = t.project_id;
  if (t.project_event_id) fields.project_event_id = t.project_event_id;
  if (t.ticket_id) fields.ticket_id = t.ticket_id;
  if (t.due_date) fields.due_date = String(t.due_date);
  if (t.priority) fields.priority = String(t.priority);
  if (t.description) fields.description = String(t.description);
  await directus.request(createItem('tasks' as any, fields, { fields: ['id'] as any }));
  return true;
}

/**
 * Create a list of project events under a project, each with its optional tasks.
 * Mirrors server/api/projects/save-events.post.ts: events are linked
 * sequentially via depends_on, tasks attach to both the event and the project.
 */
async function createEventsWithTasks(
  directus: ReturnType<typeof getServerDirectus>,
  projectId: string,
  organizationId: string,
  rawEvents: any,
): Promise<{ eventsCreated: number; tasksCreated: number }> {
  let eventsCreated = 0;
  let tasksCreated = 0;
  let previousEventId: string | null = null;
  let sort = 0;

  for (const e of Array.isArray(rawEvents) ? rawEvents : []) {
    const title = (e?.title ?? '').toString().trim();
    if (!title) continue;

    const evFields: Record<string, any> = {
      project: projectId,
      title,
      status: 'Scheduled',
      priority: 'Normal',
      sort: sort++,
      depends_on: previousEventId,
    };
    if (e.description) evFields.description = String(e.description);
    if (e.event_date) { evFields.event_date = String(e.event_date); evFields.date = String(e.event_date); }
    if (e.end_date) evFields.end_date = String(e.end_date);
    // A payment_amount turns this into a Financial billing milestone that can
    // later be invoiced (create_invoice project_event_id).
    const pay = Number(e.payment_amount);
    if (Number.isFinite(pay) && pay > 0) {
      evFields.payment_amount = String(Math.round(pay * 100) / 100);
      evFields.is_milestone = true;
      evFields.type = e.type || 'Financial';
    }

    const created = (await directus.request(
      createItem('project_events' as any, evFields, { fields: ['id'] as any }),
    )) as any;
    if (!created?.id) continue;
    eventsCreated++;
    previousEventId = String(created.id);

    for (const t of Array.isArray(e.tasks) ? e.tasks : []) {
      const ok = await createTaskRow(directus, {
        ...t,
        project_id: projectId,
        project_event_id: created.id,
        organization_id: organizationId,
        category: 'event',
      });
      if (ok) tasksCreated++;
    }
  }

  return { eventsCreated, tasksCreated };
}

const createProjectExecutor: AiActionExecutor = async ({ action, organizationId }) => {
  const payload = action?.payload || {};
  const title = (payload.title ?? '').toString().trim();
  if (!title) throw new Error('create_project: title is required');

  const directus = getServerDirectus();

  const projectFields: Record<string, any> = {
    title,
    organization: organizationId,
    status: 'Scheduled',
  };
  if (payload.description) projectFields.description = String(payload.description);
  if (payload.start_date) projectFields.start_date = String(payload.start_date);
  if (payload.due_date) projectFields.due_date = String(payload.due_date);

  // Org-verify the client link (fail-soft: drop a cross-org client, keep project).
  if (payload.client_id) {
    const orgId = await loadOrgId(directus, 'clients', payload.client_id, 'organization');
    if (orgId === organizationId) projectFields.client = payload.client_id;
  }

  const project = (await directus.request(
    createItem('projects' as any, projectFields, { fields: ['id'] as any }),
  )) as any;
  const projectId = project?.id ? String(project.id) : null;
  if (!projectId) throw new Error('create_project: project creation returned no id');

  const { eventsCreated, tasksCreated } = await createEventsWithTasks(
    directus, projectId, organizationId, payload.events,
  );

  // Project-level tasks (not tied to a specific event).
  let projectTasks = 0;
  for (const t of Array.isArray(payload.tasks) ? payload.tasks : []) {
    const ok = await createTaskRow(directus, {
      ...t, project_id: projectId, organization_id: organizationId, category: 'project',
    });
    if (ok) projectTasks++;
  }

  return { projectId, eventsCreated, tasksCreated: tasksCreated + projectTasks };
};

const addEventExecutor: AiActionExecutor = async ({ action, organizationId }) => {
  const payload = action?.payload || {};
  const projectId = payload.project_id ? String(payload.project_id) : null;
  if (!projectId) throw new Error('add_event: project_id is required');

  const directus = getServerDirectus();

  const orgId = await loadOrgId(directus, 'projects', projectId, 'organization');
  if (orgId !== organizationId) throw new Error('add_event: project belongs to another organization');

  const { eventsCreated, tasksCreated } = await createEventsWithTasks(
    directus, projectId, organizationId, payload.events,
  );
  if (!eventsCreated) throw new Error('add_event: no events were created (all entries were empty)');

  return { projectId, eventsCreated, tasksCreated };
};

// ── create_ticket ──────────────────────────────────────────────────────────────
// Approval-gated ticket (+ optional task checklist). Org-set; client/project
// links org-verified fail-soft. tickets.status is Capitalized ('Pending').
const createTicketExecutor: AiActionExecutor = async ({ action, organizationId }) => {
  const payload = action?.payload || {};
  const title = (payload.title ?? '').toString().trim();
  if (!title) throw new Error('create_ticket: title is required');

  const directus = getServerDirectus();

  const fields: Record<string, any> = { title, organization: organizationId, status: 'Pending' };
  if (payload.description) fields.description = String(payload.description);
  if (payload.priority) fields.priority = String(payload.priority);
  if (payload.client_id) {
    const orgId = await loadOrgId(directus, 'clients', payload.client_id, 'organization');
    if (orgId === organizationId) fields.client = payload.client_id;
  }
  if (payload.project_id) {
    const orgId = await loadOrgId(directus, 'projects', payload.project_id, 'organization');
    if (orgId === organizationId) fields.project = payload.project_id;
  }

  const ticket = (await directus.request(
    createItem('tickets' as any, fields, { fields: ['id'] as any }),
  )) as any;
  const ticketId = ticket?.id ? String(ticket.id) : null;
  if (!ticketId) throw new Error('create_ticket: ticket creation returned no id');

  let tasksCreated = 0;
  for (const t of Array.isArray(payload.tasks) ? payload.tasks : []) {
    const ok = await createTaskRow(directus, { ...t, ticket_id: ticketId, organization_id: organizationId, category: 'ticket' });
    if (ok) tasksCreated++;
  }

  return { ticketId, tasksCreated };
};

// ── create_invoice ─────────────────────────────────────────────────────────────
// Approval-gated: a real invoice + line items. The server generates the invoice
// code (INV-{ORG}-{CLIENT}-{YEAR}-{NNNN}, mirroring useInvoices.generateInvoiceCode)
// and lets the invoice Flow compute totals. Line items require a product FK
// (products are global) — resolve by name, else a default service product.

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function generateInvoiceCodeServer(
  directus: ReturnType<typeof getServerDirectus>,
  client: any,
  organizationId: string,
  invoiceDate: string,
): Promise<string | null> {
  try {
    const clientCode = String(client?.code || '').toUpperCase();
    if (!clientCode) return null;
    const org = (await directus.request(
      readItem('organizations' as any, organizationId, { fields: ['id', 'code'] as any }),
    ).catch(() => null)) as any;
    const orgCode = String(org?.code || '').toUpperCase();

    let year = new Date().getFullYear();
    const parsed = new Date(invoiceDate);
    if (!isNaN(parsed.getTime())) year = parsed.getFullYear();

    const newPrefix = orgCode ? `INV-${orgCode}-${clientCode}-${year}-` : `INV-${clientCode}-${year}-`;
    const legacyPrefix = `INV-${clientCode}-${year}-`;
    const prefixes = orgCode ? [newPrefix, legacyPrefix] : [legacyPrefix];

    let maxNum = 0;
    for (const prefix of prefixes) {
      const rows = (await directus.request(
        readItems('invoices' as any, { fields: ['invoice_code'] as any, filter: { invoice_code: { _starts_with: prefix } }, limit: -1 }),
      )) as any[];
      for (const inv of rows || []) {
        const m = String(inv?.invoice_code || '').match(/(\d+)$/);
        if (m) { const n = parseInt(m[1]!, 10); if (n > maxNum) maxNum = n; }
      }
    }
    return `${newPrefix}${String(maxNum + 1).padStart(4, '0')}`;
  } catch {
    return null;
  }
}

const createInvoiceExecutor: AiActionExecutor = async ({ action, organizationId }) => {
  const payload = action?.payload || {};
  const clientId = payload.client_id ? String(payload.client_id) : null;
  if (!clientId) throw new Error('create_invoice: client_id is required');

  const directus = getServerDirectus();

  const client = (await directus.request(
    readItem('clients' as any, clientId, { fields: ['id', 'code', 'organization'] as any }),
  ).catch(() => null)) as any;
  if (!client) throw new Error('create_invoice: client not found');
  if (resolveId(client.organization) !== organizationId) {
    throw new Error('create_invoice: client belongs to another organization');
  }

  const rawLines = Array.isArray(payload.line_items) ? payload.line_items : [];
  if (!rawLines.length) throw new Error('create_invoice: at least one line item is required');

  // Line items need a product FK (required, global collection). Resolve by name,
  // else a default service product; no products at all is a clear, fail-hard error.
  const products = (await directus.request(
    readItems('products' as any, { fields: ['id', 'name', 'type'] as any, limit: 200 }),
  )) as any[];
  if (!products.length) {
    throw new Error('create_invoice: no products configured — add a product (e.g. "Services") before Earnest can create invoices');
  }
  const byName = new Map(products.map((p) => [String(p.name || '').toLowerCase().trim(), p.id]));
  const defaultProduct =
    products.find((p) => /service|consult|hour|fee/i.test(String(p.name || ''))) ||
    products.find((p) => p.type === 'Service') ||
    products[0];

  const line_items = rawLines
    .map((li: any) => {
      const description = String(li?.description || '').trim();
      const rate = Number(li?.rate);
      if (!description || !Number.isFinite(rate)) return null;
      const quantity = Number.isFinite(Number(li?.quantity)) && Number(li?.quantity) > 0 ? Number(li.quantity) : 1;
      let productId = defaultProduct.id;
      if (li.product) {
        const m = byName.get(String(li.product).toLowerCase().trim());
        if (m) productId = m;
      }
      return {
        product: productId,
        description,
        quantity,
        rate: Math.round(rate * 100) / 100,
        amount: Math.round(quantity * rate * 100) / 100,
      };
    })
    .filter(Boolean) as Array<Record<string, any>>;
  if (!line_items.length) throw new Error('create_invoice: no valid line items (each needs a description + rate)');

  const invoiceDate = payload.invoice_date ? String(payload.invoice_date) : new Date().toISOString().slice(0, 10);
  const dueDate = payload.due_date ? String(payload.due_date) : addDays(invoiceDate, 30);
  const invoiceCode = await generateInvoiceCodeServer(directus, client, organizationId, invoiceDate);

  const invoiceFields: Record<string, any> = {
    client: clientId,
    invoice_date: invoiceDate,
    due_date: dueDate,
    status: 'pending',
    bill_to: organizationId,
    line_items,
  };
  if (invoiceCode) invoiceFields.invoice_code = invoiceCode;

  const created = (await directus.request(
    createItem('invoices' as any, invoiceFields, { fields: ['id', 'invoice_code', 'total_amount'] as any }),
  )) as any;
  if (!created?.id) throw new Error('create_invoice: invoice creation returned no id');

  // Link to a project payment milestone via the project_events_invoices junction
  // (fail-soft: the invoice still stands if the link can't be written).
  let linkedEventId: string | null = null;
  if (payload.project_event_id) {
    const evOrg = await loadOrgId(directus, 'project_events', payload.project_event_id, 'project.organization');
    if (evOrg === organizationId) {
      try {
        await directus.request(createItem('project_events_invoices' as any, {
          project_events_id: payload.project_event_id,
          invoices_id: created.id,
        }));
        linkedEventId = String(payload.project_event_id);
      } catch { /* fail-soft — invoice created, link skipped */ }
    }
  }

  const subtotal = line_items.reduce((s, l) => s + Number(l.amount || 0), 0);
  return {
    invoiceId: String(created.id),
    invoice_code: created.invoice_code ?? invoiceCode ?? null,
    lineCount: line_items.length,
    total: created.total_amount ?? subtotal,
    linkedEventId,
  };
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
  reschedule_project: rescheduleProjectExecutor,
  create_project: createProjectExecutor,
  add_event: addEventExecutor,
  create_ticket: createTicketExecutor,
  create_invoice: createInvoiceExecutor,
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
