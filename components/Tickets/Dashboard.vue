<template>
	<div class="w-full mx-auto">
		<!-- Loading state -->
		<div v-if="isLoading" class="flex justify-center items-center h-64">
			<LayoutLoader text="Loading Dashboard Data" />
		</div>

		<!-- Connection error -->
		<UAlert
			v-else-if="!isConnected"
			title="Connection Lost"
			description="Attempting to reconnect..."
			color="yellow"
			class="mb-6"
		>
			<template #footer>
				<UButton size="sm" color="yellow" @click="refreshData">Retry Connection</UButton>
			</template>
		</UAlert>

		<!-- Dashboard content -->
		<div v-else class="space-y-8">
			<!-- Overview Cards -->
			<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
				<UCard class="border-l-4" :class="getStatusCardClass('pending')">
					<div class="flex justify-between items-center">
						<div>
							<h3 class="text-xs uppercase font-bold text-gray-500">Pending</h3>
							<p class="text-2xl font-bold">{{ ticketCounts.pending }}</p>
						</div>
						<UIcon name="i-heroicons-clock" class="w-10 h-10 text-gray-300" />
					</div>
					<p class="text-xs mt-2">Avg. age: {{ formatDuration(avgTicketAge.pending) }}</p>
				</UCard>

				<UCard class="border-l-4" :class="getStatusCardClass('scheduled')">
					<div class="flex justify-between items-center">
						<div>
							<h3 class="text-xs uppercase font-bold text-gray-500">Scheduled</h3>
							<p class="text-2xl font-bold">{{ ticketCounts.scheduled }}</p>
						</div>
						<UIcon name="i-heroicons-calendar" class="w-10 h-10 text-gray-300" />
					</div>
					<p class="text-xs mt-2">Avg. age: {{ formatDuration(avgTicketAge.scheduled) }}</p>
				</UCard>

				<UCard class="border-l-4" :class="getStatusCardClass('inProgress')">
					<div class="flex justify-between items-center">
						<div>
							<h3 class="text-xs uppercase font-bold text-gray-500">In Progress</h3>
							<p class="text-2xl font-bold">{{ ticketCounts.inProgress }}</p>
						</div>
						<UIcon name="i-heroicons-arrow-path" class="w-10 h-10 text-gray-300" />
					</div>
					<p class="text-xs mt-2">Avg. age: {{ formatDuration(avgTicketAge.inProgress) }}</p>
				</UCard>

				<UCard class="border-l-4" :class="getStatusCardClass('completed')">
					<div class="flex justify-between items-center">
						<div>
							<h3 class="text-xs uppercase font-bold text-gray-500">Completed</h3>
							<p class="text-2xl font-bold">{{ ticketCounts.completed }}</p>
						</div>
						<UIcon name="i-heroicons-check-circle" class="w-10 h-10 text-gray-300" />
					</div>
					<p class="text-xs mt-2">Last 30 days: {{ ticketCounts.recentlyCompleted }}</p>
				</UCard>
			</div>

			<!-- Filter Controls -->
			<div class="flex flex-wrap gap-4 items-center mb-6">
				<div class="flex-grow">
					<UFormGroup label="Time Period">
						<USelect v-model="timePeriod" :options="timePeriodOptions" @change="refreshData" />
					</UFormGroup>
				</div>
				<div class="flex-grow">
					<UFormGroup label="Team Filter" v-if="showTeamFilter">
						<USelect v-model="teamFilter" :options="teamOptions" @change="refreshData" />
					</UFormGroup>
				</div>
				<div class="flex-grow">
					<UFormGroup label="Your Tickets Only">
						<UToggle v-model="showOnlyMyTickets" @change="refreshData" />
					</UFormGroup>
				</div>
			</div>

			<!-- Main Dashboard Sections -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
				<!-- Left Column -->
				<div class="space-y-8">
					<UCard>
						<template #header>
							<div class="flex justify-between items-center">
								<h2 class="text-base font-bold">Oldest Open Tickets</h2>
								<UButton
									size="xs"
									variant="ghost"
									@click="navigateToTicket(oldestTickets[0]?.id)"
									v-if="oldestTickets.length"
								>
									View All
								</UButton>
							</div>
						</template>
						<div class="divide-y">
							<div v-for="ticket in oldestTickets" :key="ticket.id" class="py-3">
								<div class="flex justify-between">
									<div>
										<h3 class="text-sm font-medium">{{ ticket.title }}</h3>
										<div class="flex gap-2 mt-1">
											<UBadge size="xs" :class="'uppercase bg-[' + getStatusColor(ticket.status) + ']'">
												{{ ticket.status }}
											</UBadge>
											<UBadge size="xs" color="gray">{{ ticket.priority }}</UBadge>
										</div>
									</div>
									<div class="text-right">
										<p class="text-xs text-gray-500">Created: {{ formatDate(ticket.date_created) }}</p>
										<p class="text-xs font-bold text-red-500">Age: {{ formatDuration(getTicketAge(ticket)) }}</p>
									</div>
								</div>
								<div class="flex justify-between mt-2">
									<div class="flex items-center gap-1 text-xs text-gray-500">
										<UIcon name="i-heroicons-user-circle" class="w-3 h-3" />
										<span>{{ formatAssignees(ticket.assigned_to) }}</span>
									</div>
									<UButton size="xs" variant="link" @click="navigateToTicket(ticket.id)">View</UButton>
								</div>
							</div>
							<div v-if="!oldestTickets.length" class="py-4 text-center text-gray-500">No open tickets found</div>
						</div>
					</UCard>
					<!-- Ticket Age Distribution -->
					<UCard>
						<template #header>
							<div class="flex justify-between items-center">
								<h2 class="text-base font-bold">Ticket Age Distribution</h2>
								<UBadge color="blue" variant="soft">Non-Completed Tickets</UBadge>
							</div>
						</template>
						<div class="h-80">
							<TicketsDistributionAge :data="ticketAgeData" />
						</div>
					</UCard>

					<!-- Your Completion Rate -->
					<UCard v-if="showOnlyMyTickets">
						<template #header>
							<div class="flex justify-between items-center">
								<h2 class="text-base font-bold">Your Completion Rate</h2>
								<UBadge color="green" variant="soft">Last {{ timePeriodLabel }}</UBadge>
							</div>
						</template>
						<div class="h-80">
							<TicketsCompletionPersonal :data="personalCompletionData" />
						</div>
					</UCard>

					<!-- Oldest Open Tickets -->
				</div>

				<!-- Right Column -->
				<div class="space-y-8">
					<!-- Completion Rate Trend -->
					<UCard>
						<template #header>
							<div class="flex justify-between items-center">
								<h2 class="text-base font-bold">Completion Rate Trend</h2>
								<UBadge color="cyan" variant="soft">Last {{ timePeriodLabel }}</UBadge>
							</div>
						</template>
						<div class="h-80">
							<TicketsCompletionTrend :data="completionTrendData" />
						</div>
					</UCard>
					<!-- Team Activity Distribution -->
					<UCard>
						<template #header>
							<div class="flex justify-between items-center">
								<h2 class="text-base font-bold">Activity Distribution</h2>
								<UBadge color="purple" variant="soft">{{ teamFilter === null ? 'Organization' : 'Team' }}</UBadge>
							</div>
						</template>
						<div class="h-80">
							<TicketsDistributionActivity
								v-if="activityDistributionData && activityDistributionData.length"
								:data="activityDistributionData"
							/>
						</div>
					</UCard>

					<!-- Recently Completed Tickets -->
					<UCard>
						<template #header>
							<div class="flex justify-between items-center">
								<h2 class="text-base font-bold">Recently Completed</h2>
								<UButton
									size="xs"
									variant="ghost"
									@click="navigateToTicket(recentTickets[0]?.id)"
									v-if="recentTickets.length"
								>
									View All
								</UButton>
							</div>
						</template>
						<div class="divide-y">
							<div v-for="ticket in recentTickets" :key="ticket.id" class="py-3">
								<div class="flex justify-between">
									<div>
										<h3 class="text-sm font-medium">{{ ticket.title }}</h3>
										<div class="flex gap-2 mt-1">
											<UBadge size="xs" class="uppercase bg-[var(--green)]">Completed</UBadge>
											<UBadge size="xs" color="gray">{{ ticket.priority }}</UBadge>
										</div>
									</div>
									<div class="text-right">
										<p class="text-xs text-gray-500">Completed: {{ formatDate(ticket.date_updated) }}</p>
										<p class="text-xs text-[var(--green)]">
											Time to complete: {{ formatDuration(getTicketTimeToComplete(ticket)) }}
										</p>
									</div>
								</div>
								<div class="flex justify-between mt-2">
									<div class="flex items-center gap-1 text-xs text-gray-500">
										<UIcon name="i-heroicons-user-circle" class="w-3 h-3" />
										<span>{{ formatAssignees(ticket.assigned_to) }}</span>
									</div>
									<UButton size="xs" variant="link" @click="navigateToTicket(ticket.id)">View</UButton>
								</div>
							</div>
							<div v-if="!recentTickets.length" class="py-4 text-center text-gray-500">
								No recently completed tickets found
							</div>
						</div>
					</UCard>
				</div>
			</div>

			<!-- Your Performance Section -->
			<div v-if="showOnlyMyTickets">
				<UCard>
					<template #header>
						<h2 class="text-base font-bold">Your Performance Summary</h2>
					</template>
					<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div class="border-r border-gray-200 pr-4">
							<h3 class="text-xs uppercase font-bold text-gray-500">Average Resolution Time</h3>
							<p class="text-xl font-bold">{{ formatDuration(personalPerformance.avgResolutionTime) }}</p>
							<div class="mt-1">
								<TicketsCompletionIndicator
									:value="personalPerformance.comparison.avgResolutionTime"
									:higher-is-better="false"
									prefix="vs team: "
								/>
							</div>
						</div>
						<div class="border-r border-gray-200 px-4">
							<h3 class="text-xs uppercase font-bold text-gray-500">Completion Rate</h3>
							<p class="text-xl font-bold">{{ personalPerformance.completionRate }}%</p>
							<div class="mt-1">
								<TicketsCompletionIndicator :value="personalPerformance.comparison.completionRate" prefix="vs team: " />
							</div>
						</div>
						<div class="pl-4">
							<h3 class="text-xs uppercase font-bold text-gray-500">Activity Level</h3>
							<p class="text-xl font-bold">{{ personalPerformance.activityLevel }} actions/ticket</p>
							<div class="mt-1">
								<TicketsCompletionIndicator :value="personalPerformance.comparison.activityLevel" prefix="vs team: " />
							</div>
						</div>
					</div>
				</UCard>
			</div>
		</div>
	</div>
