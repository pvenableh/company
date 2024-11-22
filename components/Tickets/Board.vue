<script setup>
import VueDraggable from 'vuedraggable';
const { updateItem } = useDirectusItems();
const { registerRefreshCallback } = useTicketsStore();
const { user } = useDirectusAuth();

const props = defineProps({
	projectId: {
		type: String,
		default: null,
	},
});

const columns = [
	{ id: 'Pending', name: 'Pending', color: 'gray' },
	{ id: 'Scheduled', name: 'Scheduled', color: 'black' },
	{ id: 'In Progress', name: 'In Progress', color: 'blue' },
	{ id: 'Completed', name: 'Completed', color: 'green' },
];

const activeColumn = ref(columns[0].id);
const isMobile = ref(false);
const updatingTickets = ref(new Set());
const isDragging = ref(false);

const ADMIN_ROLE = '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01';
const isAdmin = computed(() => user.value?.role === ADMIN_ROLE);
const selectedOrg = ref(null);
const selectedProject = ref(null);
const projectOptions = ref([]);
const filterByAssignedTo = ref(false);

const localTickets = ref(
	columns.reduce((acc, column) => {
		acc[column.id] = [];
		return acc;
	}, {}),
);

if (props.projectId) {
	selectedProject.value = props.projectId;
}

const fetchProjects = async () => {
	if (props.projectId) {
		selectedProject.value = props.projectId;
		return;
	}

	const { readItems } = useDirectusItems();
	let filter = {};

	if (!isAdmin.value) {
		const userOrgs = user.value?.organizations || [];
		filter = {
			organization: {
				_in: userOrgs.map((org) => org.organizations_id.id),
			},
		};
	} else if (selectedOrg.value) {
		filter = {
			organization: { _eq: selectedOrg.value },
		};
	}

	const projects = await readItems('projects', {
		fields: ['id', 'title', 'organization.id', 'organization.name'],
		filter,
		sort,
	});

	projectOptions.value = [{ id: null, title: 'All Projects' }, ...projects];
};
// // Fetch projects for the organization
// const fetchProjects = async (orgId) => {
// 	if (props.projectId) {
// 		selectedProject.value = props.projectId;
// 		return;
// 	}
// 	if (!orgId) {
// 		projectOptions.value = [{ id: null, title: 'All Projects' }];
// 		return;
// 	}

// 	const { readItems } = useDirectusItems();
// 	const projects = await readItems('projects', {
// 		fields: ['id', 'title'],
// 		filter: {
// 			organization: { _eq: orgId },
// 		},
// 	});

// 	projectOptions.value = [{ id: null, title: 'All Projects' }, ...projects];
// 	console.log('Fetched projects:', projectOptions.value);
// };

const orgOptions = computed(() => {
	const userOrgs = user.value?.organizations || [];
	return [
		{ id: null, name: 'All Organizations' }, // Ensure id is explicitly null
		...userOrgs.map((org) => ({
			id: org.organizations_id.id,
			name: org.organizations_id.name,
		})),
	];
});

const hasMultipleOrgs = computed(() => isAdmin.value && orgOptions.value.length > 1);

const fields = [
	'id',
	'title',
	'description',
	'status',
	'priority',
	'date_created',
	'date_updated',
	'user_updated.first_name',
	'user_updated.last_name',
	'user_updated.id',
	'user_created.first_name',
	'user_created.last_name',
	'user_created.id',
	'due_date',
	'organization.id',
	'organization.name',
	'organization.logo',
	'project.id',
	'project.title',
	'project.url',
	'assigned_to.id',
	'assigned_to.directus_users_id.id',
	'assigned_to.directus_users_id.first_name',
	'assigned_to.directus_users_id.last_name',
	'assigned_to.directus_users_id.avatar',
	'assigned_to.directus_users_id.email',
	'comments',
	'tasks',
];

// const getFilter = () => {
// 	const filter = {};

