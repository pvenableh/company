/**
 * Per-recipient touch personalizer.
 *
 * Takes the BASE marketing_touch (subject + preview + body) and a single
 * contact's CRM context, returns a personalized version for that one recipient.
 * Worker calls this once per pending variant.
 *
 * Prompt-cache strategy:
 *   - Block 1 (cached): SYSTEM_PROMPT — personalization rubric.
 *   - Block 2 (cached, breakpoint): per-touch stable context — org name, voice
 *     descriptors, base touch (subject/preview/body/CTA). Same string for every
 *     contact in the same touch, so reads hit cache for contacts 2..N within
 *     the 5-min TTL.
 *   - User message (uncached): per-contact CRM facts.
 *
 * Within a single worker batch (~25 contacts processed back-to-back), this
 * gives 1 cache write + N-1 cache reads. Across cron ticks the cache is lost
 * (~5 min between ticks if pending volume is high), but per-tick reuse is
 * what dominates the cost.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { PerContactContext } from '../marketing-facts/build-personalize-context';
import type { ResolvedVoice } from './dormant-clients';
import { NEUTRAL_VOICE } from './dormant-clients';

const MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;
export const PERSONALIZE_PROMPT_VERSION = 'personalize_v1.0';

// ─── Tool ──────────────────────────────────────────────────────────────────

const producePersonalizedTouchTool: Anthropic.Tool = {
	name: 'produce_personalized_touch',
	description:
		'Produce a one-recipient personalized version of an email touch. Use the per-contact context to ' +
		'tailor the opener, body, and (optionally) subject. Stay in the same voice, length, and CTA as the base.',
	input_schema: {
		type: 'object' as const,
		properties: {
			subject: {
				type: 'string',
				maxLength: 80,
				description:
					'Personalized subject. May be the same as base if no contact-specific hook fits, but prefer a small ' +
					'tweak when the context supports it.',
			},
			preview_text: { type: 'string', maxLength: 110 },
			body_markdown: {
				type: 'string',
				description:
					'80-180 words. Already-personalized — write the recipient name directly (no {{first_name}} placeholder). ' +
					'Open with something specific to this contact when their context provides a hook; otherwise stay close to base.',
			},
			personalization_signals_used: {
				type: 'array',
				items: { type: 'string' },
				description:
					'Short labels for which per-contact facts you actually leveraged ' +
					'(e.g. "last_project", "open_lead", "company"). Empty array if you stayed close to base.',
			},
		},
		required: ['subject', 'preview_text', 'body_markdown', 'personalization_signals_used'],
	},
};

// ─── Prompts ───────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are personalizing a marketing email for ONE specific recipient.

You are given a base draft of an email touch (subject, preview, body) plus a
small bundle of CRM facts about a single recipient. Produce a one-recipient
version that feels written for them — without sounding like a mail-merge.

CORE RULES — non-negotiable:
- Write the recipient's first name directly into the body. No {{first_name}}
  placeholder in the output. If first_name is missing, use a warm fallback
  ("Hi there,") and DO NOT invent a name.
- Stay within ±20% of the base body length. Don't add a paragraph that the
  base doesn't justify.
- Keep the same CTA/ask as the base. Don't substitute a different action.
- Match the voice fingerprint precisely. Use the same formality + warmth as
  the base.
- Only reference per-contact facts that appear in PER_CONTACT_CONTEXT below.
  Do NOT invent past projects, companies, or interactions. If context is
  sparse, stay close to the base draft — a slight tweak beats a fabrication.

WHAT TO PERSONALIZE:
- Opener: when the contact has a specific hook (last project, open lead,
  recent engagement, company), reference it naturally in the first sentence
  or two.
- Body: weave in 1 (max 2) per-contact details that make the email feel
  written for them. Don't enumerate facts.
- Subject: tweak only when a contact-specific angle materially improves it.
  "Same as base" is a valid choice. Track small subject changes in
  personalization_signals_used as "subject_tweak".

WHAT NOT TO PERSONALIZE:
- The CTA framing (book_call vs reply vs view_portfolio is fixed).
- The cadence/timing (this generator doesn't touch send_offset).
- Voice/tone shifts. Same voice as base, every time.
- Don't surface internal categorization ("you are a 'prospect' in our system")
  or anything that breaks the fourth wall.

EDGE CASES:
- If the per-contact context is essentially empty (no notes, no project, no
  lead), produce a near-identical version of the base with just the
  first_name substituted. Set personalization_signals_used to [].
- If the base body has {{first_name}} in it, replace with the contact's
  first_name. If first_name is null, use "there".

CALL produce_personalized_touch EXACTLY ONCE. No prose response.`;

// ─── Render the per-touch (cached) block ───────────────────────────────────

export interface BaseTouchForPersonalization {
	subject: string;
	preview_text: string;
	body_markdown: string;
	cta: string;
}

function renderPerTouchBlock(args: {
	orgName: string;
	orgIndustry: string;
	voice: ResolvedVoice;
	base: BaseTouchForPersonalization;
}): string {
	const { orgName, orgIndustry, voice, base } = args;
	return `ORG
===
${orgName} — ${orgIndustry || 'small business'}

VOICE FINGERPRINT
=================
Formality: ${voice.formality}/100
Warmth: ${voice.warmth}/100
Energy: ${voice.energy}/100
Jargon level: ${voice.jargon_level}
Pronoun default: ${voice.pronoun_default}
Tone descriptors: ${voice.tone_descriptors.join(', ')}
Avoid phrases: ${voice.avoid_phrases.join(', ') || '(none)'}

BASE TOUCH (the email being personalized)
=========================================
Subject: ${base.subject}
Preview: ${base.preview_text}
CTA: ${base.cta}
Body:
---
${base.body_markdown}
---`;
}

function renderPerContactBlock(ctx: PerContactContext): string {
	const proj = ctx.last_project
		? `${ctx.last_project.title} (status: ${ctx.last_project.status}${ctx.last_project.completed_at ? `, completed ${ctx.last_project.completed_at.slice(0, 10)}` : ''})`
		: '(none on file)';
	const lead = ctx.open_lead
		? `${ctx.open_lead.stage || 'unknown stage'}${ctx.open_lead.project_type ? ` for ${ctx.open_lead.project_type}` : ''}`
		: '(no open lead)';
	const days = ctx.days_since_last_engagement === null
		? 'unknown'
		: `${ctx.days_since_last_engagement} days`;

	return `PER_CONTACT_CONTEXT
===================
First name: ${ctx.first_name || '(unknown — use "there")'}
Last name: ${ctx.last_name || '(unknown)'}
Company: ${ctx.company || '(none)'}
Title: ${ctx.title || '(none)'}
Category: ${ctx.category || '(uncategorized)'}
Days since last engagement: ${days}
Last project (with their company): ${proj}
Open lead: ${lead}
Notes (user-typed):
${ctx.notes_excerpt ? ctx.notes_excerpt : '(no notes)'}

Produce the personalized touch.`;
}

// ─── Anthropic call ────────────────────────────────────────────────────────

let _client: Anthropic | null = null;
function getClient(): Anthropic {
	if (_client) return _client;
	const config = useRuntimeConfig();
	const apiKey = (config as any).llm?.apiKey;
	if (!apiKey) {
		throw new Error('LLM API key not configured. Set NUXT_LLM_API_KEY or ANTHROPIC_API_KEY.');
	}
	_client = new Anthropic({ apiKey, maxRetries: 2 });
	return _client;
}

// ─── Validation ────────────────────────────────────────────────────────────

interface ToolOutput {
	subject: string;
	preview_text: string;
	body_markdown: string;
	personalization_signals_used: string[];
}

function wordCount(s: string): number {
	return s.trim().split(/\s+/).filter(Boolean).length;
}

function validate(output: ToolOutput, base: BaseTouchForPersonalization, voice: ResolvedVoice): string[] {
	const failures: string[] = [];

	if (!output.subject || output.subject.length > 80) {
		failures.push(`subject missing or > 80 chars`);
	}
	if (!output.body_markdown) {
		failures.push(`body missing`);
	} else {
		// Length within ±35% of base (looser than spec ±20% to avoid retry churn).
		const baseWc = wordCount(base.body_markdown);
		const newWc = wordCount(output.body_markdown);
		if (baseWc > 0) {
			const ratio = newWc / baseWc;
			if (ratio < 0.55 || ratio > 1.55) {
				failures.push(`body length ${newWc} words drifted too far from base ${baseWc} words (ratio ${ratio.toFixed(2)})`);
			}
		}
		// Stray placeholder scan — output should NOT contain {{...}}.
		const stray = output.body_markdown.match(/\{\{[^}]+\}\}/g);
		if (stray && stray.length > 0) {
			failures.push(`output contains unresolved placeholders: ${stray.join(', ')}`);
		}
	}

	const haystack = [output.subject, output.preview_text, output.body_markdown].join('\n').toLowerCase();
	for (const phrase of voice.avoid_phrases.map((p) => p.toLowerCase())) {
		if (phrase && haystack.includes(phrase)) {
			failures.push(`avoid_phrase used: "${phrase}"`);
		}
	}

	return failures;
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface RunPersonalizeArgs {
	organizationId: string;
	orgName: string;
	orgIndustry?: string;
	voice?: ResolvedVoice;
	base: BaseTouchForPersonalization;
	contactContext: PerContactContext;
	dryRun?: boolean;
}

export interface RunPersonalizeResult {
	subject: string;
	preview_text: string;
	body_markdown: string;
	personalization_signals_used: string[];
	inputTokens: number;
	outputTokens: number;
	durationMs: number;
	promptVersion: string;
	model: string;
	retried: boolean;
	dryRun: boolean;
}

/**
 * Dry-run output: a deterministic, no-AI version that just substitutes the
 * first name into the base. Used when MARKETING_PERSONALIZE_DRY_RUN=true so
 * the cron pipeline can be exercised end-to-end without burning tokens.
 */
