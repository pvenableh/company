// composables/useEarnestScore.ts
// Earnest Score gamification system — measures sincerity and conviction
// through follow-through, consistency, responsiveness, proactivity, and depth.

export interface DimensionScores {
	followThrough: number;
	consistency: number;
	responsiveness: number;
	proactivity: number;
	depth: number;
	crm: number;
}

export interface EarnestBadge {
	id: string;
	name: string;
	icon: string;
	description: string;
	check: (state: EarnestScoreRecord) => boolean;
}

export interface EarnestScoreRecord {
	id?: string;
	total_ep: number;
	level: number;
	current_score: number;
	streak: number;
	best_streak: number;
	last_activity_date: string | null;
	days_active_this_week: number;
	total_tasks_completed: number;
	projects_fully_completed: number;
	advance_schedule_count: number;
	consecutive_high_completion_days: number;
	consecutive_responsive_days: number;
	consecutive_top_rank_days: number;
	// CRM tracking
	total_leads_won: number;
	total_leads_pipeline: number;
	consecutive_no_overdue_followup_days: number;
	fastest_lead_close_days: number;
	badges_unlocked: string[];
	dimension_scores: DimensionScores | null;
	organization?: string | null;
}

export interface EarnestState {
	// Core
	totalEP: number;
	level: number;
	levelTitle: string;
	nextLevelEP: number;
	levelProgress: number;
	currentScore: number;
	streak: number;
	bestStreak: number;

	// Dimensions
	dimensions: DimensionScores;

	// Badges
	badges: {
		id: string;
		name: string;
		icon: string;
		description: string;
		unlocked: boolean;
	}[];

	// Team ranking (hybrid)
	teamRank: number | null;
	teamSize: number | null;

	// Trend (last 30 days)
	history: { date: string; score: number; ep: number }[];
}

