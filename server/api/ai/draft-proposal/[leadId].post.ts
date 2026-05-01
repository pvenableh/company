/**
 * Draft a proposal from a lead.
 *
 * Pulls the lead's full context (contact, company, prior activities,
 * sourced-attribution, etc.) plus the org's `service_templates` library,
 * and asks the LLM to produce a structured proposal draft (title, scope
 * notes, total, valid_until). The client opens ProposalsFormModal pre-
 * filled with the draft so the user can review + tweak before saving.
 */
import { readItem, readItems } from '@directus/sdk';
import { getLLMProvider } from '~~/server/utils/llm/factory';
import { getEntityContext } from '~~/server/utils/entity-context';
import { logAIUsage } from '~~/server/utils/ai-usage';
import { enforceTokenLimits } from '~~/server/utils/ai-token-enforcement';
import type { ChatMessage } from '~~/server/utils/llm/types';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

interface DraftResult {
	title: string;
	notes: string;
	total_value: number | null;
	valid_until: string | null;
	suggested_template_id: string | null;
	suggested_template_name: string | null;
}

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

	const leadIdRaw = getRouterParam(event, 'leadId');
	const leadId = leadIdRaw ? Number(leadIdRaw) : NaN;
	if (!Number.isFinite(leadId)) throw createError({ statusCode: 400, message: 'Invalid leadId' });

	const directus = getTypedDirectus();

	// Look up the lead and validate the caller belongs to its organization.
	const lead = await directus.request(
		readItem('leads', leadId, {
			fields: [
				'id', 'organization', 'notes', 'estimated_value', 'project_type', 'timeline', 'source',
				'related_contact.first_name', 'related_contact.last_name', 'related_contact.email',
				'related_contact.company',
			],
		}),
	).catch(() => null) as any;
	if (!lead) throw createError({ statusCode: 404, message: 'Lead not found' });
	if (!lead.organization) throw createError({ statusCode: 422, message: 'Lead has no organization' });
	await requireOrgMembership(event, lead.organization);

	// Token budget check.
	const tokenCheck = await enforceTokenLimits(event, lead.organization);
	if (!tokenCheck.allowed) {
		throw createError({
			statusCode: tokenCheck.statusCode || 402,
			message: tokenCheck.reason || 'AI token limit reached',
		});
	}

	// Pull org's published service templates.
	const templates = await directus.request(
		readItems('service_templates', {
			fields: ['id', 'name', 'category', 'description', 'scope_template', 'default_total', 'default_duration_days'],
			filter: {
				organization: { _eq: lead.organization },
				status: { _eq: 'published' },
			},
			sort: ['name'],
			limit: 50,
		}),
	) as any[];

	// Rich lead context (contacts, prior activities, sourced attribution).
	const leadContext = await getEntityContext('lead', String(leadId), lead.organization).catch(() => '');

	const systemPrompt = buildSystemPrompt(templates, leadContext, lead);
	const messages: ChatMessage[] = [
		{
			role: 'user',
			content: 'Draft a proposal for this lead. Pick the most appropriate service template (or none if nothing fits well), then adapt it to the lead\'s specific situation.',
		},
	];

	const provider = getLLMProvider();
	let parsed: DraftResult;
	try {
		const response = await provider.chat(messages, {
			systemPrompt,
			maxTokens: 2048,
			temperature: 0.6,
		});

		// Best-effort token logging.
		if (response.usage) {
			logAIUsage({
				organizationId: lead.organization,
				userId,
				feature: 'draft-proposal',
				model: response.model,
				inputTokens: response.usage.inputTokens,
				outputTokens: response.usage.outputTokens,
			}).catch(() => {});
		}

		let content = response.content.trim();
		if (content.startsWith('```')) {
			content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
		}
		parsed = JSON.parse(content);
	} catch (err: any) {
		console.error('[ai/draft-proposal] LLM error:', err);
		throw createError({ statusCode: 502, message: 'AI failed to produce a usable draft. Try again.' });
	}

	// Light post-processing.
	if (!parsed.title?.trim()) parsed.title = `Proposal — ${contactDisplay(lead) || 'New lead'}`;
	if (parsed.total_value != null && typeof parsed.total_value !== 'number') {
		parsed.total_value = Number(String(parsed.total_value).replace(/[^0-9.\-]/g, '')) || null;
	}
	if (!parsed.valid_until) parsed.valid_until = thirtyDaysFromNow();

	return parsed;
});

function buildSystemPrompt(templates: any[], leadContext: string, lead: any): string {
	const templateBlock = templates.length
		? templates.map((t, i) => `Template ${i + 1} (id=${t.id}):
- Name: ${t.name}
- Category: ${t.category || 'other'}
- Description: ${t.description || '(none)'}
- Default total: ${t.default_total != null ? `$${t.default_total}` : '(unset)'}
- Default duration: ${t.default_duration_days ? `${t.default_duration_days} days` : '(unset)'}
- Scope copy:
${t.scope_template || '(empty)'}`).join('\n\n')
		: '(No templates configured. Draft the proposal from scratch using the lead context.)';

	return `You are an expert proposal writer for a creative/professional services agency. Your job is to draft a clear, professional proposal from a lead's context, using one of the org's saved service templates as a starting point when one fits.

Output STRICT JSON — no markdown, no commentary, no code fences — matching this exact shape:
{
  "title": "string (concise, e.g. 'Brand Identity — Atlas Fintech')",
  "notes": "string (proposal scope. plain text, paragraphs separated by blank lines. cover: overview, deliverables, timeline, terms. tailor to the lead's industry, brief, and any cues from the activity log. don't invent facts not in the context.)",
  "total_value": number | null (use the chosen template's default_total when one fits, or null if you can't price confidently),
  "valid_until": "YYYY-MM-DD" (30 days from today),
  "suggested_template_id": "string | null (the template id you used as the starting point, or null if you drafted from scratch)",
  "suggested_template_name": "string | null (matching name)"
}

ORG SERVICE TEMPLATES:
${templateBlock}

LEAD SUMMARY:
- Company/Contact: ${contactDisplay(lead) || '(no contact)'}
- Project type: ${lead.project_type || '(unspecified)'}
- Timeline cue: ${lead.timeline || '(unspecified)'}
- Source: ${lead.source || '(unspecified)'}
- Estimated value cue: ${lead.estimated_value ? `$${lead.estimated_value}` : '(none)'}
- Brief / notes: ${lead.notes || '(none provided)'}

LEAD CONTEXT (activities, prior conversations):
${leadContext || '(no additional context available)'}

RULES:
- Output JSON only. No explanations before or after.
- Keep notes professional, concise, agency-tone. Use 2nd-person addressing the client where natural ("we'll deliver…", "you'll receive…").
- If no template fits, set suggested_template_id and suggested_template_name to null and draft from scratch using the brief.
- Don't fabricate numbers. If unsure on price, set total_value to null and let the user decide.
- Today's date is ${new Date().toISOString().split('T')[0]}.`;
}

function contactDisplay(lead: any): string {
	const c = lead.related_contact;
	if (!c) return '';
	const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
	return [name, c.company].filter(Boolean).join(' / ');
}

function thirtyDaysFromNow(): string {
	const d = new Date();
	d.setDate(d.getDate() + 30);
	return d.toISOString().split('T')[0];
}
