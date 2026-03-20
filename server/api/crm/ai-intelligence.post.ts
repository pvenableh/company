/**
 * AI CRM Intelligence Endpoint.
 *
 * Aggregates data across contacts, cd_contacts, clients, projects, tasks,
 * tickets, invoices, and deals — then uses Claude to generate smart
 * suggestions, actions, and growth ideas.
 *
 * Supports four analysis types:
 * - overview: Full CRM health check with actions + insights
 * - contact-strategy: Segmentation, re-engagement, and outreach cadence
 * - growth-plan: Growth targets, strategies, and weekly plans
 * - pipeline-review: Deal pipeline analysis with forecasting
 */
import { getLLMProvider } from '~/server/utils/llm/factory';
import { getCRMContext } from '~/server/utils/crm-intelligence';
import { logAIUsage } from '~/server/utils/ai-usage';
import type { ChatMessage } from '~/server/utils/llm/types';
import type {
	CRMIntelligenceRequest,
	CRMOverviewAnalysis,
	CRMContactStrategyAnalysis,
	CRMGrowthPlanAnalysis,
	CRMPipelineReviewAnalysis,
} from '~/types/crm-intelligence';

type AnalysisResult =
	| CRMOverviewAnalysis
	| CRMContactStrategyAnalysis
	| CRMGrowthPlanAnalysis
	| CRMPipelineReviewAnalysis;

