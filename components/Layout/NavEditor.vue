<template>
	<Transition name="sheet-backdrop">
		<div
			v-if="isOpen"
			class="nav-editor-backdrop"
			@click="close"
		/>
	</Transition>

	<Transition name="sheet">
		<div
			v-if="isOpen"
			ref="sheetRef"
			class="nav-editor-sheet"
			@touchstart="onTouchStart"
			@touchmove="onTouchMove"
			@touchend="onTouchEnd"
			:style="{ transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined }"
		>
			<!-- Drag handle -->
			<div class="sheet-handle-area">
				<div class="sheet-handle" />
			</div>

			<!-- Header -->
			<div class="nav-editor-header">
				<button class="nav-editor-reset" @click="handleReset">Reset</button>
				<span class="nav-editor-title">Edit Apps</span>
				<button class="nav-editor-done" @click="close">Done</button>
			</div>

			<!-- Draggable list -->
			<div class="nav-editor-list">
				<VueDraggable
					v-model="localOrder"
					item-key="to"
					handle=".drag-handle"
					:animation="200"
					ghost-class="nav-item-ghost"
					drag-class="nav-item-drag"
					@end="onDragEnd"
				>
					<template #item="{ element }">
						<div
							class="nav-editor-item"
							:class="{ 'nav-item-hidden': !isVisible(element.to), 'nav-item-jiggle': true }"
						>
							<!-- Drag handle -->
							<div class="drag-handle">
								<UIcon name="i-heroicons-bars-3" class="w-4 h-4 text-muted-foreground" />
							</div>

							<!-- Icon + name -->
							<UIcon :name="element.icon" class="w-5 h-5 shrink-0" />
							<span class="flex-1 text-[15px]">{{ element.name }}</span>

							<!-- Toggle -->
							<button
								class="nav-toggle-btn"
								:class="isVisible(element.to) ? 'nav-toggle-on' : 'nav-toggle-off'"
								@click="handleToggle(element.to)"
							>
								<span class="nav-toggle-knob" />
							</button>
						</div>
					</template>
				</VueDraggable>
			</div>
		</div>
	</Transition>
</template>

<script setup>
import VueDraggable from 'vuedraggable';

const { allLinks, toggle, reorder, resetToDefault, isVisible } = useNavPreferences();
const { triggerHaptic } = useHaptic();

