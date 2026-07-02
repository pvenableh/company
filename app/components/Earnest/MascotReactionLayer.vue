<template>
	<Teleport to="body">
		<div v-if="mascot.enabled.value" class="ear-react-layer" aria-hidden="true">
			<Transition name="ear-react">
				<div v-if="active" :key="active.id" class="ear-react">
					<EarnestMark ref="markRef" :size="46" />
				</div>
			</Transition>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
/**
 * <EarnestMascotReactionLayer> — global "Earnest reacts" overlay.
 *
 * Invisible at rest. On a BIGGER win it pops the Earnest mark in just above the
 * arcade "+EP" coin stream, plays the gesture once, then fades out. Mounted once
 * globally (next to <ArcadeRewardLayer>), so these reactions show anywhere in
 * the app without the assistant panel open.
 *
 * Deliberately narrow so Earnest stays rare and charming:
 *   - only `clap` (ticket / project / deal / paid) and `celebrate` (quests /
 *     level-up) pop globally — everyday `thumbsup`/`check` stay as just the
 *     "+EP" coin, and only show on the mark if the panel is open.
 *   - suppressed entirely while the assistant panel is open — that instance
 *     already reacts in its header, so we never double up.
 *   - `think`/`idle` are the panel's job, never a global pop.
 * Gated by `useEarnestMascot().enabled`.
 */
import type { MarkGesture } from '~/components/Earnest/Mark.vue';

const mascot = useEarnestMascot();
const { panelOpen } = useEarnestPanel();
const markRef = ref<{ react: (g: MarkGesture) => void } | null>(null);
const active = ref<{ id: number; gesture: MarkGesture } | null>(null);
let hideTimer: ReturnType<typeof setTimeout> | null = null;

// Which gestures earn a global pop, and how long the chip lingers (ms).
const GLOBAL_HOLD: Partial<Record<MarkGesture, number>> = {
	clap: 1600,
	celebrate: 2100,
};

watch(
	() => mascot.event.value,
	async (e) => {
		if (!e) return;
		const hold = GLOBAL_HOLD[e.gesture];
		if (!hold) return; // not a "bigger win" — skip the global pop
		if (panelOpen.value) return; // the panel's header instance already reacts
		active.value = { id: e.id, gesture: e.gesture };
		await nextTick();
		markRef.value?.react(e.gesture);
		if (hideTimer) clearTimeout(hideTimer);
		hideTimer = setTimeout(() => (active.value = null), hold);
	},
);

onBeforeUnmount(() => {
	if (hideTimer) clearTimeout(hideTimer);
});

// Dev-only bus handle so the mascot lab / console can fire real reactions.
if (import.meta.dev && import.meta.client) {
	onMounted(() => {
		(window as any).__earnestReact = (g: MarkGesture) => mascot.react(g);
	});
}
</script>

<style scoped>
.ear-react-layer {
	position: fixed;
	inset: 0;
	z-index: 82;
	pointer-events: none;
}
.ear-react {
	position: absolute;
	left: 50%;
	bottom: clamp(150px, 28vh, 320px);
	transform: translateX(-50%);
	width: 64px;
	height: 64px;
	border-radius: 9999px;
	display: grid;
	place-items: center;
	/* brand ink for the E; the fixed blue dot carries the accent */
	color: hsl(var(--foreground));
	background: hsl(var(--card) / 0.92);
	box-shadow:
		0 14px 34px -10px rgba(0, 0, 0, 0.4),
		0 0 0 1px hsl(var(--border) / 0.6);
	backdrop-filter: blur(8px) saturate(1.2);
}
.ear-react-enter-active {
	transition: transform 0.38s cubic-bezier(0.22, 1.3, 0.36, 1), opacity 0.3s ease;
}
.ear-react-leave-active {
	transition: transform 0.32s ease, opacity 0.32s ease;
}
.ear-react-enter-from {
	opacity: 0;
	transform: translateX(-50%) translateY(18px) scale(0.55);
}
.ear-react-leave-to {
	opacity: 0;
	transform: translateX(-50%) translateY(-10px) scale(0.85);
}

@media (prefers-reduced-motion: reduce) {
	.ear-react-enter-active,
	.ear-react-leave-active {
		transition: opacity 0.2s ease;
	}
}
</style>
