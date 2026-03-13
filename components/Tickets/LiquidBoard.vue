<template>
	<div class="fixed inset-0 overflow-hidden touch-none bg-muted">
		<!-- SVG Filter Definition -->
		<svg class="absolute w-0 h-0">
			<defs>
				<filter id="goo">
					<feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
					<feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" result="goo" />
					<feComposite in="SourceGraphic" in2="goo" operator="atop" />
				</filter>
			</defs>
		</svg>

		<!-- Loading State -->
		<div v-if="isLoading" class="absolute inset-0 flex items-center justify-center">
			<UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-muted-foreground" />
		</div>

		<!-- Connection Status -->
		<Transition name="fade">
			<div v-if="!isConnected && !isLoading" class="absolute top-4 right-4">
				<UAlert title="Connection Lost" description="Attempting to reconnect..." color="yellow">
					<template #footer>
						<UButton size="sm" color="yellow" @click="refresh">Retry Connection</UButton>
					</template>
				</UAlert>
			</div>
		</Transition>

		<template v-if="!isLoading">
			<!-- Column Headers -->
			<div class="absolute top-4 w-full px-4 flex justify-between">
				<h3 v-for="column in columns" :key="column.id" class="text-sm font-medium text-gray-600 dark:text-gray-300">
					{{ column.name }}
					<UBadge :color="getColumnColor(column.id)" class="ml-2">
						{{ ticketsByStatus[column.id]?.length || 0 }}
					</UBadge>
				</h3>
			</div>

			<!-- Main Container -->
			<div ref="blobContainer" class="absolute inset-0 filter goo">
				<!-- Background Blobs -->
				<div
					v-for="(column, index) in columns"
					:key="'blob-' + column.id"
					class="absolute w-24 h-24 rounded-full opacity-10 dark:opacity-20 transition-colors duration-300"
					:class="getColumnColor(column.id)"
					:style="{
						left: `${(index + 0.5) * (100 / columns.length)}%`,
						top: '50%',
						transform: 'translate(-50%, -50%)',
					}"
				/>

				<!-- Tickets -->
				<div
					v-for="ticket in localTickets"
					:key="ticket.id"
					:ref="(el) => setTicketRef(el, ticket)"
					class="absolute cursor-grab active:cursor-grabbing transition-all duration-300"
					:class="[getBubbleSize(ticket.priority), { 'z-50': selectedTicket?.id === ticket.id }]"
					:style="{
						left: `${getColumnX(ticket.status)}px`,
						top: `${getTicketY(ticket, ticketsByStatus[ticket.status].indexOf(ticket))}px`,
					}"
					@pointerdown="startDrag($event, ticket)"
					@click="toggleSelection(ticket)"
				>
					<!-- Ticket Bubble -->
					<div
						class="absolute inset-0 rounded-full flex items-center justify-center transform transition-all duration-300"
						:class="[getPriorityColor(ticket.priority), { 'scale-110': selectedTicket?.id === ticket.id }]"
					>
						<span class="text-white text-xs font-bold select-none">
							{{ ticket.title.substring(0, 2).toUpperCase() }}
						</span>
					</div>

					<!-- Ticket Details Popup -->
					<Transition name="fade">
						<div
							v-if="selectedTicket?.id === ticket.id && !isDragging"
							class="absolute top-full left-1/2 transform -translate-x-1/2 mt-4 bg-card rounded-lg shadow-lg p-4 w-56 z-10"
						>
							<h3 class="font-medium text-sm mb-2">{{ ticket.title }}</h3>
							<div class="flex items-center gap-2">
								<UBadge :color="getPriorityBadgeColor(ticket.priority)" size="xs">
									{{ ticket.priority }}
								</UBadge>
								<span class="text-xs text-muted-foreground">
									{{ ticket.status }}
								</span>
							</div>
						</div>
					</Transition>
				</div>
			</div>
		</template>
	</div>
</template>

<script setup>
import { gsap } from 'gsap';
import { Draggable } from 'gsap/all';
import { onMounted, onUnmounted, ref, computed, nextTick, watch } from 'vue';

// Register GSAP plugins
if (typeof window !== 'undefined') {
	gsap.registerPlugin(Draggable);
}

const props = defineProps({
	columns: {
		type: Array,
		required: true,
	},
	projectId: {
		type: String,
		default: null,
	},
});

// State management
const localTickets = ref([]);
const blobContainer = ref(null);
const ticketRefs = ref({});
const selectedTicket = ref(null);
const isDragging = ref(false);
const draggedTicket = ref(null);
const draggableInstances = ref([]);

// API integration
const ticketItems = useDirectusItems('tickets');
const fields = ['id', 'title', 'status', 'priority', 'date_updated'];

const getFilter = () => {
	const filter = {};
	if (props.projectId) {
		filter.project = { _eq: props.projectId };
	}
	return filter;
};

const { data: tickets, isLoading, isConnected, refresh } = useRealtimeSubscription('tickets', fields, getFilter());

