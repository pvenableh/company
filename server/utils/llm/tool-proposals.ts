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
export const PROPOSAL_TOOLS = new Set<string>(['send_email', 'create_project', 'add_event', 'create_invoice', 'create_ticket', 'create_content_plan', 'draft_social_posts', 'create_campaign', 'book_meeting', 'reschedule_meeting', 'cancel_meeting']);

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
      const title = softenTitleCase((t?.title ?? '').toString());
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
    case 'draft_social_posts':
      return await proposeDraftSocialPosts(input, ctx);
    case 'create_campaign':
      return await proposeCreateCampaign(input, ctx);
    case 'book_meeting':
      return await proposeBookMeeting(input, ctx);
    case 'reschedule_meeting':
      return await proposeRescheduleMeeting(input, ctx);
    case 'cancel_meeting':
      return await proposeCancelMeeting(input, ctx);
    default:
      return { success: false, summary: '', error: `Unknown proposal tool: ${toolName}` };
  }
}

// ── book_meeting / reschedule_meeting / cancel_meeting ───────────────────────
// Approval-gated scheduling. On approval the executors call finalizeBooking (for
// a new booking) or update the video_meetings + linked appointment rows.

function fmtWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

async function proposeBookMeeting(
  input: Record<string, any>,
  ctx: ProposalContext,
): Promise<ToolHandlerResult> {
  const start = new Date(input.scheduled_start);
  if (Number.isNaN(start.getTime())) return { success: false, summary: '', error: 'book_meeting needs a valid scheduled_start (ISO timestamp)' };
  const duration = Number(input.duration_minutes) > 0 ? Math.round(Number(input.duration_minutes)) : 30;

  let email = (input.invitee_email ?? '').toString().trim();
  let name = input.invitee_name ? String(input.invitee_name) : null;

  const contactId = input.contact_id ?? ((ctx.entityType === 'contact' || ctx.entityType === 'contacts') ? ctx.entityId : null);
  if (!email && contactId) {
    const directus = getTypedDirectus();
    const c = (await directus.request(
      readItem('contacts' as any, contactId, { fields: ['id', 'email', 'first_name', 'last_name', 'name', 'organizations.organizations_id'] as any }),
    ).catch(() => null)) as any;
    if (c) {
      // Org-scope the contact so a stray id can't book across tenants.
      const orgs = (c.organizations || []).map((o: any) => (typeof o.organizations_id === 'object' ? o.organizations_id?.id : o.organizations_id));
      if (ctx.organizationId && orgs.length && !orgs.includes(ctx.organizationId)) {
        return { success: false, summary: '', error: 'That contact belongs to another organization.' };
      }
      email = (c.email || '').trim();
      name = name || [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.name || null;
    }
  }

  if (!email) return { success: false, summary: '', error: 'book_meeting needs an invitee — provide invitee_email, or a contact_id / focus a contact with an email on file.' };

  const payload: Record<string, any> = {
    hostUserId: ctx.userId,
    scheduledStart: start.toISOString(),
    durationMinutes: duration,
    inviteeName: name,
    inviteeEmail: email,
    title: input.title ? String(input.title) : null,
    bookingNotes: input.notes ? String(input.notes) : null,
  };

  const who = name || email;
  const rowTitle = `Book ${duration}-min meeting with ${who} — ${fmtWhen(start.toISOString())}`;
  const preview = { kind: 'book_meeting' as const, start: start.toISOString(), duration, invitee: who, inviteeEmail: email, title: payload.title };

  const actionId = await logAiAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    actionType: 'book_meeting',
    status: 'pending',
    title: rowTitle,
    payload,
    preview,
    entityType: ctx.entityType ?? null,
    entityId: ctx.entityId ?? null,
    sessionId: ctx.sessionId ?? null,
  });
  if (actionId == null) return { success: false, summary: '', error: 'Could not queue the booking for approval. Please try again.' };

  return {
    success: true,
    summary: `Proposed: ${rowTitle}. It's waiting in your AI Activity queue for approval — nothing has been booked and no invite has gone out yet.`,
    data: { actionId, proposed: true, status: 'pending' },
  };
}

/** Fetch + org/host-verify a video_meetings row the current user may act on. */
async function loadOwnedMeeting(meetingId: string, ctx: ProposalContext): Promise<{ id: string; scheduled_start?: string; scheduled_end?: string; duration_minutes?: number; title?: string; related_appointment?: string } | null> {
  const directus = getTypedDirectus();
  const m = (await directus.request(
    readItem('video_meetings' as any, meetingId, { fields: ['id', 'host_user', 'scheduled_start', 'scheduled_end', 'duration_minutes', 'title', 'related_appointment'] as any }),
  ).catch(() => null)) as any;
  if (!m) return null;
  const host = typeof m.host_user === 'object' ? m.host_user?.id : m.host_user;
  if (host !== ctx.userId) return null; // v1: only the host may reschedule/cancel via AI
  return m;
}

