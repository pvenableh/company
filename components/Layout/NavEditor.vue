<template>
	<Transition name="sheet-backdrop">
		<div
			v-if="isOpen"
			class="editor-backdrop"
			@click="close"
		/>
	</Transition>

	<Transition name="sheet">
		<div
			v-if="isOpen"
			ref="sheetRef"
			class="editor-sheet"
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
			<div class="editor-header">
				<button class="editor-btn-reset" @click="handleReset">Reset</button>
				<span class="editor-title">Edit Apps</span>
				<button class="editor-btn-done" @click="close">Done</button>
			</div>

			<p class="editor-hint">Drag to reorder. Toggle to show or hide apps.</p>

			<!-- Grid editor -->
			<div class="editor-grid-wrap">
				<VueDraggable
					v-model="localOrder"
					item-key="to"
					:animation="250"
					ghost-class="grid-item-ghost"
					drag-class="grid-item-drag"
					class="editor-grid"
					@end="onDragEnd"
				>
					<template #item="{ element }">
						<div
							class="grid-item"
							:class="{ 'grid-item-hidden': !isVisible(element.to) || isGatedByRole(element) }"
						>
							<!-- Lock icon for role-gated apps -->
							<div
								v-if="isGatedByRole(element)"
								class="grid-toggle grid-toggle-off opacity-50 cursor-not-allowed"
								title="Restricted by your organization role"
							>
								<UIcon name="i-heroicons-lock-closed" class="w-3 h-3" />
							</div>
							<!-- Visibility toggle pill — top right corner -->
							<button
								v-else
								class="grid-toggle"
								:class="isVisible(element.to) ? 'grid-toggle-on' : 'grid-toggle-off'"
								@click.stop="handleToggle(element.to)"
							>
								<UIcon
									:name="isVisible(element.to) ? 'i-heroicons-check' : 'i-heroicons-minus'"
									class="w-3 h-3"
								/>
							</button>

							<!-- App icon tile -->
							<div
								:class="[element.color, { 'opacity-30': isGatedByRole(element) }]"
								class="grid-icon"
							>
								<UIcon :name="element.icon" class="w-6 h-6 text-white" />
							</div>

							<!-- Label -->
							<span class="grid-label">{{ element.name }}</span>
						</div>
					</template>
				</VueDraggable>
			</div>
		</div>
	</Transition>
</template>

<script setup>
import VueDraggable from 'vuedraggable';

const { allLinks, toggle, reorder, resetToDefault, isVisible, isGatedByRole } = useNavPreferences();
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
.editor-backdrop {
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
.editor-sheet {
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

/* Header */
.editor-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 4px 16px 4px;
}

.editor-title {
	font-size: 17px;
	font-weight: 600;
	color: hsl(var(--foreground));
}

.editor-btn-done {
	font-size: 15px;
	font-weight: 600;
	color: hsl(var(--primary));
	background: none;
	border: none;
	cursor: pointer;
	padding: 4px 8px;
	-webkit-tap-highlight-color: transparent;
}

.editor-btn-reset {
	font-size: 15px;
	font-weight: 400;
	color: hsl(var(--muted-foreground));
	background: none;
	border: none;
	cursor: pointer;
	padding: 4px 8px;
	-webkit-tap-highlight-color: transparent;
}

.editor-hint {
	font-size: 12px;
	color: hsl(var(--muted-foreground));
	text-align: center;
	padding: 0 16px 12px;
}

/* ── Grid editor ── */
.editor-grid-wrap {
	padding: 0 12px 16px;
}

.editor-grid {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 4px 0;
}

@media (min-width: 640px) {
	.editor-grid {
		grid-template-columns: repeat(5, 1fr);
	}
}

.grid-item {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;
	padding: 10px 4px 8px;
	border-radius: 16px;
	cursor: grab;
	transition: opacity 0.25s ease, transform 0.15s ease;
	-webkit-tap-highlight-color: transparent;
}

.grid-item:active {
	cursor: grabbing;
}

.grid-item-hidden {
	opacity: 0.35;
}

.grid-item-ghost {
	opacity: 0.2;
}

.grid-item-drag {
	opacity: 1;
	z-index: 10;
	transform: scale(1.08);
}

.grid-item-drag .grid-icon {
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

/* Toggle button — positioned top-right of icon */
.grid-toggle {
	position: absolute;
	top: 4px;
	right: calc(50% - 32px);
	width: 20px;
	height: 20px;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	border: none;
	cursor: pointer;
	z-index: 2;
	transition: background 0.2s ease, transform 0.15s ease;
	-webkit-tap-highlight-color: transparent;
}

.grid-toggle:active {
	transform: scale(0.85);
}

.grid-toggle-on {
	background: hsl(var(--primary));
	color: hsl(var(--primary-foreground));
}

.grid-toggle-off {
	background: hsl(var(--muted-foreground) / 0.35);
	color: white;
}

/* Icon tile */
.grid-icon {
	width: 52px;
	height: 52px;
	border-radius: 14px;
	display: flex;
	align-items: center;
	justify-content: center;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 0 0 0.5px rgba(0, 0, 0, 0.04);
	transition: box-shadow 0.2s ease;
}

/* Label */
.grid-label {
	font-size: 11px;
	font-weight: 500;
	color: hsl(var(--foreground) / 0.7);
	text-align: center;
	line-height: 1.2;
	max-width: 72px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>
