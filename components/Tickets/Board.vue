<script setup>
import VueDraggable from 'vuedraggable';
const { updateItem } = useDirectusItems();

const columns = [
	{ id: 'pending', name: 'Pending', color: 'gray' },
	{ id: 'scheduled', name: 'Scheduled', color: 'black' },
	{ id: 'in progress', name: 'In Progress', color: 'blue' },
	{ id: 'completed', name: 'Completed', color: 'green' },
];

// Setup realtime subscription for tickets
// const fields = [
// 	'id',
// 	'title',
// 	'category',
// 	'description',
// 	'status',
// 	'priority',
// 	'date_created',
// 	'date_updated',
// 	'assigned_to.directus_users_id.id',
// 	'assigned_to.directus_users_id.first_name',
// 	'assigned_to.directus_users_id.last_name',
// 	'assigned_to.directus_users_id.avatar',
// ];

const fields = [
	'id',
	'title',
	'category',
	'description',
	'status',
	'priority',
	'date_created',
	'date_updated',
	'assigned_to.directus_users_id.*', // Get all user fields
];

const sort = ['-date_updated'];

const {
	data: tickets,
	isLoading,
	isConnected,
	error,
	lastUpdated,
	refresh,
} = useRealtimeSubscription('tickets', fields, {}, '-date_updated');

const localTickets = ref({});
const updatingTickets = ref(new Set()); // Track tickets being updated
const isDragging = ref(false);

// Initialize and update localTickets when tickets change
watch(
	() => tickets.value,
	(newTickets) => {
		if (!newTickets) return;

		columns.forEach((column) => {
			localTickets.value[column.id] = newTickets.filter((ticket) => ticket.status === column.id);
		});
	},
	{ immediate: true },
);

// Handle drag and drop changes
const updateTicketStatus = async (columnId, event) => {
	if (!event.added) return;

	const ticketId = event.added.element.id;
	const newStatus = columnId;

	// Add ticket to updating set
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

		// Revert the change in local state
		const originalStatus = event.added.element.status;
		localTickets.value[originalStatus].push(event.added.element);
		localTickets.value[columnId] = localTickets.value[columnId].filter((t) => t.id !== ticketId);

		// Show error toast
		useToast().add({
			title: 'Error updating ticket',
			description: 'Failed to update ticket status. Please try again.',
			color: 'red',
		});
	} finally {
		// Remove ticket from updating set
		updatingTickets.value.delete(ticketId);
	}
};

// Drag event handlers
const onDragStart = () => {
	isDragging.value = true;
};

const onDragEnd = () => {
	isDragging.value = false;
};

const handleTicketCreated = () => {
	// Force refresh the subscription
	refresh();

	console.log('Refreshing board after ticket creation');
};
</script>

<template>
	<div class="p-4">
		<!-- Connection Status -->
		<div v-if="!isConnected && !isLoading" class="mb-4">
			<UAlert title="Connection Lost" description="Attempting to reconnect..." color="yellow">
				<template #footer>
					<UButton size="sm" color="yellow" @click="refresh">Retry Connection</UButton>
				</template>
			</UAlert>
		</div>
		<div class="w-full flex flex-row items-center justify-between">
			<TicketsCreate :columns="columns" @ticketCreated="handleTicketCreated" />
			<!-- Last Updated -->
			<div v-if="lastUpdated" class="text-xs text-gray-500 mb-2 font-bold uppercase">
				Last updated: {{ new Date(lastUpdated).toLocaleTimeString() }}
			</div>
		</div>

		<div class="flex gap-4 overflow-x-auto min-h-[calc(100svh-20px)]">
			<div v-for="column in columns" :key="column.id" class="flex-shrink-0 w-80 shadow-lg h-full">
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
					class="min-h-svh p-2 rounded-b-lg bg-gray-50 dark:bg-gray-800"
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
					class="min-h-svh p-2 rounded-b-lg bg-gray-50 dark:bg-gray-800"
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
								<!-- Loading Overlay -->
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
								/>
							</div>
						</div>
					</template>
				</VueDraggable>

				<!-- Drop Zone Indicator -->
				<div class="drop-zone-indicator" :class="{ show: isDragging }">Drop here</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
/* Base transitions for all tickets */
.ticket-wrapper {
	transition: all 0.3s ease;
}

/* Ghost styling (the placeholder where the ticket was dragged from) */
.ghost {
	opacity: 0.5;
	background: #f0f0f0;
	border: 2px dashed #ccc;
	border-radius: 0.5rem;
}

/* Chosen styling (the ticket being dragged) */
.chosen {
	transform: scale(1.02);
	box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
}

/* Drag styling (while being dragged) */
.drag {
	opacity: 0.9;
	transform: scale(1.05);
	box-shadow: 0 15px 25px rgba(0, 0, 0, 0.15);
}

/* Column hover effects during dragging */
.is-dragging {
	background: rgba(59, 130, 246, 0.05);
	border: 2px dashed rgba(59, 130, 246, 0.2);
	border-radius: 0.5rem;
	transition: all 0.3s ease;
}

/* Drop zone indicator */
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

/* Animation for tickets entering/leaving columns */
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
