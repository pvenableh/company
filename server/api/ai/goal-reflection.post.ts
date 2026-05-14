/**
 * AI goal reflection — Stage 1.5 foundation, Stage 2.5 batch mode.
 *
 * Two body shapes:
 *   1. Single goal (Stage 1.5):  { goal, snapshots, organizationId? }
 *   2. Batch (Stage 2.5):        { goals: [{ goal, snapshots }], organizationId? }
 *
 * Batch mode kicks in when `goals.length > 1`. A `goals` array of length 1
 * also works — it just renders a single-goal reflection through the same
 * code path. We pick the prompt template based on count.
 *
 * Stays out of Lattice's lane (see `feedback_goal_coaching_lattice_line.md`):
 * - Grounded in user's actual data (snapshots, deadline, category) — never
 *   generic self-help.
 * - No "your manager wants this" stance; speaks from the user's own goals.
 * - Reflection only — no judgments, ratings, performance comparisons.
 */
import { getLLMProvider } from '~~/server/utils/llm/factory';
import { enforceTokenLimits } from '~~/server/utils/ai-token-enforcement';
import type { ChatMessage } from '~~/server/utils/llm/types';

interface GoalInput {
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
}

interface SnapshotInput {
	value: number;
	notes?: string | null;
	date_created?: string | null;
}

interface ReflectionInput {
	// Single-goal body (back-compat with Stage 1.5)
	goal?: GoalInput;
	snapshots?: SnapshotInput[];
	// Batch body (Stage 2.5)
	goals?: Array<{ goal: GoalInput; snapshots?: SnapshotInput[] }>;
	/** Optional org id for token-pool enforcement. */
	organizationId?: string;
}

const SINGLE_PROMPT = `You are reflecting back to a user on their own goal — like a coach who only knows what the data shows, never generic advice.

Output rules:
- Exactly 2 sentences. No more, no less. No preamble like "Here's a reflection:" or "Great job!"
- First sentence: state where they are, factually, using their numbers.
- Second sentence: one specific, data-grounded observation or next-step — what to watch for, what to try, what the trend implies. NEVER generic ("keep going!", "stay focused").
- Speak to the user directly ("you", not "the user"). Friendly but matter-of-fact.
- If the data shows stagnation, name it honestly. If it shows momentum, name that.
- Never reference managers, teams above the user, or performance comparisons. This is the user's own goal.
- Never moralize about wellbeing/learning goals — treat them like any other goal with a number and a deadline.`;

const BATCH_PROMPT = `You are reflecting back to a user on their weekly check-in across several of their own goals — like a coach who only knows what the data shows, never generic advice.

Output rules:
- 2 to 3 sentences. No preamble, no sign-off, no bullet lists.
- Look across the batch: where's momentum, where's stagnation, what's the throughline. Use specific numbers from at least one goal when it sharpens the point.
- One sentence should name a notable pattern across goals (e.g. "wellbeing moved while revenue didn't", "everything ticked up a little"). Avoid empty summaries like "you made progress on some goals."
- Speak to the user directly ("you", not "the user"). Friendly but matter-of-fact.
- Never reference managers, teams above the user, or performance comparisons. These are the user's own goals.
- Never moralize about wellbeing/learning goals — treat them like any other goal with a number and a deadline.
- If snapshots include notes ("what changed this week"), let those inform the reflection but do not quote them verbatim.`;

function fmtUnit(unit: string | null | undefined, n: number | null | undefined): string {
	if (n == null) return '?';
	const u = unit || '';
	if (u === 'USD' || u === '$') return `$${Number(n).toLocaleString()}`;
	if (u === '%' || u === 'percent') return `${n}%`;
	return `${Number(n).toLocaleString()}${u ? ` ${u}` : ''}`;
}

function describeGoal(goal: GoalInput, snapshots: SnapshotInput[]): string[] {
	const lines: string[] = [];
	lines.push(`GOAL: "${goal.title}"`);
	if (goal.description) lines.push(`Description: ${goal.description}`);
	if (goal.category) lines.push(`Category: ${goal.category}`);
	if (goal.scope) lines.push(`Scope: ${goal.scope}`);

	const target = Number(goal.target_value);
	const current = Number(goal.current_value || 0);
	if (target) {
		const pct = Math.round((current / target) * 100);
		lines.push(`Progress: ${fmtUnit(goal.target_unit, current)} / ${fmtUnit(goal.target_unit, target)} (${pct}%)`);
	}

	if (goal.end_date) {
		const days = Math.ceil((new Date(goal.end_date).getTime() - Date.now()) / 86400000);
		if (days < 0) lines.push(`Deadline: ${goal.end_date} (overdue by ${Math.abs(days)} days)`);
		else lines.push(`Deadline: ${goal.end_date} (${days} days remaining)`);
	} else if (goal.timeframe) {
		lines.push(`Timeframe: ${goal.timeframe}`);
	}

	if (snapshots.length > 0) {
		lines.push('Recent snapshots (oldest first):');
		const recent = snapshots.slice(-5);
		for (const s of recent) {
			const date = s.date_created ? s.date_created.slice(0, 10) : '—';
			const note = s.notes ? ` — "${s.notes}"` : '';
			lines.push(`  ${date}: ${fmtUnit(goal.target_unit, s.value)}${note}`);
		}
	}
	return lines;
}

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const body = await readBody<ReflectionInput>(event);

	// Normalize to a goals[] array regardless of which body shape arrived.
	const items: Array<{ goal: GoalInput; snapshots: SnapshotInput[] }> = [];
	if (Array.isArray(body?.goals) && body!.goals!.length > 0) {
		for (const it of body!.goals!) {
			if (it?.goal?.title) items.push({ goal: it.goal, snapshots: it.snapshots || [] });
		}
	} else if (body?.goal?.title) {
		items.push({ goal: body.goal, snapshots: body.snapshots || [] });
	}

	if (items.length === 0) {
		throw createError({ statusCode: 400, message: 'goal.title or goals[].goal.title is required' });
	}

	const tokenCheck = await enforceTokenLimits(event, body.organizationId);
	if (!tokenCheck.allowed) {
		throw createError({
			statusCode: tokenCheck.statusCode || 402,
			message: tokenCheck.reason || 'Token limit reached',
		});
	}

	const provider = getLLMProvider();
	const isBatch = items.length > 1;
	const systemPrompt = isBatch ? BATCH_PROMPT : SINGLE_PROMPT;

	let userMessage: string;
	if (isBatch) {
		const blocks: string[] = [];
		items.forEach((it, i) => {
			blocks.push(`--- Goal ${i + 1} ---`);
			blocks.push(...describeGoal(it.goal, it.snapshots));
		});
		userMessage = `Weekly check-in across ${items.length} of the user's personal goals.\n\n${blocks.join('\n')}\n\nReflect on the batch in 2–3 sentences.`;
	} else {
		const lines = describeGoal(items[0].goal, items[0].snapshots);
		userMessage = `${lines.join('\n')}\n\nReflect on this goal in exactly 2 sentences.`;
	}

	const messages: ChatMessage[] = [{ role: 'user', content: userMessage }];

	try {
		const response = await provider.chat(messages, {
			systemPrompt,
			maxTokens: isBatch ? 320 : 200,
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
