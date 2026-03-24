// types/marketing.ts
/**
 * Marketing Intelligence Engine types.
 *
 * Used by the AI marketing analysis endpoint and dashboard components.
 */

// ─── Data Aggregation ───

export interface MarketingContext {
	contacts: ContactsSummary;
	social: SocialSummary;
	email: EmailSummary;
	clients: ClientsSummary;
	revenue: RevenueSummary;
	projects: ProjectsSummary;
	tickets: TicketsSummary;
}

export interface ContactsSummary {
	total: number;
	subscribedCount: number;
	recentGrowth: number; // new contacts in last 30 days
	topTags: string[];
}

export interface SocialSummary {
	connectedPlatforms: string[];
	recentPosts: { platform: string; caption: string; status: string; date: string }[];
	postsLast30Days: number;
	accountFollowers: Record<string, number>;
}

export interface EmailSummary {
	totalCampaigns: number;
	recentCampaigns: { name: string; subject: string; sentAt: string; totalRecipients: number }[];
	mailingListCount: number;
	totalSubscribers: number;
}

export interface ClientsSummary {
	total: number;
	byStatus: Record<string, number>;
	byIndustry: Record<string, number>;
}

export interface RevenueSummary {
	monthlyTrend: { month: string; total: number }[];
	topServices: string[];
}

export interface ProjectsSummary {
	activeCount: number;
	upcomingDueDates: { title: string; dueDate: string }[];
}

export interface TicketsSummary {
	totalLast30Days: number;
	byStatus: Record<string, number>;
}

// ─── AI Analysis Request / Response ───

export type MarketingAnalysisType = 'dashboard' | 'campaign';

export interface MarketingAnalyzeRequest {
	analysisType: MarketingAnalysisType;
	organizationId: string;
	clientId?: string;
	goal?: string;
	timeframe?: string;
}

// ─── Dashboard Analysis ───

export interface MarketingHealthBreakdown {
	contentConsistency: number;
	audienceGrowth: number;
	engagement: number;
	emailPerformance: number;
}

export interface MarketingInsight {
	type: 'strength' | 'weakness' | 'opportunity' | 'action';
	title: string;
	description: string;
	priority: 'high' | 'medium' | 'low';
	actionable: boolean;
	channel?: string;
	link?: string;
}

export interface MarketingRecommendation {
	title: string;
	description: string;
	channel: string;
	effort: 'low' | 'medium' | 'high';
	impact: 'low' | 'medium' | 'high';
}

export interface ContentVelocity {
	postsPerWeek: number;
	emailsPerMonth: number;
	trend: 'up' | 'down' | 'stable';
}

export interface AudienceGrowth {
	followers: number;
	subscribers: number;
	contacts: number;
	trend: 'up' | 'down' | 'stable';
}

export interface DashboardAnalysis {
	healthScore: number;
	healthBreakdown: MarketingHealthBreakdown;
	insights: MarketingInsight[];
	contentVelocity: ContentVelocity;
	audienceGrowth: AudienceGrowth;
	recommendations: MarketingRecommendation[];
}

// ─── Campaign Analysis ───

export interface CampaignActivity {
	channel: string;
	action: string;
	details: string;
}

export interface CampaignWeek {
	week: number;
	activities: CampaignActivity[];
}

export interface CampaignEmail {
	day: number;
	subject: string;
	keyMessage: string;
	cta: string;
	segment: string;
}

export interface CampaignSocialPost {
	platform: string;
	content: string;
	hashtags: string[];
	timing: string;
}

export interface CampaignKPI {
	metric: string;
	target: string;
	rationale: string;
}

export interface CampaignAnalysis {
	campaignName: string;
	objective: string;
	timeline: CampaignWeek[];
	emailSequence: CampaignEmail[];
	socialPosts: CampaignSocialPost[];
	kpis: CampaignKPI[];
}
