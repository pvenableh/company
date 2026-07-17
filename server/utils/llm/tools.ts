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
    'Generates a DRAFT proposal and/or contract from a plain-language overview of the project deliverables, and saves them in "draft" status for the user to review and edit. Use when the user asks to "draft a proposal", "write up a contract", "put together a proposal and contract for this", or "turn this proposal into a contract". The overview is whatever the user described (scope, deliverables, pricing if mentioned). Nothing is sent or signed — these are editable drafts. If the chat is focused on a lead, its id grounds + links the documents. If the chat is focused on a PROPOSAL (turning it into a contract), pass targets:["contract"] and base the overview on that proposal\'s scope + pricing — the server links it to the proposal\'s lead automatically. Do not invent client details not present in the conversation.',
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
    payment_amount: { type: 'number', description: 'Optional payment due at this event, in dollars. If set, the event becomes a Financial payment milestone that can later be billed as an invoice. Use for deposit / progress / final-payment milestones.' },
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
    'Creates a NEW invoice for a client, with line items. APPROVAL-GATED: it does NOT create anything immediately — it queues the invoice for the user to review and approve in the AI Activity queue; describe it as a proposal awaiting approval, never as issued/sent. Use when the user asks to "create/draft/bill/invoice" a client, "invoice from this contract", or "bill this milestone". The invoice code and totals are generated by the server on approval.\n\nTo BILL FROM A CONTRACT: pass from_contract_id (or just focus the chat on a contract) — the server pulls the contract\'s client and amount; you can omit line_items and they\'ll be seeded from the contract. To BILL A PROJECT MILESTONE: pass project_event_id (or focus on the milestone event) — the server pulls the project\'s client and the milestone\'s payment amount, and links the invoice to that event. To BILL FROM A PROJECT: pass project_id (or just focus the chat on a project) — the server pulls the project\'s client; you still provide line_items. Otherwise provide client_id (or focus on a client) and line_items (each needs a description + rate; quantity defaults to 1).',
  input_schema: {
    type: 'object',
    properties: {
      client_id: { type: 'string', description: 'The client UUID to bill. Pass ONLY a UUID present verbatim in the context; omit to use the focused client, contract, milestone, or project.' },
      from_contract_id: { type: 'string', description: 'Optional contract UUID to bill from — the server pulls its client + total value. Pass ONLY a UUID present verbatim; omit to use the focused contract.' },
      project_event_id: { type: 'string', description: 'Optional project_event (payment milestone) UUID — the server pulls the project client + milestone amount and links the invoice to the event. Pass ONLY a UUID present verbatim; omit to use the focused milestone event.' },
      project_id: { type: 'string', description: 'Optional project UUID to bill from — the server pulls the project\'s client. Pass ONLY a UUID present verbatim; omit to use the focused project. Still requires line_items.' },
      invoice_date: { type: 'string', description: 'Optional invoice date in YYYY-MM-DD format. Defaults to today.' },
      due_date: { type: 'string', description: 'Optional due date in YYYY-MM-DD format. Defaults to 30 days after the invoice date.' },
      line_items: {
        type: 'array',
        description: 'The billable line items. Optional when billing from a contract or milestone (seeded from the source).',
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
    required: [],
  },
};

export const CREATE_TICKET_TOOL: ToolDefinition = {
  name: 'create_ticket',
  description:
    'Creates a support/work TICKET for a client or project, optionally with a checklist of tasks. APPROVAL-GATED: it queues the ticket for the user to review and approve; nothing is created until approved. Use when the user asks to "open a ticket", "log a request/issue", or "create a ticket with these tasks". Pass client_id/project_id ONLY if the exact UUID appears verbatim in the context; if the chat is focused on a client or project, the server links it automatically.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'The ticket title / summary.' },
      client_id: { type: 'string', description: 'Optional client UUID. Pass ONLY a UUID present verbatim in the context; omit to use the focused client.' },
      project_id: { type: 'string', description: 'Optional project UUID. Pass ONLY a UUID present verbatim in the context; omit to use the focused project.' },
      description: { type: 'string', description: 'Optional details / scope of the ticket.' },
      priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Optional ticket priority.' },
      tasks: {
        type: 'array',
        description: 'Optional tasks (checklist) to create under this ticket.',
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

export const CREATE_CONTENT_PLAN_TOOL: ToolDefinition = {
  name: 'create_content_plan',
  description:
    'Creates a DRAFT content plan — the container that groups a month (or a campaign/launch) of social posts around an objective, themes, and a strategy. APPROVAL-GATED: it does NOT create anything immediately; it queues the plan for the user to review and approve in the AI Activity queue. Describe it as a proposal awaiting approval, never as published or live. Use when the user asks to "put together a content plan", "plan next month\'s content", "draft a social strategy for this client", or "spin up a launch plan". Only pass client_id / project_id if the EXACT UUID appears verbatim in the context — never invent one; if the chat is focused on a client or project, the server links it automatically. Nothing is scheduled or posted — this is an editable draft.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'The plan title (e.g. "March 2026 — Awareness Push"). If omitted, a sensible default is used.' },
      objective: { type: 'string', description: 'Optional one-line goal for the plan (what it should achieve).' },
      strategy: { type: 'string', description: 'Optional short strategy / approach paragraph.' },
      themes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of content themes / pillars for the plan.',
      },
      plan_type: {
        type: 'string',
        enum: ['monthly_cadence', 'campaign', 'launch', 'custom'],
        description: 'Optional plan type. Defaults to monthly_cadence.',
      },
      target_month: { type: 'string', description: 'Optional target month as the first day in YYYY-MM-DD format (e.g. 2026-03-01).' },
      client_id: { type: 'string', description: 'Optional client UUID to target the plan at. Pass ONLY a UUID present verbatim in the context; omit to use the focused client.' },
      project_id: { type: 'string', description: 'Optional project UUID to attach the plan to. Pass ONLY a UUID present verbatim in the context; omit to use the focused project.' },
    },
    required: [],
  },
};

