/**
 * Project-complete generator — fires after a project wraps.
 *
 * Two phases:
 *   - request_testimonial: 1 warm email to the project's primary contact
 *     asking 3 short questions she can answer in any depth she has time for.
 *   - repurpose_to_campaign: 1-2 emails (and optionally one social) to a
 *     broader audience using the project as a case study.
 *
 * Same plumbing as dormant-clients.ts (direct Anthropic SDK + tool use +
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

const MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = 2048;
const PROMPT_VERSION = 'project_complete_v1.0';

export type ProjectCompletePhase = 'request_testimonial' | 'repurpose_to_campaign';

export interface ProjectCompleteCandidate {
	phase?: ProjectCompletePhase;
	signal: {
		project_title?: string;
		client_name?: string;
		primary_contact_name?: string;
		days_since_complete?: number;
		budget_usd?: number;
		recent_win?: string;
	};
	audience: {
		size: number;
		sample_names: string[];
		contact_ids?: string[];
	};
}

// ─── Tool schema ────────────────────────────────────────────────────────────

const produceProjectCompleteTool: Anthropic.Tool = {
	name: 'produce_project_complete_outreach',
	description:
		'Produce 1-2 touches (emails and optionally one social post) for the project-complete moment. ' +
		'Phase determines whether this is a single warm testimonial ask or a broader case-study broadcast.',
	input_schema: {
		type: 'object',
		properties: {
			touches: {
				type: 'array',
				minItems: 1,
				maxItems: 3,
				items: {
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
									description:
										'80-150 words. For testimonial phase, address the primary contact by first name directly. ' +
										'For repurpose phase, use {{first_name}} for the broader audience. ' +
										'Never invent past projects beyond available_facts.',
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
			},
			cadence_rationale: { type: 'string', maxLength: 240 },
			phase_strategy: { type: 'string', maxLength: 280 },
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

const SYSTEM_PROMPT = `You are drafting outreach for a small business at the moment a project
wraps. There are two phases — pick exactly the one specified in the
candidate's "phase" field and ignore the other.

PHASE: request_testimonial
- ONE email only. To a single primary contact (the client lead on this
  project). Address them by first name (the actual name, not {{first_name}}).
- Anchor on a specific recent moment from available_facts (the project,
  any associated win). Lead with the win, not the ask.
- Body asks 2-3 short questions — the kind a busy person can answer in
  one line each. Soft "no rush" framing.
- CTA: reply_with_question.

PHASE: repurpose_to_campaign
- 1-2 emails to a broader audience plus optionally one social post.
- Anchor email on the wrapped project as a concrete case study.
- Use {{first_name}} for personalization (not the contact's actual name).
- Lead with the outcome, then the pattern. CTA: book_call or view_case_study.
- Social: works as a stand-alone story, not "we just shipped X" boast.
- If a follow-up email exists, target unopened_previous and shift angle.

GROUNDING — non-negotiable:
- You may ONLY reference projects, services, wins, or testimonials in
  available_facts. Never invent specifics.
- Every fact ID you reference must appear in facts_used.
- Match the voice fingerprint precisely. Never use avoid_phrases.

OPENERS THAT DO NOT WORK:
- "We just wrapped X" (boastful)
- "Hope you're doing well" (announces nothing)
- "Just checking in" / "Touching base" / "Circling back"

OPENERS THAT WORK (testimonial):
- Reference the win directly ("Terra hitting Awwwards made our week")
- Specific gratitude tied to the work
- A small observation about the project worth sharing back

OPENERS THAT WORK (repurpose):
- The result, named ("Booking up 22% post-launch — what changed")
- A pattern observation grounded in this project
- A specific question the project answered

EMAIL STRUCTURE:
- Subject: 30-60 chars, specific, no clickbait, no urgency tricks.
- Body: 80-150 words. Plain markdown.
- Preview text: complements subject, doesn't repeat it.

CADENCE GUIDANCE:
- Testimonial: ONE email at send_offset_hours 0.
- Repurpose: Touch 1 at 0-24h. Touch 2 (email follow-up if any) at 96-120h
  with audience_filter unopened_previous. Optional social at 24-72h.

CALL produce_project_complete_outreach EXACTLY ONCE. No prose.`;

function renderUserMessage(args: {
	orgName: string;
	orgIndustry: string;
	voice: ResolvedVoice;
	candidate: ProjectCompleteCandidate;
	facts: AvailableFact[];
}): string {
	const { orgName, orgIndustry, voice, candidate, facts } = args;
	const phase = candidate.phase || 'request_testimonial';
	const sig = voice.signature_phrases.length ? voice.signature_phrases.join(', ') : '(none)';
	const avoid = voice.avoid_phrases.length ? voice.avoid_phrases.join(', ') : '(none)';
	const examples = voice.example_paragraphs.length
		? voice.example_paragraphs.slice(0, 3).join('\n---\n')
		: '(no example paragraphs available — write to the tone descriptors)';

	const sig_block = phase === 'request_testimonial'
		? `PRIMARY CONTACT: ${candidate.signal.primary_contact_name || candidate.audience.sample_names?.[0] || 'the client lead'} (use this name directly in the email)`
		: `AUDIENCE: ${candidate.audience.size} contacts (use {{first_name}} in copy)`;

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
Phase: ${phase}
Project: ${candidate.signal.project_title || '(unknown)'}
Client: ${candidate.signal.client_name || '(unknown)'}
Days since complete: ${candidate.signal.days_since_complete ?? '?'}
${candidate.signal.recent_win ? `Recent win: ${candidate.signal.recent_win}` : '(no recent win)'}
${sig_block}

AVAILABLE FACTS (only these may be referenced in copy)
======================================================
${JSON.stringify(facts, null, 2)}

CONSTRAINTS
===========
${phase === 'request_testimonial'
	? 'Channels: 1 email only.'
	: 'Channels: 1-2 emails + optionally one social. Touch count: 1-3.'}

Produce the campaign for the ${phase} phase.`;
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
	phase_strategy?: string;
	facts_used: string[];
}

function wordCount(s: string): number {
	return s.trim().split(/\s+/).filter(Boolean).length;
}

function validate(
	output: ToolOutput,
	facts: AvailableFact[],
	voice: ResolvedVoice,
	phase: ProjectCompletePhase,
	primaryContact?: string,
): { hardFailures: string[]; warnings: string[] } {
	const hard: string[] = [];
	const warn: string[] = [];
	const factIds = new Set(facts.map((f) => f.id));
	for (const id of output.facts_used || []) {
		if (!factIds.has(id)) hard.push(`facts_used contains unknown id "${id}"`);
	}

	if (phase === 'request_testimonial') {
		const emails = (output.touches || []).filter((t) => t.kind === 'email');
		if (emails.length !== 1) hard.push(`testimonial phase requires exactly 1 email, got ${emails.length}`);
	}

	const avoidLower = voice.avoid_phrases.map((p) => p.toLowerCase());
	const allCopy: string[] = [];
	for (const t of output.touches || []) {
		if (t.kind === 'email' && t.email) {
			allCopy.push(t.email.subject, t.email.preview_text, t.email.body_markdown);
			if (t.email.subject.length > 60) hard.push(`subject exceeds 60 chars: "${t.email.subject}"`);
			const wc = wordCount(t.email.body_markdown);
			if (wc < 60 || wc > 180) warn.push(`email body word count ${wc} outside 80-150 (touch +${t.send_offset_hours}h)`);

			// Placeholder rules differ by phase: testimonial uses real name, repurpose uses {{first_name}}.
			const placeholders = (t.email.body_markdown.match(/\{\{[^}]+\}\}/g) || []).filter(
				(m) => m !== '{{first_name}}',
			);
			if (placeholders.length > 0) hard.push(`stray placeholders in body: ${placeholders.join(', ')}`);
			if (phase === 'request_testimonial' && t.email.body_markdown.includes('{{first_name}}')) {
				hard.push('testimonial phase must address the contact by their actual first name, not {{first_name}}');
			}
			if (phase === 'request_testimonial' && primaryContact) {
				const firstName = primaryContact.split(/\s+/)[0];
				if (firstName && !t.email.body_markdown.toLowerCase().includes(firstName.toLowerCase())) {
					warn.push(`testimonial email does not address primary contact "${firstName}" by name`);
				}
			}
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
		if (phrase && haystack.includes(phrase)) hard.push(`avoid_phrase used: "${phrase}"`);
	}

	return { hardFailures: hard, warnings: warn };
}

// ─── Adapter ────────────────────────────────────────────────────────────────

function adaptToDraftedCampaign(args: {
	output: ToolOutput;
	facts: AvailableFact[];
	voice: ResolvedVoice;
	candidate: ProjectCompleteCandidate;
	tokensSpent: number;
	durationMs: number;
	phase: ProjectCompletePhase;
}): DraftedCampaign {
	const { output, facts, voice, candidate, tokensSpent, durationMs, phase } = args;
	const factsById = new Map(facts.map((f) => [f.id, f]));

	const touches: DraftedTouch[] = output.touches.map((t) => {
		const isEmail = t.kind === 'email';
		const audience_filter: AudienceFilter = isEmail ? (t.email?.audience_filter || 'all') : 'all';
		return {
			kind: t.kind,
			send_offset_hours: t.send_offset_hours,
			audience_target: phase === 'request_testimonial'
				? 'project_contact'
				: isEmail ? 'lookalike_audience' : 'public',
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

	const voiceSignals: string[] = voice === NEUTRAL_VOICE
		? ['drafted from your default voice profile']
		: [`formality ${voice.formality}/100, warmth ${voice.warmth}/100`];

	return {
		touches,
		phase_strategy: output.phase_strategy || null,
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
		tools: [produceProjectCompleteTool],
		tool_choice: { type: 'tool', name: produceProjectCompleteTool.name } as any,
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

export interface RunProjectCompleteGeneratorArgs {
	organizationId: string;
	orgName: string;
	orgIndustry?: string;
	candidate: ProjectCompleteCandidate;
	facts: AvailableFact[];
	voice?: ResolvedVoice;
}

export interface RunProjectCompleteGeneratorResult {
	draft: DraftedCampaign;
	inputTokens: number;
	outputTokens: number;
	durationMs: number;
	promptVersion: string;
	model: string;
	warnings: string[];
	retried: boolean;
}

export async function runProjectCompleteGenerator(
	args: RunProjectCompleteGeneratorArgs,
): Promise<RunProjectCompleteGeneratorResult> {
	const start = Date.now();
	const voice = args.voice || getResolvedVoice(args.organizationId);
	const phase: ProjectCompletePhase = args.candidate.phase || 'request_testimonial';
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

	let validation = validate(result.output, args.facts, voice, phase, args.candidate.signal?.primary_contact_name);
	let retried = false;
	if (validation.hardFailures.length > 0) {
		retried = true;
		const note = validation.hardFailures.join('\n- ');
		result = await callAnthropic({ systemBlocks, userMessage, retryNote: `- ${note}` });
		totalInput += result.inputTokens;
		totalOutput += result.outputTokens;
		validation = validate(result.output, args.facts, voice, phase, args.candidate.signal?.primary_contact_name);
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
		phase,
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

export const PROJECT_COMPLETE_PROMPT_VERSION = PROMPT_VERSION;
export const PROJECT_COMPLETE_MODEL = MODEL;

// ─── Single-touch regenerator ───────────────────────────────────────────────

const SINGLE_TOUCH_PROMPT_VERSION = 'project_complete_single_v1.0';

const produceProjectCompleteSingleTouchTool: Anthropic.Tool = {
	name: 'produce_project_complete_single_touch',
	description:
		'Produce exactly ONE replacement touch for a project-complete campaign. Match the prior touch\'s kind/channel and take a meaningfully different angle.',
	input_schema: {
		type: 'object',
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
							body_markdown: { type: 'string' },
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
	candidate: ProjectCompleteCandidate;
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
		'Take a meaningfully different angle. Different opener, different anchor when possible (result vs. process; founder vs. team; outcome vs. pattern), different CTA framing where natural. Keep the same kind/channel and roughly similar length. For testimonial phase, still address the contact by their actual first name.';

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
- Produce exactly 1 touch via produce_project_complete_single_touch.
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
	phase: ProjectCompletePhase,
	primaryContact?: string,
): { hardFailures: string[]; warnings: string[] } {
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
		if (phase === 'request_testimonial' && t.email.body_markdown.includes('{{first_name}}')) {
			hard.push('testimonial phase must address contact by actual first name');
		}
		if (phase === 'request_testimonial' && primaryContact) {
			const firstName = primaryContact.split(/\s+/)[0];
			if (firstName && !t.email.body_markdown.toLowerCase().includes(firstName.toLowerCase())) {
				warn.push(`testimonial email does not address "${firstName}" by name`);
			}
		}
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
		tools: [produceProjectCompleteSingleTouchTool],
		tool_choice: { type: 'tool', name: produceProjectCompleteSingleTouchTool.name } as any,
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

export interface RunProjectCompleteSingleTouchRegeneratorResult {
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

export async function runProjectCompleteSingleTouchRegenerator(args: {
	organizationId: string;
	orgName: string;
	orgIndustry?: string;
	candidate: ProjectCompleteCandidate;
	facts: AvailableFact[];
	voice?: ResolvedVoice;
	priorTouch: DraftedTouch;
	varyInstruction?: string;
}): Promise<RunProjectCompleteSingleTouchRegeneratorResult> {
	const start = Date.now();
	const voice = args.voice || getResolvedVoice(args.organizationId);
	const phase: ProjectCompletePhase = args.candidate.phase || 'request_testimonial';
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

	let validation = validateSingleTouch(result.output, args.facts, voice, args.priorTouch, phase, args.candidate.signal?.primary_contact_name);
	let retried = false;
	if (validation.hardFailures.length > 0) {
		retried = true;
		const note = validation.hardFailures.join('\n- ');
		result = await callAnthropicSingleTouch({ systemBlocks, userMessage, retryNote: `- ${note}` });
		totalInput += result.inputTokens;
		totalOutput += result.outputTokens;
		validation = validateSingleTouch(result.output, args.facts, voice, args.priorTouch, phase, args.candidate.signal?.primary_contact_name);
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
