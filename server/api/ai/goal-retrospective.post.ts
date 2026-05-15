/**
 * AI goal retrospective — Stage 8.
 *
 * Multi-goal long-form reflection across a time window (month or quarter).
 * Differs from `goal-reflection`:
 *   - longer (5–8 sentences vs 2–3)
 *   - groups goals by category/scope and looks across time, not just snapshots
 *   - emits {patterns, wins, blockers, suggested_focus} structured output
 *
 * Stays within the Lattice line per feedback_goal_coaching_lattice_line.md —
 * grounded in user data only, no performance grading, no manager framing.
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
	start_date?: string | null;
	status?: string | null;
	snapshots?: Array<{ value: number; notes?: string | null; date_created?: string | null }>;
	template_id?: string | null;
}

interface RetrospectiveInput {
	timeframe: 'month' | 'quarter';
	periodStart: string; // ISO date
	periodEnd: string;
	goals: GoalInput[];
	organizationId?: string;
}

const SYSTEM_PROMPT = `You are reflecting back to a user on a multi-goal retrospective — a coach reading their actual data over the last month or quarter. Stay tight, specific, and human.

Output strictly as JSON matching this shape:
{
  "summary": "<3–5 sentence prose reflection across the goals — patterns, not platitudes>",
  "patterns": ["<one sentence pattern>", ...],          // 2–4 items
  "wins": ["<one sentence specific win>", ...],          // 1–3 items
  "blockers": ["<one sentence honest blocker>", ...],    // 1–3 items
  "suggested_focus": ["<one concrete next move>", ...]   // 1–3 items
}

Rules:
- Speak directly to the user ("you", not "the user").
- Every line must reference real data (a number, a goal title, a category, a streak). Never write "you should focus more" or "stay consistent." No platitudes.
- Patterns should bridge across goals (e.g. "your wellbeing goals moved every week while your revenue goals plateaued").
- Wins acknowledge specific outcomes, not effort. "You shipped X" beats "you worked hard."
- Blockers name what is actually stuck. Don't soften.
- Suggested focus is one sentence of next-move, not a plan.
- Never reference managers, performance reviews, or HR framing — these are the user's own goals.
- Never moralize about wellbeing/learning categories.

Return ONLY the JSON object. No prose before or after. No code fences.`;

function fmtUnit(unit: string | null | undefined, n: number | null | undefined): string {
	if (n == null) return '?';
	const u = unit || '';
	if (u === 'USD' || u === '$') return `$${Number(n).toLocaleString()}`;
	if (u === 'percent') return `${n}%`;
	return `${Number(n).toLocaleString()}${u ? ` ${u}` : ''}`;
}

function describeGoal(g: GoalInput): string {
	const lines: string[] = [];
	lines.push(`GOAL "${g.title}"`);
	if (g.scope || g.category) lines.push(`Scope: ${g.scope || '—'} · Category: ${g.category || '—'}`);
	if (g.status) lines.push(`Status: ${g.status}`);
	if (g.template_id) lines.push(`Template: ${g.template_id}`);
	const target = Number(g.target_value);
	const current = Number(g.current_value || 0);
	if (target) {
		const pct = Math.round((current / target) * 100);
		lines.push(`Progress: ${fmtUnit(g.target_unit, current)} / ${fmtUnit(g.target_unit, target)} (${pct}%)`);
	}
	if (g.end_date) {
		const days = Math.ceil((new Date(g.end_date).getTime() - Date.now()) / 86_400_000);
		lines.push(`Deadline: ${g.end_date} (${days >= 0 ? `${days}d left` : `overdue ${Math.abs(days)}d`})`);
	}
	const snaps = g.snapshots || [];
	if (snaps.length > 0) {
		const inWindow = snaps.slice(-8);
		lines.push(`Recent snapshots (${inWindow.length}):`);
		for (const s of inWindow) {
			const d = s.date_created ? s.date_created.slice(0, 10) : '—';
			const note = s.notes ? ` — "${s.notes.slice(0, 60)}"` : '';
			lines.push(`  ${d}: ${fmtUnit(g.target_unit, s.value)}${note}`);
		}
	} else {
		lines.push('Recent snapshots: none in window');
	}
	return lines.join('\n');
}

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

	const body = await readBody<RetrospectiveInput>(event);
	const timeframe = body?.timeframe === 'quarter' ? 'quarter' : 'month';
	if (!Array.isArray(body?.goals) || body.goals.length === 0) {
		throw createError({ statusCode: 400, message: 'goals[] is required' });
	}

	const tokenCheck = await enforceTokenLimits(event, body.organizationId);
	if (!tokenCheck.allowed) {
		throw createError({
			statusCode: tokenCheck.statusCode || 402,
			message: tokenCheck.reason || 'Token limit reached',
		});
	}

	const provider = getLLMProvider();
	const blocks: string[] = [];
	blocks.push(`Retrospective window: last ${timeframe} (${body.periodStart} → ${body.periodEnd})`);
	blocks.push(`Goals in window: ${body.goals.length}`);
	body.goals.forEach((g, i) => {
		blocks.push(`\n--- Goal ${i + 1} ---`);
		blocks.push(describeGoal(g));
	});

	const userMessage = `${blocks.join('\n')}\n\nReflect on this retrospective per the JSON shape.`;
	const messages: ChatMessage[] = [{ role: 'user', content: userMessage }];

	try {
		const response = await provider.chat(messages, {
			systemPrompt: SYSTEM_PROMPT,
			maxTokens: 900,
			temperature: 0.6,
		});

		const raw = (response.content || '').trim();
		const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
		let parsed: any;
		try {
			parsed = JSON.parse(cleaned);
		} catch {
			return {
				summary: raw,
				patterns: [],
				wins: [],
				blockers: [],
				suggested_focus: [],
				raw,
			};
		}
		return {
			summary: parsed.summary || '',
			patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
			wins: Array.isArray(parsed.wins) ? parsed.wins : [],
			blockers: Array.isArray(parsed.blockers) ? parsed.blockers : [],
			suggested_focus: Array.isArray(parsed.suggested_focus) ? parsed.suggested_focus : [],
		};
	} catch (err: any) {
		console.error('AI retrospective error:', err);
		throw createError({ statusCode: 500, message: 'Failed to generate retrospective' });
	}
});