const VALID_TYPES = ['overview', 'contact-strategy', 'growth-plan', 'pipeline-review'];

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const body = await readBody<CRMIntelligenceRequest>(event);

	if (!body.analysisType || !VALID_TYPES.includes(body.analysisType)) {
		throw createError({
			statusCode: 400,
			message: `analysisType must be one of: ${VALID_TYPES.join(', ')}`,
		});
	}
	if (!body.organizationId) {
		throw createError({ statusCode: 400, message: 'organizationId is required' });
	}

	const directus = await getUserDirectus(event);
	const context = await getCRMContext(directus, body.organizationId, userId);

	const provider = getLLMProvider();
	const systemPrompt = buildPrompt(body.analysisType, context, body.focus);

	const messages: ChatMessage[] = [
		{
			role: 'user',
			content: getUserMessage(body.analysisType, body.focus),
		},
	];

	try {
		const response = await provider.chat(messages, {
			systemPrompt,
			maxTokens: 4096,
			temperature: 0.7,
		});

		let parsed: AnalysisResult;
		try {
			let content = response.content.trim();
			if (content.startsWith('```')) {
				content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
			}
			parsed = JSON.parse(content);
		} catch {
			console.error('[crm/ai-intelligence] Failed to parse LLM response:', response.content.slice(0, 500));
			throw createError({
				statusCode: 502,
				message: 'AI returned an invalid response. Please try again.',
			});
		}

		// Log AI usage
		if (response.usage) {
			logAIUsage({
				event,
				endpoint: 'crm/ai-intelligence',
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
		console.error('[crm/ai-intelligence] LLM error:', error);
		throw createError({
			statusCode: 500,
			message: 'Failed to generate CRM analysis. Please try again.',
		});
	}
});

function getUserMessage(type: string, focus?: string): string {
	const focusSuffix = focus ? ` Focus area: ${focus}` : '';
	switch (type) {
		case 'overview':
			return `Analyze the CRM health across all modules and provide actionable insights for growth.${focusSuffix}`;
		case 'contact-strategy':
			return `Create a comprehensive contact and networking strategy with segmentation, re-engagement plans, and outreach cadence.${focusSuffix}`;
		case 'growth-plan':
			return `Design a growth plan with specific targets, strategies, and a weekly action plan.${focusSuffix}`;
		case 'pipeline-review':
			return `Review the sales pipeline, identify at-risk deals, and provide a revenue forecast.${focusSuffix}`;
		default:
			return `Analyze the CRM data and provide recommendations.${focusSuffix}`;
	}
}

function buildPrompt(type: string, context: any, focus?: string): string {
	const dataBlock = `CRM DATA SNAPSHOT:\n${JSON.stringify(context, null, 2)}`;

	const baseRules = `RULES:
- Return ONLY valid JSON, no markdown fences, no extra text
- Base your analysis on the actual data provided — don't make up numbers
- Reference specific data points (counts, dates, names) in your analysis
- Insights should be specific, actionable, and prioritized
- If data is sparse, note it as an opportunity rather than a weakness
- CardDesk data (cardDesk) represents the user's personal networking CRM — contacts they've met, scanned business cards, follow-up activities
- The contacts collection is the organization's shared contact database
- Clients are paying customers of the organization
- The brandContext section contains brand direction, goals, target audience, location, and services for the organization, individual clients, and teams — USE THIS to tailor suggestions to their specific brand positioning, market, and service offerings
- When brand data is available, incorporate it into your recommendations (e.g. suggest outreach strategies aligned with their target audience, growth ideas that match their stated goals, actions relevant to services they provide)`;

	switch (type) {
		case 'overview':
			return buildOverviewPrompt(dataBlock, baseRules, focus);
		case 'contact-strategy':
			return buildContactStrategyPrompt(dataBlock, baseRules, focus);
		case 'growth-plan':
			return buildGrowthPlanPrompt(dataBlock, baseRules, focus);
		case 'pipeline-review':
			return buildPipelineReviewPrompt(dataBlock, baseRules, focus);
		default:
			return buildOverviewPrompt(dataBlock, baseRules, focus);
	}
}

function buildOverviewPrompt(dataBlock: string, rules: string, focus?: string): string {
	return `You are an expert CRM strategist and business advisor analyzing a creative agency's full CRM ecosystem. You have access to their contacts, networking data (CardDesk), clients, projects, tasks, tickets, invoices, and deals pipeline — plus their brand direction, goals, target audience, and service offerings for the organization and each client. Use this brand context to make your suggestions uniquely relevant to their positioning and market.

${dataBlock}

${focus ? `FOCUS AREA: ${focus}\n` : ''}${rules}

Return this exact JSON structure:
{
  "healthScore": 0-100,
  "healthBreakdown": {
    "clientRelationships": 0-100,
    "pipelineHealth": 0-100,
    "followUpConsistency": 0-100,
    "revenueGrowth": 0-100,
    "networkingEffort": 0-100
  },
  "topActions": [
    {
      "title": "Action title",
      "description": "What to do and why (2-3 sentences)",
      "priority": "urgent" | "high" | "medium" | "low",
      "category": "followup" | "conversion" | "retention" | "outreach" | "operations",
      "link": "/contacts" | "/clients" | "/projects" | "/tickets" | "/invoices" | "/carddesk" | null,
      "impact": "Expected impact (1 sentence)"
    }
  ],
  "insights": [
    {
      "type": "strength" | "risk" | "trend" | "opportunity",
      "title": "Short title",
      "description": "2-3 sentence explanation",
      "dataPoint": "The specific number or fact this insight is based on",
      "channel": "contacts" | "clients" | "projects" | "tickets" | "invoices" | "deals" | "networking"
    }
  ],
  "growthOpportunities": [
    {
      "title": "Opportunity title",
      "description": "What the opportunity is and why it matters",
      "effort": "low" | "medium" | "high",
      "potentialImpact": "Expected result",
      "steps": ["Step 1", "Step 2", "Step 3"]
    }
  ]
}

Generate 5-8 top actions (ordered by priority), 4-6 insights, and 3-4 growth opportunities.`;
}

function buildContactStrategyPrompt(dataBlock: string, rules: string, focus?: string): string {
	return `You are an expert networking strategist and CRM advisor for a creative agency. Analyze the contact and networking data to create a comprehensive strategy for building relationships, re-engaging cold contacts, and converting prospects to clients. Use their brand context (target audience, services, location) to tailor outreach messaging and segment contacts by strategic fit.

${dataBlock}

${focus ? `FOCUS AREA: ${focus}\n` : ''}${rules}

Return this exact JSON structure:
{
  "segmentStrategies": [
    {
      "segment": "Segment name (e.g., Hot Leads, Warm Contacts, Cold Re-engagement, New Network)",
      "count": number of contacts in this segment,
      "strategy": "Overall approach for this segment (2-3 sentences)",
      "suggestedActions": ["Action 1", "Action 2", "Action 3"],
      "idealFrequency": "How often to engage (e.g., 'Every 2-3 days', 'Weekly')"
    }
  ],
  "reEngagementTargets": [
    {
      "reason": "Why these contacts should be re-engaged",
      "suggestedApproach": "How to approach them",
      "messageTemplate": "A ready-to-use message template"
    }
  ],
  "conversionReadyContacts": [
    {
      "reason": "Why certain contacts are ready to convert",
      "signals": ["Signal 1", "Signal 2"],
      "suggestedNextStep": "What to do next"
    }
  ],
  "outreachCadence": {
    "daily": ["Daily action 1", "Daily action 2"],
    "weekly": ["Weekly action 1", "Weekly action 2"],
    "monthly": ["Monthly action 1", "Monthly action 2"]
  },
  "networkingTips": ["Tip 1", "Tip 2", "Tip 3", "Tip 4", "Tip 5"]
}

Generate 3-5 segment strategies, 2-3 re-engagement targets, 2-3 conversion candidates, and 5 networking tips.`;
}

function buildGrowthPlanPrompt(dataBlock: string, rules: string, focus?: string): string {
	return `You are a business growth strategist analyzing a creative agency's CRM data to create an actionable growth plan. Use the actual data to set realistic targets and create a practical weekly plan. Pay special attention to their brand direction, goals, target audience, and services — align your growth strategies with their stated objectives and market positioning.

${dataBlock}

${focus ? `FOCUS AREA: ${focus}\n` : ''}${rules}

Return this exact JSON structure:
{
  "currentState": "2-3 sentence summary of where the business stands today based on the data",
  "targets": [
    {
      "metric": "Metric name",
      "current": "Current value from data",
      "target": "Realistic target",
      "timeframe": "30 days" | "60 days" | "90 days"
    }
  ],
  "strategies": [
    {
      "title": "Strategy name",
      "description": "What this strategy entails (2-3 sentences)",
      "tactics": ["Tactic 1", "Tactic 2", "Tactic 3"],
      "expectedOutcome": "What success looks like"
    }
  ],
  "weeklyPlan": [
    {
      "week": 1,
      "focus": "Week focus area",
      "actions": ["Action 1", "Action 2", "Action 3"]
    }
  ],
  "kpis": [
    {
      "metric": "KPI name",
      "target": "Target value",
      "tracking": "How to measure (which page/report to check)"
    }
  ]
}

Generate 4-6 targets, 3-4 strategies, a 4-week plan, and 4-5 KPIs.`;
}

function buildPipelineReviewPrompt(dataBlock: string, rules: string, focus?: string): string {
	return `You are a sales pipeline analyst reviewing a company's deals, contacts, and revenue data. Provide a clear picture of pipeline health, identify risks, and forecast revenue.

${dataBlock}

${focus ? `FOCUS AREA: ${focus}\n` : ''}${rules}

Return this exact JSON structure:
{
  "summary": "2-3 sentence executive summary of pipeline health",
  "stageAnalysis": [
    {
      "stage": "Stage name (e.g., New Leads, Qualified, Proposal, Negotiation, Closed)",
      "count": number of deals in this stage,
      "value": total value in this stage,
      "avgAge": "Average age of deals in this stage",
      "bottleneck": true/false,
      "suggestion": "What to do about this stage"
    }
  ],
  "atRiskDeals": [
    {
      "reason": "Why this deal is at risk",
      "suggestedAction": "What to do",
      "urgency": "critical" | "warning" | "watch"
    }
  ],
  "recommendations": [
    {
      "title": "Recommendation title",
      "description": "What to do and why (2-3 sentences)",
      "impact": "high" | "medium" | "low"
    }
  ],
  "forecast": {
    "nextMonth": "Revenue estimate for next month with rationale",
    "nextQuarter": "Revenue estimate for next quarter with rationale",
    "confidence": "high" | "medium" | "low",
    "assumptions": ["Assumption 1", "Assumption 2"]
  }
}

Generate 3-5 stage analyses, 2-4 at-risk deals, 3-5 recommendations, and a realistic forecast.`;
}