const props = defineProps({
	isOpen: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);

const sheetRef = ref(null);
const dragOffset = ref(0);
let startY = 0;
let isDragging = false;

// Local mutable copy of ordered links for vuedraggable
const localOrder = ref([]);

watch(() => props.isOpen, (open) => {
	if (open) {
		localOrder.value = [...allLinks.value];
	}
});

function close() {
	emit('close');
	dragOffset.value = 0;
}

function handleToggle(route) {
	triggerHaptic(10);
	toggle(route);
}

function onDragEnd() {
	triggerHaptic(10);
	reorder(localOrder.value.map((l) => l.to));
}

function handleReset() {
	triggerHaptic(10);
	resetToDefault();
	localOrder.value = [...allLinks.value];
}

function onTouchStart(e) {
	startY = e.touches[0].clientY;
	isDragging = true;
}

function onTouchMove(e) {
	if (!isDragging) return;
	const diff = e.touches[0].clientY - startY;
	if (diff > 0) {
		dragOffset.value = diff;
	}
}

function onTouchEnd() {
	isDragging = false;
	if (dragOffset.value > 120) {
		triggerHaptic(10);
		close();
	} else {
		dragOffset.value = 0;
	}
}
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

/* Backdrop */
.nav-editor-backdrop {
	position: fixed;
	inset: 0;
	z-index: 52;
	background: rgba(0, 0, 0, 0.3);
	-webkit-tap-highlight-color: transparent;
}

.sheet-backdrop-enter-active,
.sheet-backdrop-leave-active {
	transition: opacity 0.3s ease;
}
.sheet-backdrop-enter-from,
.sheet-backdrop-leave-to {
	opacity: 0;
}

/* Sheet */
.nav-editor-sheet {
	position: fixed;
	bottom: 0;
	left: 0;
	right: 0;
	z-index: 53;
	max-height: 85vh;
	border-radius: 14px 14px 0 0;
	padding-bottom: env(safe-area-inset-bottom, 0px);
	overflow-y: auto;
	overscroll-behavior: contain;
	-webkit-overflow-scrolling: touch;
	transition: transform 0.15s ease;
	background: hsl(var(--card));
}

.sheet-enter-active {
	transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.sheet-leave-active {
	transition: transform 0.3s cubic-bezier(0.4, 0, 1, 1);
}
.sheet-enter-from,
.sheet-leave-to {
	transform: translateY(100%) !important;
}

/* Drag handle */
.sheet-handle-area {
	display: flex;
	justify-content: center;
	padding: 10px 0 6px;
	cursor: grab;
}

.sheet-handle {
	width: 36px;
	height: 5px;
	border-radius: 3px;
	background: hsl(var(--muted-foreground) / 0.3);
}

/* Header bar */
.nav-editor-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 4px 16px 12px;
}

.nav-editor-title {
	font-size: 17px;
	font-weight: 600;
	color: hsl(var(--foreground));
}

.nav-editor-done {
	font-size: 15px;
	font-weight: 600;
	color: hsl(var(--primary));
	background: none;
	border: none;
	cursor: pointer;
	padding: 4px 8px;
	-webkit-tap-highlight-color: transparent;
}

.nav-editor-reset {
	font-size: 15px;
	font-weight: 400;
	color: hsl(var(--muted-foreground));
	background: none;
	border: none;
	cursor: pointer;
	padding: 4px 8px;
	-webkit-tap-highlight-color: transparent;
}

/* List */
.nav-editor-list {
	padding: 0 16px 16px;
}

/* Item row */
.nav-editor-item {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px;
	margin-bottom: 1px;
	border-radius: 12px;
	background: hsl(var(--background));
	color: hsl(var(--foreground));
	transition: opacity 0.2s ease, background 0.15s ease;
	-webkit-tap-highlight-color: transparent;
}

.nav-editor-item + .nav-editor-item {
	margin-top: 4px;
}

.nav-item-hidden {
	opacity: 0.4;
}

.nav-item-ghost {
	opacity: 0.3;
}

.nav-item-drag {
	background: hsl(var(--card));
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
	border-radius: 12px;
}

/* Drag handle */
.drag-handle {
	cursor: grab;
	padding: 4px;
	touch-action: none;
}

.drag-handle:active {
	cursor: grabbing;
}

/* iOS-style toggle */
.nav-toggle-btn {
	position: relative;
	width: 46px;
	height: 28px;
	border-radius: 14px;
	border: none;
	cursor: pointer;
	transition: background 0.25s ease;
	-webkit-tap-highlight-color: transparent;
	flex-shrink: 0;
}

.nav-toggle-on {
	background: hsl(var(--primary));
}

.nav-toggle-off {
	background: hsl(var(--muted-foreground) / 0.25);
}

.nav-toggle-knob {
	position: absolute;
	top: 2px;
	width: 24px;
	height: 24px;
	border-radius: 12px;
	background: white;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.nav-toggle-on .nav-toggle-knob {
	transform: translateX(20px);
}

.nav-toggle-off .nav-toggle-knob {
	transform: translateX(2px);
}

/* iOS jiggle animation */
@keyframes jiggle {
	0% { transform: rotate(0deg); }
	25% { transform: rotate(-0.7deg); }
	50% { transform: rotate(0deg); }
	75% { transform: rotate(0.7deg); }
	100% { transform: rotate(0deg); }
}

.nav-item-jiggle {
	animation: jiggle 0.3s ease-in-out infinite;
}

.nav-item-jiggle:nth-child(even) {
	animation-delay: 0.15s;
}

.nav-item-jiggle:nth-child(3n) {
	animation-duration: 0.35s;
}
</style>
