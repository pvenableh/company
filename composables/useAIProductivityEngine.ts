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
	});
	const isAnalyzing = ref(false);
	const greeting = ref('');
	const subtitle = ref("Here's what needs your attention");

	const ticketItems = useDirectusItems('tickets');
	const invoiceItems = useDirectusItems('invoices');
	const projectItems = useDirectusItems('projects');
	const taskItems = useDirectusItems('project_tasks');
	const channelItems = useDirectusItems('channels');
	const messageItems = useDirectusItems('messages');
	const socialPostItems = useDirectusItems('social_posts');
	const socialAccountItems = useDirectusItems('social_accounts');
	const callLogItems = useDirectusItems('call_logs');
	const dealItems = useDirectusItems('leads');
	const goalItems = useDirectusItems('goals');
	const appointmentItems = useDirectusItems('appointments');
	const { user } = useDirectusAuth();
	const { selectedOrg } = useOrganization();
	const { selectedTeam } = useTeams();
	const { selectedClient, getClientFilter } = useClients();

	// Build org/team/client filter fragments for Directus queries
	const orgFilter = () => selectedOrg.value ? { organization: { _eq: selectedOrg.value } } : {};
	const clientFilter = () => getClientFilter();

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

	// Time-aware, persona-aware greeting
	const getGreeting = (): string => {
		const hour = new Date().getHours();
		const name = user.value?.first_name || 'there';
		const { activePersona } = useAIPersona();
		const persona = activePersona.value?.value || 'default';

		// Time period
		const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

		// Persona-specific greetings by time of day
		const greetings: Record<string, Record<string, string[]>> = {
			default: {
				morning: [`Good morning, ${name}`, `Rise and shine, ${name}`, `Morning, ${name} — let's make today count`],
				afternoon: [`Good afternoon, ${name}`, `Afternoon, ${name} — how's it going?`, `Hey ${name}, keeping the momentum going`],
				evening: [`Good evening, ${name}`, `Evening, ${name} — winding down?`, `Hey ${name}, finishing strong tonight`],
			},
			director: {
				morning: [`Morning, ${name}. Time to execute.`, `Let's get to work, ${name}.`, `${name}, here's your mission briefing.`],
				afternoon: [`${name}, status check. What's the priority?`, `Afternoon, ${name}. Stay focused.`, `Halfway through, ${name}. Let's push.`],
				evening: [`${name}, final push. What needs to close today?`, `Evening, ${name}. Any blockers before we wrap?`, `Let's tie up loose ends, ${name}.`],
			},
			buddy: {
				morning: [`Heyyy ${name}! Ready to crush it? ☕`, `Morning, ${name}! Let's do this 🙌`, `What's good, ${name}? New day, new wins!`],
				afternoon: [`How's your day going, ${name}?`, `${name}! Still going strong? 💪`, `Hey ${name}, need a hand with anything?`],
				evening: [`${name}! Almost done for the day 🌅`, `Hey ${name}, nice work today!`, `Wrapping up, ${name}? You earned it!`],
			},
			motivator: {
				morning: [`${name}, today is YOUR day! Let's go! 🔥`, `You showed up, ${name} — that's already a win!`, `New day, new possibilities, ${name}!`],
				afternoon: [`You're doing amazing, ${name}! Keep going! 🚀`, `${name}, look how far you've come today!`, `Halfway there and crushing it, ${name}!`],
				evening: [`${name}, what a day! Be proud of yourself! ⭐`, `You made it through, ${name} — incredible!`, `${name}, you've earned this evening. Great work!`],
			},
		};

		const pool = greetings[persona]?.[period] || greetings.default[period];
		// Pick a pseudo-random one based on the day of year so it feels fresh but stable
		const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
		return pool[dayOfYear % pool.length];
	};

	// Persona-aware subtitle for the Command Center
	const getSubtitle = (): string => {
		const { activePersona } = useAIPersona();
		const persona = activePersona.value?.value || 'default';
		const hour = new Date().getHours();
		const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

		const subtitles: Record<string, Record<string, string[]>> = {
			default: {
				morning: ["Here's what needs your attention today", 'Your priorities are lined up and ready', "Let's see what's on the radar"],
				afternoon: ["Here's where things stand right now", "Let's keep the momentum going", 'A quick look at your open items'],
				evening: ["Here's what's still on your plate", 'Wrapping up? Here are the loose ends', "Let's close out the day strong"],
			},
			director: {
				morning: ['Your daily ops briefing is ready', 'Mission priorities loaded', 'Intel report: here are the open items'],
				afternoon: ['Midday status — here are the action items', 'Time-sensitive items flagged below', 'Operational update incoming'],
				evening: ['End-of-day debrief — review the status', 'Final items requiring sign-off', "Tomorrow's blockers start here"],
			},
			buddy: {
				morning: ["Let's see what we're working with today!", "I pulled together your stuff — take a peek", "Here's your vibe check for the day"],
				afternoon: ["Here's the scoop on what's going on", "Quick update on all the things!", "Keeping you in the loop — here's what's up"],
				evening: ["Almost there! Here's what's left", "You crushed it today — just a few more things", "Winding down? Let me show you what's open"],
			},
			motivator: {
				morning: ["Every task you tackle today is a step forward!", "Your potential is unlimited — here's where to start", "Today's challenges are tomorrow's achievements!"],
				afternoon: ["You're making incredible progress!", "Look at you go — here's what's next", "Keep that energy flowing!"],
				evening: ["What a productive day — here's the final stretch!", "You've done so much today! Just a few items left", "Finish strong — you've got this!"],
			},
		};

		const pool = subtitles[persona]?.[period] || subtitles.default[period];
		const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
		// Offset by +1 so subtitle differs from greeting on the same day
		return pool[(dayOfYear + 1) % pool.length];
	};

	// Score calculation: higher = more urgent/important
	const calculateScore = (item: {
		type: string;
		daysOverdue?: number;
		amount?: number;
		isToday?: boolean;
		isTomorrow?: boolean;
	}): number => {
		let score = 50;

		if (item.daysOverdue && item.daysOverdue > 0) {
			score += Math.min(item.daysOverdue * 5, 40);
		}
		if (item.isToday) score += 20;
		if (item.isTomorrow) score += 10;
		if (item.type === 'action') score += 10;
		if (item.amount && item.amount > 1000) score += 15;

		return Math.min(score, 100);
	};

	// ─── Ticket Analysis ──────────────────────────────────────────────────────

	const analyzeTickets = async (): Promise<TaskSuggestion[]> => {
		const results: TaskSuggestion[] = [];

		try {
			const tickets = await ticketItems.list({
				fields: ['id', 'title', 'status', 'priority', 'due_date', 'assigned_to', 'organization.name'],
				filter: {
					status: { _nin: ['completed', 'archived'] },
					...orgFilter(),
					...clientFilter(),
				},
				sort: ['due_date'],
				limit: 50,
			});

			const t = today();
			let completedToday = 0;

			for (const ticket of tickets) {
				const dueDate = ticket.due_date ? new Date(ticket.due_date) : null;
				const isOverdue = dueDate && dueDate < t;
				const isDueToday = dueDate && dueDate.toDateString() === t.toDateString();
				const daysOverdue = dueDate ? Math.floor((t.getTime() - dueDate.getTime()) / 86400000) : 0;

				if (isOverdue) {
					results.push({
						id: `ticket-overdue-${ticket.id}`,
						type: 'action',
						priority: 'urgent',
						icon: 'i-heroicons-exclamation-triangle',
						title: `Overdue: ${ticket.title}`,
						description: `This ticket is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue${ticket.organization?.name ? ` for ${ticket.organization.name}` : ''}`,
						actionLabel: 'Complete Now',
						actionRoute: `/tickets/${ticket.id}`,
						category: 'tasks',
						timestamp: new Date(),
						score: calculateScore({ type: 'action', daysOverdue }),
					});
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
						timestamp: new Date(),
						score: calculateScore({ type: 'action', isToday: true }),
					});
				}
			}

			// Count completed today for metrics
			try {
				const cFilter = clientFilter();
				const completedTickets = await ticketItems.list({
					fields: ['id'],
					filter: {
						_and: [
							{ status: { _eq: 'completed' } },
							{ date_updated: { _gte: todayISO() } },
							...(selectedOrg.value ? [{ organization: { _eq: selectedOrg.value } }] : []),
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
					status: { _nin: ['completed', 'Archived'] },
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
				fields: ['id', 'title', 'status', 'due_date', 'completed', 'assignee_id.first_name', 'event_id.id'],
				filter: {
					_and: [
						{ completed: { _neq: true } },
						{ assignee_id: { _eq: '$CURRENT_USER' } },
					],
				},
				sort: ['due_date'],
				limit: 50,
			});

			const t = today();
			let pendingCount = 0;

			for (const task of tasks) {
				pendingCount++;
				const dueDate = task.due_date ? new Date(task.due_date) : null;
				const isOverdue = dueDate && dueDate < t;
				const isDueToday = dueDate && dueDate.toDateString() === t.toDateString();

				if (isOverdue) {
					const daysOver = Math.floor((t.getTime() - dueDate.getTime()) / 86400000);
					results.push({
						id: `task-overdue-${task.id}`,
						type: 'action',
						priority: 'urgent',
						icon: 'i-heroicons-clipboard-document-check',
						title: `Overdue Task: ${task.title}`,
						description: `${daysOver} day${daysOver > 1 ? 's' : ''} overdue`,
						actionLabel: 'Complete',
						actionRoute: '/tasks',
						category: 'tasks',
						timestamp: new Date(),
						score: calculateScore({ type: 'action', daysOverdue: daysOver }),
					});
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
						timestamp: new Date(),
						score: calculateScore({ type: 'action', isToday: true }),
					});
				}
			}

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
			}

			const invoices = await invoiceItems.list({
				fields: ['id', 'invoice_code', 'status', 'due_date', 'total_amount', 'bill_to.name'],
				filter: invoiceFilter,
				sort: ['due_date'],
				limit: 50,
			});

			const t = today();
			let pendingTotal = 0;

			for (const invoice of invoices) {
				const amount = Number(invoice.total_amount) || 0;
				pendingTotal += amount;

				const dueDate = invoice.due_date ? new Date(invoice.due_date) : null;
				const isOverdue = dueDate && dueDate < t;

				if (isOverdue && invoice.status === 'pending') {
					const daysOverdue = Math.floor((t.getTime() - dueDate.getTime()) / 86400000);
					results.push({
						id: `invoice-overdue-${invoice.id}`,
						type: 'action',
						priority: 'urgent',
						icon: 'i-heroicons-banknotes',
						title: `Unpaid Invoice: ${invoice.invoice_code}`,
						description: `$${amount.toLocaleString()} from ${invoice.bill_to?.name || 'Unknown'} is ${daysOverdue} days past due`,
						actionLabel: 'Follow Up',
						actionRoute: `/invoices/${invoice.id}`,
						category: 'invoices',
						timestamp: new Date(),
						score: calculateScore({ type: 'action', daysOverdue, amount }),
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

			const recentMessages = await messageItems.list({
				fields: ['id', 'channel.id', 'channel.name', 'date_created', 'user_created.id'],
				filter: {
					_and: [
						{ status: { _eq: 'published' } },
						{ date_created: { _gte: yesterday.toISOString() } },
						{ user_created: { _neq: '$CURRENT_USER' } },
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
			// Check connected accounts
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
					actionRoute: '/social/setup',
					category: 'social',
					timestamp: new Date(),
					score: 20,
				});
				return results;
			}

			// Check scheduled posts
			const posts = await socialPostItems.list({
				fields: ['id', 'post_status', 'scheduled_at', 'platforms', 'caption'],
				filter: {
					post_status: { _in: ['scheduled', 'draft', 'failed'] },
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
						actionRoute: `/social/posts/${post.id}/edit`,
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

			const appointments = await appointmentItems.list({
				fields: ['id', 'title', 'start_time', 'end_time', 'status'],
				filter: {
					_and: [
						{ start_time: { _gte: t.toISOString() } },
						{ start_time: { _lte: endOfTomorrow.toISOString() } },
						{ status: { _neq: 'cancelled' } },
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
			// Analyze recent call logs
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

		try {
			const leads = await dealItems.list({
				fields: ['id', 'status', 'priority', 'estimated_value', 'next_follow_up', 'related_contact.id', 'source', 'notes', 'closed_date'],
				filter: {
					status: { _in: ['published', 'draft'] },
					converted_to_customer: { _neq: true },
				},
				sort: ['next_follow_up'],
				limit: 30,
			});

			const t = today();
			let totalPipelineValue = 0;

			for (const lead of leads) {
				const value = Number(lead.estimated_value) || 0;
				totalPipelineValue += value;

				// Check next follow-up date
				if (lead.next_follow_up) {
					const followUpDate = new Date(lead.next_follow_up);
					const isOverdue = followUpDate < t;
					const isToday = followUpDate.toDateString() === t.toDateString();

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
					actionRoute: '/carddesk',
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
					actionRoute: '/carddesk',
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
					actionRoute: '/carddesk',
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
		_moduleCache.set(module, { data, expiresAt: Date.now() + MODULE_CACHE_TTL });
	}

	function clearCache(): void {
		_moduleCache.clear();
	}

	// Invalidate cache when org/client/team changes so next analysis uses fresh data
	watch([selectedOrg, selectedClient, selectedTeam], () => {
		clearCache();
	});

	// ─── Goals Analysis ──────────────────────────────────────────────────────

	const analyzeGoals = async (): Promise<TaskSuggestion[]> => {
		const results: TaskSuggestion[] = [];

		try {
			const goals = await goalItems.list({
				fields: ['id', 'title', 'type', 'status', 'target_value', 'target_unit', 'current_value', 'end_date', 'priority'],
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
						description: `This ${goal.type || 'custom'} goal hasn't been started yet`,
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

	const analyze = async (enabledModules?: Set<string>) => {
		// Don't make any API calls without active authentication
		if (!user.value) {
			greeting.value = getGreeting();
			subtitle.value = getSubtitle();
			return;
		}

		isAnalyzing.value = true;
		greeting.value = getGreeting();
		subtitle.value = getSubtitle();

		// Default: all modules enabled
		const modules = enabledModules || new Set([
			'tickets', 'projects', 'tasks', 'invoices',
			'channels', 'social', 'scheduling', 'phone', 'deals', 'carddesk', 'goals',
		]);

		// Priority modules run first, secondary modules deferred
		const priorityModules = ['tickets', 'projects', 'tasks', 'invoices', 'channels'];
		const secondaryModules = ['social', 'scheduling', 'phone', 'deals', 'carddesk', 'goals'];

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

		// Limit to 3 concurrent API requests
		const limit = createLimiter(3);

		try {
			const allResults: TaskSuggestion[][] = [];

			// Run with concurrency limit, using cache when available
			const runModule = (name: string) => {
				const cached = getModuleCache(name);
				if (cached) return Promise.resolve(cached);

				return limit(async () => {
					const results = await analyzers[name]();
					setModuleCache(name, results);
					return results;
				});
			};

			// Run priority modules first
			const priorityTasks = priorityModules
				.filter((m) => modules.has(m))
				.map((m) => runModule(m));

			const priorityResults = await Promise.all(priorityTasks);
			allResults.push(...priorityResults);

			// Run secondary modules (deferred, non-blocking for initial render)
			const secondaryTasks = secondaryModules
				.filter((m) => modules.has(m))
				.map((m) => runModule(m));

			const secondaryResults = await Promise.all(secondaryTasks);
			allResults.push(...secondaryResults);

			const businessSuggestions = generateBusinessSuggestions();

			// Merge and sort by score (highest first)
			const all = [...allResults.flat(), ...businessSuggestions];
			all.sort((a, b) => b.score - a.score);

			suggestions.value = all;
			metrics.value.productivityScore = calculateProductivityScore();
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
		analyze,
	};
};
