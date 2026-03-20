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
						class="w-full lg:w-64 t-label text-muted-foreground relative"
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
					<span class="t-label text-muted-foreground">
						{{ filterByAssignedTo ? 'My Projects' : 'All Projects' }}
					</span>
				</div>

				<!-- New Project Button -->
				<Button size="sm" variant="outline" class="ml-2 uppercase text-[10px] tracking-wide" @click="showNewProjectModal = true">
					<UIcon name="i-heroicons-plus" class="h-3 w-3 mr-1" />
					New Project
				</Button>
			</div>

			<!-- Last Updated -->
			<div v-if="lastUpdated" class="-bottom-[22.5px] right-0 absolute t-label text-muted-foreground">
				Last updated: {{ new Date(lastUpdated).toLocaleTimeString() }}
			</div>
		</div>

		<!-- Board Layout -->
		<div
			class="bg-muted/20 border-b border-border w-full flex min-h-svh overflow-x-auto overflow-hidden-scrollbar projects-board__board"
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
					<div class="flex items-center gap-3">
						<div class="h-5 w-1 rounded-full" :style="{ backgroundColor: `var(--${column.color})` }" />
						<h3 class="text-xs font-semibold uppercase tracking-wider text-foreground flex-1">{{ column.name }}</h3>
						<span
							class="text-[10px] font-bold tabular-nums min-w-[20px] h-5 flex items-center justify-center rounded-full px-1.5"
							:style="{ backgroundColor: `var(--${column.color})`, color: 'var(--darkBlue)' }"
						>
							{{ localProjects[column.id]?.length || 0 }}
						</span>
					</div>
				</div>

				<!-- Loading State -->
				<div
					v-if="isLoading && !localProjects[column.id]?.length"
					class="min-h-[90svh] p-2 bg-muted/30"
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
									class="absolute inset-0 bg-card/50 rounded-lg flex items-center justify-center z-10"
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

		<!-- New Project Modal -->
		<UModal v-model="showNewProjectModal" title="New Project">
			<template #header>
				<div class="flex items-center justify-between w-full">
					<h3 class="text-sm font-bold uppercase tracking-wide">New Project</h3>
					<Button variant="ghost" size="icon-sm" @click="showNewProjectModal = false">
						<UIcon name="i-heroicons-x-mark" class="h-4 w-4" />
					</Button>
				</div>
			</template>

			<form @submit.prevent="handleCreateProject" class="space-y-4 p-4">
				<!-- Title -->
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Title *</label>
					<UInput v-model="newProjectForm.title" placeholder="Project title" />
				</div>

				<!-- Description -->
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Description</label>
					<UTextarea v-model="newProjectForm.description" placeholder="Project description..." :rows="3" />
				</div>

				<!-- Status -->
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Status</label>
					<USelectMenu
						v-model="newProjectForm.status"
						:options="columns.map((c) => ({ label: c.name, value: c.id }))"
						option-attribute="label"
						value-attribute="value"
						placeholder="Select status"
					/>
				</div>

				<!-- Service -->
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Service</label>
					<USelectMenu
						v-model="newProjectForm.service"
						:options="serviceOptions.filter((s) => s.id !== null)"
						option-attribute="name"
						value-attribute="id"
						placeholder="Select service"
					>
						<template #option="{ option }">
							<div class="flex items-center gap-2">
								<div class="w-3 h-3 rounded-full" :style="{ backgroundColor: option.color }"></div>
								<span>{{ option.name }}</span>
							</div>
						</template>
					</USelectMenu>
				</div>

				<!-- Start Date -->
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Start Date</label>
					<UInput v-model="newProjectForm.start_date" type="date" />
				</div>
			</form>

			<template #footer>
				<div class="flex justify-end gap-3 w-full">
					<Button variant="outline" size="sm" @click="showNewProjectModal = false">Cancel</Button>
					<Button size="sm" :disabled="creatingProject || !newProjectForm.title.trim()" @click="handleCreateProject">
						<UIcon v-if="creatingProject" name="i-heroicons-arrow-path" class="animate-spin h-3 w-3 mr-1" />
						Create Project
					</Button>
				</div>
			</template>
		</UModal>

		<!-- Post-Creation Timeline Prompt -->
		<UModal v-model="showTimelinePrompt" title="Generate Timeline?">
			<template #header>
				<div class="flex items-center justify-between w-full">
					<div class="flex items-center gap-2">
						<div class="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
							<UIcon name="i-heroicons-sparkles" class="h-3.5 w-3.5 text-white" />
						</div>
						<h3 class="text-sm font-bold uppercase tracking-wide">Generate Timeline?</h3>
					</div>
					<Button variant="ghost" size="icon-sm" @click="showTimelinePrompt = false">
						<UIcon name="i-heroicons-x-mark" class="h-4 w-4" />
					</Button>
				</div>
			</template>

			<div class="p-4 space-y-3">
				<p class="text-sm text-foreground">
					<span class="font-semibold">"{{ lastCreatedProject?.title }}"</span> has been created.
				</p>
				<p class="text-sm text-muted-foreground">
					Would you like AI to generate a project timeline with milestones and tasks?
				</p>
			</div>

			<template #footer>
				<div class="flex justify-end gap-3 w-full">
					<Button variant="outline" size="sm" @click="showTimelinePrompt = false">Not Now</Button>
					<Button
						size="sm"
						class="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white border-0"
						@click="showTimelinePrompt = false; showTimelineWizard = true"
					>
						<UIcon name="i-heroicons-sparkles" class="h-3 w-3 mr-1" />
						Generate Timeline
					</Button>
				</div>
			</template>
		</UModal>

		<!-- Timeline Generator Wizard -->
		<ProjectsAITimelineWizard
			v-if="showTimelineWizard && lastCreatedProject"
			:project="lastCreatedProject"
			@close="showTimelineWizard = false"
			@created="handleTimelineCreated"
		/>
	</div>