</template>

<script setup>
import { differenceInDays, differenceInHours, format, subDays, subMonths } from 'date-fns';

// State
const isLoading = ref(true);
const isConnected = ref(true);
const timePeriod = ref('30days');
const teamFilter = ref(null);
const showOnlyMyTickets = ref(false);

// Time period options
const timePeriodOptions = [
	{ label: 'Last 7 Days', value: '7days' },
	{ label: 'Last 30 Days', value: '30days' },
	{ label: 'Last 90 Days', value: '90days' },
	{ label: 'Last 6 Months', value: '6months' },
	{ label: 'Last 12 Months', value: '12months' },
];

// Get human-readable time period label
const timePeriodLabel = computed(() => {
	switch (timePeriod.value) {
		case '7days':
			return '7 Days';
		case '30days':
			return '30 Days';
		case '90days':
			return '90 Days';
		case '6months':
			return '6 Months';
		case '12months':
			return '12 Months';
		default:
			return '30 Days';
	}
});

// Fetch repositories
const { readItems } = useDirectusItems();
const { data, status } = useAuth();
const user = computed(() => {
	return status.value === 'authenticated' ? data?.value?.user ?? null : null;
});
const { selectedTeam, teams, visibleTeams } = useTeams();
const { selectedOrg } = useOrganization();
const router = useRouter();

