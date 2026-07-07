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
    'Updates a single field on any entity — project, ticket, task, invoice, proposal, contract, lead, or contact. Use for targeted edits like changing a status, title, description, priority, due date, or amount. This is the EDIT path for projects, proposals, contracts, and invoices (e.g. "mark the proposal as sent", "change the project deadline", "set the invoice to paid", "rename this contract"). For date cascades across a whole project use reschedule_project instead; to add events or tasks use add_event / add_task.',
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

export const SEND_EMAIL_TOOL: ToolDefinition = {
  name: 'send_email',
  description:
    'PROPOSES sending an email to a client or contact. This does NOT send anything — it queues the email for the user to review and approve in the AI Activity queue. Use when the user asks you to "email", "send a note to", "follow up with", or "reach out to" someone. Compose a complete, ready-to-send email (subject + body). Provide either an explicit recipient address in `to`, or a `contact_id` that appears verbatim in the context to resolve the recipient. Always describe this as a proposal the user still needs to approve — never say the email was sent.',
  input_schema: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'Explicit recipient email address. Provide this OR contact_id.',
      },
      contact_id: {
        type: 'string',
        description: 'Directus contact id to resolve the recipient from. Pass ONLY an id present verbatim in the context; the server verifies it belongs to this org.',
      },
      subject: {
        type: 'string',
        description: 'The email subject line.',
      },
      heading: {
        type: 'string',
        description: 'Optional heading shown at the top of the email body. Defaults to the subject.',
      },
      body_html: {
        type: 'string',
        description: 'The email body as simple HTML (paragraphs, <strong>, <em>, links). No <html>/<head>/<body> wrapper — the server wraps it in the org-branded shell.',
      },
      cta_label: {
        type: 'string',
        description: 'Optional call-to-action button label. Requires cta_url.',
      },
      cta_url: {
        type: 'string',
        description: 'Optional call-to-action button URL (https). Requires cta_label.',
      },
      reply_to: {
        type: 'string',
        description: 'Optional reply-to address override.',
      },
    },
    required: ['subject', 'body_html'],
  },
};

// Reusable schema for a project event with optional nested tasks. Shared by
// create_project and add_event so the model composes a whole timeline at once.
const EVENT_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'The event / phase / milestone name.' },
    event_date: { type: 'string', description: 'Optional start date in YYYY-MM-DD format.' },
    end_date: { type: 'string', description: 'Optional end date in YYYY-MM-DD format.' },
    description: { type: 'string', description: 'Optional short description of the event.' },
    tasks: {
      type: 'array',
      description: 'Optional tasks to create under this event.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The task title.' },
          due_date: { type: 'string', description: 'Optional due date in YYYY-MM-DD format.' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Optional task priority.' },
        },
        required: ['title'],
      },
    },
  },
  required: ['title'],
} as const;

export const CREATE_PROJECT_TOOL: ToolDefinition = {
  name: 'create_project',
  description:
    'Creates a NEW project — optionally with a full timeline of events (phases/milestones), each with its own tasks, plus any project-level tasks. This is APPROVAL-GATED: it does NOT create anything immediately. It queues the whole project for the user to review and approve in the AI Activity queue; describe it as a proposal awaiting approval, never as done. Use when the user asks to "create/set up/spin up/start a project", especially "with phases/events and tasks". Only pass client_id if the EXACT client UUID appears verbatim in the context (e.g. a "Client ID:" line) — never invent one; if the chat is focused on a client, the server links it automatically.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'The project title.' },
      client_id: { type: 'string', description: 'Optional client UUID to link the project to. Pass ONLY a UUID present verbatim in the context; otherwise omit (the server uses the focused client if any).' },
      description: { type: 'string', description: 'Optional project description / brief.' },
      start_date: { type: 'string', description: 'Optional start date in YYYY-MM-DD format.' },
      due_date: { type: 'string', description: 'Optional deadline in YYYY-MM-DD format.' },
      events: {
        type: 'array',
        description: 'Optional ordered list of project events (phases/milestones), each optionally carrying its own tasks. The server links them sequentially.',
        items: EVENT_ITEM_SCHEMA,
      },
      tasks: {
        type: 'array',
        description: 'Optional project-level tasks not tied to a specific event.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'The task title.' },
            due_date: { type: 'string', description: 'Optional due date in YYYY-MM-DD format.' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Optional task priority.' },
          },
          required: ['title'],
        },
      },
    },
    required: ['title'],
  },
};

export const ADD_EVENT_TOOL: ToolDefinition = {
  name: 'add_event',
  description:
    'Adds one or more events (phases/milestones) — each optionally with its own tasks — to an EXISTING project. APPROVAL-GATED: it queues the additions for the user to approve in the AI Activity queue; nothing is created until approved. Use when the user asks to add a phase, milestone, or event to a project. Pass project_id ONLY if the UUID appears verbatim in the context; if the chat is focused on a project, the server uses it automatically.',
  input_schema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'The project UUID to add events to. Pass ONLY a UUID present verbatim in the context; omit to use the focused project.' },
      events: {
        type: 'array',
        description: 'The events to add, each optionally carrying its own tasks.',
        items: EVENT_ITEM_SCHEMA,
      },
    },
    required: ['events'],
  },
};

export const CREATE_INVOICE_TOOL: ToolDefinition = {
  name: 'create_invoice',
  description:
    'Creates a NEW invoice for a client, with line items. APPROVAL-GATED: it does NOT create anything immediately — it queues the invoice for the user to review and approve in the AI Activity queue; describe it as a proposal awaiting approval, never as issued/sent. Use when the user asks to "create/draft/bill/invoice" a client for work. The invoice code and totals are generated by the server on approval. Provide client_id ONLY if the exact UUID appears verbatim in the context; if the chat is focused on a client, the server uses it. Each line item needs a description and a rate; quantity defaults to 1.',
  input_schema: {
    type: 'object',
    properties: {
      client_id: { type: 'string', description: 'The client UUID to bill. Pass ONLY a UUID present verbatim in the context; omit to use the focused client. Required if the chat is not focused on a client.' },
      invoice_date: { type: 'string', description: 'Optional invoice date in YYYY-MM-DD format. Defaults to today.' },
      due_date: { type: 'string', description: 'Optional due date in YYYY-MM-DD format. Defaults to 30 days after the invoice date.' },
      line_items: {
        type: 'array',
        description: 'The billable line items.',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'What is being billed.' },
            quantity: { type: 'number', description: 'Optional quantity (hours/units). Defaults to 1.' },
            rate: { type: 'number', description: 'Unit price / hourly rate in dollars.' },
            product: { type: 'string', description: 'Optional product/service name to match to an existing product; otherwise a default service product is used.' },
          },
          required: ['description', 'rate'],
        },
      },
    },
    required: ['line_items'],
  },
};

/** All mutation tools — passed to Anthropic when allow_ai_mutations is on */
export const MUTATION_TOOLS: ToolDefinition[] = [
  RESCHEDULE_PROJECT_TOOL,
  UPDATE_FIELD_TOOL,
  ADD_TASK_TOOL,
  CREATE_PROJECT_TOOL,
  ADD_EVENT_TOOL,
  CREATE_INVOICE_TOOL,
  GENERATE_DOCUMENTS_TOOL,
  SEND_EMAIL_TOOL,
];
