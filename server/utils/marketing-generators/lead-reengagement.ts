/**
 * Lead-reengagement generator — fires on a cluster of leads who originally
 * inquired about the same topic and have gone quiet.
 *
 * Output: 1 (sometimes 2) emails to the cluster. CTA is a soft reply.
 * Audience filter encodes the cluster: `cluster:<label>` (sanitized).
 *
 * Same plumbing as the other generators (direct Anthropic SDK + tool use +
 * post-hoc validation + cache breakpoint on system).
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
import {
	NEUTRAL_VOICE,
	getResolvedVoice,
	type ResolvedVoice,
} from './dormant-clients';
import type { LeadReengagementCandidate } from '../marketing-facts/build-lead-reengagement-facts';

const MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = 2048;
const PROMPT_VERSION = 'lead_reengagement_v1.0';

// ─── Tool schema ────────────────────────────────────────────────────────────

const produceLeadReengagementTool: Anthropic.Tool = {
	name: 'produce_lead_reengagement_outreach',
	description:
		'Produce 1-2 emails to a cluster of leads who originally inquired about the same topic ' +
		'and have gone quiet. Anchor on a real proof point from available_facts in their topic area.',
	input_schema: {
		type: 'object',
		properties: {
			touches: {
				type: 'array',
				minItems: 1,
				maxItems: 2,
				items: {
					type: 'object',
					properties: {
						kind: { type: 'string', enum: ['email'] },
						send_offset_hours: { type: 'integer', minimum: 0, maximum: 168 },
						email: {
							type: 'object',
							properties: {
								subject: { type: 'string', maxLength: 60 },
								preview_text: { type: 'string', maxLength: 90 },
								body_markdown: {
									type: 'string',
									description:
										'80-150 words. Use {{first_name}} for personalization. Anchor on a specific ' +
										'project/win in the cluster topic area from available_facts.',
								},
								cta: { type: 'string', enum: ['reply', 'view_case_study', 'reply_with_question'] },
							},
							required: ['subject', 'preview_text', 'body_markdown', 'cta'],
						},
					},
					required: ['kind', 'send_offset_hours', 'email'],
				},
			},
			cadence_rationale: { type: 'string', maxLength: 240 },
			facts_used: {
				type: 'array',
				items: { type: 'string' },
				description: 'Fact IDs from available_facts referenced in copy.',
			},
		},
		required: ['touches', 'cadence_rationale', 'facts_used'],
	},
};

// ─── Prompts ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are drafting re-engagement copy for a small business reaching back
to a cluster of leads who originally inquired about the same topic
(e.g. "Brand strategy", "Web redesign") and have gone quiet for weeks.

These are LEADS, not past clients. They've never bought. They asked
once, the conversation didn't close, and they may have forgotten or
moved on. The goal is to give them a concrete reason to come back —
not to apologize for the gap.

GROUNDING — non-negotiable:
- You may ONLY reference projects, services, wins, or testimonials in
  available_facts. Never invent a past project or capability.
- Anchor the body on a SPECIFIC proof point from available_facts in
  the cluster's topic area (cited by ID in facts_used).
- If available_facts is sparse or doesn't match the topic well, write
  more abstractly rather than fabricating specifics.
- Use {{first_name}} for personalization. Never hardcode names from
  sample_names — those are illustrative only.

TONE:
- These are inactive leads, not dormant clients — slightly cooler tone.
  No "we miss you" (you never had them). No "still interested?" (puts
  the burden on them).
- Lead with a proof point or a specific outcome, not the gap.
- Match the voice fingerprint precisely. Never use avoid_phrases.

OPENERS TO AVOID:
- "Just checking in" / "Touching base" / "Circling back"
- "Still interested in X?" — puts the cognitive load on them
- "Just wanted to follow up" — apologetic and generic
- "Hope you're doing well" as an opener

OPENERS THAT WORK:
- A specific outcome from a recent project ("Booking up 22% post-launch")
- A pattern observation grounded in their topic
- A short, concrete question that's easy to answer

EMAIL STRUCTURE:
- Subject: 30-60 chars, specific, no clickbait, no urgency tricks.
- Body: 80-150 words. One clear CTA matching the cta field.
- Preview text: complements subject, doesn't repeat it.

CADENCE GUIDANCE:
- At ~30+ days inactive, prefer ONE good email over a sequence. A
  follow-up here is more likely to damage reputation than recover the
  lead. Only emit a Touch 2 if the proof point is strong enough to
  justify a second knock — and target unopened_previous (which the
  scheduler maps onto the cluster filter).
- Touch 1: send_offset_hours 0.
- Touch 2 (optional): send_offset_hours 96-120.

CALL produce_lead_reengagement_outreach EXACTLY ONCE. No prose.`;

function renderUserMessage(args: {
	orgName: string;
	orgIndustry: string;
	voice: ResolvedVoice;
	candidate: LeadReengagementCandidate;
	facts: AvailableFact[];
}): string {
	const { orgName, orgIndustry, voice, candidate, facts } = args;
	const sig = voice.signature_phrases.length ? voice.signature_phrases.join(', ') : '(none)';
	const avoid = voice.avoid_phrases.length ? voice.avoid_phrases.join(', ') : '(none)';
	const examples = voice.example_paragraphs.length
		? voice.example_paragraphs.slice(0, 3).join('\n---\n')
		: '(no example paragraphs available — write to the tone descriptors)';
	const audSize = candidate.audience?.size ?? candidate.cluster?.size ?? 0;
	const avgDays = candidate.signal?.avg_days_inactive ?? '?';
	const minDays = candidate.signal?.min_days_inactive ?? '?';
	const maxDays = candidate.signal?.max_days_inactive ?? '?';

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
Cluster topic: ${candidate.cluster?.label || '(unknown)'}
Cluster size: ${audSize} leads (referenced as {{first_name}} in copy)
Days inactive: avg ${avgDays}, range ${minDays}-${maxDays}
${candidate.cluster?.representative_intent ? `Representative intent: ${candidate.cluster.representative_intent}` : ''}
${candidate.cluster?.lead_sources_summary ? `Lead sources: ${candidate.cluster.lead_sources_summary}` : ''}

AVAILABLE FACTS (only these may be referenced in copy)
======================================================
${JSON.stringify(facts, null, 2)}

CONSTRAINTS
===========
Channels: 1-2 emails only (no social).
Touch count: 1-2 — prefer 1 unless the proof point is strong.

Produce the campaign for the "${candidate.cluster?.label || 'lead'}" cluster.`;
}

// ─── Validation ─────────────────────────────────────────────────────────────

interface ToolOutput {
	touches: Array<{
		kind: 'email';
		send_offset_hours: number;
		email: {
			subject: string;
			preview_text: string;
			body_markdown: string;
			cta: EmailCTA;
		};
	}>;
	cadence_rationale: string;
	facts_used: string[];
}

function wordCount(s: string): number {
	return s.trim().split(/\s+/).filter(Boolean).length;
}

function validate(
	output: ToolOutput,
	facts: AvailableFact[],
	voice: ResolvedVoice,
): { hardFailures: string[]; warnings: string[] } {
	const hard: string[] = [];
	const warn: string[] = [];
	const factIds = new Set(facts.map((f) => f.id));
	for (const id of output.facts_used || []) {
		if (!factIds.has(id)) hard.push(`facts_used contains unknown id "${id}"`);
	}

	const avoidLower = voice.avoid_phrases.map((p) => p.toLowerCase());
	const allCopy: string[] = [];
	for (const t of output.touches || []) {
		if (t.kind !== 'email' || !t.email) {
			hard.push(`lead_reengagement only supports email touches (got "${t.kind}")`);
			continue;
		}
		allCopy.push(t.email.subject, t.email.preview_text, t.email.body_markdown);
		if (t.email.subject.length > 60) hard.push(`subject exceeds 60 chars: "${t.email.subject}"`);
		const wc = wordCount(t.email.body_markdown);
		if (wc < 60 || wc > 180) warn.push(`email body word count ${wc} outside 80-150 (touch +${t.send_offset_hours}h)`);
		const placeholders = (t.email.body_markdown.match(/\{\{[^}]+\}\}/g) || []).filter(
			(m) => m !== '{{first_name}}',
		);
		if (placeholders.length > 0) hard.push(`stray placeholders in body: ${placeholders.join(', ')}`);
	}

	const haystack = allCopy.join('\n').toLowerCase();
	for (const phrase of avoidLower) {
		if (phrase && haystack.includes(phrase)) hard.push(`avoid_phrase used: "${phrase}"`);
	}

	return { hardFailures: hard, warnings: warn };
}

// ─── Adapter ────────────────────────────────────────────────────────────────

function clusterFilterFor(label?: string): AudienceFilter {
	if (!label) return 'all';
	const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
	return slug ? (`cluster:${slug}` as AudienceFilter) : 'all';
}

function adaptToDraftedCampaign(args: {
	output: ToolOutput;
	facts: AvailableFact[];
	voice: ResolvedVoice;
	candidate: LeadReengagementCandidate;
	tokensSpent: number;
	durationMs: number;
}): DraftedCampaign {
	const { output, facts, voice, candidate, tokensSpent, durationMs } = args;
	const factsById = new Map(facts.map((f) => [f.id, f]));
	const filter = clusterFilterFor(candidate.cluster?.label);

	const touches: DraftedTouch[] = output.touches.map((t, i) => ({
		kind: 'email',
		send_offset_hours: t.send_offset_hours,
		audience_target: 'lookalike_audience',
		// Touch 2 is intended as a follow-up to non-openers within the cluster.
		// Encode that through the cluster filter (the send-time machinery will
		// expand `cluster:X` and apply unopened-previous filtering on top).
		audience_filter: i === 0 ? filter : filter,
		email_subject: t.email?.subject ?? null,
		email_preview_text: t.email?.preview_text ?? null,
		email_body_markdown: t.email?.body_markdown ?? null,
		email_cta: (t.email?.cta as EmailCTA) ?? null,
		social_channel: null,
		social_caption: null,
		social_image_brief: null,
	}));

	const voiceSignals: string[] = voice === NEUTRAL_VOICE
		? ['drafted from your default voice profile']
		: [`formality ${voice.formality}/100, warmth ${voice.warmth}/100`];

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
			size: candidate.audience?.size ?? candidate.cluster?.size ?? 0,
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
	if (!apiKey) throw new Error('LLM API key not configured. Set NUXT_LLM_API_KEY or ANTHROPIC_API_KEY.');
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
		tools: [produceLeadReengagementTool],
		tool_choice: { type: 'tool', name: produceLeadReengagementTool.name } as any,
		messages,
	});
	const toolBlock = response.content.find((b: any) => b.type === 'tool_use');
	if (!toolBlock) throw new Error('Generator did not return a tool_use block');
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
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface RunLeadReengagementGeneratorArgs {
	organizationId: string;
	orgName: string;
	orgIndustry?: string;
	candidate: LeadReengagementCandidate;
	facts: AvailableFact[];
	voice?: ResolvedVoice;
}

export interface RunLeadReengagementGeneratorResult {
	draft: DraftedCampaign;
	inputTokens: number;
	outputTokens: number;
	durationMs: number;
	promptVersion: string;
	model: string;
	warnings: string[];
	retried: boolean;
}

export async function runLeadReengagementGenerator(
	args: RunLeadReengagementGeneratorArgs,
): Promise<RunLeadReengagementGeneratorResult> {
	const start = Date.now();
	const voice = args.voice || getResolvedVoice(args.organizationId);
	const userMessage = renderUserMessage({
		orgName: args.orgName,
		orgIndustry: args.orgIndustry || 'small business',
		voice,
		candidate: args.candidate,
		facts: args.facts,
	});

	const systemBlocks: Anthropic.MessageCreateParams['system'] = [
		{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } } as any,
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
		result = await callAnthropic({ systemBlocks, userMessage, retryNote: `- ${note}` });
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

export const LEAD_REENGAGEMENT_PROMPT_VERSION = PROMPT_VERSION;
export const LEAD_REENGAGEMENT_MODEL = MODEL;

// ─── Single-touch regenerator ───────────────────────────────────────────────

const SINGLE_TOUCH_PROMPT_VERSION = 'lead_reengagement_single_v1.0';

const produceLeadReengagementSingleTouchTool: Anthropic.Tool = {
	name: 'produce_lead_reengagement_single_touch',
	description:
		'Produce exactly ONE replacement email touch for a lead-reengagement campaign. Take a meaningfully different angle than the prior version.',
	input_schema: {
		type: 'object',
		properties: {
			touch: {
				type: 'object',
				properties: {
					kind: { type: 'string', enum: ['email'] },
					send_offset_hours: { type: 'integer', minimum: 0, maximum: 168 },
					email: {
						type: 'object',
						properties: {
							subject: { type: 'string', maxLength: 60 },
							preview_text: { type: 'string', maxLength: 90 },
							body_markdown: { type: 'string' },
							cta: { type: 'string', enum: ['reply', 'view_case_study', 'reply_with_question'] },
						},
						required: ['subject', 'preview_text', 'body_markdown', 'cta'],
					},
				},
				required: ['kind', 'send_offset_hours', 'email'],
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

function priorEmailSummary(t: DraftedTouch): Record<string, unknown> {
	return {
		kind: 'email',
		subject: t.email_subject,
		preview_text: t.email_preview_text,
		body_markdown: t.email_body_markdown,
		cta: t.email_cta,
	};
}

function renderSingleTouchUserMessage(args: {
	orgName: string;
	orgIndustry: string;
	voice: ResolvedVoice;
	candidate: LeadReengagementCandidate;
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
	const varyDir = args.varyInstruction?.trim() ||
		'Take a meaningfully different angle. Different opener, different anchor proof point when one exists in available_facts in this cluster topic, different CTA framing where natural. Keep it as one email and roughly similar length.';

	return `${baseMsg}

REGENERATE MODE — REPLACE ONE TOUCH
===================================
Prior touch (DO NOT reproduce — produce a different draft):
${JSON.stringify(priorEmailSummary(args.priorTouch), null, 2)}

VARY DIRECTION
==============
${varyDir}

CONSTRAINTS FOR THIS REGENERATE
===============================
- Produce exactly 1 touch via produce_lead_reengagement_single_touch.
- Kind must be email (this generator only emits email).
- Subject MUST differ from the prior.
- Body MUST be a different draft, not just a rephrase.

Produce the replacement touch.`;
}

function validateSingleTouch(
	output: SingleTouchToolOutput,
	facts: AvailableFact[],
	voice: ResolvedVoice,
	priorTouch: DraftedTouch,
): { hardFailures: string[]; warnings: string[] } {
	const hard: string[] = [];
	const warn: string[] = [];

	const factIds = new Set(facts.map((f) => f.id));
	for (const id of output.facts_used || []) {
		if (!factIds.has(id)) hard.push(`facts_used contains unknown id "${id}"`);
	}

	const t = output.touch;
	if (!t || t.kind !== 'email' || !t.email) {
		hard.push('lead_reengagement single-touch must be an email');
		return { hardFailures: hard, warnings: warn };
	}

	const allCopy: string[] = [t.email.subject, t.email.preview_text, t.email.body_markdown];
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

	const touch: DraftedTouch = {
		kind: 'email',
		send_offset_hours:
			typeof t.send_offset_hours === 'number' ? t.send_offset_hours : priorTouch.send_offset_hours,
		audience_target: priorTouch.audience_target,
		audience_filter: priorTouch.audience_filter,
		email_subject: t.email?.subject ?? null,
		email_preview_text: t.email?.preview_text ?? null,
		email_body_markdown: t.email?.body_markdown ?? null,
		email_cta: (t.email?.cta as EmailCTA) ?? null,
		social_channel: null,
		social_caption: null,
		social_image_brief: null,
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
		tools: [produceLeadReengagementSingleTouchTool],
		tool_choice: { type: 'tool', name: produceLeadReengagementSingleTouchTool.name } as any,
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

export interface RunLeadReengagementSingleTouchRegeneratorResult {
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

export async function runLeadReengagementSingleTouchRegenerator(args: {
	organizationId: string;
	orgName: string;
	orgIndustry?: string;
	candidate: LeadReengagementCandidate;
	facts: AvailableFact[];
	voice?: ResolvedVoice;
	priorTouch: DraftedTouch;
	varyInstruction?: string;
}): Promise<RunLeadReengagementSingleTouchRegeneratorResult> {
	const start = Date.now();
	const voice = args.voice || getResolvedVoice(args.organizationId);
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
		result = await callAnthropicSingleTouch({ systemBlocks, userMessage, retryNote: `- ${note}` });
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
