<template>
	<Teleport to="body">
		<!-- Backdrop -->
		<Transition name="sheet-backdrop">
			<div v-if="modelValue" class="action-sheet-backdrop" @click="cancel" />
		</Transition>

		<!-- Action Sheet -->
		<Transition name="action-sheet">
			<div v-if="modelValue" class="action-sheet" @touchstart="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd" :style="dragStyle">
				<!-- Main group -->
				<div class="action-sheet-group">
					<div v-if="title || subtitle" class="action-sheet-header">
						<div v-if="title" class="action-sheet-title">{{ title }}</div>
						<div v-if="subtitle" class="action-sheet-subtitle">{{ subtitle }}</div>
					</div>
					<button
						v-for="action in actions"
						:key="action.label"
						class="action-sheet-button"
						:class="{ destructive: action.destructive, bold: action.bold }"
						@click="handleAction(action)"
					>
						<UIcon v-if="action.icon" :name="action.icon" class="w-5 h-5 mr-2" />
						{{ action.label }}
					</button>
				</div>

				<!-- Cancel group -->
				<div class="action-sheet-group action-sheet-cancel">
					<button class="action-sheet-button bold" @click="cancel">
						Cancel
					</button>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<script setup lang="ts">
interface Action {
	label: string;
	icon?: string;
	destructive?: boolean;
	bold?: boolean;
	handler?: () => void;
}

const props = defineProps<{
	modelValue: boolean;
	title?: string;
	subtitle?: string;
	actions: Action[];
}>();

const emit = defineEmits<{
	'update:modelValue': [value: boolean];
}>();

const { triggerHaptic } = useHaptic();

const dragOffset = ref(0);
let startY = 0;

const dragStyle = computed(() =>
	dragOffset.value > 0 ? { transform: `translateY(${dragOffset.value}px)` } : undefined,
);

function cancel() {
	triggerHaptic('light');
	emit('update:modelValue', false);
	dragOffset.value = 0;
}

function handleAction(action: Action) {
	triggerHaptic('medium');
	action.handler?.();
	emit('update:modelValue', false);
}

function onTouchStart(e: TouchEvent) {
	startY = e.touches[0].clientY;
}

function onTouchMove(e: TouchEvent) {
	const diff = e.touches[0].clientY - startY;
	if (diff > 0) dragOffset.value = diff;
}

function onTouchEnd() {
	if (dragOffset.value > 80) {
		cancel();
	} else {
		dragOffset.value = 0;
	}
}
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.action-sheet-backdrop {
	position: fixed;
	inset: 0;
	z-index: 9998;
	background: rgba(0, 0, 0, 0.4);
	-webkit-tap-highlight-color: transparent;
}

.action-sheet {
	position: fixed;
	bottom: 0;
	left: 0;
	right: 0;
	z-index: 9999;
	padding: 0 8px calc(8px + env(safe-area-inset-bottom, 0px));
	transition: transform 0.15s ease;
}

.action-sheet-group {
	background: hsl(var(--card) / 0.95);
	backdrop-filter: saturate(180%) blur(20px);
	-webkit-backdrop-filter: saturate(180%) blur(20px);
	border-radius: 14px;
	overflow: hidden;
}

.action-sheet-cancel {
	margin-top: 8px;
}

.action-sheet-header {
	padding: 14px 16px;
	text-align: center;
	border-bottom: 0.5px solid hsl(var(--border) / 0.4);
}

.action-sheet-title {
	font-size: 13px;
	font-weight: 600;
	color: hsl(var(--muted-foreground));
}

.action-sheet-subtitle {
	font-size: 13px;
	color: hsl(var(--muted-foreground));
	margin-top: 2px;
}

.action-sheet-button {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 100%;
	min-height: 57px;
	padding: 0 16px;
	font-size: 20px;
	color: hsl(var(--primary));
	background: none;
	border: none;
	cursor: pointer;
	transition: background 0.12s ease;
	-webkit-tap-highlight-color: transparent;
}

.action-sheet-button + .action-sheet-button {
	border-top: 0.5px solid hsl(var(--border) / 0.4);
}

.action-sheet-button:active {
	background: hsl(var(--muted) / 0.5);
}

.action-sheet-button.destructive {
	color: hsl(var(--destructive));
}

.action-sheet-button.bold {
	font-weight: 600;
}

/* Transitions */
.sheet-backdrop-enter-active,
.sheet-backdrop-leave-active {
	transition: opacity 0.3s ease;
}
.sheet-backdrop-enter-from,
.sheet-backdrop-leave-to {
	opacity: 0;
}

.action-sheet-enter-active {
	transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.action-sheet-leave-active {
	transition: transform 0.25s cubic-bezier(0.4, 0, 1, 1);
}
.action-sheet-enter-from,
.action-sheet-leave-to {
	transform: translateY(100%) !important;
}
</style>
