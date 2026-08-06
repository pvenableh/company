// server/utils/motivational-digest-ai.ts
//
// In-repo AI composition for the motivational digest. The model writes only the
// PROSE — subject, heading, and the opening line — grounded in the real numbers
// we hand it. The structured data cards (Work/People/Money/Marketing, the
// scoreboard, every figure + link) stay deterministic, so the LLM frames but
// never invents (per the Earnest voice charter).
//
// Fully best-effort: any failure (no API key, timeout, malformed JSON) returns
// null and the caller falls back to the deterministic template copy.

import { getLLMProvider } from './llm/factory';
import { EARNEST_VOICE_CHARTER } from './llm/voice';
import type { DigestPayload } from './motivational-digest';

export interface DigestCopy {
	subject: string;
	heading: string;
	lead: string;
}

/** A compact, factual digest of the payload — numbers only, for the model to frame. */
function summarize(p: DigestPayload): string {
	const lines: string[] = [];
	const isActions = p.lean;
	// When leading with the action list, the opener frames a to-do list, so lead
	// with the actual tasks (all of them, in priority order) and demote the
	// score/wins framing.
	if (isActions && p.suggestions.length) {
		lines.push(`Top priorities to tackle today (in order): ${p.suggestions.map((s) => s.title).join('; ')}.`);
	}
	if (p.score && !isActions) lines.push(`Earnest score ${p.score.currentScore} (${p.score.levelTitle}), ${p.score.streak}-day streak, ${p.score.daysActiveThisWeek} active days this week.`);
	if (p.wins.any && !isActions) lines.push(`Recent wins: ${p.wins.tasksDone} tasks done, ${p.wins.ticketsClosed} tickets closed${p.wins.sampleTitle ? `, e.g. "${p.wins.sampleTitle}"` : ''}.`);
	if (p.suggestions.length && !isActions) lines.push(`Top suggested actions: ${p.suggestions.slice(0, 3).map((s) => s.title).join('; ')}.`);
	const s = p.sections;
	if (s.projects?.active || s.tasks || s.tickets) lines.push(`Work: ${s.projects?.active ?? 0} active projects, ${s.tasks ? `${s.tasks.overdue} overdue + ${s.tasks.dueSoon} due-soon tasks` : 'no task data'}, ${s.tickets?.open ?? 0} open tickets.`);
	if (s.clients || s.crm) lines.push(`People: ${s.clients?.total ?? 0} clients${s.crm?.leads ? `, ${s.crm.leads.open} open leads worth $${s.crm.leads.pipelineValue}` : ''}${s.crm?.leads?.overdueFollowUps ? ` (${s.crm.leads.overdueFollowUps} follow-ups overdue)` : ''}${s.feedback ? `, ${s.feedback.csatCount} client ratings avg ${s.feedback.csatAvg}` : ''}.`);
	if (s.proposals || s.contracts || s.invoices) {
		const bits: string[] = [];
		if (s.proposals) bits.push(`$${s.proposals.liveValue} in proposals out for review${s.proposals.cold ? `, ${s.proposals.cold} gone cold` : ''}`);
		if (s.contracts?.awaitingSignature) bits.push(`${s.contracts.awaitingSignature} contracts awaiting signature`);
		if (s.invoices) bits.push(`$${s.invoices.outstanding} unpaid${s.invoices.overdueCount ? ` (${s.invoices.overdueCount} overdue)` : ''}${s.invoices.collectedThisWeek ? `, $${s.invoices.collectedThisWeek} collected this week` : ''}`);
		if (bits.length) lines.push(`Money: ${bits.join('; ')}.`);
	}
	if (s.marketing) lines.push(`Marketing: ${s.marketing.studioCreated} Studio pieces created${s.marketing.inReview ? `, ${s.marketing.inReview} in review` : ''}${s.marketing.emails ? `, ${s.marketing.emails} email campaigns` : ''}.`);
	return lines.join('\n') || 'Very little activity to report.';
}

/** Pull the first JSON object out of a model response (tolerates code fences). */
function extractJson(text: string): any | null {
	if (!text) return null;
	const start = text.indexOf('{');
	const end = text.lastIndexOf('}');
	if (start === -1 || end === -1 || end < start) return null;
	try {
		return JSON.parse(text.slice(start, end + 1));
	} catch {
		return null;
	}
}

const TONE_GUIDE: Record<string, string> = {
	motivational: 'Monday, fresh week — a genuine, energising lift. Point at the single best first move.',
	wins: 'Friday — celebrate the real wins of the week, warmly, then a light look ahead.',
	forward: 'A weekday morning — calm and forward-looking; help them see their next move.',
};

// Action-list style overrides the celebratory pull of TONE_GUIDE: the body is a
// prioritized checklist, so the opener must be crisp and forward, not a recap.
const ACTION_STYLE_GUIDE =
	'IMPORTANT — this is an ACTION-LIST digest: the body below your opener is a prioritized checklist of concrete things to do today. Write a crisp, practical, action-forward opener that orients them to their top priorities and nudges them to start on the first one. Do NOT celebrate, recap wins, or mention the score — keep it forward-looking. The subject should read like a to-do list for the day (e.g. "Your action list for today").';

/**
 * Compose the digest's subject/heading/lead with the LLM. Returns null on any
 * failure so the caller keeps the deterministic template copy.
 */
export async function composeDigestCopy(payload: DigestPayload, firstName: string): Promise<DigestCopy | null> {
	try {
		const provider = getLLMProvider();
		const name = (firstName || '').trim() || 'there';
		const isActions = payload.lean;

		const system = [
			EARNEST_VOICE_CHARTER,
			'',
			`You are Earnest, writing ONLY the opening of a short daily/weekly ${isActions ? 'action-list' : 'summary'} digest email for one person on an agency team.`,
			'You are given the real, already-computed numbers. Frame them warmly and honestly — never invent, inflate, or restate figures the data does not contain. The email body already lists every number and link; your job is the human opener, not a data dump.',
			`Tone for today: ${TONE_GUIDE[payload.tone] || TONE_GUIDE.forward}`,
			...(isActions ? ['', ACTION_STYLE_GUIDE] : []),
			'',
			'Return ONLY a JSON object, no prose around it:',
			`{"subject": "<=8 words, may include one tasteful emoji", "heading": "<=6 words", "lead": "1-2 ${isActions ? 'crisp, action-forward' : 'warm'} sentences, second person, addressed to the person by first name"}`,
			'The lead must not list more than one specific number; save the rest for the cards below it.',
		].join('\n');

		const user = `First name: ${name}\nOrg: ${payload.orgName || 'their agency'}\n\nToday's real data:\n${summarize(payload)}`;

		// Hard per-call timeout — the Anthropic SDK's own timeout is minutes, but
		// this runs inside a 60s Vercel cron, so a single hung call must not eat the
		// whole invocation. On timeout we resolve null → template fallback.
		const res = await Promise.race([
			provider.chat([{ role: 'user', content: user }], { systemPrompt: system, maxTokens: 400 }),
			new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000)),
		]);
		if (!res) {
			console.warn('[digest-ai] LLM call timed out — using template copy');
			return null;
		}

		const parsed = extractJson(res?.content || '');
		if (parsed && parsed.subject && parsed.heading && parsed.lead) {
			return {
				subject: String(parsed.subject).trim().slice(0, 120),
				heading: String(parsed.heading).trim().slice(0, 80),
				lead: String(parsed.lead).trim().slice(0, 500),
			};
		}
		return null;
	} catch (err: any) {
		console.warn('[digest-ai] compose failed, falling back to template copy:', err?.message || err);
		return null;
	}
}
