// server/api/ai/director/ask.post.ts
/**
 * The Director's Office Q&A — the CEO asks Earnest a question (or pushes back)
 * about the briefing currently on screen, and gets a grounded, advisory answer.
 *
 * READ-ONLY / advisory: this endpoint never proposes or runs actions. It grounds
 * the reply ONLY in the saved briefing (rationale + metric snapshots) and its
 * proposed steps, so Earnest answers from the same facts the Director is looking
 * at. If a new action is warranted, Earnest says so and tells the user to hit
 * Re-draft (which is where actions are (re)generated).
 *
 * Auth: session + org membership + token enforcement (same as plan.post).
 *
 * Body:
 *   organizationId (required)
 *   question       (required) — the CEO's message
 *   subject? topic? entityType? entityId?  — locates the briefing to ground in
 *   planId?        — load the proposed steps for grounding
 *   history?       — prior [{role, text}] turns for a multi-turn thread
 */
import { readItems } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { getLLMProvider } from '~~/server/utils/llm/factory';
import { EARNEST_VOICE_CHARTER } from '~~/server/utils/llm/voice';
import { loadLatestDirectorBriefing, type DirectorBriefingScope } from '~~/server/utils/director-briefings';
import { logAIUsage } from '~~/server/utils/ai-usage';
import { enforceTokenLimits } from '~~/server/utils/ai-token-enforcement';
import type { ChatMessage } from '~~/server/utils/llm/types';

const fmt = (n: any) => `$${Math.round(Number(n) || 0).toLocaleString()}`;

