<script setup lang="ts">
import { format, parseISO } from 'date-fns';
import type { CalendarEvent } from '~/composables/useCalendarEvents';
import { LEAD_STAGE_LABELS, LEAD_STAGE_COLORS } from '~/types/leads';

const props = defineProps<{
	date: string;
	events: CalendarEvent[];
}>();

const emit = defineEmits<{
	'new-event': [date: string];
	'new-meeting': [date: string];
	'edit-event': [event: CalendarEvent];
}>();

const router = useRouter();

const formattedDate = computed(() => {
	if (!props.date) return '';
	try {
		return format(parseISO(props.date), 'EEEE, MMMM d');
	} catch { return props.date; }
});

const isToday = computed(() => {
	return props.date === new Date().toISOString().substring(0, 10);
});

const formatTime = (timeStr: string) => {
	if (!timeStr) return '';
	try {
		return new Date(timeStr).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	} catch { return ''; }
};

const formatDuration = (minutes: number | null | undefined) => {
	if (!minutes) return '';
	if (minutes < 60) return `${minutes}m`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m ? `${h}h ${m}m` : `${h}h`;
};

const typeStyles = (event: CalendarEvent) => {
	switch (event.type) {
		case 'video_meeting': return { bg: 'bg-emerald-50/50 dark:bg-emerald-900/10', accent: 'bg-emerald-500', icon: 'i-heroicons-video-camera', iconColor: 'text-emerald-500', label: 'Video Meeting' };
		case 'follow_up': return { bg: 'bg-amber-50/50 dark:bg-amber-900/10', accent: 'bg-amber-500', icon: 'i-heroicons-arrow-path', iconColor: 'text-amber-500', label: 'Follow-up' };
		case 'external': return { bg: 'bg-gray-50/50 dark:bg-gray-800/30', accent: 'bg-gray-400', icon: 'i-heroicons-globe-alt', iconColor: 'text-gray-400', label: 'External' };
		default: return { bg: 'bg-blue-50/50 dark:bg-blue-900/10', accent: 'bg-blue-500', icon: 'i-heroicons-calendar', iconColor: 'text-blue-500', label: 'Appointment' };
	}
};

const handleEventClick = (event: CalendarEvent) => {
	if (event.type === 'follow_up' && event.lead?.id) {
		router.push(`/leads/${event.lead.id}`);
	} else {
		emit('edit-event', event);
	}
};
</script>

<template>
	<div class="ios-card overflow-hidden">
		<!-- Header -->
		<div class="px-4 py-3 border-b border-border/30">
			<div class="flex items-center justify-between">
				<div>
					<h3 class="text-sm font-semibold text-foreground">{{ formattedDate }}</h3>
					<p v-if="isToday" class="text-[10px] text-primary font-medium">Today</p>
				</div>
				<div class="flex items-center gap-1.5">
					<button
						@click="$emit('new-meeting', date)"
						class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 text-[11px] font-medium hover:bg-emerald-500/20 transition-colors ios-press"
					>
						<UIcon name="i-heroicons-video-camera" class="w-3 h-3" />
						Video
					</button>
					<button
						@click="$emit('new-event', date)"
						class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary/20 transition-colors ios-press"
					>
						<UIcon name="i-heroicons-plus" class="w-3 h-3" />
						Event
					</button>
				</div>
			</div>
		</div>

		<!-- Events list -->
		<div class="p-3">
			<div v-if="events.length === 0" class="text-center py-8">
				<UIcon name="i-heroicons-calendar" class="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
				<p class="text-xs text-muted-foreground">No events scheduled</p>
				<p class="text-[10px] text-muted-foreground/60 mt-0.5">Click + to add one</p>
			</div>

			<div v-else class="space-y-2">
				<div
					v-for="event in events"
					:key="event.id"
					:class="[typeStyles(event).bg]"
					is="AccentCard" :accent="typeStyles(event).accent"
					class="cursor-pointer hover:shadow-md transition-all duration-200 ios-press group"
					@click="handleEventClick(event)"
				>
										<div class="flex items-start gap-3">
						<div class="flex-shrink-0 mt-0.5">
							<UIcon :name="typeStyles(event).icon" :class="typeStyles(event).iconColor" class="w-4 h-4" />
						</div>
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2">
								<p class="text-[13px] font-medium text-foreground truncate">{{ event.title }}</p>
								<!-- Lead badge -->
								<span
									v-if="event.lead"
									class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium"
									:style="{
										backgroundColor: LEAD_STAGE_COLORS[event.lead.stage] + '1A',
										color: LEAD_STAGE_COLORS[event.lead.stage],
									}"
								>
									<span class="w-1 h-1 rounded-full" :style="{ backgroundColor: LEAD_STAGE_COLORS[event.lead.stage] }" />
									{{ LEAD_STAGE_LABELS[event.lead.stage] }}
								</span>
							</div>

							<!-- Time + duration -->
							<div class="flex items-center gap-2 mt-0.5">
								<span class="text-[11px] text-muted-foreground">{{ formatTime(event.start_time) }}</span>
								<span v-if="event.end_time" class="text-[11px] text-muted-foreground">&ndash; {{ formatTime(event.end_time) }}</span>
								<span v-if="event.duration_minutes" class="text-[10px] text-muted-foreground/60">{{ formatDuration(event.duration_minutes) }}</span>
							</div>

							<!-- Invitee / contact -->
							<p v-if="event.invitee_name" class="text-[11px] text-muted-foreground mt-1">
								with {{ event.invitee_name }}
								<span v-if="event.invitee_email" class="text-muted-foreground/50">&middot; {{ event.invitee_email }}</span>
							</p>

							<!-- Description -->
							<p v-if="event.description" class="text-[11px] text-muted-foreground/70 mt-1 line-clamp-2">{{ event.description }}</p>
						</div>

						<!-- Quick actions -->
						<div class="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
							<button
								v-if="event.is_video && event.room_name"
								class="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors"
								@click.stop="router.push(`/meeting/${event.room_name}`)"
							>
								<UIcon name="i-heroicons-video-camera" class="w-3.5 h-3.5" />
							</button>
							<button
								v-if="event.lead?.id"
								class="p-1.5 rounded-lg bg-muted/40 text-muted-foreground hover:bg-muted/70 transition-colors"
								@click.stop="router.push(`/leads/${event.lead.id}`)"
								title="View Lead"
							>
								<UIcon name="i-heroicons-funnel" class="w-3.5 h-3.5" />
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