export interface TeamMemberScore {
	userId: string;
	firstName: string;
	lastName: string;
	avatar: string | null;
	totalEP: number;
	level: number;
	levelTitle: string;
	currentScore: number;
	streak: number;
	dimensions: DimensionScores | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const LEVEL_TITLES: Record<number, string> = {
	1: 'Spark',
	2: 'Steady',
	3: 'Intentional',
	4: 'Devoted',
	5: 'Resolute',
	6: 'Principled',
	7: 'Unwavering',
	8: 'Stalwart',
	9: 'Cornerstone',
};

const LEVEL_THRESHOLDS = [0, 200, 500, 1000, 2500, 5000, 10000, 25000, 50000];

const SCORE_TIERS = [
	{ min: 80, label: 'Exemplary', color: 'text-green-500', bg: 'bg-green-500' },
	{ min: 60, label: 'Strong', color: 'text-blue-500', bg: 'bg-blue-500' },
	{ min: 40, label: 'Growing', color: 'text-amber-500', bg: 'bg-amber-500' },
	{ min: 0, label: 'Kindling', color: 'text-red-500', bg: 'bg-red-500' },
];

const BADGES: EarnestBadge[] = [
	{
		id: 'first-flame',
		name: 'First Flame',
		icon: 'i-heroicons-fire',
		description: 'The spark that starts the fire',
		check: (s) => s.total_tasks_completed >= 1,
	},
	{
		id: 'keeper-of-promises',
		name: 'Keeper of Promises',
		icon: 'i-heroicons-check-badge',
		description: 'You finish what you start',
		check: (s) => s.consecutive_high_completion_days >= 7,
	},
	{
		id: 'seven-day-resolve',
		name: 'Seven-Day Resolve',
		icon: 'i-heroicons-calendar-days',
		description: 'A week of unwavering presence',
		check: (s) => s.best_streak >= 7,
	},
	{
		id: 'thirty-day-pillar',
		name: 'Thirty-Day Pillar',
		icon: 'i-heroicons-shield-check',
		description: 'A month without faltering',
		check: (s) => s.best_streak >= 30,
	},
	{
		id: 'rapid-responder',
		name: 'Rapid Responder',
		icon: 'i-heroicons-bolt',
		description: 'Your team can count on you',
		check: (s) => s.consecutive_responsive_days >= 5,
	},
	{
		id: 'deep-current',
		name: 'Deep Current',
		icon: 'i-heroicons-academic-cap',
		description: 'Depth over breadth',
		check: (s) => s.projects_fully_completed >= 3,
	},
	{
		id: 'the-preparator',
		name: 'The Preparator',
		icon: 'i-heroicons-clock',
		description: 'You plan ahead, not scramble',
		check: (s) => s.advance_schedule_count >= 5,
	},
	{
		id: 'team-anchor',
		name: 'Team Anchor',
		icon: 'i-heroicons-users',
		description: 'A steady force your team relies on',
		check: (s) => s.consecutive_top_rank_days >= 14,
	},
	// CRM badges
	{
		id: 'first-close',
		name: 'First Close',
		icon: 'i-heroicons-trophy',
		description: 'Closed your first deal',
		check: (s) => s.total_leads_won >= 1,
	},
	{
		id: 'pipeline-builder',
		name: 'Pipeline Builder',
		icon: 'i-heroicons-chart-bar',
		description: 'Built a pipeline of 10+ leads',
		check: (s) => s.total_leads_pipeline >= 10,
	},
	{
		id: 'follow-up-master',
		name: 'Follow-up Master',
		icon: 'i-heroicons-bell-alert',
		description: 'No overdue follow-ups for 14 days',
		check: (s) => s.consecutive_no_overdue_followup_days >= 14,
	},
	{
		id: 'quick-closer',
		name: 'Quick Closer',
		icon: 'i-heroicons-rocket-launch',
		description: 'Won a lead in under 7 days',
		check: (s) => s.fastest_lead_close_days > 0 && s.fastest_lead_close_days <= 7,
	},
	// Extended streak badges
	{
		id: 'iron-will',
		name: 'Iron Will',
		icon: 'i-heroicons-hand-raised',
		description: 'Sixty days of relentless commitment',
		check: (s) => s.best_streak >= 60,
	},
	{
		id: 'century',
		name: 'Century',
		icon: 'i-heroicons-star',
		description: 'One hundred days without breaking stride',
		check: (s) => s.best_streak >= 100,
	},
];

// ─── Score Calculation ───────────────────────────────────────────────────────

interface EarnestInputData {
	// Follow-Through
	completed: number;
	totalStarted: number;
	overdueItems: number;
	// Consistency
	streak: number;
	daysActiveThisWeek: number;
	// Responsiveness
	unreadMessages: number;
	timelyFollowups: number;
	totalFollowups: number;
	// Proactivity
	scheduledPosts: number;
	earlyCompletions: number;
	activeProjects: number;
	projectsWithDeadlines: number;
	// Depth
	projectTasksThisWeek: number;
	tasksCompletedToday: number;
	hasMeetingsToday: boolean;
	// CRM
	leadsWon: number;
	leadsInPipeline: number;
	overdueFollowUps: number;
	totalLeadsClosed: number;
}

function calculateEarnestScore(data: EarnestInputData): { score: number; dimensions: DimensionScores } {
	// Follow-Through (25 max)
	const completionRate = data.totalStarted > 0 ? (data.completed / data.totalStarted) * 16 : 8;
	const overduePenalty = Math.min(data.overdueItems * 2, 8);
	const followThrough = Math.max(0, Math.min(25, completionRate - overduePenalty + 9));

	// Consistency (20 max)
	const streakPoints = Math.min(data.streak * 1.5, 12);
	const weekBreadth = (Math.min(data.daysActiveThisWeek, 5) / 5) * 8;
	const consistency = Math.min(20, streakPoints + weekBreadth);

	// Responsiveness (15 max)
	const messageResponse = data.unreadMessages < 5 ? 8 : Math.max(0, 8 - (data.unreadMessages - 5));
	const followUpTimeliness = data.totalFollowups > 0 ? (data.timelyFollowups / data.totalFollowups) * 7 : 4;
	const responsiveness = Math.min(15, messageResponse + followUpTimeliness);

	// Proactivity (10 max)
	const scheduling = data.scheduledPosts > 0 ? 4 : 0;
	const earlyCompletions = Math.min(data.earlyCompletions * 2, 3);
	const projectPlanning = data.activeProjects > 0 ? (data.projectsWithDeadlines / data.activeProjects) * 3 : 3;
	const proactivity = Math.min(10, scheduling + earlyCompletions + projectPlanning);

	// Depth (10 max)
	const milestones = Math.min(data.projectTasksThisWeek, 5);
	const deepWork = !data.hasMeetingsToday && data.tasksCompletedToday >= 2 ? 5 : data.tasksCompletedToday >= 1 ? 3 : 0;
	const depth = Math.min(10, milestones + deepWork);

	// CRM (20 max)
	const pipelineActivity = Math.min(data.leadsInPipeline * 2, 8);
	const followUpAdherence = data.overdueFollowUps === 0 ? 6 : Math.max(0, 6 - data.overdueFollowUps * 2);
	const conversionRate = data.totalLeadsClosed > 0 ? (data.leadsWon / data.totalLeadsClosed) * 6 : 3;
	const crm = Math.min(20, pipelineActivity + followUpAdherence + conversionRate);

	const score = Math.round(followThrough + consistency + responsiveness + proactivity + depth + crm);

	return {
		score: Math.max(0, Math.min(100, score)),
		dimensions: {
			followThrough: Math.round(followThrough),
			consistency: Math.round(consistency),
			responsiveness: Math.round(responsiveness),
			proactivity: Math.round(proactivity),
			depth: Math.round(depth),
			crm: Math.round(crm),
		},
	};
}

function calculateDailyEP(dailyScore: number, streak: number): number {
	const baseEP = Math.round(dailyScore / 5);
	const streakMultiplier = 1 + Math.min(streak * 0.05, 0.5);
	return Math.round(baseEP * streakMultiplier);
}

function calculateLevel(totalEP: number): number {
	for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
		if (totalEP >= LEVEL_THRESHOLDS[i]) return i + 1;
	}
	return 1;
}

