// server/api/ai/director/plan.post.ts
/**
 * The Director's Office plan producer.
 *
 * Given an agenda subject (or a focused entity, or a free-text topic), Earnest
 * drafts a coherent, numbered PLAN of several proposed actions IN ONE TURN and
 * each becomes a `pending` ai_actions row tagged with a shared planId. Nothing
 * executes here — this is propose-only; the office approves each step through the
 * existing /api/ai/actions/[id]/approve endpoint.
 *
 * Grounded in the ai-notices sweep (real titles + entity ids) so the model acts
 * on live records, not invented ones. Steps are limited to the three action types
 * with real executors: create_tasks (add_task) / update_field / send_email.
 *
 * Auth: session + org membership.
 *
 * Body:
 *   organizationId (required)
 *   subject?    — agenda subject key ('projects'|'leads'|'proposals'|'money'|'clients'|'tickets')
 *   entityType? + entityId?  — focus a one-item meeting
 *   topic?      — free-text steer (optional)
 */
import { randomUUID } from 'crypto';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { getLLMProvider } from '~~/server/utils/llm/factory';
import type { ClaudeProvider } from '~~/server/utils/llm/claude';
import { ADD_TASK_TOOL, UPDATE_FIELD_TOOL, SEND_EMAIL_TOOL, RESCHEDULE_PROJECT_TOOL } from '~~/server/utils/llm/tools';
import { proposeDirectorStep } from '~~/server/utils/llm/tool-proposals';
import { collectDirectorAgenda, type AINotice, type DirectorSubjectKey } from '~~/server/utils/ai-notices';
import { buildFinancialSnapshot, type FinancialSnapshot } from '~~/server/utils/financial-snapshot';
import { buildOpportunityIntel, buildColdEffortIntel, type OpportunityIntel, type ColdEffortIntel } from '~~/server/utils/revenue-intel';
import { buildClientScorecard, type ClientScorecard } from '~~/server/utils/client-scorecard';
import { EARNEST_VOICE_CHARTER } from '~~/server/utils/llm/voice';
import { logAIUsage } from '~~/server/utils/ai-usage';
import { enforceTokenLimits } from '~~/server/utils/ai-token-enforcement';

// Action types with real executors that the Director may propose as steps.
const DIRECTOR_TOOLS = [ADD_TASK_TOOL, UPDATE_FIELD_TOOL, SEND_EMAIL_TOOL, RESCHEDULE_PROJECT_TOOL];

