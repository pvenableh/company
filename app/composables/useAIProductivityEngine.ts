// composables/useAIProductivityEngine.ts
// Smart productivity engine that analyzes user data across ALL platform modules
// and generates prioritized action items, suggestions, and insights.
//
// Data sources: tickets, projects, tasks, invoices, channels/messages,
//               social media, scheduling, phone/activities, deals

export interface TaskSuggestion {
	id: string;
	type: 'action' | 'reminder' | 'insight' | 'lead' | 'followup';
	priority: 'urgent' | 'high' | 'medium' | 'low';
	icon: string;
	title: string;
	description: string;
	actionLabel: string;
	actionRoute?: string;
	actionFn?: () => void;
	// Optional link to the underlying record so the dashboard can offer quick
	// status changes (mark done / advance status) without navigating away.
	entity?: {
		collection: 'tickets' | 'projects' | 'tasks' | 'invoices';
		id: string;
		status?: string;
		/** Invoice balance — drives the one-click "Mark paid" payment amount. */
		amount?: number;
	};
	category:
		| 'tasks'
		| 'invoices'
		| 'projects'
		| 'communication'
		| 'leads'
		| 'scheduling'
		| 'social'
		| 'phone'
		| 'carddesk'
		| 'goals';
	timestamp: Date;
	score: number;
}

export interface ProductivityMetrics {
	tasksCompletedToday: number;
	tasksCompletedThisWeek: number;
	overdueItems: number;
	pendingInvoiceTotal: number;
	upcomingMeetings: number;
	unreadMessages: number;
	productivityScore: number;
	// New metrics
	activeProjects: number;
	overdueProjects: number;
	pendingTasks: number;
	unreadChannelMessages: number;
	scheduledSocialPosts: number;
	failedSocialPosts: number;
	missedCalls: number;
	openDeals: number;
	dealsPipelineValue: number;
	// CRM metrics for Earnest Score
	leadsWon: number;
	leadsInPipeline: number;
	overdueFollowUps: number;
	totalLeadsClosed: number;
}

// Module-level cache — persists across composable calls for 60s TTL
const MODULE_CACHE_TTL = 60_000;
const _moduleCache = new Map<string, { data: TaskSuggestion[]; expiresAt: number }>();

