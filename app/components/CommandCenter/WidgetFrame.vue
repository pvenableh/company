<!--
  WidgetFrame — wraps one reorderable command-center widget. Applies its grid
  span, and in edit mode overlays a toolbar (drag handle + up/down + hide). The
  drag handle carries `.dash-drag-handle`, which the parent's <VueDraggable
  handle=".dash-drag-handle"> targets so only the handle initiates a drag — the
  widget's own controls stay clickable in normal mode. In edit mode the content
  is pointer-events-none so arranging never fires a widget's navigation.
-->
<script setup lang="ts">
const props = defineProps<{
	widgetId: string;
	label: string;
	span?: 1 | 2 | 3;
	rowSpan?: 1 | 2;
	editing?: boolean;
	first?: boolean;
	last?: boolean;
	/** Cap height + scroll overflow so a long widget can't stretch its row. */
	scroll?: boolean;
}>();

defineEmits<{ (e: 'hide'): void; (e: 'move-up'): void; (e: 'move-down'): void; (e: 'cycle-span'): void; (e: 'cycle-row-span'): void }>();

const spanClass = computed(() =>
	props.span === 3 ? 'lg:col-span-3' : props.span === 2 ? 'lg:col-span-2' : 'lg:col-span-1',
);
// A 2-row anchor spans two grid rows so short single-column widgets stack beside
// it. Only applied on lg (the grid is single-column below that).
const rowSpanClass = computed(() => (props.rowSpan === 2 ? 'lg:row-span-2' : ''));

// NOTE on "sticky short widgets": a grid item's sticky containing block is the
// GRID, not its cell, so `position: sticky` bleeds a short widget past its row
// into the rows below (verified in-browser). Per-row sticky would need each row
// to be its own element, which is incompatible with this flat drag-reorder grid.
// So short widgets just align to the top of their row (self-start) and any extra
// row height is empty — no sticky.
const outerClass = computed(() =>
	[spanClass.value, rowSpanClass.value, props.editing ? 'relative' : '', 'self-start'].filter(Boolean).join(' '),
);

// Cap growth-prone widgets so rows stay even; disabled in edit mode so the whole
// block is draggable/visible while arranging.
const contentClass = computed(() => {
	const base = props.editing ? 'pointer-events-none select-none rounded-2xl ring-1 ring-primary/30' : '';
	const cap = props.scroll && !props.editing ? 'max-h-[30rem] overflow-y-auto hide-scrollbar rounded-2xl' : '';
	return [base, cap].filter(Boolean).join(' ');
});
</script>

<template>
	<div :class="outerClass">
		<!-- Edit toolbar -->
		<div
			v-if="editing"
			class="flex items-center gap-2 mb-1.5 px-2 py-1 rounded-lg bg-muted/60 border border-border/60"
		>
			<button
				type="button"
				class="dash-drag-handle flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
				:aria-label="`Drag ${label}`"
			>
				<EIcon name="i-heroicons-bars-3" class="w-4 h-4" />
			</button>
			<span class="text-[11px] font-semibold uppercase tracking-wide text-foreground/70 truncate">{{ label }}</span>
			<div class="ml-auto flex items-center gap-0.5">
				<!-- Width: cycle 1 → 2 → 3 columns (large screens). -->
				<button
					type="button"
					class="flex items-center gap-0.5 justify-center h-6 px-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/60"
					:title="`Width: ${span ?? 1} column${(span ?? 1) > 1 ? 's' : ''} — click to change`"
					aria-label="Change widget width"
					@click="$emit('cycle-span')"
				>
					<EIcon name="i-heroicons-view-columns" class="w-4 h-4" />
					<span class="text-[10px] font-semibold tabular-nums">{{ span ?? 1 }}</span>
				</button>
				<!-- Height: cycle 1 → 2 rows (large screens). A 2-row anchor lets two
				     short widgets stack beside it. -->
				<button
					type="button"
					class="flex items-center gap-0.5 justify-center h-6 px-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/60"
					:title="`Height: ${rowSpan ?? 1} row${(rowSpan ?? 1) > 1 ? 's' : ''} — click to change`"
					aria-label="Change widget height"
					@click="$emit('cycle-row-span')"
				>
					<EIcon name="i-heroicons-bars-3-bottom-left" class="w-4 h-4 rotate-90" />
					<span class="text-[10px] font-semibold tabular-nums">{{ rowSpan ?? 1 }}</span>
				</button>
				<button
					type="button"
					class="flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/60 disabled:opacity-30 disabled:hover:bg-transparent"
					:disabled="first"
					aria-label="Move up"
					@click="$emit('move-up')"
				>
					<EIcon name="i-heroicons-chevron-up" class="w-4 h-4" />
				</button>
				<button
					type="button"
					class="flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/60 disabled:opacity-30 disabled:hover:bg-transparent"
					:disabled="last"
					aria-label="Move down"
					@click="$emit('move-down')"
				>
					<EIcon name="i-heroicons-chevron-down" class="w-4 h-4" />
				</button>
				<button
					type="button"
					class="flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-destructive hover:bg-background/60"
					aria-label="Hide widget"
					@click="$emit('hide')"
				>
					<EIcon name="i-heroicons-eye-slash" class="w-4 h-4" />
				</button>
			</div>
		</div>

		<!-- Widget content. In edit mode it's inert + ringed so it reads as a
		     movable block, not something you click into. Growth-prone widgets get
		     a height cap + internal scroll so rows stay even. -->
		<div :class="contentClass">
			<slot />
		</div>
	</div>
</template>
