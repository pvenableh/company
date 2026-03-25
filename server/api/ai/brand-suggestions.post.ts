/**
 * AI Brand Suggestions Endpoint.
 *
 * Generates brand direction, goals, target audience, and location
 * suggestions for organizations or clients based on existing data.
 */
import { readItem, readItems } from '@directus/sdk';
import { getLLMProvider } from '~/server/utils/llm/factory';
import { enforceTokenLimits } from '~/server/utils/ai-token-enforcement';
import type { ChatMessage } from '~/server/utils/llm/types';

interface BrandSuggestionsRequest {
	/** 'organization' or 'client' */
	entityType: 'organization' | 'client';
	/** The entity ID to generate suggestions for */
	entityId: string;
	/** Organization ID (for context) */
	organizationId: string;
	/** Which field to generate suggestions for */
	field: 'brand_direction' | 'goals' | 'target_audience' | 'location' | 'all';
	/** Existing value to refine (optional) */
	currentValue?: string;
}

interface BrandSuggestion {
	field: string;
	options: string[];
}

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const body = await readBody<BrandSuggestionsRequest>(event);

	if (!body.entityType || !['organization', 'client'].includes(body.entityType)) {
		throw createError({ statusCode: 400, message: 'entityType must be "organization" or "client"' });
	}
	if (!body.entityId || !body.organizationId) {
		throw createError({ statusCode: 400, message: 'entityId and organizationId are required' });
	}
	if (!body.field || !['brand_direction', 'goals', 'target_audience', 'location', 'all'].includes(body.field)) {
		throw createError({ statusCode: 400, message: 'field must be one of: brand_direction, goals, target_audience, location, all' });
	}

	// Token enforcement
	const tokenCheck = await enforceTokenLimits(event, body.organizationId);
	if (!tokenCheck.allowed) {
		throw createError({ statusCode: tokenCheck.statusCode || 402, message: tokenCheck.reason || 'Token limit reached' });
	}

	const directus = await getUserDirectus(event);

	// Gather context about the entity
	let entityData: any = null;
	let orgData: any = null;

	try {
		if (body.entityType === 'organization') {
			entityData = await directus.request(readItem('organizations', body.entityId, {
				fields: ['name', 'notes', 'website', 'brand_color', 'brand_direction', 'goals', 'target_audience', 'location', 'industry.name'],
			}));
			orgData = entityData;
		} else {
			entityData = await directus.request(readItem('clients', body.entityId, {
				fields: ['name', 'status', 'website', 'industry', 'notes', 'tags', 'brand_direction', 'goals', 'target_audience', 'location', 'services'],
			}));
			orgData = await directus.request(readItem('organizations', body.organizationId, {
				fields: ['name', 'brand_direction', 'goals', 'target_audience', 'location', 'industry.name'],
			})).catch(() => null);
		}
	} catch {
		throw createError({ statusCode: 404, message: 'Entity not found' });
	}

	// Get related data for richer context
	let relatedContext = '';
	try {
		if (body.entityType === 'client') {
			// Get projects for this client
			const projects = await directus.request(readItems('projects', {
				filter: { client: { _eq: body.entityId } },
				fields: ['title', 'status'],
				limit: 10,
			}));
			if (projects.length > 0) {
				relatedContext += `\nRecent projects: ${projects.map((p: any) => p.title).join(', ')}`;
			}
		}

		// Get other clients for org context
		if (body.entityType === 'organization') {
			const clients = await directus.request(readItems('clients', {
				filter: { organization: { _eq: body.organizationId }, status: { _eq: 'active' } },
				fields: ['name', 'industry'],
				limit: 10,
			}));
			if (clients.length > 0) {
				relatedContext += `\nActive clients: ${clients.map((c: any) => `${c.name}${c.industry ? ` (${c.industry})` : ''}`).join(', ')}`;
			}
		}
	} catch {
		// Non-critical
	}

	const provider = getLLMProvider();

	const fields = body.field === 'all'
		? ['brand_direction', 'goals', 'target_audience', 'location']
		: [body.field];

	const systemPrompt = buildBrandPrompt(body.entityType, entityData, orgData, fields, relatedContext, body.currentValue);

	const messages: ChatMessage[] = [{
		role: 'user',
		content: `Generate brand and strategy suggestions for the ${body.field === 'all' ? 'all fields' : body.field.replace('_', ' ')} field${body.field !== 'all' ? '' : 's'}.`,
	}];

	try {
		const response = await provider.chat(messages, {
			systemPrompt,
			maxTokens: 2048,
			temperature: 0.8,
		});

		let parsed: { suggestions: BrandSuggestion[] };
		try {
			let content = response.content.trim();
			if (content.startsWith('```')) {
				content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
			}
			parsed = JSON.parse(content);
		} catch {
			console.error('[ai/brand-suggestions] Failed to parse LLM response:', response.content.slice(0, 500));
			throw createError({
				statusCode: 502,
				message: 'AI returned an invalid response. Please try again.',
			});
		}

		return parsed;
	} catch (error: any) {
		if (error.statusCode) throw error;
		console.error('[ai/brand-suggestions] LLM error:', error);
		throw createError({
			statusCode: 500,
			message: 'Failed to generate brand suggestions. Please try again.',
		});
	}
});

