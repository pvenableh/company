<script setup lang="ts">
/**
 * MiniGantt — compact timeline for a single project.
 * Matches UnifiedGantt visual language: type icons, color coding,
 * status pills, tooltips, today marker, month headers.
 */

const props = defineProps<{
	project: any;
	tickets?: any[];
}>();

const emit = defineEmits<{
	'event-click': [event: any];
}>();

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 36;
const SIDEBAR_WIDTH = 220;

interface MiniRow {
	id: string;
	label: string;
	type: 'event' | 'ticket' | 'task';
	color: string;
	startDate?: string;
	endDate?: string;
	dueDate?: string;
	status?: string;
	raw?: any;
}

const projectColor = computed(() => props.project?.service?.color || '#d4d4d8');

// Event type color map — "General" inherits from project service color
const EVENT_TYPE_COLORS: Record<string, string> = {
	Design: '#f472b6',    // pink
	Content: '#fb923c',   // orange
	Timeline: '#06b6d4',  // cyan
	Financial: '#22c55e', // green
	Hours: '#a78bfa',     // violet
};

function getEventColor(event: any): string {
	const type = event.type || 'General';
	return EVENT_TYPE_COLORS[type] || projectColor.value;
}

const rows = computed<MiniRow[]>(() => {
	const result: MiniRow[] = [];
	const events = props.project?.events || [];

	for (const event of events) {
		if (event.status === 'archived') continue;
		result.push({
			id: event.id,
			label: event.title || 'Event',
			type: 'event',
			color: getEventColor(event),
			startDate: event.event_date || event.date,
			endDate: event.end_date || event.event_date || event.date,
			status: event.status,
			raw: event,
		});
	}

	const tickets = props.tickets || [];
	for (const ticket of tickets) {
		result.push({
			id: ticket.id,
			label: ticket.title || 'Ticket',
			type: 'ticket',
			color: projectColor.value,
			startDate: ticket.date_created,
			dueDate: ticket.due_date,
			status: ticket.status,
		});
	}

	return result;
});

// Date range
const dateRange = computed(() => {
	let min = Infinity;
	let max = -Infinity;
	const now = Date.now();

	for (const row of rows.value) {
		for (const d of [row.startDate, row.endDate, row.dueDate]) {
			if (!d) continue;
			const t = new Date(d).getTime();
			if (!isNaN(t)) {
				if (t < min) min = t;
				if (t > max) max = t;
			}
		}
	}

	if (props.project?.start_date) {
		const t = new Date(props.project.start_date).getTime();
		if (!isNaN(t) && t < min) min = t;
	}
	if (props.project?.due_date || props.project?.completion_date) {
		const t = new Date(props.project.due_date || props.project.completion_date).getTime();
		if (!isNaN(t) && t > max) max = t;
	}

	if (min === Infinity) min = now - 30 * 86400000;
	if (max === -Infinity) max = now + 60 * 86400000;
	if (now > max) max = now;

	// Snap to full month boundaries so labels always show
	const startDate = new Date(min);
	const endDate = new Date(max);
	const start = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
	const end = new Date(endDate.getFullYear(), endDate.getMonth() + 2, 1);
	return { start, end };
});

const chartWidth = computed(() => {
	const months = Math.max(1, Math.ceil((dateRange.value.end.getTime() - dateRange.value.start.getTime()) / (30 * 86400000)));
	return Math.max(600, months * 200);
});

function dateToX(dateStr: string): number {
	const t = new Date(dateStr).getTime();
	const start = dateRange.value.start.getTime();
	const end = dateRange.value.end.getTime();
	const span = end - start || 1;
	return (t - start) / span * chartWidth.value;
}

const todayX = computed(() => dateToX(new Date().toISOString()));

