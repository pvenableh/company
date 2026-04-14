<template>
	<div class="w-full flex items-center justify-center px-8 md:px-20">
		<div class="relative flex w-full items-center justify-between max-w-[600px]">
			<!-- Background track -->
			<div class="absolute top-1/2 left-0 right-0 h-1 bg-gray-200 transform -translate-y-1/2"></div>

			<!-- Colored progress bar -->
			<div
				class="absolute top-1/2 left-0 h-1 transform -translate-y-1/2"
				:style="{
					width: `${(statusIndex / (statuses.length - 1)) * 100}%`,
					backgroundImage: progressGradient,
				}"
			></div>

			<!-- Status points -->
			<div
				v-for="(status, index) in statuses"
				:key="status.id || status"
				class="relative flex-shrink-0 w-4 h-4 border-4 rounded-full flex items-center justify-center transition-all duration-300 bg-gray-100"
				:class="[
					statusIndex >= index
						? 'shadow cursor-pointer hover:scale-110'
						: 'border-gray-200 cursor-pointer hover:border-gray-400 hover:scale-110',
					currentStatus === (status.id || status) ? 'scale-125' : '',
				]"
				:style="getBorderColorStyle(index, statusIndex >= index)"
				:title="status.name || status"
				@click="handleStatusClick(status.id || status, index)"
				:data-status="status.id || status"
			>
				<!-- Animate current status point -->
				<div
					class="absolute w-5 h-5 border-4 rounded-full flex items-center justify-center animate-ping"
					:style="getBorderColorStyle(index, statusIndex >= index)"
					v-if="currentStatus === (status.id || status)"
				></div>

				<!-- Status label -->
				<span
					class="absolute text-[8px] top-full uppercase mt-2 w-[60px] text-center whitespace-normal"
					:style="{ left: '-22px' }"
				>
					{{ status.name || status }}
				</span>
			</div>
		</div>
	</div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
	/**
	 * Array of status objects or strings
	 * If objects, each should have at least id and name properties
	 * If strings, they will be used as both id and display name
	 */
	statuses: {
		type: Array,
		default: () => ['Pending', 'Scheduled', 'In Progress', 'Completed'],
		required: true,
	},
	/**
	 * Current status value (string id or status object)
	 */
	currentStatus: {
		type: String,
		default: 'Pending',
	},
	/**
	 * Background gradient for the progress bar
	 */
	gradient: {
		type: String,
		default: 'linear-gradient(to right, var(--cyan), var(--green))',
	},
	/**
	 * Optional collection/table name for the item being updated
	 */
	collection: {
		type: String,
		default: null,
	},
	/**
	 * Optional item ID being updated
	 */
	itemId: {
		type: String,
		default: null,
	},
	/**
	 * Whether the timeline is in loading state
	 */
	loading: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(['update:currentStatus', 'status-change', 'click']);

// Local state
const isUpdating = ref(false);
const { getStatusAccent } = useStatusStyle();

// Computed values for handling both string and object status arrays
const normalizedStatuses = computed(() => {
	return props.statuses.map((status) => {
		if (typeof status === 'string') {
			return { id: status, name: status };
		}
		return status;
	});
});

// Get the index of current status
const statusIndex = computed(() => {
	const index = normalizedStatuses.value.findIndex((s) => s.id === props.currentStatus);
	return index === -1 ? 0 : index;
});

// Build gradient from status accent colors
const progressGradient = computed(() => {
	const colors = normalizedStatuses.value.map((s) => getStatusAccent(s.id));
	return `linear-gradient(to right, ${colors.join(', ')})`;
});

const getBorderColorClass = (index, isActive) => {
	if (!isActive) return 'border-gray-200';
	// Return empty — we use inline style for border color instead
	return '';
};

const getBorderColorStyle = (index, isActive) => {
	if (!isActive) return {};
	const status = normalizedStatuses.value[index];
	if (!status) return {};
	return { borderColor: getStatusAccent(status.id) };
};

// Handle status click
const handleStatusClick = async (statusId, index) => {
	if (props.loading || isUpdating.value) return;

	// Don't do anything if clicking current status
	if (statusId === props.currentStatus) return;

	isUpdating.value = true;

	try {
		// Emit both the update event for v-model and a more detailed event
		emit('update:currentStatus', statusId);
		emit('status-change', {
			oldStatus: props.currentStatus,
			newStatus: statusId,
			collection: props.collection,
			itemId: props.itemId,
		});

		// Also emit a generic click event with status info
		emit('click', {
			status: statusId,
			index,
			collection: props.collection,
			itemId: props.itemId,
		});
	} catch (error) {
		console.error('Error updating status:', error);
	} finally {
		isUpdating.value = false;
	}
};
</script>

<style scoped>
/* Optional animation for status changes */
@keyframes pulse {
	0% {
		transform: scale(1);
		opacity: 1;
	}
	50% {
		transform: scale(1.1);
		opacity: 0.8;
	}
	100% {
		transform: scale(1);
		opacity: 1;
	}
}

.animate-pulse {
	animation: pulse 1.5s infinite;
}
</style>
