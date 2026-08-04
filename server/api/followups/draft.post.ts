// server/api/followups/draft.post.ts
//
// "Draft with Earnest" for a priority-card follow-up. Given a cold proposal,
// overdue lead, or a CardDesk contact, the LLM writes a short, personalised
// follow-up (subject + body) grounded in that record — replacing the static
// template skeleton. Best-effort: any failure returns null so the caller falls
// back to the template draft.

import { readItem } from '@directus/sdk';
import { getLLMProvider } from '~~/server/utils/llm/factory';
import { EARNEST_VOICE_CHARTER } from '~~/server/utils/llm/voice';

interface Body {
	kind: 'proposal' | 'lead' | 'carddesk';
	refId: string;
	orgId?: string | null;
	toName?: string | null;
}

function firstJson(text: string): any | null {
	if (!text) return null;
	const a = text.indexOf('{');
	const b = text.lastIndexOf('}');
	if (a === -1 || b === -1 || b < a) return null;
	try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}

async function contextFor(kind: string, refId: string): Promise<{ block: string; toName: string | null }> {
	const directus = getServerDirectus();
	try {
		if (kind === 'proposal') {
			const p: any = await directus.request(readItem('proposals' as any, refId, {
				fields: ['title', 'total_value', 'date_sent', 'notes', 'contact.first_name', 'contact.last_name', 'contact.company', 'organization.name'] as any,
			}));
			const c = p?.contact;
			return {
				toName: c?.first_name || null,
				block: [
					`This is a proposal follow-up.`,
					p?.title && `Proposal: ${p.title}`,
					p?.total_value && `Value: $${Number(p.total_value).toLocaleString()}`,
					p?.date_sent && `Sent on: ${p.date_sent} (client hasn't replied)`,
					c?.company && `Client company: ${c.company}`,
					p?.organization?.name && `From (our org): ${p.organization.name}`,
				].filter(Boolean).join('\n'),
			};
		}
		if (kind === 'lead') {
			const l: any = await directus.request(readItem('leads' as any, refId, {
				fields: ['source', 'notes', 'estimated_value', 'related_contact.first_name', 'related_contact.last_name', 'related_contact.company', 'organization.name'] as any,
			}));
			const c = l?.related_contact;
			return {
				toName: c?.first_name || null,
				block: [
					`This is a sales-lead follow-up (the scheduled follow-up date has passed).`,
					l?.source && `Lead source: ${l.source}`,
					l?.estimated_value && `Estimated value: $${Number(l.estimated_value).toLocaleString()}`,
					c?.company && `Contact company: ${c.company}`,
					l?.notes && `Internal notes (do NOT quote to the client): ${String(l.notes).slice(0, 300)}`,
				].filter(Boolean).join('\n'),
			};
		}
		// carddesk
		const cc: any = await directus.request(readItem('cd_contacts' as any, refId, {
			fields: ['name', 'first_name', 'company', 'objective', 'industry', 'notes', 'met_at'] as any,
		}));
		return {
			toName: cc?.first_name || null,
			block: [
				`This is a networking follow-up to reconnect with a contact.`,
				cc?.company && `Company: ${cc.company}`,
				cc?.industry && `Industry: ${cc.industry}`,
				cc?.objective && `My goal with them: ${cc.objective}`,
				cc?.met_at && `Where we met: ${cc.met_at}`,
			].filter(Boolean).join('\n'),
		};
	} catch {
		return { block: '', toName: null };
	}
}

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	if (!(session as any).user?.id) throw createError({ statusCode: 401, message: 'Authentication required' });

	const b = (await readBody(event).catch(() => ({}))) as Body;
	if (!b?.kind || !b?.refId) throw createError({ statusCode: 400, message: 'kind and refId are required' });

	try {
		const ctx = await contextFor(b.kind, b.refId);
		const name = (b.toName || ctx.toName || '').trim();

		const system = [
			EARNEST_VOICE_CHARTER,
			'',
			'You write a SHORT follow-up email FROM the user TO a client/contact — warm, professional, and specific to the situation below. First person, second person to the recipient. No hype, no invented facts, no internal notes leaked. 2–4 short sentences, ending with a light call to action (e.g. suggest a quick call). No signature block (the user\'s mail client adds theirs).',
			'Return ONLY JSON: {"subject": "<=8 words", "body": "the email body, greeting included"}',
		].join('\n');
		const user = `Recipient first name: ${name || '(unknown — use "Hi there,")'}\n\n${ctx.block || 'Limited context — keep it a brief, friendly check-in.'}`;

		const res = await Promise.race([
			getLLMProvider().chat([{ role: 'user', content: user }], { systemPrompt: system, maxTokens: 500 }),
			new Promise<null>((r) => setTimeout(() => r(null), 15_000)),
		]);
		const parsed = firstJson((res as any)?.content || '');
		if (parsed?.subject && parsed?.body) {
			return { ok: true, subject: String(parsed.subject).trim().slice(0, 140), body: String(parsed.body).trim().slice(0, 2000) };
		}
		return { ok: false };
	} catch (err: any) {
		console.warn('[followups/draft] failed:', err?.message || err);
		return { ok: false };
	}
});
