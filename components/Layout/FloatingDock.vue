<template>
	<!-- Desktop-only floating dock (hidden on mobile where tab bar exists) -->
	<div
		v-if="user"
		ref="dockRef"
		class="floating-dock hidden md:flex"
		:class="[
			{ 'dock-dragging': isDragging, 'dock-transitioning': isSnapping },
			currentCorner.includes('right') ? 'items-end' : 'items-start',
		]"
		:style="dockStyle"
	>
		<!-- Dock buttons (always visible) -->
		<div
			class="dock-bar"
			@pointerdown="onDragStart"
		>
			<!-- Tasks button -->
			<button
				class="dock-btn"
				:class="{ 'dock-btn-active': activePanel === 'tasks' }"
				title="Tasks"
				@click="togglePanel('tasks')"
			>
				<Icon name="lucide:check-square" class="w-4 h-4" />
				<span v-if="taskCount > 0" class="dock-badge">{{ taskCount }}</span>
			</button>

			<!-- Time Tracker button -->
			<button
				class="dock-btn"
				:class="{
					'dock-btn-active': activePanel === 'timer',
					'dock-btn-recording': isTimerRunning,
				}"
				title="Time Tracker"
				@click="togglePanel('timer')"
			>
				<Icon name="lucide:timer" class="w-4 h-4" />
				<span v-if="isTimerRunning" class="dock-recording-dot" />
			</button>

			<!-- Earnest AI button -->
			<button
				class="dock-btn dock-btn-ai"
				title="Earnest AI"
				@click="emit('open-ai')"
			>
				<Icon name="heroicons:sparkles" class="w-4 h-4" />
			</button>
		</div>

		<!-- Expanded panel -->
		<Transition name="dock-panel">
			<div
				v-if="activePanel"
				class="dock-panel"
				:class="panelPositionClass"
			>
				<!-- Panel header -->
				<div class="dock-panel-header">
					<span class="text-xs font-semibold uppercase tracking-wider">
						{{ activePanel === 'tasks' ? 'Quick Tasks' : 'Time Tracker' }}
					</span>
					<div class="flex items-center gap-1">
						<button
							class="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
							title="Minimize"
							@click="activePanel = null"
						>
							<Icon name="lucide:minus" class="w-3.5 h-3.5" />
						</button>
					</div>
				</div>

				<!-- Panel body -->
				<div class="dock-panel-body">
					<!-- Tasks Panel -->
					<div v-if="activePanel === 'tasks'" class="h-full overflow-y-auto hide-scrollbar px-4 py-3">
						<TasksQuickTaskGenerator />

						<!-- Link to full page -->
						<NuxtLink
							to="/tasks"
							class="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
							@click="activePanel = null"
						>
							See all tasks
							<Icon name="lucide:arrow-right" class="w-3 h-3" />
						</NuxtLink>
					</div>

					<!-- Timer Panel -->
					<div v-if="activePanel === 'timer'" class="h-full overflow-y-auto hide-scrollbar px-4 py-3">
						<!-- Active timer display -->
						<div v-if="isTimerRunning && activeTimer" class="space-y-3">
							<div class="flex items-center gap-2">
								<span class="pulsing-dot" />
								<span class="text-2xl font-mono font-bold tabular-nums">{{ formatElapsed(elapsed) }}</span>
							</div>
							<p v-if="activeTimer.description" class="text-sm text-muted-foreground">{{ activeTimer.description }}</p>
							<div class="flex items-center gap-2">
								<span v-if="activeTimer.client_id" class="text-xs bg-muted/60 px-2 py-0.5 rounded-full">
									{{ activeTimer.client_name || 'Client' }}
								</span>
								<span v-if="activeTimer.billable" class="text-xs bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full">Billable</span>
							</div>
							<div class="flex gap-2 pt-2">
								<button
									class="flex-1 h-8 rounded-lg bg-destructive text-destructive-foreground text-xs font-medium hover:bg-destructive/90 transition-colors"
									@click="stopTimer()"
								>
									Stop
								</button>
								<button
									class="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
									@click="discardTimer()"
								>
									Discard
								</button>
							</div>
						</div>

						<!-- Start form when no timer -->
						<div v-else>
							<TimeTrackerStartForm />
						</div>

						<!-- Link to full page -->
						<NuxtLink
							to="/time-tracker"
							class="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
							@click="activePanel = null"
						>
							View all entries
							<Icon name="lucide:arrow-right" class="w-3 h-3" />
						</NuxtLink>
					</div>
				</div>
			</div>
		</Transition>
	</div>
</template>

<script setup lang="ts">
const { user } = useDirectusAuth();
const { activeTasks } = useQuickTasks();
const {
	activeTimer,
	elapsed,
	isTimerRunning,
	formatElapsed,
	stopTimer,
	discardTimer,
} = useTimeTracker();

const emit = defineEmits(['open-ai']);
const activePanel = ref<'tasks' | 'timer' | null>(null);

const taskCount = computed(() => activeTasks.value.length);