// Month labels
const monthLabels = computed(() => {
	const labels: { text: string; x: number; width: number; isCurrent: boolean }[] = [];
	const start = dateRange.value.start;
	const end = dateRange.value.end;
	const now = new Date();

	let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
	while (cursor <= end) {
		const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
		const x = dateToX(cursor.toISOString());
		const nextX = dateToX(next.toISOString());
		labels.push({
			text: cursor.toLocaleDateString('en-US', { month: 'short', year: cursor.getFullYear() !== now.getFullYear() ? '2-digit' : undefined }),
			x,
			width: nextX - x,
			isCurrent: cursor.getMonth() === now.getMonth() && cursor.getFullYear() === now.getFullYear(),
		});
		cursor = next;
	}
	return labels;
});

function getBarStyle(row: MiniRow) {
	const start = row.startDate ? dateToX(row.startDate) : 0;
	const end = row.endDate
		? dateToX(row.endDate)
		: row.dueDate
			? dateToX(row.dueDate)
			: start + 40;
	const width = Math.max(6, end - start);
	return { left: `${start}px`, width: `${width}px` };
}

function hasBar(row: MiniRow): boolean {
	return !!(row.startDate || row.endDate);
}

function isCompleted(status?: string): boolean {
	if (!status) return false;
	const s = status.toLowerCase().replace(/\s+/g, '');
	return s === 'completed' || s === 'done';
}

function getBarOpacity(status?: string): number {
	if (!status) return 0.7;
	const s = status.toLowerCase().replace(/\s+/g, '');
	if (s === 'completed' || s === 'done') return 0.3;
	if (s === 'inprogress' || s === 'active') return 0.9;
	if (s === 'scheduled') return 0.7;
	return 0.6;
}

// Sync scroll between sidebar and chart
const chartScroll = ref<HTMLElement | null>(null);
const sidebarScroll = ref<HTMLElement | null>(null);

function syncScroll() {
	if (chartScroll.value && sidebarScroll.value) {
		sidebarScroll.value.scrollTop = chartScroll.value.scrollTop;
	}
}
</script>