function buildBrandPrompt(
	entityType: string,
	entityData: any,
	orgData: any,
	fields: string[],
	relatedContext: string,
	currentValue?: string,
): string {
	const entityName = entityData?.name || 'Unknown';
	const entityLabel = entityType === 'organization' ? 'organization' : 'client';

	let contextBlock = `ENTITY: ${entityLabel} "${entityName}"`;
	if (entityData?.industry || entityData?.industry?.name) {
		contextBlock += `\nIndustry: ${entityData.industry?.name || entityData.industry}`;
	}
	if (entityData?.website) contextBlock += `\nWebsite: ${entityData.website}`;
	if (entityData?.notes) contextBlock += `\nNotes: ${entityData.notes}`;
	if (entityData?.tags?.length) contextBlock += `\nTags: ${entityData.tags.join(', ')}`;
	if (entityData?.services?.length) contextBlock += `\nServices: ${entityData.services.join(', ')}`;
	if (entityData?.status) contextBlock += `\nStatus: ${entityData.status}`;
	if (relatedContext) contextBlock += relatedContext;

	// Include existing brand fields for context
	const existingFields: string[] = [];
	if (entityData?.brand_direction) existingFields.push(`Brand Direction: ${entityData.brand_direction}`);
	if (entityData?.goals) existingFields.push(`Goals: ${entityData.goals}`);
	if (entityData?.target_audience) existingFields.push(`Target Audience: ${entityData.target_audience}`);
	if (entityData?.location) existingFields.push(`Location: ${entityData.location}`);
	if (existingFields.length > 0) {
		contextBlock += `\n\nExisting brand fields:\n${existingFields.join('\n')}`;
	}

	// Include org context for client entities
	if (entityType === 'client' && orgData) {
		contextBlock += `\n\nParent Organization: "${orgData.name}"`;
		if (orgData.brand_direction) contextBlock += `\nOrg Brand Direction: ${orgData.brand_direction}`;
		if (orgData.goals) contextBlock += `\nOrg Goals: ${orgData.goals}`;
		if (orgData.target_audience) contextBlock += `\nOrg Target Audience: ${orgData.target_audience}`;
	}

	if (currentValue) {
		contextBlock += `\n\nCurrent value being refined: "${currentValue}"`;
	}

	const fieldDescriptions: Record<string, string> = {
		brand_direction: 'The overall brand positioning, voice, visual style, and messaging strategy. Should describe the brand identity and how it should be perceived.',
		goals: 'Business goals and objectives. Should be specific, measurable, and time-relevant where possible.',
		target_audience: 'The ideal customer or audience profile. Include demographics, psychographics, pain points, and what they value.',
		location: 'Geographic market focus. Can be a city, region, or "Remote/Global".',
	};

	const fieldsToGenerate = fields.map(f => `- ${f.replace('_', ' ')}: ${fieldDescriptions[f] || ''}`).join('\n');

	return `You are a brand strategist helping a creative agency define brand positioning for their ${entityLabel}. Generate practical, specific suggestions that the user can select or customize.

${contextBlock}

FIELDS TO GENERATE:
${fieldsToGenerate}

RULES:
- Return ONLY valid JSON, no markdown fences, no extra text
- For each field, provide exactly 3 distinct options ranging from conservative to ambitious
- Each option should be 1-3 sentences, specific and actionable
- Base suggestions on the actual data provided (industry, existing clients, services)
- ${currentValue ? 'The current value is provided — offer refinements and alternatives, not duplicates' : 'These are fresh suggestions — be creative but grounded in the data'}
- If the entity is a client, consider the parent organization's brand context
- Make suggestions that are distinct from each other (different angles, not synonyms)

Return this exact JSON structure:
{
  "suggestions": [
    {
      "field": "field_name",
      "options": ["Option 1 text", "Option 2 text", "Option 3 text"]
    }
  ]
}

Generate suggestions for ${fields.length === 1 ? 'the specified field' : 'each field listed above'}.`;
}
