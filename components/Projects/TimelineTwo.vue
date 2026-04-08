# Timeline.vue
<script setup>
import { gsap } from 'gsap';

const props = defineProps({
	project: {
		type: Object,
		required: true,
	},
});

const timelineData = reactive({
	startDate: null,
	dueDate: null,
	projectedDate: null,
	completionDate: null,
	today: new Date(),
	earliestDate: null,
	latestDate: null,
	currentProgress: 0,
	daysUntilDue: 0,
	status: 'pending',
	events: [],
});

const calculateTimelineData = () => {
	if (!props.project?.start_date || !props.project?.due_date) return;

	timelineData.startDate = new Date(props.project.start_date);
	timelineData.dueDate = new Date(props.project.due_date);
	timelineData.completionDate = props.project.completion_date ? new Date(props.project.completion_date) : null;
	timelineData.today = new Date();

	// Sort events by date and include them in timeline
	timelineData.events = props.project.events
		? [...props.project.events].sort((a, b) => new Date(a.date) - new Date(b.date))
		: [];

	// Calculate earliest and latest dates including events
	const allDates = [
		timelineData.startDate,
		timelineData.dueDate,
		timelineData.today,
		timelineData.completionDate,
		...timelineData.events.map((event) => new Date(event.date)),
	].filter(Boolean);

	timelineData.earliestDate = new Date(Math.min(...allDates));
	timelineData.latestDate = new Date(Math.max(...allDates));

	// Calculate progress
	const totalDuration = timelineData.dueDate - timelineData.startDate;
	const elapsed = timelineData.today - timelineData.startDate;
	timelineData.currentProgress = timelineData.completionDate ? 100 : Math.min((elapsed / totalDuration) * 100, 100);

	// Calculate days until due
	timelineData.daysUntilDue = Math.ceil((timelineData.dueDate - timelineData.today) / (1000 * 60 * 60 * 24));

	// Determine status
	timelineData.status = timelineData.completionDate
		? timelineData.completionDate <= timelineData.dueDate
			? 'completed-early'
			: 'completed-late'
		: timelineData.today < timelineData.startDate
			? 'pending'
			: timelineData.today <= timelineData.dueDate
				? 'in-progress'
				: 'overdue';
};

const positions = computed(() => {
	if (!timelineData.earliestDate || !timelineData.latestDate) return {};

	const totalDuration = timelineData.latestDate - timelineData.earliestDate;
	const calculatePosition = (date) => ((date - timelineData.earliestDate) / totalDuration) * 100;

	return {
		start: calculatePosition(timelineData.startDate),
		due: calculatePosition(timelineData.dueDate),
		today: calculatePosition(timelineData.today),
		completion: timelineData.completionDate ? calculatePosition(timelineData.completionDate) : null,
		events: timelineData.events.map((event) => ({
			...event,
			position: calculatePosition(new Date(event.date)),
		})),
	};
});

// Uses getFriendlyDateThree from utils/dates.ts
const formatDate = (date) => getFriendlyDateThree(date);

const getStatusColor = computed(
	() =>
		({
			'completed-early': 'bg-green-500',
			'completed-late': 'bg-red-500',
			'in-progress': 'bg-blue-500',
			overdue: 'bg-red-500',
			pending: 'bg-gray-500',
		})[timelineData.status] || 'bg-gray-500',
);

// Watch for project changes
watch(() => props.project, calculateTimelineData, { immediate: true });

// Handle GSAP animations when positions change
let activeTweens = [];

watch(
	positions,
	(newPositions) => {
		activeTweens.forEach(t => t.kill());
		activeTweens = [];

		activeTweens.push(gsap.to('.progress-bar', {
			width: `${newPositions.today}%`,
			duration: 0.6,
			ease: 'power2.out',
		}));

		Object.entries(newPositions).forEach(([type, position]) => {
			if (position !== null && type !== 'events') {
				activeTweens.push(gsap.to(`.marker-${type}`, {
					left: `${position}%`,
					duration: 0.6,
					ease: 'power2.out',
				}));
			}
		});
	},
	{ deep: true },
);

