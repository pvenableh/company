// types/crm-intelligence.ts
/**
 * CRM Intelligence Engine types.
 *
 * Used by the AI CRM analysis endpoint and composable to generate
 * smart suggestions, actions, and growth ideas across all business data.
 */

// ─── Data Aggregation Context ───

export interface CRMContext {
	contacts: CRMContactsSummary;
	cardDesk: CRMCardDeskSummary;
	clients: CRMClientsSummary;
	projects: CRMProjectsSummary;
	tickets: CRMTicketsSummary;
	invoices: CRMInvoicesSummary;
	deals: CRMDealsSummary;
	activities: CRMActivitiesSummary;
	brandContext: CRMBrandContext;
}

export interface CRMBrandContext {
	organization: {
		brandDirection: string | null;
		goals: string | null;
		targetAudience: string | null;
		location: string | null;
	};
	clients: {
		name: string;
		brandDirection: string | null;
		goals: string | null;
		targetAudience: string | null;
		location: string | null;
		services: string[];
	}[];
	teams: {
		name: string;
		focus: string | null;
		goals: string | null;
	}[];
}

export interface CRMContactsSummary {
	total: number;
	subscribedCount: number;
	recentGrowth: number;
	topTags: string[];
	byIndustry: Record<string, number>;
	withEmail: number;
	withPhone: number;
}

export interface CRMCardDeskSummary {
	total: number;
	byRating: Record<string, number>;
	convertedClients: number;
	hibernated: number;
	needsFollowUp: {
		name: string;
		company: string | null;
		rating: string | null;
		daysSinceContact: number;
	}[];
	recentActivities: {
		type: string;
		contactName: string | null;
		date: string;
		isResponse: boolean;
	}[];
	avgActivitiesPerContact: number;
	conversionRate: number;
	xp: { level: number; streak: number; totalClients: number };
}

export interface CRMClientsSummary {
	total: number;
	byStatus: Record<string, number>;
	recentClients: { name: string; status: string; createdAt: string }[];
	withActiveProjects: number;
	withOpenTickets: number;
}

export interface CRMProjectsSummary {
	total: number;
	byStatus: Record<string, number>;
	overdue: { title: string; dueDate: string; client: string | null }[];
	dueSoon: { title: string; dueDate: string; client: string | null }[];
	avgCompletionDays: number | null;
	tasksTotal: number;
	tasksCompleted: number;
	tasksPending: number;
}

export interface CRMTicketsSummary {
	totalLast30Days: number;
	byStatus: Record<string, number>;
	byPriority: Record<string, number>;
	avgResolutionDays: number | null;
	overdue: { title: string; dueDate: string; client: string | null; priority: string }[];
	unassigned: number;
}

export interface CRMInvoicesSummary {
	totalRevenue6Months: number;
	monthlyTrend: { month: string; total: number }[];
	outstanding: { code: string; amount: number; dueDate: string; client: string | null; daysOverdue: number }[];
	totalOutstanding: number;
	avgInvoiceValue: number;
	topClients: { name: string; revenue: number }[];
}

export interface CRMDealsSummary {
	open: number;
	pipelineValue: number;
	overdueFollowUps: { id: string; source: string | null; value: number; daysOverdue: number }[];
	bySource: Record<string, number>;
	avgDealValue: number;
	conversionRate: number | null;
}

export interface CRMActivitiesSummary {
	totalLast30Days: number;
	byType: Record<string, number>;
	responseRate: number;
	avgActivitiesPerWeek: number;
}

// ─── AI Analysis Request / Response ───

export type CRMAnalysisType = 'overview' | 'contact-strategy' | 'growth-plan' | 'pipeline-review';

export interface CRMIntelligenceRequest {
	analysisType: CRMAnalysisType;
	organizationId: string;
	/** Optional focus area or question */
	focus?: string;
	/** Specific contact/client ID to analyze */
	targetId?: string;
}

// ─── Overview Analysis ───

export interface CRMOverviewAnalysis {
	healthScore: number;
	healthBreakdown: {
		clientRelationships: number;
		pipelineHealth: number;
		followUpConsistency: number;
		revenueGrowth: number;
		networkingEffort: number;
	};
	topActions: CRMAction[];
	insights: CRMInsight[];
	growthOpportunities: CRMGrowthOpportunity[];
}

export interface CRMAction {
	title: string;
	description: string;
	priority: 'urgent' | 'high' | 'medium' | 'low';
	category: 'followup' | 'conversion' | 'retention' | 'outreach' | 'operations';
	link?: string;
	impact: string;
}

export interface CRMInsight {
	type: 'strength' | 'risk' | 'trend' | 'opportunity';
	title: string;
	description: string;
	dataPoint: string;
	channel: 'contacts' | 'clients' | 'projects' | 'tickets' | 'invoices' | 'deals' | 'networking';
}

export interface CRMGrowthOpportunity {
	title: string;
	description: string;
	effort: 'low' | 'medium' | 'high';
	potentialImpact: string;
	steps: string[];
}

// ─── Contact Strategy Analysis ───

export interface CRMContactStrategyAnalysis {
	segmentStrategies: CRMSegmentStrategy[];
	reEngagementTargets: CRMReEngagementTarget[];
	conversionReadyContacts: CRMConversionCandidate[];
	outreachCadence: CRMOutreachCadence;
	networkingTips: string[];
}

export interface CRMSegmentStrategy {
	segment: string;
	count: number;
	strategy: string;
	suggestedActions: string[];
	idealFrequency: string;
}

export interface CRMReEngagementTarget {
	reason: string;
	suggestedApproach: string;
	messageTemplate: string;
}

export interface CRMConversionCandidate {
	reason: string;
	signals: string[];
	suggestedNextStep: string;
}

export interface CRMOutreachCadence {
	daily: string[];
	weekly: string[];
	monthly: string[];
}

// ─── Growth Plan Analysis ───

export interface CRMGrowthPlanAnalysis {
	currentState: string;
	targets: CRMGrowthTarget[];
	strategies: CRMGrowthStrategy[];
	weeklyPlan: CRMWeeklyPlan[];
	kpis: CRMKPI[];
}

export interface CRMGrowthTarget {
	metric: string;
	current: string;
	target: string;
	timeframe: string;
}

export interface CRMGrowthStrategy {
	title: string;
	description: string;
	tactics: string[];
	expectedOutcome: string;
}

export interface CRMWeeklyPlan {
	week: number;
	focus: string;
	actions: string[];
}

export interface CRMKPI {
	metric: string;
	target: string;
	tracking: string;
}

// ─── Pipeline Review Analysis ───

export interface CRMPipelineReviewAnalysis {
	summary: string;
	stageAnalysis: CRMStageAnalysis[];
	atRiskDeals: CRMAtRiskDeal[];
	recommendations: CRMPipelineRecommendation[];
	forecast: CRMForecast;
}

export interface CRMStageAnalysis {
	stage: string;
	count: number;
	value: number;
	avgAge: string;
	bottleneck: boolean;
	suggestion: string;
}

export interface CRMAtRiskDeal {
	reason: string;
	suggestedAction: string;
	urgency: 'critical' | 'warning' | 'watch';
}

export interface CRMPipelineRecommendation {
	title: string;
	description: string;
	impact: 'high' | 'medium' | 'low';
}

export interface CRMForecast {
	nextMonth: string;
	nextQuarter: string;
	confidence: 'high' | 'medium' | 'low';
	assumptions: string[];
}