function togglePanel(panel: 'tasks' | 'timer') {
	activePanel.value = activePanel.value === panel ? null : panel;
}

// Auto-open timer panel when timer starts
watch(isTimerRunning, (running) => {
	if (running && !activePanel.value) {
		// Don't auto-open, just let the badge show
	}
});

// ── Drag-and-drop with snap-to-corner ──
type Corner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

const DOCK_STORAGE_KEY = 'dock-position';
const MARGIN = 24; // px from edge
const TOP_OFFSET = 80; // header clearance for top positions
const TOOLBAR_BOTTOM_OFFSET = '5rem'; // bottom offset when mobile toolbar is visible (md–xl)
const DEFAULT_BOTTOM_OFFSET = '1.5rem'; // bottom offset when toolbar is hidden (xl+)

// Track whether the mobile toolbar is visible (below xl breakpoint)
const mobileToolbarVisible = ref(true);
if (import.meta.client) {
	const mql = window.matchMedia('(min-width: 1280px)');
	mobileToolbarVisible.value = !mql.matches;
	mql.addEventListener('change', (e) => {
		mobileToolbarVisible.value = !e.matches;
	});
}

const dockRef = ref<HTMLElement | null>(null);
const isDragging = ref(false);
const isSnapping = ref(false);
const currentCorner = ref<Corner>('bottom-right');

// Drag state (not reactive for perf)
let dragStartX = 0;
let dragStartY = 0;
let dockStartX = 0;
let dockStartY = 0;
let currentX = 0;
let currentY = 0;

// Load saved position
if (import.meta.client) {
	try {
		const saved = localStorage.getItem(DOCK_STORAGE_KEY);
		if (saved && ['bottom-right', 'bottom-left', 'top-right', 'top-left'].includes(saved)) {
			currentCorner.value = saved as Corner;
		}
	} catch {}
}

const cornerStyles = computed(() => {
	const c = currentCorner.value;
	const style: Record<string, string> = {};

	if (c.includes('bottom')) {
		style.bottom = mobileToolbarVisible.value ? TOOLBAR_BOTTOM_OFFSET : DEFAULT_BOTTOM_OFFSET;
		style.top = 'auto';
	} else {
		style.top = `${TOP_OFFSET}px`;
		style.bottom = 'auto';
	}

	if (c.includes('right')) {
		style.right = `${MARGIN}px`;
		style.left = 'auto';
	} else {
		style.left = `${MARGIN}px`;
		style.right = 'auto';
	}

	return style;
});

const dockStyle = computed(() => {
	if (isDragging.value) {
		return {
			position: 'fixed' as const,
			left: `${currentX}px`,
			top: `${currentY}px`,
			right: 'auto',
			bottom: 'auto',
			zIndex: 40,
		};
	}

	return {
		...cornerStyles.value,
		zIndex: 40,
	};
});

// Panel opens toward screen center depending on corner
const panelPositionClass = computed(() => {
	const c = currentCorner.value;
	if (c === 'bottom-right') return 'panel-bottom-right';
	if (c === 'bottom-left') return 'panel-bottom-left';
	if (c === 'top-right') return 'panel-top-right';
	if (c === 'top-left') return 'panel-top-left';
	return 'panel-bottom-right';
});

// Align items to the correct side
const alignClass = computed(() => {
	return currentCorner.value.includes('right') ? 'align-end' : 'align-start';
});

function onDragStart(e: PointerEvent) {
	// Only primary button
	if (e.button !== 0) return;

	const el = dockRef.value;
	if (!el) return;

	const rect = el.getBoundingClientRect();
	dragStartX = e.clientX;
	dragStartY = e.clientY;
	dockStartX = rect.left;
	dockStartY = rect.top;
	currentX = rect.left;
	currentY = rect.top;

	// Use a small threshold before committing to drag (to not block clicks)
	const onMove = (ev: PointerEvent) => {
		const dx = ev.clientX - dragStartX;
		const dy = ev.clientY - dragStartY;

		if (!isDragging.value && Math.abs(dx) + Math.abs(dy) < 6) return;

		if (!isDragging.value) {
			isDragging.value = true;
			activePanel.value = null; // close panel while dragging
		}

		currentX = dockStartX + dx;
		currentY = dockStartY + dy;

		// Force reactivity update for position
		dockRef.value!.style.left = `${currentX}px`;
		dockRef.value!.style.top = `${currentY}px`;
		dockRef.value!.style.right = 'auto';
		dockRef.value!.style.bottom = 'auto';
	};

	const onUp = () => {
		document.removeEventListener('pointermove', onMove);
		document.removeEventListener('pointerup', onUp);

		if (isDragging.value) {
			isDragging.value = false;
			snapToNearestCorner();
		}
	};

	document.addEventListener('pointermove', onMove);
	document.addEventListener('pointerup', onUp);
}

