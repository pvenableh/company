<!-- TaskBoard.vue -->
<script setup>
import { ref, computed } from 'vue';
import { useRealtimeSubscription } from './composables/useRealtimeSubscription';

const { user } = useDirectusAuth();
const { updateItem, deleteItems } = useDirectusItems();

// Categories for the board columns
const categories = ['Pending', 'Scheduled', 'In Progress', 'Complete'];

// Use realtime subscription for tickets
// const { data: tickets } = useRealtimeSubscription(
// 	'tickets',
// 	[
// 		'id',
// 		'title',
// 		'description',
// 		'category',
// 		'due_date',
// 		'assigned_to.*',
// 		'user_created.*',
// 		'date_created',
// 		'date_updated',
// 	],
// 	null,
// 	'-date_created',
// );

// For tickets, let's be explicit about the fields we want
const {
	data: tickets,
	error,
	isLoading,
} = useRealtimeSubscription(
	'tickets',
	[
		'id',
		'title',
		'description',
		'status',
		'sort',
		'user_created',
		'date_created',
		'user_updated',
		'date_updated',
		'category',
		'due_date',
	],
	{},
	'-date_created',
);

// Debug watches
watch(
	tickets,
	(newTickets) => {
		console.log('Tickets updated:', newTickets);
	},
	{ deep: true },
);

watch(error, (newError) => {
	if (newError) {
		console.error('Subscription error:', newError);
	}
});

watch(isLoading, (loading) => {
	console.log('Loading state:', loading);
});

// Computed to organize tickets by category
const ticketsByCategory = computed(() => {
	const grouped = {};
	categories.forEach((category) => {
		grouped[category] = tickets.value.filter((ticket) => ticket.category === category);
	});
	return grouped;
});

// Drag and drop handling
const draggingTicket = ref(null);

const onDragStart = (ticket) => {
	draggingTicket.value = ticket;
};

const onDrop = async (category) => {
	if (!draggingTicket.value) return;

	try {
		await updateItem('tickets', draggingTicket.value.id, {
			category,
			date_updated: new Date().toISOString(),
		});
	} catch (error) {
		console.error('Error updating ticket category:', error);
	}

	draggingTicket.value = null;
};

const allowDrop = (e) => {
	e.preventDefault();
};
</script>

<template>
	<div class="task-board min-h-screen bg-gray-50 p-6">
		<div class="mb-6 flex justify-between items-center">
			<h1 class="text-2xl font-bold">Task Board</h1>
			<UButton to="/tickets/new" icon="i-heroicons-plus" color="primary">New Ticket</UButton>
		</div>
		<div class="w-full bg-green-50">
			<div v-for="item in ticketsByCategory" :key="item.id">{{ item.title }}</div>
		</div>
		<div v-for="item in tickets" :key="item.id">{{ item.title }}</div>
		<div class="grid grid-cols-4 gap-4">
			<div
				v-for="category in categories"
				:key="category"
				class="board-column bg-gray-100 rounded-lg p-4"
				@drop="onDrop(category)"
				@dragover="allowDrop"
			>
				<div class="flex items-center justify-between mb-4">
					<h2 class="font-semibold text-lg">{{ category }}</h2>
					<UBadge>{{ ticketsByCategory[category].length }}</UBadge>
				</div>

				<TransitionGroup name="ticket" tag="div" class="space-y-4">
					<TasksTaskCard
						v-for="ticket in ticketsByCategory[category]"
						:key="ticket.id"
						:ticket="ticket"
						draggable="true"
						@dragstart="onDragStart(ticket)"
					/>
				</TransitionGroup>
			</div>
		</div>
	</div>
</template>

<style scoped>
.ticket-enter-active,
.ticket-leave-active {
	transition: all 0.3s ease;
}

.ticket-enter-from,
.ticket-leave-to {
	opacity: 0;
	transform: translateY(30px);
}
</style>

<!-- TaskCard.vue -->

<!-- CreateTicketForm.vue -->