export const DRAFT_SOCIAL_POSTS_TOOL: ToolDefinition = {
  name: 'draft_social_posts',
  description:
    'Drafts one or more social media posts as DRAFTS. APPROVAL-GATED and DRAFT-ONLY: it does NOT publish or schedule anything; it queues the drafts for the user to review, edit, and approve in the AI Activity queue, after which they land as editable drafts in Studio (never live). Describe the result as proposed drafts awaiting review, never as posted, scheduled, or published. Use when the user asks to "draft a few posts", "write this week\'s captions", "draft social content for this launch", or "give me some post ideas for Instagram". Write real, on-brand captions — do not use placeholder text. Only pass client_id / project_id / content_plan_id if the EXACT id appears verbatim in the context — never invent one; if the chat is focused on a client or project, the server links it automatically. Nothing is ever posted or scheduled from here.',
  input_schema: {
    type: 'object',
    properties: {
      posts: {
        type: 'array',
        description: 'The posts to draft. Each is a distinct draft post.',
        items: {
          type: 'object',
          properties: {
            caption: { type: 'string', description: 'The post caption / copy. Required. Write a real, publish-ready caption.' },
            platforms: {
              type: 'array',
              items: { type: 'string', enum: ['instagram', 'tiktok', 'linkedin', 'facebook', 'threads'] },
              description: 'Which platforms this draft targets. Defaults to instagram if omitted.',
            },
            post_type: {
              type: 'string',
              enum: ['image', 'video', 'carousel', 'reel', 'story', 'text', 'article'],
              description: 'Optional post format. Defaults to image.',
            },
            cta_url: { type: 'string', description: 'Optional call-to-action URL.' },
            cta_label: { type: 'string', description: 'Optional call-to-action label (e.g. "Book now").' },
          },
          required: ['caption'],
        },
      },
      client_id: { type: 'string', description: 'Optional client UUID to attach the drafts to. Pass ONLY a UUID present verbatim in the context; omit to use the focused client.' },
      project_id: { type: 'string', description: 'Optional project UUID to attach the drafts to. Pass ONLY a UUID present verbatim in the context; omit to use the focused project.' },
      content_plan_id: { type: 'number', description: 'Optional content_plan id (number) to file the drafts under. Pass ONLY an id present verbatim in the context.' },
    },
    required: ['posts'],
  },
};

export const CREATE_CAMPAIGN_TOOL: ToolDefinition = {
  name: 'create_campaign',
  description:
    'Creates a DRAFT marketing campaign — a container for a coordinated marketing effort with a goal and an optional plan. APPROVAL-GATED: it does NOT create anything immediately; it queues the campaign for the user to review and approve in the AI Activity queue. Describe it as a proposal awaiting approval, never as launched or live. Use when the user asks to "spin up a campaign", "start a marketing campaign for this launch", or "set up a campaign to promote X". Nothing is sent or launched — this is an editable draft campaign.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'The campaign title (e.g. "Spring Launch Push"). Required.' },
      goal: { type: 'string', description: 'Optional one-line goal / objective for the campaign.' },
      start_date: { type: 'string', description: 'Optional start date in YYYY-MM-DD format.' },
      end_date: { type: 'string', description: 'Optional end date in YYYY-MM-DD format.' },
    },
    required: ['title'],
  },
};

