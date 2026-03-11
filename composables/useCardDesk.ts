// composables/useCardDesk.ts
// Fetches CardDesk data (cd_contacts, cd_activities, cd_xp_state) from the shared Directus instance.
// Both apps share the same directus_users auth, so the user's token works for cd_ collections.

export interface CardDeskStats {
	totalContacts: number;
	hotContacts: number;
	warmContacts: number;
	nurtureContacts: number;
	coldContacts: number;
	hibernatedContacts: number;
	convertedClients: number;
	needsFollowUp: CdContactSummary[];
	recentActivity: CdActivitySummary[];
	xp: XpSummary;
}

export interface CdContactSummary {
	id: string;
	name: string;
	company: string | null;
	rating: string | null;
	daysSinceContact: number;
	lastActivityType: string | null;
	lastActivityDate: string | null;
}

export interface CdActivitySummary {
	id: string;
	type: string;
	label: string | null;
	date: string;
	contactName: string | null;
	isResponse: boolean;
}

export interface XpSummary {
	totalXp: number;
	level: number;
	streak: number;
	levelTitle: string;
	nextLevelXp: number;
	progress: number;
	totalScans: number;
	totalContacts: number;
	totalClients: number;
}

const LEVEL_TITLES: Record<number, string> = {
	1: 'Rookie',
	2: 'Hustler',
	3: 'Connector',
	4: 'Player',
	5: 'Rainmaker',
	6: 'Closer',
	7: 'Networker',
	8: 'Dealmaker',
	9: 'Legend',
};

const LEVEL_THRESHOLDS = [0, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];