</template>

<script setup>
import VueDraggable from 'vuedraggable';
import { Button } from '~/components/ui/button';
const serviceItems = useDirectusItems('services');
const projectItems = useDirectusItems('projects');
const { user } = useDirectusAuth();
const { selectedOrg, hasMultipleOrgs, organizationOptions, setOrganization, clearOrganization, getOrganizationFilter } =
	useOrganization();
const { selectedClient, getClientFilter } = useClients();

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

// New Project modal state
const showNewProjectModal = ref(false);
const creatingProject = ref(false);
const newProjectForm = reactive({
	title: '',
	description: '',
	status: 'Pending',
	service: null,
	start_date: '',
});

// Post-creation timeline prompt state
const showTimelinePrompt = ref(false);
const showTimelineWizard = ref(false);
const lastCreatedProject = ref(null);

const handleTimelineCreated = () => {
	refresh();
};

const resetNewProjectForm = () => {
	newProjectForm.title = '';
	newProjectForm.description = '';
	newProjectForm.status = 'Pending';
	newProjectForm.service = null;
	newProjectForm.start_date = '';
};

const handleCreateProject = async () => {
	if (!newProjectForm.title.trim()) {
		useToast().add({
			title: 'Error',
			description: 'Project title is required',
			color: 'red',
		});
		return;
	}

	creatingProject.value = true;
	try {
		const data = {
			title: newProjectForm.title.trim(),
			status: newProjectForm.status,
		};

		if (newProjectForm.description?.trim()) {
			data.description = newProjectForm.description.trim();
		}
		if (newProjectForm.service) {
			data.service = newProjectForm.service;
		}
		if (newProjectForm.start_date) {
			data.start_date = newProjectForm.start_date;
		}

		const created = await projectItems.create(data);
		await refresh();

		// Build project data for timeline wizard
		const service = serviceOptions.value.find((s) => s.id === newProjectForm.service);
		lastCreatedProject.value = {
			id: created.id,
			title: newProjectForm.title.trim(),
			service: service && service.id ? { name: service.name, color: service.color } : null,
			start_date: newProjectForm.start_date || null,
		};

		useToast().add({
			title: 'Project Created',
			description: `"${data.title}" has been created`,
			color: 'green',
		});

		showNewProjectModal.value = false;
		resetNewProjectForm();
		showTimelinePrompt.value = true;
	} catch (error) {
		console.error('Error creating project:', error);
		useToast().add({
			title: 'Error',
			description: 'Failed to create project',
			color: 'red',
		});
	} finally {
		creatingProject.value = false;
	}
};

const localProjects = ref(
	columns.reduce((acc, column) => {
		acc[column.id] = [];
		return acc;
	}, {}),
);

// Fetch services
const fetchServices = async () => {
	try {
		const services = await serviceItems.list({
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

	// Client filter
	const clientFilter = getClientFilter();
	if (Object.keys(clientFilter).length > 0) {
		filter._and.push(clientFilter);
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

watch([() => projects.value, selectedOrg, selectedClient, selectedService, filterByAssignedTo], ([newProjects]) => {
	if (!newProjects) return;

	const filtered = newProjects.filter((project) => {
		const orgMatch = !selectedOrg.value || project.organization?.id === selectedOrg.value;
		const serviceMatch = !selectedService.value || project.service?.id === selectedService.value;
		let assignmentMatch = true;
		if (filterByAssignedTo.value && user.value) {
			assignmentMatch = project.assigned_to?.some((assignment) => assignment.directus_users_id?.id === user.value.id);
		}
		const clientMatch = true; // Client filtering is handled server-side via subscription
		return orgMatch && clientMatch && serviceMatch && assignmentMatch;
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

watch(
	() => selectedClient.value,
	() => {
		console.log('Client changed, refreshing projects');
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
		await projectItems.update(projectId, {
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
@reference "~/assets/css/tailwind.css";
.projects-board {
	.projects-board__board {
		@apply relative;
	}
	.projects-board__board-filters {
		@apply relative max-w-[2000px];
	}
	.projects-board__board-connection {
		@apply max-w-[2000px];
	}
	.projects-board__board-col {
		@apply border-border/50 border-r;
	}
	.projects-board__board-col-header {
		@apply relative py-4 px-4 border-b border-border sticky top-0 z-10;
		background: rgba(255, 255, 255, 0.78);
		backdrop-filter: saturate(180%) blur(20px);
		-webkit-backdrop-filter: saturate(180%) blur(20px);
		@media (min-width: 1600px) {
			@apply px-8;
		}
	}
	:is(.dark) .projects-board__board-col-header {
		background: rgba(20, 20, 20, 0.78);
	}
	.projects-board__board-col-content {
		@apply min-h-screen lg:h-svh h-full py-3 bg-muted/20 dark:bg-card/30 overflow-y-auto px-3;
		scrollbar-width: none;
		-ms-overflow-style: none;
		&::-webkit-scrollbar {
			display: none;
		}
		@media (min-width: 1600px) {
			@apply px-6;
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
		background: hsl(var(--border));
	}
	.projects-board__board::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		height: 1px;
		z-index: 10;
		background: hsl(var(--border));
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