function dryRunResult(args: RunPersonalizeArgs): RunPersonalizeResult {
	const start = Date.now();
	const first = args.contactContext.first_name?.trim() || 'there';
	const swap = (s: string) => s.replace(/\{\{first_name\}\}/g, first);
	return {
		subject: swap(args.base.subject),
		preview_text: swap(args.base.preview_text),
		body_markdown: swap(args.base.body_markdown),
		personalization_signals_used: ['dry_run_first_name_only'],
		inputTokens: 0,
		outputTokens: 0,
		durationMs: Date.now() - start,
		promptVersion: PERSONALIZE_PROMPT_VERSION + '-dryrun',
		model: 'dry-run',
		retried: false,
		dryRun: true,
	};
}

export async function runPersonalizeTouch(args: RunPersonalizeArgs): Promise<RunPersonalizeResult> {
	if (args.dryRun) return dryRunResult(args);

	const start = Date.now();
	const voice = args.voice || NEUTRAL_VOICE;
	const perTouchBlock = renderPerTouchBlock({
		orgName: args.orgName,
		orgIndustry: args.orgIndustry || 'small business',
		voice,
		base: args.base,
	});
	const perContactBlock = renderPerContactBlock(args.contactContext);

	// Two cached blocks: system prompt + per-touch stable context. Anthropic's
	// cache matches a contiguous prefix; the per-touch block hits cache when
	// processing contacts 2..N for the SAME touch within ~5 min.
	const systemBlocks: Anthropic.MessageCreateParams['system'] = [
		{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } } as any,
		{ type: 'text', text: perTouchBlock, cache_control: { type: 'ephemeral' } } as any,
	];

	const client = getClient();
	const callOnce = async (retryNote?: string) => {
		const userText = retryNote
			? `${perContactBlock}\n\nPREVIOUS ATTEMPT REJECTED:\n${retryNote}\nProduce a corrected version now.`
			: perContactBlock;
		const response = await client.messages.create({
			model: MODEL,
			max_tokens: MAX_TOKENS,
			system: systemBlocks,
			tools: [producePersonalizedTouchTool],
			tool_choice: { type: 'tool', name: producePersonalizedTouchTool.name } as any,
			messages: [{ role: 'user', content: userText }],
		});
		const toolBlock = response.content.find((b: any) => b.type === 'tool_use');
		if (!toolBlock) throw new Error('Personalize generator did not return a tool_use block');
		const usage = response.usage as any;
		const inputTokens =
			(usage?.input_tokens || 0) +
			(usage?.cache_read_input_tokens || 0) +
			(usage?.cache_creation_input_tokens || 0);
		return {
			output: (toolBlock as any).input as ToolOutput,
			inputTokens,
			outputTokens: usage?.output_tokens || 0,
		};
	};

	let totalInput = 0;
	let totalOutput = 0;
	let result = await callOnce();
	totalInput += result.inputTokens;
	totalOutput += result.outputTokens;

	let failures = validate(result.output, args.base, voice);
	let retried = false;
	if (failures.length > 0) {
		retried = true;
		result = await callOnce(`- ${failures.join('\n- ')}`);
		totalInput += result.inputTokens;
		totalOutput += result.outputTokens;
		failures = validate(result.output, args.base, voice);
		if (failures.length > 0) {
			throw createError({
				statusCode: 502,
				message: `Personalize failed validation after retry: ${failures.join('; ')}`,
			});
		}
	}

	return {
		subject: result.output.subject,
		preview_text: result.output.preview_text,
		body_markdown: result.output.body_markdown,
		personalization_signals_used: result.output.personalization_signals_used || [],
		inputTokens: totalInput,
		outputTokens: totalOutput,
		durationMs: Date.now() - start,
		promptVersion: PERSONALIZE_PROMPT_VERSION,
		model: MODEL,
		retried,
		dryRun: false,
	};
}
