<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core';

const props = withDefaults(
	defineProps<{
		// Pre-mount margin: starts loading this far before the slot enters
		// the viewport so the user rarely sees the placeholder.
		rootMargin?: string;
		// Placeholder height — keeps layout stable while the slot is unmounted.
		minHeight?: string;
	}>(),
	{
		rootMargin: '400px',
		minHeight: '160px',
	},
);

const target = ref<HTMLElement | null>(null);
const visible = ref(false);

// The Earnest layout scrolls inside <main class="overflow-auto">, not the
// document viewport. Default IntersectionObserver root = viewport never
// fires for content below the inner scroll, so we walk up at mount to find
// the real scrolling ancestor and pass it as `root`. Falls back to viewport
// when no scrolling ancestor is found.
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
	let cur = el?.parentElement ?? null;
	while (cur && cur !== document.documentElement) {
		const cs = getComputedStyle(cur);
		if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && cur.scrollHeight > cur.clientHeight) {
			return cur;
		}
		cur = cur.parentElement;
	}
	return null;
}

let stopObserver: (() => void) | null = null;

onMounted(() => {
	if (!target.value) return;
	const root = findScrollParent(target.value);
	const { stop } = useIntersectionObserver(
		target,
		(entries) => {
			const entry = entries[0];
			if (entry?.isIntersecting && !visible.value) {
				visible.value = true;
				stop();
			}
		},
		{ rootMargin: props.rootMargin, root },
	);
	stopObserver = stop;
});

onBeforeUnmount(() => stopObserver?.());
</script>

<template>
	<div ref="target" :style="!visible ? { minHeight } : undefined">
		<slot v-if="visible" />
	</div>
</template>