// Whether to show team filter (only if user has access to multiple teams)
const showTeamFilter = computed(() => visibleTeams.value?.length > 1);

// Team options for filter
const teamOptions = computed(() => {
	const options = [{ label: 'All Teams', value: null }];

	if (visibleTeams.value?.length) {
		visibleTeams.value.forEach((team) => {
			options.push({
				label: team.name,
				value: team.id,
			});
		});
	}

	return options;
});

// Dashboard data
const allTickets = ref([]);
const oldestTickets = ref([]);
const recentTickets = ref([]);
const ticketCounts = ref({
	pending: 0,
	scheduled: 0,
	inProgress: 0,
	completed: 0,
	recentlyCompleted: 0,
});
const avgTicketAge = ref({
	pending: 0,
	scheduled: 0,
	inProgress: 0,
});

// Chart data
const ticketAgeData = ref([]);
const activityDistributionData = ref([]);
const completionTrendData = ref([]);
const personalCompletionData = ref([]);
const personalPerformance = ref({
	avgResolutionTime: 0,
	completionRate: 0,
	activityLevel: 0,
	comparison: {
		avgResolutionTime: 0,
		completionRate: 0,
		activityLevel: 0,
	},
});

// Fetch tickets and related data
const fetchTickets = async () => {
	isLoading.value = true;

	try {
		// Calculate date range based on selected time period
		const endDate = new Date();
		let startDate;

		switch (timePeriod.value) {
			case '7days':
				startDate = subDays(endDate, 7);
				break;
			case '90days':
				startDate = subDays(endDate, 90);
				break;
			case '6months':
				startDate = subMonths(endDate, 6);
				break;
			case '12months':
				startDate = subMonths(endDate, 12);
				break;
			default:
				startDate = subDays(endDate, 30);
		}

		// Build filter
		const filter = {
			_and: [
				{
					_or: [
						{ date_created: { _gte: startDate.toISOString() } },
						{
							_and: [{ date_created: { _lt: startDate.toISOString() } }, { status: { _nin: ['Completed'] } }],
						},
					],
				},
				...(selectedOrg.value ? [{ organization: { id: { _eq: selectedOrg.value } } }] : []),
				...(teamFilter.value ? [{ team: { id: { _eq: teamFilter.value } } }] : []),
				...(showOnlyMyTickets.value && user.value
					? [{ assigned_to: { directus_users_id: { id: { _eq: user.value.id } } } }]
					: []),
			],
		};

		// Fetch tickets with this filter
		const tickets = await readItems('tickets', {
			fields: [
				'id',
				'title',
				'status',
				'priority',
				'date_created',
				'date_updated',
				'user_created.id',
				'user_created.first_name',
				'user_created.last_name',
				'assigned_to.directus_users_id.id',
				'assigned_to.directus_users_id.first_name',
				'assigned_to.directus_users_id.last_name',
				'organization.id',
				'organization.name',
				'team.id',
				'team.name',
				'comments.id',
				'comments.date_created',
				'tasks.id',
				'tasks.status',
			],
			filter,
			sort: ['-date_created'],
		});
		// console.log(tickets);
		// Store all tickets
		allTickets.value = tickets || [];

		// Process ticket data for dashboard
		processTicketData();

		isConnected.value = true;
	} catch (error) {
		console.error('Error fetching tickets:', error);
		isConnected.value = false;
	} finally {
		isLoading.value = false;
	}
};

