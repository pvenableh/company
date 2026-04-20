<script setup lang="ts">
/**
 * SchedulerDayTimeline — Clean Gantt-styled single-day timeline.
 * Sticky event labels on the left, hourly track on the right.
 * Point events (follow-ups) render as milestone diamonds.
 */
import { format, parseISO } from 'date-fns';
import type { CalendarEvent } from '~/composables/useCalendarEvents';
import { LEAD_STAGE_LABELS, LEAD_STAGE_COLORS } from '~~/shared/leads';

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
const { getStatusOpacity } = useStatusStyle();

// ── Layout constants ──
const LABEL_WIDTH = 170;
const ROW_HEIGHT = 28;
const HOUR_WIDTH = 56;          // px per hour
const HEADER_HEIGHT = 22;
const DEFAULT_START_HOUR = 7;   // 7 AM
const DEFAULT_END_HOUR = 22;    // 10 PM

const scrollWrapper = ref<HTMLElement | null>(null);

// ── Header (date) ──
const dayName = computed(() => {
	if (!props.date) return '';
	try { return format(parseISO(props.date), 'EEEE'); } catch { return ''; }
});

const dateLabel = computed(() => {
	if (!props.date) return '';
	try { return format(parseISO(props.date), 'MMMM d'); } catch { return props.date; }
});

const todayStr = computed(() => new Date().toISOString().substring(0, 10));
const isToday = computed(() => props.date === todayStr.value);

const relativeDay = computed(() => {
	if (!props.date) return null;
	const today = new Date();
	const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
	const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
	if (props.date === todayStr.value) return 'Today';
	if (props.date === tomorrow.toISOString().substring(0, 10)) return 'Tomorrow';
	if (props.date === yesterday.toISOString().substring(0, 10)) return 'Yesterday';
	return null;
});

const relativeDayColor = computed(() => {
	switch (relativeDay.value) {
		case 'Today': return 'text-primary bg-primary/10';
		case 'Tomorrow': return 'text-blue-500 bg-blue-500/10';
		case 'Yesterday': return 'text-muted-foreground bg-muted/30';
		default: return '';
	}
});

// ── Hour range ──
function hourOfEvent(iso: string | null | undefined): number | null {
	if (!iso) return null;
	const d = new Date(iso);
	if (isNaN(d.getTime())) return null;
	return d.getHours() + d.getMinutes() / 60;
}

const hourRange = computed(() => {
	let min = DEFAULT_START_HOUR;
	let max = DEFAULT_END_HOUR;
	for (const e of props.events) {
		const s = hourOfEvent(e.start_time);
		const en = hourOfEvent(e.end_time) ?? (s != null && e.duration_minutes ? s + e.duration_minutes / 60 : s);
		if (s != null && s < min) min = Math.floor(s);
		if (en != null && en > max) max = Math.ceil(en);
	}
	return { start: Math.max(0, min), end: Math.min(24, Math.max(max, min + 1)) };
});

