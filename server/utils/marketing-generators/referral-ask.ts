/**
 * Referral-ask generator — one warm email asking a happy client for a referral,
 * shortly after a project wrapped. Deliberately compact (a single touch), but
 * returns the same DraftedCampaign shape the multi-touch generators do, so it
 * plugs straight into the generate flow + the drafts drawer.
 *
 * Direct @anthropic-ai/sdk tool call (mirrors the other generators).
 */
import Anthropic from '@anthropic-ai/sdk';
import type { DraftedCampaign, DraftedTouch } from '~/composables/useMarketingDrafts';
import type { EmailCTA } from '~~/shared/marketing-persistence';

const MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = 1200;
const PROMPT_VERSION = 'referral_ask_v1.0';

export interface ReferralAskCandidate {
	signal?: {
		project_title?: string;
		client_name?: string;
		primary_contact_name?: string;
		days_since_complete?: number;
		budget_usd?: number;
	};
	audience?: { size?: number; sample_names?: string[]; contact_ids?: string[] };
}

const SYSTEM_PROMPT = `You draft ONE short email for a small business asking a happy client for a referral, shortly after a project wrapped.

- Open by referencing the specific finished project warmly (use the real project title + client contact name provided).
- Make ONE clear, low-pressure ask: is there anyone they know who could use similar work? Offer to make an intro easy.
- 90–160 words. Warm, human, specific. First person, as the business owner.
- No emoji, no "Hey", no clichés ("thrilled", "reach out", "don't hesitate", "leverage", "circle back").
- Ground strictly in the facts given; never invent client names, numbers, or details.

Return your draft ONLY via the produce_referral_ask tool.`;

const produceReferralAskTool = {
	name: 'produce_referral_ask',
	description: 'Produce a single warm referral-ask email.',
	input_schema: {
		type: 'object',
		properties: {
			subject: { type: 'string', description: 'Subject line, under 60 characters.' },
			preview_text: { type: 'string', description: 'Inbox preview text, under 90 characters.' },
			body_markdown: { type: 'string', description: 'The email body, 90–160 words, markdown.' },
		},
		required: ['subject', 'preview_text', 'body_markdown'],
	},
} as any;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
	if (_client) return _client;
	const config = useRuntimeConfig();
	const apiKey = (config as any).llm?.apiKey;
	if (!apiKey) throw new Error('LLM API key not configured. Set NUXT_LLM_API_KEY or ANTHROPIC_API_KEY.');
	_client = new Anthropic({ apiKey, maxRetries: 2 });
	return _client;
}

export interface RunReferralAskArgs {
	organizationId: string;
	orgName: string;
	orgIndustry?: string;
	candidate: ReferralAskCandidate;
	voice?: any;
}
export interface RunReferralAskResult {
	draft: DraftedCampaign;
	inputTokens: number;
	outputTokens: number;
	durationMs: number;
	promptVersion: string;
	model: string;
	warnings: string[];
	retried: boolean;
}

export async function runReferralAskGenerator(args: RunReferralAskArgs): Promise<RunReferralAskResult> {
	const start = Date.now();
	const s = args.candidate.signal || {};
	const voicePhrases: string[] = args.voice?.signature_phrases?.slice(0, 3) || [];

	const userMessage = [
		`BUSINESS: ${args.orgName}${args.orgIndustry ? ` (${args.orgIndustry})` : ''}`,
		`CLIENT: ${s.client_name || 'the client'}`,
		`PRIMARY CONTACT (address them by name): ${s.primary_contact_name || 'there'}`,
		`PROJECT JUST COMPLETED: "${s.project_title || 'their project'}"${s.days_since_complete != null ? ` — ${s.days_since_complete} days ago` : ''}`,
		s.budget_usd ? `PROJECT VALUE: $${Number(s.budget_usd).toLocaleString()}` : '',
		voicePhrases.length ? `VOICE — weave in naturally where it fits: ${voicePhrases.join(', ')}` : '',
		'',
		'Write the referral-ask email.',
	].filter(Boolean).join('\n');

	const client = getClient();
	const response = await client.messages.create({
		model: MODEL,
		max_tokens: MAX_TOKENS,
		system: SYSTEM_PROMPT,
		tools: [produceReferralAskTool],
		tool_choice: { type: 'tool', name: produceReferralAskTool.name } as any,
		messages: [{ role: 'user', content: userMessage }],
	});

	const toolBlock = response.content.find((b: any) => b.type === 'tool_use');
	if (!toolBlock) throw new Error('Referral generator did not return a tool_use block');
	const out = (toolBlock as any).input as { subject?: string; preview_text?: string; body_markdown?: string };
	const usage = response.usage as any;
	const inputTokens =
		(usage?.input_tokens || 0) + (usage?.cache_read_input_tokens || 0) + (usage?.cache_creation_input_tokens || 0);
	const outputTokens = usage?.output_tokens || 0;

	const warnings: string[] = [];
	if ((out.subject || '').length > 60) warnings.push('subject over 60 chars');

	const touch: DraftedTouch = {
		kind: 'email',
		send_offset_hours: 0,
		audience_target: 'project_contact',
		audience_filter: 'all',
		email_subject: out.subject || null,
		email_preview_text: out.preview_text || null,
		email_body_markdown: out.body_markdown || null,
		email_cta: 'reply' as EmailCTA,
		social_channel: null,
		social_caption: null,
		social_image_brief: null,
	};

	const draft: DraftedCampaign = {
		touches: [touch],
		phase_strategy: 'referral_ask',
		cadence_rationale: 'A single warm ask while the finished work is still fresh.',
		facts_used: [],
		tokens_spent: inputTokens + outputTokens,
		duration_ms: Date.now() - start,
		voice_signals: voicePhrases.length ? [`uses your phrases: ${voicePhrases.join(', ')}`] : ['drafted from your default voice profile'],
		audience_summary: {
			size: args.candidate.audience?.size ?? 1,
			sample_names: args.candidate.audience?.sample_names ?? (s.primary_contact_name ? [s.primary_contact_name] : []),
		},
	};

	return {
		draft,
		inputTokens,
		outputTokens,
		durationMs: Date.now() - start,
		promptVersion: PROMPT_VERSION,
		model: MODEL,
		warnings,
		retried: false,
	};
}

export const REFERRAL_ASK_PROMPT_VERSION = PROMPT_VERSION;
