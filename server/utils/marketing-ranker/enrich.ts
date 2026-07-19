// server/utils/marketing-ranker/enrich.ts
//
// The LLM ranker pass the deterministic v1 left as a TODO: turn each pick's
// templated `why_now` ("12 clients are dormant") into a sharp, specific line
// that leads with the OPPORTUNITY and the cost of waiting — grounded strictly
// in the candidate's real facts. Best-effort: any failure keeps the
// deterministic hook, so recommendations never regress or block the cron.

import { getLLMProvider } from '~~/server/utils/llm/factory';
import type { ChatMessage } from '~~/server/utils/llm/types';
import type { RankedRecommendation } from './select';

export const RANKER_LLM_VERSION = 'llm_whynow_v1';

const SYSTEM_PROMPT = `You rank a marketer's outreach opportunities and write the "why now" for each — the one sentence that makes them act.

You get, per opportunity, the card type and its REAL facts. Return ONLY a JSON array, one object per opportunity IN THE SAME ORDER:
[{ "why_now": "<one sharp sentence>", "urgency": <0-100> }]

Rules:
- Ground every sentence in the given facts (a count, a name, a gap in days, a project title). Never invent specifics.
- Lead with the OPPORTUNITY or the risk of waiting — not a restatement of the data. "12 clients who used to open everything have gone quiet for 3 months; re-warming them now costs far less than winning them back cold" beats "12 clients are dormant."
- Exactly one sentence. No emoji, no greeting, no clichés ("don't miss out", "act now", "leverage", "supercharge").
- urgency reflects real time-sensitivity × value, not just recency.
- Return ONLY the JSON array. No prose, no code fences.`;

function factsFor(r: RankedRecommendation): string {
	const c = r.candidate;
	const d = (c.candidate_data || {}) as any;
	const bits: string[] = [`type=${c.card_type}`, `impact=${c.impact_score}`, `recency_days=${c.recency_days}`];
	for (const [k, v] of Object.entries(d.signal || {})) {
		if (v != null && v !== 0 && v !== '') bits.push(`${k}=${v}`);
	}
	const aud = d.audience || {};
	if (aud.size) bits.push(`audience_size=${aud.size}`);
	if (Array.isArray(aud.sample_names) && aud.sample_names.length) bits.push(`names=${aud.sample_names.slice(0, 4).join(', ')}`);
	const cl = d.cluster || {};
	if (cl.label) bits.push(`cluster=${cl.label}`);
	if (d.deliverables) bits.push(`produces=${d.deliverables}`);
	bits.push(`current_hook="${c.why_now}"`);
	return bits.join('; ');
}

/**
 * Rewrite the ranked picks' why_now (and refine urgency) via one LLM call.
 * Mutates + returns `ranked`. Fully best-effort — on any error the picks keep
 * their deterministic hooks unchanged.
 */
export async function enrichRankedWhyNow(ranked: RankedRecommendation[]): Promise<RankedRecommendation[]> {
	if (!ranked.length) return ranked;
	try {
		const facts = ranked.map((r, i) => `OPPORTUNITY ${i + 1}: ${factsFor(r)}`).join('\n');
		const provider = getLLMProvider();
		const messages: ChatMessage[] = [{ role: 'user', content: `${facts}\n\nWrite the JSON array.` }];
		const res = await provider.chat(messages, { systemPrompt: SYSTEM_PROMPT, maxTokens: 420, temperature: 0.5 });
		const cleaned = (res?.content || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
		const arr = JSON.parse(cleaned);
		if (Array.isArray(arr)) {
			ranked.forEach((r, i) => {
				const o = arr[i];
				if (o && typeof o.why_now === 'string' && o.why_now.trim()) {
					r.rankerOutput.why_now = o.why_now.trim();
					if (typeof o.urgency === 'number' && Number.isFinite(o.urgency)) {
						r.rankerOutput.urgency = Math.max(0, Math.min(100, Math.round(o.urgency)));
					}
				}
			});
		}
	} catch (err: any) {
		console.warn('[marketing/ranker] why_now enrich failed, keeping deterministic hooks:', err?.message);
	}
	return ranked;
}
