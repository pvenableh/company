<template>
	<div class="w-full mx-auto relative projects-board">
		<transition name="fade">
			<div v-if="!isConnected && !isLoading" class="mb-4 absolute right-0 top-0 projects-board__connection">
				<UAlert title="Connection Lost" description="Attempting to reconnect..." color="yellow">
					<template #footer>
						<UButton size="sm" color="yellow" @click="refresh">Retry Connection</UButton>
					</template>
				</UAlert>
			</div>
		</transition>
		<div
			class="w-full flex flex-col md:flex-row items-end justify-between mb-4 xl:mb-8 xl:mt-2 px-4 gap-4 pt-4 projects-board__filters"
		>
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
			<div v-if="lastUpdated" class="-bottom-[22.5px] text-[9px] right-0 text-gray-500 absolute font-bold uppercase">
				Last updated: {{ new Date(lastUpdated).toLocaleTimeString() }}
			</div>
		</div>

		<!-- Board Layout -->
		<div
			class="bg-gray-100 bg-opacity-30 border-b border-gray-200 w-full flex min-h-svh overflow-x-auto overflow-hidden-scrollbar projects-board__board"
			@touchstart="handleTouchStart"
			@touchend="handleTouchEnd"
		>
			<div
				v-for="(column, index) in columns"
				:key="column.id"
				class="flex-grow w-full basis-0 h-full min-h-dvh transition-transform duration-300 ease-in-out min-w-[350px] projects-board__board-col"
				:class="{
					'hidden md:block': isMobile && column.id !== activeColumn,
					'transform translate-x-0': !isMobile || column.id === activeColumn,
				}"
			>
				<!-- Column Header -->
				<div class="projects-board__board-col-header">
					<div class="flex items-center justify-between">
						<h3 class="text-xs font-bold uppercase tracking-wide">{{ column.name }}</h3>
						<UBadge
							class="ml-2 w-6 h-6 text-center inline-block text-[var(--darkBlue)]"
							:style="{ backgroundColor: `var(--${column.color})` }"
						>
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
					class="projects-board__board-col-content"
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
const { user } = useEnhancedAuth();
const { selectedOrg, hasMultipleOrgs, organizationOptions, setOrganization, clearOrganization, getOrganizationFilter } =
	useOrganization();

const columns = [
	{ id: 'Pending', name: 'Pending', color: 'cyan' },
	{ id: 'Scheduled', name: 'Scheduled', color: 'cyan2' },
	{ id: 'In Progress', name: 'In Progress', color: 'green2' },
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

// const handleProjectCreated = () => {
// 	refresh();
// };

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
	if (import.meta.client) {
		window.addEventListener('resize', checkMobile);
	}
	fetchServices();
});

onUnmounted(() => {
	if (import.meta.client) {
		window.removeEventListener('resize', checkMobile);
	}
});

function checkMobile() {
	isMobile.value = window.innerWidth < 768;
}
</script>

<style scoped>
.projects-board {
	&__board {
		@apply relative;
		&-filters {
			@apply relative max-w-[2000px] bg-red-500;
		}
		&-connection {
			@apply max-w-[2000px];
		}
		&-col {
			@apply border-gray-50 border-r border-l shadow-inner;
			&-header {
				@apply relative shadow-2xl py-5 px-4 backdrop-blur-lg mt-1 border-gray-200 border-b;
				@media (min-width: 1600px) {
					@apply px-8;
				}
			}
			&-content {
				@apply min-h-screen lg:h-svh h-full py-2 bg-gray-50 bg-opacity-15 dark:bg-gray-800 overflow-y-auto overflow-hidden-scrollbar px-2;
				@media (min-width: 1600px) {
					@apply px-6;
				}
			}
		}
	}
	.projects-board__board::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 1px;
		z-index: 10;
		background: linear-gradient(90deg, var(--cyan), var(--green));
	}
	.projects-board__board::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		height: 1px;
		z-index: 10;
		background: linear-gradient(90deg, var(--cyan), var(--green));
	}
}
/* Hide scrollbar for Webkit browsers */
.overflow-hidden-scrollbar::-webkit-scrollbar {
	display: none;
}

/* Optional: Hide scrollbar for Firefox */
.overflow-hidden-scrollbar {
	scrollbar-width: none; /* Firefox */
}

/* Maintain smooth scrolling */
.overflow-hidden-scrollbar {
	-ms-overflow-style: none; /* IE and Edge */
}
@media (max-width: 768px) {
	.column-transition-enter-active,
	.column-transition-leave-active {
		transition: transform 0.3s ease-in-out;
	}

	.column-transition-enter-from {
		transform: translateX(100%);
	}

	.column-transition-leave-to {
		transform: translateX(-100%);
	}
}

.project-wrapper {
	transition: all 0.3s ease;
}

.ghost {
	opacity: 0.5;
	background: #f0f0f0;
	/* border: 2px dashed #ccc;
	border-radius: 0.5rem; */
}

.chosen {
	/* transform: scale(1.05); */
	box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
}

.drag {
	opacity: 0.9;
	/* transform: scale(1.05); */
	box-shadow: 0 15px 25px rgba(0, 0, 0, 0.15);
}

.is-dragging {
	/* background: rgba(59, 130, 246, 0.05); */
	/* border: 2px dashed rgba(59, 130, 246, 0.2);
	border-radius: 0.5rem; */
	transition: all 0.3s ease;
}

.drop-zone-indicator {
	display: none;
	text-align: center;
	padding: 1rem;
	color: #6b7280;
	font-size: 0.875rem;
	border: 2px dashed var(--cyan);
	border-radius: 0.1rem;
	margin-top: 0.5rem;
	opacity: 0;
	transform: translateY(-10px);
	transition: all 0.3s ease;
}

.drop-zone-indicator.show {
	display: block;
	opacity: 1;
	transform: translateY(0);
}

.project-move {
	transition: transform 0.5s ease;
}

.project-enter-active,
.project-leave-active {
	transition: all 0.5s ease;
}

.project-enter-from,
.project-leave-to {
	opacity: 0;
	transform: translateX(30px);
}
</style>