// Initialize on mount
onMounted(() => {
	calculateTimelineData();
});

onUnmounted(() => {
	activeTweens.forEach(t => t.kill());
});
</script>

<template>
	<div class="w-full max-w-3xl mx-auto p-6 space-y-6">
		<!-- Dates Section -->
		<div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
			<template v-if="project.start_date">
				<div>
					<span class="text-muted-foreground">Start Date</span>
					<p class="font-semibold">{{ formatDate(timelineData.startDate) }}</p>
				</div>
			</template>
			<template v-if="project.due_date">
				<div>
					<span class="text-muted-foreground">Due Date</span>
					<p class="font-semibold">{{ formatDate(timelineData.dueDate) }}</p>
				</div>
			</template>
			<template v-if="timelineData.completionDate">
				<div>
					<span class="text-muted-foreground">Completion Date</span>
					<p class="font-semibold">{{ formatDate(timelineData.completionDate) }}</p>
				</div>
			</template>
		</div>

		<!-- Timeline Visualization -->
		<div class="relative pt-8 pb-12">
			<div class="relative h-2 w-full bg-gray-200 rounded-full overflow-hidden">
				<div class="progress-bar h-full bg-blue-600 absolute top-0 left-0 transition-all" />
			</div>

			<!-- Markers -->
			<template v-for="(position, type) in positions" :key="type">
				<template v-if="type !== 'events' && position !== null">
					<!-- Today marker -->
					<div
						v-if="type === 'today'"
						class="absolute top-0 h-full w-[1px] bg-gray-200 transform -translate-x-1/2"
						:style="{ left: `${position}%` }"
					/>
					<!-- Other markers -->
					<div
						v-else
						:class="[
							`marker-${type}`,
							'absolute top-0 transform -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white transition-all',
							{
								'bg-gray-500': type === 'start',
								'bg-blue-500': type === 'due',
								'bg-green-500': type === 'completion' && timelineData.status === 'completed-early',
								'bg-red-500': type === 'completion' && timelineData.status === 'completed-late',
							},
						]"
						:style="{ left: `${position}%` }"
					/>
				</template>
			</template>

			<!-- Event Markers -->
			<template v-if="positions.events">
				<div
					v-for="event in positions.events"
					:key="event.id"
					class="absolute top-6 transform -translate-x-1/2"
					:style="{ left: `${event.position}%` }"
				>
					<div
						:class="[
							'w-2 h-2 rounded-full',
							{
								'bg-green-400': event.type === 'payment',
								'bg-blue-400': event.type === 'design',
								'bg-gray-400': !['payment', 'design'].includes(event.type),
							},
						]"
					/>
					<div class="absolute top-4 left-1/2 transform -translate-x-1/2 text-xs whitespace-nowrap">
						{{ event.title }}
					</div>
				</div>
			</template>
		</div>

		<!-- Status Information -->
		<div class="flex items-center justify-between text-sm">
			<div class="flex items-center space-x-2">
				<div :class="[getStatusColor, 'w-3 h-3 rounded-full']" />
				<span class="capitalize">{{ timelineData.status.replace('-', ' ') }}</span>
			</div>
			<div v-if="!timelineData.completionDate">
				<span
					:class="{
						'text-red-500': timelineData.daysUntilDue < 0,
						'text-green-500': timelineData.daysUntilDue > 0,
						'text-gray-500': timelineData.daysUntilDue === 0,
					}"
				>
					{{ Math.abs(timelineData.daysUntilDue) }} days
					{{ timelineData.daysUntilDue >= 0 ? ' remaining' : ' overdue' }}
				</span>
			</div>
		</div>
	</div>
</template>

<style scoped>
.progress-bar {
	width: 0;
}
</style>
