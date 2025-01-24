<template>
	<div class="w-full mx-auto max-w-[2000px]">
		<transition name="fade">
			<div v-if="!isConnected && !isLoading" class="mb-4 absolute right-0 top-0 tickets-board__connection">
				<UAlert title="Connection Lost" description="Attempting to reconnect..." color="yellow">
					<template #footer>
						<UButton size="sm" color="yellow" @click="refresh">Retry Connection</UButton>
					</template>
				</UAlert>
			</div>
		</transition>
		<div class="w-full flex flex-col md:flex-row items-center justify-between mb-4 px-4">
			<div class="flex items-center gap-4">
				<div class="flex items-center space-x-2">
					<USelectMenu
						v-model="selectedService"
						:options="serviceOptions"
						option-attribute="name"
						value-attribute="id"
						placeholder="Select Service"
						class="w-full lg:w-64 uppercase text-[10px] text-gray-400 relative"
						@change="handleServiceChange"
					>
						<template #option="{ option }">
							<div class="flex items-center gap-2">
								<div class="w-3 h-3 rounded-full" :style="{ backgroundColor: option.color }"></div>
								<span>{{ option.name }}</span>
							</div>
						</template>
					</USelectMenu>
				</div>

				<!-- Assigned To Filter -->
				<div class="flex flex-row items-center justify-center space-x-2 ml-4">
					<UToggle v-model="filterByAssignedTo" />
					<span class="text-[10px] text-gray-500 uppercase">
						{{ filterByAssignedTo ? 'My Projects' : 'All Projects' }}
					</span>
				</div>
			</div>

			<!-- Last Updated -->
			<div v-if="lastUpdated" class="text-xs text-gray-500 mt-2 md:mt-0 font-bold uppercase">
				Last updated: {{ new Date(lastUpdated).toLocaleTimeString() }}
			</div>
		</div>

		<!-- Board Layout -->
		<div class="w-full flex px-4 gap-4 min-h-svh">
			<div v-for="column in columns" :key="column.id" class="flex-grow w-full basis-0 shadow h-full min-h-dvh">
				<!-- Column Header -->
				<div class="p-3 bg-gray-200 mb-3 shadow-lg">
					<div class="flex items-center justify-between">
						<h3 class="text-xs font-bold uppercase tracking-wide">{{ column.name }}</h3>
						<UBadge :color="column.color" class="ml-2 w-6 h-6 text-center">
							{{ localProjects[column.id]?.length || 0 }}
						</UBadge>
					</div>
				</div>

				<!-- Loading State -->
				<div
					v-if="isLoading && !localProjects[column.id]?.length"
					class="min-h-[90svh] p-2 bg-gray-100 dark:bg-gray-800"
				>
					<div class="space-y-3">
						<USkeleton v-for="n in 3" :key="n" class="h-24 w-full" />
					</div>
				</div>

				<!-- Draggable Container -->
				<VueDraggable
					v-else
					v-model="localProjects[column.id]"
					:group="{ name: 'projects' }"
					item-key="id"
					class="min-h-svh h-full py-2 px-2 bg-gray-100 dark:bg-gray-800 shadow-inner"
					:class="{ 'is-dragging': isDragging }"
					ghost-class="ghost"
					chosen-class="chosen"
					drag-class="drag"
					@start="onDragStart"
					@end="onDragEnd"
					@change="(event) => updateProjectStatus(column.id, event)"
				>
					<template #item="{ element }">
						<div :id="element.id" class="project-wrapper">
							<div class="relative">
								<div
									v-if="updatingProjects.has(element.id)"
									class="absolute inset-0 bg-white/50 dark:bg-gray-900/50 rounded-lg flex items-center justify-center z-10"
								>
									<UIcon name="i-heroicons-arrow-path" class="animate-spin h-5 w-5" />
								</div>
								<ProjectsCard
									:project="element"
									:columns="columns"
									:class="{ 'opacity-50': updatingProjects.has(element.id) }"
									class="my-2"
								/>
							</div>
						</div>
					</template>
				</VueDraggable>
			</div>
		</div>
	</div>
</template>

<script setup>
import VueDraggable from 'vuedraggable';
const { readItems, updateItem } = useDirectusItems();
const { user } = useDirectusAuth();
const { selectedOrg, hasMultipleOrgs, organizationOptions, setOrganization, clearOrganization, getOrganizationFilter } =
	useOrganization();

const columns = [
	{ id: 'Pending', name: 'Pending', color: 'gray' },
	{ id: 'Scheduled', name: 'Scheduled', color: 'black' },
	{ id: 'In Progress', name: 'In Progress', color: 'blue' },
	{ id: 'Completed', name: 'Completed', color: 'green' },
];

const activeColumn = ref(columns[0].id);
const isMobile = ref(false);
const updatingProjects = ref(new Set());
const isDragging = ref(false);
const selectedService = ref(null);
const filterByAssignedTo = ref(false);
const serviceOptions = ref([]);

const localProjects = ref(
	columns.reduce((acc, column) => {
		acc[column.id] = [];
		return acc;
	}, {}),
);

