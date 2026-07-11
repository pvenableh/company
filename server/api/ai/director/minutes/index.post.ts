// server/api/ai/director/minutes/index.post.ts
/**
 * Record the minutes of a Director's Office meeting — a durable decision record.
 *
 * The client posts a snapshot of the finished meeting (scope, briefing, every
 * step + its decided status, captured action items, the Q&A thread, a rollup).
 * We generate a short plain-English SUMMARY of the outcome with Earnest, then
 * persist the row and return its id. The recap page + share flow read it back.
 *
 * Summary generation is best-effort: if the LLM call fails (or the org is out of
 * tokens), we fall back to a deterministic summary built from the rollup + the
 * decided step titles, so recording minutes never hard-fails on the model.
 *
 * Auth: session + membership of the target org.
 * Body: {
 *   organizationId, sessionId?, title?, scopeType, entityType?, entityId?,
 *   subject?, topic?, planId?, intro?, points?, finance?, opportunity?,
 *   clientRating?, steps?, captured?, qa?
 * }
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { saveMinutes, type MinutesStep, type MinutesCaptured, type MinutesQaTurn, type MinutesStats } from '~~/server/utils/director-minutes';
import { getLLMProvider } from '~~/server/utils/llm/factory';
import { EARNEST_VOICE_CHARTER } from '~~/server/utils/llm/voice';
import { logAIUsage } from '~~/server/utils/ai-usage';
import { enforceTokenLimits } from '~~/server/utils/ai-token-enforcement';

function computeStats(steps: MinutesStep[], captured: MinutesCaptured[]): MinutesStats {
  return {
    done: steps.filter((s) => s.status === 'executed').length,
    skipped: steps.filter((s) => s.status === 'rejected').length,
    failed: steps.filter((s) => s.status === 'failed').length,
    open: steps.filter((s) => s.status === 'pending' || s.status === 'executing').length,
    total: steps.length,
    captured: captured.length,
  };
}

/** Deterministic fallback summary — used when the model is unavailable. */
function fallbackSummary(subjectLabel: string, stats: MinutesStats, steps: MinutesStep[], captured: MinutesCaptured[]): string {
  const parts: string[] = [];
  const bits: string[] = [];
  if (stats.done) bits.push(`${stats.done} approved`);
  if (stats.skipped) bits.push(`${stats.skipped} skipped`);
  if (stats.failed) bits.push(`${stats.failed} failed`);
  if (stats.open) bits.push(`${stats.open} still open`);
  parts.push(`Reviewed ${subjectLabel}. Of ${stats.total} proposed action${stats.total === 1 ? '' : 's'}, ${bits.join(', ') || 'none decided'}.`);
  const approved = steps.filter((s) => s.status === 'executed').map((s) => s.title);
  if (approved.length) parts.push(`Approved: ${approved.slice(0, 6).join('; ')}${approved.length > 6 ? '…' : ''}.`);
  if (captured.length) parts.push(`Captured ${captured.length} action item${captured.length === 1 ? '' : 's'}: ${captured.slice(0, 6).map((c) => c.title).join('; ')}${captured.length > 6 ? '…' : ''}.`);
  return parts.join(' ');
}