async function proposeRescheduleMeeting(
  input: Record<string, any>,
  ctx: ProposalContext,
): Promise<ToolHandlerResult> {
  const meetingId = input.meeting_id ?? (ctx.entityType === 'video_meeting' || ctx.entityType === 'video_meetings' ? ctx.entityId : null);
  if (!meetingId) return { success: false, summary: '', error: 'reschedule_meeting needs a meeting_id (or focus the chat on a meeting).' };
  const start = new Date(input.new_start);
  if (Number.isNaN(start.getTime())) return { success: false, summary: '', error: 'reschedule_meeting needs a valid new_start (ISO timestamp).' };

  const meeting = await loadOwnedMeeting(String(meetingId), ctx);
  if (!meeting) return { success: false, summary: '', error: 'Meeting not found, or you are not its host.' };

  const duration = Number(input.duration_minutes) > 0
    ? Math.round(Number(input.duration_minutes))
    : (Number(meeting.duration_minutes) || 30);

  const payload = { meeting_id: String(meetingId), new_start: start.toISOString(), duration_minutes: duration };
  const rowTitle = `Reschedule "${meeting.title || 'meeting'}" → ${fmtWhen(start.toISOString())}`;
  const preview = { kind: 'reschedule_meeting' as const, from: meeting.scheduled_start ?? null, to: start.toISOString(), duration };

  const actionId = await logAiAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    actionType: 'reschedule_meeting',
    status: 'pending',
    title: rowTitle,
    payload,
    preview,
    entityType: 'video_meetings',
    entityId: String(meetingId),
    sessionId: ctx.sessionId ?? null,
  });
  if (actionId == null) return { success: false, summary: '', error: 'Could not queue the reschedule for approval.' };

  return {
    success: true,
    summary: `Proposed: ${rowTitle}. Waiting in your AI Activity queue for approval — the meeting hasn't moved yet.`,
    data: { actionId, proposed: true, status: 'pending' },
  };
}

async function proposeCancelMeeting(
  input: Record<string, any>,
  ctx: ProposalContext,
): Promise<ToolHandlerResult> {
  const meetingId = input.meeting_id ?? (ctx.entityType === 'video_meeting' || ctx.entityType === 'video_meetings' ? ctx.entityId : null);
  if (!meetingId) return { success: false, summary: '', error: 'cancel_meeting needs a meeting_id (or focus the chat on a meeting).' };

  const meeting = await loadOwnedMeeting(String(meetingId), ctx);
  if (!meeting) return { success: false, summary: '', error: 'Meeting not found, or you are not its host.' };

  const payload = { meeting_id: String(meetingId), reason: input.reason ? String(input.reason) : null };
  const rowTitle = `Cancel "${meeting.title || 'meeting'}"${meeting.scheduled_start ? ` (${fmtWhen(meeting.scheduled_start)})` : ''}`;
  const preview = { kind: 'cancel_meeting' as const, title: meeting.title ?? null, when: meeting.scheduled_start ?? null, reason: payload.reason };

  const actionId = await logAiAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    actionType: 'cancel_meeting',
    status: 'pending',
    title: rowTitle,
    payload,
    preview,
    entityType: 'video_meetings',
    entityId: String(meetingId),
    sessionId: ctx.sessionId ?? null,
  });
  if (actionId == null) return { success: false, summary: '', error: 'Could not queue the cancellation for approval.' };

  return {
    success: true,
    summary: `Proposed: ${rowTitle}. Waiting in your AI Activity queue for approval — the meeting is still on until you approve.`,
    data: { actionId, proposed: true, status: 'pending' },
  };
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

