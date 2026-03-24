// server/api/ai/task-suggestions.post.ts
/**
 * AI Task Suggestions endpoint.
 * Generates task suggestions based on a user prompt/context.
 *
 * Request body:
 * {
 *   prompt?: string,        // Optional context or goal
 *   existingTasks?: string[] // Titles of existing tasks to avoid duplicates
 * }
 *
 * Response: { suggestions: string[] }
 */

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
	const { prompt, existingTasks, organizationId, clientId } = body;

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
					if (client.goals) brandInfo += `\nGoals: ${client.goals}`;
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
					if (org.goals) brandInfo += `\nGoals: ${org.goals}`;
					if (org.target_audience) brandInfo += `\nTarget Audience: ${org.target_audience}`;
					if (org.location) brandInfo += `\nLocation: ${org.location}`;
				}
			}
		} catch {
			// Brand context is non-critical
		}
	}

	const provider = getLLMProvider();

	const systemPrompt = `You are a productivity assistant. Generate a concise list of actionable tasks based on the user's request. Each task should be specific, actionable, and brief (under 80 characters). If brand or organization context is provided, tailor tasks to be relevant to their brand direction, goals, and target audience. Return ONLY a JSON array of strings, no other text. Example: ["Review Q1 report", "Send follow-up email to client", "Update project timeline"]`;

	let userMessage = prompt?.trim()
		? `Generate 5 task suggestions for: ${prompt}`
		: 'Generate 5 general productivity task suggestions for a busy professional working in a creative agency or small business.';

	if (existingTasks?.length) {
		userMessage += `\n\nAvoid duplicating these existing tasks: ${existingTasks.join(', ')}`;
	}

	userMessage += brandInfo;

	const messages: ChatMessage[] = [
		{ role: 'user', content: userMessage },
	];

	try {
		const response = await provider.chat(messages, {
			systemPrompt,
			maxTokens: 500,
			temperature: 0.8,
		});

		// Parse JSON array from response
		const content = response.content.trim();
		const jsonMatch = content.match(/\[[\s\S]*\]/);
		if (!jsonMatch) {
			throw new Error('Invalid AI response format');
		}

		const suggestions = JSON.parse(jsonMatch[0]);
		if (!Array.isArray(suggestions) || !suggestions.every((s: unknown) => typeof s === 'string')) {
			throw new Error('Invalid suggestions format');
		}

		return { suggestions: suggestions.slice(0, 8) };
	} catch (err: any) {
		console.error('AI task suggestions error:', err);
		throw createError({
			statusCode: 500,
			message: 'Failed to generate task suggestions',
		});
	}
});
