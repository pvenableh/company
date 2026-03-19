<template>
	<!-- Desktop-only floating dock (hidden on mobile where tab bar exists) -->
	<div v-if="user" class="floating-dock hidden md:flex">
		<!-- Dock buttons (always visible) -->
		<div class="dock-bar">
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
		</div>

		<!-- Expanded panel -->
		<Transition name="dock-panel">
			<div
				v-if="activePanel"
				class="dock-panel"
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
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.floating-dock {
	position: fixed;
	bottom: 1.5rem;
	right: 1.5rem;
	z-index: 40;
	flex-direction: column;
	align-items: flex-end;
	gap: 8px;
}

/* Dock bar with buttons */
.dock-bar {
	display: flex;
	align-items: center;
	gap: 2px;
	padding: 4px;
	border-radius: 14px;
	border: 1px solid hsl(var(--border));
	background: hsl(var(--card) / 0.9);
	backdrop-filter: saturate(180%) blur(20px);
	-webkit-backdrop-filter: saturate(180%) blur(20px);
	box-shadow:
		0 1px 3px rgb(0 0 0 / 0.08),
		0 4px 16px rgb(0 0 0 / 0.06);
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
	background: hsl(var(--muted) / 0.6);
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
	bottom: 52px;
	right: 0;
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
	overflow: hidden;
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
