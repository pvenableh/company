// composables/useAIProductivityEngine.ts
// Smart productivity engine that analyzes user data and generates
// prioritized action items, suggestions, and insights.

interface TaskSuggestion {
	id: string;
	type: 'action' | 'reminder' | 'insight' | 'lead' | 'followup';
	priority: 'urgent' | 'high' | 'medium' | 'low';
	icon: string;
	title: string;
	description: string;
	actionLabel: string;
	actionRoute?: string;
	actionFn?: () => void;
	category: 'tasks' | 'invoices' | 'projects' | 'communication' | 'leads' | 'scheduling';
	timestamp: Date;
	score: number;
}

interface ProductivityMetrics {
	tasksCompletedToday: number;
	tasksCompletedThisWeek: number;
	overdueItems: number;
	pendingInvoiceTotal: number;
	upcomingMeetings: number;
	unreadMessages: number;
	productivityScore: number;
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
	});
	const isAnalyzing = ref(false);
	const greeting = ref('');

	const ticketItems = useDirectusItems('tickets');
	const invoiceItems = useDirectusItems('invoices');
	const { user } = useDirectusAuth();

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
	}): number => {
		let score = 50;

		if (item.daysOverdue && item.daysOverdue > 0) {
			score += Math.min(item.daysOverdue * 5, 40);
		}
		if (item.isToday) score += 20;
		if (item.type === 'action') score += 10;
		if (item.amount && item.amount > 1000) score += 15;

		return Math.min(score, 100);
	};

	// Analyze tickets/tasks and generate suggestions
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

			const today = new Date();
			today.setHours(0, 0, 0, 0);

			for (const ticket of tickets) {
				const dueDate = ticket.due_date ? new Date(ticket.due_date) : null;
				const isOverdue = dueDate && dueDate < today;
				const isDueToday = dueDate && dueDate.toDateString() === today.toDateString();
				const daysOverdue = dueDate ? Math.floor((today.getTime() - dueDate.getTime()) / 86400000) : 0;

				if (isOverdue) {
					results.push({
						id: `ticket-overdue-${ticket.id}`,
						type: 'action',
						priority: 'urgent',
						icon: 'i-heroicons-exclamation-triangle',
						title: `Overdue: ${ticket.title}`,
						description: `This task is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue${ticket.organization?.name ? ` for ${ticket.organization.name}` : ''}`,
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
						description: `This task needs to be completed today`,
						actionLabel: 'Work on it',
						actionRoute: `/tickets/${ticket.id}`,
						category: 'tasks',
						timestamp: new Date(),
						score: calculateScore({ type: 'action', isToday: true }),
					});
				}
			}

			// Metric: overdue count
			metrics.value.overdueItems = results.filter((r) => r.priority === 'urgent').length;
		} catch (e) {
			console.warn('[AI Engine] Could not analyze tickets:', e);
		}

		return results;
	};

	// Analyze invoices and generate financial suggestions
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

			const today = new Date();
			let pendingTotal = 0;

			for (const invoice of invoices) {
				const amount = Number(invoice.total_amount) || 0;
				pendingTotal += amount;

				const dueDate = invoice.due_date ? new Date(invoice.due_date) : null;
				const isOverdue = dueDate && dueDate < today;

				if (isOverdue && invoice.status === 'pending') {
					const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
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

	// Generate proactive business suggestions
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

		// Social media reminder (mid-week)
		if (dayOfWeek >= 2 && dayOfWeek <= 4) {
			results.push({
				id: 'suggestion-social',
				type: 'reminder',
				priority: 'low',
				icon: 'i-heroicons-share',
				title: 'Share Your Work',
				description: 'Post an update, testimonial, or behind-the-scenes content to build your brand and generate leads.',
				actionLabel: 'Compose Post',
				actionRoute: '/social/compose',
				category: 'leads',
				timestamp: new Date(),
				score: 30,
			});
		}

		return results;
	};

	// Calculate productivity score (0-100)
	const calculateProductivityScore = (): number => {
		const m = metrics.value;
		let score = 50; // baseline

		// Positive factors
		score += Math.min(m.tasksCompletedToday * 10, 30);
		score += Math.min(m.tasksCompletedThisWeek * 2, 20);

		// Negative factors
		score -= Math.min(m.overdueItems * 5, 25);
		score -= m.pendingInvoiceTotal > 10000 ? 10 : 0;

		return Math.max(0, Math.min(100, score));
	};

	// Main analysis function
	const analyze = async () => {
		isAnalyzing.value = true;
		greeting.value = getGreeting();

		try {
			const [ticketSuggestions, invoiceSuggestions] = await Promise.all([
				analyzeTickets(),
				analyzeInvoices(),
			]);

			const businessSuggestions = generateBusinessSuggestions();

			// Merge and sort by score (highest first)
			const all = [...ticketSuggestions, ...invoiceSuggestions, ...businessSuggestions];
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
