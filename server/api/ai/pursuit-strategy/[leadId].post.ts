/**
 * Pursuit strategist — when a lead's proposal has gone cold, Earnest reads the
 * full pursuit history (touchpoints + proposals) and drafts a fresh re-approach:
 * a short strategic read, a suggested next touchpoint, and an optional
 * trimmed-proposal angle. Returns structured JSON; the client can turn the
 * suggested touchpoint into a real one with one tap.
 */
import { readItem, readItems } from '@directus/sdk';
import { getLLMProvider } from '~~/server/utils/llm/factory';
import { getEntityContext } from '~~/server/utils/entity-context';
import { logAIUsage } from '~~/server/utils/ai-usage';
import { enforceTokenLimits } from '~~/server/utils/ai-token-enforcement';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import type { ChatMessage } from '~~/server/utils/llm/types';
import { proposalPursuitState } from '~~/shared/proposals';

interface ReApproach {
	strategic_read: string;
	next_touchpoint: { type: string; summary: string; note: string };
	proposal_angle: string | null;
}

const TOUCH_TYPES = ['email', 'call', 'text', 'meeting', 'note'];

export default defineEventHandler(async (event): Promise<ReApproach> => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

	const leadIdRaw = getRouterParam(event, 'leadId');
	const leadId = leadIdRaw ? Number(leadIdRaw) : NaN;
	if (!Number.isFinite(leadId)) throw createError({ statusCode: 400, message: 'Invalid leadId' });

	const directus = getTypedDirectus();
	const lead = await directus.request(
		readItem('leads', leadId, {
			fields: [
				'id', 'organization', 'notes', 'estimated_value', 'project_type', 'timeline', 'source', 'stage',
				'related_contact.first_name', 'related_contact.last_name', 'related_contact.company',
			],
		}),
	).catch(() => null) as any;
	if (!lead) throw createError({ statusCode: 404, message: 'Lead not found' });
	if (!lead.organization) throw createError({ statusCode: 422, message: 'Lead has no organization' });
	await requireOrgMembership(event, lead.organization);

	const tokenCheck = await enforceTokenLimits(event, lead.organization);
	if (!tokenCheck.allowed) {
		throw createError({ statusCode: tokenCheck.statusCode || 402, message: tokenCheck.reason || 'AI token limit reached' });
	}

	// Pursuit history: touchpoints/activity via the shared lead context, proposals
	// fetched separately (the lead context doesn't include them).
	const [leadContext, proposals] = await Promise.all([
		getEntityContext('lead', String(leadId), lead.organization).catch(() => ''),
		directus.request(readItems('proposals', {
			fields: ['id', 'title', 'total_value', 'proposal_status', 'date_sent', 'valid_until', 'outcome_reason'],
			filter: { lead: { _eq: leadId } }, sort: ['-date_created'], limit: 20,
		})).catch(() => []) as Promise<any[]>,
	]);

	const proposalLines = (proposals as any[]).map((p) => {
		const { state, isCold, daysOut } = proposalPursuitState(p);
		const val = p.total_value ? `$${Number(p.total_value).toLocaleString()}` : 'no value';
		const reason = p.outcome_reason ? `, reason: ${p.outcome_reason}` : '';
		return `- "${p.title || 'Proposal'}" (${val}) — ${state}${isCold ? ` (${daysOut}d silent)` : ''}${reason}`;
	}).join('\n') || '(no proposals on record)';

	const contactName = lead.related_contact
		? `${lead.related_contact.first_name || ''} ${lead.related_contact.last_name || ''}`.trim() : 'the contact';
	const company = lead.related_contact?.company || '';

	const systemPrompt = [
		'You are Earnest, a sharp, warm agency pursuit strategist. A deal has stalled or gone cold. Read the full pursuit history and propose a fresh re-approach that tries a DIFFERENT angle than what was already tried — not just "follow up again".',
		'',
		'Be specific and human. If prior touches got no response, change the medium or the framing. If a full-scope proposal stalled, suggest a smaller first step. Ground every suggestion in the actual history.',
		'',
		`LEAD: ${contactName}${company ? ` at ${company}` : ''} — stage: ${lead.stage || 'unknown'}, est. value: ${lead.estimated_value ? '$' + Number(lead.estimated_value).toLocaleString() : 'unknown'}${lead.project_type ? `, project: ${lead.project_type}` : ''}.`,
		lead.notes ? `NOTES: ${lead.notes}` : '',
		'',
		'PROPOSALS:',
		proposalLines,
		'',
		'PURSUIT HISTORY (activity / touchpoints):',
		leadContext || '(no recorded activity)',
		'',
		'Return ONLY a JSON object (no prose, no code fences) with exactly these fields:',
		'{',
		'  "strategic_read": "2-3 sentences: what happened, why it likely stalled, and the angle to try now.",',
		`  "next_touchpoint": { "type": one of ${JSON.stringify(TOUCH_TYPES)}, "summary": "short subject line for the touch", "note": "the actual message/script to send — ready to use, personalized, concise." },`,
		'  "proposal_angle": "one sentence: a trimmed or re-framed proposal idea (e.g. a phased phase-1), or null if not applicable."',
		'}',
	].filter(Boolean).join('\n');

	const messages: ChatMessage[] = [
		{ role: 'user', content: 'Draft a re-approach for this cold pursuit.' },
	];

	const provider = getLLMProvider();
	let parsed: any;
	try {
		const response = await provider.chat(messages, { systemPrompt, maxTokens: 1200, temperature: 0.7 });
		if (response.usage) {
			logAIUsage({
				event, endpoint: 'ai/pursuit-strategy', model: response.model,
				inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens,
				organizationId: lead.organization, metadata: { leadId },
			}).catch(() => {});
		}
		let content = response.content.trim();
		if (content.startsWith('```')) {
			content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
		}
		parsed = JSON.parse(content);
	} catch (err: any) {
		console.error('[ai/pursuit-strategy] LLM error:', err);
		throw createError({ statusCode: 502, message: 'Earnest could not draft a re-approach. Try again.' });
	}

	// Normalize + guard.
	const t = parsed?.next_touchpoint || {};
	const type = TOUCH_TYPES.includes(t.type) ? t.type : 'email';
	return {
		strategic_read: String(parsed?.strategic_read || '').trim(),
		next_touchpoint: {
			type,
			summary: String(t.summary || 'Re-approach').trim(),
			note: String(t.note || '').trim(),
		},
		proposal_angle: parsed?.proposal_angle ? String(parsed.proposal_angle).trim() : null,
	};
});
