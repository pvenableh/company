// server/api/home/read.get.ts
//
// Earnest's "deeper read" for the presence home — one warm, honest sentence or
// two over the top of the day, grounded strictly in the user's real personal
// agenda (their tasks + tickets, computed server-side). It's a progressive
// enhancement: the home shows an instant deterministic read first, then fades
// this richer voice in when it lands.
//
// Cheap by design — the client caches the result per day (localStorage), so this
// runs about once per user per morning; the org token gate is the backstop.

import { collectPersonalAgenda, type PersonalGroup } from '~~/server/utils/personal-agenda';
import { getLLMProvider } from '~~/server/utils/llm/factory';
import { enforceTokenLimits } from '~~/server/utils/ai-token-enforcement';
import type { ChatMessage } from '~~/server/utils/llm/types';

const SYSTEM_PROMPT = `You are Earnest, greeting someone at the very top of their working day — read from their real, current work. Write ONE honest sentence (two at the very most), speaking directly to them ("you").

Rules:
- Name what the day actually weighs the most on — the single heaviest thread — using a real number or name from the facts. Don't list everything; the dashboard below already does that.
- Warm and plain, like a sharp colleague who respects their time. Not a cheerleader, not a manager.
- Ground every specific in a provided number or title. Invent nothing.
- No platitudes ("let's crush it", "you've got this"), no scolding, no to-do list.
- If the day is genuinely light, say so honestly rather than manufacturing urgency.
- Return ONLY the sentence(s). No preamble, no quotes, no JSON, no code fences.`;

function factsBlock(groups: PersonalGroup[]): string {
	const lines: string[] = ['THEIR WORK RIGHT NOW:'];
	for (const g of groups) {
		const urgent = g.notices.filter((n) => n.priority === 'urgent').length;
		const high = g.notices.filter((n) => n.priority === 'high').length;
		const bits = [`${g.notices.length} open`];
		if (urgent) bits.push(`${urgent} overdue/urgent`);
		if (high) bits.push(`${high} due soon`);
		lines.push(`- ${g.label}: ${bits.join(', ')}`);
		const top = g.notices[0];
		if (top) lines.push(`  · heaviest: "${top.title}" — ${top.description}`);
	}
	return lines.join('\n');
}

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

	const orgId = (getQuery(event).orgId || '').toString();
	if (!orgId) return { read: '' };

	const directus = await getUserDirectus(event);
	const agenda = await collectPersonalAgenda(directus, orgId, userId).catch(() => null);

	// A genuinely clear morning — answer honestly, spend nothing.
	if (!agenda || agenda.totalNotices === 0) {
		return { read: "Nothing's pulling at you yet this morning — a clear runway. Start wherever you like." };
	}

	const gate = await enforceTokenLimits(event, orgId);
	if (!(gate as any).allowed) return { read: '' }; // deterministic read stands

	try {
		const provider = getLLMProvider();
		const messages: ChatMessage[] = [
			{ role: 'user', content: `${factsBlock(agenda.groups)}\n\nWrite your one honest read of their day.` },
		];
		const response = await provider.chat(messages, { systemPrompt: SYSTEM_PROMPT, maxTokens: 160, temperature: 0.6 });
		const read = (response?.content || '').trim().replace(/^["']|["']$/g, '');
		return { read: read || '' };
	} catch (err: any) {
		console.warn('[home/read] llm failed:', err?.message);
		return { read: '' };
	}
});
