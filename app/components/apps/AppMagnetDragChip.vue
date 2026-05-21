<!--
  AppMagnetDragChip — slot wrapper that registers its child as a drag
  source for `useDragMagnet`. Renders a block-level div so the slot's
  bounding rect resolves correctly (display:contents would zero it out).

  Slot content is what the user grabs; the cloned ghost mirrors the
  rendered DOM.
-->
<script setup lang="ts">
const props = defineProps<{
	type: string;
	payload: unknown;
}>();
const emit = defineEmits<{
	dragstart: [];
	dragend: [result: { dropped: boolean }];
}>();

const el = ref<HTMLElement | null>(null);

useDragSource(el, () => ({
	type: props.type,
	payload: props.payload,
	onStart: () => emit('dragstart'),
	onEnd: (r) => emit('dragend', r),
}));
</script>

<template>
	<div ref="el" class="app-magnet-drag-chip">
		<slot />
	</div>
</template>

<style scoped>
.app-magnet-drag-chip {
	display: inline-flex;
	cursor: grab;
	transition: transform 120ms ease;
}
.app-magnet-drag-chip:active {
	cursor: grabbing;
	transform: scale(0.96);
}
.app-magnet-drag-chip[data-drag-source-active="true"] {
	transform: none;
}
</style>