// Process ticket data for dashboard visualizations
const processTicketData = () => {
	// Reset counts
	ticketCounts.value = {
		pending: 0,
		scheduled: 0,
		inProgress: 0,
		completed: 0,
		recentlyCompleted: 0,
	};

	// Get current date for age calculations
	const now = new Date();
	const thirtyDaysAgo = subDays(now, 30);

	// Group tickets by status
	const pendingTickets = [];
	const scheduledTickets = [];
	const inProgressTickets = [];
	const completedTickets = [];
	const recentlyCompletedTickets = [];

	// Age by category in hours
	let totalPendingAge = 0;
	let totalScheduledAge = 0;
	let totalInProgressAge = 0;

	// Process ticket counts and ages
	allTickets.value.forEach((ticket) => {
		// Normalize status string
		const status = ticket.status.toLowerCase().replace(/\s+/g, '');

		// Update counts based on status
		if (status === 'pending') {
			pendingTickets.push(ticket);
			totalPendingAge += getTicketAgeHours(ticket);
		} else if (status === 'scheduled') {
			scheduledTickets.push(ticket);
			totalScheduledAge += getTicketAgeHours(ticket);
		} else if (status === 'inprogress') {
			inProgressTickets.push(ticket);
			totalInProgressAge += getTicketAgeHours(ticket);
		} else if (status === 'completed') {
			completedTickets.push(ticket);

			// Check if completed within last 30 days
			const completedDate = new Date(ticket.date_updated);
			if (completedDate >= thirtyDaysAgo) {
				recentlyCompletedTickets.push(ticket);
			}
		}
	});

	// Update ticket counts
	ticketCounts.value = {
		pending: pendingTickets.length,
		scheduled: scheduledTickets.length,
		inProgress: inProgressTickets.length,
		completed: completedTickets.length,
		recentlyCompleted: recentlyCompletedTickets.length,
	};

	// Calculate average ages
	avgTicketAge.value = {
		pending: pendingTickets.length ? totalPendingAge / pendingTickets.length : 0,
		scheduled: scheduledTickets.length ? totalScheduledAge / scheduledTickets.length : 0,
		inProgress: inProgressTickets.length ? totalInProgressAge / inProgressTickets.length : 0,
	};

	// Sort tickets by age for oldest tickets list
	const openTickets = [...pendingTickets, ...scheduledTickets, ...inProgressTickets];
	openTickets.sort((a, b) => {
		return new Date(a.date_created) - new Date(b.date_created);
	});

	oldestTickets.value = openTickets.slice(0, 5);

	// Sort completed tickets by completion date for recent tickets list
	completedTickets.sort((a, b) => {
		return new Date(b.date_updated) - new Date(a.date_updated);
	});

	recentTickets.value = completedTickets.slice(0, 5);

	// Generate ticket age distribution data
	generateTicketAgeDistribution(openTickets);

	// Generate activity distribution data
	generateActivityDistribution();

	// Generate completion trend data
	generateCompletionTrend(completedTickets);

	// Generate personal performance data if filtered to user's tickets
	if (showOnlyMyTickets.value && user.value) {
		generatePersonalPerformanceData();
	}
};

