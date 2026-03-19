<template>
	<UModal v-model="isOpen" class="sm:max-w-md">
		<template #header>
			<div class="flex items-center justify-between w-full">
				<span class="text-sm font-semibold">Time Tracker</span>
				<NuxtLink
					to="/time-tracker"
					class="text-xs text-primary hover:underline"
					@click="isOpen = false"
				>
					View all entries
				</NuxtLink>
			</div>
		</template>

		<div class="space-y-4">
			<!-- Active timer display -->
			<div v-if="isTimerRunning && activeTimer" class="space-y-3">
				<div class="flex items-center gap-3">
					<span class="pulsing-dot" />
					<span class="text-3xl font-mono font-semibold tabular-nums text-foreground tracking-tight">
						{{ formatElapsed(elapsed) }}
					</span>
				</div>

				<div class="space-y-1.5">
					<p v-if="activeTimer.description" class="text-sm text-foreground font-medium">
						{{ activeTimer.description }}
					</p>
					<p v-else class="text-sm text-muted-foreground italic">No description</p>

					<div class="flex flex-wrap items-center gap-1.5">
						<span v-if="clientName" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground">
							<UIcon name="i-heroicons-building-office-2" class="w-3 h-3" />
							{{ clientName }}
						</span>
						<span v-if="activeTimer.billable" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-xs text-emerald-600 dark:text-emerald-400">
							<UIcon name="i-heroicons-currency-dollar" class="w-3 h-3" />
							Billable
						</span>
					</div>
				</div>

				<div class="flex items-center gap-2 pt-1">
					<button
						class="flex-1 h-9 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
						@click="handleStop"
					>
						<UIcon name="i-heroicons-stop" class="w-4 h-4" />
						Stop Timer
					</button>
					<button
						class="h-9 px-3 rounded-lg border border-border text-destructive text-sm font-medium hover:bg-destructive/10 transition-colors flex items-center gap-2"
						@click="handleDiscard"
					>
						<UIcon name="i-heroicons-trash" class="w-4 h-4" />
						Discard
					</button>
				</div>
			</div>

			<!-- Start form (when no timer running) -->
			<div v-else>
				<TimeTrackerStartForm @started="isOpen = false" />
			</div>
		</div>
	</UModal>
</template>

<script setup lang="ts">
const isOpen = defineModel<boolean>({ default: false });

const {
	activeTimer,
	elapsed,
	isTimerRunning,
	stopTimer,
	discardTimer,
	formatElapsed,
} = useTimeTracker();

const { clientList } = useClients();

const clientName = computed(() => {
	if (!activeTimer.value?.client) return null;
	const found = clientList.value.find((c: any) => c.id === activeTimer.value!.client);
	return found?.name || null;
});

async function handleStop() {
	await stopTimer();
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
