<script setup lang="ts">
import type { CalendarEvent } from '~/composables/useCalendarEvents';
import { hostAccentColor } from '~/composables/useCalendarEvents';
import { LEAD_STAGE_COLORS } from '~~/shared/leads';

const props = defineProps<{
	event: CalendarEvent;
	compact?: boolean;
}>();

const { getStatusOpacity } = useStatusStyle();

// Host accent: teammate-owned events get a unique stripe color keyed off
// `creator_id`, so the day reads as a multi-host calendar at a glance.
// Own events keep the type-based accent so the user's own pattern stays calm.
const hostStripeStyle = computed(() => {
	// External-calendar overlay events carry the connection's own color so the
	// day reads Google-blue / Outlook-teal / whatever the host picked — that
	// colour is the whole point of the "show on calendar" overlay.
	if (props.event.type === 'external' && props.event.external_color) {
		return { backgroundColor: props.event.external_color };
	}
	if (props.event.is_mine === false && props.event.creator_id) {
		return { backgroundColor: hostAccentColor(props.event.creator_id) };
	}
	return null;
});

// Tinted background for external events keyed to the connection colour, so the
// chip fill matches its stripe instead of the flat muted token.
const externalTintStyle = computed(() => {
	if (props.event.type === 'external' && props.event.external_color) {
		return { backgroundColor: `color-mix(in srgb, ${props.event.external_color} 12%, transparent)` };
	}
	return null;
});

const chipOpacity = computed(() =>
	getStatusOpacity(props.event.meeting_status || props.event.status),
);

// Type → token mapping. Video meetings adopt the Work app's rail accent
// so the calendar visibly re-skins per palette (Sea Mist cyan, Aurora
// blue, Neutral sky). Other types keep their semantic tokens — those
// colours carry meaning (warning = action needed, muted = not-mine,
// info = generic) and should stay consistent across palettes.
//   video_meeting → app-work (palette-driven, matches Work rail chip)
//   follow_up     → warning  (action needed)
//   external      → muted    (observed, not owned)
//   default       → info     (generic appointment)
const typeBg = computed(() => {
	switch (props.event.type) {
		case 'video_meeting': return 'bg-app-work/10';
		case 'follow_up': return 'bg-warning/10';
		case 'external': return 'bg-muted/40';
		default: return 'bg-info/10';
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
		case 'video_meeting': return 'text-app-work';
		case 'follow_up': return 'text-warning';
		case 'external': return 'text-muted-foreground';
		default: return 'text-info';
	}
});

const typeAccent = computed(() => {
	switch (props.event.type) {
		case 'video_meeting': return 'bg-app-work';
		case 'follow_up': return 'bg-warning';
		case 'external': return 'bg-muted-foreground';
		default: return 'bg-info';
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

// Tooltip: teammate name on their events; source calendar on external overlays.
const externalTitleAttr = computed(() => {
	if (props.event.type === 'external') {
		return props.event.external_calendar_name || 'External calendar';
	}
	return props.event.is_mine === false && props.event.creator_name ? props.event.creator_name : undefined;
});
</script>

<template>
	<div
		:class="[externalTintStyle ? '' : typeBg]"
		class="relative rounded-md transition-all duration-200 cursor-pointer group hover:shadow-sm min-w-0 overflow-hidden"
		:style="[
			compact ? 'padding: 2px 6px 2px 12px' : 'padding: 6px 8px 6px 14px',
			externalTintStyle || {},
			{ opacity: chipOpacity },
		]"
	>
		<span
			class="absolute left-1 top-1 bottom-1 w-[2px] rounded-full"
			:class="hostStripeStyle ? '' : typeAccent"
			:style="hostStripeStyle || undefined"
			:title="externalTitleAttr"
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