function subjectLabelFor(subject: string | null, scopeType: string, entityType: string | null): string {
  if (subject) {
    const s = subject.toLowerCase();
    return ({ money: 'the money', clients: 'clients', projects: 'projects', leads: 'the pipeline', proposals: 'proposals', tickets: 'support' } as Record<string, string>)[s] || subject;
  }
  if (scopeType === 'entity' && entityType) return `the ${entityType.replace(/s$/, '')} in focus`;
  if (scopeType === 'mine') return 'your own work';
  return 'the organization';
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const body = (await readBody(event).catch(() => ({}))) as Record<string, any>;
  const organizationId = (body.organizationId ?? '').toString();
  if (!organizationId) throw createError({ statusCode: 400, message: 'organizationId is required' });

  await requireOrgMembership(event, organizationId);

  const scopeType = (body.scopeType === 'entity' ? 'entity' : body.scopeType === 'mine' ? 'mine' : 'org') as 'org' | 'entity' | 'mine';
  const entityType = body.entityType ? String(body.entityType) : null;
  const subject = body.subject ? String(body.subject) : null;
  const topic = body.topic ? String(body.topic) : null;
  const intro = body.intro ? String(body.intro) : null;

  const steps: MinutesStep[] = Array.isArray(body.steps)
    ? body.steps.map((s: any) => ({
        id: String(s.id),
        action_type: String(s.action_type || ''),
        title: String(s.title || s.action_type || ''),
        preview: s.preview ?? null,
        status: (['executed', 'rejected', 'failed', 'executing'].includes(s.status) ? s.status : 'pending'),
      }))
    : [];
  const captured: MinutesCaptured[] = Array.isArray(body.captured)
    ? body.captured.map((c: any) => ({
        type: c.type === 'ticket' ? 'ticket' : 'task',
        title: String(c.title || ''),
        priority: c.priority ? String(c.priority) : undefined,
        assignees: Array.isArray(c.assignees) ? c.assignees.map(String) : undefined,
      })).filter((c: MinutesCaptured) => c.title)
    : [];
  const qa: MinutesQaTurn[] = Array.isArray(body.qa)
    ? body.qa.filter((t: any) => t && (t.role === 'user' || t.role === 'assistant') && t.text)
        .map((t: any) => ({ role: t.role, text: String(t.text) }))
    : [];

  const stats = computeStats(steps, captured);
  const subjectLabel = subjectLabelFor(subject, scopeType, entityType);

  // ── Generate the summary (best-effort) ──────────────────────────────────────
  let summary = fallbackSummary(subjectLabel, stats, steps, captured);
  const tokenCheck = await enforceTokenLimits(event, organizationId).catch(() => ({ allowed: false } as any));
  if (tokenCheck?.allowed && (steps.length || captured.length || qa.length)) {
    const decided = steps.map((s, i) => `  ${i + 1}. [${s.status}] ${s.title}`).join('\n');
    const caps = captured.map((c) => `  - ${c.type}: ${c.title}${c.assignees?.length ? ` (→ ${c.assignees.length})` : ''}`).join('\n');
    const qaBlock = qa.slice(-8).map((t) => `${t.role === 'user' ? 'Q' : 'A'}: ${t.text}`).join('\n');
    const systemPrompt = [
      EARNEST_VOICE_CHARTER,
      '',
      'You are Earnest, writing the MINUTES of a working meeting in the Director\'s Office.',
      `The meeting reviewed ${subjectLabel}.`,
      'Write a short, plain-English recap (2-4 sentences, no markdown headers or bullet characters) of what was reviewed and what was decided — the approved actions, anything skipped or left open, and any action items captured. Ground it ONLY in the facts below; never invent numbers or records. Write for a teammate who wasn\'t in the room.',
    ].join('\n');
    const facts = [
      intro ? `Briefing:\n${intro}` : '',
      steps.length ? `Decisions on proposed actions:\n${decided}` : '',
      captured.length ? `Action items captured:\n${caps}` : '',
      qa.length ? `Q&A discussed:\n${qaBlock}` : '',
      `Rollup: ${stats.done} approved, ${stats.skipped} skipped, ${stats.failed} failed, ${stats.open} open.`,
    ].filter(Boolean).join('\n\n');
    try {
      const provider = getLLMProvider();
      const response = await provider.chat(
        [{ role: 'user', content: facts }],
        { systemPrompt, maxTokens: 400 },
      );
      const text = (response.content || '').trim();
      if (text) summary = text;
      if (response.usage) {
        logAIUsage({
          event, endpoint: 'ai/director/minutes', model: (provider as any).name || 'claude',
          inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens,
          organizationId, metadata: { subject: subject || null },
        }).catch(() => {});
      }
    } catch (err: any) {
      console.warn('[ai/director/minutes] summary LLM failed, using fallback:', err?.message);
    }
  }

  const id = await saveMinutes({
    organizationId,
    authorId: String(userId),
    sessionId: body.sessionId != null ? body.sessionId : null,
    title: body.title ? String(body.title) : (subject ? subjectLabel : 'Working session'),
    scopeType,
    entityType,
    entityId: body.entityId ? String(body.entityId) : null,
    subject,
    topic,
    planId: body.planId ? String(body.planId) : null,
    summary,
    intro,
    points: Array.isArray(body.points) ? body.points.map(String) : null,
    finance: body.finance ?? null,
    opportunity: body.opportunity ?? null,
    clientRating: body.clientRating ?? null,
    steps,
    captured,
    qa,
    stats,
  });

  if (id == null) {
    throw createError({ statusCode: 503, message: 'The decision-record store isn\'t set up yet. Ask an admin to run the director_minutes setup.' });
  }

  return { id: String(id), summary, stats };
});
