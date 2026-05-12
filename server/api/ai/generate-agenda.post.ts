/**
 * AI Meeting Agenda Generator.
 *
 * Takes the user's brief (whatever they typed into the description field)
 * plus available meeting context (project, client, lead, attendees) and
 * returns a structured HTML agenda the modal previews above the brief.
 * The user can Accept (replaces description) or Dismiss.
 */
import { readItem } from '@directus/sdk';
import { getLLMProvider } from '~~/server/utils/llm/factory';
import { enforceTokenLimits } from '~~/server/utils/ai-token-enforcement';
import type { ChatMessage } from '~~/server/utils/llm/types';
import { sanitizeAgendaHtml, AGENDA_ALLOWED_TAGS } from '~~/shared/sanitize-html';

interface GenerateAgendaBody {
	organizationId: string;
	title?: string;
	/** The user's brief — short statement of intent. Becomes the prompt steering. */
	brief?: string;
	durationMinutes?: number;
	projectId?: string | null;
	leadId?: string | number | null;
	attendeeNames?: string[];
}

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const body = await readBody<GenerateAgendaBody>(event);
	if (!body?.organizationId) {
		throw createError({ statusCode: 400, message: 'organizationId is required' });
	}

	const tokenCheck = await enforceTokenLimits(event, body.organizationId);
	if (!tokenCheck.allowed) {
		throw createError({ statusCode: tokenCheck.statusCode || 402, message: tokenCheck.reason || 'Token limit reached' });
	}

	const directus = await getUserDirectus(event);

	// Hydrate project + client so the agenda can speak in terms of the
	// actual work being discussed, not just the meeting title.
	let projectTitle: string | null = null;
	let clientName: string | null = null;
	if (body.projectId) {
		try {
			const proj = await directus.request(
				readItem('projects', body.projectId, { fields: ['title', 'description', 'client.name'] as any }),
			) as any;
			projectTitle = proj?.title || null;
			clientName = typeof proj?.client === 'object' ? proj?.client?.name || null : null;
		} catch {}
	}

	// Lead context (stage + contact name) tilts the agenda toward sales motion
	// vs. project-execution motion.
	let leadContact: string | null = null;
	let leadStage: string | null = null;
	if (body.leadId) {
		try {
			const lead = await directus.request(
				readItem('leads', body.leadId as any, { fields: ['stage', 'related_contact.first_name', 'related_contact.last_name'] as any }),
			) as any;
			leadStage = lead?.stage || null;
			const c = lead?.related_contact;
			if (c) leadContact = `${c.first_name || ''} ${c.last_name || ''}`.trim() || null;
		} catch {}
	}

	const provider = getLLMProvider();
	const systemPrompt = buildAgendaPrompt({
		title: body.title || 'Meeting',
		brief: body.brief || '',
		durationMinutes: body.durationMinutes || 30,
		projectTitle,
		clientName,
		leadContact,
		leadStage,
		attendeeNames: body.attendeeNames || [],
	});

	const messages: ChatMessage[] = [{
		role: 'user',
		content: 'Generate the agenda now.',
	}];

	try {
		const response = await provider.chat(messages, {
			systemPrompt,
			maxTokens: 1024,
			temperature: 0.6,
		});

		const raw = response.content.trim().replace(/^```html?\n?/, '').replace(/\n?```$/, '');
		const clean = sanitizeAgendaHtml(raw, AGENDA_ALLOWED_TAGS);
		return { html: clean };
	} catch (err: any) {
		console.error('[ai/generate-agenda] LLM error:', err);
		throw createError({ statusCode: 500, message: 'Failed to generate agenda. Please try again.' });
	}
});

function buildAgendaPrompt(ctx: {
	title: string;
	brief: string;
	durationMinutes: number;
	projectTitle: string | null;
	clientName: string | null;
	leadContact: string | null;
	leadStage: string | null;
	attendeeNames: string[];
}): string {
	const contextLines: string[] = [`Title: ${ctx.title}`, `Duration: ${ctx.durationMinutes} minutes`];
	if (ctx.projectTitle) contextLines.push(`Project: ${ctx.projectTitle}`);
	if (ctx.clientName) contextLines.push(`Client: ${ctx.clientName}`);
	if (ctx.leadContact) contextLines.push(`Lead contact: ${ctx.leadContact}${ctx.leadStage ? ` (stage: ${ctx.leadStage})` : ''}`);
	if (ctx.attendeeNames.length) contextLines.push(`Attendees: ${ctx.attendeeNames.join(', ')}`);

	const briefBlock = ctx.brief?.trim()
		? `\n\nThe host wrote this brief — let it steer the agenda:\n"""\n${ctx.brief.trim()}\n"""`
		: '\n\nNo brief was provided — infer the agenda from the title and context.';

	return `You are an executive assistant drafting a meeting agenda for the host.

CONTEXT:
${contextLines.join('\n')}${briefBlock}

OUTPUT RULES:
- Return ONLY HTML — no JSON, no markdown fences, no surrounding prose.
- Use ONLY these tags: <h3>, <h4>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <br>. No <html>, <body>, <head>, no inline styles, no classes, no scripts.
- Structure: one short <p> framing the goal (1 sentence), then a numbered agenda as <ol> with 3–6 items. Each <li> starts with a short topic (optionally bolded), then a brief description.
- Add an optional "Decisions & next steps" <h4> + <ul> at the end if relevant.
- Right-size to the duration: 15min = 3 items, 30min = 4 items, 60min = 5–6 items.
- Use specific nouns from the context (project name, client name, lead's name) — not generic placeholders.
- Do not invent attendees, deliverables, or facts that aren't in the brief or context. If the brief is empty and there is no project/lead context, keep items generic and short.
- Tone: direct, host-facing, no fluff.`;
}
