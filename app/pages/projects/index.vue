<script setup>
import { useDebounceFn } from '@vueuse/core';
useHead({ title: 'Projects | Earnest' });

const { user: sessionUser, loggedIn } = useUserSession();
const user = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});

const { user: directusUser } = useDirectusAuth();
const { canAccess } = useOrgRole();
const { selectedOrg, getOrganizationFilter } = useOrganization();
const { selectedClient, getClientFilter } = useClients();

const isAdmin = computed(() => canAccess('projects'));

// Default to timeline view for admin, table for others
const activeView = ref('timeline');

const projectViewOptions = computed(() => {
	const opts = [];
	if (isAdmin.value) {
		opts.push({ key: 'timeline', label: 'Timeline', icon: 'lucide:map' });
		opts.push({ key: 'board', label: 'Board', icon: 'lucide:columns-3' });
	}
	opts.push({ key: 'table', label: 'Table', icon: 'lucide:table' });
	return opts;
});

// Filters
const statusFilter = ref('active');
const searchQuery = ref('');
const debouncedSearch = useDebounceFn(() => fetchTableProjects(), 300);

const projectStatusItems = [
	{ key: 'active', label: 'Active' },
	{ key: 'completed', label: 'Completed' },
	{ key: 'archived', label: 'Archived' },
	{ key: 'all', label: 'All' },
];

// Table view data
const projectItems = useDirectusItems('projects');
const taskItems = useDirectusItems('project_tasks');
const tableProjects = ref([]);
const tableLoading = ref(false);

const fetchTableProjects = async () => {
	tableLoading.value = true;
	try {
		const filter = {};
		const orgFilter = getOrganizationFilter();
		if (Object.keys(orgFilter).length > 0) {
			Object.assign(filter, orgFilter);
		}

		const clientFilter = getClientFilter();
		if (Object.keys(clientFilter).length > 0) {
			Object.assign(filter, clientFilter);
		}

		const rawProjects = await projectItems.list({
			fields: [
				'id', 'title', 'status', 'due_date', 'date_updated',
				'service.id', 'service.name', 'service.color',
				'client.id', 'client.name',
				'assigned_to.id',
				'assigned_to.directus_users_id.id',
				'assigned_to.directus_users_id.first_name',
				'assigned_to.directus_users_id.last_name',
			],
			search: searchQuery.value || undefined,
			filter: {
				...(statusFilter.value === 'active'
					? { status: { _nin: ['Archived', 'completed'] } }
					: statusFilter.value === 'completed'
						? { status: { _in: ['completed'] } }
						: statusFilter.value === 'archived'
							? { status: { _eq: 'Archived' } }
							: { status: { _nin: ['Archived'] } }),
				...filter,
			},
			sort: ['-date_updated'],
			limit: 200,
		});

		// Enrich projects with task progress
		const projectIds = rawProjects.map(p => p.id);
		if (projectIds.length) {
			try {
				const tasks = await taskItems.list({
					fields: ['id', 'project', 'completed', 'status', 'event_id.project'],
					filter: {
						_or: [
							{ project: { _in: projectIds } },
							{ event_id: { project: { _in: projectIds } } },
						],
					},
					limit: -1,
				});

				const progressMap = {};
				for (const task of (tasks || [])) {
					const pid = task.project || task.event_id?.project;
					if (!pid) continue;
					if (!progressMap[pid]) progressMap[pid] = { total: 0, completed: 0 };
					progressMap[pid].total++;
					if (task.completed || task.status === 'done') progressMap[pid].completed++;
				}

				tableProjects.value = rawProjects.map(p => ({
					...p,
					taskCount: progressMap[p.id]?.total || 0,
					taskProgress: progressMap[p.id]?.total
						? Math.round((progressMap[p.id].completed / progressMap[p.id].total) * 100)
						: 0,
				}));
			} catch {
				tableProjects.value = rawProjects;
			}
		} else {
			tableProjects.value = rawProjects;
		}
	} catch (e) {
		console.error('Error fetching projects:', e);
	} finally {
		tableLoading.value = false;
	}
};

// Fetch table data when view switches to table or org changes (debounced)
const debouncedFetchTable = useDebounceFn(() => fetchTableProjects(), 300);
watch([() => activeView.value, selectedOrg, selectedClient], ([view]) => {
	if (view === 'table') {
		debouncedFetchTable();
	}
});

const showProjectForm = ref(false);
const router = useRouter();

onMounted(() => {
	if (activeView.value === 'table') {
		fetchTableProjects();
	}
	if (router.currentRoute.value.query.new === '1') {
		showProjectForm.value = true;
		router.replace({ query: {} });
	}
});

function handleProjectCreated(project) {
	fetchTableProjects();
	if (project?.id) {
		router.push(`/projects/${project.id}`);
	}
}

definePageMeta({
	middleware: ['auth'],
});
</script>

<template>
	<LayoutPageContainer>
		<LayoutPageHeader
			title="Projects"
			:subtitle="`${tableProjects.length} project${tableProjects.length !== 1 ? 's' : ''}`"
		>
			<template #actions>
				<LayoutShareButton title="Projects | Earnest" />
				<UiActionButton icon="lucide:plus" @click="showProjectForm = true">
					New Project
				</UiActionButton>
			</template>
		</LayoutPageHeader>

		<!-- Create Project Modal -->
		<ClientOnly>
			<ProjectsFormModal v-model="showProjectForm" @created="handleProjectCreated" />
		</ClientOnly>

		<!-- View switcher -->
		<ClientOnly>
			<UTabs v-model="activeView" :items="projectViewOptions" class="mb-5 w-fit" />
		</ClientOnly>

		<!-- Filters -->
		<div v-if="activeView === 'table'" class="flex gap-3 mb-5 flex-wrap items-center">
			<input
				v-model="searchQuery"
				type="search"
				placeholder="Search projects..."
				class="flex-1 min-w-48 rounded-md border bg-background px-3 py-2 text-sm"
				@input="debouncedSearch"
			/>
			<UTabs
				v-model="statusFilter"
				:items="projectStatusItems"
				class="w-fit"
				@change="fetchTableProjects"
			/>
		</div>

		<ClientOnly>
			<!-- Timeline view — Unified Gantt (admin only) -->
			<div v-if="isAdmin && activeView === 'timeline'" class="min-h-svh">
				<ProjectTimelineUnifiedGantt />
				<!-- Old subway-map timeline hidden, not deleted: <ProjectTimeline /> -->
			</div>

			<!-- Board view (admin only) -->
			<div v-else-if="isAdmin && activeView === 'board'" class="xl:flex xl:items-center xl:justify-center min-h-svh overflow-x-auto">
				<ProjectsBoard />
			</div>

			<!-- Table view (all users) -->
			<div v-else-if="activeView === 'table'">
				<div class="ios-card p-5">
					<ProjectsTable :projects="tableProjects" :loading="tableLoading" />
				</div>
			</div>

			<template #fallback>
				<div class="flex items-center justify-center min-h-[400px]">
					<div class="flex flex-col items-center gap-3">
						<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
						<span class="text-sm text-muted-foreground">Loading...</span>
					</div>
				</div>
			</template>
		</ClientOnly>
	</LayoutPageContainer>
</template>