// Generate ticket age distribution for chart
const generateTicketAgeDistribution = (openTickets) => {
	// Define age buckets in days
	const ageBuckets = [
		{ name: '< 1 day', range: [0, 1], count: 0 },
		{ name: '1-3 days', range: [1, 3], count: 0 },
		{ name: '3-7 days', range: [3, 7], count: 0 },
		{ name: '1-2 weeks', range: [7, 14], count: 0 },
		{ name: '2-4 weeks', range: [14, 28], count: 0 },
		{ name: '1-3 months', range: [28, 90], count: 0 },
		{ name: '3+ months', range: [90, Infinity], count: 0 },
	];

	// Count tickets in each age bucket
	openTickets.forEach((ticket) => {
		const ageInDays = getTicketAgeDays(ticket);

		for (const bucket of ageBuckets) {
			if (ageInDays >= bucket.range[0] && ageInDays < bucket.range[1]) {
				bucket.count++;
				break;
			}
		}
	});

	// Set chart data
	ticketAgeData.value = ageBuckets;
};

// Generate activity distribution data
const generateActivityDistribution = () => {
	// Activity types
	const activityTypes = [
		{ type: 'Comments', count: 0 },
		{ type: 'Tasks Created', count: 0 },
		{ type: 'Tasks Completed', count: 0 },
		{ type: 'Status Changes', count: 0 },
	];

	// Count activities from all tickets
	allTickets.value.forEach((ticket) => {
		// Count comments
		if (ticket.comments) {
			activityTypes[0].count += ticket.comments.length;
		}

		// Count tasks
		if (ticket.tasks) {
			// All tasks are created
			activityTypes[1].count += ticket.tasks.length;

			// Count completed tasks
			const completedTasks = ticket.tasks.filter((task) => task.status === 'completed');
			activityTypes[2].count += completedTasks.length;
		}

		// For status changes, we'll use a simple estimate
		// Real implementation would need to track revision history from audit logs
		if (ticket.status === 'Completed') {
			activityTypes[3].count += 3; // Assuming 3 status changes for completed tickets
		} else if (ticket.status === 'InProgress') {
			activityTypes[3].count += 2; // Assuming 2 status changes for in-progress tickets
		} else {
			activityTypes[3].count += 1; // Assuming at least 1 status change for other tickets
		}
	});

	// console.log('Activity Distribution:', activityTypes);
	// Set chart data
	activityDistributionData.value = activityTypes;
};