// notice.entityType (singular) → plural collection, for grounding update_field/add_task.
const ENTITY_COLLECTION: Record<string, string> = {
  client: 'clients', project: 'projects', invoice: 'invoices',
  lead: 'leads', proposal: 'proposals', ticket: 'tickets',
};
const SUBJECT_ENTITIES: Record<DirectorSubjectKey, string[]> = {
  projects: ['project'], leads: ['lead'], proposals: ['proposal'],
  money: ['invoice'], clients: ['client'], tickets: ['ticket'],
};

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const body = await readBody(event).catch(() => ({})) as {
    organizationId?: string; subject?: string;
    entityType?: string; entityId?: string; topic?: string;
  };
  const organizationId = (body.organizationId || '').toString();
  if (!organizationId) throw createError({ statusCode: 400, message: 'organizationId is required' });

  await requireOrgMembership(event, organizationId);

  const tokenCheck = await enforceTokenLimits(event, organizationId);
  if (!tokenCheck.allowed) {
    throw createError({ statusCode: tokenCheck.statusCode || 402, message: tokenCheck.reason || 'AI token limit reached' });
  }

  const subject = (body.subject || '').toString().trim() as DirectorSubjectKey | '';
  const entityType = (body.entityType || '').toString().trim();
  const entityId = (body.entityId || '').toString().trim();
  const topic = (body.topic || '').toString().trim();

  const directus = getServerDirectus();

  // 1. Ground the plan in the current agenda (focused entity or org-wide).
  const agenda = await collectDirectorAgenda(
    directus, organizationId, new Date(),
    entityType && entityId ? { entityType, entityId } : undefined,
  );

  // Narrow to the requested subject when org-wide; otherwise use everything.
  let notices: AINotice[] = agenda.groups.flatMap((g) => g.notices);
  if (subject && SUBJECT_ENTITIES[subject as DirectorSubjectKey]) {
    const group = agenda.groups.find((g) => g.subject === subject);
    notices = group ? group.notices : [];
  }

  const contextLines = notices.slice(0, 15).map((n) => {
    const collection = n.entityType ? (ENTITY_COLLECTION[n.entityType] || n.entityType) : 'unknown';
    const target = n.entityId ? ` [target: ${collection} id=${n.entityId}]` : '';
    return `- (${n.priority}) ${n.title} — ${n.description}${target}`;
  });
  const contextBlock = contextLines.length
    ? contextLines.join('\n')
    : '(No open issues surfaced for this scope right now.)';

  const scopeLabel = entityType && entityId
    ? `the ${entityType.replace(/s$/, '')} in focus`
    : subject
      ? `the "${subject}" area of the business`
      : 'the organization';

  // Money mode — financial snapshot + revenue-opportunity + effort-vs-return intel.
  const isMoney = subject === 'money' || entityType === 'invoices';
  // Client review — a focused meeting on one client gets a rating scorecard.
  const isClientReview = entityType === 'clients' && !!entityId;

  const nowD = new Date();
  let finance: FinancialSnapshot | null = null;
  let opportunity: OpportunityIntel | null = null;
  let cold: ColdEffortIntel | null = null;
  let scorecard: ClientScorecard | null = null;
  if (isMoney) {
    [finance, opportunity, cold] = await Promise.all([
      buildFinancialSnapshot(directus, organizationId, nowD).catch(() => null),
      buildOpportunityIntel(directus, organizationId, nowD).catch(() => null),
      buildColdEffortIntel(directus, organizationId, nowD).catch(() => null),
    ]);
  }
  if (isClientReview) {
    scorecard = await buildClientScorecard(directus, entityId, organizationId, nowD).catch(() => null);
  }

  const systemPrompt = [
    EARNEST_VOICE_CHARTER,
    '',
    'You are Earnest acting as a Director reporting to the user (the CEO). You have just reviewed the current state of the business and are convening a working meeting.',
    ...(isMoney ? [
      'MONEY MODE — this meeting is about the organization\'s finances. Before any steps, deliver a CRITICAL financial briefing in your reply text. Be direct and unsentimental:',
      '  1. Income outlook — read the monthly trend + trailing run-rate. Is income growing, flat, or declining? Say which, with the actual numbers.',
      '  2. Expense outlook — are expenses rising, and faster than income? Name the biggest categories.',
      '  3. Prediction — treat the naive projection as a starting point, then adjust for the trend and any overdue AR you would NOT bank on. Give a candid ~3-month net outlook.',
      '  4. Verdict — an honest, direct assessment. If the trajectory is bad, SAY SO plainly; harsh is acceptable when the numbers warrant it — never flatter or soften a real problem. If it is genuinely strong, say that too, proportionate to the data.',
      '  TARGETS & MISSING DATA — if the user asks whether they are "on track" (to a quarter, a goal, a number) and the snapshot shows NO revenue target on record, do NOT invent one or give a confident yes/no. State plainly that no target is set, give the run-rate as the factual baseline, and tell them to set a revenue goal so you can measure against it. Likewise, when the snapshot flags data gaps (no expenses logged, no income, no pipeline), name exactly what is missing and what to add (set a goal, log expenses, invoice + collect) — a good analysis of missing data beats a fabricated conclusion.',
      '  Cite real figures from the snapshot below. Never invent numbers. Round to whole dollars. Keep it tight — a few sharp sentences per point, not an essay.',
      '  Write in PLAIN PROSE — no markdown headers, no "#", no "**bold**", no bullet characters. Label the points as "Income:", "Expenses:", "Prediction:", "Verdict:" on their own lines.',
      ...(opportunity ? ['  Opportunity: on its own line, point to where the best money is — name the top revenue clients/service lines and the hottest pipeline from the data, and say plainly where to focus to grow revenue.'] : []),
      ...(cold && cold.coldLeads.length ? ['  Wasted effort: on its own line, call out that some leads are getting heavy follow-up with no close (name them + the activity counts). Say bluntly whether that effort is worth continuing or is better spent on the opportunities above.'] : []),
      '  After the briefing, propose 2-4 concrete steps grounded in the numbers (chase specific overdue AR, cut/renegotiate a named cost, collect or raise revenue, or redirect effort off a cold lead).',
    ] : isClientReview && scorecard ? [
      `CLIENT RATING REVIEW — you are reviewing "${scorecard.clientName}", which has a computed rating of ${scorecard.rating} (A best, F worst). Explain that rating in plain prose:`,
      '  Value: their realized revenue + active project value. Effort: how much you are spending on them (tasks + logged activities). Health: are they paying (overdue AR?), active, or gone quiet?',
      '  Verdict: a candid call. If they are an A/B account, say protect/grow it. If effort is high and return is low (the scorecard FLAG), say plainly you are over-investing and recommend dialing back or converting the effort into paid work.',
      '  Cite the scorecard figures. Plain prose, no markdown. Then propose 2-4 concrete steps for THIS client (collect AR, book a check-in, convert activity into a proposal, or de-prioritize).',
    ] : [
      'Produce a SHORT, coherent plan of concrete next actions for the scope in question — ideally 2 to 4 steps, never more than 5.',
    ]),
    'Emit each step as a tool call, ALL in this single turn (multiple tool calls at once). Do NOT ask follow-up questions first.',
    'You may ONLY use these tools: add_task, update_field, send_email, reschedule_project. Every action is a PROPOSAL the user must approve one-by-one — nothing happens automatically, so frame your summary as proposals, never as done.',
    'Ground every step in the items below: use the exact target collection + id shown. Never invent an id. If a step needs an id you do not have, describe it as a task instead.',
    'update_field is only for: leads.status, leads.stage, clients.status, projects.status, tasks.status, tasks.priority, tasks.schedule, tasks.due_date. For anything else, create a task.',
    'reschedule_project shifts a project timeline — use it only with a real project id and a delta_days (or new_start_date).',
    'Each step MUST be distinct — never propose the same action, task, or field change twice. If several records share one issue, address them in a SINGLE task, not one per record.',
    'Keep the plan tight and genuinely useful. Do not pad it to hit a number.',
  ].join('\n');

  const userMessage = [
    `Scope of this meeting: ${scopeLabel}.`,
    topic ? `The user specifically wants to focus on: ${topic}` : '',
    '',
    finance ? `${finance.text}\n` : '',
    opportunity ? `${opportunity.text}\n` : '',
    cold && cold.text ? `${cold.text}\n` : '',
    scorecard ? `${scorecard.text}\n` : '',
    'Current items needing attention:',
    contextBlock,
    '',
    isMoney
      ? 'Give the critical financial briefing (including opportunity + wasted-effort lines), then draft the steps as tool calls.'
      : isClientReview && scorecard
        ? 'Give the client rating review, then draft the steps as tool calls.'
        : 'Draft the plan now as tool calls.',
  ].filter(Boolean).join('\n');

  // 2. Ask Claude for the plan (multiple tool_use blocks in one turn).
  const provider = getLLMProvider() as ClaudeProvider;
  if (typeof provider.chatWithTools !== 'function') {
    throw createError({ statusCode: 500, message: 'The active AI provider cannot plan.' });
  }

  const planId = randomUUID();
  let round: Awaited<ReturnType<ClaudeProvider['chatWithTools']>>;
  try {
    round = await provider.chatWithTools(
      [{ role: 'user', content: userMessage }],
      { systemPrompt, maxTokens: (isMoney || isClientReview) ? 3500 : 2048, tools: DIRECTOR_TOOLS },
    );
  } catch (err: any) {
    console.error('[ai/director/plan] LLM error:', err?.message);
    throw createError({ statusCode: 502, message: 'Earnest could not draft a plan right now. Please try again.' });
  }

  if (round.usage) {
    logAIUsage({
      event, endpoint: 'ai/director/plan', model: (provider as any).name || 'claude',
      inputTokens: round.usage.inputTokens, outputTokens: round.usage.outputTokens,
      organizationId, metadata: { subject: subject || null, entityType: entityType || null },
    }).catch(() => {});
  }

  // 3. Turn each planned tool call into a pending ai_actions step.
  const steps: any[] = [];
  for (const tc of round.toolCalls) {
    const result = await proposeDirectorStep(tc.name, tc.input, {
      organizationId,
      userId,
      planId,
      subject: subject || null,
      entityType: entityType || null,
      entityId: entityId || null,
      sessionId: planId,
    });
    if (result.success && result.data?.actionId != null) {
      steps.push({
        actionId: result.data.actionId,
        actionType: tc.name === 'add_task' ? 'create_tasks' : tc.name,
        summary: result.summary,
      });
    } else {
      // A step that couldn't be queued (unsupported / off-allowlist) is skipped,
      // not fatal — the rest of the plan still stands.
      console.warn('[ai/director/plan] step skipped:', tc.name, result.error);
    }
  }

  return {
    planId,
    subject: subject || null,
    entityType: entityType || null,
    entityId: entityId || null,
    intro: round.text || '',
    steps,
    stepCount: steps.length,
    // Money mode: compact metrics for the UI to render alongside the briefing.
    finance: finance ? {
      months: finance.months,
      totals: finance.totals,
      trailing: finance.trailing,
      projection: finance.projection,
      outstanding: finance.outstanding,
      recurring: finance.recurring,
      expensesByCategory: finance.expensesByCategory.slice(0, 6),
      revenueGoals: finance.revenueGoals,
      coverage: finance.coverage,
    } : null,
    opportunity: opportunity ? {
      topClients: opportunity.topClients,
      topServiceLines: opportunity.topServiceLines,
      pipeline: opportunity.pipeline,
    } : null,
    cold: cold ? { coldLeads: cold.coldLeads } : null,
    // Client review: the computed scorecard/rating for the UI.
    clientRating: scorecard ? {
      clientName: scorecard.clientName,
      rating: scorecard.rating,
      value: scorecard.value,
      effort: scorecard.effort,
      health: scorecard.health,
    } : null,
  };
});
