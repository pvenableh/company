// server/utils/llm/tool-handlers.ts
// Executes AI tool calls server-side with org-scoped Directus mutations.

import { readItem, readItems, updateItem, createItem } from '@directus/sdk';
import { getServerDirectus } from '~~/server/utils/directus';

interface ToolHandlerContext {
  organizationId: string;
  userId: string;
  entityType?: string;
  entityId?: string;
}

export interface ToolHandlerResult {
  success: boolean;
  summary: string;
  data?: Record<string, any>;
  error?: string;
}

// ─── reschedule_project ──────────────────────────────────────────────────────

async function handleRescheduleProject(
  input: Record<string, any>,
  ctx: ToolHandlerContext,
): Promise<ToolHandlerResult> {
  const { project_id, new_start_date, delta_days, shift_events = true, shift_tasks = true } = input;

  if (!project_id) return { success: false, summary: '', error: 'project_id is required' };
  if (new_start_date == null && delta_days == null) {
    return { success: false, summary: '', error: 'Provide new_start_date or delta_days' };
  }

  const directus = getServerDirectus();

  // Fetch the project (verify it belongs to this org)
  const project = await directus.request(
    readItem('projects', project_id, {
      fields: ['id', 'title', 'start_date', 'due_date', 'organization'],
    }),
  ) as any;

  if (!project || project.organization !== ctx.organizationId) {
    return { success: false, summary: '', error: 'Project not found or access denied' };
  }

  // Compute delta
  let delta: number;
  if (delta_days != null) {
    delta = Math.round(Number(delta_days));
  } else {
    if (!project.start_date) {
      return { success: false, summary: '', error: 'Project has no start_date — cannot compute delta. Use delta_days instead.' };
    }
    const oldStart = new Date(project.start_date).getTime();
    const newStart = new Date(new_start_date).getTime();
    delta = Math.round((newStart - oldStart) / (1000 * 60 * 60 * 24));
  }

  if (delta === 0) {
    return { success: true, summary: 'No date change needed — dates are already correct.', data: {} };
  }

  const shiftDate = (dateStr: string | null | undefined): string | null => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    d.setDate(d.getDate() + delta);
    return d.toISOString().split('T')[0];
  };

  // 1. Update project dates
  const projectUpdate: Record<string, any> = {};
  if (project.start_date) projectUpdate.start_date = shiftDate(project.start_date);
  if (project.due_date) projectUpdate.due_date = shiftDate(project.due_date);
  await directus.request(updateItem('projects', project_id, projectUpdate));

  let eventsShifted = 0;
  let tasksShifted = 0;

  // 2. Shift project events
  if (shift_events) {
    const events = await directus.request(
      readItems('project_events', {
        filter: { project: { _eq: project_id } },
        fields: ['id', 'event_date', 'end_date'],
        limit: 200,
      }),
    ) as any[];

    for (const ev of events) {
      const evUpdate: Record<string, any> = {};
      if (ev.event_date) evUpdate.event_date = shiftDate(ev.event_date);
      if (ev.end_date) evUpdate.end_date = shiftDate(ev.end_date);
      if (Object.keys(evUpdate).length > 0) {
        await directus.request(updateItem('project_events', ev.id, evUpdate));
        eventsShifted++;
      }
    }
  }

  // 3. Shift tasks with due dates that belong to this project
  if (shift_tasks) {
    const tasks = await directus.request(
      readItems('tasks', {
        filter: {
          _and: [
            { project_id: { _eq: project_id } },
            { due_date: { _nnull: true } },
          ],
        },
        fields: ['id', 'due_date'],
        limit: 500,
      }),
    ) as any[];

    for (const task of tasks) {
      if (task.due_date) {
        await directus.request(
          updateItem('tasks', task.id, { due_date: shiftDate(task.due_date) }),
        );
        tasksShifted++;
      }
    }
  }

  const direction = delta > 0 ? 'forward' : 'back';
  const absDelta = Math.abs(delta);
  const parts: string[] = [`Shifted project "${project.title}" ${direction} by ${absDelta} day${absDelta !== 1 ? 's' : ''}.`];
  if (projectUpdate.start_date) parts.push(`New start: ${projectUpdate.start_date}.`);
  if (projectUpdate.due_date) parts.push(`New deadline: ${projectUpdate.due_date}.`);
  if (eventsShifted > 0) parts.push(`${eventsShifted} event${eventsShifted !== 1 ? 's' : ''} updated.`);
  if (tasksShifted > 0) parts.push(`${tasksShifted} task${tasksShifted !== 1 ? 's' : ''} updated.`);

  return {
    success: true,
    summary: parts.join(' '),
    data: { delta, eventsShifted, tasksShifted, newStartDate: projectUpdate.start_date, newDueDate: projectUpdate.due_date },
  };
}

// ─── update_field ────────────────────────────────────────────────────────────

// Collections that are scoped to an organization — we verify ownership before mutating.
// Value is a dotted field path that resolves to the org id. project_events
// has no direct organization column; we walk the parent project.
const ORG_SCOPED_COLLECTIONS: Record<string, string> = {
  projects: 'organization',
  tickets: 'organization',
  tasks: 'organization_id',
  invoices: 'organization',
  leads: 'organization',
  contacts: 'organization',
  project_events: 'project.organization',
};

