/**
 * Draft a proposal from a lead.
 *
 * Composes a structured proposal from:
 *   - the lead's full context (contact, company, prior activities, sourced
 *     attribution) via getEntityContext
 *   - the org's published service_templates (the spine — pick one if any fits)
 *   - the org's published document_blocks library (bio, references,
 *     deliverables, terms, NDA, etc. — assemble what's relevant)
 *
 * Returns a structured draft (title, total, valid_until, blocks[]). The
 * client creates the proposal with these fields and navigates to the
 * detail page where BlockComposer takes over for review + edit.
 */
import { readItem, readItems } from '@directus/sdk';
import { getLLMProvider } from '~~/server/utils/llm/factory';
import { getEntityContext } from '~~/server/utils/entity-context';
import { logAIUsage } from '~~/server/utils/ai-usage';
import { enforceTokenLimits } from '~~/server/utils/ai-token-enforcement';
import type { ChatMessage } from '~~/server/utils/llm/types';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

interface BlockEntry {
	block_id: string | null;
	heading: string | null;
	content: string;
	page_break_after?: boolean;
}

interface DraftResult {
	title: string;
	total_value: number | null;
	valid_until: string | null;
	blocks: BlockEntry[];
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

	const tokenCheck = await enforceTokenLimits(event, lead.organization);
	if (!tokenCheck.allowed) {
		throw createError({
			statusCode: tokenCheck.statusCode || 402,
			message: tokenCheck.reason || 'AI token limit reached',
		});
	}

	const [templates, blockLibrary] = await Promise.all([
		directus.request(
			readItems('service_templates', {
				fields: ['id', 'name', 'category', 'description', 'scope_template', 'default_total', 'default_duration_days'],
				filter: {
					organization: { _eq: lead.organization },
					status: { _eq: 'published' },
				},
				sort: ['name'], limit: 50,
			}),
		) as Promise<any[]>,
		directus.request(
			readItems('document_blocks', {
				fields: ['id', 'name', 'category', 'description', 'content', 'applies_to'],
				filter: {
					organization: { _eq: lead.organization },
					status: { _eq: 'published' },
				},
				sort: ['category', 'name'], limit: 200,
			}),
		).then((rows: any[]) => rows.filter(
			// Directus 11's `json` field type doesn't support `_contains`,
			// so filter client-side. Empty applies_to defaults to "both".
			(b) => !b.applies_to || (Array.isArray(b.applies_to) && b.applies_to.includes('proposals')),
		)) as Promise<any[]>,
	]);

	const leadContext = await getEntityContext('lead', String(leadId), lead.organization).catch(() => '');

	const systemPrompt = buildSystemPrompt(templates, blockLibrary, leadContext, lead);
	const messages: ChatMessage[] = [
		{
			role: 'user',
			content: 'Compose a proposal for this lead. Pick a service template as the spine if any fits, assemble relevant library blocks (bio, references, terms, etc.), and draft custom blocks (scope/deliverables) tailored to the brief.',
		},
	];

