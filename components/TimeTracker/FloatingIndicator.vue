<template>
	<Transition name="float">
		<button
			v-if="isTimerRunning && activeTimer"
			class="floating-indicator"
			@click="openTimeTrackerModal()"
		>
			<span :class="isTimerPaused ? 'paused-dot-sm' : 'pulsing-dot-sm'" />
			<span class="text-xs font-mono font-semibold tabular-nums" :class="isTimerPaused ? 'text-muted-foreground' : 'text-foreground'">
				{{ formatElapsed(elapsed) }}
			</span>
			<span v-if="isTimerPaused" class="text-xs text-amber-600 font-medium">
				Paused
			</span>
			<span
				v-else-if="activeTimer.description"
				class="text-xs text-muted-foreground truncate max-w-[120px]"
			>
				{{ activeTimer.description }}
			</span>
		</button>
	</Transition>

</template>

<script setup lang="ts">
import { openTimeTrackerModal } from '~~/composables/useTimeTrackerModal';

const {
	activeTimer,
	elapsed,
	isTimerRunning,
	isTimerPaused,
	formatElapsed,
} = useTimeTracker();
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.floating-indicator {
	position: fixed;
	bottom: 5rem;
	right: 1rem;
	z-index: 40;
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 6px 14px;
	border-radius: 9999px;
	border: 1px solid hsl(var(--border));
	background: hsl(var(--card) / 0.85);
	backdrop-filter: saturate(180%) blur(16px);
	-webkit-backdrop-filter: saturate(180%) blur(16px);
	box-shadow:
		0 1px 3px rgb(0 0 0 / 0.08),
		0 4px 12px rgb(0 0 0 / 0.04);
	cursor: pointer;
	transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.floating-indicator:hover {
	transform: translateY(-1px);
	box-shadow:
		0 2px 6px rgb(0 0 0 / 0.1),
		0 6px 16px rgb(0 0 0 / 0.06);
}

.floating-indicator:active {
	transform: scale(0.96);
}

.pulsing-dot-sm {
	display: inline-block;
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background-color: hsl(var(--destructive));
	animation: pulse-dot-sm 1.5s ease-in-out infinite;
	flex-shrink: 0;
}

.paused-dot-sm {
	display: inline-block;
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background-color: #d97706;
	opacity: 0.6;
	flex-shrink: 0;
}

@keyframes pulse-dot-sm {
	0%, 100% {
		opacity: 1;
		transform: scale(1);
	}
	50% {
		opacity: 0.4;
		transform: scale(0.8);
	}
}

/* Transition */
.float-enter-active {
	transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.float-leave-active {
	transition: all 0.2s ease-in;
}
.float-enter-from {
	opacity: 0;
	transform: translateY(16px) scale(0.9);
}
.float-leave-to {
	opacity: 0;
	transform: translateY(8px) scale(0.95);
}
</style>