<template>
	<div v-if="rows.length > 0" class="mg-container">
		<div class="mg-body">
			<!-- Sidebar -->
			<div class="mg-sidebar">
				<div class="mg-sidebar-header">
					<span class="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Timeline</span>
					<span class="text-[9px] text-muted-foreground/50">{{ rows.length }}</span>
				</div>
				<div ref="sidebarScroll" class="mg-sidebar-rows">
					<div
						v-for="row in rows"
						:key="'s-' + row.id"
						class="mg-sidebar-row"
						:class="{ 'cursor-pointer': row.type === 'event' }"
						@click="row.type === 'event' && row.raw && emit('event-click', row.raw)"
					>
						<!-- Left color bar -->
						<span class="mg-color-bar" :style="{ backgroundColor: row.color }" />

						<!-- Type icon with tooltip -->
						<UTooltip
							:text="row.type === 'event' ? 'Event' : row.type === 'ticket' ? 'Ticket' : 'Task'"
							:popper="{ placement: 'right', offsetDistance: 6 }"
						>
							<span
								class="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
								:style="row.type === 'event' ? { backgroundColor: row.color + '1a' } : undefined"
								:class="{
									'bg-amber-500/10': row.type === 'ticket',
									'bg-purple-500/10': row.type === 'task',
								}"
							>
								<Icon
									:name="row.type === 'event' ? 'lucide:calendar' : row.type === 'ticket' ? 'lucide:ticket' : 'lucide:check-square'"
									class="w-3 h-3"
									:style="row.type === 'event' ? { color: row.color } : undefined"
									:class="{
										'text-amber-500': row.type === 'ticket',
										'text-purple-500': row.type === 'task',
									}"
								/>
							</span>
						</UTooltip>

						<!-- Label -->
						<span
							class="text-[11px] truncate flex-1 text-foreground/80"
							:class="{ 'line-through text-muted-foreground': isCompleted(row.status) }"
							:title="row.label"
						>
							{{ row.label }}
						</span>

						<!-- Status pill -->
						<span
							v-if="row.status"
							class="text-[7px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0"
							:class="{
								'text-green-500 bg-green-500/10': isCompleted(row.status),
								'text-blue-500 bg-blue-500/10': row.status?.toLowerCase().replace(/\s+/g, '') === 'inprogress' || row.status?.toLowerCase() === 'active',
								'text-amber-500 bg-amber-500/10': row.status?.toLowerCase() === 'scheduled' || row.status?.toLowerCase() === 'pending',
								'text-muted-foreground bg-muted/40': !isCompleted(row.status) && !['inprogress', 'active', 'scheduled', 'pending'].includes(row.status?.toLowerCase().replace(/\s+/g, '') || ''),
							}"
						>
							{{ row.status }}
						</span>
					</div>
				</div>
			</div>

			<!-- Chart -->
			<div ref="chartScroll" class="mg-chart" @scroll="syncScroll">
				<!-- Header with month labels -->
				<div class="mg-chart-header" :style="{ width: chartWidth + 'px' }">
					<div
						v-for="label in monthLabels"
						:key="label.text"
						class="mg-month-label"
						:class="{ 'mg-month-current': label.isCurrent }"
						:style="{ left: label.x + 'px', width: label.width + 'px' }"
					>
						{{ label.text }}
					</div>
				</div>

				<!-- Rows area -->
				<div class="mg-chart-rows" :style="{ width: chartWidth + 'px', height: (rows.length * ROW_HEIGHT) + 'px' }">
					<!-- Grid lines -->
					<div
						v-for="label in monthLabels"
						:key="'g-' + label.text"
						class="mg-grid-line"
						:style="{ left: label.x + 'px' }"
					/>

					<!-- Today marker -->
					<div class="mg-today" :style="{ left: todayX + 'px' }">
						<div class="mg-today-label">Today</div>
						<div class="mg-today-line" />
					</div>

					<!-- Row bars -->
					<div
						v-for="(row, i) in rows"
						:key="'r-' + row.id"
						class="mg-row"
						:class="{ 'mg-row-alt': i % 2 === 1 }"
						:style="{ top: (i * ROW_HEIGHT) + 'px', height: ROW_HEIGHT + 'px' }"
					>
						<!-- Bar with tooltip -->
						<UTooltip
							v-if="hasBar(row)"
							:popper="{ placement: 'top', offsetDistance: 6 }"
						>
							<template #default>
								<div
									class="mg-bar"
									:class="{ 'cursor-pointer': row.type === 'event' }"
									:style="{
										...getBarStyle(row),
										backgroundColor: row.color,
										opacity: getBarOpacity(row.status),
									}"
									@click="row.type === 'event' && row.raw && emit('event-click', row.raw)"
								>
									</div>
							</template>
							<template #text>
								<div class="text-left">
									<div class="flex items-center gap-1.5 mb-0.5">
										<Icon
											:name="row.type === 'event' ? 'lucide:calendar' : row.type === 'ticket' ? 'lucide:ticket' : 'lucide:check-square'"
											class="w-3 h-3"
											:class="{
												'text-cyan-400': row.type === 'event',
												'text-amber-400': row.type === 'ticket',
												'text-purple-400': row.type === 'task',
											}"
										/>
										<span class="font-medium">{{ row.label }}</span>
									</div>
									<span class="text-[10px] opacity-70">
										{{ row.startDate ? getFriendlyDateTwo(row.startDate) : '' }}
										{{ row.endDate && row.endDate !== row.startDate ? ' → ' + getFriendlyDateTwo(row.endDate) : '' }}
										{{ !row.startDate && row.dueDate ? 'Due ' + getFriendlyDateTwo(row.dueDate) : '' }}
									</span>
								</div>
							</template>
						</UTooltip>

						<!-- Due date diamond -->
						<div
							v-if="!row.startDate && !row.endDate && row.dueDate"
							class="absolute top-1/2 -translate-y-1/2"
							:style="{ left: dateToX(row.dueDate) + 'px' }"
						>
							<UTooltip :text="`${row.label} · Due ${getFriendlyDateTwo(row.dueDate)}`">
								<div class="mg-diamond" :style="{ backgroundColor: row.color }" />
							</UTooltip>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.mg-container {
	border: 1px solid hsl(var(--border) / 0.5);
	border-radius: 12px;
	overflow: hidden;
	background: hsl(var(--background));
}