// Fetch services
const fetchServices = async () => {
	try {
		const services = await readItems('services', {
			fields: ['id', 'name', 'color'],
		});
		serviceOptions.value = [{ id: null, name: 'All Services', color: '#808080' }, ...services];
	} catch (error) {
		console.error('Error fetching services:', error);
	}
};

const fields = [
	'id',
	'title',
	'description',
	'status',
	'date_created',
	'date_updated',
	'user_created.first_name',
	'user_created.last_name',
	'user_updated.first_name',
	'user_updated.last_name',
	'organization.id',
	'organization.name',
	'tickets',
	'events',
	'service.id',
	'service.name',
	'service.color',
	'sort',
	'assigned_to.id',
	'assigned_to.directus_users_id.id',
	'assigned_to.directus_users_id.first_name',
	'assigned_to.directus_users_id.last_name',
	'assigned_to.directus_users_id.avatar',
];

const filterRef = computed(() => getFilter());

const getFilter = () => {
	console.log('Getting filter');
	const filter = {
		_and: [],
	};

	// Organization filter
	const orgFilter = getOrganizationFilter();
	if (Object.keys(orgFilter).length > 0) {
		filter._and.push(orgFilter);
	}

	// Service filter
	if (selectedService.value) {
		filter._and.push({
			service: { _eq: selectedService.value },
		});
	}

	// Assignment filter
	if (filterByAssignedTo.value && user.value) {
		filter._and.push({
			assigned_to: {
				directus_users_id: {
					id: { _eq: user.value.id },
				},
			},
		});
	}
	// Remove _and if empty
	if (filter._and.length === 0) {
		delete filter._and;
	}

	// Debug final filter
	console.log('Final Filter:', JSON.stringify(filter, null, 2));

	// Debug final query
	const query = {
		fields,
		filter,
		sort: '-date_updated',
	};
	console.log('Final Query:', JSON.stringify(query, null, 2));

	return filter;
};

const {
	data: projects,
	isLoading,
	isConnected,
	lastUpdated,
	refresh,
} = useRealtimeSubscription('projects', fields, filterRef.value, '-date_updated');

watch([() => projects.value, selectedOrg, selectedService, filterByAssignedTo], ([newProjects]) => {
	if (!newProjects) return;

	const filtered = newProjects.filter((project) => {
		const orgMatch = !selectedOrg.value || project.organization?.id === selectedOrg.value;
		const serviceMatch = !selectedService.value || project.service?.id === selectedService.value;
		let assignmentMatch = true;
		if (filterByAssignedTo.value && user.value) {
			assignmentMatch = project.assigned_to?.some((assignment) => assignment.directus_users_id?.id === user.value.id);
		}
		return orgMatch && serviceMatch && assignmentMatch;
	});

	columns.forEach((column) => {
		localProjects.value[column.id] = filtered.filter((project) => project.status === column.id);
	});
});

watch(
	() => selectedOrg.value,
	async (newOrg) => {
		console.log('Organization changed:', newOrg);
		refresh();
	},
);

const handleServiceChange = (value) => {
	selectedService.value = value === 'null' || value === 'All Services' ? null : value;
};

const handleProjectCreated = () => {
	refresh();
};

const onDragStart = () => {
	isDragging.value = true;
};

const onDragEnd = () => {
	isDragging.value = false;
};

const updateProjectStatus = async (columnId, event) => {
	if (!event.added) return;

	const projectId = event.added.element.id;
	updatingProjects.value.add(projectId);

	try {
		await updateItem('projects', projectId, {
			status: columnId,
			date_updated: new Date(),
		});

		const project = event.added.element;
		project.status = columnId;
	} catch (error) {
		console.error('Error updating project:', error);
		const originalStatus = event.added.element.status;
		localProjects.value[originalStatus].push(event.added.element);
		localProjects.value[columnId] = localProjects.value[columnId].filter((p) => p.id !== projectId);

		useToast().add({
			title: 'Error',
			description: 'Failed to update project status',
			color: 'red',
		});
	} finally {
		updatingProjects.value.delete(projectId);
	}
};

onMounted(() => {
	checkMobile();
	window.addEventListener('resize', checkMobile);
	fetchServices();
});

onUnmounted(() => {
	window.removeEventListener('resize', checkMobile);
});

function checkMobile() {
	isMobile.value = window.innerWidth < 768;
}
</script>

<style scoped>
.ghost {
	opacity: 0.5;
	background: #f0f0f0;
	border: 2px dashed #ccc;
	border-radius: 0.5rem;
}

.chosen {
	transform: scale(1.02);
	box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
}

.drag {
	opacity: 0.9;
	transform: scale(1.05);
	box-shadow: 0 15px 25px rgba(0, 0, 0, 0.15);
}

.project-wrapper {
	transition: all 0.3s ease;
}

.is-dragging {
	background: rgba(59, 130, 246, 0.05);
	border: 2px dashed rgba(59, 130, 246, 0.2);
	border-radius: 0.5rem;
	transition: all 0.3s ease;
}
</style>