// 	if (!isAdmin.value) {
// 		const userOrgs = user.value?.organizations || [];
// 		filter._and = [
// 			{
// 				organization: {
// 					_in: userOrgs.map((org) => org.organizations_id.id),
// 				},
// 			},
// 		];
// 	} else if (selectedOrg.value) {
// 		filter._and = [
// 			{
// 				organization: { _eq: selectedOrg.value },
// 			},
// 		];
// 	}

// 	if (selectedProject.value) {
// 		const projectFilter = { project: { _eq: selectedProject.value } };
// 		filter._and = filter._and ? [...filter._and, projectFilter] : [projectFilter];
// 	}

// 	console.log('Final filter:', filter);
// 	return filter;
// };

const getFilter = () => {
	const filter = {
		_and: [],
	};

	// Organization filter
	if (!isAdmin.value) {
		filter._and.push({
			organization: {
				_in: user.value?.organizations.map((org) => org.organizations_id.id),
			},
		});
	} else if (selectedOrg.value) {
		filter._and.push({
			organization: { _eq: selectedOrg.value },
		});
	}

	// Project filter
	if (selectedProject.value) {
		filter._and.push({
			project: { _eq: selectedProject.value },
		});
	}

	// Assignment filter - Fixed to properly check the junction table
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

	console.log('Applied filter:', filter); // For debugging
	return filter;
};

const {
	data: tickets,
	isLoading,
	isConnected,
	error,
	lastUpdated,
	refresh,
} = useRealtimeSubscription('tickets', fields, getFilter(), '-date_updated');

const handleSelectChange = (value) => {
	// Fix the selected value to ensure "All Organizations" maps to null
	selectedOrg.value = value === 'null' || value === 'All Organizations' ? null : value;
	selectedProject.value = null; // Reset project selection when org changes
};

const handleProjectChange = (value) => {
	selectedProject.value = value === 'null' || value === 'All Projects' ? null : value;
};

watch(selectedOrg, async (newOrg) => {
	selectedProject.value = null;
	if (isAdmin.value) {
		// Admin users need to refetch projects when org changes
		await fetchProjects();
	}
});

watch([selectedOrg, selectedProject, filterByAssignedTo], () => {
	refresh();
});

watch(
	[() => tickets.value, selectedOrg, selectedProject, filterByAssignedTo],
	([newTickets]) => {
		if (!newTickets) return;

		console.log('Filtering tickets:', {
			total: newTickets.length,
			filterByAssignedTo: filterByAssignedTo.value,
			userId: user.value?.id,
		});

		const filtered = newTickets.filter((ticket) => {
			// Base organization and project filtering
			const orgMatch = !selectedOrg.value || ticket.organization?.id === selectedOrg.value;
			const projectMatch = !selectedProject.value || ticket.project?.id === selectedProject.value;

			// Assignment filtering
			let assignmentMatch = true;
			if (filterByAssignedTo.value && user.value) {
				assignmentMatch = ticket.assigned_to?.some((assignment) => assignment.directus_users_id?.id === user.value.id);
			}

			return orgMatch && projectMatch && assignmentMatch;
		});

		console.log('Filtered result:', filtered.length);

		columns.forEach((column) => {
			localTickets.value[column.id] = filtered.filter((ticket) => ticket.status === column.id);
		});
	},
	{ immediate: true },
);

onMounted(() => {
	checkMobile();
	window.addEventListener('resize', checkMobile);
	registerRefreshCallback(refresh);
});

onUnmounted(() => {
	window.removeEventListener('resize', checkMobile);
});

function checkMobile() {
	isMobile.value = window.innerWidth < 768;
}

function nextColumn() {
	const currentIndex = columns.findIndex((col) => col.id === activeColumn.value);
	activeColumn.value = columns[(currentIndex + 1) % columns.length].id;
}

function previousColumn() {
	const currentIndex = columns.findIndex((col) => col.id === activeColumn.value);
	activeColumn.value = columns[(currentIndex - 1 + columns.length) % columns.length].id;
}

const touchStart = ref({ x: 0, y: 0 });

function handleTouchStart(event) {
	touchStart.value = {
		x: event.touches[0].clientX,
		y: event.touches[0].clientY,
	};
}