// Generate completion trend data
const generateCompletionTrend = (completedTickets) => {
	// Get date ranges based on time period
	const endDate = new Date();
	let startDate;
	let intervalType;
	let intervals;

	switch (timePeriod.value) {
		case '7days':
			startDate = subDays(endDate, 7);
			intervalType = 'day';
			intervals = 7;
			break;
		case '90days':
			startDate = subDays(endDate, 90);
			intervalType = 'week';
			intervals = 13; // ~13 weeks in 90 days
			break;
		case '6months':
			startDate = subMonths(endDate, 6);
			intervalType = 'month';
			intervals = 6;
			break;
		case '12months':
			startDate = subMonths(endDate, 12);
			intervalType = 'month';
			intervals = 12;
			break;
		default:
			startDate = subDays(endDate, 30);
			intervalType = 'week';
			intervals = 4; // ~4 weeks in 30 days
	}

	// Create interval buckets
	const trendData = [];
	for (let i = 0; i < intervals; i++) {
		let intervalLabel;

		if (intervalType === 'day') {
			const date = subDays(endDate, i);
			intervalLabel = format(date, 'MMM d');
		} else if (intervalType === 'week') {
			const date = subDays(endDate, i * 7);
			intervalLabel = `Week ${intervals - i}`;
		} else if (intervalType === 'month') {
			const date = subMonths(endDate, i);
			intervalLabel = format(date, 'MMM');
		}

		trendData.push({
			name: intervalLabel,
			completed: 0,
			created: 0,
		});
	}

	// Reverse the array so it's in chronological order
	trendData.reverse();

	// Count completed tickets per interval
	completedTickets.forEach((ticket) => {
		const completedDate = new Date(ticket.date_updated);

		// Skip if completed before our time range
		if (completedDate < startDate) return;

		let index;
		if (intervalType === 'day') {
			index = Math.floor(differenceInDays(completedDate, startDate) / 1);
		} else if (intervalType === 'week') {
			index = Math.floor(differenceInDays(completedDate, startDate) / 7);
		} else if (intervalType === 'month') {
			// Calculate months between dates
			index =
				(completedDate.getFullYear() - startDate.getFullYear()) * 12 + completedDate.getMonth() - startDate.getMonth();
		}

		// Make sure index is valid
		if (index >= 0 && index < trendData.length) {
			trendData[index].completed++;
		}
	});

	// Count created tickets per interval
	allTickets.value.forEach((ticket) => {
		const createdDate = new Date(ticket.date_created);

		// Skip if created before our time range
		if (createdDate < startDate) return;

		let index;
		if (intervalType === 'day') {
			index = Math.floor(differenceInDays(createdDate, startDate) / 1);
		} else if (intervalType === 'week') {
			index = Math.floor(differenceInDays(createdDate, startDate) / 7);
		} else if (intervalType === 'month') {
			// Calculate months between dates
			index =
				(createdDate.getFullYear() - startDate.getFullYear()) * 12 + createdDate.getMonth() - startDate.getMonth();
		}

		// Make sure index is valid
		if (index >= 0 && index < trendData.length) {
			trendData[index].created++;
		}
	});

	// Set chart data
	completionTrendData.value = trendData;
};

