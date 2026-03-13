<script setup>
const { user: sessionUser, loggedIn } = useUserSession();
const user = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});

const { user: directusUser } = useDirectusAuth();
const { canAccess } = useRole();
const { selectedOrg, getOrganizationFilter } = useOrganization();

const isAdmin = computed(() => canAccess('projects'));

// Non-admins default to table view; admins default to timeline
const activeView = ref(isAdmin.value ? 'timeline' : 'table');

// Table view data
const projectItems = useDirectusItems('projects');
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

		tableProjects.value = await projectItems.list({
			fields: [
				'id', 'title', 'status', 'due_date', 'date_updated',
				'service.id', 'service.name', 'service.color',
				'organization.id', 'organization.name',
				'assigned_to.id',
				'assigned_to.directus_users_id.id',
				'assigned_to.directus_users_id.first_name',
				'assigned_to.directus_users_id.last_name',
			],
			filter: {
				status: { _nin: ['Archived'] },
				...filter,
			},
			sort: ['-date_updated'],
			limit: 200,
		});
	} catch (e) {
		console.error('Error fetching projects:', e);
	} finally {
		tableLoading.value = false;
	}
};

// Fetch table data when view switches to table or org changes
watch([() => activeView.value, selectedOrg], ([view]) => {
	if (view === 'table') {
		fetchTableProjects();
	}
});

onMounted(() => {
	if (activeView.value === 'table') {
		fetchTableProjects();
	}
});

definePageMeta({
	middleware: ['auth'],
});
</script>

<template>
	<div class="page__content">
		<h1 class="page__title">
			Projects
			<span class="block">
				{{ activeView === 'timeline' ? 'Timeline' : activeView === 'board' ? 'Board' : 'Overview' }}
			</span>
		</h1>

		<!-- View switcher -->
		<div class="flex items-center gap-1 px-4 2xl:px-0 mb-4">
			<button
				v-if="isAdmin"
				class="px-3 py-1.5 t-label rounded-md transition-colors"
				:class="activeView === 'timeline'
					? 'bg-primary text-primary-foreground'
					: 'text-muted-foreground hover:text-foreground'"
				@click="activeView = 'timeline'"
			>
				<Icon name="i-heroicons-map" class="h-3.5 w-3.5 inline -mt-0.5 mr-1" />
				Timeline
			</button>
			<button
				v-if="isAdmin"
				class="px-3 py-1.5 t-label rounded-md transition-colors"
				:class="activeView === 'board'
					? 'bg-primary text-primary-foreground'
					: 'text-muted-foreground hover:text-foreground'"
				@click="activeView = 'board'"
			>
				<Icon name="i-heroicons-view-columns" class="h-3.5 w-3.5 inline -mt-0.5 mr-1" />
				Board
			</button>
			<button
				class="px-3 py-1.5 t-label rounded-md transition-colors"
				:class="activeView === 'table'
					? 'bg-primary text-primary-foreground'
					: 'text-muted-foreground hover:text-foreground'"
				@click="activeView = 'table'"
			>
				<Icon name="i-heroicons-table-cells" class="h-3.5 w-3.5 inline -mt-0.5 mr-1" />
				Table
			</button>
		</div>

		<!-- Timeline view (admin only) -->
		<div v-if="isAdmin && activeView === 'timeline'" class="z-10 min-h-svh page__inner">
			<ProjectTimelineTimeline />
		</div>

		<!-- Board view (admin only) -->
		<div v-else-if="isAdmin && activeView === 'board'" class="xl:flex xl:items-center xl:justify-center z-10 min-h-svh overflow-x-auto page__inner">
			<ProjectsBoard />
		</div>

		<!-- Table view (all users) -->
		<div v-else-if="activeView === 'table'" class="z-10 page__inner px-4 2xl:px-0">
			<div class="ios-card p-5">
				<ProjectsTable :projects="tableProjects" :loading="tableLoading" />
			</div>
		</div>
	</div>
</template>
