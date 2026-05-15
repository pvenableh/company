/**
 * AI goal coach — Stage 8.
 *
 * Single-goal coaching surface invoked from the "Coach me" action on a
 * goal card. Returns a structured response shaped for the Coach modal:
 *
 *   { insight, questions, next_step }
 *
 * Differs from goal-reflection:
 *   - Looks at the *full* snapshot history (up to 12) and tries to spot
 *     a trend (acceleration, plateau, regression) before offering a move.
 *   - Pulls the template's `reflection_prompts` as scaffolding when the
 *     goal carries `metadata.template_id`. Templates frame the lens; the
 *     AI still grounds in data.
 *
 * Lattice-line rules (per feedback_goal_coaching_lattice_line.md):
 *   - Speak to the user about their own goal. No manager/HR framing.
 *   - Every line must reference real data. No platitudes.
 *   - Wellbeing/learning goals get the same factual treatment as revenue.
 */
import { getLLMProvider } from '~~/server/utils/llm/factory';
import { enforceTokenLimits } from '~~/server/utils/ai-token-enforcement';
import { getGoalTemplate } from '~~/shared/goal-templates';
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
	start_date?: string | null;
	timeframe?: string | null;
	template_id?: string | null;
}

interface SnapshotInput {
	value: number;
	notes?: string | null;
	date_created?: string | null;
}

interface CoachInput {
	goal: GoalInput;
	snapshots?: SnapshotInput[];
	organizationId?: string;
}

const SYSTEM_PROMPT = `You are coaching a user on one of their own goals. You only know what their data shows. You speak directly to them.

Output strictly as JSON matching:
{
  "insight": "<2–3 sentence pattern observation — what their numbers actually show, including a trend over time if the snapshots tell one>",
  "questions": ["<question>", ...],   // 2–4 items the user could sit with
  "next_step": "<one concrete move they can make this week, grounded in the data>"
}

Rules:
- Every sentence references real data: a number, a snapshot date, the deadline, the category.
- If snapshots show acceleration, name it. If they show a plateau, name it. If they show regression, name it without softening.
- Questions should be specific to this goal, not generic. Use the user's domain vocabulary from their title/description.
- next_step is one sentence, concrete enough that the user knows what to do tomorrow.
- Speak to the user directly ("you", not "the user").
- Never reference managers, performance reviews, or HR framing.
- Never moralize about wellbeing/learning categories.
- If reflection_prompts are provided in the user message, treat them as lens hints — use the spirit, do NOT echo them.

Return ONLY the JSON. No prose. No code fences.`;

function fmtUnit(unit: string | null | undefined, n: number | null | undefined): string {
	if (n == null) return '?';
	const u = unit || '';
	if (u === 'USD' || u === '$') return `$${Number(n).toLocaleString()}`;
	if (u === 'percent' || u === '%') return `${n}%`;
	return `${Number(n).toLocaleString()}${u ? ` ${u}` : ''}`;
}

function describeGoal(goal: GoalInput, snapshots: SnapshotInput[]): string {
	const lines: string[] = [];
	lines.push(`GOAL: "${goal.title}"`);
	if (goal.description) lines.push(`Description: ${goal.description}`);
	lines.push(`Category: ${goal.category || 'custom'} · Scope: ${goal.scope || 'user'}`);
	const target = Number(goal.target_value);
	const current = Number(goal.current_value || 0);
	if (target) {
		const pct = Math.round((current / target) * 100);
		lines.push(`Progress: ${fmtUnit(goal.target_unit, current)} / ${fmtUnit(goal.target_unit, target)} (${pct}%)`);
	}
	if (goal.start_date) lines.push(`Started: ${goal.start_date}`);
	if (goal.end_date) {
		const days = Math.ceil((new Date(goal.end_date).getTime() - Date.now()) / 86_400_000);
		lines.push(`Deadline: ${goal.end_date} (${days >= 0 ? `${days}d remaining` : `overdue ${Math.abs(days)}d`})`);
	} else if (goal.timeframe) {
		lines.push(`Timeframe: ${goal.timeframe}`);
	}

	if (snapshots.length > 0) {
		lines.push(`Check-ins (${snapshots.length}, oldest first):`);
		const recent = snapshots.slice(-12);
		for (const s of recent) {
			const date = s.date_created ? s.date_created.slice(0, 10) : '—';
			const note = s.notes ? ` — "${s.notes.slice(0, 80)}"` : '';
			lines.push(`  ${date}: ${fmtUnit(goal.target_unit, s.value)}${note}`);
		}
	} else {
		lines.push('Check-ins: none yet');
	}

	if (goal.template_id) {
		const tpl = getGoalTemplate(goal.template_id);
		if (tpl) {
			lines.push(`\nTemplate: ${tpl.name} ("${tpl.tagline}")`);
			lines.push('Reflection prompts (lens hints — do not echo verbatim):');
			for (const p of tpl.reflection_prompts) lines.push(`  - ${p}`);
		}
	}

	return lines.join('\n');
}

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

	const body = await readBody<CoachInput>(event);
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
	const userMessage = describeGoal(body.goal, body.snapshots || []);
	const messages: ChatMessage[] = [{ role: 'user', content: userMessage }];

	try {
		const response = await provider.chat(messages, {
			systemPrompt: SYSTEM_PROMPT,
			maxTokens: 700,
			temperature: 0.6,
		});
		const raw = (response.content || '').trim();
		const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
		try {
			const parsed = JSON.parse(cleaned);
			return {
				insight: parsed.insight || '',
				questions: Array.isArray(parsed.questions) ? parsed.questions : [],
				next_step: parsed.next_step || '',
			};
		} catch {
			return { insight: raw, questions: [], next_step: '' };
		}
	} catch (err: any) {
		console.error('AI goal coach error:', err);
		throw createError({ statusCode: 500, message: 'Failed to generate coaching' });
	}
});
