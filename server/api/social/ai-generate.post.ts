/**
 * AI Social Media Content Generator.
 *
 * Takes a topic + preferences and uses Claude to generate
 * platform-optimized social media posts with tailored copy,
 * hashtags, and image suggestions.
 */
import { readItem, readItems } from '@directus/sdk';
import { getLLMProvider } from '~/server/utils/llm/factory';
import { logAIUsage } from '~/server/utils/ai-usage';
import { enforceTokenLimits } from '~/server/utils/ai-token-enforcement';
import type { ChatMessage } from '~/server/utils/llm/types';
import type { SocialAIGenerateRequest, SocialAIGenerateResponse } from '~/types/social';

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const body = await readBody<SocialAIGenerateRequest>(event);

	// Enforce AI token limits
	const tokenCheck = await enforceTokenLimits(event, (body as any).organizationId);
	if (!tokenCheck.allowed) {
		throw createError({ statusCode: 429, message: tokenCheck.reason || 'AI token limit reached' });
	}

	if (!body.topic?.trim()) {
		throw createError({ statusCode: 400, message: 'Topic is required' });
	}
	if (!body.platforms?.length) {
		throw createError({ statusCode: 400, message: 'At least one platform is required' });
	}

	// Fetch brand context: selected client if provided, otherwise organization
	let brandContext = '';
	const orgId = (body as any).organizationId;
	const clientId = (body as any).clientId;
	if (orgId || clientId) {
		try {
			const directus = await getUserDirectus(event);
			const parts: string[] = [];

			if (clientId) {
				// Use selected client's brand data
				const client = await directus.request(readItem('clients', clientId, {
					fields: ['name', 'brand_direction', 'goals', 'target_audience', 'location'],
				})).catch(() => null as any);
				if (client && (client.brand_direction || client.goals || client.target_audience)) {
					parts.push(`BRAND CONTEXT (Client: ${client.name}):`);
					if (client.brand_direction) parts.push(`Brand Direction: ${client.brand_direction}`);
					if (client.goals) parts.push(`Goals: ${client.goals}`);
					if (client.target_audience) parts.push(`Target Audience: ${client.target_audience}`);
					if (client.location) parts.push(`Location: ${client.location}`);
				}
			}

			// Fall back to org brand if no client brand data
			if (parts.length === 0 && orgId) {
				const org = await directus.request(readItem('organizations', orgId, {
					fields: ['name', 'brand_direction', 'goals', 'target_audience', 'location'],
				})).catch(() => null as any);
				if (org && (org.brand_direction || org.goals || org.target_audience)) {
					parts.push(`BRAND CONTEXT (${org.name || 'Organization'}):`);
					if (org.brand_direction) parts.push(`Brand Direction: ${org.brand_direction}`);
					if (org.goals) parts.push(`Goals: ${org.goals}`);
					if (org.target_audience) parts.push(`Target Audience: ${org.target_audience}`);
					if (org.location) parts.push(`Location: ${org.location}`);
				}
			}

			if (parts.length > 0) {
				brandContext = '\n\n' + parts.join('\n');
			}
		} catch {
			// Brand context is non-critical
		}
	}

	const systemPrompt = buildSystemPrompt(body.platforms);
	const userMessage = buildUserMessage(body) + brandContext;

	const messages: ChatMessage[] = [
		{ role: 'user', content: userMessage },
	];

	const provider = getLLMProvider();

	try {
		const response = await provider.chat(messages, {
			systemPrompt,
			maxTokens: 4096,
			temperature: 0.7,
		});

		let generated: SocialAIGenerateResponse;
		try {
			let content = response.content.trim();
			if (content.startsWith('```')) {
				content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
			}
			generated = JSON.parse(content);
		} catch {
			console.error('[social/ai-generate] Failed to parse LLM response:', response.content);
			throw createError({
				statusCode: 502,
				message: 'AI returned invalid response. Please try again.',
			});
		}

		// Validate that we got posts for the requested platforms
		const validPlatforms = new Set(body.platforms);
		generated.posts = (generated.posts || []).filter(
			(p) => validPlatforms.has(p.platform),
		);

		// Ensure hashtags are arrays and have # prefix
		for (const post of generated.posts) {
			if (!Array.isArray(post.hashtags)) {
				post.hashtags = [];
			}
			post.hashtags = post.hashtags.map((tag) =>
				tag.startsWith('#') ? tag : `#${tag}`,
			);
		}

		// Log AI usage
		if (response.usage) {
			logAIUsage({
				event,
				endpoint: 'social/ai-generate',
				model: response.model,
				inputTokens: response.usage.inputTokens,
				outputTokens: response.usage.outputTokens,
				metadata: { platforms: body.platforms, contentType: body.contentType },
			}).catch(() => {});
		}

		return generated;
	} catch (error: any) {
		if (error.statusCode) throw error;
		console.error('[social/ai-generate] LLM error:', error);
		throw createError({
			statusCode: 500,
			message: 'Failed to generate social content. Please try again.',
		});
	}
});

