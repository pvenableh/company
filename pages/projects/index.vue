<script setup>
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

// Default to table view for all users
const activeView = ref('table');

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

		const clientFilter = getClientFilter();
		if (Object.keys(clientFilter).length > 0) {
			Object.assign(filter, clientFilter);
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

// Fetch table data when view switches to table or org changes (debounced)
const debouncedFetchTable = useDebounceFn(() => fetchTableProjects(), 300);
watch([() => activeView.value, selectedOrg, selectedClient], ([view]) => {
	if (view === 'table') {
		debouncedFetchTable();
	}
});

onMounted(() => {
	if (activeView.value === 'table') {
		fetchTableProjects();
	}
});

const showProjectForm = ref(false);
const router = useRouter();

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
	<div class="page__content">
		<div class="max-w-screen-xl mx-auto page_inner px-4 2xl:px-0">
		<!-- Header -->
		<div class="flex items-center justify-between mb-6">
			<div>
				<h1 class="text-xl font-semibold">Projects</h1>
				<p class="text-sm text-muted-foreground">
					{{ tableProjects.length }} project{{ tableProjects.length !== 1 ? 's' : '' }}
				</p>
			</div>
			<button
				class="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
				@click="showProjectForm = true"
			>
				<UIcon name="i-heroicons-plus" class="w-4 h-4" />
				New Project
			</button>
		</div>

		<!-- Create Project Modal -->
		<ClientOnly>
			<ProjectsFormModal v-model="showProjectForm" @created="handleProjectCreated" />
		</ClientOnly>

		<!-- View switcher -->
		<ClientOnly>
			<div class="flex items-center gap-1 mb-5">
				<button
					v-if="isAdmin"
					class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
					:class="activeView === 'timeline'
						? 'bg-primary text-primary-foreground'
						: 'text-muted-foreground hover:text-foreground'"
					@click="activeView = 'timeline'"
				>
					<Icon name="lucide:map" class="h-3.5 w-3.5 inline -mt-0.5 mr-1" />
					Timeline
				</button>
				<button
					v-if="isAdmin"
					class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
					:class="activeView === 'board'
						? 'bg-primary text-primary-foreground'
						: 'text-muted-foreground hover:text-foreground'"
					@click="activeView = 'board'"
				>
					<Icon name="lucide:columns-3" class="h-3.5 w-3.5 inline -mt-0.5 mr-1" />
					Board
				</button>
				<button
					class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
					:class="activeView === 'table'
						? 'bg-primary text-primary-foreground'
						: 'text-muted-foreground hover:text-foreground'"
					@click="activeView = 'table'"
				>
					<Icon name="lucide:table" class="h-3.5 w-3.5 inline -mt-0.5 mr-1" />
					Table
				</button>
			</div>
		</ClientOnly>

		<ClientOnly>
			<!-- Timeline view (admin only) -->
			<div v-if="isAdmin && activeView === 'timeline'" class="min-h-svh">
				<ProjectTimeline />
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
		</div>
	</div>
</template>
