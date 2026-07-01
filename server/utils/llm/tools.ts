// server/utils/llm/tools.ts
// Tool definitions passed to the Anthropic API when AI mutations are enabled.

import type { ToolDefinition } from './types';

export const RESCHEDULE_PROJECT_TOOL: ToolDefinition = {
  name: 'reschedule_project',
  description:
    'Shifts a project\'s start date (and deadline if present) forward or backward by a number of days, then cascades the same shift to all project events and tasks with due dates. Use this when the user asks to move, push, delay, or reschedule a project. Do NOT use for single-field edits — use update_field instead.',
  input_schema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'The Directus UUID of the project to reschedule.',
      },
      new_start_date: {
        type: 'string',
        description:
          'The new start date in YYYY-MM-DD format. Provide this OR delta_days — prefer this when the user names an explicit date.',
      },
      delta_days: {
        type: 'number',
        description:
          'Number of days to shift all dates. Positive = forward (later), negative = backward (earlier). Provide this OR new_start_date — prefer this when the user says "push back 2 weeks" etc.',
      },
      shift_events: {
        type: 'boolean',
        description: 'Whether to shift project events. Defaults to true.',
      },
      shift_tasks: {
        type: 'boolean',
        description: 'Whether to shift project tasks with due dates. Defaults to true.',
      },
    },
    required: ['project_id'],
  },
};

export const UPDATE_FIELD_TOOL: ToolDefinition = {
  name: 'update_field',
  description:
    'Updates a single field on any entity (project, ticket, task, invoice, lead, contact, etc.). Use for targeted edits like changing a status, title, description, priority, or any other text/enum field. For date cascades across a whole project use reschedule_project instead.',
  input_schema: {
    type: 'object',
    properties: {
      entity_type: {
        type: 'string',
        description:
          'The Directus collection name. E.g. "projects", "tickets", "tasks", "invoices", "leads", "contacts".',
      },
      entity_id: {
        type: 'string',
        description: 'The Directus UUID of the record to update.',
      },
      field: {
        type: 'string',
        description: 'The field name to update. E.g. "status", "title", "priority", "due_date", "description".',
      },
      value: {
        description: 'The new value. Can be a string, number, or boolean depending on the field.',
      },
    },
    required: ['entity_type', 'entity_id', 'field', 'value'],
  },
};

export const ADD_TASK_TOOL: ToolDefinition = {
  name: 'add_task',
  description:
    'Creates a new task linked to the current project, event, or ticket. Use when the user says "add a task", "create a task", or similar. Only pass project_id / event_id / ticket_id if the EXACT UUID appears in the context above — never invent a UUID. If the chat is focused on a project_event and no project_id is supplied, the server resolves it from the focused event automatically.',
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'The task title.',
      },
      project_id: {
        type: 'string',
        description: 'Optional project UUID. Pass ONLY a UUID that appears verbatim in the context (e.g. "Project ID:" line). If omitted and the chat is focused on a project_event, the server fills this in from the focused event.',
      },
      event_id: {
        type: 'string',
        description: 'Optional project_event UUID to attach the task to. If omitted and the chat is focused on a project_event, the server fills this in from the focused event.',
      },
      ticket_id: {
        type: 'string',
        description: 'Optional ticket UUID to link this task to (if on a ticket page).',
      },
      due_date: {
        type: 'string',
        description: 'Optional due date in YYYY-MM-DD format.',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'urgent'],
        description: 'Optional task priority.',
      },
      assignee_id: {
        type: 'string',
        description: 'Optional Directus user UUID to assign the task to.',
      },
    },
    required: ['title'],
  },
};

export const GENERATE_DOCUMENTS_TOOL: ToolDefinition = {
  name: 'generate_documents',
  description:
    'Generates a DRAFT proposal and/or contract from a plain-language overview of the project deliverables, and saves them in "draft" status for the user to review and edit. Use when the user asks to "draft a proposal", "write up a contract", "put together a proposal and contract for this", etc. The overview is whatever the user described (scope, deliverables, pricing if mentioned). Nothing is sent or signed — these are editable drafts. If the chat is focused on a lead, its id is used automatically to ground and link the documents; do not invent client details not present in the conversation.',
  input_schema: {
    type: 'object',
    properties: {
      overview: {
        type: 'string',
        description: 'Plain-language description of the project deliverables / scope to base the documents on. Summarize what the user described.',
      },
      targets: {
        type: 'array',
        items: { type: 'string', enum: ['proposal', 'contract'] },
        description: 'Which documents to generate. Defaults to both a proposal and a contract.',
      },
      lead_id: {
        type: 'string',
        description: 'Optional lead id to ground + link the documents. Pass ONLY an id present verbatim in the context; otherwise omit (the server uses the focused lead if any).',
      },
    },
    required: ['overview'],
  },
};

/** All mutation tools — passed to Anthropic when allow_ai_mutations is on */
export const MUTATION_TOOLS: ToolDefinition[] = [
  RESCHEDULE_PROJECT_TOOL,
  UPDATE_FIELD_TOOL,
  ADD_TASK_TOOL,
  GENERATE_DOCUMENTS_TOOL,
];