function buildSystemPrompt(platforms: string[]): string {
	const platformConstraints: Record<string, string> = {
		linkedin: `- LinkedIn: Professional tone, max 3000 characters. Start with a compelling hook in the first line. Use line breaks for readability. Place 3-5 relevant hashtags at the very bottom, separated from the main text. Avoid excessive emojis. Include industry context and thought leadership angles.`,
		facebook: `- Facebook: Conversational and engaging. Emoji-friendly. Can be longer form. Ask questions to drive engagement and comments. Use 1-3 hashtags naturally within or at the end. Include a clear value proposition. Link previews work well here.`,
		threads: `- Threads: Short-form and punchy, max 500 characters. Conversational tone. Minimal hashtags (0-2 max). Think Twitter/X style — concise, opinionated, thread-friendly. If the content is long, suggest where to break into a thread.`,
		instagram: `- Instagram: Caption-style writing. Start with a hook, then expand. Emoji-rich and visually descriptive. Place up to 30 hashtags in a separate block after the main caption (separated by line breaks). Mix popular and niche hashtags. First line is crucial for the feed preview.`,
	};

	const selectedConstraints = platforms
		.map((p) => platformConstraints[p])
		.filter(Boolean)
		.join('\n');

	return `You are an expert social media strategist and copywriter. You create engaging, platform-optimized social media content that drives engagement and achieves business goals.

PLATFORM-SPECIFIC CONSTRAINTS:
${selectedConstraints}

RULES:
- Return ONLY valid JSON, no markdown fences, no extra text
- Generate content ONLY for the requested platforms
- Each platform version must be uniquely tailored to that platform's style and audience expectations — not just reformatted
- Hashtags should be relevant, trending when appropriate, and platform-appropriate in quantity
- Include a clear, actionable image suggestion for visual content
- If a CTA is requested, weave it naturally into the content — don't make it feel forced
- Content should be ready to post — no placeholder text or brackets

Return this exact JSON structure:
{
  "posts": [
    {
      "platform": "linkedin",
      "content": "The full post text (without hashtags — put those in the hashtags array)",
      "hashtags": ["#hashtag1", "#hashtag2"],
      "cta": "Optional call-to-action text if requested",
      "imageSuggestion": {
        "description": "Description of the ideal image to accompany this post",
        "searchTerms": ["search term 1", "search term 2", "search term 3"]
      }
    }
  ]
}`;
}

function buildUserMessage(body: SocialAIGenerateRequest): string {
	const parts: string[] = [];

	parts.push(`Create social media posts for: ${body.topic.trim()}`);
	parts.push(`Platforms: ${body.platforms.join(', ')}`);
	parts.push(`Content type: ${body.contentType}`);

	if (body.keyPoints?.trim()) {
		parts.push(`Key points to include:\n${body.keyPoints.trim()}`);
	}

	parts.push(`Tone: ${body.tone}`);
	parts.push(`Target audience: ${body.audience}`);

	if (body.brandVoice?.trim()) {
		parts.push(`Brand voice notes: ${body.brandVoice.trim()}`);
	}

	if (body.ctaType) {
		parts.push(`Include a call-to-action: ${body.ctaType.replace(/-/g, ' ')}`);
	}

	return parts.join('\n\n');
}
