<template>
	<div
		ref="containerRef"
		class="ios-ptr-container"
		@touchstart.passive="onTouchStart"
		@touchmove.passive="onTouchMove"
		@touchend="onTouchEnd"
	>
		<!-- Pull indicator -->
		<div class="ios-ptr-indicator" :style="indicatorStyle">
			<div class="ios-ptr-spinner" :class="{ spinning: isRefreshing }">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
					<path d="M21 12a9 9 0 1 1-6.219-8.56" />
				</svg>
			</div>
		</div>

		<!-- Content -->
		<div class="ios-ptr-content" :style="contentStyle">
			<slot />
		</div>
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{
	disabled?: boolean;
}>();

const emit = defineEmits<{
	refresh: [];
}>();

const { triggerHaptic } = useHaptic();

const containerRef = ref<HTMLElement | null>(null);
const pullDistance = ref(0);
const isRefreshing = ref(false);
const threshold = 60;

let startY = 0;
let isPulling = false;

function onTouchStart(e: TouchEvent) {
	if (props.disabled || isRefreshing.value) return;
	const scrollTop = containerRef.value?.scrollTop ?? window.scrollY;
	if (scrollTop > 5) return;

	startY = e.touches[0].clientY;
	isPulling = true;
}

function onTouchMove(e: TouchEvent) {
	if (!isPulling || isRefreshing.value) return;

	const diff = e.touches[0].clientY - startY;
	if (diff > 0) {
		// Rubber band resistance
		pullDistance.value = Math.min(diff * 0.4, 100);
	}
}

async function onTouchEnd() {
	if (!isPulling) return;
	isPulling = false;

	if (pullDistance.value >= threshold) {
		triggerHaptic('medium');
		isRefreshing.value = true;
		pullDistance.value = threshold;
		emit('refresh');

		// Auto-reset after 3s if parent doesn't call done
		setTimeout(() => {
			isRefreshing.value = false;
			pullDistance.value = 0;
		}, 3000);
	} else {
		pullDistance.value = 0;
	}
}

const indicatorStyle = computed(() => ({
	opacity: Math.min(pullDistance.value / threshold, 1),
	transform: `translateY(${pullDistance.value - 40}px) rotate(${pullDistance.value * 3}deg)`,
}));

const contentStyle = computed(() => ({
	transform: pullDistance.value > 0 ? `translateY(${pullDistance.value}px)` : undefined,
	transition: isPulling ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
}));

/** Call this from the parent when refresh is complete */
function done() {
	isRefreshing.value = false;
	pullDistance.value = 0;
}

defineExpose({ done });
</script>

<style scoped>
.ios-ptr-container {
	position: relative;
	overflow: visible;
}

.ios-ptr-indicator {
	position: absolute;
	top: 0;
	left: 50%;
	transform: translateX(-50%);
	width: 28px;
	height: 28px;
	z-index: 1;
	color: hsl(var(--muted-foreground));
	transition: opacity 0.2s ease, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.ios-ptr-spinner {
	width: 28px;
	height: 28px;
}

.ios-ptr-spinner svg {
	width: 100%;
	height: 100%;
}

.ios-ptr-spinner.spinning {
	animation: ios-spin 0.8s linear infinite;
}

@keyframes ios-spin {
	to {
		transform: rotate(360deg);
	}
}

.ios-ptr-content {
	will-change: transform;
}
</style>