export const useAIProductivityEngine = () => {
	const suggestions = ref<TaskSuggestion[]>([]);
	const metrics = ref<ProductivityMetrics>({
		tasksCompletedToday: 0,
		tasksCompletedThisWeek: 0,
		overdueItems: 0,
		pendingInvoiceTotal: 0,
		upcomingMeetings: 0,
		unreadMessages: 0,
		productivityScore: 0,
		activeProjects: 0,
		overdueProjects: 0,
		pendingTasks: 0,
		unreadChannelMessages: 0,
		scheduledSocialPosts: 0,
		failedSocialPosts: 0,
		missedCalls: 0,
		openDeals: 0,
		dealsPipelineValue: 0,
		leadsWon: 0,
		leadsInPipeline: 0,
		overdueFollowUps: 0,
		totalLeadsClosed: 0,
	});
	const isAnalyzing = ref(false);
	const greeting = ref('');
	const subtitle = ref("Here's what needs your attention");
	/**
	 * Which greeting is currently on screen:
	 *   'none'  — nothing yet
	 *   'local' — the instant deterministic greeting (time/name/persona)
	 *   'ai'    — the personalized LLM greeting has landed
	 * Surfaces use this to hold a "Thinking…" placeholder for the smart
	 * greeting instead of showing the basic one and swapping it later.
	 */
	const greetingSource = ref<'none' | 'local' | 'ai'>('none');

	const ticketItems = useDirectusItems('tickets');
	const invoiceItems = useDirectusItems('invoices');
	const projectItems = useDirectusItems('projects');
	const taskItems = useDirectusItems('tasks');
	const channelItems = useDirectusItems('channels');
	const messageItems = useDirectusItems('messages');
	const socialPostItems = useDirectusItems('social_posts');
	const socialAccountItems = useDirectusItems('social_accounts');
	const callLogItems = useDirectusItems('call_logs');
	const dealItems = useDirectusItems('leads');
	const goalItems = useDirectusItems('goals');
	const appointmentItems = useDirectusItems('appointments');
	const { user } = useDirectusAuth();
	const { selectedOrg, organizations } = useOrganization();
	const { selectedTeam } = useTeams();
	const { selectedClient, getClientFilter } = useClients();
	const { isMine } = useDataScope();

	// Build org/team/client filter fragments for Directus queries.
	// When `selectedOrg` is null (multi-org admin "All Orgs" view) we used to
	// return `{}` and rely on Directus row-perm walks to scope reads. That walk
	// is the recursive `organization.users.directus_users_id.id._eq.$CURRENT_USER`
	// path — slow (no indexed entry point) and the security flag noted in
	// project_directus_perm_filter_gotchas.md. Replace it with an explicit allow
	// list of the user's accessible (non-archived) org IDs so the planner gets
	// an index seek and we stop relying on the ambiguous row-perm walk.
	const accessibleOrgIds = computed<string[]>(() =>
		(organizations.value || [])
			.filter((o: any) => !o.archived_at)
			.map((o: any) => o.id),
	);
	const orgFilter = () => {
		if (selectedOrg.value) return { organization: { _eq: selectedOrg.value } };
		const ids = accessibleOrgIds.value;
		if (ids.length > 0) return { organization: { _in: ids } };
		return {};
	};
	const clientFilter = () => getClientFilter();
	// Mine/All from the header pill. Returned as a sub-filter fragment
	// suitable to merge with other filter pieces in queries that have an
	// assigned_to junction (tickets, tasks, projects). Use only on queries
	// where ownership is meaningful — e.g. don't apply to org-wide CRM stats.
	const myFilter = () => {
		if (!isMine.value || !user.value?.id) return {};
		return {
			_or: [
				{ user_created: { _eq: user.value.id } },
				{ assigned_to: { directus_users_id: { _eq: user.value.id } } },
			],
		};
	};

	// ─── Helpers ──────────────────────────────────────────────────────────────

	const today = () => {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		return d;
	};

	const todayISO = () => today().toISOString().split('T')[0];

	const daysFromNow = (dateStr: string): number => {
		const d = new Date(dateStr);
		return Math.floor((d.getTime() - today().getTime()) / 86400000);
	};

	// Time-aware, persona-aware greeting (expanded arrays for more variety)
	const getGreeting = (): string => {
		const hour = new Date().getHours();
		const name = user.value?.first_name || 'there';
		const { activePersona } = useAIPersona();
		const persona = activePersona.value?.value || 'default';
		const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

		const greetings: Record<string, Record<string, string[]>> = {
			default: {
				morning: [`Good morning, ${name}`, `Rise and shine, ${name}`, `Morning, ${name} — let's make today count`, `Welcome back, ${name}`, `Ready to start the day, ${name}?`, `A fresh start awaits, ${name}`],
				afternoon: [`Good afternoon, ${name}`, `Afternoon, ${name} — how's it going?`, `Hey ${name}, keeping the momentum going`, `Still at it, ${name}? Nice work`, `${name}, the afternoon is yours`, `What's next on the list, ${name}?`],
				evening: [`Good evening, ${name}`, `Evening, ${name} — winding down?`, `Hey ${name}, finishing strong tonight`, `Almost there, ${name}`, `${name}, wrapping up the day`, `Evening check-in, ${name}`],
			},
			director: {
				morning: [`Morning, ${name}. Time to execute.`, `Let's get to work, ${name}.`, `${name}, here's your mission briefing.`, `${name}. Priorities first.`, `Briefing ready, ${name}. Let's move.`, `${name}, the clock is ticking.`],
				afternoon: [`${name}, status check. What's the priority?`, `Afternoon, ${name}. Stay focused.`, `Halfway through, ${name}. Let's push.`, `${name}, where do we stand?`, `Time check, ${name}. What needs closing?`, `${name}, keep the pressure on.`],
				evening: [`${name}, final push. What needs to close today?`, `Evening, ${name}. Any blockers before we wrap?`, `Let's tie up loose ends, ${name}.`, `${name}, debrief time.`, `End of day, ${name}. Status report.`, `${name}, close it out strong.`],
			},
		};

		const pool = greetings[persona]?.[period] || greetings.default[period];
		const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
		return pool[dayOfYear % pool.length];
	};

	// Persona-aware subtitle
	const getSubtitle = (): string => {
		const { activePersona } = useAIPersona();
		const persona = activePersona.value?.value || 'default';
		const hour = new Date().getHours();
		const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

		const subtitles: Record<string, Record<string, string[]>> = {
			default: {
				morning: ["Here's what needs your attention today", 'Your priorities are lined up and ready', "Let's see what's on the radar", 'Time to tackle the day ahead', "Here's your morning snapshot", 'Your dashboard is ready'],
				afternoon: ["Here's where things stand right now", "Let's keep the momentum going", 'A quick look at your open items', "Midday update — here's the rundown", 'Status check on your priorities', 'Your afternoon overview is ready'],
				evening: ["Here's what's still on your plate", 'Wrapping up? Here are the loose ends', "Let's close out the day strong", "Final items before you sign off", "Here's where things landed today", 'Evening review of your priorities'],
			},
			director: {
				morning: ['Your daily ops briefing is ready', 'Mission priorities loaded', 'Intel report: here are the open items', 'Status: action items queued', 'Today\'s targets are locked in', 'Operations dashboard is live'],
				afternoon: ['Midday status — here are the action items', 'Time-sensitive items flagged below', 'Operational update incoming', 'Priority queue updated', 'Action items require your attention', 'Afternoon briefing ready'],
				evening: ['End-of-day debrief — review the status', 'Final items requiring sign-off', "Tomorrow's blockers start here", 'Close-of-business status report', 'Outstanding items need resolution', 'Wrap-up briefing loaded'],
			},
		};

		const pool = subtitles[persona]?.[period] || subtitles.default[period];
		const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
		return pool[(dayOfYear + 1) % pool.length];
	};

	// Seed the deterministic greeting/subtitle immediately (client-only) so the
	// hero never paints an empty <h1> during the window before analyze() runs —
	// on the home page analyze() is gated behind a couple of network fetches, so
	// without this the greeting flashes empty and then shifts layout when it
	// lands. Cheap + synchronous (time/name/persona only); the richer AI greeting
	// still refines it later. Client-only to avoid an SSR text mismatch on a
	// value that is inherently clock- and session-dependent.
	const primeGreeting = () => {
		if (import.meta.server) return;
		if (!greeting.value) greeting.value = getGreeting();
		if (!subtitle.value) subtitle.value = getSubtitle();
		if (greetingSource.value === 'none') greetingSource.value = 'local';
	};

	// Fetch AI-generated greeting if personalizations are enabled
	const fetchAIGreeting = async () => {
		if (import.meta.server) return;
		try {
			const { personalizationsEnabled, lowUsageMode } = useAIPreferences();
			if (!personalizationsEnabled.value || lowUsageMode.value) return;

			const { activePersona } = useAIPersona();
			const hour = new Date().getHours();
			const result = await $fetch('/api/ai/greeting', {
				params: {
					persona: activePersona.value?.value || 'default',
					hour,
					tasks: metrics.value.pendingTasks || 0,
					overdue: metrics.value.overdueItems || 0,
				},
			});

			if (result?.greeting) {
				greeting.value = result.greeting;
				greetingSource.value = 'ai';
			}
			if (result?.subtitle) {
				subtitle.value = result.subtitle;
			}
		} catch {
			// Silently fail — hardcoded greeting is already displayed
		}
	};

	// Score = IMPACT × how actionable it is right now. The old version scored
	// linearly on days-overdue (capped), so a $165 invoice 547 days late topped
	// the feed forever — noise, not a productive next action. Now overdueness
	// rides an ACTIONABLE-WINDOW curve (climbs over the first weeks, stays hot,
	// then DECAYS — a very old item is a write-off decision, not today's live
	// action) and amount is log-scaled so real money rises without a $1k cliff.
	const calculateScore = (item: {
		type: string;
		daysOverdue?: number;
		amount?: number;
		isToday?: boolean;
		isTomorrow?: boolean;
	}): number => {
		let score = 40;

		const d = item.daysOverdue && item.daysOverdue > 0 ? item.daysOverdue : 0;
		if (d > 0) {
			let w: number;
			if (d <= 14) w = 0.35 + (d / 14) * 0.65;              // ramp up over ~2 weeks
			else if (d <= 45) w = 1;                               // hot, still recoverable
			else if (d <= 120) w = 1 - ((d - 45) / 75) * 0.72;     // fade as it goes cold
			else w = 0.22;                                         // stale floor — visible, never top
			score += Math.round(36 * w);
		}
		if (item.isToday) score += 22;
		if (item.isTomorrow) score += 11;
		if (item.type === 'action') score += 8;
		// Log-scaled money: $200→~14, $1k→~18, $10k→cap 22. No single cliff.
		if (item.amount && item.amount > 0) {
			score += Math.min(22, Math.round(Math.log10(item.amount + 1) * 6));
		}

		return Math.max(0, Math.min(100, score));
	};

	// Priority follows the impact score, so the buckets (and the "urgent" count
	// that drives Focus nudges) reflect true urgency — a stale, tiny, long-overdue
	// item is no longer "urgent" merely for being late.
	const priorityFromScore = (s: number): TaskSuggestion['priority'] =>
		s >= 82 ? 'urgent' : s >= 64 ? 'high' : s >= 46 ? 'medium' : 'low';

	// ─── Ticket Analysis ──────────────────────────────────────────────────────

	// Collapse same-client (or same-project) OVERDUE clusters: one item → its own
	// card; 2+ → a single grouped card ("3 overdue tickets · Acme"). Keeps the
	// individual card's inline status action (via `entity`); the group offers a
	// "Review" navigate instead. Mirrors the invoice grouping.
	type ClusterItem = { id: string; title: string; overdue: number; status?: string };
	const clusterOverdue = (
		groups: Map<string, { name: string; items: ClusterItem[] }>,
		cfg: {
			collection: 'tickets' | 'tasks';
			noun: string; // 'tickets' | 'tasks'
			icon: string;
			route: (id: string) => string;
			groupRoute: string;
			singleTitle: (title: string) => string;
			singleDesc: (name: string, overdue: number) => string;
			singleAction: string;
		},
	): TaskSuggestion[] => {
		const out: TaskSuggestion[] = [];
		for (const { name, items } of groups.values()) {
			if (items.length === 1) {
				const it = items[0]!;
				out.push({
					id: `${cfg.collection}-overdue-${it.id}`,
					type: 'action', priority: 'urgent', icon: cfg.icon,
					title: cfg.singleTitle(it.title),
					description: cfg.singleDesc(name, it.overdue),
					actionLabel: cfg.singleAction, actionRoute: cfg.route(it.id),
					category: 'tasks', entity: { collection: cfg.collection, id: it.id, status: it.status },
					timestamp: new Date(), score: calculateScore({ type: 'action', daysOverdue: it.overdue }),
				});
			} else {
				const maxOverdue = Math.max(...items.map((x) => x.overdue));
				out.push({
					id: `${cfg.collection}-overdue-group-${name}`,
					type: 'action', priority: 'urgent', icon: cfg.icon,
					title: `${items.length} overdue ${cfg.noun} · ${name}`,
					description: `${items.length} ${cfg.noun} past due for ${name} — oldest ${maxOverdue} day${maxOverdue !== 1 ? 's' : ''}`,
					actionLabel: `Review ${items.length}`, actionRoute: cfg.groupRoute,
					category: 'tasks', timestamp: new Date(),
					score: calculateScore({ type: 'action', daysOverdue: maxOverdue }),
				});
			}
		}
		return out;
	};

	const analyzeTickets = async (): Promise<TaskSuggestion[]> => {
		const results: TaskSuggestion[] = [];

		try {
			const tickets = await ticketItems.list({
				// `client` is the counterparty (group + label by it); `organization`
				// is the owning org, same trap as invoices' bill_to.
				fields: ['id', 'title', 'status', 'priority', 'due_date', 'assigned_to', 'client.id', 'client.name'],
				filter: {
					_and: [
						{ status: { _nin: ['Completed', 'Archived'] } },
						orgFilter(),
						clientFilter(),
						myFilter(),
					],
				},
				sort: ['due_date'],
				limit: 50,
			});

			const t = today();
			let completedToday = 0;

			// Overdue tickets are collected by client and clustered after the loop;
			// due-today reminders stay individual.
			const overdueByClient = new Map<string, { name: string; items: ClusterItem[] }>();

			for (const ticket of tickets) {
				// Skip any closed status regardless of casing (filter excludes
				// 'Completed'/'Archived'; this catches lowercase variants too).
				const st = (ticket.status || '').toLowerCase();
				if (st === 'completed' || st === 'archived') continue;
				const dueDate = ticket.due_date ? new Date(ticket.due_date) : null;
				const isOverdue = dueDate && dueDate < t;
				const isDueToday = dueDate && dueDate.toDateString() === t.toDateString();
				const daysOverdue = dueDate ? Math.floor((t.getTime() - dueDate.getTime()) / 86400000) : 0;

				if (isOverdue) {
					const name = ticket.client?.name || 'a client';
					const key = String(ticket.client?.id ?? name);
					const g = overdueByClient.get(key) || { name, items: [] as ClusterItem[] };
					g.items.push({ id: String(ticket.id), title: ticket.title, overdue: daysOverdue, status: ticket.status });
					overdueByClient.set(key, g);
				} else if (isDueToday) {
					results.push({
						id: `ticket-today-${ticket.id}`,
						type: 'reminder',
						priority: 'high',
						icon: 'i-heroicons-clock',
						title: `Due Today: ${ticket.title}`,
						description: `This ticket needs to be completed today`,
						actionLabel: 'Work on it',
						actionRoute: `/tickets/${ticket.id}`,
						category: 'tasks',
						entity: { collection: 'tickets', id: ticket.id, status: ticket.status },
						timestamp: new Date(),
						score: calculateScore({ type: 'action', isToday: true }),
					});
				}
			}

			// Cluster the overdue tickets (single → individual + inline action;
			// 2+ for one client → one grouped card).
			results.push(...clusterOverdue(overdueByClient, {
				collection: 'tickets', noun: 'tickets', icon: 'i-heroicons-exclamation-triangle',
				route: (id) => `/tickets/${id}`, groupRoute: '/tickets',
				singleTitle: (title) => `Overdue: ${title}`,
				singleDesc: (name, overdue) => `This ticket is ${overdue} day${overdue !== 1 ? 's' : ''} overdue${name !== 'a client' ? ` for ${name}` : ''}`,
				singleAction: 'Complete Now',
			}));

			// Count completed today for metrics
			try {
				const cFilter = clientFilter();
				const oFilter = orgFilter();
				const completedTickets = await ticketItems.list({
					fields: ['id'],
					filter: {
						_and: [
							{ status: { _eq: 'Completed' } },
							{ date_updated: { _gte: todayISO() } },
							...(Object.keys(oFilter).length > 0 ? [oFilter] : []),
							...(Object.keys(cFilter).length > 0 ? [cFilter] : []),
						],
					},
					limit: 100,
				});
				completedToday = completedTickets.length;
			} catch {}

			metrics.value.overdueItems = results.filter((r) => r.priority === 'urgent').length;
			metrics.value.tasksCompletedToday = completedToday;
		} catch (e) {
			console.warn('[AI Engine] Could not analyze tickets:', e);
		}

		return results;
	};

	// ─── Project Analysis ─────────────────────────────────────────────────────

	const analyzeProjects = async (): Promise<TaskSuggestion[]> => {
		const results: TaskSuggestion[] = [];

		try {
			const projects = await projectItems.list({
				fields: ['id', 'title', 'status', 'due_date', 'start_date', 'organization.name'],
				filter: {
					// Directus `_nin` is case-SENSITIVE and project rows carry mixed
					// casing ('Completed' AND 'completed', 'Archived' AND 'archived').
					// Exclude every variant or capital-'Completed' projects leak back
					// in and show as "overdue". See the normalize guard below too.
					status: { _nin: ['completed', 'Completed', 'archived', 'Archived'] },
					...orgFilter(),
					...clientFilter(),
				},
				sort: ['due_date'],
				limit: 50,
			});

			const t = today();
			let activeCount = 0;
			let overdueCount = 0;

			for (const project of projects) {
				// Belt-and-suspenders: skip any closed status regardless of casing,
				// in case a new variant slips past the filter above.
				const st = (project.status || '').toLowerCase();
				if (st === 'completed' || st === 'archived') continue;
				activeCount++;
				const dueDate = project.due_date ? new Date(project.due_date) : null;
				const isOverdue = dueDate && dueDate < t;
				const isDueSoon = dueDate && daysFromNow(project.due_date) <= 3 && daysFromNow(project.due_date) >= 0;

				if (isOverdue) {
					overdueCount++;
					const daysOver = Math.floor((t.getTime() - dueDate.getTime()) / 86400000);
					results.push({
						id: `project-overdue-${project.id}`,
						type: 'action',
						priority: 'urgent',
						icon: 'i-heroicons-square-3-stack-3d',
						title: `Project Overdue: ${project.title}`,
						description: `${daysOver} day${daysOver > 1 ? 's' : ''} past deadline${project.organization?.name ? ` for ${project.organization.name}` : ''}`,
						actionLabel: 'Review Project',
						actionRoute: `/projects/${project.id}`,
						category: 'projects',
						entity: { collection: 'projects', id: project.id, status: project.status },
						timestamp: new Date(),
						score: calculateScore({ type: 'action', daysOverdue: daysOver }),
					});
				} else if (isDueSoon) {
					const daysLeft = daysFromNow(project.due_date);
					results.push({
						id: `project-due-soon-${project.id}`,
						type: 'reminder',
						priority: 'high',
						icon: 'i-heroicons-square-3-stack-3d',
						title: `Project Due ${daysLeft === 0 ? 'Today' : `in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`}: ${project.title}`,
						description: `Ensure all tasks are on track${project.organization?.name ? ` for ${project.organization.name}` : ''}`,
						actionLabel: 'View Project',
						actionRoute: `/projects/${project.id}`,
						category: 'projects',
						entity: { collection: 'projects', id: project.id, status: project.status },
						timestamp: new Date(),
						score: calculateScore({ type: 'action', isToday: daysLeft === 0, isTomorrow: daysLeft === 1 }),
					});
				}
			}

			// Projects with no due date
			const noDueDateProjects = projects.filter((p: any) => !p.due_date);
			if (noDueDateProjects.length > 0) {
				results.push({
					id: 'project-no-deadline',
					type: 'insight',
					priority: 'low',
					icon: 'i-heroicons-calendar',
					title: `${noDueDateProjects.length} Project${noDueDateProjects.length > 1 ? 's' : ''} Without Deadlines`,
					description: 'Setting due dates helps track progress and prioritize work',
					actionLabel: 'View Projects',
					actionRoute: '/projects',
					category: 'projects',
					timestamp: new Date(),
					score: 30,
				});
			}

			metrics.value.activeProjects = activeCount;
			metrics.value.overdueProjects = overdueCount;
		} catch (e) {
			console.warn('[AI Engine] Could not analyze projects:', e);
		}

		return results;
	};

	// ─── Task Analysis ────────────────────────────────────────────────────────

	const analyzeTasks = async (): Promise<TaskSuggestion[]> => {
		const results: TaskSuggestion[] = [];

		try {
			const tasks = await taskItems.list({
				fields: ['id', 'title', 'status', 'due_date', 'assigned_to.directus_users_id.first_name', 'project_event_id.id', 'project_id.id', 'project_id.title'],
				filter: {
					_and: [
						{ status: { _neq: 'completed' } },
						{ assigned_to: { directus_users_id: { _eq: '$CURRENT_USER' } } },
					],
				},
				sort: ['due_date'],
				limit: 50,
			});

			const t = today();
			let pendingCount = 0;

			// Overdue tasks cluster by PROJECT (tasks with no project get a unique
			// key → they stay individual). Due-today reminders stay individual.
			const overdueByProject = new Map<string, { name: string; items: ClusterItem[] }>();

			for (const task of tasks) {
				pendingCount++;
				const dueDate = task.due_date ? new Date(task.due_date) : null;
				const isOverdue = dueDate && dueDate < t;
				const isDueToday = dueDate && dueDate.toDateString() === t.toDateString();

				if (isOverdue) {
					const daysOver = Math.floor((t.getTime() - dueDate.getTime()) / 86400000);
					const proj = task.project_id;
					const key = proj?.id ? String(proj.id) : `solo-${task.id}`;
					const name = proj?.title || '';
					const g = overdueByProject.get(key) || { name, items: [] as ClusterItem[] };
					g.items.push({ id: String(task.id), title: task.title, overdue: daysOver, status: task.status });
					overdueByProject.set(key, g);
				} else if (isDueToday) {
					results.push({
						id: `task-today-${task.id}`,
						type: 'reminder',
						priority: 'high',
						icon: 'i-heroicons-clipboard-document-check',
						title: `Task Due Today: ${task.title}`,
						description: 'Complete before end of day',
						actionLabel: 'Do It',
						actionRoute: '/tasks',
						category: 'tasks',
						entity: { collection: 'tasks', id: task.id, status: task.status },
						timestamp: new Date(),
						score: calculateScore({ type: 'action', isToday: true }),
					});
				}
			}

			// Cluster the overdue tasks (2+ in one project → one grouped card).
			results.push(...clusterOverdue(overdueByProject, {
				collection: 'tasks', noun: 'tasks', icon: 'i-heroicons-clipboard-document-check',
				route: () => '/tasks', groupRoute: '/tasks',
				singleTitle: (title) => `Overdue Task: ${title}`,
				singleDesc: (_name, overdue) => `${overdue} day${overdue !== 1 ? 's' : ''} overdue`,
				singleAction: 'Complete',
			}));

			metrics.value.pendingTasks = pendingCount;
		} catch (e) {
			console.warn('[AI Engine] Could not analyze tasks:', e);
		}

		return results;
	};

	// ─── Invoice Analysis ─────────────────────────────────────────────────────

	const analyzeInvoices = async (): Promise<TaskSuggestion[]> => {
		const results: TaskSuggestion[] = [];

		try {
			// Invoices use `bill_to` (not `organization`) for the org reference
			const invoiceFilter: Record<string, any> = {
				status: { _in: ['pending', 'processing'] },
				...clientFilter(),
			};
			if (selectedOrg.value) {
				invoiceFilter.bill_to = { _eq: selectedOrg.value };
			} else if (accessibleOrgIds.value.length > 0) {
				// Multi-org admin "All Orgs" view: allow-list instead of relying on
				// the recursive Directus row-perm walk.
				invoiceFilter.bill_to = { _in: accessibleOrgIds.value };
			}

			const invoices = await invoiceItems.list({
				// `bill_to` is always the current org (the biller); the COUNTERPARTY is
				// `client` — that's what we group + label by.
				fields: ['id', 'invoice_code', 'status', 'due_date', 'total_amount', 'client.id', 'client.name'],
				filter: invoiceFilter,
				sort: ['due_date'],
				limit: 50,
			});

			const t = today();
			let pendingTotal = 0;

			// Collect overdue invoices GROUPED BY the client billed, so a cluster
			// reads as one decision ("4 unpaid invoices · Acme · $9,670") instead of
			// four noisy rows competing at the top of the feed.
			type OverdueItem = { invoice: any; amount: number; daysOverdue: number };
			const overdueByClient = new Map<string, { name: string; items: OverdueItem[] }>();
			for (const invoice of invoices) {
				const amount = Number(invoice.total_amount) || 0;
				pendingTotal += amount;

				const dueDate = invoice.due_date ? new Date(invoice.due_date) : null;
				if (dueDate && dueDate < t && invoice.status === 'pending') {
					const daysOverdue = Math.floor((t.getTime() - dueDate.getTime()) / 86400000);
					const name = invoice.client?.name || 'a client';
					const key = String(invoice.client?.id ?? name);
					const g = overdueByClient.get(key) || { name, items: [] as OverdueItem[] };
					g.items.push({ invoice, amount, daysOverdue });
					overdueByClient.set(key, g);
				}
			}

			for (const { name, items } of overdueByClient.values()) {
				if (items.length === 1) {
					// Lone overdue invoice — keep the individual card + its inline
					// "Mark paid" quick-action (`amount` is the full pending balance).
					const { invoice, amount, daysOverdue } = items[0]!;
					results.push({
						id: `invoice-overdue-${invoice.id}`,
						type: 'action',
						priority: 'urgent',
						icon: 'i-heroicons-banknotes',
						title: `Unpaid Invoice: ${invoice.invoice_code}`,
						description: `$${amount.toLocaleString()} from ${name} is ${daysOverdue} days past due`,
						actionLabel: 'Follow Up',
						actionRoute: `/invoices/${invoice.id}`,
						category: 'invoices',
						timestamp: new Date(),
						score: calculateScore({ type: 'action', daysOverdue, amount }),
						entity: { collection: 'invoices', id: String(invoice.id), status: invoice.status, amount },
					});
				} else {
					// Cluster — one card for the whole client. No single `entity`, so it
					// offers "Review" (navigate) rather than a group "Mark paid".
					const total = items.reduce((s, x) => s + x.amount, 0);
					const maxOverdue = Math.max(...items.map((x) => x.daysOverdue));
					results.push({
						id: `invoice-overdue-group-${name}`,
						type: 'action',
						priority: 'urgent',
						icon: 'i-heroicons-banknotes',
						title: `${items.length} unpaid invoices · ${name}`,
						description: `$${total.toLocaleString()} past due across ${items.length} invoices — oldest ${maxOverdue} days`,
						actionLabel: `Review ${items.length}`,
						actionRoute: '/invoices',
						category: 'invoices',
						timestamp: new Date(),
						score: calculateScore({ type: 'action', daysOverdue: maxOverdue, amount: total }),
					});
				}
			}

			metrics.value.pendingInvoiceTotal = pendingTotal;

			// Insight: large pending total
			if (pendingTotal > 5000) {
				results.push({
					id: 'invoice-insight-pending',
					type: 'insight',
					priority: 'medium',
					icon: 'i-heroicons-light-bulb',
					title: `$${pendingTotal.toLocaleString()} in Outstanding Invoices`,
					description: 'Consider sending payment reminders to improve cash flow',
					actionLabel: 'View Invoices',
					actionRoute: '/invoices',
					category: 'invoices',
					timestamp: new Date(),
					score: 55,
				});
			}
		} catch (e) {
			console.warn('[AI Engine] Could not analyze invoices:', e);
		}

		return results;
	};

	// ─── Channel / Messages Analysis ──────────────────────────────────────────

	const analyzeChannels = async (): Promise<TaskSuggestion[]> => {
		const results: TaskSuggestion[] = [];

		try {
			// Get channels the user has access to
			const channels = await channelItems.list({
				fields: ['id', 'name'],
				filter: { status: { _eq: 'published' }, ...orgFilter(), ...clientFilter() },
				limit: 50,
			});

			if (channels.length === 0) return results;

			// Check for recent messages across all channels (last 24h)
			const yesterday = new Date();
			yesterday.setDate(yesterday.getDate() - 1);

			// Tenant-scope via channel FK: messages has no `organization` column,
			// so the Client Manager perm uses `channel.organization._in <user orgs>`.
			// We pre-filter by `channel._in <visible channel ids>` here as an
			// explicit, indexed bound — the perm's FK walk still applies as a
			// belt-and-suspenders check.
			const recentMessages = await messageItems.list({
				fields: ['id', 'channel.id', 'channel.name', 'date_created', 'user_created.id'],
				filter: {
					_and: [
						{ status: { _eq: 'published' } },
						{ date_created: { _gte: yesterday.toISOString() } },
						{ user_created: { _neq: '$CURRENT_USER' } },
						{ channel: { _in: channels.map((c: any) => c.id) } },
					],
				},
				sort: ['-date_created'],
				limit: 100,
			});

			const unreadCount = recentMessages.length;
			metrics.value.unreadChannelMessages = unreadCount;

			// Group by channel
			const channelMessageCounts = new Map<string, { name: string; count: number }>();
			for (const msg of recentMessages) {
				const chId = msg.channel?.id;
				if (!chId) continue;
				const entry = channelMessageCounts.get(chId) || { name: msg.channel?.name || 'Unknown', count: 0 };
				entry.count++;
				channelMessageCounts.set(chId, entry);
			}

			// Active channels with many messages
			for (const [chId, info] of channelMessageCounts) {
				if (info.count >= 5) {
					results.push({
						id: `channel-active-${chId}`,
						type: 'reminder',
						priority: 'medium',
						icon: 'i-heroicons-chat-bubble-left-right',
						title: `Active: #${info.name}`,
						description: `${info.count} new messages in the last 24 hours`,
						actionLabel: 'View Channel',
						actionRoute: `/channels/${chId}`,
						category: 'communication',
						timestamp: new Date(),
						score: 42 + Math.min(info.count, 10),
					});
				}
			}

			if (unreadCount > 10) {
				results.push({
					id: 'channels-catch-up',
					type: 'reminder',
					priority: 'medium',
					icon: 'i-heroicons-chat-bubble-left-right',
					title: `${unreadCount} New Team Messages`,
					description: 'Catch up on team conversations to stay in the loop',
					actionLabel: 'Open Channels',
					actionRoute: '/channels',
					category: 'communication',
					timestamp: new Date(),
					score: 45,
				});
			}
		} catch (e) {
			console.warn('[AI Engine] Could not analyze channels:', e);
		}

		return results;
	};

	// ─── Social Media Analysis ────────────────────────────────────────────────

	const analyzeSocial = async (): Promise<TaskSuggestion[]> => {
		const results: TaskSuggestion[] = [];

		try {
			// Check connected accounts.
			//
			// `social_accounts` has a direct `organization` FK and the Client
			// Manager read perm is `{ organization: { _in <user orgs> } }`,
			// so the perm scopes this read for us — no engine-side org filter
			// needed.
			const accounts = await socialAccountItems.list({
				fields: ['id', 'platform', 'account_name', 'status'],
				filter: { status: { _eq: 'published' } },
				limit: 20,
			});

			if (accounts.length === 0) {
				results.push({
					id: 'social-no-accounts',
					type: 'insight',
					priority: 'low',
					icon: 'i-heroicons-share',
					title: 'Connect Social Accounts',
					description: 'Link your Instagram or TikTok to start scheduling content',
					actionLabel: 'Setup',
					actionRoute: '/social/settings',
					category: 'social',
					timestamp: new Date(),
					score: 20,
				});
				return results;
			}

			// Check scheduled posts
			// social_posts has no client/org FK; scope to the current user since
			// non-admin policies grant no row-level read on this collection anyway.
			const posts = await socialPostItems.list({
				fields: ['id', 'post_status', 'scheduled_at', 'platforms', 'caption'],
				filter: {
					post_status: { _in: ['scheduled', 'draft', 'failed'] },
					user_created: { _eq: '$CURRENT_USER' },
				},
				sort: ['scheduled_at'],
				limit: 50,
			});

			let scheduledCount = 0;
			let failedCount = 0;
			let draftCount = 0;

			for (const post of posts) {
				if (post.post_status === 'failed') {
					failedCount++;
					results.push({
						id: `social-failed-${post.id}`,
						type: 'action',
						priority: 'high',
						icon: 'i-heroicons-exclamation-circle',
						title: `Failed Post: ${(post.caption || '').substring(0, 40)}...`,
						description: `This social post failed to publish`,
						actionLabel: 'Fix & Retry',
						actionRoute: `/apps/marketing?floor=studio&view=calendar&z=3&id=${post.id}`,
						category: 'social',
						timestamp: new Date(),
						score: 65,
					});
				} else if (post.post_status === 'scheduled') {
					scheduledCount++;
				} else if (post.post_status === 'draft') {
					draftCount++;
				}
			}

			metrics.value.scheduledSocialPosts = scheduledCount;
			metrics.value.failedSocialPosts = failedCount;

			// No scheduled posts this week
			const weekFromNow = new Date();
			weekFromNow.setDate(weekFromNow.getDate() + 7);
			const upcomingScheduled = posts.filter(
				(p: any) => p.post_status === 'scheduled' && p.scheduled_at && new Date(p.scheduled_at) <= weekFromNow,
			);

			if (upcomingScheduled.length === 0 && accounts.length > 0) {
				results.push({
					id: 'social-no-upcoming',
					type: 'reminder',
					priority: 'medium',
					icon: 'i-heroicons-calendar',
					title: 'No Posts Scheduled This Week',
					description: 'Keep your audience engaged with consistent content',
					actionLabel: 'Create Post',
					actionRoute: '/social/compose',
					category: 'social',
					timestamp: new Date(),
					score: 40,
				});
			}

			if (draftCount > 0) {
				results.push({
					id: 'social-drafts',
					type: 'reminder',
					priority: 'low',
					icon: 'i-heroicons-pencil-square',
					title: `${draftCount} Draft Post${draftCount > 1 ? 's' : ''} Ready to Schedule`,
					description: 'Review and schedule your draft content',
					actionLabel: 'View Drafts',
					actionRoute: '/social/calendar',
					category: 'social',
					timestamp: new Date(),
					score: 32,
				});
			}
		} catch (e) {
			console.warn('[AI Engine] Could not analyze social:', e);
		}

		return results;
	};

	// ─── Scheduling / Appointments Analysis ───────────────────────────────────

	const analyzeScheduling = async (): Promise<TaskSuggestion[]> => {
		const results: TaskSuggestion[] = [];

		try {
			const t = today();
			const tomorrow = new Date(t);
			tomorrow.setDate(tomorrow.getDate() + 1);
			const endOfTomorrow = new Date(tomorrow);
			endOfTomorrow.setHours(23, 59, 59, 999);

			// appointments has no `organization` FK and the Client policy attached
			// to Client Manager has a null read filter — scope to the current user.
			const appointments = await appointmentItems.list({
				fields: ['id', 'title', 'start_time', 'end_time', 'status'],
				filter: {
					_and: [
						{ start_time: { _gte: t.toISOString() } },
						{ start_time: { _lte: endOfTomorrow.toISOString() } },
						{ status: { _neq: 'cancelled' } },
						{ user_created: { _eq: '$CURRENT_USER' } },
					],
				},
				sort: ['start_time'],
				limit: 20,
			});

			let upcomingCount = 0;

			for (const apt of appointments) {
				upcomingCount++;
				const startDate = new Date(apt.start_time);
				const isToday = startDate.toDateString() === t.toDateString();
				const timeStr = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

				if (isToday) {
					results.push({
						id: `appointment-${apt.id}`,
						type: 'reminder',
						priority: 'high',
						icon: 'i-heroicons-calendar-date-range',
						title: `${apt.title || 'Meeting'} at ${timeStr}`,
						description: 'Upcoming meeting today',
						actionLabel: 'View',
						actionRoute: '/scheduler',
						category: 'scheduling',
						timestamp: new Date(),
						score: calculateScore({ type: 'reminder', isToday: true }),
					});
				}
			}

			metrics.value.upcomingMeetings = upcomingCount;

			if (upcomingCount === 0) {
				// Check if user has availability set up
				results.push({
					id: 'scheduling-free-day',
					type: 'insight',
					priority: 'low',
					icon: 'i-heroicons-calendar',
					title: 'No Meetings Today',
					description: 'Great day for deep work on projects and tasks',
					actionLabel: 'View Calendar',
					actionRoute: '/scheduler',
					category: 'scheduling',
					timestamp: new Date(),
					score: 25,
				});
			}
		} catch (e) {
			console.warn('[AI Engine] Could not analyze scheduling:', e);
		}

		return results;
	};

	// ─── Phone / Activities Analysis ──────────────────────────────────────────

	const analyzePhone = async (): Promise<TaskSuggestion[]> => {
		const results: TaskSuggestion[] = [];

		try {
			// Analyze recent call logs.
			//
			// `call_logs` has no `organization` column. The Client Manager
			// read perm scopes via three OR branches:
			//   user_created._eq.$CURRENT_USER
			//   OR related_contact.client.organization._in <user orgs>
			//   OR related_lead.organization._in <user orgs>
			// We rely on that perm walk for tenant scope rather than mirroring
			// the disjunction here — adding a redundant filter would just
			// double-walk the same FK chain. This is safe because the perm
			// uses the canonical `.organizations_id` form (verified in
			// scripts/audit-tenant-row-perms.ts).
			const calls = await callLogItems.list({
				fields: ['id', 'event_type', 'call_duration', 'from_number', 'date_created', 'related_contact.id'],
				filter: {
					event_type: { _eq: 'missed' },
					status: { _eq: 'published' },
				},
				sort: ['-date_created'],
				limit: 20,
			});

			const t = today();
			let missedCount = 0;

			for (const call of calls) {
				missedCount++;
				const callDate = call.date_created ? new Date(call.date_created) : null;
				if (!callDate) continue;

				const daysAgo = Math.floor((t.getTime() - callDate.getTime()) / 86400000);
				if (daysAgo <= 7) {
					results.push({
						id: `call-missed-${call.id}`,
						type: 'followup',
						priority: daysAgo <= 1 ? 'high' : 'medium',
						icon: 'i-heroicons-phone',
						title: `Missed Call: ${call.from_number || 'Unknown'}`,
						description: daysAgo === 0 ? 'Today' : `${daysAgo} day${daysAgo > 1 ? 's' : ''} ago`,
						actionLabel: 'Call Back',
						actionRoute: '/phone-settings',
						category: 'phone',
						timestamp: new Date(),
						score: calculateScore({ type: 'action', daysOverdue: daysAgo }),
					});
				}
			}

			metrics.value.missedCalls = missedCount;
		} catch (e) {
			console.warn('[AI Engine] Could not analyze phone/call logs:', e);
		}

		return results;
	};

	// ─── Deals Analysis ───────────────────────────────────────────────────────

	const analyzeDeals = async (): Promise<TaskSuggestion[]> => {
		const results: TaskSuggestion[] = [];

		// Tenant-data safety: never query leads without an org filter. Null-org
		// leads were backfilled 2026-04-20 (scripts/backfill-null-org-leads.ts).
		// `orgFilter()` now returns `{ organization: { _in: <accessibleOrgIds> } }`
		// when no org is selected, so the multi-org admin "All Orgs" path is
		// covered. Bail only if the user has zero accessible orgs.
		if (!selectedOrg.value && accessibleOrgIds.value.length === 0) return results;

		try {
			const leads = await dealItems.list({
				fields: ['id', 'status', 'priority', 'estimated_value', 'next_follow_up', 'related_contact.id', 'source', 'notes', 'closed_date'],
				filter: {
					...orgFilter(),
					status: { _in: ['published', 'draft'] },
					converted_to_customer: { _neq: true },
				},
				sort: ['next_follow_up'],
				limit: 30,
			});

			const t = today();
			let totalPipelineValue = 0;
			let overdueFollowUpCount = 0;

			for (const lead of leads) {
				const value = Number(lead.estimated_value) || 0;
				totalPipelineValue += value;

				// Check next follow-up date
				if (lead.next_follow_up) {
					const followUpDate = new Date(lead.next_follow_up);
					const isOverdue = followUpDate < t;
					const isToday = followUpDate.toDateString() === t.toDateString();

					if (isOverdue) overdueFollowUpCount++;

					if (isOverdue) {
						const daysOver = Math.floor((t.getTime() - followUpDate.getTime()) / 86400000);
						results.push({
							id: `lead-followup-${lead.id}`,
							type: 'followup',
							priority: 'high',
							icon: 'i-heroicons-user-plus',
							title: `Follow Up on Lead #${lead.id}`,
							description: `Follow-up was due ${daysOver} day${daysOver > 1 ? 's' : ''} ago${value ? ` ($${value.toLocaleString()})` : ''}`,
							actionLabel: 'Contact Now',
							actionRoute: '/organization',
							category: 'leads',
							timestamp: new Date(),
							score: calculateScore({ type: 'action', daysOverdue: daysOver, amount: value }),
						});
					} else if (isToday) {
						results.push({
							id: `lead-contact-today-${lead.id}`,
							type: 'lead',
							priority: 'high',
							icon: 'i-heroicons-user-plus',
							title: `Follow Up Today: Lead #${lead.id}`,
							description: `${lead.source || 'Active lead'}${value ? ` - $${value.toLocaleString()}` : ''}`,
							actionLabel: 'Reach Out',
							actionRoute: '/organization',
							category: 'leads',
							timestamp: new Date(),
							score: calculateScore({ type: 'action', isToday: true, amount: value }),
						});
					}
				}

				// Stale lead check: closed_date passed but not converted
				if (lead.closed_date) {
					const closeDate = new Date(lead.closed_date);
					if (closeDate < t) {
						const daysOver = Math.floor((t.getTime() - closeDate.getTime()) / 86400000);
						if (daysOver > 7) {
							results.push({
								id: `lead-stale-${lead.id}`,
								type: 'insight',
								priority: 'medium',
								icon: 'i-heroicons-exclamation-circle',
								title: `Stale Lead #${lead.id}`,
								description: `Expected close date was ${daysOver} days ago. Update or close this lead.`,
								actionLabel: 'Review Lead',
								actionRoute: '/organization',
								category: 'leads',
								timestamp: new Date(),
								score: 48,
							});
						}
					}
				}
			}

			metrics.value.openDeals = leads.length;
			metrics.value.dealsPipelineValue = totalPipelineValue;
			metrics.value.leadsInPipeline = leads.length;
			metrics.value.overdueFollowUps = overdueFollowUpCount;

			// Fetch won/lost counts for CRM dimension
			try {
				const wonLeads = await dealItems.list({
					fields: ['id'],
					filter: { ...orgFilter(), stage: { _eq: 'won' } },
					limit: -1,
				});
				const lostLeads = await dealItems.list({
					fields: ['id'],
					filter: { ...orgFilter(), stage: { _eq: 'lost' } },
					limit: -1,
				});
				metrics.value.leadsWon = wonLeads.length;
				metrics.value.totalLeadsClosed = wonLeads.length + lostLeads.length;
			} catch {
				// Non-critical
			}
		} catch (e) {
			console.warn('[AI Engine] Could not analyze deals:', e);
		}

		return results;
	};

	// ─── CardDesk Analysis ───────────────────────────────────────────────────

	const analyzeCardDesk = async (): Promise<TaskSuggestion[]> => {
		const results: TaskSuggestion[] = [];

		try {
			const { fetchStats, stats: cdStats } = useCardDesk();
			await fetchStats();

			const s = cdStats.value;

			// Hot contacts needing follow-up
			for (const contact of s.needsFollowUp.slice(0, 3)) {
				const isHot = contact.rating === 'hot';
				results.push({
					id: `cd-followup-${contact.id}`,
					type: 'followup',
					priority: isHot ? 'high' : 'medium',
					icon: 'i-heroicons-identification',
					title: `Follow up: ${contact.name}`,
					description: `${contact.daysSinceContact}d since last contact${contact.company ? ` (${contact.company})` : ''}`,
					actionLabel: 'View Contact',
					actionRoute: '/apps/clients?view=carddesk',
					category: 'carddesk',
					timestamp: new Date(),
					score: calculateScore({ type: 'action', daysOverdue: contact.daysSinceContact }),
				});
			}

			// Streak reminder
			if (s.xp.streak > 0) {
				results.push({
					id: 'cd-streak',
					type: 'reminder',
					priority: 'low',
					icon: 'i-heroicons-fire',
					title: `${s.xp.streak}-Day Networking Streak`,
					description: 'Keep it going! Log an activity today to maintain your streak.',
					actionLabel: 'Open CardDesk',
					actionRoute: '/apps/clients?view=carddesk',
					category: 'carddesk',
					timestamp: new Date(),
					score: 35,
				});
			}

			// Cold contacts insight
			if (s.coldContacts > 5) {
				results.push({
					id: 'cd-cold-contacts',
					type: 'insight',
					priority: 'low',
					icon: 'i-heroicons-identification',
					title: `${s.coldContacts} Cold Contacts`,
					description: 'Consider re-engaging or hibernating contacts that have gone cold.',
					actionLabel: 'Review',
					actionRoute: '/apps/clients?view=carddesk',
					category: 'carddesk',
					timestamp: new Date(),
					score: 28,
				});
			}
		} catch (e) {
			console.warn('[AI Engine] Could not analyze CardDesk:', e);
		}

		return results;
	};

	// ─── Business Suggestions (time-aware coaching) ───────────────────────────

	const generateBusinessSuggestions = (): TaskSuggestion[] => {
		const results: TaskSuggestion[] = [];
		const hour = new Date().getHours();
		const dayOfWeek = new Date().getDay();

		// New-org detection — when there's no activity, time-based generic suggestions
		// ("Plan your day", "Client outreach window") feel out of place. Surface
		// onboarding suggestions instead.
		const m = metrics.value;
		const hasNoActivity =
			m.activeProjects === 0 &&
			m.pendingTasks === 0 &&
			m.tasksCompletedThisWeek === 0 &&
			m.openDeals === 0 &&
			m.leadsInPipeline === 0 &&
			m.pendingInvoiceTotal === 0 &&
			m.overdueItems === 0;

		if (hasNoActivity) {
			results.push({
				id: 'suggestion-onboard-client',
				type: 'action',
				priority: 'medium',
				icon: 'i-heroicons-user-plus',
				title: 'Add your first client',
				description: 'Start by adding the people or companies you work with. Clients anchor projects, invoices, and tickets.',
				actionLabel: 'Add Client',
				actionRoute: '/clients?new=1',
				category: 'leads',
				timestamp: new Date(),
				score: 60,
			});
			results.push({
				id: 'suggestion-onboard-project',
				type: 'action',
				priority: 'medium',
				icon: 'i-heroicons-rectangle-stack',
				title: 'Create your first project',
				description: 'Projects organize work, timelines, and deliverables. You can attach tickets, events, and invoices later.',
				actionLabel: 'New Project',
				actionRoute: '/projects?new=1',
				category: 'projects',
				timestamp: new Date(),
				score: 55,
			});
			results.push({
				id: 'suggestion-onboard-team',
				type: 'action',
				priority: 'low',
				icon: 'i-heroicons-user-group',
				title: 'Invite your team',
				description: 'Bring teammates in to collaborate on projects, tickets, and channels.',
				actionLabel: 'Invite',
				actionRoute: '/organization',
				category: 'communication',
				timestamp: new Date(),
				score: 45,
			});
			return results;
		}

		// Morning: Focus on planning
		if (hour >= 7 && hour < 10) {
			results.push({
				id: 'suggestion-morning-plan',
				type: 'insight',
				priority: 'medium',
				icon: 'i-heroicons-sun',
				title: 'Plan Your Day',
				description: 'Review your tasks and prioritize the top 3 items to complete today',
				actionLabel: 'View Tasks',
				actionRoute: '/tasks',
				category: 'tasks',
				timestamp: new Date(),
				score: 45,
			});
		}

		// Mid-morning: Client outreach
		if (hour >= 10 && hour < 12) {
			results.push({
				id: 'suggestion-outreach',
				type: 'lead',
				priority: 'medium',
				icon: 'i-heroicons-phone',
				title: 'Client Outreach Window',
				description: 'Best time to make calls and send proposals. Reach out to leads and follow up on pending deals.',
				actionLabel: 'View Contacts',
				actionRoute: '/organization',
				category: 'leads',
				timestamp: new Date(),
				score: 40,
			});
		}

		// Afternoon: Project work
		if (hour >= 13 && hour < 16) {
			results.push({
				id: 'suggestion-project-focus',
				type: 'insight',
				priority: 'low',
				icon: 'i-heroicons-square-3-stack-3d',
				title: 'Deep Work Time',
				description: 'Afternoon is ideal for focused project work. Block distractions and tackle your biggest project.',
				actionLabel: 'View Projects',
				actionRoute: '/projects',
				category: 'projects',
				timestamp: new Date(),
				score: 35,
			});
		}

		// Late afternoon: Social posting
		if (hour >= 16 && hour < 18) {
			results.push({
				id: 'suggestion-social-peak',
				type: 'insight',
				priority: 'low',
				icon: 'i-heroicons-share',
				title: 'Peak Social Engagement',
				description: 'Late afternoon is prime time for social media engagement. Schedule or post content now.',
				actionLabel: 'Compose Post',
				actionRoute: '/social/compose',
				category: 'social',
				timestamp: new Date(),
				score: 33,
			});
		}

		// Friday: Week review
		if (dayOfWeek === 5) {
			results.push({
				id: 'suggestion-weekly-review',
				type: 'insight',
				priority: 'medium',
				icon: 'i-heroicons-chart-bar',
				title: 'Weekly Review',
				description: 'End the week strong! Review completed work, send invoices, and plan for next week.',
				actionLabel: 'View Financials',
				actionRoute: '/command-center/financials',
				category: 'invoices',
				timestamp: new Date(),
				score: 50,
			});
		}

		// Monday: Week kickoff
		if (dayOfWeek === 1) {
			results.push({
				id: 'suggestion-week-start',
				type: 'insight',
				priority: 'medium',
				icon: 'i-heroicons-rocket-launch',
				title: 'Week Kickoff',
				description: 'Set your goals for the week. What are the top 3 outcomes you want to achieve?',
				actionLabel: 'View Tasks',
				actionRoute: '/tasks',
				category: 'tasks',
				timestamp: new Date(),
				score: 48,
			});
		}

		// Mid-week: Social content
		if (dayOfWeek >= 2 && dayOfWeek <= 4) {
			results.push({
				id: 'suggestion-social',
				type: 'reminder',
				priority: 'low',
				icon: 'i-heroicons-share',
				title: 'Share Your Work',
				description: 'Post an update, testimonial, or behind-the-scenes content to build your brand.',
				actionLabel: 'Compose Post',
				actionRoute: '/social/compose',
				category: 'social',
				timestamp: new Date(),
				score: 30,
			});
		}

		return results;
	};

	// ─── Productivity Score ───────────────────────────────────────────────────

	const calculateProductivityScore = (): number => {
		const m = metrics.value;
		let score = 50; // baseline

		// Positive factors
		score += Math.min(m.tasksCompletedToday * 10, 30);
		score += Math.min(m.tasksCompletedThisWeek * 2, 20);
		if (m.scheduledSocialPosts > 0) score += 5;
		if (m.activeProjects > 0 && m.overdueProjects === 0) score += 10;

		// Negative factors
		score -= Math.min(m.overdueItems * 5, 25);
		score -= Math.min(m.overdueProjects * 8, 16);
		score -= m.pendingInvoiceTotal > 10000 ? 10 : 0;
		score -= Math.min(m.failedSocialPosts * 3, 9);
		score -= Math.min(m.missedCalls * 4, 12);

		return Math.max(0, Math.min(100, score));
	};

	// ─── Concurrency limiter ─────────────────────────────────────────────────
	// Limits concurrent API calls to avoid request bursts on page load

	function createLimiter(concurrency: number) {
		let active = 0;
		const queue: Array<() => void> = [];

		return <T>(fn: () => Promise<T>): Promise<T> => {
			return new Promise<T>((resolve, reject) => {
				const run = () => {
					active++;
					fn()
						.then(resolve)
						.catch(reject)
						.finally(() => {
							active--;
							if (queue.length > 0) {
								const next = queue.shift()!;
								next();
							}
						});
				};

				if (active < concurrency) {
					run();
				} else {
					queue.push(run);
				}
			});
		};
	}

	// ─── Per-module cache (map is at module scope for cross-call persistence) ──

	function getModuleCache(module: string): TaskSuggestion[] | null {
		const entry = _moduleCache.get(module);
		if (!entry) return null;
		if (Date.now() > entry.expiresAt) {
			_moduleCache.delete(module);
			return null;
		}
		return entry.data;
	}

	function setModuleCache(module: string, data: TaskSuggestion[]): void {
		// Prevent unbounded growth — 20 modules is far more than we'll ever need
		if (_moduleCache.size > 20) _moduleCache.clear();
		_moduleCache.set(module, { data, expiresAt: Date.now() + MODULE_CACHE_TTL });
	}

	function clearCache(): void {
		_moduleCache.clear();
	}

	// Invalidate cache when org/client/team/scope changes so next analysis uses fresh data
	watch([selectedOrg, selectedClient, selectedTeam, isMine], () => {
		clearCache();
	});

	// ─── Goals Analysis ──────────────────────────────────────────────────────

	const analyzeGoals = async (): Promise<TaskSuggestion[]> => {
		const results: TaskSuggestion[] = [];

		try {
			const goals = await goalItems.list({
				fields: ['id', 'title', 'category', 'type', 'scope', 'status', 'target_value', 'target_unit', 'current_value', 'end_date', 'priority'],
				filter: {
					status: { _in: ['active', 'draft'] },
					...orgFilter(),
				},
				limit: 50,
			});

			const t = today();

			for (const goal of goals) {
				const endDate = goal.end_date ? new Date(goal.end_date) : null;
				const isOverdue = endDate && endDate < t && goal.status === 'active';
				const daysLeft = endDate ? Math.ceil((endDate.getTime() - t.getTime()) / 86400000) : null;
				const progress = goal.target_value ? Math.min(100, ((goal.current_value || 0) / goal.target_value) * 100) : 0;

				if (isOverdue) {
					const daysOver = Math.abs(daysLeft!);
					results.push({
						id: `goal-overdue-${goal.id}`,
						type: 'action',
						priority: 'urgent',
						icon: 'i-heroicons-flag',
						title: `Overdue Goal: ${goal.title}`,
						description: `${daysOver} day${daysOver > 1 ? 's' : ''} past deadline — ${Math.round(progress)}% complete`,
						actionLabel: 'Update Progress',
						actionRoute: '/goals',
						category: 'goals',
						timestamp: new Date(),
						score: calculateScore({ type: 'action', daysOverdue: daysOver }),
					});
				} else if (daysLeft !== null && daysLeft <= 7 && daysLeft >= 0 && progress < 80) {
					results.push({
						id: `goal-deadline-${goal.id}`,
						type: 'reminder',
						priority: daysLeft <= 3 ? 'high' : 'medium',
						icon: 'i-heroicons-clock',
						title: `Goal deadline in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}: ${goal.title}`,
						description: `Currently ${Math.round(progress)}% complete — needs attention`,
						actionLabel: 'Update Progress',
						actionRoute: '/goals',
						category: 'goals',
						timestamp: new Date(),
						score: calculateScore({ type: 'reminder', isToday: daysLeft === 0, isTomorrow: daysLeft === 1 }),
					});
				} else if (goal.status === 'active' && progress === 0 && goal.target_value) {
					results.push({
						id: `goal-nostart-${goal.id}`,
						type: 'insight',
						priority: 'low',
						icon: 'i-heroicons-flag',
						title: `No progress on: ${goal.title}`,
						description: `This ${goal.category || goal.type || 'custom'} goal hasn't been started yet`,
						actionLabel: 'Get Started',
						actionRoute: '/goals',
						category: 'goals',
						timestamp: new Date(),
						score: 30,
					});
				}
			}
		} catch (e) {
			console.warn('[AI Engine] Could not analyze goals:', e);
		}

		return results;
	};

	// ─── Main Analysis ────────────────────────────────────────────────────────

	const ALL_MODULES = [
		'tickets', 'projects', 'tasks', 'invoices',
		'channels', 'social', 'scheduling', 'phone', 'deals', 'carddesk', 'goals',
	] as const;

	const PRIORITY_MODULES = ['tickets', 'projects', 'tasks', 'invoices', 'channels'];
	const SECONDARY_MODULES = ['social', 'scheduling', 'phone', 'deals', 'carddesk', 'goals'];

	const analyzers: Record<string, () => Promise<TaskSuggestion[]>> = {
		tickets: analyzeTickets,
		projects: analyzeProjects,
		tasks: analyzeTasks,
		invoices: analyzeInvoices,
		channels: analyzeChannels,
		social: analyzeSocial,
		scheduling: analyzeScheduling,
		phone: analyzePhone,
		deals: analyzeDeals,
		carddesk: analyzeCardDesk,
		goals: analyzeGoals,
	};

	// Track which modules have actually been run this session so we can merge
	// later loadModule() calls into `suggestions` without dropping earlier work.
	const _runModules = new Set<string>();
	const _moduleResults = new Map<string, TaskSuggestion[]>();

	const rebuildSuggestions = () => {
		const all: TaskSuggestion[] = [];
		for (const arr of _moduleResults.values()) all.push(...arr);
		all.push(...generateBusinessSuggestions());
		// Re-derive priority from the impact score so a stale, long-overdue trifle
		// stops sitting in the "urgent" bucket just for being late.
		for (const s of all) s.priority = priorityFromScore(s.score);
		// Sort by score, then by a STABLE tiebreaker (id). Many items legitimately
		// tie at the same score (e.g. every overdue item caps at 100); without a
		// deterministic tiebreak the order among ties depends on which analyzer
		// resolved first (they run in parallel), so each refresh surfaced a
		// different — seemingly random — top 6. Ids are stable, so this fixes it.
		all.sort((a, b) => (b.score - a.score) || String(a.id).localeCompare(String(b.id)));
		suggestions.value = all;
		metrics.value.productivityScore = calculateProductivityScore();
	};

	// Shared limiter so analyze() and loadModule() compete fairly
	const sharedLimit = createLimiter(3);

	const runModule = (name: string): Promise<TaskSuggestion[]> => {
		const cached = getModuleCache(name);
		if (cached) {
			_moduleResults.set(name, cached);
			_runModules.add(name);
			return Promise.resolve(cached);
		}

		return sharedLimit(async () => {
			const results = await analyzers[name]();
			setModuleCache(name, results);
			_moduleResults.set(name, results);
			_runModules.add(name);
			return results;
		});
	};

	// Lazy-load a single module on demand (e.g. from an IntersectionObserver
	// when a deferred widget enters view). Reuses the 60s cache; merges into
	// the existing suggestions array without re-running other modules.
	const loadModule = async (name: string): Promise<void> => {
		if (!user.value) return;
		if (!analyzers[name]) return;
		await runModule(name);
		rebuildSuggestions();
	};

	const analyze = async (enabledModules?: Set<string>) => {
		// Don't make any API calls without active authentication
		if (!user.value) {
			// Never clobber a personalized greeting that already landed.
			if (greetingSource.value !== 'ai') {
				greeting.value = getGreeting();
				subtitle.value = getSubtitle();
				if (greetingSource.value === 'none') greetingSource.value = 'local';
			}
			return;
		}

		isAnalyzing.value = true;
		if (greetingSource.value !== 'ai') {
			greeting.value = getGreeting();
			subtitle.value = getSubtitle();
			if (greetingSource.value === 'none') greetingSource.value = 'local';
		}

		// Default: all modules enabled. Tickets is force-included so the
		// `metrics.value.overdueItems` / `tasksCompletedToday` side-effects
		// stay correct even when a hat would otherwise skip it.
		const modules = enabledModules ? new Set(enabledModules) : new Set<string>(ALL_MODULES);
		modules.add('tickets');

		// Reset accumulated module results for this analysis pass so a hat
		// switch doesn't keep stale suggestions from modules no longer in scope.
		_moduleResults.clear();
		_runModules.clear();

		try {
			// Run priority modules first
			const priorityTasks = PRIORITY_MODULES
				.filter((m) => modules.has(m))
				.map((m) => runModule(m));

			await Promise.all(priorityTasks);

			// Fetch AI greeting after priority modules (metrics now populated)
			fetchAIGreeting();

			// Run secondary modules (deferred, non-blocking for initial render)
			const secondaryTasks = SECONDARY_MODULES
				.filter((m) => modules.has(m))
				.map((m) => runModule(m));

			await Promise.all(secondaryTasks);

			rebuildSuggestions();
		} catch (e) {
			console.error('[AI Engine] Analysis failed:', e);
		} finally {
			isAnalyzing.value = false;
		}
	};

	return {
		suggestions: readonly(suggestions),
		metrics: readonly(metrics),
		isAnalyzing: readonly(isAnalyzing),
		greeting,
		subtitle,
		greetingSource: readonly(greetingSource),
		primeGreeting,
		analyze,
		loadModule,
	};
};
