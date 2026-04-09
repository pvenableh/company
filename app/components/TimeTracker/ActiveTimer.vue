<template>
	<div
		v-if="isTimerRunning && activeTimer"
		class="ios-card rounded-2xl border border-border bg-card overflow-hidden"
	>
		<!-- Accent border left edge -->
		<div class="flex">
			<div class="w-1 shrink-0" :class="isTimerPaused ? 'bg-amber-500' : 'bg-red-500 animate-pulse'" />

			<div class="flex-1 p-5 space-y-4">
				<!-- Timer display -->
				<div class="flex items-center gap-3">
					<span :class="isTimerPaused ? 'paused-dot' : 'pulsing-dot'" />
					<span class="text-4xl md:text-5xl font-mono font-semibold tabular-nums tracking-tight" :class="isTimerPaused ? 'text-muted-foreground' : 'text-foreground'">
						{{ formatElapsed(elapsed) }}
					</span>
					<Badge v-if="isTimerPaused" variant="outline" class="text-xs text-amber-600 border-amber-300 dark:border-amber-700">
						Paused
					</Badge>
				</div>

				<!-- Description + pills -->
				<div class="space-y-2">
					<p v-if="activeTimer.description" class="text-sm text-foreground font-medium">
						{{ activeTimer.description }}
					</p>
					<p v-else class="text-sm text-muted-foreground italic">
						No description
					</p>

					<div class="flex flex-wrap items-center gap-1.5">
						<Badge v-if="clientName" variant="secondary" class="text-xs">
							<Icon name="lucide:building-2" class="w-3 h-3" />
							{{ clientName }}
						</Badge>
						<Badge v-if="projectName" variant="outline" class="text-xs">
							<Icon name="lucide:folder" class="w-3 h-3" />
							{{ projectName }}
						</Badge>
						<Badge v-if="activeTimer.billable" variant="outline" class="text-xs text-emerald-600 border-emerald-200 dark:border-emerald-800">
							<Icon name="lucide:dollar-sign" class="w-3 h-3" />
							Billable
						</Badge>
					</div>
				</div>

				<!-- Actions -->
				<div class="flex items-center gap-2 pt-1">
					<Button v-if="isTimerPaused" class="flex-1" @click="handleResume">
						<Icon name="lucide:play" class="w-4 h-4" />
						Resume
					</Button>
					<Button v-else variant="outline" class="flex-1" @click="handlePause">
						<Icon name="lucide:pause" class="w-4 h-4" />
						Pause
					</Button>
					<Button class="flex-1" @click="handleStop">
						<Icon name="lucide:square" class="w-4 h-4" />
						Stop
					</Button>
					<Button variant="ghost" class="text-destructive hover:text-destructive hover:bg-destructive/10" @click="handleDiscard">
						<Icon name="lucide:trash-2" class="w-4 h-4" />
						Discard
					</Button>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';

const {
	activeTimer,
	elapsed,
	isTimerRunning,
	isTimerPaused,
	stopTimer,
	pauseTimer,
	resumeTimer,
	discardTimer,
	formatElapsed,
} = useTimeTracker();

const { clientList } = useClients();

const clientName = computed(() => {
	if (!activeTimer.value?.client) return null;
	const found = clientList.value.find((c) => c.id === activeTimer.value!.client);
	return found?.name || null;
});

const projectName = computed(() => {
	// Project name is not stored in activeTimer state, only the ID.
	// We'll show a generic label if a project is associated.
	if (!activeTimer.value?.project) return null;
	return 'Project';
});

async function handleStop() {
	await stopTimer();
}

function handlePause() {
	pauseTimer();
}

function handleResume() {
	resumeTimer();
}

async function handleDiscard() {
	await discardTimer();
}
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.pulsing-dot {
	display: inline-block;
	width: 10px;
	height: 10px;
	border-radius: 50%;
	background-color: hsl(var(--destructive));
	animation: pulse-dot 1.5s ease-in-out infinite;
}

.paused-dot {
	display: inline-block;
	width: 10px;
	height: 10px;
	border-radius: 50%;
	background-color: #d97706;
	opacity: 0.6;
}

@keyframes pulse-dot {
	0%, 100% {
		opacity: 1;
		transform: scale(1);
	}
	50% {
		opacity: 0.4;
		transform: scale(0.85);
	}
}
</style>
