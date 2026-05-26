/**
 * POST /api/social/ai-trim
 *
 * Seam-fix endpoint for the master-variant composer.
 *
 * Given a draft caption that's over a platform's character limit, returns a
 * trimmed version in that platform's voice. The composer uses this to fork a
 * platform-specific variant on demand (the "Earnest can trim to N" chip).
 *
 * Returns:
 *   { caption: string }   // the trimmed copy (no markdown, no JSON wrap)
 */
import { z } from 'zod';
import { getLLMProvider } from '~~/server/utils/llm/factory';
import { logAIUsage } from '~~/server/utils/ai-usage';
import { enforceTokenLimits } from '~~/server/utils/ai-token-enforcement';
import { getBrandContext } from '~~/server/utils/brand-context';
import type { ChatMessage } from '~~/server/utils/llm/types';

const bodySchema = z.object({
	text: z.string().min(1).max(8000),
	platform: z.enum(['instagram', 'tiktok', 'linkedin', 'facebook', 'threads']),
	target_chars: z.number().int().min(50).max(4000),
	cta_url: z.string().url().nullable().optional(),
	cta_label: z.string().max(80).nullable().optional(),
	client_id: z.string().uuid().nullable().optional(),
	organization_id: z.string().uuid().nullable().optional(),
});

const PLATFORM_VOICE: Record<string, string> = {
	instagram: 'Caption-style, hook-first, emoji-friendly. First line drives feed preview. Up to 30 hashtags ok at the end. Keep visual descriptions.',
	tiktok: 'Punchy, hook-first, conversational. Comfortable with slang and trending phrases. 0-3 hashtags max.',
	linkedin: 'Professional and substantive, line-broken for readability. First-line hook, value first. 3-5 hashtags at the bottom. No fluff.',
	threads: 'Short and opinionated. Twitter/X-style tone. 0-2 hashtags max. Cut hard — every word earns its place.',
	facebook: 'Conversational and engaging, can be longer. Ask a question if it fits. 1-3 hashtags inline. Plain copy, no JSON.',
};

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const raw = await readBody(event);
	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		throw createError({
			statusCode: 400,
			message: 'Validation failed',
			data: parsed.error.flatten(),
		});
	}
	const body = parsed.data;

	const tokenCheck = await enforceTokenLimits(event, body.organization_id ?? undefined);
	if (!tokenCheck.allowed) {
		throw createError({
			statusCode: tokenCheck.statusCode || 402,
			message: tokenCheck.reason || 'AI token limit reached',
		});
	}

	const brand = await getBrandContext(event, {
		clientId: body.client_id ?? undefined,
		organizationId: body.organization_id ?? undefined,
	});

	// CTA suffix counts against the published budget; if present, shave that
	// off the target so the AI hits the right cap on text-only.
	const suffixLength = ctaSuffixLength(body.cta_url, body.cta_label);
	const textBudget = Math.max(50, body.target_chars - suffixLength);

	const voice = PLATFORM_VOICE[body.platform] ?? '';

	const systemPrompt = [
		`You are a senior social media editor trimming a draft to fit a platform-specific cap.`,
		`Platform: ${body.platform}.`,
		`Voice & format: ${voice}`,
		`Hard cap: ${textBudget} characters for the caption body (the platform will append a CTA suffix separately, so do not include URLs).`,
		`Preserve the post's central claim, hook, and any specific numbers, names, or quotes verbatim.`,
		`Cut filler, repetition, and any preamble that doesn't earn its place.`,
		`Return ONLY the trimmed caption text — no quotes, no JSON, no commentary, no leading "Here's the trimmed version" framing.`,
	].join('\n');

	const userMessage =
		`Original caption (${body.text.length} chars):\n\n${body.text}\n\n` +
		`Trim to fit ${textBudget} characters in the ${body.platform} voice described above.${brand}`;

	const messages: ChatMessage[] = [{ role: 'user', content: userMessage }];

	const provider = getLLMProvider();
	try {
		const response = await provider.chat(messages, {
			systemPrompt,
			maxTokens: 1024,
			temperature: 0.5,
		});

		let caption = response.content.trim();
		// Defensive: strip stray code fences or surrounding quotes if the
		// model added them despite instructions.
		if (caption.startsWith('```')) {
			caption = caption.replace(/^```(?:\w+)?\n?/, '').replace(/\n?```$/, '').trim();
		}
		if (
			(caption.startsWith('"') && caption.endsWith('"'))
			|| (caption.startsWith('“') && caption.endsWith('”'))
		) {
			caption = caption.slice(1, -1).trim();
		}

		// Final guard: if the model still overshot, hard-truncate at a word
		// boundary so the UI doesn't keep nagging.
		if (caption.length > textBudget) {
			caption = hardTruncate(caption, textBudget);
		}

		if (response.usage) {
			logAIUsage({
				event,
				endpoint: 'social/ai-trim',
				model: response.model,
				inputTokens: response.usage.inputTokens,
				outputTokens: response.usage.outputTokens,
				metadata: { platform: body.platform, target_chars: body.target_chars },
			}).catch(() => {});
		}

		return { caption };
	} catch (error: any) {
		if (error.statusCode) throw error;
		console.error('[social/ai-trim] LLM error:', error);
		throw createError({
			statusCode: 500,
			message: 'Failed to trim caption. Please try again.',
		});
	}
});

function ctaSuffixLength(url: string | null | undefined, label: string | null | undefined): number {
	if (!url) return 0;
	const trimmedLabel = label?.trim();
	const suffix = trimmedLabel ? `${trimmedLabel}: ${url}` : url;
	return suffix.length + 2; // "\n\n"
}

/** Hard truncate at a word boundary with an ellipsis. */
function hardTruncate(text: string, max: number): string {
	if (text.length <= max) return text;
	const slice = text.slice(0, max - 1);
	const lastSpace = slice.lastIndexOf(' ');
	const cutAt = lastSpace > max * 0.6 ? lastSpace : slice.length;
	return slice.slice(0, cutAt) + '…';
}