function snapToNearestCorner() {
	const el = dockRef.value;
	if (!el) return;

	const rect = el.getBoundingClientRect();
	const centerX = rect.left + rect.width / 2;
	const centerY = rect.top + rect.height / 2;
	const vw = window.innerWidth;
	const vh = window.innerHeight;

	// Determine nearest corner by comparing center position to screen quadrants
	const isRight = centerX > vw / 2;
	const isBottom = centerY > vh / 2;

	const corner: Corner = `${isBottom ? 'bottom' : 'top'}-${isRight ? 'right' : 'left'}` as Corner;
	currentCorner.value = corner;

	// Animate to final position
	isSnapping.value = true;
	setTimeout(() => {
		isSnapping.value = false;
	}, 300);

	// Persist
	try {
		localStorage.setItem(DOCK_STORAGE_KEY, corner);
	} catch {}
}
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.floating-dock {
	position: fixed;
	z-index: 40;
	flex-direction: column;
	gap: 8px;
	user-select: none;
}

.floating-dock.dock-transitioning {
	transition: top 0.3s cubic-bezier(0.16, 1, 0.3, 1),
		bottom 0.3s cubic-bezier(0.16, 1, 0.3, 1),
		left 0.3s cubic-bezier(0.16, 1, 0.3, 1),
		right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.floating-dock.dock-dragging {
	opacity: 0.85;
}

/* Dock bar with buttons */
.dock-bar {
	display: flex;
	align-items: center;
	gap: 2px;
	padding: 4px 8px;
	border-radius: 100px;
	border: 1px solid hsl(var(--primary) / 0.2);
	background: hsl(var(--primary) / 0.08);
	backdrop-filter: saturate(180%) blur(20px);
	-webkit-backdrop-filter: saturate(180%) blur(20px);
	box-shadow:
		0 1px 3px hsl(var(--primary) / 0.1),
		0 4px 16px hsl(var(--primary) / 0.06);
	cursor: grab;
	touch-action: none;
}

.dock-dragging .dock-bar {
	cursor: grabbing;
}

.dock-btn {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	height: 36px;
	border-radius: 10px;
	color: hsl(var(--muted-foreground));
	transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.dock-btn:hover {
	background: hsl(var(--primary) / 0.15);
	color: hsl(var(--foreground));
	transform: translateY(-1px);
}

.dock-btn:active {
	transform: scale(0.92);
}

.dock-btn-active {
	background: hsl(var(--primary) / 0.1);
	color: hsl(var(--primary));
}

.dock-btn-recording {
	color: hsl(var(--destructive));
}

.dock-btn-ai {
	color: hsl(var(--primary));
}

.dock-btn-ai:hover {
	background: hsl(var(--primary) / 0.2);
	color: hsl(var(--primary));
}

.dock-badge {
	position: absolute;
	top: 2px;
	right: 2px;
	min-width: 14px;
	height: 14px;
	border-radius: 7px;
	background: hsl(var(--primary));
	color: hsl(var(--primary-foreground));
	font-size: 9px;
	font-weight: 700;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 0 3px;
	line-height: 1;
}

.dock-recording-dot {
	position: absolute;
	top: 4px;
	right: 4px;
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: hsl(var(--destructive));
	animation: pulse-recording 1.5s ease-in-out infinite;
}

@keyframes pulse-recording {
	0%, 100% { opacity: 1; transform: scale(1); }
	50% { opacity: 0.4; transform: scale(0.7); }
}

/* Expanded panel */
.dock-panel {
	position: absolute;
	width: 360px;
	max-height: min(70vh, 560px);
	border-radius: 16px;
	border: 1px solid hsl(var(--border));
	background: hsl(var(--card));
	box-shadow:
		0 4px 24px rgb(0 0 0 / 0.1),
		0 1px 4px rgb(0 0 0 / 0.06);
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

/* Panel positioning per corner */
.panel-bottom-right {
	bottom: 52px;
	right: 0;
}

.panel-bottom-left {
	bottom: 52px;
	left: 0;
}

.panel-top-right {
	top: 52px;
	right: 0;
}

.panel-top-left {
	top: 52px;
	left: 0;
}

.dock-panel-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 12px 16px;
	border-bottom: 1px solid hsl(var(--border));
	background: hsl(var(--muted) / 0.3);
}

.dock-panel-body {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
}

/* Panel transition */
.dock-panel-enter-active {
	transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.dock-panel-leave-active {
	transition: all 0.2s cubic-bezier(0.4, 0, 1, 1);
}

.dock-panel-enter-from {
	opacity: 0;
	transform: translateY(12px) scale(0.95);
}

.dock-panel-leave-to {
	opacity: 0;
	transform: translateY(8px) scale(0.97);
}

/* Pulsing dot for active timer */
.pulsing-dot {
	display: inline-block;
	width: 10px;
	height: 10px;
	border-radius: 50%;
	background-color: hsl(var(--destructive));
	animation: pulse-recording 1.5s ease-in-out infinite;
	flex-shrink: 0;
}

.hide-scrollbar {
	scrollbar-width: none;
	-ms-overflow-style: none;
}
.hide-scrollbar::-webkit-scrollbar {
	display: none;
}
</style>
