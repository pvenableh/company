/**
 * AI Marketing Strategy Analysis Endpoint.
 *
 * Aggregates data across all Earnest modules and uses Claude
 * to generate marketing health scores, insights, recommendations,
 * and multi-channel campaign plans.
 */
import { getLLMProvider } from '~/server/utils/llm/factory';
import { getMarketingContext } from '~/server/utils/marketing-intelligence';
import { logAIUsage } from '~/server/utils/ai-usage';
import type { ChatMessage } from '~/server/utils/llm/types';
import type {
	MarketingAnalyzeRequest,
	DashboardAnalysis,
	CampaignAnalysis,
} from '~/types/marketing';

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const body = await readBody<MarketingAnalyzeRequest>(event);

	if (!body.analysisType || !['dashboard', 'campaign'].includes(body.analysisType)) {
		throw createError({ statusCode: 400, message: 'analysisType must be "dashboard" or "campaign"' });
	}
	if (!body.organizationId) {
		throw createError({ statusCode: 400, message: 'organizationId is required' });
	}
	if (body.analysisType === 'campaign' && !body.goal?.trim()) {
		throw createError({ statusCode: 400, message: 'A goal is required for campaign analysis' });
	}

	const directus = await getUserDirectus(event);
	const context = await getMarketingContext(directus, body.organizationId);

	const provider = getLLMProvider();
	const systemPrompt = body.analysisType === 'dashboard'
		? buildDashboardPrompt(context)
		: buildCampaignPrompt(context, body.goal!, body.timeframe);

	const messages: ChatMessage[] = [
		{
			role: 'user',
			content: body.analysisType === 'dashboard'
				? 'Analyze this business\'s marketing health and provide actionable insights.'
				: `Create a multi-channel campaign plan for this goal: ${body.goal}${body.timeframe ? ` (timeframe: ${body.timeframe})` : ''}`,
		},
	];

	try {
		const response = await provider.chat(messages, {
			systemPrompt,
			maxTokens: 4096,
			temperature: 0.7,
		});

		let parsed: DashboardAnalysis | CampaignAnalysis;
		try {
			let content = response.content.trim();
			if (content.startsWith('```')) {
				content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
			}
			parsed = JSON.parse(content);
		} catch {
			console.error('[marketing/ai-analyze] Failed to parse LLM response:', response.content);
			throw createError({
				statusCode: 502,
				message: 'AI returned an invalid response. Please try again.',
			});
		}

		// Log AI usage
		if (response.usage) {
			logAIUsage({
				event,
				endpoint: 'marketing/ai-analyze',
				model: response.model,
				inputTokens: response.usage.inputTokens,
				outputTokens: response.usage.outputTokens,
				organizationId: body.organizationId,
				metadata: { analysisType: body.analysisType },
			}).catch(() => {});
		}

		return parsed;
	} catch (error: any) {
		if (error.statusCode) throw error;
		console.error('[marketing/ai-analyze] LLM error:', error);
		throw createError({
			statusCode: 500,
			message: 'Failed to generate marketing analysis. Please try again.',
		});
	}
});

function buildDashboardPrompt(context: any): string {
	return `You are an expert marketing strategist analyzing a business's marketing performance across all channels. You have access to their full business data — contacts, social media, email campaigns, clients, revenue, projects, and support tickets.

BUSINESS DATA SNAPSHOT:
${JSON.stringify(context, null, 2)}

RULES:
- Return ONLY valid JSON, no markdown fences, no extra text
- Base your analysis on the actual data provided — don't make up numbers
- Health score should reflect real activity levels and growth
- Insights should be specific and reference actual data points
- Recommendations should be actionable with clear next steps
- If data is sparse, note it as an opportunity rather than just a weakness

Return this exact JSON structure:
{
  "healthScore": 0-100,
  "healthBreakdown": {
    "contentConsistency": 0-100,
    "audienceGrowth": 0-100,
    "engagement": 0-100,
    "emailPerformance": 0-100
  },
  "insights": [
    {
      "type": "strength" | "weakness" | "opportunity" | "action",
      "title": "Short title",
      "description": "2-3 sentence explanation with specific data references",
      "priority": "high" | "medium" | "low",
      "actionable": true/false,
      "channel": "social" | "email" | "crm" | "revenue" | "general",
      "link": "/social/compose" | "/email" | "/contacts" | "/clients" | null
    }
  ],
  "contentVelocity": {
    "postsPerWeek": number,
    "emailsPerMonth": number,
    "trend": "up" | "down" | "stable"
  },
  "audienceGrowth": {
    "followers": total across platforms,
    "subscribers": email subscribers,
    "contacts": total contacts,
    "trend": "up" | "down" | "stable"
  },
  "recommendations": [
    {
      "title": "Action title",
      "description": "What to do and why",
      "channel": "social" | "email" | "crm" | "content",
      "effort": "low" | "medium" | "high",
      "impact": "low" | "medium" | "high"
    }
  ]
}

Generate 4-6 insights and 3-5 recommendations.`;
}

function buildCampaignPrompt(context: any, goal: string, timeframe?: string): string {
	return `You are an expert marketing strategist creating a multi-channel campaign plan. You have access to the business's full data to create a realistic, data-informed plan.

BUSINESS DATA SNAPSHOT:
${JSON.stringify(context, null, 2)}

CAMPAIGN GOAL: ${goal}
${timeframe ? `TIMEFRAME: ${timeframe}` : 'TIMEFRAME: 4 weeks (default)'}

RULES:
- Return ONLY valid JSON, no markdown fences, no extra text
- Create a realistic plan based on the channels the business actually uses
- Reference real data (their audience size, active platforms, email lists) in your plan
- Social posts should be platform-appropriate and ready to adapt
- Email sequences should have compelling subject lines and clear segmentation
- KPIs should be realistic given their current metrics

Return this exact JSON structure:
{
  "campaignName": "Catchy campaign name",
  "objective": "1-2 sentence campaign objective",
  "timeline": [
    {
      "week": 1,
      "activities": [
        { "channel": "social" | "email" | "content" | "outreach", "action": "Action title", "details": "Specific details" }
      ]
    }
  ],
  "emailSequence": [
    {
      "day": 1,
      "subject": "Email subject line",
      "keyMessage": "Core message of this email",
      "cta": "Call-to-action text",
      "segment": "Which audience segment"
    }
  ],
  "socialPosts": [
    {
      "platform": "linkedin" | "facebook" | "instagram" | "threads",
      "content": "Full post text",
      "hashtags": ["#tag1", "#tag2"],
      "timing": "Week 1, Monday"
    }
  ],
  "kpis": [
    {
      "metric": "Metric name",
      "target": "Target value",
      "rationale": "Why this target"
    }
  ]
}

Create a 3-4 week timeline with 2-4 activities per week, 2-3 emails, 3-5 social posts, and 3-4 KPIs.`;
}
