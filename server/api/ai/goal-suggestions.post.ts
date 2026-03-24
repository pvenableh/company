import { readItem } from '@directus/sdk';
import { getLLMProvider } from '~/server/utils/llm/factory';
import type { ChatMessage } from '~/server/utils/llm/types';

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;

	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const body = await readBody(event);
	const { existingGoals, context, organizationId, clientId } = body;

	// Fetch brand context: client first, org fallback
	let brandInfo = '';
	if (organizationId || clientId) {
		try {
			const directus = await getUserDirectus(event);
			if (clientId) {
				const client = await directus.request(readItem('clients', clientId, {
					fields: ['name', 'brand_direction', 'goals', 'target_audience', 'location'],
				})).catch(() => null as any);
				if (client && (client.brand_direction || client.goals || client.target_audience)) {
					brandInfo = `\n\nCLIENT CONTEXT (${client.name}):`;
					if (client.brand_direction) brandInfo += `\nBrand Direction: ${client.brand_direction}`;
					if (client.goals) brandInfo += `\nExisting Goals: ${client.goals}`;
					if (client.target_audience) brandInfo += `\nTarget Audience: ${client.target_audience}`;
					if (client.location) brandInfo += `\nLocation: ${client.location}`;
				}
			}
			if (!brandInfo && organizationId) {
				const org = await directus.request(readItem('organizations', organizationId, {
					fields: ['name', 'brand_direction', 'goals', 'target_audience', 'location'],
				})).catch(() => null as any);
				if (org && (org.brand_direction || org.goals || org.target_audience)) {
					brandInfo = `\n\nORGANIZATION CONTEXT (${org.name}):`;
					if (org.brand_direction) brandInfo += `\nBrand Direction: ${org.brand_direction}`;
					if (org.goals) brandInfo += `\nExisting Goals: ${org.goals}`;
					if (org.target_audience) brandInfo += `\nTarget Audience: ${org.target_audience}`;
					if (org.location) brandInfo += `\nLocation: ${org.location}`;
				}
			}
		} catch {
			// Brand context is non-critical
		}
	}

	const provider = getLLMProvider();

	const systemPrompt = `You are a business strategy assistant for a creative agency / small business platform called Earnest. Generate smart, actionable goal suggestions based on the user's context and brand information.

Each goal should include:
- title: A clear, measurable goal title (under 60 chars)
- description: One sentence explaining why this matters
- type: One of "financial", "networking", "performance", "marketing", or "custom"
- target_value: A realistic numeric target
- target_unit: One of "USD", "percent", "contacts", "projects", "tasks", "campaigns"
- timeframe: One of "weekly", "monthly", "quarterly", "yearly"
- priority: One of "low", "medium", "high"

If brand context is provided, tailor goals to align with the brand direction, target audience, and stated objectives.

Return ONLY a JSON array of goal objects. No other text.`;

	let userMessage = 'Suggest 3-4 strategic goals for a business professional.';

	if (context?.trim()) {
		userMessage = `Suggest 3-4 goals based on this context: ${context}`;
	}

	if (existingGoals?.length) {
		userMessage += `\n\nThey already have these goals (avoid duplicates): ${existingGoals.map((g: any) => g.title).join(', ')}`;
	}

	userMessage += brandInfo;

	const messages: ChatMessage[] = [
		{ role: 'user', content: userMessage },
	];

	try {
		const response = await provider.chat(messages, {
			systemPrompt,
			maxTokens: 1000,
			temperature: 0.8,
		});

		const content = response.content.trim();
		const jsonMatch = content.match(/\[[\s\S]*\]/);
		if (!jsonMatch) {
			throw new Error('Invalid AI response format');
		}

		const suggestions = JSON.parse(jsonMatch[0]);
		if (!Array.isArray(suggestions)) {
			throw new Error('Invalid suggestions format');
		}

		return { suggestions: suggestions.slice(0, 5) };
	} catch (err: any) {
		console.error('AI goal suggestions error:', err);
		throw createError({
			statusCode: 500,
			message: 'Failed to generate goal suggestions',
		});
	}
});