export const FIND_A_TIME_TOOL: ToolDefinition = {
  name: 'find_a_time',
  description:
    'Finds open time slots on the CURRENT USER\'s calendar, honoring their availability, buffers, minimum notice, and their connected Google/Outlook calendars (real free/busy). READ-ONLY — this suggests times, it does not book anything. Use when the user asks "when am I free", "find a time", "what times are open next week", or as the first step before book_meeting. Returns a short list of open start times you can offer.',
  input_schema: {
    type: 'object',
    properties: {
      duration_minutes: { type: 'number', description: 'Meeting length in minutes. Defaults to 30.' },
      from: { type: 'string', description: 'Optional start of the search window (YYYY-MM-DD or ISO). Defaults to now.' },
      to: { type: 'string', description: 'Optional end of the search window (YYYY-MM-DD or ISO). Defaults to the booking horizon.' },
    },
    required: [],
  },
};

export const BOOK_MEETING_TOOL: ToolDefinition = {
  name: 'book_meeting',
  description:
    'PROPOSES booking a meeting on the current user\'s calendar with an external invitee (a client/contact). This does NOT book anything — it queues the booking for the user to approve in the AI Activity queue; on approval it creates the meeting, provisions the video room, and emails the invitee. Use when the user asks to "book", "schedule", or "set up a meeting/call with" someone at a specific time. Provide scheduled_start (ISO). Provide the invitee via invitee_email, or a contact_id present verbatim in the context (or focus the chat on a contact/lead/client). Always describe this as a proposal awaiting approval — never say the meeting was booked.',
  input_schema: {
    type: 'object',
    properties: {
      scheduled_start: { type: 'string', description: 'Meeting start as an ISO timestamp (e.g. 2026-07-20T14:00:00Z). Get an open time from find_a_time first when unsure.' },
      duration_minutes: { type: 'number', description: 'Meeting length in minutes. Defaults to 30.' },
      title: { type: 'string', description: 'Optional meeting title.' },
      invitee_email: { type: 'string', description: 'The external invitee\'s email. Provide this OR contact_id.' },
      invitee_name: { type: 'string', description: 'Optional invitee display name.' },
      contact_id: { type: 'string', description: 'Directus contact id to resolve the invitee email/name from. Pass ONLY an id present verbatim in the context; omit to use the focused contact/lead/client.' },
      notes: { type: 'string', description: 'Optional notes/agenda for the meeting.' },
    },
    required: ['scheduled_start'],
  },
};

export const RESCHEDULE_MEETING_TOOL: ToolDefinition = {
  name: 'reschedule_meeting',
  description:
    'PROPOSES moving an existing meeting to a new time. Queues the change for approval; nothing moves until approved. Use when the user asks to "move", "reschedule", or "push" a specific meeting. Pass meeting_id (a video_meetings UUID present verbatim in the context, e.g. when focused on a meeting) and new_start (ISO).',
  input_schema: {
    type: 'object',
    properties: {
      meeting_id: { type: 'string', description: 'The video_meetings UUID to move. Pass ONLY a UUID present verbatim in the context; omit to use the focused meeting.' },
      new_start: { type: 'string', description: 'The new start as an ISO timestamp.' },
      duration_minutes: { type: 'number', description: 'Optional new duration in minutes; keeps the existing duration if omitted.' },
    },
    required: ['new_start'],
  },
};

export const CANCEL_MEETING_TOOL: ToolDefinition = {
  name: 'cancel_meeting',
  description:
    'PROPOSES cancelling an existing meeting. Queues the cancellation for approval; the meeting stays until approved. Use when the user asks to "cancel" or "call off" a specific meeting. Pass meeting_id (a video_meetings UUID present verbatim in the context; omit to use the focused meeting).',
  input_schema: {
    type: 'object',
    properties: {
      meeting_id: { type: 'string', description: 'The video_meetings UUID to cancel. Pass ONLY a UUID present verbatim in the context; omit to use the focused meeting.' },
      reason: { type: 'string', description: 'Optional cancellation reason.' },
    },
    required: [],
  },
};

/** All mutation tools — passed to Anthropic when allow_ai_mutations is on */
export const MUTATION_TOOLS: ToolDefinition[] = [
  FIND_A_TIME_TOOL,
  BOOK_MEETING_TOOL,
  RESCHEDULE_MEETING_TOOL,
  CANCEL_MEETING_TOOL,
  RESCHEDULE_PROJECT_TOOL,
  UPDATE_FIELD_TOOL,
  ADD_TASK_TOOL,
  CREATE_PROJECT_TOOL,
  ADD_EVENT_TOOL,
  CREATE_TICKET_TOOL,
  CREATE_INVOICE_TOOL,
  CREATE_CONTENT_PLAN_TOOL,
  DRAFT_SOCIAL_POSTS_TOOL,
  CREATE_CAMPAIGN_TOOL,
  GENERATE_DOCUMENTS_TOOL,
  SEND_EMAIL_TOOL,
];