// ── draft_social_posts ────────────────────────────────────────────────────────
// Approval-gated + DRAFT-ONLY: a batch of social posts. On approval the executor
// writes each as a social_posts row in status:'draft' / approval_state:'draft' —
// NEVER scheduled or published, so the social publishing kill-switch is moot
// (it only governs the external publish path). entity_type/id point at the client
// (if linked) so the drafts surface on that client's activity.
async function proposeDraftSocialPosts(
  input: Record<string, any>,
  ctx: ProposalContext,
): Promise<ToolHandlerResult> {
  const isClientFocus = ctx.entityType === 'client' || ctx.entityType === 'clients';
  const isProjectFocus = ctx.entityType === 'project' || ctx.entityType === 'projects';
  const clientId = input.client_id ?? (isClientFocus ? ctx.entityId : null);
  const projectId = input.project_id ?? (isProjectFocus ? ctx.entityId : null);
  const contentPlanId = input.content_plan_id != null && Number.isFinite(Number(input.content_plan_id))
    ? Number(input.content_plan_id)
    : null;

  const KNOWN_PLATFORMS = ['instagram', 'tiktok', 'linkedin', 'facebook', 'threads'];
  const KNOWN_POST_TYPES = ['image', 'video', 'carousel', 'reel', 'story', 'text', 'article'];

  const posts = (Array.isArray(input.posts) ? input.posts : [])
    .map((p: any) => {
      const caption = (p?.caption ?? '').toString().trim();
      if (!caption) return null;
      const platforms = (Array.isArray(p?.platforms) ? p.platforms : [])
        .map((x: any) => String(x).trim().toLowerCase())
        .filter((x: string) => KNOWN_PLATFORMS.includes(x));
      return {
        caption,
        platforms: platforms.length ? platforms : ['instagram'],
        post_type: KNOWN_POST_TYPES.includes(p?.post_type) ? String(p.post_type) : 'image',
        cta_url: p?.cta_url ? String(p.cta_url) : null,
        cta_label: p?.cta_label ? String(p.cta_label) : null,
      };
    })
    .filter(Boolean);

  if (!posts.length) return { success: false, summary: '', error: 'No valid posts to draft — each post needs a caption.' };

  const payload: Record<string, any> = {
    posts,
    client_id: clientId ?? null,
    project_id: projectId ?? null,
    content_plan_id: contentPlanId,
  };

  const rowTitle = `Draft ${posts.length} social post${posts.length !== 1 ? 's' : ''}`;
  const preview = {
    kind: 'draft_social_posts' as const,
    count: posts.length,
    posts: posts.map((p: any) => ({
      caption: p.caption.length > 140 ? `${p.caption.slice(0, 140)}…` : p.caption,
      platforms: p.platforms,
      post_type: p.post_type,
    })),
  };

  const actionId = await logAiAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    actionType: 'draft_social_posts',
    status: 'pending',
    title: rowTitle,
    payload,
    preview,
    entityType: clientId ? 'clients' : (projectId ? 'projects' : 'social_posts'),
    entityId: clientId ?? projectId ?? null,
    sessionId: ctx.sessionId ?? null,
  });
  if (actionId == null) return { success: false, summary: '', error: 'Could not queue the drafts for approval. Please try again.' };

  return {
    success: true,
    summary: `Proposed: ${rowTitle}. They're waiting in your AI Activity queue for approval — nothing has been drafted, scheduled, or posted yet.`,
    data: { actionId, proposed: true, status: 'pending' },
  };
}

// ── create_campaign ───────────────────────────────────────────────────────────
// Approval-gated: a DRAFT marketing_campaigns row. Mirrors the write in
// server/api/marketing/campaigns/index.post.ts (marketing_campaigns has no
// row-level perms → the executor writes with the admin client). status:'draft',
// type:'campaign', org-set. Nothing is launched or sent.
async function proposeCreateCampaign(
  input: Record<string, any>,
  ctx: ProposalContext,
): Promise<ToolHandlerResult> {
  const title = (input.title ?? '').toString().trim();
  if (!title) return { success: false, summary: '', error: 'A campaign needs a title.' };

  const payload: Record<string, any> = {
    title,
    goal: input.goal ? String(input.goal) : null,
    start_date: input.start_date ? String(input.start_date) : null,
    end_date: input.end_date ? String(input.end_date) : null,
  };

  const rowTitle = `Create campaign "${title}"`;
  const preview = {
    kind: 'create_campaign' as const,
    title,
    goal: payload.goal,
    start_date: payload.start_date,
    end_date: payload.end_date,
  };

  const actionId = await logAiAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    actionType: 'create_campaign',
    status: 'pending',
    title: rowTitle,
    payload,
    preview,
    entityType: 'marketing_campaigns',
    entityId: null,
    sessionId: ctx.sessionId ?? null,
  });
  if (actionId == null) return { success: false, summary: '', error: 'Could not queue the campaign for approval. Please try again.' };

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

// Defensive: most models write proper sentence-case titles, but if one SHOUTS
// (a mostly-uppercase title), soften it back to sentence case so tasks read as
// descriptions, not headlines. Mixed-case input is left untouched.
function softenTitleCase(s: string): string {
  const t = s.trim();
  const letters = t.replace(/[^a-z]/gi, '');
  const uppers = t.replace(/[^A-Z]/g, '');
  if (letters.length > 3 && uppers.length / letters.length > 0.7) {
    return t.toLowerCase().replace(/^(\s*[a-z])/, (m) => m.toUpperCase());
  }
  return t;
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
      const title = softenTitleCase((t?.title ?? '').toString());
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