export const useCardDesk = () => {
	const contactItems = useDirectusItems('cd_contacts');
	const activityItems = useDirectusItems('cd_activities');
	const xpItems = useDirectusItems('cd_xp_state');

	const stats = ref<CardDeskStats>({
		totalContacts: 0,
		hotContacts: 0,
		warmContacts: 0,
		nurtureContacts: 0,
		coldContacts: 0,
		hibernatedContacts: 0,
		convertedClients: 0,
		needsFollowUp: [],
		recentActivity: [],
		xp: {
			totalXp: 0,
			level: 1,
			streak: 0,
			levelTitle: 'Rookie',
			nextLevelXp: 200,
			progress: 0,
			totalScans: 0,
			totalContacts: 0,
			totalClients: 0,
		},
	});

	const isLoading = ref(false);
	const error = ref<string | null>(null);

	const getLevelTitle = (level: number) => LEVEL_TITLES[level] || 'Unknown';

	const getNextLevelXp = (level: number) => {
		const idx = Math.min(level, LEVEL_THRESHOLDS.length - 1);
		return LEVEL_THRESHOLDS[idx] || 50000;
	};

	const getLevelProgress = (xp: number, level: number) => {
		const currentThreshold = LEVEL_THRESHOLDS[level - 1] || 0;
		const nextThreshold = getNextLevelXp(level);
		const range = nextThreshold - currentThreshold;
		if (range <= 0) return 100;
		return Math.min(100, Math.round(((xp - currentThreshold) / range) * 100));
	};

	const fetchStats = async () => {
		isLoading.value = true;
		error.value = null;

		try {
			const [contacts, activities, xpState] = await Promise.all([
				contactItems.list({
					fields: ['id', 'name', 'first_name', 'last_name', 'company', 'rating', 'hibernated', 'is_client', 'client_at', 'date_created'],
					filter: { status: { _eq: 'published' } },
					limit: -1,
				}).catch(() => []),
				activityItems.list({
					fields: ['id', 'type', 'label', 'date', 'is_response', 'contact.id', 'contact.name'],
					sort: ['-date'],
					limit: 20,
				}).catch(() => []),
				xpItems.list({
					fields: ['total_xp', 'level', 'streak', 'last_activity_date', 'total_scans', 'total_contacts', 'total_clients'],
					limit: 1,
				}).catch(() => []),
			]);

			// Count by rating
			const active = contacts.filter((c: any) => !c.hibernated);
			stats.value.totalContacts = active.length;
			stats.value.hotContacts = active.filter((c: any) => c.rating === 'hot').length;
			stats.value.warmContacts = active.filter((c: any) => c.rating === 'warm').length;
			stats.value.nurtureContacts = active.filter((c: any) => c.rating === 'nurture').length;
			stats.value.coldContacts = active.filter((c: any) => c.rating === 'cold').length;
			stats.value.hibernatedContacts = contacts.filter((c: any) => c.hibernated).length;
			stats.value.convertedClients = contacts.filter((c: any) => c.is_client).length;

			// Build last activity map per contact
			const lastActivityMap = new Map<string, { type: string; date: string }>();
			for (const act of activities) {
				const contactId = act.contact?.id;
				if (contactId && !lastActivityMap.has(contactId)) {
					lastActivityMap.set(contactId, { type: act.type, date: act.date });
				}
			}

			// Find contacts needing follow-up (hot/warm, no activity in 3+ days)
			const now = new Date();
			const needsFollowUp: CdContactSummary[] = [];
			for (const contact of active) {
				if (contact.rating !== 'hot' && contact.rating !== 'warm') continue;
				const lastAct = lastActivityMap.get(contact.id);
				const lastDate = lastAct?.date ? new Date(lastAct.date) : (contact.date_created ? new Date(contact.date_created) : null);
				if (!lastDate) continue;
				const daysSince = Math.floor((now.getTime() - lastDate.getTime()) / 86400000);
				if (daysSince >= 3) {
					needsFollowUp.push({
						id: contact.id,
						name: contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unknown',
						company: contact.company,
						rating: contact.rating,
						daysSinceContact: daysSince,
						lastActivityType: lastAct?.type || null,
						lastActivityDate: lastAct?.date || null,
					});
				}
			}
			needsFollowUp.sort((a, b) => b.daysSinceContact - a.daysSinceContact);
			stats.value.needsFollowUp = needsFollowUp;

			// Recent activity
			stats.value.recentActivity = activities.slice(0, 10).map((act: any) => ({
				id: act.id,
				type: act.type,
				label: act.label,
				date: act.date,
				contactName: act.contact?.name || null,
				isResponse: act.is_response || false,
			}));

			// XP state
			const xp = xpState[0];
			if (xp) {
				const level = xp.level || 1;
				const totalXp = xp.total_xp || 0;
				stats.value.xp = {
					totalXp,
					level,
					streak: xp.streak || 0,
					levelTitle: getLevelTitle(level),
					nextLevelXp: getNextLevelXp(level),
					progress: getLevelProgress(totalXp, level),
					totalScans: xp.total_scans || 0,
					totalContacts: xp.total_contacts || 0,
					totalClients: xp.total_clients || 0,
				};
			}
		} catch (e: any) {
			console.warn('[CardDesk] Could not fetch stats:', e);
			error.value = e.message;
		} finally {
			isLoading.value = false;
		}
	};

	// Fetch contacts list with pagination
	const fetchContacts = async (opts?: { rating?: string; hibernated?: boolean; isClient?: boolean; search?: string; page?: number; limit?: number }) => {
		const filter: any = { status: { _eq: 'published' } };
		const conditions: any[] = [filter];

		if (opts?.rating) conditions.push({ rating: { _eq: opts.rating } });
		if (opts?.hibernated !== undefined) conditions.push({ hibernated: { _eq: opts.hibernated } });
		if (opts?.isClient !== undefined) conditions.push({ is_client: { _eq: opts.isClient } });
		if (opts?.search) {
			conditions.push({
				_or: [
					{ name: { _contains: opts.search } },
					{ company: { _contains: opts.search } },
					{ email: { _contains: opts.search } },
				],
			});
		}

		return contactItems.list({
			fields: ['id', 'name', 'first_name', 'last_name', 'title', 'company', 'email', 'phone', 'industry', 'met_at', 'rating', 'hibernated', 'is_client', 'client_at', 'notes', 'date_created'],
			filter: conditions.length > 1 ? { _and: conditions } : filter,
			sort: ['-date_created'],
			limit: opts?.limit || 25,
			offset: ((opts?.page || 1) - 1) * (opts?.limit || 25),
		});
	};

	// Fetch activities for a specific contact
	const fetchContactActivities = async (contactId: string) => {
		return activityItems.list({
			fields: ['id', 'type', 'label', 'date', 'note', 'is_response', 'response_note', 'date_created'],
			filter: { contact: { _eq: contactId } },
			sort: ['-date'],
			limit: 50,
		});
	};

	return {
		stats: readonly(stats),
		isLoading: readonly(isLoading),
		error: readonly(error),
		fetchStats,
		fetchContacts,
		fetchContactActivities,
	};
};
