/**
 * Dormant-clients generator — produces 1-3 touches (emails + optionally one
 * social) to re-engage high-value clients who've gone quiet.
 *
 * Architecture:
 *   - Direct @anthropic-ai/sdk call (the existing llm/factory wrapper is
 *     text-only; this needs tool use).
 *   - Tool schema: produce_dormant_outreach. The model is forced to call it
 *     exactly once.
 *   - Prompt caching: the system prompt + voice fingerprint sit behind an
 *     ephemeral cache breakpoint so per-org cadence is paid once per ~5 min.
 *   - Post-hoc validation: facts grounding, avoid-phrases, placeholder scan.
 *     One retry on hard failures.
 *
 * Wired by server/api/marketing/recommendations/[id]/generate.post.ts.
 * Spec: docs/marketing/specs/dormant-generator.md
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
	DraftedCampaign,
	DraftedTouch,
} from '~/composables/useMarketingDrafts';
import type {
	AudienceFilter,
	EmailCTA,
	SocialChannel,
} from '~~/shared/marketing-persistence';
import type { AvailableFact } from '../marketing-facts/build-dormant-facts';

// Spec calls for claude-sonnet-4-6 (voice match + tone discipline). Haiku
// underperforms on the no-desperation rule. LLM_MODEL env can override.
const MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = 2048;
const PROMPT_VERSION = 'dormant_v1.0';

// ─── Voice fingerprint (neutral default) ────────────────────────────────────

export interface ResolvedVoice {
	voice_summary: string;
	formality: number;
	warmth: number;
	energy: number;
	jargon_level: 'low' | 'mid' | 'high';
	pronoun_default: 'we' | 'i' | 'mixed' | 'avoided';
	signature_phrases: string[];
	avoid_phrases: string[];
	tone_descriptors: string[];
	example_paragraphs: string[];
}

export const NEUTRAL_VOICE: ResolvedVoice = {
	voice_summary: 'Default voice — clear, warm-but-professional, low jargon.',
	formality: 50,
	warmth: 60,
	energy: 45,
	jargon_level: 'low',
	pronoun_default: 'we',
	signature_phrases: [],
	avoid_phrases: [
		'circle back',
		'circling back',
		'synergy',
		'leverage',
		'best-in-class',
		'passionate about',
		"we're so excited",
		'just checking in',
		'touching base',
		'we miss you',
	],
	tone_descriptors: ['professional', 'warm-but-direct', 'specific'],
	example_paragraphs: [],
};

export function getResolvedVoice(_organizationId: string): ResolvedVoice {
	// Voice fingerprint subsystem is designed but not yet built. Returns the
	// neutral default for v1; swap for real lookup when ingestion ships.
	return NEUTRAL_VOICE;
}

// ─── Candidate shape (read off marketing_recommendations.candidate_data) ─────

export interface DormantCandidate {
	signal: {
		contact_count?: number;
		avg_days_since_contact?: number;
		longest_gap_days?: number;
		tier?: string;
		lifetime_revenue_usd?: number;
	};
	audience: {
		size: number;
		sample_names: string[];
		contact_ids?: string[];
	};
}

// ─── Tool schema ────────────────────────────────────────────────────────────

const produceDormantOutreachTool: Anthropic.Tool = {
	name: 'produce_dormant_outreach',
	description:
		'Produce 1-3 touches (emails and optionally one social post) to re-engage dormant ' +
		'high-value clients. Lead with value, not gap.',
	input_schema: {
		type: 'object' as const,
		properties: {
			touches: {
				type: 'array',
				minItems: 1,
				maxItems: 3,
				items: {
					type: 'object',
					properties: {
						kind: { type: 'string', enum: ['email', 'social'] },
						send_offset_hours: {
							type: 'integer',
							minimum: 0,
							maximum: 168,
							description: 'Hours from campaign start. 0 = launch immediately.',
						},
						email: {
							type: 'object',
							description: 'Required if kind=email.',
							properties: {
								subject: { type: 'string', maxLength: 60 },
								preview_text: { type: 'string', maxLength: 90 },
								body_markdown: {
									type: 'string',
									description:
										'80-150 words. Markdown allowed (paragraphs, one optional list). ' +
										'Use {{first_name}} for personalization. Never hardcode names from sample_names.',
								},
								cta: {
									type: 'string',
									enum: [
										'book_call',
										'reply',
										'view_portfolio',
										'view_case_study',
										'reply_with_question',
									],
								},
								audience_filter: {
									type: 'string',
									enum: ['all', 'opened_previous', 'unopened_previous'],
								},
							},
							required: ['subject', 'preview_text', 'body_markdown', 'cta', 'audience_filter'],
						},
						social: {
							type: 'object',
							description: 'Required if kind=social.',
							properties: {
								channel: { type: 'string', enum: ['linkedin', 'instagram', 'twitter'] },
								caption: {
									type: 'string',
									maxLength: 600,
									description:
										'LinkedIn: 100-300 words, first line is hook, no link in body, max 2 hashtags. ' +
										'Instagram: 50-150 words. Twitter: under 280 chars.',
								},
								image_brief: {
									type: 'string',
									maxLength: 200,
									description: 'Description of what the image should show. Not a generation prompt.',
								},
							},
							required: ['channel', 'caption', 'image_brief'],
						},
					},
					required: ['kind', 'send_offset_hours'],
				},
			},
			cadence_rationale: { type: 'string', maxLength: 240 },
			facts_used: {
				type: 'array',
				items: { type: 'string' },
				description:
					'Fact IDs from available_facts that were referenced in copy. Used for grounding validation.',
			},
		},
		required: ['touches', 'cadence_rationale', 'facts_used'],
	},
};

// ─── Prompts ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are drafting a re-engagement campaign for a small business reaching
out to high-value clients who haven't been in contact for some time.
Produce 1-2 emails (and optionally one social post) that bring these
clients back into conversation without sounding desperate, salesy,
or generic.

GROUNDING — non-negotiable:
- You may ONLY reference projects, services, wins, or testimonials
  that appear in available_facts. Never invent a past project or
  capability. If available_facts is sparse, write more abstractly
  rather than fabricating specifics.
- Every fact ID you reference in copy must appear in your facts_used
  output array.
- Use {{first_name}} for the recipient's name. Do not hardcode names
  from sample_names — those are illustrative only.

TONE:
- "Re-engagement" is not "we miss you." The latter is desperation.
- Lead with value or news, not the gap. ("Saw something that reminded
  me of what we built together" beats "It's been a while.")
- Match the voice fingerprint precisely. Formality > 60: formal
  address, complete sentences. Warmth > 70: first-person, contractions,
  direct questions allowed. Jargon level: don't exceed it.
- Use signature_phrases when natural. Never use avoid_phrases.

OPENERS TO AVOID:
- "We miss you" / "It's been a while" / "Long time no see"
- "Just checking in" / "Touching base" / "Circling back"
- "Hope you're doing well" as an opener (allowed mid-email)
- Any opener that announces the gap before saying anything else

OPENERS THAT WORK:
- Reference a recent specific event from available_facts
- Lead with a question grounded in their past project
- Mention something you noticed/built/learned that reminded you of them

EMAIL STRUCTURE:
- Subject: 30-60 chars, specific, intriguing, no clickbait, no
  all-caps, no urgency tricks ("Last chance"), no emoji unless voice
  fingerprint shows past emoji use.
- Body: 80-150 words. One clear CTA matching the cta field.
- Preview text: complements subject, doesn't repeat it.

SOCIAL STRUCTURE:
- LinkedIn: 100-300 words, hook first, no link in body (deprioritized).
- First sentence must work as a stand-alone hook in the feed.
- Image brief: describe what to show, not how to render it.

CADENCE GUIDANCE:
- Touch 1: send_offset_hours 0-24 (Tue/Wed morning preferred).
- Touch 2 (email follow-up): send_offset_hours 96-120, audience_filter
  unopened_previous if applicable.
- Social: send_offset_hours 24-72, complements but doesn't duplicate
  email content.

CALL produce_dormant_outreach EXACTLY ONCE. No prose response.`;

function renderUserMessage(args: {
	orgName: string;
	orgIndustry: string;
	voice: ResolvedVoice;
	candidate: DormantCandidate;
	facts: AvailableFact[];
}): string {
	const { orgName, orgIndustry, voice, candidate, facts } = args;
	const sig = voice.signature_phrases.length ? voice.signature_phrases.join(', ') : '(none)';
	const avoid = voice.avoid_phrases.length ? voice.avoid_phrases.join(', ') : '(none)';
	const examples = voice.example_paragraphs.length
		? voice.example_paragraphs.slice(0, 3).join('\n---\n')
		: '(no example paragraphs available — write to the tone descriptors)';

	const audSize = candidate.audience?.size ?? 0;
	const avgDays = candidate.signal?.avg_days_since_contact ?? '?';
	const longestGap = candidate.signal?.longest_gap_days ?? '?';
	const tier = candidate.signal?.tier ?? 'high_value';
	const ltv = candidate.signal?.lifetime_revenue_usd ?? 0;

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
Signature phrases: ${sig}
Avoid phrases: ${avoid}
Tone descriptors: ${voice.tone_descriptors.join(', ')}

Example paragraphs in this voice:
---
${examples}

CANDIDATE
=========
Audience: ${audSize} high-value clients (referenced as {{first_name}} in copy)
Average days since last contact: ${avgDays}
Longest gap: ${longestGap} days
Tier: ${tier}
Lifetime revenue (audience total): $${typeof ltv === 'number' ? ltv.toLocaleString() : ltv}

AVAILABLE FACTS (only these may be referenced in copy)
======================================================
${JSON.stringify(facts, null, 2)}

CONSTRAINTS
===========
Channels: email + optionally one social
Touch count: 2-3

Produce the campaign.`;
}

// ─── Validation ─────────────────────────────────────────────────────────────

interface ToolOutput {
	touches: Array<{
		kind: 'email' | 'social';
		send_offset_hours: number;
		email?: {
			subject: string;
			preview_text: string;
			body_markdown: string;
			cta: EmailCTA;
			audience_filter: 'all' | 'opened_previous' | 'unopened_previous';
		};
		social?: {
			channel: SocialChannel;
			caption: string;
			image_brief: string;
		};
	}>;
	cadence_rationale: string;
	facts_used: string[];
}

interface ValidationResult {
	hardFailures: string[]; // require retry
	warnings: string[]; // logged, not retried
}

function wordCount(s: string): number {
	return s.trim().split(/\s+/).filter(Boolean).length;
}

function validate(output: ToolOutput, facts: AvailableFact[], voice: ResolvedVoice): ValidationResult {
	const hard: string[] = [];
	const warn: string[] = [];

	const factIds = new Set(facts.map((f) => f.id));
	for (const id of output.facts_used || []) {
		if (!factIds.has(id)) {
			hard.push(`facts_used contains unknown id "${id}"`);
		}
	}

	const avoidLower = voice.avoid_phrases.map((p) => p.toLowerCase());
	const allCopy: string[] = [];
	for (const t of output.touches || []) {
		if (t.kind === 'email' && t.email) {
			allCopy.push(t.email.subject, t.email.preview_text, t.email.body_markdown);
			if (t.email.subject.length > 60) hard.push(`subject exceeds 60 chars: "${t.email.subject}"`);
			const wc = wordCount(t.email.body_markdown);
			if (wc < 60 || wc > 180) warn.push(`email body word count ${wc} outside 80-150 (touch +${t.send_offset_hours}h)`);
			// Stray placeholder scan — only {{first_name}} allowed.
			const placeholders = (t.email.body_markdown.match(/\{\{[^}]+\}\}/g) || []).filter(
				(m) => m !== '{{first_name}}',
			);
			if (placeholders.length > 0) hard.push(`stray placeholders in body: ${placeholders.join(', ')}`);
		}
		if (t.kind === 'social' && t.social) {
			allCopy.push(t.social.caption);
			const charLen = t.social.caption.length;
			if (t.social.channel === 'twitter' && charLen > 280) hard.push(`twitter caption ${charLen} chars > 280`);
			if (t.social.channel === 'linkedin') {
				const lwc = wordCount(t.social.caption);
				if (lwc < 80 || lwc > 320) warn.push(`linkedin caption word count ${lwc} outside 100-300`);
			}
			if (t.social.channel === 'instagram') {
				const iwc = wordCount(t.social.caption);
				if (iwc < 30 || iwc > 170) warn.push(`instagram caption word count ${iwc} outside 50-150`);
			}
		}
	}

	const haystack = allCopy.join('\n').toLowerCase();
	for (const phrase of avoidLower) {
		if (phrase && haystack.includes(phrase)) {
			hard.push(`avoid_phrase used: "${phrase}"`);
		}
	}

	return { hardFailures: hard, warnings: warn };
}

// ─── Adapter ────────────────────────────────────────────────────────────────

function adaptToDraftedCampaign(args: {
	output: ToolOutput;
	facts: AvailableFact[];
	voice: ResolvedVoice;
	candidate: DormantCandidate;
	tokensSpent: number;
	durationMs: number;
}): DraftedCampaign {
	const { output, facts, voice, candidate, tokensSpent, durationMs } = args;
	const factsById = new Map(facts.map((f) => [f.id, f]));

	const touches: DraftedTouch[] = output.touches.map((t) => {
		const isEmail = t.kind === 'email';
		const audience_filter: AudienceFilter = isEmail
			? (t.email?.audience_filter || 'all')
			: 'all';
		return {
			kind: t.kind,
			send_offset_hours: t.send_offset_hours,
			audience_target: isEmail ? 'lookalike_audience' : 'public',
			audience_filter,
			email_subject: isEmail ? t.email?.subject ?? null : null,
			email_preview_text: isEmail ? t.email?.preview_text ?? null : null,
			email_body_markdown: isEmail ? t.email?.body_markdown ?? null : null,
			email_cta: isEmail ? (t.email?.cta as EmailCTA) ?? null : null,
			social_channel: !isEmail ? t.social?.channel ?? null : null,
			social_caption: !isEmail ? t.social?.caption ?? null : null,
			social_image_brief: !isEmail ? t.social?.image_brief ?? null : null,
		};
	});

	const voiceSignals: string[] = [];
	if (voice === NEUTRAL_VOICE) {
		voiceSignals.push('drafted from your default voice profile');
	} else {
		if (voice.signature_phrases.length) {
			voiceSignals.push(`uses your phrases: ${voice.signature_phrases.slice(0, 3).join(', ')}`);
		}
		voiceSignals.push(`formality ${voice.formality}/100, warmth ${voice.warmth}/100`);
	}

	return {
		touches,
		phase_strategy: null,
		cadence_rationale: output.cadence_rationale || '',
		facts_used: (output.facts_used || []).map((id) => {
			const f = factsById.get(id);
			return { id, label: f?.title || id, kind: f?.kind || 'fact' };
		}),
		tokens_spent: tokensSpent,
		duration_ms: durationMs,
		voice_signals: voiceSignals,
		audience_summary: {
			size: candidate.audience?.size ?? 0,
			sample_names: candidate.audience?.sample_names ?? [],
		},
	};
}

// ─── Anthropic call ─────────────────────────────────────────────────────────

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

async function callAnthropic(args: {
	systemBlocks: Anthropic.MessageCreateParams['system'];
	userMessage: string;
	retryNote?: string;
}): Promise<{ output: ToolOutput; inputTokens: number; outputTokens: number }> {
	const client = getClient();
	const messages: Anthropic.MessageParam[] = [
		{
			role: 'user',
			content: args.retryNote
				? `${args.userMessage}\n\nPREVIOUS ATTEMPT REJECTED:\n${args.retryNote}\nProduce a corrected version now.`
				: args.userMessage,
		},
	];

	const response = await client.messages.create({
		model: MODEL,
		max_tokens: MAX_TOKENS,
		system: args.systemBlocks,
		tools: [produceDormantOutreachTool],
		tool_choice: { type: 'tool', name: produceDormantOutreachTool.name } as any,
		messages,
	});

	const toolBlock = response.content.find((b: any) => b.type === 'tool_use');
	if (!toolBlock) {
		throw new Error('Generator did not return a tool_use block');
	}
	const usage = response.usage as any;
	// Include cached tokens in the input count — they're billable (at ~1/10 cost
	// for reads, ~1.25x for creation) and the UI's "tokens spent" otherwise
	// looks artificially low when the system block hits cache.
	const inputTokens =
		(usage?.input_tokens || 0) +
		(usage?.cache_read_input_tokens || 0) +
		(usage?.cache_creation_input_tokens || 0);
	return {
		output: (toolBlock as any).input as ToolOutput,
		inputTokens,
		outputTokens: usage?.output_tokens || 0,
	};
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface RunDormantGeneratorArgs {
	organizationId: string;
	orgName: string;
	orgIndustry?: string;
	candidate: DormantCandidate;
	facts: AvailableFact[];
	voice?: ResolvedVoice;
}

export interface RunDormantGeneratorResult {
	draft: DraftedCampaign;
	inputTokens: number;
	outputTokens: number;
	durationMs: number;
	promptVersion: string;
	model: string;
	warnings: string[];
	retried: boolean;
}

export async function runDormantGenerator(
	args: RunDormantGeneratorArgs,
): Promise<RunDormantGeneratorResult> {
	const start = Date.now();
	const voice = args.voice || NEUTRAL_VOICE;
	const userMessage = renderUserMessage({
		orgName: args.orgName,
		orgIndustry: args.orgIndustry || 'small business',
		voice,
		candidate: args.candidate,
		facts: args.facts,
	});

	// Cache the system + voice fingerprint section across calls within ~5 min.
	// User message (per-candidate) sits outside the breakpoint.
	const systemBlocks: Anthropic.MessageCreateParams['system'] = [
		{
			type: 'text',
			text: SYSTEM_PROMPT,
			cache_control: { type: 'ephemeral' },
		} as any,
	];

	let totalInput = 0;
	let totalOutput = 0;
	let result = await callAnthropic({ systemBlocks, userMessage });
	totalInput += result.inputTokens;
	totalOutput += result.outputTokens;

	let validation = validate(result.output, args.facts, voice);
	let retried = false;
	if (validation.hardFailures.length > 0) {
		retried = true;
		const note = validation.hardFailures.join('\n- ');
		result = await callAnthropic({
			systemBlocks,
			userMessage,
			retryNote: `- ${note}`,
		});
		totalInput += result.inputTokens;
		totalOutput += result.outputTokens;
		validation = validate(result.output, args.facts, voice);
		if (validation.hardFailures.length > 0) {
			throw createError({
				statusCode: 502,
				message: `Generator failed validation after retry: ${validation.hardFailures.join('; ')}`,
			});
		}
	}

	const durationMs = Date.now() - start;
	const draft = adaptToDraftedCampaign({
		output: result.output,
		facts: args.facts,
		voice,
		candidate: args.candidate,
		tokensSpent: totalInput + totalOutput,
		durationMs,
	});

	return {
		draft,
		inputTokens: totalInput,
		outputTokens: totalOutput,
		durationMs,
		promptVersion: PROMPT_VERSION,
		model: MODEL,
		warnings: validation.warnings,
		retried,
	};
}

export const DORMANT_PROMPT_VERSION = PROMPT_VERSION;
export const DORMANT_MODEL = MODEL;

// ─── Single-touch regenerator ───────────────────────────────────────────────
//
// Produces ONE replacement touch for an existing campaign — same kind/channel
// as the prior version, meaningfully different angle. Reuses the full generator's
// system prompt (cache key is shared) and pushes the regenerate-mode instructions
// into the user message.
//
// Wired by server/api/marketing/touches/[id]/regenerate.post.ts.

const SINGLE_TOUCH_PROMPT_VERSION = 'dormant_single_v1.0';

const produceDormantSingleTouchTool: Anthropic.Tool = {
	name: 'produce_dormant_single_touch',
	description:
		'Produce exactly ONE replacement touch for a dormant-clients campaign. Match the prior touch\'s kind/channel and take a meaningfully different angle.',
	input_schema: {
		type: 'object' as const,
		properties: {
			touch: {
				type: 'object',
				properties: {
					kind: { type: 'string', enum: ['email', 'social'] },
					send_offset_hours: { type: 'integer', minimum: 0, maximum: 168 },
					email: {
						type: 'object',
						properties: {
							subject: { type: 'string', maxLength: 60 },
							preview_text: { type: 'string', maxLength: 90 },
							body_markdown: {
								type: 'string',
								description: '80-150 words. Use {{first_name}}. Different draft from prior, not a rephrase.',
							},
							cta: {
								type: 'string',
								enum: ['book_call', 'reply', 'view_portfolio', 'view_case_study', 'reply_with_question'],
							},
							audience_filter: {
								type: 'string',
								enum: ['all', 'opened_previous', 'unopened_previous'],
							},
						},
						required: ['subject', 'preview_text', 'body_markdown', 'cta', 'audience_filter'],
					},
					social: {
						type: 'object',
						properties: {
							channel: { type: 'string', enum: ['linkedin', 'instagram', 'twitter'] },
							caption: { type: 'string', maxLength: 600 },
							image_brief: { type: 'string', maxLength: 200 },
						},
						required: ['channel', 'caption', 'image_brief'],
					},
				},
				required: ['kind', 'send_offset_hours'],
			},
			facts_used: { type: 'array', items: { type: 'string' } },
			cadence_note: { type: 'string', maxLength: 120 },
		},
		required: ['touch', 'facts_used'],
	},
};

interface SingleTouchToolOutput {
	touch: ToolOutput['touches'][number];
	facts_used: string[];
	cadence_note?: string;
}

function priorSummary(t: DraftedTouch): Record<string, unknown> {
	if (t.kind === 'email') {
		return {
			kind: 'email',
			subject: t.email_subject,
			preview_text: t.email_preview_text,
			body_markdown: t.email_body_markdown,
			cta: t.email_cta,
		};
	}
	return {
		kind: 'social',
		channel: t.social_channel,
		caption: t.social_caption,
		image_brief: t.social_image_brief,
	};
}

function renderSingleTouchUserMessage(args: {
	orgName: string;
	orgIndustry: string;
	voice: ResolvedVoice;
	candidate: DormantCandidate;
	facts: AvailableFact[];
	priorTouch: DraftedTouch;
	varyInstruction?: string;
}): string {
	const baseMsg = renderUserMessage({
		orgName: args.orgName,
		orgIndustry: args.orgIndustry,
		voice: args.voice,
		candidate: args.candidate,
		facts: args.facts,
	});
	const channelHint = args.priorTouch.kind === 'social'
		? `- Match the channel: ${args.priorTouch.social_channel}.\n`
		: '';
	const varyDir = args.varyInstruction?.trim() ||
		'Take a meaningfully different angle. Different opener, different anchor fact when one exists in available_facts, different CTA framing where natural. Keep the same kind/channel and roughly similar length.';

	return `${baseMsg}

REGENERATE MODE — REPLACE ONE TOUCH
===================================
Prior touch (DO NOT reproduce — produce a different draft):
${JSON.stringify(priorSummary(args.priorTouch), null, 2)}

VARY DIRECTION
==============
${varyDir}

CONSTRAINTS FOR THIS REGENERATE
===============================
- Produce exactly 1 touch via produce_dormant_single_touch.
- Match the kind: ${args.priorTouch.kind}.
${channelHint}- Subject (or first 12 words of caption) MUST differ from the prior.
- Body MUST be a different draft, not just a rephrase.

Produce the replacement touch.`;
}

function validateSingleTouch(
	output: SingleTouchToolOutput,
	facts: AvailableFact[],
	voice: ResolvedVoice,
	priorTouch: DraftedTouch,
): ValidationResult {
	const hard: string[] = [];
	const warn: string[] = [];

	const factIds = new Set(facts.map((f) => f.id));
	for (const id of output.facts_used || []) {
		if (!factIds.has(id)) hard.push(`facts_used contains unknown id "${id}"`);
	}

	const t = output.touch;
	if (!t || !t.kind) {
		hard.push('missing touch in output');
		return { hardFailures: hard, warnings: warn };
	}
	if (t.kind !== priorTouch.kind) {
		hard.push(`kind mismatch: prior=${priorTouch.kind}, new=${t.kind}`);
	}

	const allCopy: string[] = [];
	if (t.kind === 'email' && t.email) {
		allCopy.push(t.email.subject, t.email.preview_text, t.email.body_markdown);
		if (t.email.subject.length > 60) hard.push(`subject exceeds 60 chars: "${t.email.subject}"`);
		const wc = wordCount(t.email.body_markdown);
		if (wc < 60 || wc > 180) warn.push(`email body word count ${wc} outside 80-150`);
		const placeholders = (t.email.body_markdown.match(/\{\{[^}]+\}\}/g) || []).filter(
			(m) => m !== '{{first_name}}',
		);
		if (placeholders.length > 0) hard.push(`stray placeholders in body: ${placeholders.join(', ')}`);
		if (
			priorTouch.email_subject &&
			t.email.subject.trim().toLowerCase() === priorTouch.email_subject.trim().toLowerCase()
		) {
			hard.push('regenerated subject identical to prior');
		}
		if (
			priorTouch.email_body_markdown &&
			t.email.body_markdown.trim() === priorTouch.email_body_markdown.trim()
		) {
			hard.push('regenerated body identical to prior');
		}
	}
	if (t.kind === 'social' && t.social) {
		allCopy.push(t.social.caption);
		if (priorTouch.social_channel && t.social.channel !== priorTouch.social_channel) {
			hard.push(`channel mismatch: prior=${priorTouch.social_channel}, new=${t.social.channel}`);
		}
		if (t.social.channel === 'twitter' && t.social.caption.length > 280) {
			hard.push(`twitter caption ${t.social.caption.length} chars > 280`);
		}
		if (priorTouch.social_caption && t.social.caption.trim() === priorTouch.social_caption.trim()) {
			hard.push('regenerated caption identical to prior');
		}
	}

	const haystack = allCopy.join('\n').toLowerCase();
	for (const phrase of voice.avoid_phrases.map((p) => p.toLowerCase())) {
		if (phrase && haystack.includes(phrase)) hard.push(`avoid_phrase used: "${phrase}"`);
	}

	return { hardFailures: hard, warnings: warn };
}

function adaptSingleTouchOutput(args: {
	output: SingleTouchToolOutput;
	facts: AvailableFact[];
	priorTouch: DraftedTouch;
}): { touch: DraftedTouch; factsUsed: { id: string; label: string; kind: string }[] } {
	const { output, facts, priorTouch } = args;
	const factsById = new Map(facts.map((f) => [f.id, f]));
	const t = output.touch;
	const isEmail = t.kind === 'email';
	const audience_filter: AudienceFilter = isEmail
		? ((t.email?.audience_filter as AudienceFilter) || priorTouch.audience_filter || 'all')
		: priorTouch.audience_filter;

	const touch: DraftedTouch = {
		kind: t.kind,
		send_offset_hours:
			typeof t.send_offset_hours === 'number' ? t.send_offset_hours : priorTouch.send_offset_hours,
		audience_target: priorTouch.audience_target,
		audience_filter,
		email_subject: isEmail ? t.email?.subject ?? null : null,
		email_preview_text: isEmail ? t.email?.preview_text ?? null : null,
		email_body_markdown: isEmail ? t.email?.body_markdown ?? null : null,
		email_cta: isEmail ? ((t.email?.cta as EmailCTA) ?? null) : null,
		social_channel: !isEmail ? (t.social?.channel ?? null) : null,
		social_caption: !isEmail ? (t.social?.caption ?? null) : null,
		social_image_brief: !isEmail ? (t.social?.image_brief ?? null) : null,
	};

	const factsUsed = (output.facts_used || []).map((id) => {
		const f = factsById.get(id);
		return { id, label: f?.title || id, kind: f?.kind || 'fact' };
	});
	return { touch, factsUsed };
}

async function callAnthropicSingleTouch(args: {
	systemBlocks: Anthropic.MessageCreateParams['system'];
	userMessage: string;
	retryNote?: string;
}): Promise<{ output: SingleTouchToolOutput; inputTokens: number; outputTokens: number }> {
	const client = getClient();
	const messages: Anthropic.MessageParam[] = [
		{
			role: 'user',
			content: args.retryNote
				? `${args.userMessage}\n\nPREVIOUS ATTEMPT REJECTED:\n${args.retryNote}\nProduce a corrected version now.`
				: args.userMessage,
		},
	];
	const response = await client.messages.create({
		model: MODEL,
		max_tokens: 1024,
		system: args.systemBlocks,
		tools: [produceDormantSingleTouchTool],
		tool_choice: { type: 'tool', name: produceDormantSingleTouchTool.name } as any,
		messages,
	});
	const toolBlock = response.content.find((b: any) => b.type === 'tool_use');
	if (!toolBlock) throw new Error('Single-touch generator did not return a tool_use block');
	const usage = response.usage as any;
	const inputTokens =
		(usage?.input_tokens || 0) +
		(usage?.cache_read_input_tokens || 0) +
		(usage?.cache_creation_input_tokens || 0);
	return {
		output: (toolBlock as any).input as SingleTouchToolOutput,
		inputTokens,
		outputTokens: usage?.output_tokens || 0,
	};
}

export interface RunSingleTouchRegeneratorResult {
	touch: DraftedTouch;
	factsUsed: { id: string; label: string; kind: string }[];
	inputTokens: number;
	outputTokens: number;
	durationMs: number;
	promptVersion: string;
	model: string;
	warnings: string[];
	retried: boolean;
}

export async function runDormantSingleTouchRegenerator(args: {
	organizationId: string;
	orgName: string;
	orgIndustry?: string;
	candidate: DormantCandidate;
	facts: AvailableFact[];
	voice?: ResolvedVoice;
	priorTouch: DraftedTouch;
	varyInstruction?: string;
}): Promise<RunSingleTouchRegeneratorResult> {
	const start = Date.now();
	const voice = args.voice || NEUTRAL_VOICE;
	const userMessage = renderSingleTouchUserMessage({
		orgName: args.orgName,
		orgIndustry: args.orgIndustry || 'small business',
		voice,
		candidate: args.candidate,
		facts: args.facts,
		priorTouch: args.priorTouch,
		varyInstruction: args.varyInstruction,
	});

	const systemBlocks: Anthropic.MessageCreateParams['system'] = [
		{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } } as any,
	];

	let totalInput = 0;
	let totalOutput = 0;
	let result = await callAnthropicSingleTouch({ systemBlocks, userMessage });
	totalInput += result.inputTokens;
	totalOutput += result.outputTokens;

	let validation = validateSingleTouch(result.output, args.facts, voice, args.priorTouch);
	let retried = false;
	if (validation.hardFailures.length > 0) {
		retried = true;
		const note = validation.hardFailures.join('\n- ');
		result = await callAnthropicSingleTouch({
			systemBlocks,
			userMessage,
			retryNote: `- ${note}`,
		});
		totalInput += result.inputTokens;
		totalOutput += result.outputTokens;
		validation = validateSingleTouch(result.output, args.facts, voice, args.priorTouch);
		if (validation.hardFailures.length > 0) {
			throw createError({
				statusCode: 502,
				message: `Single-touch regenerator failed validation after retry: ${validation.hardFailures.join('; ')}`,
			});
		}
	}

	const adapted = adaptSingleTouchOutput({
		output: result.output,
		facts: args.facts,
		priorTouch: args.priorTouch,
	});

	return {
		touch: adapted.touch,
		factsUsed: adapted.factsUsed,
		inputTokens: totalInput,
		outputTokens: totalOutput,
		durationMs: Date.now() - start,
		promptVersion: SINGLE_TOUCH_PROMPT_VERSION,
		model: MODEL,
		warnings: validation.warnings,
		retried,
	};
}
