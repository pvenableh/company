/**
 * AI goal reflection — Stage 1.5 "coachy" foundation.
 *
 * Given a goal + recent snapshots, return a 2-sentence reflection grounded
 * in the user's actual data. Used by:
 *   - Progress-update modal (Stage 1.5) — fires on save, shown inline + toast
 *   - Weekly check-in batch (Stage 2.5) — multi-goal mode planned
 *   - "Coach me" chat (Stage 8) — uses same data-grounding system prompt
 *
 * Stays out of Lattice's lane — see `feedback_goal_coaching_lattice_line.md`:
 * - Grounded in user's actual data (snapshots, deadline, category) — never
 *   generic self-help.
 * - No "your manager wants this" stance; speaks from the user's own goal.
 * - Reflection only — no judgments, ratings, or performance comparisons.
 */
import { getLLMProvider } from '~~/server/utils/llm/factory';
import { enforceTokenLimits } from '~~/server/utils/ai-token-enforcement';
import type { ChatMessage } from '~~/server/utils/llm/types';

interface ReflectionInput {
	goal: {
		id?: string;
		title: string;
		description?: string | null;
		category?: string | null;
		scope?: string | null;
		target_value?: number | null;
		target_unit?: string | null;
		current_value?: number | null;
		end_date?: string | null;
		timeframe?: string | null;
	};
	snapshots?: Array<{
		value: number;
		notes?: string | null;
		date_created?: string | null;
	}>;
	/** Optional org id for token-pool enforcement. */
	organizationId?: string;
}

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const body = await readBody<ReflectionInput>(event);
	if (!body?.goal?.title) {
		throw createError({ statusCode: 400, message: 'goal.title is required' });
	}

	const tokenCheck = await enforceTokenLimits(event, body.organizationId);
	if (!tokenCheck.allowed) {
		throw createError({
			statusCode: tokenCheck.statusCode || 402,
			message: tokenCheck.reason || 'Token limit reached',
		});
	}

	const provider = getLLMProvider();

	const systemPrompt = `You are reflecting back to a user on their own goal — like a coach who only knows what the data shows, never generic advice.

Output rules:
- Exactly 2 sentences. No more, no less. No preamble like "Here's a reflection:" or "Great job!"
- First sentence: state where they are, factually, using their numbers.
- Second sentence: one specific, data-grounded observation or next-step — what to watch for, what to try, what the trend implies. NEVER generic ("keep going!", "stay focused").
- Speak to the user directly ("you", not "the user"). Friendly but matter-of-fact.
- If the data shows stagnation, name it honestly. If it shows momentum, name that.
- Never reference managers, teams above the user, or performance comparisons. This is the user's own goal.
- Never moralize about wellbeing/learning goals — treat them like any other goal with a number and a deadline.`;

	const { goal, snapshots = [] } = body;

	const fmt = (n: number | null | undefined) => {
		if (n == null) return '?';
		const unit = goal.target_unit || '';
		if (unit === 'USD' || unit === '$') return `$${Number(n).toLocaleString()}`;
		if (unit === '%' || unit === 'percent') return `${n}%`;
		return `${Number(n).toLocaleString()}${unit ? ` ${unit}` : ''}`;
	};

	const lines: string[] = [];
	lines.push(`GOAL: "${goal.title}"`);
	if (goal.description) lines.push(`Description: ${goal.description}`);
	if (goal.category) lines.push(`Category: ${goal.category}`);
	if (goal.scope) lines.push(`Scope: ${goal.scope}`);

	const target = Number(goal.target_value);
	const current = Number(goal.current_value || 0);
	if (target) {
		const pct = Math.round((current / target) * 100);
		lines.push(`Progress: ${fmt(current)} / ${fmt(target)} (${pct}%)`);
	}

	if (goal.end_date) {
		const days = Math.ceil((new Date(goal.end_date).getTime() - Date.now()) / 86400000);
		if (days < 0) lines.push(`Deadline: ${goal.end_date} (overdue by ${Math.abs(days)} days)`);
		else lines.push(`Deadline: ${goal.end_date} (${days} days remaining)`);
	} else if (goal.timeframe) {
		lines.push(`Timeframe: ${goal.timeframe}`);
	}

	if (snapshots.length > 0) {
		lines.push('');
		lines.push('Recent snapshots (oldest first):');
		const recent = snapshots.slice(-5);
		for (const s of recent) {
			const date = s.date_created ? s.date_created.slice(0, 10) : '—';
			const note = s.notes ? ` — "${s.notes}"` : '';
			lines.push(`  ${date}: ${fmt(s.value)}${note}`);
		}
	}

	const userMessage = `${lines.join('\n')}\n\nReflect on this goal in exactly 2 sentences.`;

	const messages: ChatMessage[] = [{ role: 'user', content: userMessage }];

	try {
		const response = await provider.chat(messages, {
			systemPrompt,
			maxTokens: 200,
			temperature: 0.65,
		});
		const reflection = (response.content || '').trim();
		return { reflection };
	} catch (err: any) {
		console.error('AI goal reflection error:', err);
		throw createError({
			statusCode: 500,
			message: 'Failed to generate reflection',
		});
	}
});