.mg-body {
	display: flex;
	max-height: 360px;
	overflow: hidden;
}

/* ── Sidebar ── */
.mg-sidebar {
	width: 140px;
	min-width: 140px;
	border-right: 1px solid hsl(var(--border) / 0.4);
	display: flex;
	flex-direction: column;
	background: hsl(var(--background));
}
@media (min-width: 640px) {
	.mg-sidebar {
		width: 220px;
		min-width: 220px;
	}
}

.mg-sidebar-header {
	height: 36px;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0 12px;
	border-bottom: 1px solid hsl(var(--border) / 0.4);
	background: hsl(var(--muted) / 0.1);
}

.mg-sidebar-rows {
	flex: 1;
	overflow-y: auto;
	overflow-x: hidden;
	scrollbar-width: none;
}
.mg-sidebar-rows::-webkit-scrollbar { display: none; }

.mg-sidebar-row {
	height: 32px;
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 0 12px;
	padding-left: 14px;
	border-bottom: 1px solid hsl(var(--border) / 0.1);
	cursor: default;
	transition: background 0.1s;
	position: relative;
}
.mg-sidebar-row:hover { background: hsl(var(--muted) / 0.15); }

.mg-color-bar {
	position: absolute;
	left: 0;
	top: 4px;
	bottom: 4px;
	width: 2px;
	border-radius: 1px;
	opacity: 0.5;
}

/* ── Chart ── */
.mg-chart {
	flex: 1;
	overflow: auto;
	position: relative;
}

.mg-chart-header {
	position: sticky;
	top: 0;
	z-index: 10;
	height: 36px;
	background: hsl(var(--muted) / 0.1);
	border-bottom: 1px solid hsl(var(--border) / 0.4);
}

.mg-month-label {
	position: absolute;
	top: 0;
	height: 36px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 10px;
	font-weight: 600;
	letter-spacing: 0.04em;
	color: hsl(var(--muted-foreground));
	border-right: 1px solid hsl(var(--border) / 0.2);
	user-select: none;
}

.mg-month-current {
	color: hsl(var(--primary));
	background: hsl(var(--primary) / 0.04);
}

.mg-chart-rows {
	position: relative;
	min-height: 100%;
}

.mg-grid-line {
	position: absolute;
	top: 0;
	bottom: 0;
	width: 1px;
	background: hsl(var(--border) / 0.08);
	pointer-events: none;
}

/* ── Today ── */
.mg-today {
	position: absolute;
	top: 0;
	bottom: 0;
	z-index: 5;
	pointer-events: none;
}

.mg-today-label {
	position: absolute;
	top: -32px;
	left: 50%;
	transform: translateX(-50%);
	font-size: 7px;
	font-weight: 700;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: hsl(var(--primary));
	background: hsl(var(--primary) / 0.08);
	padding: 2px 6px;
	border-radius: 999px;
	white-space: nowrap;
}

.mg-today-line {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	width: 1px;
	background: hsl(var(--primary));
	opacity: 0.35;
}

/* ── Rows ── */
.mg-row {
	position: absolute;
	left: 0;
	right: 0;
	border-bottom: 1px solid hsl(var(--border) / 0.06);
}
.mg-row-alt { background: hsl(var(--muted) / 0.02); }

/* ── Bars ── */
.mg-bar {
	position: absolute;
	top: 50%;
	transform: translateY(-50%);
	height: 12px;
	border-radius: 6px;
	cursor: default;
	transition: filter 0.15s;
	min-width: 6px;
	z-index: 1;
}
.mg-bar:hover {
	filter: brightness(0.92);
	z-index: 2;
}

.mg-bar-completed {
	opacity: 0.3;
}

/* ── Diamond milestone ── */
.mg-diamond {
	width: 8px;
	height: 8px;
	transform: rotate(45deg);
	border-radius: 1px;
	opacity: 0.8;
}
</style>
