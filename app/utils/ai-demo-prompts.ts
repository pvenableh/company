// app/utils/ai-demo-prompts.ts
// Short, token-efficient prompts for demoing AI mutations.
// Each prompt is under 10 words — minimal tokens, maximum impact.

export interface DemoPrompt {
  label: string;
  prompt: string;
  /** What the demo should show happening */
  expectedAction: string;
}

export const AI_MUTATION_DEMO_PROMPTS: Record<string, DemoPrompt[]> = {
  project: [
    {
      label: 'Reschedule project',
      prompt: 'Push the start date back 2 weeks and update all events and tasks.',
      expectedAction: 'reschedule_project — shifts project + all events + all tasks by 14 days',
    },
    {
      label: 'Mark in progress',
      prompt: 'Mark this project as In Progress.',
      expectedAction: 'update_field — sets status to "In Progress"',
    },
    {
      label: 'Add a task',
      prompt: 'Add a task to review the final deliverables, due this Friday.',
      expectedAction: 'add_task — creates task linked to project with due date',
    },
  ],
  ticket: [
    {
      label: 'Escalate priority',
      prompt: 'Change priority to urgent.',
      expectedAction: 'update_field — sets priority to "urgent"',
    },
    {
      label: 'Move to review',
      prompt: 'Mark this ticket as In Review.',
      expectedAction: 'update_field — sets status to "In Review"',
    },
    {
      label: 'Add a task',
      prompt: 'Add a task to reproduce the bug before EOD.',
      expectedAction: 'add_task — creates task linked to ticket',
    },
  ],
  project_event: [
    {
      label: 'Shift event',
      prompt: 'Move this event back one week.',
      expectedAction: 'update_field — shifts event_date by 7 days',
    },
    {
      label: 'Mark complete',
      prompt: 'Mark this event as complete.',
      expectedAction: 'update_field — sets status to "Completed"',
    },
  ],
  invoice: [
    {
      label: 'Extend due date',
      prompt: 'Extend the due date by 14 days.',
      expectedAction: 'update_field — shifts due_date forward 14 days',
    },
  ],
};

// Flat list for use in demos / walkthrough scripts
export const DEMO_SCRIPT_PROMPTS = [
  // ── The hero demo: date cascade ──────────────────────────────────────────
  // Navigate to a project detail page, open the AI sidebar, then:
  'Push the start date back 2 weeks and update all events and tasks.',
  // Expected: spinner "Rescheduling project...", green chip with count, AI confirmation

  // ── Quick field edits ────────────────────────────────────────────────────
  // On a ticket detail page:
  'Change priority to urgent.',
  // Expected: spinner "Updating...", green chip, AI confirms

  // ── Task creation ────────────────────────────────────────────────────────
  // On a project detail page:
  'Add a task to finalize the client presentation, due next Monday.',
  // Expected: spinner "Creating task...", green chip, AI confirms with task title
];
