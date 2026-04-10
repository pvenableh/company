<script setup lang="ts">
import type { CalendarEvent } from '~/composables/useCalendarEvents';
import { LEAD_STAGE_COLORS } from '~~/shared/leads';

const props = defineProps<{
	event: CalendarEvent;
	compact?: boolean;
}>();

const typeBg = computed(() => {
	switch (props.event.type) {
		case 'video_meeting': return 'bg-emerald-50/50 dark:bg-emerald-900/10';
		case 'follow_up': return 'bg-amber-50/50 dark:bg-amber-900/10';
		case 'external': return 'bg-gray-50/50 dark:bg-gray-800/30';
		default: return 'bg-blue-50/50 dark:bg-blue-900/10';
	}
});

const typeIcon = computed(() => {
	switch (props.event.type) {
		case 'video_meeting': return 'i-heroicons-video-camera';
		case 'follow_up': return 'i-heroicons-arrow-path';
		case 'external': return 'i-heroicons-globe-alt';
		default: return 'i-heroicons-calendar';
	}
});

const typeIconColor = computed(() => {
	switch (props.event.type) {
		case 'video_meeting': return 'text-emerald-500';
		case 'follow_up': return 'text-amber-500';
		case 'external': return 'text-gray-400';
		default: return 'text-blue-500';
	}
});

const typeAccent = computed(() => {
	switch (props.event.type) {
		case 'video_meeting': return 'bg-emerald-500';
		case 'follow_up': return 'bg-amber-500';
		case 'external': return 'bg-gray-400';
		default: return 'bg-blue-500';
	}
});

const timeDisplay = computed(() => {
	if (!props.event.start_time) return '';
	try {
		const d = new Date(props.event.start_time);
		return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	} catch { return ''; }
});

const leadStageColor = computed(() => {
	if (!props.event.lead?.stage) return null;
	return LEAD_STAGE_COLORS[props.event.lead.stage] || null;
});
</script>

<template>
	<div
		:class="[typeBg]"
		class="relative rounded-md transition-all duration-200 cursor-pointer group hover:shadow-sm"
		:style="compact ? 'padding: 2px 6px 2px 12px' : 'padding: 6px 8px 6px 14px'"
	>
		<span
			class="absolute left-1 top-1 bottom-1 w-[2px] rounded-full"
			:class="typeAccent"
		/>
		<div class="flex items-center gap-1.5 min-w-0">
			<UIcon :name="typeIcon" :class="typeIconColor" class="w-3 h-3 flex-shrink-0" />

			<!-- Lead stage dot -->
			<span
				v-if="leadStageColor"
				class="w-1.5 h-1.5 rounded-full flex-shrink-0"
				:style="{ backgroundColor: leadStageColor }"
			/>

			<span v-if="timeDisplay && !compact" class="text-[10px] font-medium text-muted-foreground flex-shrink-0">
				{{ timeDisplay }}
			</span>
			<span class="text-[11px] font-medium text-foreground truncate">
				{{ event.title }}
			</span>
		</div>
	</div>
</template>
