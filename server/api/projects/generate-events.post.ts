/**
 * AI-Enhanced Project Timeline Generator.
 *
 * Takes project parameters and returns a proposed timeline of events with tasks.
 * Uses predefined templates for structure, then AI adjusts for project specifics.
 */
import { getLLMProvider } from '~/server/utils/llm/factory';
import { enforceTokenLimits } from '~/server/utils/ai-token-enforcement';
import type { ChatMessage } from '~/server/utils/llm/types';
import {
  PROJECT_TEMPLATES,
  SCOPE_MULTIPLIERS,
  type GenerateTimelineRequest,
  type GenerateTimelineResponse,
  type ProposedEvent,
  type ProposedTask,
} from '~/types/projects/timeline-generator';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const body = await readBody<GenerateTimelineRequest>(event);

  // Token enforcement
  const tokenCheck = await enforceTokenLimits(event, (body as any).organizationId);
  if (!tokenCheck.allowed) {
    throw createError({ statusCode: tokenCheck.statusCode || 402, message: tokenCheck.reason || 'Token limit reached' });
  }

  if (!body.projectType) {
    throw createError({ statusCode: 400, message: 'Project type is required' });
  }
  if (!body.startDate) {
    throw createError({ statusCode: 400, message: 'Start date is required' });
  }

  // 1. Find the template (may be null for custom/from-scratch generation)
  const template = PROJECT_TEMPLATES.find((t) => t.id === body.projectType);

  // 2. Build base timeline (only when a matching template exists)
  const multiplier = SCOPE_MULTIPLIERS[body.scope] ?? 1.0;
  let deadlineNote = '';

  if (template) {
    const baseEvents = buildBaseTimeline(template, body.startDate, multiplier);

    // Check if we need deadline compression
    if (body.targetDeadline) {
      const lastEvent = baseEvents[baseEvents.length - 1];
      const endDate = new Date(lastEvent.end_date);
      const deadline = new Date(body.targetDeadline);
      const diffDays = Math.round((deadline.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        deadlineNote = `The timeline currently ends ${Math.abs(diffDays)} days AFTER the target deadline of ${body.targetDeadline}. You MUST compress the timeline to fit. Reduce durations proportionally, prioritizing compression on longer phases.`;
      } else if (diffDays > 14) {
        deadlineNote = `The timeline ends ${diffDays} days BEFORE the deadline of ${body.targetDeadline}. You may expand some phases for more thorough work, or add buffer time.`;
      }
    }

    var baseTimelineJSON = JSON.stringify(baseEvents, null, 2);
  }

  // 3. Build AI prompt — shared rules for JSON output format
  const jsonRules = `RULES:
- Return ONLY valid JSON, no markdown fences, no extra text
- Each event needs: id (string like "evt_1"), title, description (1-2 sentences), event_date (YYYY-MM-DD), end_date (YYYY-MM-DD), duration_days (integer), type (one of: General, Design, Content, Timeline, Financial, Hours), is_milestone (boolean), enabled (true), sort (integer starting at 1)
- Each event must have a "tasks" array with 2-5 tasks
- Each task needs: id (string like "task_1_1"), title, description (1 sentence), priority ("low", "medium", or "high"), due_date (YYYY-MM-DD, set to the event's end_date)
- Dates must be sequential and not overlap (next event starts when previous ends)
- Skip weekends when calculating dates
- Keep descriptions concise and actionable
- Return 8-17 events for a complete project timeline

Return this exact JSON structure:
{
  "events": [array of events with nested tasks],
  "summary": "Brief explanation of adjustments made (1-2 sentences)",
  "totalDays": number
}`;

  let systemPrompt: string;

  if (template) {
    // Template-based generation — AI adjusts from a base timeline
    systemPrompt = `You are a project management expert for a creative agency. You help plan project timelines with milestones and tasks.

Given a base timeline template, adjust it based on the project parameters. Your job is to:
- Rename milestones and tasks to be more specific to this project
- Adjust durations based on scope, team size, and complexity
- Add milestones for any special requirements mentioned
- Compress or expand the timeline to meet a target deadline if specified
- Generate 2-5 actionable tasks per event that a team member could work on
- Mark key deliverables and approval points as milestones

${jsonRules}`;
  } else {
    // Custom generation — AI creates a complete timeline from scratch
    systemPrompt = `You are a project management expert for a creative agency. You create complete project timelines with milestones and tasks from scratch.

Based on the project parameters and service type provided, create a comprehensive timeline. Your job is to:
- Create 8-15 logical phases/milestones appropriate for this type of project
- Include a mix of planning, execution, review/approval, and delivery phases
- Start with a contract/kickoff milestone and end with final delivery
- Include client review/approval milestones at key decision points
- Generate 2-5 actionable tasks per event that a team member could work on
- Ensure realistic durations based on project scope and team size
- Mark key deliverables and approval points as milestones

${jsonRules}`;
  }

  // 4. Build user message
  const userParts: string[] = [];
  userParts.push(`Project: ${body.projectTitle || 'Untitled Project'}`);
  if (template) {
    userParts.push(`Type: ${template.label}`);
  } else {
    userParts.push(`Service/Type: ${body.serviceName || 'General Project'}`);
  }
  userParts.push(`Scope: ${body.scope}`);
  userParts.push(`Client type: ${body.clientType}`);
  userParts.push(`Start date: ${body.startDate}`);
  if (body.targetDeadline) userParts.push(`Target deadline: ${body.targetDeadline}`);
  if (body.teamSize) userParts.push(`Team size: ${body.teamSize} people`);
  if (body.serviceName) userParts.push(`Service: ${body.serviceName}`);
  if (body.specialRequirements?.trim()) {
    userParts.push(`Special requirements:\n${body.specialRequirements.trim()}`);
  }
  if (template) {
    if (deadlineNote) userParts.push(`\nIMPORTANT: ${deadlineNote}`);
    userParts.push(`\nBase timeline to adjust:\n${baseTimelineJSON}`);
  } else {
    userParts.push(`\nCreate a complete project timeline from scratch for this service type. Start from the provided start date and generate appropriate phases with realistic durations.`);
  }

  const messages: ChatMessage[] = [
    { role: 'user', content: userParts.join('\n') },
  ];

  // 5. Call the LLM
  const provider = getLLMProvider();
  try {
    const response = await provider.chat(messages, {
      systemPrompt,
      maxTokens: 4096,
      temperature: 0.7,
    });

    // 6. Parse the JSON response
    let generated: GenerateTimelineResponse;
    try {
      let content = response.content.trim();
      if (content.startsWith('```')) {
        content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      generated = JSON.parse(content);
    } catch {
      console.error('[generate-events] Failed to parse LLM response:', response.content.substring(0, 500));
      throw createError({
        statusCode: 502,
        message: 'AI returned an invalid response. Please try again.',
      });
    }

    // 7. Validate and sanitize
    if (!Array.isArray(generated.events) || generated.events.length === 0) {
      throw createError({
        statusCode: 502,
        message: 'AI returned no events. Please try again.',
      });
    }

    const validTypes = ['General', 'Design', 'Content', 'Timeline', 'Financial', 'Hours'];
    const validPriorities = ['low', 'medium', 'high'];

    generated.events = generated.events.map((evt, i) => ({
      id: evt.id || `evt_${i + 1}`,
      title: evt.title || `Event ${i + 1}`,
      description: evt.description || '',
      event_date: evt.event_date || body.startDate,
      end_date: evt.end_date || evt.event_date || body.startDate,
      duration_days: Math.max(0, Math.round(evt.duration_days || 0)),
      type: validTypes.includes(evt.type) ? evt.type : 'General',
      is_milestone: Boolean(evt.is_milestone),
      enabled: true,
      sort: i + 1,
      tasks: (evt.tasks || []).map((task: any, j: number) => ({
        id: task.id || `task_${i + 1}_${j + 1}`,
        title: task.title || `Task ${j + 1}`,
        description: task.description || '',
        priority: validPriorities.includes(task.priority) ? task.priority : 'medium',
        due_date: task.due_date || evt.end_date || evt.event_date || body.startDate,
      })),
    }));

    return {
      events: generated.events,
      summary: generated.summary || 'Timeline generated based on project parameters.',
      totalDays: generated.totalDays || calculateTotalDays(generated.events),
    } satisfies GenerateTimelineResponse;
  } catch (error: any) {
    if (error.statusCode) throw error;
    console.error('[generate-events] LLM error:', error);
    throw createError({
      statusCode: 500,
      message: 'Failed to generate timeline. Please try again.',
    });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addBusinessDays(startDate: string, days: number): string {
  const date = new Date(startDate + 'T12:00:00');
  if (days === 0) return startDate;
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) {
      added++;
    }
  }
  return date.toISOString().split('T')[0];
}

function buildBaseTimeline(
  template: (typeof PROJECT_TEMPLATES)[number],
  startDate: string,
  multiplier: number,
): ProposedEvent[] {
  const events: ProposedEvent[] = [];
  let currentDate = startDate;

  for (let i = 0; i < template.milestones.length; i++) {
    const milestone = template.milestones[i];
    const scaledDuration = Math.max(0, Math.round(milestone.duration_days * multiplier));
    const endDate = scaledDuration > 0 ? addBusinessDays(currentDate, scaledDuration) : currentDate;

    const tasks: ProposedTask[] = milestone.tasks.map((t, j) => ({
      id: `task_${i + 1}_${j + 1}`,
      title: t.title,
      description: t.description,
      priority: t.priority,
      due_date: endDate,
    }));

    events.push({
      id: `evt_${i + 1}`,
      title: milestone.name,
      description: milestone.description,
      event_date: currentDate,
      end_date: endDate,
      duration_days: scaledDuration,
      type: milestone.type,
      is_milestone: milestone.is_milestone,
      enabled: true,
      sort: i + 1,
      tasks,
    });

    // Next event starts the business day after this one ends
    if (scaledDuration > 0) {
      currentDate = addBusinessDays(endDate, 1);
    }
  }

  return events;
}

function calculateTotalDays(events: ProposedEvent[]): number {
  if (events.length === 0) return 0;
  const first = new Date(events[0].event_date);
  const last = new Date(events[events.length - 1].end_date);
  return Math.max(0, Math.round((last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24)));
}