/** Compact, factual grounding block from a saved briefing + its steps. */
function buildFacts(briefing: any, steps: any[]): string {
  const lines: string[] = [];
  if (briefing?.intro) lines.push(`Earnest's briefing:\n${briefing.intro}`);

  const f = briefing?.finance;
  if (f?.trailing) {
    lines.push(
      `Money (monthly avg): income ${fmt(f.trailing.income)}, expenses ${fmt(f.trailing.expenses)}, net ${fmt(f.trailing.net)}.` +
      (f.outstanding ? ` Outstanding AR ${fmt(f.outstanding.total)}${f.outstanding.overdueTotal ? ` (${fmt(f.outstanding.overdueTotal)} overdue)` : ''}.` : '') +
      (f.projection ? ` Projected next ${f.projection.horizonMonths}mo: income ${fmt(f.projection.income)}, expenses ${fmt(f.projection.expenses)}, net ${fmt(f.projection.net)}.` : ''),
    );
  }
  const o = briefing?.opportunity;
  if (o) {
    if (o.topClients?.length) lines.push(`Top clients: ${o.topClients.slice(0, 3).map((c: any) => `${c.name} ${fmt(c.revenue)}`).join(', ')}.`);
    if (o.topServiceLines?.length) lines.push(`Best lines: ${o.topServiceLines.slice(0, 3).map((s: any) => `${s.name} ${fmt(s.revenue)}`).join(', ')}.`);
    if (o.pipeline?.openCount) lines.push(`Pipeline: ${o.pipeline.openCount} open, ~${fmt(o.pipeline.weightedValue)} weighted.`);
  }
  const cr = briefing?.clientRating || briefing?.client_rating;
  if (cr) {
    lines.push(`Client rating: ${cr.clientName} = ${cr.rating}. Value ${fmt(cr.value?.revenue)} (${cr.value?.activeProjects} active proj), effort ${cr.effort?.total} touch-points, overdue AR ${fmt(cr.health?.overdueAR)}.`);
  }
  if (steps?.length) {
    lines.push('Proposed steps (advisory — the user approves each):');
    steps.forEach((s, i) => lines.push(`  ${i + 1}. [${s.action_type}] ${s.title} — ${s.status}`));
  }
  return lines.length ? lines.join('\n\n') : '(No saved briefing detail is available for this section.)';
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const body = await readBody(event).catch(() => ({})) as {
    organizationId?: string; question?: string; subject?: string;
    entityType?: string; entityId?: string; topic?: string; planId?: string;
    history?: { role: string; text: string }[];
    /** Human label of the slide the user is currently viewing, if any. */
    viewing?: string;
    // The briefing the user is looking at — a drift-proof fallback for grounding
    // if the saved-briefing lookup misses (e.g. the topic box changed).
    context?: { intro?: string; finance?: any; opportunity?: any; clientRating?: any };
  };
  const organizationId = (body.organizationId || '').toString();
  if (!organizationId) throw createError({ statusCode: 400, message: 'organizationId is required' });
  const question = (body.question || '').toString().trim();
  if (!question) throw createError({ statusCode: 400, message: 'question is required' });

  await requireOrgMembership(event, organizationId);

  const tokenCheck = await enforceTokenLimits(event, organizationId);
  if (!tokenCheck.allowed) {
    throw createError({ statusCode: tokenCheck.statusCode || 402, message: tokenCheck.reason || 'AI token limit reached' });
  }

  const entityType = (body.entityType || '').toString().trim();
  const entityId = (body.entityId || '').toString().trim();
  const scope: DirectorBriefingScope = {
    scopeType: entityType && entityId ? 'entity' : 'org',
    entityType: entityType || null,
    entityId: entityId || null,
    subject: (body.subject || '').toString().trim() || null,
    topic: (body.topic || '').toString().trim() || null,
  };

  // Ground in the saved briefing + its proposed steps.
  const briefing = await loadLatestDirectorBriefing(organizationId, scope);
  let steps: any[] = [];
  const planId = (body.planId || briefing?.planId || '').toString().trim();
  if (planId) {
    try {
      const directus = getTypedDirectus();
      steps = await directus.request(
        readItems('ai_actions' as any, {
          filter: { _and: [{ organization: { _eq: organizationId } }, { session_id: { _eq: planId } }] } as any,
          fields: ['title', 'action_type', 'status'],
          sort: ['date_created'],
          limit: 20,
        }),
      ) as any[];
    } catch { /* no steps is fine */ }
  }

  // Prefer the persisted briefing; fall back to what the client is showing.
  const grounded = briefing || (body.context && (body.context.intro || body.context.finance || body.context.clientRating)
    ? { intro: body.context.intro, finance: body.context.finance, opportunity: body.context.opportunity, clientRating: body.context.clientRating }
    : null);

  const scopeLabel = scope.scopeType === 'entity'
    ? `the ${entityType.replace(/s$/, '')} in focus`
    : scope.subject ? `the "${scope.subject}" area of the business` : 'the organization';

  const systemPrompt = [
    EARNEST_VOICE_CHARTER,
    '',
    'You are Earnest, briefing the user (the CEO) in the Director\'s Office. They are looking at the briefing below and have a question or a push-back.',
    `Scope of this briefing: ${scopeLabel}.`,
    ...((body.viewing || '').trim() ? [`The user is currently looking at ${(body.viewing || '').trim()}. If they say "this", "this slide", or "here", resolve it to that.`] : []),
    'Answer directly and honestly, grounded ONLY in the facts below — never invent numbers or records. If the facts do not settle the question, say what is missing.',
    'If they push back or propose an alternative, engage candidly: agree or disagree with reasons, don\'t just defer.',
    'You are ADVISORY in this chat — you cannot run or queue actions here. If a new concrete action is warranted, describe what you\'d propose and tell them to hit "Re-draft" to regenerate the plan with it.',
    'Be concise: a few sharp sentences, plain prose, no markdown headers or bullet characters.',
    '',
    'BRIEFING FACTS:',
    buildFacts(grounded, steps),
  ].join('\n');

  // Multi-turn: replay the recent thread, then the new question.
  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
  const messages: ChatMessage[] = [
    ...history
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.text)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.text) })),
    { role: 'user', content: question },
  ];

  const provider = getLLMProvider();
  try {
    const response = await provider.chat(messages, { systemPrompt, maxTokens: 700 });
    if (response.usage) {
      logAIUsage({
        event, endpoint: 'ai/director/ask', model: (provider as any).name || 'claude',
        inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens,
        organizationId, metadata: { subject: scope.subject || null },
      }).catch(() => {});
    }
    return { answer: (response.content || '').trim() };
  } catch (err: any) {
    console.error('[ai/director/ask] LLM error:', err?.message);
    throw createError({ statusCode: 502, message: 'Earnest could not answer right now. Please try again.' });
  }
});
