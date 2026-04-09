<template>
	<div class="space-y-4">
		<div v-for="activity in activities" :key="activity.id" class="flex gap-3">
			<div class="shrink-0 mt-1">
				<div class="w-8 h-8 rounded-full flex items-center justify-center" :class="iconBg(activity.activity_type)">
					<Icon :name="activityIcon(activity.activity_type)" class="w-4 h-4" />
				</div>
			</div>
			<div class="flex-1 min-w-0">
				<div class="flex items-center justify-between">
					<p class="text-sm font-medium t-text">{{ activity.subject }}</p>
					<span
						v-if="activity.outcome"
						class="text-[9px] font-semibold px-1.5 py-0.5 rounded"
						:class="outcomeClass(activity.outcome)"
					>
						{{ activity.outcome }}
					</span>
				</div>
				<p v-if="activity.description" class="text-xs t-text-secondary mt-0.5 line-clamp-2">
					{{ activity.description }}
				</p>
				<div class="flex items-center gap-2 mt-1">
					<span class="text-[10px] t-text-muted">
						{{ activity.activity_date ? new Date(activity.activity_date).toLocaleDateString() : '' }}
					</span>
					<span v-if="activity.duration_minutes" class="text-[10px] t-text-muted">
						{{ activity.duration_minutes }}min
					</span>
				</div>
				<p v-if="activity.next_action" class="text-[10px] text-blue-400 mt-1">
					Next: {{ activity.next_action }}
					<span v-if="activity.next_action_date"> · {{ new Date(activity.next_action_date).toLocaleDateString() }}</span>
				</p>
			</div>
		</div>

		<div v-if="!activities.length" class="text-center py-8 text-sm t-text-muted">
			No activity yet
		</div>
	</div>
</template>

<script setup lang="ts">
defineProps<{ activities: any[] }>();

function activityIcon(type: string): string {
	const icons: Record<string, string> = {
		call: 'i-heroicons-phone',
		email: 'i-heroicons-envelope',
		meeting: 'i-heroicons-video-camera',
		note: 'i-heroicons-pencil-square',
		proposal: 'i-heroicons-document-text',
		follow_up: 'i-heroicons-arrow-path',
		demo: 'i-heroicons-presentation-chart-bar',
		task: 'i-heroicons-check-circle',
		other: 'i-heroicons-ellipsis-horizontal',
	};
	return icons[type] || 'i-heroicons-ellipsis-horizontal';
}

function iconBg(type: string): string {
	const classes: Record<string, string> = {
		call: 'bg-green-500/15 text-green-400',
		email: 'bg-blue-500/15 text-blue-400',
		meeting: 'bg-purple-500/15 text-purple-400',
		note: 'bg-yellow-500/15 text-yellow-400',
		proposal: 'bg-indigo-500/15 text-indigo-400',
	};
	return classes[type] || 'bg-gray-500/15 text-gray-400';
}

function outcomeClass(outcome: string): string {
	if (outcome === 'positive') return 'bg-emerald-500/15 text-emerald-400';
	if (outcome === 'negative') return 'bg-red-500/15 text-red-400';
	if (outcome === 'neutral') return 'bg-gray-500/15 text-gray-400';
	return 'bg-yellow-500/15 text-yellow-400';
}
</script>
