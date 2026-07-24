<!--
  StatusTimeline — the app's status control. Renders the shared gradient
  segmented PILL (same treatment as the ticket status / priority bars): a
  rounded-full track with a palette-driven lifecycle gradient revealed by a
  progress mask, one clickable segment per status.

  Props + events are unchanged from the legacy dotted-line version, so every
  call site (leads / invoices / project events / edit forms) gets the new look
  without changes. Emits only — the parent persists via @status-change.
-->
<template>
	<div class="w-full">
		<div class="relative">
			<div
				class="segmented-track relative flex items-center rounded-full overflow-hidden h-6"
				:class="{ 'opacity-60 pointer-events-none': loading }"
			>
				<!-- Full-width gradient background -->
				<div class="absolute inset-0 w-full h-full" :style="{ background: effectiveGradient }"></div>

				<!-- Mask that hides the not-yet-reached portion. -->
				<div
					class="absolute inset-0 bg-muted dark:bg-gray-700 h-full transition-all duration-300 origin-right"
					:style="{ width: `${100 - progressWidth}%`, right: 0, left: 'auto' }"
				></div>

				<!-- Segments -->
				<div class="relative flex w-full h-full z-10">
					<button
						v-for="(status, index) in normalizedStatuses"
						:key="status.id"
						type="button"
						class="segmented-step flex-1 min-w-0 h-full flex items-center justify-center cursor-pointer uppercase !text-[9px] px-1 transition-colors"
						:class="statusIndex >= index ? 'text-white font-medium' : 'text-gray-600 dark:text-gray-400'"
						:title="status.name"
						:disabled="loading"
						@click="handleStatusClick(status.id, index)"
					>
						<span class="truncate">{{ status.name }}</span>
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
	statuses: {
		type: Array,
		default: () => ['Pending', 'Scheduled', 'In Progress', 'Completed'],
		required: true,
	},
	currentStatus: { type: String, default: 'Pending' },
	/** Optional gradient override. Empty → the shared palette lifecycle gradient. */
	gradient: { type: String, default: '' },
	collection: { type: String, default: null },
	itemId: { type: String, default: null },
	loading: { type: Boolean, default: false },
});

const emit = defineEmits(['update:currentStatus', 'status-change', 'click']);

const isUpdating = ref(false);
const { statusGradient } = useStatusStyle();

const normalizedStatuses = computed(() =>
	props.statuses.map((s) => (typeof s === 'string' ? { id: s, name: s } : s)),
);

const statusIndex = computed(() => {
	const i = normalizedStatuses.value.findIndex((s) => s.id === props.currentStatus);
	return i === -1 ? 0 : i;
});

// Fill up to and including the current segment.
const progressWidth = computed(() => {
	const n = normalizedStatuses.value.length;
	if (!n) return 0;
	return ((statusIndex.value + 1) / n) * 100;
});

const effectiveGradient = computed(() => props.gradient || statusGradient);

async function handleStatusClick(statusId, index) {
	if (props.loading || isUpdating.value || statusId === props.currentStatus) return;
	isUpdating.value = true;
	try {
		emit('update:currentStatus', statusId);
		emit('status-change', { oldStatus: props.currentStatus, newStatus: statusId, collection: props.collection, itemId: props.itemId });
		emit('click', { status: statusId, index, collection: props.collection, itemId: props.itemId });
	} finally {
		isUpdating.value = false;
	}
}
</script>

<style scoped>
.segmented-track {
	background-color: rgba(229, 231, 235, 0.5);
	box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.06);
}
.segmented-step::after {
	content: '';
	position: absolute;
	right: 0;
	top: 25%;
	height: 50%;
	width: 1px;
	background-color: rgba(209, 213, 219, 0.5);
	z-index: 10;
}
.segmented-step:last-child::after { display: none; }
.segmented-step:hover { background-color: rgba(0, 0, 0, 0.05); }
</style>