function handleTouchEnd(event) {
	const touchEnd = {
		x: event.changedTouches[0].clientX,
		y: event.changedTouches[0].clientY,
	};

	const deltaX = touchEnd.x - touchStart.value.x;
	const deltaY = touchEnd.y - touchStart.value.y;

	if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
		if (deltaX > 0) {
			previousColumn();
		} else {
			nextColumn();
		}
	}
}

const onDragStart = () => {
	isDragging.value = true;
};

const onDragEnd = () => {
	isDragging.value = false;
};

const updateTicketStatus = async (columnId, event) => {
	if (!event.added) return;

	const ticketId = event.added.element.id;
	const newStatus = columnId;

	updatingTickets.value.add(ticketId);

	try {
		await updateItem('tickets', ticketId, {
			status: newStatus,
			date_updated: new Date(),
		});

		const ticket = event.added.element;
		ticket.status = newStatus;
	} catch (error) {
		console.error('Error updating ticket:', error);

		const originalStatus = event.added.element.status;
		localTickets.value[originalStatus].push(event.added.element);
		localTickets.value[columnId] = localTickets.value[columnId].filter((t) => t.id !== ticketId);

		useToast().add({
			title: 'Error updating ticket',
			description: 'Failed to update ticket status. Please try again.',
			color: 'red',
		});
	} finally {
		updatingTickets.value.delete(ticketId);
	}
};

