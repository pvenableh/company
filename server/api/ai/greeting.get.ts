import { getLLMProvider } from '~~/server/utils/llm/factory';
import { EARNEST_VOICE_CHARTER } from '~~/server/utils/llm/voice';
import { enforceTokenLimits } from '~~/server/utils/ai-token-enforcement';
import { getWeatherContext } from '~~/server/utils/weather';
import type { ChatMessage } from '~~/server/utils/llm/types';

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

	const hour = Number(query.hour) || new Date().getHours();
	const taskCount = Number(query.tasks) || 0;
	const overdueCount = Number(query.overdue) || 0;

	// Check cache
	const cacheKey = `${userId}-${Math.floor(hour / 4)}`; // Cache per 4-hour window
	const cached = greetingCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) {
		return { greeting: cached.greeting, subtitle: cached.subtitle, cached: true };
	}

	const provider = getLLMProvider();

	const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

	const personaDesc = 'a warm, encouraging business assistant named Earnest — friendly and genuinely supportive, celebrating real progress without exaggeration or empty hype';

	let contextHint = '';
	if (taskCount > 0 || overdueCount > 0) {
		const parts = [];
		if (overdueCount > 0) parts.push(`${overdueCount} overdue item${overdueCount > 1 ? 's' : ''}`);
		if (taskCount > 0) parts.push(`${taskCount} task${taskCount > 1 ? 's' : ''} due today`);
		contextHint = ` The user has ${parts.join(' and ')}.`;
	}

	// Light weather texture — present only where coarse edge geo exists (prod).
	// One optional, natural clause; never a widget, never a mood.
	const weather = await getWeatherContext(event);
	const weatherHint = weather
		? `\n- Outside right now: ${weather.condition}${weather.tempF != null ? `, ${weather.tempF}°F` : ''}${weather.city ? ` in ${weather.city}` : ''}. You MAY weave ONE short, natural nod to this weather into the greeting as light texture if it genuinely fits — never force it, and never infer the user's mood from the weather.`
		: '';

	const systemPrompt = `You are ${personaDesc}. Generate a personalized greeting for the user.

${EARNEST_VOICE_CHARTER}

Rules:
- The user's name is "${firstName}" and it's ${period}
- Return ONLY a JSON object with "greeting" and "subtitle" fields
- greeting: A warm, unique greeting (under 60 chars). Address them by name.
- subtitle: A brief contextual line (under 80 chars)${contextHint}${weatherHint}
- Stay warm and in Earnest's voice, but never exaggerate. If there is nothing notable to say, keep it simple and honest rather than manufacturing excitement.
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