// Computed properties
const ticketsByStatus = computed(() => {
	return localTickets.value.reduce((acc, ticket) => {
		acc[ticket.status] = acc[ticket.status] || [];
		acc[ticket.status].push(ticket);
		return acc;
	}, {});
});

// Utility functions
const setTicketRef = (el, ticket) => {
	if (el) ticketRefs.value[ticket.id] = el;
};

const getBubbleSize = (priority) =>
	({
		urgent: 'h-20 w-20',
		high: 'h-18 w-18',
		medium: 'h-16 w-16',
		low: 'h-14 w-14',
	})[priority] || 'h-16 w-16';

const getPriorityColor = (priority) =>
	({
		low: 'bg-gray-500',
		medium: 'bg-blue-500',
		high: 'bg-yellow-500',
		urgent: 'bg-red-500',
	})[priority] || 'bg-blue-500';

const getColumnColor = (columnId) =>
	({
		Pending: 'gray',
		'In Progress': 'yellow',
		Completed: 'green',
	})[columnId] || 'gray';

const getPriorityBadgeColor = (priority) =>
	({
		low: 'gray',
		medium: 'blue',
		high: 'yellow',
		urgent: 'red',
	})[priority] || 'blue';

const getColumnX = (status) => {
	if (!blobContainer.value) return 0;
	const columnIndex = props.columns.findIndex((col) => col.id === status);
	const columnWidth = blobContainer.value.offsetWidth / props.columns.length;
	return columnWidth * (columnIndex + 0.5);
};

const getTicketY = (ticket, index) => {
	if (!blobContainer.value) return 0;
	const baseY = blobContainer.value.offsetHeight * 0.3;
	return baseY + (index % 3) * 100;
};

// Drag handling
const startDrag = (event, ticket) => {
	isDragging.value = true;
	draggedTicket.value = ticket;
	selectedTicket.value = ticket;

	const element = ticketRefs.value[ticket.id];
	if (!element || !Draggable) return;

	const draggable = Draggable.create(element, {
		type: 'x,y',
		bounds: blobContainer.value,
		inertia: false,
		dragResistance: 0,
		edgeResistance: 0.65,
		onDragStart: () => {
			gsap.set(element, { zIndex: 1000 });
		},
		onDragEnd: function () {
			handleDragEnd(this.x);
			gsap.set(element, { zIndex: 'auto' });
		},
	})[0];

	draggableInstances.value.push(draggable);
	draggable.startDrag(event);
};

const handleDragEnd = async (finalX) => {
	if (!blobContainer.value) return;

	const columnWidth = blobContainer.value.offsetWidth / props.columns.length;
	const newColumnIndex = Math.floor(finalX / columnWidth);

	if (newColumnIndex >= 0 && newColumnIndex < props.columns.length) {
		const newStatus = props.columns[newColumnIndex].id;
		if (draggedTicket.value && newStatus !== draggedTicket.value.status) {
			await updateTicketStatus(draggedTicket.value.id, newStatus);
		}
	}

	isDragging.value = false;
	draggedTicket.value = null;
	selectedTicket.value = null;
};

const updateTicketStatus = async (ticketId, newStatus) => {
	try {
		await ticketItems.update(ticketId, {
			status: newStatus,
			date_updated: new Date(),
		});

		const ticketIndex = localTickets.value.findIndex((t) => t.id === ticketId);
		if (ticketIndex > -1) {
			localTickets.value[ticketIndex].status = newStatus;
			nextTick(updateTicketPositions);
		}
	} catch (error) {
		console.error('Error updating ticket:', error);
		updateTicketPositions();
	}
};

const toggleSelection = (ticket) => {
	if (isDragging.value) return;
	selectedTicket.value = selectedTicket.value?.id === ticket.id ? null : ticket;
};

const updateTicketPositions = () => {
	if (!blobContainer.value) return;

	localTickets.value.forEach((ticket) => {
		const element = ticketRefs.value[ticket.id];
		if (!element) return;

		const statusGroup = ticketsByStatus.value[ticket.status] || [];
		const index = statusGroup.indexOf(ticket);

		gsap.to(element, {
			x: getColumnX(ticket.status),
			y: getTicketY(ticket, index),
			duration: 0.5,
			ease: 'elastic.out(1, 0.5)',
		});
	});
};

// Lifecycle hooks
watch(
	() => tickets.value,
	(newTickets) => {
		if (newTickets) {
			localTickets.value = [...newTickets];
			nextTick(updateTicketPositions);
		}
	},
	{ deep: true },
);

onMounted(() => {
	nextTick(() => {
		updateTicketPositions();
		window.addEventListener('resize', updateTicketPositions);
	});
});

onUnmounted(() => {
	draggableInstances.value.forEach((instance) => instance.kill());
	draggableInstances.value = [];
	window.removeEventListener('resize', updateTicketPositions);
});
</script>

<style>
.goo {
	filter: url('#goo');
}

.fade-enter-active,
.fade-leave-active {
	transition: all 0.3s ease;
}

.fade-leave-active {
	position: absolute;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
	transform: translateY(-10px);
}

.select-none {
	user-select: none;
	-webkit-user-select: none;
}
</style>
