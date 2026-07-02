<template>
	<EarnestMark
		v-if="mascot.enabled.value"
		ref="markRef"
		:size="size"
	/>
</template>

<script setup lang="ts">
/**
 * <EarnestMascot> — the mount host for the mascot.
 *
 * Renders the reactive logo mark ONLY when the mascot is enabled (global flag +
 * per-user pref + reduced-motion), and replays whatever `useEarnestMascot()`
 * broadcasts onto the mark. Producers never touch the component — they just call
 * `useEarnestMascot().react(...)`; this is the single subscriber that plays it.
 *
 * Mount ONE of these (the AI panel). It's cheap and self-gating: when disabled
 * it renders nothing.
 */
const props = withDefaults(defineProps<{ size?: number | string }>(), { size: 34 });

const mascot = useEarnestMascot();
const markRef = ref<{ react: (g: string) => void } | null>(null);

// Replay bus events onto the mounted mark. `event` carries an incrementing id
// so repeated identical gestures still fire.
watch(
	() => mascot.event.value,
	(e) => {
		if (e && markRef.value) markRef.value.react(e.gesture);
	},
);
</script>
