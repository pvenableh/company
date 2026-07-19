// server/api/mirror/reflect.post.ts
//
// Earnest's honest read for the Mirror. Recomputes the user's signals + insights
// server-side (never trusts client-passed data) and asks the model to SYNTHESISE
// the meta-pattern — what the numbers add up to about how they work right now —
// grounded strictly in those facts. Separate from GET /api/mirror/me so the
// insight cards render instantly and this voice loads a beat later.

import { computeMirrorSignals, humanDays, type MirrorResult } from '~~/server/utils/mirror-signals';
import { getLLMProvider } from '~~/server/utils/llm/factory';
import { enforceTokenLimits } from '~~/server/utils/ai-token-enforcement';
import type { ChatMessage } from '~~/server/utils/llm/types';

const SYSTEM_PROMPT = `You are Earnest, reflecting back to someone on how they've actually been working — read from their real task data. Write 2–3 plain, honest sentences, speaking directly to them ("you").

Rules:
- Say what the facts ADD UP TO — the meta-pattern about how they work right now. Don't just restate the individual insights; the app already shows those as cards.
- Ground every claim in a provided number or name. No invented specifics.
- No platitudes ("stay consistent", "keep it up", "you've got this"), no scolding, no to-do list. It's a mirror, not a coach or a manager.
- If the data is thin, say so honestly in one sentence rather than padding.
- Return ONLY the sentences. No preamble, no quotes, no JSON, no code fences.`;

function factsBlock(r: MirrorResult): string {
	const s = r.signals;
	const lines: string[] = ['THEIR TASK DATA:'];
	lines.push(`- Open tasks right now: ${s.openNow}`);
	lines.push(`- Completed in the last 60 days: ${s.completedCount}${s.medianLatencyDays != null ? `; a task takes ${s.medianLatencyDays}d to close (median), ${s.slowTailCount} sat open over 3 weeks` : ''}`);
	if (s.avoidanceCount > 0) lines.push(`- ${s.avoidanceCount} open tasks have sat untouched 2+ weeks (oldest ${humanDays(s.oldestAvoidanceDays ?? 0)})`);
	if (s.overdueCount > 0) lines.push(`- ${s.overdueCount} tasks overdue (worst by ${humanDays(s.worstOverdueDays ?? 0)})`);
	if (s.outlier) lines.push(`- One client, ${s.outlier.name}, holds ${s.outlier.openCount} open tasks (${s.outlier.overdueCount} overdue) — more than any other`);
	if (r.insights.length) {
		lines.push('', 'PATTERNS ALREADY SURFACED (synthesise across these, do not repeat them):');
		for (const i of r.insights) lines.push(`- ${i.headline}`);
	}
	return lines.join('\n');
}

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

	const body = await readBody(event).catch(() => ({}));
	const orgId = (body?.orgId || '').toString();
	if (!orgId) throw createError({ statusCode: 400, message: 'orgId is required' });

	const directus = await getUserDirectus(event);
	const result = await computeMirrorSignals(directus, orgId, userId).catch(() => null);

	// Nothing meaningful to read yet — answer honestly without spending a call.
	if (!result || (result.insights.length === 0 && result.signals.completedCount < 4)) {
		return { read: "There's not much to read yet — do a little more work and I'll start to see how you move." };
	}

	const gate = await enforceTokenLimits(event, orgId);
	if (!(gate as any).allowed) {
		// token cap hit — fall back to a grounded deterministic line
		const s = result.signals;
		const bit = s.avoidanceCount > 0
			? `${s.avoidanceCount} tasks have been sitting for weeks`
			: s.overdueCount > 0 ? `${s.overdueCount} tasks are past due` : `you've closed ${s.completedCount} lately`;
		return { read: `Here's the honest shape of it: ${bit}. The cards below have the specifics.` };
	}

	try {
		const provider = getLLMProvider();
		const messages: ChatMessage[] = [{ role: 'user', content: `${factsBlock(result)}\n\nWrite your honest read.` }];
		const response = await provider.chat(messages, { systemPrompt: SYSTEM_PROMPT, maxTokens: 220, temperature: 0.6 });
		const read = (response?.content || '').trim().replace(/^["']|["']$/g, '');
		if (read) return { read };
	} catch (err: any) {
		console.warn('[mirror/reflect] llm failed:', err?.message);
	}
	return { read: '' };
});
