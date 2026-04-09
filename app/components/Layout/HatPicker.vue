<template>
	<div class="relative" ref="wrapper">
		<!-- Trigger -->
		<button
			class="hat-trigger"
			@click="open = !open"
			:title="`${activeHat.name} mode`"
		>
			<UIcon :name="activeHat.icon" class="w-5 h-5 flex-shrink-0" />
			<span v-if="!collapsed" class="hat-label">{{ activeHat.name }}</span>
			<UIcon v-if="!collapsed" name="i-heroicons-chevron-up-down" class="w-3 h-3 text-muted-foreground/50" />
		</button>

		<!-- Popover -->
		<Transition name="hat-pop">
			<div v-if="open" class="hat-popover">
				<div class="hat-popover-header">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Switch Mode</span>
				</div>
				<div class="hat-list">
					<button
						v-for="hat in hats"
						:key="hat.id"
						class="hat-option"
						:class="{ 'hat-option--active': hat.id === activeHat.id }"
						@click="selectHat(hat.id)"
					>
						<UIcon :name="hat.icon" class="w-5 h-5 flex-shrink-0" />
						<div class="flex-1 min-w-0">
							<div class="text-[13px] font-medium">{{ hat.name }}</div>
							<div class="text-[11px] text-muted-foreground truncate">{{ hat.description }}</div>
						</div>
						<UIcon
							v-if="hat.id === activeHat.id"
							name="i-heroicons-check"
							class="w-4 h-4 text-primary flex-shrink-0"
						/>
					</button>
				</div>
			</div>
		</Transition>
	</div>
</template>

<script setup lang="ts">
defineProps<{ collapsed?: boolean }>();

const { hats, activeHat, setHat } = useNavPreferences();
const open = ref(false);
const wrapper = ref<HTMLElement | null>(null);

const selectHat = (hatId: string) => {
	setHat(hatId);
	open.value = false;
};

// Close on outside click
if (import.meta.client) {
	const handler = (e: MouseEvent) => {
		if (wrapper.value && !wrapper.value.contains(e.target as Node)) {
			open.value = false;
		}
	};
	onMounted(() => document.addEventListener('click', handler));
	onBeforeUnmount(() => document.removeEventListener('click', handler));
}
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.hat-trigger {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 5px 10px;
	border-radius: 10px;
	cursor: pointer;
	transition: background 0.15s ease;
	width: 100%;
}
.hat-trigger:hover {
	background: hsl(var(--muted) / 0.4);
}

.hat-label {
	font-size: 12px;
	font-weight: 500;
	color: hsl(var(--muted-foreground));
	flex: 1;
}

.hat-popover {
	position: absolute;
	left: 0;
	right: 0;
	bottom: calc(100% + 6px);
	background: hsl(var(--card));
	border: 1px solid hsl(var(--border) / 0.5);
	border-radius: 14px;
	box-shadow: 0 12px 40px -8px rgba(0, 0, 0, 0.2);
	z-index: 50;
	overflow: hidden;
	min-width: 220px;
}

.hat-popover-header {
	padding: 10px 14px 6px;
}

.hat-list {
	padding: 4px 6px 6px;
	max-height: 340px;
	overflow-y: auto;
}

.hat-option {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 100%;
	padding: 7px 8px;
	border-radius: 10px;
	text-align: left;
	cursor: pointer;
	transition: background 0.1s ease;
}
.hat-option:hover {
	background: hsl(var(--muted) / 0.4);
}
.hat-option--active {
	background: hsl(var(--primary) / 0.08);
}

/* Transition */
.hat-pop-enter-active { transition: all 0.15s ease; }
.hat-pop-leave-active { transition: all 0.1s ease; }
.hat-pop-enter-from,
.hat-pop-leave-to {
	opacity: 0;
	transform: translateY(4px) scale(0.97);
}
</style>
