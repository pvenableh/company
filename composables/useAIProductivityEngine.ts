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
		| 'phone';
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

	const ticketItems = useDirectusItems('tickets');
	const invoiceItems = useDirectusItems('invoices');
	const projectItems = useDirectusItems('os_projects');
	const taskItems = useDirectusItems('os_tasks');
	const channelItems = useDirectusItems('channels');
	const messageItems = useDirectusItems('messages');
	const socialPostItems = useDirectusItems('social_posts');
	const socialAccountItems = useDirectusItems('social_accounts');
	const activityItems = useDirectusItems('os_activities');
	const dealItems = useDirectusItems('os_deals');
	const appointmentItems = useDirectusItems('appointments');
	const { user } = useDirectusAuth();

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

	// Time-aware greeting
	const getGreeting = (): string => {
		const hour = new Date().getHours();
		const name = user.value?.first_name || 'there';
		if (hour < 12) return `Good morning, ${name}`;
		if (hour < 17) return `Good afternoon, ${name}`;
		return `Good evening, ${name}`;
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
				const completedTickets = await ticketItems.list({
					fields: ['id'],
					filter: {
						_and: [
							{ status: { _eq: 'completed' } },
							{ date_updated: { _gte: todayISO() } },
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
				fields: ['id', 'name', 'status', 'due_date', 'start_date', 'organization.name', 'owner.first_name'],
				filter: {
					status: { _nin: ['completed', 'archived', 'cancelled'] },
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
						title: `Project Overdue: ${project.name}`,
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
						title: `Project Due ${daysLeft === 0 ? 'Today' : `in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`}: ${project.name}`,
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
				fields: ['id', 'name', 'status', 'due_date', 'assigned_to.first_name', 'project.name', 'project.id'],
				filter: {
					_and: [
						{ status: { _neq: 'completed' } },
						{ assigned_to: { _eq: '$CURRENT_USER' } },
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
						title: `Overdue Task: ${task.name}`,
						description: `${daysOver} day${daysOver > 1 ? 's' : ''} overdue${task.project?.name ? ` on ${task.project.name}` : ''}`,
						actionLabel: 'Complete',
						actionRoute: task.project?.id ? `/projects/${task.project.id}` : '/tasks',
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
						title: `Task Due Today: ${task.name}`,
						description: task.project?.name ? `Part of ${task.project.name}` : 'Complete before end of day',
						actionLabel: 'Do It',
						actionRoute: task.project?.id ? `/projects/${task.project.id}` : '/tasks',
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
			const invoices = await invoiceItems.list({
				fields: ['id', 'invoice_code', 'status', 'due_date', 'total_amount', 'bill_to.name'],
				filter: {
					status: { _in: ['pending', 'processing'] },
				},
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
				filter: { status: { _eq: 'published' } },
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
				filter: { status: { _eq: 'active' } },
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
				fields: ['id', 'status', 'scheduled_at', 'platform', 'caption'],
				filter: {
					status: { _in: ['scheduled', 'draft', 'failed'] },
				},
				sort: ['scheduled_at'],
				limit: 50,
			});

			let scheduledCount = 0;
			let failedCount = 0;
			let draftCount = 0;

			for (const post of posts) {
				if (post.status === 'failed') {
					failedCount++;
					results.push({
						id: `social-failed-${post.id}`,
						type: 'action',
						priority: 'high',
						icon: 'i-heroicons-exclamation-circle',
						title: `Failed Post: ${(post.caption || '').substring(0, 40)}...`,
						description: `This ${post.platform || 'social'} post failed to publish`,
						actionLabel: 'Fix & Retry',
						actionRoute: `/social/posts/${post.id}/edit`,
						category: 'social',
						timestamp: new Date(),
						score: 65,
					});
				} else if (post.status === 'scheduled') {
					scheduledCount++;
				} else if (post.status === 'draft') {
					draftCount++;
				}
			}

			metrics.value.scheduledSocialPosts = scheduledCount;
			metrics.value.failedSocialPosts = failedCount;

			// No scheduled posts this week
			const weekFromNow = new Date();
			weekFromNow.setDate(weekFromNow.getDate() + 7);
			const upcomingScheduled = posts.filter(
				(p: any) => p.status === 'scheduled' && p.scheduled_at && new Date(p.scheduled_at) <= weekFromNow,
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
			// Analyze recent activities (calls, follow-ups)
			const activities = await activityItems.list({
				fields: ['id', 'name', 'activity_type', 'due_date', 'status', 'deal.name', 'contacts.contacts_id.first_name', 'contacts.contacts_id.last_name'],
				filter: {
					_and: [
						{ status: { _neq: 'completed' } },
						{ assigned_to: { _eq: '$CURRENT_USER' } },
					],
				},
				sort: ['due_date'],
				limit: 30,
			});

			const t = today();
			let missedCount = 0;

			for (const activity of activities) {
				const dueDate = activity.due_date ? new Date(activity.due_date) : null;
				const isOverdue = dueDate && dueDate < t;
				const isDueToday = dueDate && dueDate.toDateString() === t.toDateString();
				const isCall = activity.activity_type === 'call' || activity.activity_type === 'phone';

				if (isOverdue) {
					if (isCall) missedCount++;
					const daysOver = Math.floor((t.getTime() - dueDate!.getTime()) / 86400000);
					results.push({
						id: `activity-overdue-${activity.id}`,
						type: 'followup',
						priority: isCall ? 'high' : 'medium',
						icon: isCall ? 'i-heroicons-phone' : 'i-heroicons-arrow-uturn-right',
						title: `Overdue ${activity.activity_type || 'Activity'}: ${activity.name}`,
						description: `${daysOver} day${daysOver > 1 ? 's' : ''} overdue${activity.deal?.name ? ` (${activity.deal.name})` : ''}`,
						actionLabel: isCall ? 'Call Now' : 'Follow Up',
						actionRoute: '/phone-settings',
						category: 'phone',
						timestamp: new Date(),
						score: calculateScore({ type: 'action', daysOverdue: daysOver }),
					});
				} else if (isDueToday) {
					results.push({
						id: `activity-today-${activity.id}`,
						type: 'reminder',
						priority: 'high',
						icon: isCall ? 'i-heroicons-phone' : 'i-heroicons-arrow-uturn-right',
						title: `${activity.activity_type || 'Activity'} Due Today: ${activity.name}`,
						description: activity.deal?.name ? `Related to deal: ${activity.deal.name}` : 'Scheduled for today',
						actionLabel: isCall ? 'Make Call' : 'Do It',
						actionRoute: '/phone-settings',
						category: 'phone',
						timestamp: new Date(),
						score: calculateScore({ type: 'action', isToday: true }),
					});
				}
			}

			metrics.value.missedCalls = missedCount;
		} catch (e) {
			console.warn('[AI Engine] Could not analyze phone/activities:', e);
		}

		return results;
	};

	// ─── Deals Analysis ───────────────────────────────────────────────────────

	const analyzeDeals = async (): Promise<TaskSuggestion[]> => {
		const results: TaskSuggestion[] = [];

		try {
			const deals = await dealItems.list({
				fields: ['id', 'name', 'status', 'deal_value', 'close_date', 'next_contact_date', 'deal_stage.name', 'organization.name'],
				filter: {
					status: { _in: ['open', 'active', 'published'] },
				},
				sort: ['close_date'],
				limit: 30,
			});

			const t = today();
			let totalPipelineValue = 0;

			for (const deal of deals) {
				const value = Number(deal.deal_value) || 0;
				totalPipelineValue += value;

				// Check next contact date
				if (deal.next_contact_date) {
					const contactDate = new Date(deal.next_contact_date);
					const isOverdue = contactDate < t;
					const isToday = contactDate.toDateString() === t.toDateString();

					if (isOverdue) {
						const daysOver = Math.floor((t.getTime() - contactDate.getTime()) / 86400000);
						results.push({
							id: `deal-followup-${deal.id}`,
							type: 'followup',
							priority: 'high',
							icon: 'i-heroicons-user-plus',
							title: `Follow Up: ${deal.name}`,
							description: `Contact was due ${daysOver} day${daysOver > 1 ? 's' : ''} ago${value ? ` ($${value.toLocaleString()})` : ''}`,
							actionLabel: 'Contact Now',
							actionRoute: '/organization',
							category: 'leads',
							timestamp: new Date(),
							score: calculateScore({ type: 'action', daysOverdue: daysOver, amount: value }),
						});
					} else if (isToday) {
						results.push({
							id: `deal-contact-today-${deal.id}`,
							type: 'lead',
							priority: 'high',
							icon: 'i-heroicons-user-plus',
							title: `Contact Today: ${deal.name}`,
							description: `${deal.deal_stage?.name || 'Active deal'}${value ? ` - $${value.toLocaleString()}` : ''}`,
							actionLabel: 'Reach Out',
							actionRoute: '/organization',
							category: 'leads',
							timestamp: new Date(),
							score: calculateScore({ type: 'action', isToday: true, amount: value }),
						});
					}
				}

				// Stale deal check: close date passed
				if (deal.close_date) {
					const closeDate = new Date(deal.close_date);
					if (closeDate < t) {
						const daysOver = Math.floor((t.getTime() - closeDate.getTime()) / 86400000);
						if (daysOver > 7) {
							results.push({
								id: `deal-stale-${deal.id}`,
								type: 'insight',
								priority: 'medium',
								icon: 'i-heroicons-exclamation-circle',
								title: `Stale Deal: ${deal.name}`,
								description: `Expected close date was ${daysOver} days ago. Update or close this deal.`,
								actionLabel: 'Review Deal',
								actionRoute: '/organization',
								category: 'leads',
								timestamp: new Date(),
								score: 48,
							});
						}
					}
				}
			}

			metrics.value.openDeals = deals.length;
			metrics.value.dealsPipelineValue = totalPipelineValue;
		} catch (e) {
			console.warn('[AI Engine] Could not analyze deals:', e);
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

	// ─── Main Analysis ────────────────────────────────────────────────────────

	const analyze = async (enabledModules?: Set<string>) => {
		isAnalyzing.value = true;
		greeting.value = getGreeting();

		// Default: all modules enabled
		const modules = enabledModules || new Set([
			'tickets', 'projects', 'tasks', 'invoices',
			'channels', 'social', 'scheduling', 'phone', 'deals',
		]);

		try {
			const analyzerPromises: Promise<TaskSuggestion[]>[] = [];

			if (modules.has('tickets')) analyzerPromises.push(analyzeTickets());
			if (modules.has('projects')) analyzerPromises.push(analyzeProjects());
			if (modules.has('tasks')) analyzerPromises.push(analyzeTasks());
			if (modules.has('invoices')) analyzerPromises.push(analyzeInvoices());
			if (modules.has('channels')) analyzerPromises.push(analyzeChannels());
			if (modules.has('social')) analyzerPromises.push(analyzeSocial());
			if (modules.has('scheduling')) analyzerPromises.push(analyzeScheduling());
			if (modules.has('phone')) analyzerPromises.push(analyzePhone());
			if (modules.has('deals')) analyzerPromises.push(analyzeDeals());

			const allResults = await Promise.all(analyzerPromises);
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
		analyze,
	};
};
