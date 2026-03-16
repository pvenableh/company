<script setup lang="ts">
/**
 * VirtualList — Renders only visible items from a large list.
 *
 * Uses @tanstack/vue-virtual under the hood.
 * Wraps the virtualizer in a scrollable container and exposes a scoped slot
 * for each item.
 *
 * Usage:
 *   <VirtualList :items="myItems" :estimate-size="48" class="h-[600px]">
 *     <template #item="{ item, index }">
 *       <MyRow :data="item" />
 *     </template>
 *   </VirtualList>
 */
import { useVirtualizer } from '@tanstack/vue-virtual';

const props = withDefaults(
	defineProps<{
		items: any[];
		estimateSize?: number;
		overscan?: number;
	}>(),
	{
		estimateSize: 52,
		overscan: 5,
	},
);

const parentRef = ref<HTMLElement | null>(null);

const virtualizer = useVirtualizer(
	computed(() => ({
		count: props.items.length,
		getScrollElement: () => parentRef.value,
		estimateSize: () => props.estimateSize,
		overscan: props.overscan,
	})),
);

const virtualRows = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());
</script>

<template>
	<div ref="parentRef" class="overflow-auto" :class="$attrs.class" :style="$attrs.style">
		<div
			class="relative w-full"
			:style="{ height: `${totalSize}px` }"
		>
			<div
				v-for="virtualRow in virtualRows"
				:key="virtualRow.key"
				class="absolute top-0 left-0 w-full"
				:style="{
					height: `${virtualRow.size}px`,
					transform: `translateY(${virtualRow.start}px)`,
				}"
			>
				<slot name="item" :item="items[virtualRow.index]" :index="virtualRow.index" />
			</div>
		</div>
	</div>
</template>
