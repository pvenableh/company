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
	editing?: boolean;
	first?: boolean;
	last?: boolean;
}>();

defineEmits<{ (e: 'hide'): void; (e: 'move-up'): void; (e: 'move-down'): void }>();

const spanClass = computed(() =>
	props.span === 3 ? 'lg:col-span-3' : props.span === 2 ? 'lg:col-span-2' : 'lg:col-span-1',
);
</script>

<template>
	<div :class="[spanClass, editing ? 'relative' : '']">
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
		     movable block, not something you click into. -->
		<div :class="editing ? 'pointer-events-none select-none rounded-2xl ring-1 ring-primary/30' : ''">
			<slot />
		</div>
	</div>
</template>