	const provider = getLLMProvider();
	let parsed: DraftResult;
	try {
		const response = await provider.chat(messages, {
			systemPrompt, maxTokens: 4096, temperature: 0.6,
		});
		if (response.usage) {
			logAIUsage({
				organizationId: lead.organization, userId,
				feature: 'draft-proposal', model: response.model,
				inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens,
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

	if (!Array.isArray(parsed.blocks)) parsed.blocks = [];
	if (!parsed.title?.trim()) parsed.title = `Proposal — ${contactDisplay(lead) || 'New lead'}`;
	if (parsed.total_value != null && typeof parsed.total_value !== 'number') {
		parsed.total_value = Number(String(parsed.total_value).replace(/[^0-9.\-]/g, '')) || null;
	}
	if (!parsed.valid_until) parsed.valid_until = thirtyDaysFromNow();

	// Validate every block_id reference points to an actual library block
	// in this org. Drop bogus ones; keep content as inline.
	const validIds = new Set(blockLibrary.map((b) => b.id));
	// Build a heading-name index so we can recover library refs the LLM
	// dropped: when block_id is null but the heading matches a library
	// block name (case-insensitive, trimmed), restore the linkage.
	const libByName = new Map<string, string>();
	for (const b of blockLibrary) {
		const key = (b.name || '').trim().toLowerCase();
		if (key) libByName.set(key, b.id);
	}
	parsed.blocks = parsed.blocks.map((b) => {
		let blockId = b.block_id && validIds.has(b.block_id) ? b.block_id : null;
		if (!blockId && b.heading) {
			const matchId = libByName.get(b.heading.trim().toLowerCase());
			if (matchId) blockId = matchId;
		}
		return {
			block_id: blockId,
			heading: b.heading || null,
			content: b.content || '',
			page_break_after: !!b.page_break_after,
		};
	}).filter((b) => b.content.trim() || b.heading);

	return parsed;
});

function buildSystemPrompt(templates: any[], blocks: any[], leadContext: string, lead: any): string {
	const templateBlock = templates.length
		? templates.map((t, i) => `Template ${i + 1} (id=${t.id}):
- Name: ${t.name}
- Category: ${t.category || 'other'}
- Description: ${t.description || '(none)'}
- Default total: ${t.default_total != null ? `$${t.default_total}` : '(unset)'}
- Default duration: ${t.default_duration_days ? `${t.default_duration_days} days` : '(unset)'}
- Scope copy:
${t.scope_template || '(empty)'}`).join('\n\n')
		: '(No service templates configured. Compose blocks from scratch using the lead context.)';

	const blockLibraryBlock = blocks.length
		? blocks.map((b, i) => `Block ${i + 1} (id=${b.id}, category=${b.category}):
- Name: ${b.name}
- Description: ${b.description || '(none)'}
- Content:
${b.content || '(empty)'}`).join('\n\n')
		: '(No reusable blocks in the library yet.)';

	return `You are an expert proposal writer for a creative/professional services agency. You compose proposals as an ordered array of "blocks". Each block is either (a) a reference to a saved library block (use the block's existing content as-is, just include its id) or (b) a custom block you draft for this specific lead.

Output STRICT JSON — no markdown, no commentary, no code fences — matching this exact shape:
{
  "title": "string (concise, e.g. 'Brand Identity — Atlas Fintech')",
  "total_value": number | null,
  "valid_until": "YYYY-MM-DD",
  "suggested_template_id": "string | null",
  "suggested_template_name": "string | null",
  "blocks": [
    {
      "block_id": "uuid | null  (set ONLY when copying a library block verbatim — null for custom blocks you draft)",
      "heading": "string | null  (section heading shown above the content)",
      "content": "string  (markdown — the rendered body. when block_id is set, you may copy the library block's content here for reference but the renderer will use the library version)",
      "page_break_after": false
    }
  ]
}

ORG SERVICE TEMPLATES (pick one as the spine if any fits):
${templateBlock}

ORG DOCUMENT BLOCK LIBRARY (assemble these where relevant):
${blockLibraryBlock}

LEAD SUMMARY:
- Company/Contact: ${contactDisplay(lead) || '(no contact)'}
- Project type: ${lead.project_type || '(unspecified)'}
- Timeline cue: ${lead.timeline || '(unspecified)'}
- Source: ${lead.source || '(unspecified)'}
- Estimated value cue: ${lead.estimated_value ? `$${lead.estimated_value}` : '(none)'}
- Brief / notes: ${lead.notes || '(none provided)'}

LEAD CONTEXT (activities, prior conversations):
${leadContext || '(no additional context available)'}

COMPOSITION RULES:
- A typical proposal flows: [Cover/Intro] → [Bio (library)] → [Scope (custom, tailored)] → [Deliverables (library or custom)] → [Timeline (custom)] → [Pricing (custom)] → [References / Case studies (library)] → [Terms (library)].
- For each section, prefer a library block if one fits cleanly. For section content that doesn't have a matching library block (or where the library block is too generic), draft a custom block with the lead's context baked in.
- For library references, set block_id to the library uuid AND copy the content verbatim into the content field for the renderer fallback.
- For custom blocks, set block_id to null and write the content from scratch.
- Page breaks: typically one before References/Case studies and one before Terms — set page_break_after on the preceding block.
- Don't fabricate numbers. If unsure on price, set total_value to null.
- Don't use code fences anywhere in content. Plain markdown only (#/##/-/**bold**).
- Today's date is ${new Date().toISOString().split('T')[0]}.
- Output JSON only. No explanations before or after.`;
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
