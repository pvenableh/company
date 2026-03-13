<script setup lang="ts">
definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});

const { user } = useDirectusAuth();
const { selectedOrg } = useOrganization();
const { membership, isOrgClient, clientScope } = useOrgRole();

const projectItems = useDirectusItems('projects');
const ticketItems = useDirectusItems('tickets');

const loading = ref(true);
const stats = ref({
	activeProjects: 0,
	openTickets: 0,
	resolvedTickets: 0,
});
const recentTickets = ref<any[]>([]);
const recentProjects = ref<any[]>([]);

async function loadDashboard() {
	if (!selectedOrg.value) return;
	loading.value = true;

	try {
		const baseFilter: any[] = [
			{ status: { _neq: 'archived' } },
		];

		// Client-scoped: filter by their client
		if (clientScope.value) {
			baseFilter.push({ client: { _eq: clientScope.value } });
		}

		// Fetch stats and recent items in parallel
		const [projects, tickets, resolved] = await Promise.all([
			projectItems.list({
				filter: { _and: [...baseFilter, { status: { _in: ['pending', 'scheduled', 'in_progress'] } }] },
				fields: ['id', 'title', 'status', 'date_updated'],
				sort: ['-date_updated'],
				limit: 5,
			}),
			ticketItems.list({
				filter: { _and: [...baseFilter, { status: { _in: ['open', 'in_progress', 'pending'] } }] },
				fields: ['id', 'title', 'status', 'priority', 'date_updated'],
				sort: ['-date_updated'],
				limit: 5,
			}),
			ticketItems.count({
				_and: [...baseFilter, { status: { _eq: 'completed' } }],
			}),
		]);

		stats.value = {
			activeProjects: projects.length,
			openTickets: tickets.length,
			resolvedTickets: resolved || 0,
		};

		recentProjects.value = projects;
		recentTickets.value = tickets;
	} catch (err) {
		console.error('Failed to load portal dashboard:', err);
	} finally {
		loading.value = false;
	}
}

const clientName = computed(() => {
	if (!membership.value?.client) return null;
	const client = membership.value.client;
	return typeof client === 'object' ? client.name : null;
});

onMounted(() => {
	loadDashboard();
});

watch(() => selectedOrg.value, () => {
	loadDashboard();
});
</script>

<template>
	<div class="p-6 max-w-5xl mx-auto">
		<!-- Welcome Header -->
		<div class="mb-8">
			<h1 class="text-2xl font-semibold">
				Welcome{{ user?.first_name ? `, ${user.first_name}` : '' }}
			</h1>
			<p class="text-sm text-muted-foreground mt-1">
				<template v-if="clientName">{{ clientName }} &mdash; </template>
				Here's an overview of your projects and tickets.
			</p>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="flex items-center justify-center py-24">
			<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
		</div>

		<template v-else>
			<!-- Stats Cards -->
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
				<div class="ios-card p-5">
					<div class="flex items-center gap-3">
						<div class="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/10">
							<Icon name="lucide:folder-kanban" class="w-5 h-5 text-blue-500" />
						</div>
						<div>
							<p class="text-2xl font-semibold">{{ stats.activeProjects }}</p>
							<p class="text-xs text-muted-foreground">Active Projects</p>
						</div>
					</div>
				</div>

				<div class="ios-card p-5">
					<div class="flex items-center gap-3">
						<div class="flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/10">
							<Icon name="lucide:ticket" class="w-5 h-5 text-amber-500" />
						</div>
						<div>
							<p class="text-2xl font-semibold">{{ stats.openTickets }}</p>
							<p class="text-xs text-muted-foreground">Open Tickets</p>
						</div>
					</div>
				</div>

				<div class="ios-card p-5">
					<div class="flex items-center gap-3">
						<div class="flex items-center justify-center w-10 h-10 rounded-full bg-green-500/10">
							<Icon name="lucide:check-circle-2" class="w-5 h-5 text-green-500" />
						</div>
						<div>
							<p class="text-2xl font-semibold">{{ stats.resolvedTickets }}</p>
							<p class="text-xs text-muted-foreground">Resolved Tickets</p>
						</div>
					</div>
				</div>
			</div>

			<!-- Recent Activity Grid -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<!-- Recent Projects -->
				<div class="ios-card p-5">
					<div class="flex items-center justify-between mb-4">
						<h2 class="font-medium flex items-center gap-2">
							<Icon name="lucide:folder-kanban" class="w-4 h-4 text-muted-foreground" />
							Recent Projects
						</h2>
						<NuxtLink to="/portal/projects" class="text-xs text-primary hover:underline">
							View all
						</NuxtLink>
					</div>

					<div v-if="recentProjects.length" class="space-y-2">
						<NuxtLink
							v-for="project in recentProjects"
							:key="project.id"
							:to="`/portal/projects?highlight=${project.id}`"
							class="flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors"
						>
							<span class="text-sm font-medium truncate">{{ project.title }}</span>
							<span
								class="text-xs px-2 py-0.5 rounded-full shrink-0"
								:class="{
									'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400': project.status === 'pending',
									'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': project.status === 'scheduled',
									'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': project.status === 'in_progress',
								}"
							>
								{{ project.status?.replace('_', ' ') }}
							</span>
						</NuxtLink>
					</div>
					<p v-else class="text-sm text-muted-foreground text-center py-6">
						No active projects yet.
					</p>
				</div>

				<!-- Recent Tickets -->
				<div class="ios-card p-5">
					<div class="flex items-center justify-between mb-4">
						<h2 class="font-medium flex items-center gap-2">
							<Icon name="lucide:ticket" class="w-4 h-4 text-muted-foreground" />
							Recent Tickets
						</h2>
						<NuxtLink to="/portal/tickets" class="text-xs text-primary hover:underline">
							View all
						</NuxtLink>
					</div>

					<div v-if="recentTickets.length" class="space-y-2">
						<NuxtLink
							v-for="ticket in recentTickets"
							:key="ticket.id"
							:to="`/portal/tickets?highlight=${ticket.id}`"
							class="flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors"
						>
							<span class="text-sm font-medium truncate">{{ ticket.title }}</span>
							<div class="flex items-center gap-2 shrink-0">
								<span
									v-if="ticket.priority"
									class="text-xs px-2 py-0.5 rounded-full"
									:class="{
										'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400': ticket.priority === 'urgent',
										'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400': ticket.priority === 'high',
										'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': ticket.priority === 'normal',
										'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400': ticket.priority === 'low',
									}"
								>
									{{ ticket.priority }}
								</span>
								<span
									class="text-xs px-2 py-0.5 rounded-full"
									:class="{
										'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400': ticket.status === 'open',
										'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': ticket.status === 'in_progress',
										'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400': ticket.status === 'pending',
									}"
								>
									{{ ticket.status?.replace('_', ' ') }}
								</span>
							</div>
						</NuxtLink>
					</div>
					<p v-else class="text-sm text-muted-foreground text-center py-6">
						No open tickets.
					</p>
				</div>
			</div>
		</template>
	</div>
</template>
