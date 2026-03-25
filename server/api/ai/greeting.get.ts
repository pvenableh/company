import { getLLMProvider } from '~/server/utils/llm/factory';
import { enforceTokenLimits } from '~/server/utils/ai-token-enforcement';
import type { ChatMessage } from '~/server/utils/llm/types';

// Simple in-memory cache: userId -> { greeting, subtitle, expiresAt }
const greetingCache = new Map<string, { greeting: string; subtitle: string; expiresAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	const firstName = (session as any).user?.first_name || 'there';

	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	// Token enforcement
	const query = getQuery(event);
	const organizationId = query.organizationId as string | undefined;
	const tokenCheck = await enforceTokenLimits(event, organizationId);
	if (!tokenCheck.allowed) {
		// Degrade gracefully for greetings instead of blocking
		return {
			greeting: `Hey ${firstName}, ready to go?`,
			subtitle: "Here's what needs your attention",
			cached: false,
			fallback: true,
		};
	}

	const persona = (query.persona as string) || 'default';
	const hour = Number(query.hour) || new Date().getHours();
	const taskCount = Number(query.tasks) || 0;
	const overdueCount = Number(query.overdue) || 0;

	// Check cache
	const cacheKey = `${userId}-${persona}-${Math.floor(hour / 4)}`; // Cache per 4-hour window
	const cached = greetingCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) {
		return { greeting: cached.greeting, subtitle: cached.subtitle, cached: true };
	}

	const provider = getLLMProvider();

	const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

	const personaDescriptions: Record<string, string> = {
		default: 'a balanced, professional, and warm business assistant named Earnest',
		director: 'a direct, no-nonsense executive assistant who gets straight to the point',
		buddy: 'a friendly, casual work buddy who uses emoji occasionally and keeps things light',
		motivator: 'an enthusiastic motivational coach who believes in the user and uses energy and emoji',
	};

	const personaDesc = personaDescriptions[persona] || personaDescriptions.default;

	let contextHint = '';
	if (taskCount > 0 || overdueCount > 0) {
		const parts = [];
		if (overdueCount > 0) parts.push(`${overdueCount} overdue item${overdueCount > 1 ? 's' : ''}`);
		if (taskCount > 0) parts.push(`${taskCount} task${taskCount > 1 ? 's' : ''} due today`);
		contextHint = ` The user has ${parts.join(' and ')}.`;
	}

	const systemPrompt = `You are ${personaDesc}. Generate a personalized greeting for the user.

Rules:
- The user's name is "${firstName}" and it's ${period}
- Return ONLY a JSON object with "greeting" and "subtitle" fields
- greeting: A warm, unique greeting (under 60 chars). Address them by name.
- subtitle: A brief motivational or contextual line (under 80 chars)${contextHint}
- Stay in character for the persona
- Be creative — don't use generic "Good morning" style greetings
- No quotes around the name`;

	const messages: ChatMessage[] = [
		{ role: 'user', content: `Generate a ${period} greeting for ${firstName}.` },
	];

	try {
		const response = await provider.chat(messages, {
			systemPrompt,
			maxTokens: 150,
			temperature: 0.9,
		});

		const content = response.content.trim();
		const jsonMatch = content.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			throw new Error('Invalid AI response format');
		}

		const result = JSON.parse(jsonMatch[0]);
		const greeting = result.greeting || `Hey ${firstName}!`;
		const subtitle = result.subtitle || "Here's what needs your attention";

		// Cache the result
		greetingCache.set(cacheKey, {
			greeting,
			subtitle,
			expiresAt: Date.now() + CACHE_TTL,
		});

		return { greeting, subtitle, cached: false };
	} catch (err: any) {
		console.error('AI greeting error:', err);
		// Return a fallback — don't throw, just degrade gracefully
		return {
			greeting: `Hey ${firstName}, ready to go?`,
			subtitle: "Here's what needs your attention",
			cached: false,
			fallback: true,
		};
	}
});
