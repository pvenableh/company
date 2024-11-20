<script setup>
import VueDraggable from 'vuedraggable';
const { updateItem } = useDirectusItems();
const { registerRefreshCallback } = useTicketsStore();
const { user } = useDirectusAuth();

const ADMIN_ROLE = '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01';
const isAdmin = computed(() => user.value?.role === ADMIN_ROLE);

const columns = [
	{ id: 'Pending', name: 'Pending', color: 'gray' },
	{ id: 'Scheduled', name: 'Scheduled', color: 'black' },
	{ id: 'In Progress', name: 'In Progress', color: 'blue' },
	{ id: 'Completed', name: 'Completed', color: 'green' },
];

const localTickets = ref(
	columns.reduce((acc, column) => {
		acc[column.id] = [];
		return acc;
	}, {}),
);

const activeColumn = ref(columns[0].id);
const isMobile = ref(false);
const updatingTickets = ref(new Set());
const isDragging = ref(false);
const selectedOrg = ref(null);

const orgOptions = computed(() => {
	if (!user.value?.organizations) return [];
	return [
		{ id: null, name: 'All Organizations' },
		...user.value.organizations.map((org) => ({
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
	'assigned_to.id',
	'assigned_to.directus_users_id.id',
	'assigned_to.directus_users_id.first_name',
	'assigned_to.directus_users_id.last_name',
	'assigned_to.directus_users_id.avatar',
	'assigned_to.directus_users_id.email',
];

const getFilter = () => {
	if (isAdmin.value) {
		return {}; // Get all tickets for admin
	}

	// Non-admin users get tickets for their organizations
	return {
		organization: {
			_in: user.value.organizations?.map((org) => org.organizations_id.id) || [],
		},
	};
};

const {
	data: tickets,
	isLoading,
	isConnected,
	error,
	lastUpdated,
	refresh,
} = useRealtimeSubscription('tickets', fields, getFilter(), '-date_updated');

watch(
	[() => tickets.value, () => selectedOrg.value],
	([newTickets, newOrg]) => {
		if (!newTickets) return;

		// Apply organization filter in memory
		const filtered = newTickets.filter((ticket) => {
			if (!isAdmin.value) return true; // Non-admin users already have filtered data
			if (!newOrg) return true; // Show all if no org selected
			return ticket.organization?.id === newOrg;
		});

		// Update column data
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
	<div class="">
		<!-- Connection Status -->
		<div v-if="!isConnected && !isLoading" class="mb-4">
			<UAlert title="Connection Lost" description="Attempting to reconnect..." color="yellow">
				<template #footer>
					<UButton size="sm" color="yellow" @click="refresh">Retry Connection</UButton>
				</template>
			</UAlert>
		</div>

		<div class="w-full flex flex-col md:flex-row items-center justify-between mb-4 px-4">
			<TicketsCreate :columns="columns" @ticketCreated="handleTicketCreated" />
			<div v-if="hasMultipleOrgs" class="mb-4 flex items-center space-x-2">
				<USelect
					v-model="selectedOrg"
					:options="orgOptions"
					option-attribute="name"
					value-attribute="id"
					placeholder="Select Organization"
					class="w-64"
				/>
			</div>
			<div v-if="lastUpdated" class="text-xs text-gray-500 mt-2 md:mt-0 font-bold uppercase">
				Last updated: {{ new Date(lastUpdated).toLocaleTimeString() }}
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
				class="flex-shrink-0 w-full md:w-80 shadow h-full min-h-dvh transition-transform duration-300 ease-in-out bg-gray-50 dark:bg-gray-800"
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
