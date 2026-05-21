<!--
  AppMagnetDropZone — slot wrapper that registers its child as a drop
  target for `useDragMagnet`. The wrapper itself is the hit-tested
  element, so style it (border-radius, padding) to match the visual
  affordance the user is dropping onto.

  While a matching drag is hovering, the wrapper carries
  `data-magnet-active="true"`; after a successful commit it carries
  `data-magnet-pulse="true"` for ~600ms. Use those attributes for the
  highlight + pulse styling.
-->
<script setup lang="ts">
const props = defineProps<{
	accepts: string | string[];
}>();
const emit = defineEmits<{
	drop: [payload: unknown];
	magnetEnter: [];
	magnetLeave: [];
}>();

const el = ref<HTMLElement | null>(null);

useDropTarget(el, {
	accepts: props.accepts,
	onDrop: (p) => emit('drop', p),
	onMagnetEnter: () => emit('magnetEnter'),
	onMagnetLeave: () => emit('magnetLeave'),
});
</script>

<template>
	<div ref="el" class="app-magnet-drop-zone">
		<slot />
	</div>
</template>

<style scoped>
.app-magnet-drop-zone {
	position: relative;
	border-radius: 8px;
	transition: background-color 180ms ease, box-shadow 180ms ease, transform 180ms cubic-bezier(0.36, 0.66, 0.04, 1);
}
.app-magnet-drop-zone[data-magnet-active="true"] {
	background-color: hsl(var(--primary) / 0.08);
	box-shadow: 0 0 0 2px hsl(var(--primary) / 0.45) inset;
	transform: scale(1.01);
}
.app-magnet-drop-zone[data-magnet-pulse="true"] {
	animation: magnet-pulse 600ms cubic-bezier(0.36, 0.66, 0.04, 1);
}
@keyframes magnet-pulse {
	0% {
		background-color: hsl(var(--primary) / 0.25);
		box-shadow: 0 0 0 3px hsl(var(--primary) / 0.55) inset;
	}
	100% {
		background-color: hsl(var(--primary) / 0);
		box-shadow: 0 0 0 0 hsl(var(--primary) / 0) inset;
	}
}
</style>