const handleTicketCreated = () => {
	refresh();
	console.log('Refreshing board after ticket creation');
};
</script>
<template>
	<div class="max-w-screen-2xl mx-auto">
		<!-- Connection Status -->
		<div v-if="!isConnected && !isLoading" class="mb-4">
			<UAlert title="Connection Lost" description="Attempting to reconnect..." color="yellow">
				<template #footer>
					<UButton size="sm" color="yellow" @click="refresh">Retry Connection</UButton>
				</template>
			</UAlert>
		</div>

		<div class="w-full flex flex-col md:flex-row items-center justify-between mb-4 px-4 pt-4">
			<TicketsCreate :columns="columns" @ticketCreated="handleTicketCreated" />

			<div v-if="!projectId" class="flex items-center gap-4 relative">
				<div class="flex flex-row items-center justify-center space-x-2">
					<UToggle v-model="filterByAssignedTo" class="" />

					<span class="text-[10px] text-gray-500 uppercase">
						{{ filterByAssignedTo ? 'My Tickets' : 'All Tickets' }}
					</span>
				</div>
				<div class="flex items-center space-x-2">
					<USelectMenu
						v-if="hasMultipleOrgs"
						searchable
						v-model="selectedOrg"
						:options="orgOptions"
						option-attribute="name"
						value-attribute="id"
						placeholder="Select Organization"
						class="w-full lg:w-64 uppercase text-[10px] text-gray-400 relative"
						@change="handleSelectChange"
					/>
					<UInput v-else class="w-64 uppercase text-[10px]" :value="user" disabled />
				</div>
				<div class="flex items-center space-x-2">
					<USelectMenu
						searchable
						v-model="selectedProject"
						:options="projectOptions"
						option-attribute="title"
						value-attribute="id"
						placeholder="Select Project"
						class="w-full lg:w-64 uppercase text-[10px] text-gray-400 relative"
						@change="handleProjectChange"
					>
						<!-- <USelectMenu
						searchable
						v-model="selectedProject"
						:options="projectOptions.length > 1 ? projectOptions : []"
						option-attribute="title"
						value-attribute="id"
						placeholder="Select Project"
						class="w-full lg:w-64 uppercase text-[10px] text-gray-400 relative"
						@change="handleProjectChange"
						:disabled="projectOptions.length < 1"
					> -->
						<template #option="{ option }">
							<div class="flex flex-col">
								<span>{{ option.title }}</span>
								<span v-if="option.organization" class="text-xs text-gray-500">
									{{ option.organization.name }}
								</span>
							</div>
						</template>
					</USelectMenu>
				</div>

				<div v-if="lastUpdated" class="-top-[18px] text-[10px] right-0 text-gray-500 absolute font-bold uppercase">
					Last updated: {{ new Date(lastUpdated).toLocaleTimeString() }}
				</div>
			</div>
		</div>

		<!-- Mobile Column Navigation -->
		<div v-if="isMobile" class="flex items-center justify-between mb-4 mx-4 rounded bg-gray-500 px-4 py-3 text-white">
			<UIcon name="i-heroicons-chevron-left" class="w-5 h-5" @click="previousColumn" />
			<h3 class="text-sm font-medium uppercase tracking-wide">
				{{ columns.find((col) => col.id === activeColumn)?.name }}
			</h3>
			<UIcon name="i-heroicons-chevron-right" class="w-5 h-5" @click="nextColumn" />
		</div>

		<!-- Board Layout -->
		<div
			class="w-full flex px-4 md:px-0 md:pl-4 md:gap-4 overflow-x-hidden md:overflow-x-auto min-h-[calc(100vh-120px)]"
			@touchstart="handleTouchStart"
			@touchend="handleTouchEnd"
		>
			<div
				v-for="column in columns"
				:key="column.id"
				class="flex-shrink-0 w-full md:w-1/4 min-w-80 shadow h-full min-h-dvh transition-transform duration-300 ease-in-out bg-gray-50 dark:bg-gray-800"
				:class="{
					'hidden md:block': isMobile && column.id !== activeColumn,
					'transform translate-x-0': !isMobile || column.id === activeColumn,
				}"
			>
				<!-- Column Header -->
				<div class="rounded-t-lg p-3 bg-gray-200">
					<div class="flex items-center justify-between">
						<h3 class="text-sm font-medium">{{ column.name }}</h3>
						<UBadge :color="column.color" class="ml-2 w-6 h-6 text-center inline-block">
							{{ localTickets[column.id]?.length || 0 }}
						</UBadge>
					</div>
				</div>

				<!-- Loading State -->
				<div
					v-if="isLoading && !localTickets[column.id]?.length"
					class="min-h-[50vh] p-2 rounded-b-lg bg-gray-50 dark:bg-gray-800"
				>
					<div class="space-y-3">
						<USkeleton v-for="n in 3" :key="n" class="h-24 w-full" />
					</div>
				</div>

				<!-- Draggable Container -->
				<VueDraggable
					v-else
					v-model="localTickets[column.id]"
					:group="{ name: 'tickets' }"
					item-key="id"
					class="min-h-svh h-full py-2 px-2 rounded-b-lg bg-gray-50 dark:bg-gray-800"
					:class="{ 'is-dragging': isDragging }"
					ghost-class="ghost"
					chosen-class="chosen"
					drag-class="drag"
					@start="onDragStart"
					@end="onDragEnd"
					@change="(event) => updateTicketStatus(column.id, event)"
				>
					<template #item="{ element }">
						<div :id="element.id" class="ticket-wrapper">
							<div class="relative">
								<div
									v-if="updatingTickets.has(element.id)"
									class="absolute inset-0 bg-white/50 dark:bg-gray-900/50 rounded-lg flex items-center justify-center z-10"
								>
									<UIcon name="i-heroicons-arrow-path" class="animate-spin h-5 w-5" />
								</div>

								<TicketsExpandableCard
									:element="element"
									:columns="columns"
									:updating-tickets="updatingTickets"
									:class="{ 'opacity-50': updatingTickets.has(element.id) }"
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

<style scoped>
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

.ticket-wrapper {
	transition: all 0.3s ease;
}

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

.is-dragging {
	background: rgba(59, 130, 246, 0.05);
	border: 2px dashed rgba(59, 130, 246, 0.2);
	border-radius: 0.5rem;
	transition: all 0.3s ease;
}

.drop-zone-indicator {
	display: none;
	text-align: center;
	padding: 1rem;
	color: #6b7280;
	font-size: 0.875rem;
	border: 2px dashed #e5e7eb;
	border-radius: 0.5rem;
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

.ticket-move {
	transition: transform 0.5s ease;
}

.ticket-enter-active,
.ticket-leave-active {
	transition: all 0.5s ease;
}

.ticket-enter-from,
.ticket-leave-to {
	opacity: 0;
	transform: translateX(30px);
}
</style>