const hourSlots = computed(() => {
	const slots: { hour: number; label: string; x: number }[] = [];
	for (let h = hourRange.value.start; h <= hourRange.value.end; h++) {
		const x = (h - hourRange.value.start) * HOUR_WIDTH;
		const label = h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`;
		slots.push({ hour: h, label, x });
	}
	return slots;
});

const trackWidth = computed(() => (hourRange.value.end - hourRange.value.start) * HOUR_WIDTH);

function hourToX(h: number): number {
	return (h - hourRange.value.start) * HOUR_WIDTH;
}

// ── Current-time line (only on today) ──
const nowX = computed(() => {
	if (!isToday.value) return null;
	const now = new Date();
	const h = now.getHours() + now.getMinutes() / 60;
	if (h < hourRange.value.start || h > hourRange.value.end) return null;
	return hourToX(h);
});

// Tick current time every minute
const nowTick = ref(Date.now());
let nowInterval: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
	nowInterval = setInterval(() => { nowTick.value = Date.now(); }, 60_000);
});
onUnmounted(() => { if (nowInterval) clearInterval(nowInterval); });

// ── Event styling ──
const typeStyles = (event: CalendarEvent) => {
	switch (event.type) {
		case 'video_meeting': return { color: '#10b981', icon: 'i-heroicons-video-camera', iconColor: 'text-emerald-500' };
		case 'follow_up': return { color: '#f59e0b', icon: 'i-heroicons-arrow-path', iconColor: 'text-amber-500' };
		case 'external': return { color: '#9ca3af', icon: 'i-heroicons-globe-alt', iconColor: 'text-gray-400' };
		default: return { color: '#3b82f6', icon: 'i-heroicons-calendar', iconColor: 'text-blue-500' };
	}
};

function getBarStyle(event: CalendarEvent): { left: string; width: string } | null {
	const s = hourOfEvent(event.start_time);
	if (s == null) return null;
	const e = hourOfEvent(event.end_time)
		?? (event.duration_minutes ? s + event.duration_minutes / 60 : null);
	if (e == null) return null; // point event — no bar
	const left = hourToX(s);
	const width = Math.max((e - s) * HOUR_WIDTH, 12);
	return { left: `${left}px`, width: `${width}px` };
}

function isPointEvent(event: CalendarEvent): boolean {
	const s = hourOfEvent(event.start_time);
	const e = hourOfEvent(event.end_time);
	return s != null && e == null && !event.duration_minutes;
}

function getPointX(event: CalendarEvent): number {
	const s = hourOfEvent(event.start_time) ?? hourRange.value.start;
	return hourToX(s);
}

const formatTime = (timeStr: string) => {
	if (!timeStr) return '';
	try { return new Date(timeStr).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
	catch { return ''; }
};

const formatDuration = (minutes: number | null | undefined) => {
	if (!minutes) return '';
	if (minutes < 60) return `${minutes}m`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m ? `${h}h ${m}m` : `${h}h`;
};

function eventDuration(event: CalendarEvent): string {
	if (event.duration_minutes) return formatDuration(event.duration_minutes);
	const s = event.start_time ? new Date(event.start_time).getTime() : null;
	const e = event.end_time ? new Date(event.end_time).getTime() : null;
	if (s && e && e > s) return formatDuration(Math.round((e - s) / 60000));
	return '';
}

function tooltipFor(event: CalendarEvent): string {
	const parts: string[] = [event.title];
	if (event.start_time) parts.push(formatTime(event.start_time));
	const dur = eventDuration(event);
	if (dur) parts.push(dur);
	if (event.invitee_name) parts.push(`with ${event.invitee_name}`);
	return parts.join(' · ');
}

// ── Interaction ──
const handleEventClick = (event: CalendarEvent) => {
	if (event.type === 'follow_up' && event.lead?.id) {
		router.push(`/leads/${event.lead.id}`);
	} else {
		emit('edit-event', event);
	}
};

// ── Scroll to first event (or now) when data changes ──
function scrollToFocus() {
	nextTick(() => {
		if (!scrollWrapper.value) return;
		let focusX: number | null = null;
		if (props.events.length > 0) {
			const firstHour = hourOfEvent(props.events[0]?.start_time);
			if (firstHour != null) focusX = hourToX(firstHour);
		}
		if (focusX == null && isToday.value) focusX = nowX.value;
		if (focusX == null) return;
		const containerWidth = scrollWrapper.value.clientWidth - LABEL_WIDTH;
		scrollWrapper.value.scrollTo({ left: Math.max(0, focusX - containerWidth / 4), behavior: 'smooth' });
	});
}

watch(() => [props.date, props.events.length], scrollToFocus, { immediate: true });
</script>

<template>
	<div class="ios-card overflow-hidden day-timeline">
		<!-- Header -->
		<div class="px-4 pt-1 pb-2.5 border-b border-border/30">
			<div class="h-[26px]">
				<span
					class="inline-block text-[7px] font-semibold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full leading-none transition-all duration-200"
					:class="relativeDay ? [relativeDayColor, 'opacity-100 translate-y-0'] : 'opacity-0 -translate-y-1'"
				>{{ relativeDay || '&nbsp;' }}</span>
			</div>
			<div class="flex items-center justify-between">
				<div>
					<h3 class="text-[11px] font-semibold text-foreground leading-none">{{ dayName }}</h3>
					<p class="text-[8px] font-medium uppercase tracking-wide text-muted-foreground leading-none mt-1">{{ dateLabel }}</p>
				</div>
				<div class="flex items-center gap-1.5 -mt-[10px]">
					<button
						@click="emit('new-meeting', date)"
						class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 text-[11px] font-medium hover:bg-emerald-500/20 transition-colors ios-press"
					>
						<UIcon name="i-heroicons-video-camera" class="w-3 h-3" />
						Video
					</button>
					<button
						@click="emit('new-event', date)"
						class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary/20 transition-colors ios-press"
					>
						<UIcon name="i-heroicons-plus" class="w-3 h-3" />
						Event
					</button>
				</div>
			</div>
		</div>

		<!-- Empty state -->
		<div v-if="events.length === 0" class="text-center py-8 px-3">
			<UIcon name="i-heroicons-calendar" class="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
			<p class="text-xs text-muted-foreground">No events scheduled</p>
			<p class="text-[10px] text-muted-foreground/60 mt-0.5">Click + to add one</p>
		</div>

		<!-- Timeline -->
		<div v-else ref="scrollWrapper" class="day-timeline__body">
			<div class="day-timeline__scroll" :style="{ width: `${LABEL_WIDTH + trackWidth}px` }">

				<!-- Header: hour axis -->
				<div class="day-timeline__header" :style="{ height: `${HEADER_HEIGHT}px` }">
					<div class="day-timeline__header-label" />
					<div class="day-timeline__header-track">
						<div
							v-for="slot in hourSlots"
							:key="slot.hour"
							class="day-timeline__hour"
							:style="{ left: `${slot.x}px`, width: `${HOUR_WIDTH}px` }"
						>{{ slot.label }}</div>
					</div>
				</div>

				<!-- Hour grid lines -->
				<div
					v-for="slot in hourSlots"
					:key="`line-${slot.hour}`"
					class="day-timeline__hour-line"
					:style="{
						left: `${LABEL_WIDTH + slot.x}px`,
						height: `${HEADER_HEIGHT + events.length * ROW_HEIGHT}px`,
					}"
				/>

				<!-- Event rows -->
				<div
					v-for="(event, i) in events"
					:key="event.id"
					class="day-timeline__row"
					:class="{ 'day-timeline__row--alt': i % 2 === 1 }"
					:style="{ height: `${ROW_HEIGHT}px` }"
				>
					<!-- Label (sticky left) -->
					<div
						class="day-timeline__label"
						:style="{ width: `${LABEL_WIDTH}px`, minWidth: `${LABEL_WIDTH}px` }"
						@click="handleEventClick(event)"
					>
						<UIcon :name="typeStyles(event).icon" :class="typeStyles(event).iconColor" class="w-3 h-3 shrink-0 ml-2" />
						<div class="flex-1 min-w-0 pl-1.5 pr-1">
							<div class="flex items-center gap-1">
								<span class="day-timeline__label-title" :title="event.title">{{ event.title }}</span>
								<span
									v-if="event.lead"
									class="shrink-0 w-1.5 h-1.5 rounded-full"
									:style="{ backgroundColor: LEAD_STAGE_COLORS[event.lead.stage] }"
									:title="LEAD_STAGE_LABELS[event.lead.stage]"
								/>
							</div>
							<div class="day-timeline__label-meta">
								<span>{{ formatTime(event.start_time) }}</span>
								<span v-if="eventDuration(event)" class="opacity-60">{{ eventDuration(event) }}</span>
							</div>
						</div>
					</div>

					<!-- Track -->
					<div class="day-timeline__track">
						<UTooltip :text="tooltipFor(event)" :popper="{ placement: 'top', offsetDistance: 6 }">
							<div
								v-if="getBarStyle(event)"
								class="day-timeline__bar"
								:style="{
									...getBarStyle(event)!,
									backgroundColor: typeStyles(event).color,
									opacity: getStatusOpacity(event.status),
								}"
								@click="handleEventClick(event)"
							/>
							<div
								v-else-if="isPointEvent(event)"
								class="day-timeline__milestone"
								:style="{ left: `${getPointX(event)}px` }"
								@click="handleEventClick(event)"
							>
								<div
									class="day-timeline__diamond"
									:style="{ backgroundColor: typeStyles(event).color, opacity: getStatusOpacity(event.status) }"
								/>
							</div>
						</UTooltip>
					</div>
				</div>

				<!-- Now line -->
				<div
					v-if="nowX != null"
					class="day-timeline__now"
					:style="{
						left: `${LABEL_WIDTH + nowX}px`,
						height: `${HEADER_HEIGHT + events.length * ROW_HEIGHT}px`,
					}"
				>
					<div class="day-timeline__now-pip" />
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.day-timeline__body {
	overflow: auto;
	max-height: calc(100vh - 340px);
	scrollbar-width: none;
	-ms-overflow-style: none;
}
.day-timeline__body::-webkit-scrollbar { display: none; }

.day-timeline__scroll { position: relative; }

/* Hour header */
.day-timeline__header {
	display: flex;
	border-bottom: 1px solid rgba(0, 0, 0, 0.06);
	position: sticky;
	top: 0;
	z-index: 11;
	background: hsl(var(--card));
}
:is(.dark) .day-timeline__header { border-bottom-color: rgba(255, 255, 255, 0.06); }

.day-timeline__header-label {
	width: 170px;
	min-width: 170px;
	position: sticky;
	left: 0;
	z-index: 12;
	background: hsl(var(--card));
	border-right: 1px solid rgba(0, 0, 0, 0.04);
}
:is(.dark) .day-timeline__header-label { border-right-color: rgba(255, 255, 255, 0.04); }

.day-timeline__header-track { flex: 1; position: relative; min-width: 0; }

.day-timeline__hour {
	position: absolute;
	top: 0;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: flex-start;
	padding-left: 4px;
	font-size: 8px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: hsl(var(--muted-foreground) / 0.6);
	user-select: none;
}

.day-timeline__hour-line {
	position: absolute;
	top: 0;
	width: 1px;
	background: hsl(var(--border) / 0.3);
	z-index: 0;
	pointer-events: none;
}

/* Row */
.day-timeline__row { display: flex; }
.day-timeline__row--alt .day-timeline__label { background: rgba(0, 0, 0, 0.015); }
:is(.dark) .day-timeline__row--alt .day-timeline__label { background: rgba(255, 255, 255, 0.015); }

.day-timeline__label {
	position: sticky;
	left: 0;
	z-index: 10;
	display: flex;
	align-items: center;
	background: hsl(var(--card));
	cursor: pointer;
	overflow: hidden;
	border-right: 1px solid rgba(0, 0, 0, 0.04);
	transition: color 0.15s;
}
:is(.dark) .day-timeline__label { border-right-color: rgba(255, 255, 255, 0.04); }
.day-timeline__label:hover { background: hsl(var(--muted) / 0.2); }

.day-timeline__label-title {
	display: block;
	font-size: 11px;
	font-weight: 500;
	color: hsl(var(--foreground) / 0.85);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	line-height: 1.2;
}

.day-timeline__label-meta {
	display: flex;
	gap: 6px;
	font-size: 9px;
	color: hsl(var(--muted-foreground));
	margin-top: 1px;
	line-height: 1;
}

.day-timeline__track {
	flex: 1;
	position: relative;
	min-width: 0;
}

/* Bar */
.day-timeline__bar {
	position: absolute;
	top: 50%;
	transform: translateY(-50%);
	height: 12px;
	border-radius: 6px;
	cursor: pointer;
	transition: filter 0.15s;
	z-index: 1;
}
.day-timeline__bar:hover { filter: brightness(0.92); }

/* Milestone diamond */
.day-timeline__milestone {
	position: absolute;
	top: 50%;
	transform: translate(-50%, -50%);
	z-index: 2;
	cursor: pointer;
}
.day-timeline__diamond {
	width: 10px;
	height: 10px;
	transform: rotate(45deg);
	border-radius: 1px;
}
.day-timeline__milestone:hover .day-timeline__diamond { filter: brightness(0.92); }

/* Now line */
.day-timeline__now {
	position: absolute;
	top: 0;
	width: 1px;
	background: hsl(var(--primary));
	opacity: 0.3;
	z-index: 5;
	pointer-events: none;
}
.day-timeline__now-pip {
	position: absolute;
	top: 6px;
	left: -3px;
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: hsl(var(--primary));
	opacity: 0.7;
}
</style>
