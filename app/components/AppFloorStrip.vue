<script setup lang="ts" generic="K extends string">
/**
 * AppFloorStrip — shared per-app sub-navigation.
 *
 * The "floors" of an app (Gantt / Projects / Tasks / Tickets ... in Work,
 * Cash flow / Invoices / ... in Money) all rendered as a pill-segmented
 * control. Picks up `--app-accent-h/s/l` from an ancestor (the apps shell
 * sets these from `useAppAccent`) so the active pill matches the rail.
 *
 * Sticky-positioned by default so the strip stays reachable while users
 * scroll long floors. Hosts can pass `:sticky="false"` to opt out.
 */

interface FloorItem<TKey extends string> {
	key: TKey;
	label: string;
	icon: string;
}

const props = withDefaults(
	defineProps<{
		modelValue: K;
		items: FloorItem<K>[];
		sticky?: boolean;
		ariaLabel?: string;
	}>(),
	{
		sticky: true,
		ariaLabel: 'Sections',
	},
);

defineEmits<{
	(e: 'update:modelValue', value: K): void;
}>();
</script>

<template>
	<div
		class="app-floor-strip"
		:class="{ 'app-floor-strip--sticky': sticky }"
		role="tablist"
		:aria-label="ariaLabel"
	>
		<div class="app-floor-strip__scroller">
			<button
				v-for="seg in items"
				:key="seg.key"
				type="button"
				role="tab"
				:aria-selected="modelValue === seg.key"
				class="app-floor-strip__item"
				:class="{ 'app-floor-strip__item--active': modelValue === seg.key }"
				@click="$emit('update:modelValue', seg.key)"
			>
				<Icon :name="seg.icon" class="app-floor-strip__icon" />
				<span class="app-floor-strip__label">{{ seg.label }}</span>
			</button>
		</div>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.app-floor-strip {
	@apply -mx-1 mb-5 flex;
	/* Local fallback so a stray instance outside the apps shell still renders. */
	--accent-h: var(--app-accent-h, 220);
	--accent-s: var(--app-accent-s, 10%);
	--accent-l: var(--app-accent-l, 48%);
}

.app-floor-strip--sticky {
	@apply sticky top-0 z-20 -mt-1 pt-1 pb-1 px-1
		bg-gradient-to-b from-background via-background to-background/80
		backdrop-blur-sm;
}

.app-floor-strip__scroller {
	@apply inline-flex items-center gap-1 rounded-full
		border border-border bg-card p-0.5
		overflow-x-auto max-w-full;
	scrollbar-width: none;
}

.app-floor-strip__scroller::-webkit-scrollbar {
	display: none;
}

.app-floor-strip__item {
	@apply inline-flex items-center gap-1.5 rounded-full
		px-3 py-1 text-xs font-medium whitespace-nowrap
		text-muted-foreground transition-all duration-200
		ease-[cubic-bezier(0.16,1,0.3,1)];
}

.app-floor-strip__item:hover {
	@apply text-foreground;
	background: hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.08);
}

.app-floor-strip__icon {
	@apply size-3.5 shrink-0;
	stroke-width: 1.85;
}

.app-floor-strip__label {
	@apply leading-none;
}

/* Active pill — accent gradient + tiny shadow + white icon/label. */
.app-floor-strip__item--active {
	color: white;
	background: linear-gradient(
		135deg,
		hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 8%)),
		hsl(var(--accent-h) var(--accent-s) var(--accent-l))
	);
	box-shadow:
		0 1px 0 0 hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 14%) / 0.5) inset,
		0 4px 10px -6px hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.55);
}

.app-floor-strip__item--active:hover {
	color: white;
}
</style>