function getNested(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

// Fields that are never allowed to be set via AI (security boundary)
const BLOCKED_FIELDS = new Set(['organization', 'user_created', 'user_updated', 'date_created', 'date_updated', 'id']);

async function handleUpdateField(
  input: Record<string, any>,
  ctx: ToolHandlerContext,
): Promise<ToolHandlerResult> {
  const { entity_type, entity_id, field, value } = input;

  if (!entity_type || !entity_id || !field || value === undefined) {
    return { success: false, summary: '', error: 'entity_type, entity_id, field, and value are all required' };
  }

  if (BLOCKED_FIELDS.has(field)) {
    return { success: false, summary: '', error: `Field "${field}" cannot be updated via AI` };
  }

  const directus = getServerDirectus();

  // Verify org ownership for scoped collections
  const orgField = ORG_SCOPED_COLLECTIONS[entity_type];
  if (orgField) {
    const record = await directus.request(
      readItem(entity_type as any, entity_id, { fields: ['id', orgField] }),
    ) as any;
    const orgId = getNested(record, orgField);
    if (!record || orgId !== ctx.organizationId) {
      return { success: false, summary: '', error: 'Record not found or access denied' };
    }
  }

  await directus.request(updateItem(entity_type as any, entity_id, { [field]: value }));

  return {
    success: true,
    summary: `Updated ${entity_type} field "${field}" to "${value}".`,
    data: { entity_type, entity_id, field, value },
  };
}

// ─── add_task ────────────────────────────────────────────────────────────────

async function handleAddTask(
  input: Record<string, any>,
  ctx: ToolHandlerContext,
): Promise<ToolHandlerResult> {
  const { title, ticket_id, due_date, priority, assignee_id } = input;
  let { project_id, event_id } = input as { project_id?: string; event_id?: string };

  if (!title) return { success: false, summary: '', error: 'title is required' };

  const directus = getServerDirectus();

  // Resolve project/event from focused entity so the model doesn't have to
  // invent UUIDs. On a project page (entityType='project'), attach to that
  // project. On a project_event page, attach to both the event and its project.
  if (!project_id && !ticket_id && ctx.entityType === 'project_event' && ctx.entityId) {
    const ev = await directus.request(
      readItem('project_events', ctx.entityId, { fields: ['id', 'project.id', 'project.organization'] }),
    ).catch(() => null) as any;
    const evOrgId = ev?.project?.organization;
    if (ev?.project?.id && evOrgId === ctx.organizationId) {
      project_id = ev.project.id;
      if (!event_id) event_id = ev.id;
    }
  }
  if (!project_id && !ticket_id && ctx.entityType === 'project' && ctx.entityId) {
    const proj = await directus.request(
      readItem('projects', ctx.entityId, { fields: ['id', 'organization'] }),
    ).catch(() => null) as any;
    if (proj?.id && proj.organization === ctx.organizationId) {
      project_id = proj.id;
    }
  }

  // If the model supplied a project_id, verify it actually belongs to this org
  // — otherwise the FK error from Directus is opaque and we can't tell whether
  // the model hallucinated.
  if (project_id) {
    const proj = await directus.request(
      readItem('projects', project_id, { fields: ['id', 'organization'] }),
    ).catch(() => null) as any;
    if (!proj || proj.organization !== ctx.organizationId) {
      return { success: false, summary: '', error: 'Provided project_id is invalid for this organization' };
    }
  }

  // Pick a category for Quick Task scoping. Order matters — the most specific
  // link wins so the task surfaces in the right widget.
  let category: 'quick' | 'ticket' | 'project' | 'event' = 'quick';
  if (ticket_id) category = 'ticket';
  else if (event_id) category = 'event';
  else if (project_id) category = 'project';

  const payload: Record<string, any> = {
    title,
    user_created: ctx.userId,
    organization_id: ctx.organizationId,
    status: 'new',
    schedule: 'today',
    category,
  };

  if (project_id) payload.project_id = project_id;
  if (event_id) payload.project_event_id = event_id;
  if (ticket_id) payload.ticket_id = ticket_id;
  if (due_date) payload.due_date = due_date;
  if (priority) payload.priority = priority;
  if (assignee_id) {
    payload.assigned_to = [{ directus_users_id: assignee_id }];
  }

  const created = await directus.request(
    createItem('tasks', payload, { fields: ['id', 'title'] }),
  ) as any;

  return {
    success: true,
    summary: `Created task "${title}"${due_date ? ` due ${due_date}` : ''}.`,
    data: { id: created.id, title: created.title, project_id, event_id, ticket_id },
  };
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export async function executeToolCall(
  toolName: string,
  toolInput: Record<string, any>,
  ctx: ToolHandlerContext,
): Promise<ToolHandlerResult> {
  try {
    switch (toolName) {
      case 'reschedule_project':
        return await handleRescheduleProject(toolInput, ctx);
      case 'update_field':
        return await handleUpdateField(toolInput, ctx);
      case 'add_task':
        return await handleAddTask(toolInput, ctx);
      default:
        return { success: false, summary: '', error: `Unknown tool: ${toolName}` };
    }
  } catch (err: any) {
    console.error(`[tool-handlers] ${toolName} failed:`, err.message);
    return { success: false, summary: '', error: err.message || 'Tool execution failed' };
  }
}
