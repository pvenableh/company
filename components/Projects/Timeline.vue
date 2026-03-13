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
});

const positions = computed(() => {
	if (!timelineData.earliestDate || !timelineData.latestDate) return {};
	const totalDuration = timelineData.latestDate - timelineData.earliestDate;

	const calculatePosition = (date) => ((date - timelineData.earliestDate) / totalDuration) * 100;

	return {
		start: calculatePosition(timelineData.startDate),
		due: calculatePosition(timelineData.dueDate),
		today: calculatePosition(timelineData.today),
		projected: timelineData.projectedDate ? calculatePosition(timelineData.projectedDate) : null,
		completion: timelineData.completionDate ? calculatePosition(timelineData.completionDate) : null,
	};
});

const formatDate = (date) =>
	date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

const calculateTimelineData = () => {
	if (!props.project.start_date || !props.project.due_date) return;

	timelineData.startDate = new Date(props.project.start_date);
	timelineData.dueDate = new Date(props.project.due_date);
	timelineData.projectedDate = props.project.projected_date ? new Date(props.project.projected_date) : null;
	timelineData.completionDate = props.project.completion_date ? new Date(props.project.completion_date) : null;

	const dates = [
		timelineData.startDate,
		timelineData.dueDate,
		timelineData.today,
		timelineData.projectedDate,
		timelineData.completionDate,
	].filter(Boolean);

	timelineData.earliestDate = new Date(Math.min(...dates));
	timelineData.latestDate = new Date(Math.max(...dates));

	const totalDuration = timelineData.dueDate - timelineData.startDate;
	const elapsed = timelineData.today - timelineData.startDate;

	timelineData.currentProgress = timelineData.completionDate ? 100 : Math.min((elapsed / totalDuration) * 100, 100);

	timelineData.daysUntilDue = Math.ceil((timelineData.dueDate - timelineData.today) / (1000 * 60 * 60 * 24));

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

const getStatusColor = computed(
	() =>
		({
			'completed-early': 'bg-green-500',
			'completed-late': 'bg-red-500',
			'on-track': 'bg-blue-500',
			'at-risk': 'bg-yellow-500',
			'in-progress': 'bg-blue-500',
			overdue: 'bg-red-500',
			pending: 'bg-gray-500',
		})[timelineData.status] || 'bg-gray-500',
);

watch(() => props.project, calculateTimelineData, { immediate: true });

onMounted(() => {
	calculateTimelineData();
});

// GSAP animation on progress bar and markers
onUpdated(() => {
	gsap.to('.progress-bar', {
		width: `${positions.value.today}%`,
		duration: 0.6,
		ease: 'power2.out',
	});

	Object.entries(positions.value).forEach(([type, position]) => {
		if (position !== null) {
			gsap.to(`.marker-${type}`, {
				left: `${position}%`,
				duration: 0.6,
				ease: 'power2.out',
			});
		}
	});
});
</script>

<template>
	<div class="w-full max-w-3xl mx-auto p-6 space-y-6">
		<!-- Dates Section -->
		<div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
			<template
				v-for="(label, date) in {
					startDate: 'Start Date',
					dueDate: 'Due Date',
					projectedDate: 'Projected Date',
					completionDate: 'Completion Date',
				}"
				:key="date"
			>
				<div v-if="props.project[date]">
					<span class="text-muted-foreground">{{ label }}</span>
					<p class="font-semibold">{{ formatDate(props.project[date]) }}</p>
				</div>
			</template>
		</div>

		<!-- Timeline Visualization -->
		<div class="relative pt-8 pb-12">
			<div class="relative h-2 w-full bg-gray-200 rounded-full overflow-hidden">
				<div class="progress-bar h-full bg-blue-600 absolute top-0 left-0 transition-all"></div>
			</div>

			<template v-for="(position, type) in positions" :key="type">
				<!-- Standard markers -->
				<div
					v-if="position !== null && type !== 'today'"
					:class="[
						`marker-${type}`,
						'absolute top-0 transform -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white transition-all',
						{
							'bg-gray-500': type === 'start',
							'bg-blue-500': type === 'due',
							'bg-yellow-500': type === 'projected',
							'bg-green-500': type === 'completion' && timelineData.status === 'completed-early',
							'bg-red-500': type === 'completion' && timelineData.status === 'completed-late',
						},
					]"
					:style="{ left: `${position}%` }"
				></div>

				<div
					v-if="type === 'today' && position !== null"
					class="absolute top-0 h-full w-[1px] bg-gray-200 transform -translate-x-1/2"
					:style="{ left: `${position}%` }"
				></div>
			</template>
		</div>

		<!-- Status Information -->
		<div class="flex items-center justify-between text-sm">
			<div class="flex items-center space-x-2">
				<div :class="[getStatusColor, 'w-3 h-3 rounded-full']"></div>
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
					{{ Math.abs(timelineData.daysUntilDue) }} days {{ timelineData.daysUntilDue >= 0 ? 'remaining' : 'overdue' }}
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