// ─── Composable ──────────────────────────────────────────────────────────────

export const useEarnestScore = () => {
	const earnestItems = useDirectusItems('earnest_scores');
	const historyItems = useDirectusItems('earnest_history');
	const { user } = useDirectusAuth();
	const { selectedOrg } = useOrganization();
	const { selectedTeam, organizationUsers, hasAdminAccess } = useTeams();

	const toast = useToast();

	const state = ref<EarnestState>({
		totalEP: 0,
		level: 1,
		levelTitle: 'Spark',
		nextLevelEP: 200,
		levelProgress: 0,
		currentScore: 0,
		streak: 0,
		bestStreak: 0,
		dimensions: { followThrough: 0, consistency: 0, responsiveness: 0, proactivity: 0, depth: 0, crm: 0 },
		badges: BADGES.map((b) => ({ id: b.id, name: b.name, icon: b.icon, description: b.description, unlocked: false })),
		teamRank: null,
		teamSize: null,
		history: [],
	});

	const isLoading = ref(false);
	const error = ref<string | null>(null);
	const teamScores = ref<TeamMemberScore[]>([]);
	const newBadges = ref<string[]>([]);
	const leveledUp = ref(false);

	// ── Level helpers ──

	const getLevelTitle = (level: number) => LEVEL_TITLES[level] || 'Unknown';

	const getNextLevelEP = (level: number) => {
		const idx = Math.min(level, LEVEL_THRESHOLDS.length - 1);
		return LEVEL_THRESHOLDS[idx] || 50000;
	};

	const getLevelProgress = (ep: number, level: number) => {
		const currentThreshold = LEVEL_THRESHOLDS[level - 1] || 0;
		const nextThreshold = getNextLevelEP(level);
		const range = nextThreshold - currentThreshold;
		if (range <= 0) return 100;
		return Math.min(100, Math.round(((ep - currentThreshold) / range) * 100));
	};

	const getScoreTier = (score: number) => {
		return SCORE_TIERS.find((t) => score >= t.min) || SCORE_TIERS[SCORE_TIERS.length - 1];
	};

	// ── Fetch user's existing state ──

	const fetchState = async () => {
		const userId = user.value?.id;
		if (!userId) return;

		isLoading.value = true;
		error.value = null;

		try {
			const filter: any = { user_created: { _eq: userId } };
			if (selectedOrg.value) filter.organization = { _eq: selectedOrg.value };

			const records = await earnestItems.list({
				fields: ['id', 'total_ep', 'level', 'current_score', 'streak', 'best_streak', 'dimension_scores', 'badges_unlocked'],
				filter,
				limit: 1,
			});

			if (records && records.length > 0) {
				const r = records[0] as any;
				const level = r.level || 1;
				const totalEP = r.total_ep || 0;
				const badges = r.badges_unlocked || [];

				state.value = {
					totalEP,
					level,
					levelTitle: getLevelTitle(level),
					nextLevelEP: getNextLevelEP(level),
					levelProgress: getLevelProgress(totalEP, level),
					currentScore: r.current_score || 0,
					streak: r.streak || 0,
					bestStreak: r.best_streak || 0,
					dimensions: r.dimension_scores || { followThrough: 0, consistency: 0, responsiveness: 0, proactivity: 0, depth: 0, crm: 0 },
					badges: BADGES.map((b) => ({
						id: b.id,
						name: b.name,
						icon: b.icon,
						description: b.description,
						unlocked: badges.includes(b.id),
					})),
					teamRank: state.value.teamRank,
					teamSize: state.value.teamSize,
					history: state.value.history,
				};
			}
		} catch (e: any) {
			console.warn('[Earnest] Could not fetch state:', e);
			error.value = e.message;
		} finally {
			isLoading.value = false;
		}
	};

	// ── Sync state (calculate + persist) ──

	const syncState = async (productivityMetrics?: any) => {
		const userId = user.value?.id;
		if (!userId) return;

		try {
			const m = productivityMetrics || {};

			// Build input data from productivity metrics
			const inputData: EarnestInputData = {
				completed: (m.tasksCompletedToday || 0) + (m.tasksCompletedThisWeek || 0),
				totalStarted: (m.tasksCompletedToday || 0) + (m.tasksCompletedThisWeek || 0) + (m.overdueItems || 0) + (m.pendingTasks || 0),
				overdueItems: m.overdueItems || 0,
				streak: state.value.streak,
				daysActiveThisWeek: state.value.dimensions.consistency > 0 ? Math.min(state.value.streak, 5) : 1,
				unreadMessages: m.unreadChannelMessages || m.unreadMessages || 0,
				timelyFollowups: Math.max(0, (m.openDeals || 0) - (m.overdueItems || 0)),
				totalFollowups: m.openDeals || 1,
				scheduledPosts: m.scheduledSocialPosts || 0,
				earlyCompletions: Math.max(0, (m.tasksCompletedToday || 0) - (m.overdueItems || 0)),
				activeProjects: m.activeProjects || 0,
				projectsWithDeadlines: Math.max(0, (m.activeProjects || 0) - (m.overdueProjects || 0)),
				projectTasksThisWeek: m.tasksCompletedThisWeek || 0,
				tasksCompletedToday: m.tasksCompletedToday || 0,
				hasMeetingsToday: (m.upcomingMeetings || 0) > 2,
				// CRM metrics
				leadsWon: m.leadsWon || 0,
				leadsInPipeline: m.leadsInPipeline || 0,
				overdueFollowUps: m.overdueFollowUps || 0,
				totalLeadsClosed: m.totalLeadsClosed || 0,
			};

			// Calculate score
			const { score, dimensions } = calculateEarnestScore(inputData);

			// Update streak
			const todayStr = new Date().toISOString().split('T')[0];
			const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
			let newStreak = state.value.streak;

			if (state.value.dimensions.followThrough === 0 && state.value.totalEP === 0) {
				// First sync ever
				newStreak = 1;
			} else if (state.value.streak === 0) {
				// Reset streak
				newStreak = 1;
			} else {
				const lastDate = state.value.bestStreak > 0 ? (state.value as any)._lastActivityDate : null;
				// If not already counted today, increment
				if (inputData.completed > 0 || inputData.scheduledPosts > 0) {
					newStreak = state.value.streak + 1;
				}
			}

			const bestStreak = Math.max(state.value.bestStreak, newStreak);

			// Calculate EP
			const epEarned = calculateDailyEP(score, newStreak);
			const newTotalEP = state.value.totalEP + epEarned;
			const oldLevel = state.value.level;
			const newLevel = calculateLevel(newTotalEP);

			// Check for level up
			leveledUp.value = newLevel > oldLevel;

			// Build record for Directus
			const record: EarnestScoreRecord = {
				total_ep: newTotalEP,
				level: newLevel,
				current_score: score,
				streak: newStreak,
				best_streak: bestStreak,
				last_activity_date: todayStr,
				days_active_this_week: Math.min(newStreak, 5),
				total_tasks_completed: state.value.badges.find((b) => b.id === 'first-flame')?.unlocked
					? state.value.totalEP > 0
						? (m.tasksCompletedToday || 0) + (m.tasksCompletedThisWeek || 0)
						: 1
					: (m.tasksCompletedToday || 0) + (m.tasksCompletedThisWeek || 0),
				projects_fully_completed: state.value.badges.find((b) => b.id === 'deep-current')?.unlocked
					? state.value.totalEP > 0
						? 3
						: 0
					: 0,
				advance_schedule_count: (m.scheduledSocialPosts || 0) > 0 ? state.value.badges.find((b) => b.id === 'the-preparator')?.unlocked ? 5 : Math.min((state.value as any)._advanceCount || 0 + 1, 5) : 0,
				consecutive_high_completion_days: score >= 80 ? (state.value as any)._highCompletionDays || 0 + 1 : 0,
				consecutive_responsive_days: (m.unreadChannelMessages || 0) < 5 ? (state.value as any)._responsiveDays || 0 + 1 : 0,
				consecutive_top_rank_days: state.value.teamRank !== null && state.value.teamRank <= 3 ? (state.value as any)._topRankDays || 0 + 1 : 0,
				// CRM tracking
				total_leads_won: m.leadsWon || 0,
				total_leads_pipeline: m.leadsInPipeline || 0,
				consecutive_no_overdue_followup_days: (m.overdueFollowUps || 0) === 0
					? ((state.value as any)._noOverdueFollowupDays || 0) + 1
					: 0,
				fastest_lead_close_days: m.fastestLeadCloseDays || (state.value as any)._fastestLeadCloseDays || 0,
				badges_unlocked: [...(state.value.badges.filter((b) => b.unlocked).map((b) => b.id))],
				dimension_scores: dimensions,
			};

			// Check badge unlocks
			newBadges.value = [];
			for (const badge of BADGES) {
				if (!record.badges_unlocked.includes(badge.id) && badge.check(record)) {
					record.badges_unlocked.push(badge.id);
					record.total_ep += 75; // Badge bonus
					newBadges.value.push(badge.id);
				}
			}

			// Recalculate level after badge bonuses
			record.level = calculateLevel(record.total_ep);

			// Upsert to Directus
			const filter: any = { user_created: { _eq: userId } };
			if (selectedOrg.value) filter.organization = { _eq: selectedOrg.value };

			const existing = await earnestItems.list({
				fields: ['id'],
				filter,
				limit: 1,
			}).catch(() => []);

			if (existing && existing.length > 0) {
				await earnestItems.update((existing[0] as any).id, record as any).catch((e: any) => console.warn('[Earnest] Update failed:', e));
			} else {
				const createPayload: any = { ...record };
				if (selectedOrg.value) createPayload.organization = selectedOrg.value;
				await earnestItems.create(createPayload).catch((e: any) => console.warn('[Earnest] Create failed:', e));
			}

			// Save daily history snapshot
			const historyFilter: any = {
				user_created: { _eq: userId },
				date: { _eq: todayStr },
			};
			if (selectedOrg.value) historyFilter.organization = { _eq: selectedOrg.value };

			const existingHistory = await historyItems.list({
				fields: ['id'],
				filter: historyFilter,
				limit: 1,
			}).catch(() => []);

			const historyRecord: any = {
				date: todayStr,
				score,
				ep_earned: epEarned,
				streak: newStreak,
				dimensions,
			};
			if (selectedOrg.value) historyRecord.organization = selectedOrg.value;

			if (existingHistory && existingHistory.length > 0) {
				await historyItems.update((existingHistory[0] as any).id, historyRecord).catch(() => {});
			} else {
				await historyItems.create(historyRecord).catch(() => {});
			}

			// Update local state
			state.value = {
				totalEP: record.total_ep,
				level: record.level,
				levelTitle: getLevelTitle(record.level),
				nextLevelEP: getNextLevelEP(record.level),
				levelProgress: getLevelProgress(record.total_ep, record.level),
				currentScore: score,
				streak: newStreak,
				bestStreak: bestStreak,
				dimensions,
				badges: BADGES.map((b) => ({
					id: b.id,
					name: b.name,
					icon: b.icon,
					description: b.description,
					unlocked: record.badges_unlocked.includes(b.id),
				})),
				teamRank: state.value.teamRank,
				teamSize: state.value.teamSize,
				history: state.value.history,
			};

			// ── Toast notifications ──
			if (epEarned > 0) {
				toast.add({ title: `+${epEarned} EP`, description: 'Daily score synced', color: 'primary', icon: 'i-heroicons-sparkles' });
			}
			for (const badgeId of newBadges.value) {
				const badge = BADGES.find((b) => b.id === badgeId);
				if (badge) {
					toast.add({ title: `Badge Unlocked: ${badge.name}`, description: badge.description, color: 'success', icon: badge.icon });
				}
			}
			if (leveledUp.value) {
				toast.add({ title: `Level Up!`, description: `You're now ${getLevelTitle(record.level)}`, color: 'primary', icon: 'i-heroicons-arrow-trending-up' });
			}
		} catch (e: any) {
			console.warn('[Earnest] Sync failed:', e);
		}
	};

	// ── Team ranking ──

	const fetchTeamRanking = async () => {
		const userId = user.value?.id;
		if (!userId || !selectedOrg.value) return;

		try {
			const filter: any = { organization: { _eq: selectedOrg.value } };

			const allScores = await earnestItems.list({
				fields: ['user_created', 'total_ep', 'level', 'current_score', 'streak', 'dimension_scores'],
				filter,
				sort: ['-total_ep'],
				limit: -1,
			}).catch(() => []);

			if (!allScores || allScores.length === 0) {
				state.value.teamRank = null;
				state.value.teamSize = null;
				return;
			}

			// Deduplicate by user: keep highest EP per user for accurate ranking
			const userBest = new Map<string, { userId: string; totalEP: number }>();
			for (const s of allScores as any[]) {
				const sUserId = typeof s.user_created === 'object' ? s.user_created?.id : s.user_created;
				if (!sUserId) continue;
				const existing = userBest.get(sUserId);
				if (!existing || (s.total_ep || 0) > existing.totalEP) {
					userBest.set(sUserId, { userId: sUserId, totalEP: s.total_ep || 0 });
				}
			}
			const ranked = Array.from(userBest.values()).sort((a, b) => b.totalEP - a.totalEP);

			const myIndex = ranked.findIndex((r) => r.userId === userId);

			state.value.teamRank = myIndex >= 0 ? myIndex + 1 : null;
			state.value.teamSize = ranked.length;
		} catch (e: any) {
			console.warn('[Earnest] Ranking fetch failed:', e);
		}
	};

	// ── Admin: full team scores ──

	const fetchAllMemberScores = async (): Promise<TeamMemberScore[]> => {
		if (!hasAdminAccess(user.value) || !selectedOrg.value) return [];

		try {
			const allScores = await earnestItems.list({
				fields: ['user_created.id', 'user_created.first_name', 'user_created.last_name', 'user_created.avatar', 'total_ep', 'level', 'current_score', 'streak', 'dimension_scores'],
				filter: { organization: { _eq: selectedOrg.value } },
				sort: ['-total_ep'],
				limit: -1,
			}).catch(() => []);

			// Map scores and deduplicate by userId (keep highest EP entry per user)
			const mapped: TeamMemberScore[] = (allScores || []).map((s: any) => {
				const u = s.user_created || {};
				return {
					userId: u.id || '',
					firstName: u.first_name || '',
					lastName: u.last_name || '',
					avatar: u.avatar || null,
					totalEP: s.total_ep || 0,
					level: s.level || 1,
					levelTitle: getLevelTitle(s.level || 1),
					currentScore: s.current_score || 0,
					streak: s.streak || 0,
					dimensions: s.dimension_scores || null,
				};
			});

			// Deduplicate: keep only the highest-EP record per user
			const seen = new Map<string, TeamMemberScore>();
			for (const m of mapped) {
				if (!m.userId) continue;
				const existing = seen.get(m.userId);
				if (!existing || m.totalEP > existing.totalEP) {
					seen.set(m.userId, m);
				}
			}
			const results = Array.from(seen.values()).sort((a, b) => b.totalEP - a.totalEP);

			teamScores.value = results;
			return results;
		} catch (e: any) {
			console.warn('[Earnest] Admin scores fetch failed:', e);
			return [];
		}
	};

	// ── Period-based ranking (for leaderboard filter) ──

	const periodScores = ref<TeamMemberScore[]>([]);

	const fetchPeriodRanking = async (period: 'all' | 'month' | 'week' = 'all'): Promise<TeamMemberScore[]> => {
		if (!selectedOrg.value) return [];

		if (period === 'all') {
			return fetchAllMemberScores();
		}

		try {
			const now = new Date();
			let startDate: string;
			if (period === 'week') {
				startDate = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
			} else {
				startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
			}

			const historyRecords = await historyItems.list({
				fields: ['user_created.id', 'user_created.first_name', 'user_created.last_name', 'user_created.avatar', 'ep_earned'],
				filter: {
					organization: { _eq: selectedOrg.value },
					date: { _gte: startDate },
				},
				limit: -1,
			}).catch(() => []);

			// Aggregate EP per user
			const userMap = new Map<string, TeamMemberScore>();
			for (const r of (historyRecords || []) as any[]) {
				const u = r.user_created || {};
				const uid = u.id || (typeof r.user_created === 'string' ? r.user_created : '');
				if (!uid) continue;
				const existing = userMap.get(uid);
				if (existing) {
					existing.totalEP += r.ep_earned || 0;
				} else {
					userMap.set(uid, {
						userId: uid,
						firstName: u.first_name || '',
						lastName: u.last_name || '',
						avatar: u.avatar || null,
						totalEP: r.ep_earned || 0,
						level: 0,
						levelTitle: '',
						currentScore: 0,
						streak: 0,
						dimensions: null,
					});
				}
			}

			const results = Array.from(userMap.values()).sort((a, b) => b.totalEP - a.totalEP);
			periodScores.value = results;
			teamScores.value = results;
			return results;
		} catch (e: any) {
			console.warn('[Earnest] Period ranking fetch failed:', e);
			return [];
		}
	};

	// ── History for trend chart ──

	const fetchHistory = async (days: number = 30) => {
		const userId = user.value?.id;
		if (!userId) return;

		try {
			const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
			const filter: any = {
				user_created: { _eq: userId },
				date: { _gte: startDate },
			};
			if (selectedOrg.value) filter.organization = { _eq: selectedOrg.value };

			const records = await historyItems.list({
				fields: ['date', 'score', 'ep_earned', 'streak'],
				filter,
				sort: ['date'],
				limit: days,
			}).catch(() => []);

			state.value.history = (records || []).map((r: any) => ({
				date: r.date,
				score: r.score || 0,
				ep: r.ep_earned || 0,
			}));
		} catch (e: any) {
			console.warn('[Earnest] History fetch failed:', e);
		}
	};

	return {
		state: readonly(state),
		isLoading: readonly(isLoading),
		error: readonly(error),
		teamScores: readonly(teamScores),
		periodScores: readonly(periodScores),
		newBadges: readonly(newBadges),
		leveledUp: readonly(leveledUp),
		fetchState,
		syncState,
		fetchTeamRanking,
		fetchAllMemberScores,
		fetchPeriodRanking,
		fetchHistory,
		getLevelTitle,
		getNextLevelEP,
		getLevelProgress,
		getScoreTier,
		// Constants
		LEVEL_TITLES,
		LEVEL_THRESHOLDS,
		SCORE_TIERS,
		BADGES,
	};
};