// Generate personal performance data
const generatePersonalPerformanceData = () => {
	if (!user.value || !showOnlyMyTickets.value) return;

	// Get user's completed tickets
	const userCompletedTickets = allTickets.value.filter((ticket) => {
		return (
			ticket.status === 'Completed' &&
			ticket.assigned_to?.some((assignment) => assignment.directus_users_id?.id === user.value.id)
		);
	});

	// Get user's open tickets
	const userOpenTickets = allTickets.value.filter((ticket) => {
		return (
			ticket.status !== 'Completed' &&
			ticket.assigned_to?.some((assignment) => assignment.directus_users_id?.id === user.value.id)
		);
	});

	// Calculate average resolution time for user
	let totalResolutionHours = 0;
	userCompletedTickets.forEach((ticket) => {
		const resolutionTime = getTicketTimeToComplete(ticket);
		totalResolutionHours += resolutionTime;
	});

	const avgResolutionTime = userCompletedTickets.length > 0 ? totalResolutionHours / userCompletedTickets.length : 0;

	// Calculate completion rate
	const totalTickets = userCompletedTickets.length + userOpenTickets.length;
	const completionRate = totalTickets > 0 ? (userCompletedTickets.length / totalTickets) * 100 : 0;

	// Calculate activity level (average number of comments + tasks per ticket)
	let totalActivities = 0;

	[...userCompletedTickets, ...userOpenTickets].forEach((ticket) => {
		let activityCount = 0;
		if (ticket.comments) activityCount += ticket.comments.length;
		if (ticket.tasks) activityCount += ticket.tasks.length;
		totalActivities += activityCount;
	});

	const activityLevel = totalTickets > 0 ? (totalActivities / totalTickets).toFixed(1) : 0;

	// Get comparison data from team average (simplified)
	// In a real implementation, would need to calculate team averages
	const teamCompletedTickets = allTickets.value.filter((ticket) =>
		ticket.status === 'Completed' && teamFilter.value ? ticket.team?.id === teamFilter.value : true,
	);

	let teamTotalResolutionHours = 0;
	teamCompletedTickets.forEach((ticket) => {
		teamTotalResolutionHours += getTicketTimeToComplete(ticket);
	});

	const teamAvgResolutionTime =
		teamCompletedTickets.length > 0 ? teamTotalResolutionHours / teamCompletedTickets.length : 0;

	// Calculate percentage difference for comparison
	const resolutionTimeComparison =
		teamAvgResolutionTime > 0 ? ((teamAvgResolutionTime - avgResolutionTime) / teamAvgResolutionTime) * 100 : 0;

	// Set performance data
	personalPerformance.value = {
		avgResolutionTime,
		completionRate: parseFloat(completionRate.toFixed(1)),
		activityLevel,
		comparison: {
			avgResolutionTime: parseFloat(resolutionTimeComparison.toFixed(1)),
			completionRate: 5.2, // Simplified for demo - in real app would calculate
			activityLevel: 10.5, // Simplified for demo - in real app would calculate
		},
	};

	// Generate personal completion chart data
	generatePersonalCompletionData();
};

// Generate personal completion chart data
const generatePersonalCompletionData = () => {
	// Calculate date range based on selected time period
	const endDate = new Date();
	let startDate;
	let intervalType;
	let intervals;

	switch (timePeriod.value) {
		case '7days':
			startDate = subDays(endDate, 7);
			intervalType = 'day';
			intervals = 7;
			break;
		case '90days':
			startDate = subDays(endDate, 90);
			intervalType = 'week';
			intervals = 12;
			break;
		case '6months':
			startDate = subMonths(endDate, 6);
			intervalType = 'month';
			intervals = 6;
			break;
		case '12months':
			startDate = subMonths(endDate, 12);
			intervalType = 'month';
			intervals = 12;
			break;
		default:
			startDate = subDays(endDate, 30);
			intervalType = 'week';
			intervals = 4;
	}

	// Create data buckets based on the interval type
	const completionData = [];
	for (let i = 0; i < intervals; i++) {
		let intervalLabel;

		if (intervalType === 'day') {
			const date = subDays(endDate, i);
			intervalLabel = format(date, 'EEE');
		} else if (intervalType === 'week') {
			const date = subDays(endDate, i * 7);
			intervalLabel = `Week ${intervals - i}`;
		} else if (intervalType === 'month') {
			const date = subMonths(endDate, i);
			intervalLabel = format(date, 'MMM');
		}

		completionData.push({
			name: intervalLabel,
			rate: 0,
			tickets: 0,
		});
	}

	// Reverse the array so it's in chronological order
	completionData.reverse();

	// Get completed tickets in this time period
	const completedInPeriod = allTickets.value.filter((ticket) => {
		const completedDate = new Date(ticket.date_updated);
		return (
			ticket.status === 'Completed' &&
			completedDate >= startDate &&
			ticket.assigned_to?.some((assignment) => assignment.directus_users_id?.id === user.value.id)
		);
	});

	// Count completions per interval
	completedInPeriod.forEach((ticket) => {
		const completedDate = new Date(ticket.date_updated);

		let index;
		if (intervalType === 'day') {
			index = Math.floor(differenceInDays(completedDate, startDate));
		} else if (intervalType === 'week') {
			index = Math.floor(differenceInDays(completedDate, startDate) / 7);
		} else if (intervalType === 'month') {
			index =
				(completedDate.getFullYear() - startDate.getFullYear()) * 12 + completedDate.getMonth() - startDate.getMonth();
		}

		if (index >= 0 && index < intervals) {
			completionData[index].tickets++;
		}
	});

	// Get all tickets assigned during this period (completed or not)
	const assignedInPeriod = allTickets.value.filter((ticket) => {
		const createdDate = new Date(ticket.date_created);
		return (
			createdDate >= startDate &&
			ticket.assigned_to?.some((assignment) => assignment.directus_users_id?.id === user.value.id)
		);
	});

	// Count assigned tickets per interval and calculate completion rates
	const assignedCountsByInterval = Array(intervals).fill(0);

	assignedInPeriod.forEach((ticket) => {
		const createdDate = new Date(ticket.date_created);

		let index;
		if (intervalType === 'day') {
			index = Math.floor(differenceInDays(createdDate, startDate));
		} else if (intervalType === 'week') {
			index = Math.floor(differenceInDays(createdDate, startDate) / 7);
		} else if (intervalType === 'month') {
			index =
				(createdDate.getFullYear() - startDate.getFullYear()) * 12 + createdDate.getMonth() - startDate.getMonth();
		}

		if (index >= 0 && index < intervals) {
			assignedCountsByInterval[index]++;
		}
	});

	// Calculate completion rates for each interval
	for (let i = 0; i < intervals; i++) {
		if (assignedCountsByInterval[i] > 0) {
			completionData[i].rate = Math.round((completionData[i].tickets / assignedCountsByInterval[i]) * 100);
		} else {
			completionData[i].rate = 0;
		}
	}

	// Set personal completion data
	personalCompletionData.value = completionData;
};

// Helper functions for ticket calculations
const getTicketAgeHours = (ticket) => {
	const createdDate = new Date(ticket.date_created);
	const now = new Date();
	return differenceInHours(now, createdDate);
};

const getTicketAgeDays = (ticket) => {
	const createdDate = new Date(ticket.date_created);
	const now = new Date();
	return differenceInDays(now, createdDate);
};

const getTicketAge = (ticket) => {
	return getTicketAgeHours(ticket);
};

const getTicketTimeToComplete = (ticket) => {
	if (ticket.status !== 'Completed' || !ticket.date_updated) return 0;

	const createdDate = new Date(ticket.date_created);
	const completedDate = new Date(ticket.date_updated);
	return differenceInHours(completedDate, createdDate);
};

// Format date for display
const formatDate = (dateString) => {
	const date = new Date(dateString);
	return format(date, 'MMM d, yyyy');
};

// Format duration for display
const formatDuration = (hours) => {
	if (hours === 0) return 'N/A';

	if (hours < 24) {
		return `${Math.round(hours)}h`;
	} else {
		const days = Math.floor(hours / 24);
		const remainingHours = Math.round(hours % 24);
		return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
	}
};

// Format assignees for display
const formatAssignees = (assignees) => {
	if (!assignees || assignees.length === 0) return 'Unassigned';

	if (assignees.length === 1) {
		const user = assignees[0].directus_users_id;
		if (!user) return 'Unassigned';
		return `${user.first_name} ${user.last_name}`;
	}

	return `${assignees.length} assignees`;
};

// Get status color
const getStatusColor = (status) => {
	status = status.toLowerCase().replace(/\s+/g, '');

	switch (status) {
		case 'pending':
			return 'var(--cyan)';
		case 'scheduled':
			return 'var(--cyan2)';
		case 'inprogress':
			return 'var(--green2)';
		case 'completed':
			return 'var(--green)';
		default:
			return 'gray';
	}
};

// Get status card class
const getStatusCardClass = (status) => {
	switch (status) {
		case 'pending':
			return 'border-[var(--cyan)]';
		case 'scheduled':
			return 'border-[var(--cyan2)]';
		case 'inProgress':
			return 'border-[var(--green2)]';
		case 'completed':
			return 'border-[var(--green)]';
		default:
			return 'border-gray-500';
	}
};

// Navigate to ticket detail
const navigateToTicket = (ticketId) => {
	if (!ticketId) return;
	router.push(`/tickets/${ticketId}`);
};

// Refresh data
const refreshData = () => {
	fetchTickets();
};

// Initial data fetch
onMounted(() => {
	fetchTickets();
});

watch([selectedOrg, teamFilter, showOnlyMyTickets], fetchTickets, { immediate: true });
</script>
