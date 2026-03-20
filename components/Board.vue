<script setup>
import { VueDraggable } from 'vuedraggable';

const props = defineProps({
	collection: {
		type: String,
		required: true,
	},
	columns: {
		type: Array,
		required: true,
		// Expected format: [{ id: 'todo', name: 'To Do', color: 'gray' }, ...]
	},
	fields: {
		type: Array,
		default: () => ['*'],
	},
	filter: {
		type: Object,
		default: () => ({}),
	},
	cardComponent: {
		type: String,
		default: null,
	},
});

const collectionItems = useDirectusItems(props.collection);

// Setup realtime subscription
const sort = ['-date_updated'];

const { data: items } = useRealtimeSubscription(props.collection, props.fields, props.filter, sort);

// Group items by their status/column
const groupedItems = computed(() => {
	const grouped = {};
	props.columns.forEach((column) => {
		grouped[column.id] = items.value?.filter((item) => item.status === column.id) || [];
	});
	return grouped;
});

// Default card component
const DefaultCard = defineComponent({
	props: ['element'],
	template: `
    <div class="p-3 mb-2 bg-white dark:bg-gray-700 rounded-lg shadow cursor-move hover:shadow-md transition-shadow duration-200">
      <h4 class="font-medium text-sm mb-1">{{ element.title }}</h4>
      <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{{ new Date(element.date_created).toLocaleDateString() }}</span>
        <UBadge
          v-if="element.priority"
          :color="element.priority === 'high' ? 'red' : element.priority === 'medium' ? 'yellow' : 'gray'"
          size="xs"
        >
          {{ element.priority }}
        </UBadge>
      </div>
    </div>
  `,
});

// Dynamic component resolution with error handling
const resolveCardComponent = computed(() => {
	if (!props.cardComponent) {
		// Generate default component name from collection
		const componentName =
			props.collection
				.split('_')
				.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
				.join('') + 'Card';

		try {
			// Try to load the component based on naming convention
			return markRaw(
				defineAsyncComponent({
					loader: () => import(`~/components/cards/${componentName}.vue`).catch(() => DefaultCard),
					errorComponent: DefaultCard,
					timeout: 2000,
				}),
			);
		} catch {
			console.warn(`Could not load ${componentName}, using default card`);
			return DefaultCard;
		}
	}

	try {
		// Try to load the explicitly specified component
		return markRaw(
			defineAsyncComponent({
				loader: () => import(`~/components/cards/${props.cardComponent}.vue`).catch(() => DefaultCard),
				errorComponent: DefaultCard,
				timeout: 2000,
			}),
		);
	} catch {
		console.warn(`Could not load ${props.cardComponent}, using default card`);
		return DefaultCard;
	}
});

// Handle the drop between columns
const onMove = async (event) => {
	const fromColumn = event.from.getAttribute('data-column');
	const toColumn = event.to.getAttribute('data-column');
	const itemId = event.draggedContext.element.id;

	if (fromColumn !== toColumn) {
		try {
			await collectionItems.update(itemId, {
				status: toColumn,
				date_updated: new Date(),
			});
		} catch (error) {
			console.error('Error updating item:', error);
		}
	}
};

const onEnd = (event) => {
	// ... existing onEnd logic ...
};
</script>

<template>
	<div class="flex gap-4 overflow-x-auto p-4 min-h-[calc(100vh-200px)]">
		<div v-for="column in columns" :key="column.id" class="flex-shrink-0 w-72">
			<!-- Column Header -->
			<div class="board-col-header">
				<div class="flex items-center gap-3">
					<div class="board-col-accent" :style="{ backgroundColor: `var(--${column.color}, ${column.color})` }" />
					<h3 class="board-col-title">{{ column.name }}</h3>
					<span
						class="board-col-count"
						:style="{ backgroundColor: `var(--${column.color}, ${column.color})`, color: 'var(--darkBlue)' }"
					>
						{{ groupedItems[column.id].length }}
					</span>
				</div>
			</div>

			<!-- Draggable Container -->
			<VueDraggable
				:list="groupedItems[column.id]"
				:group="{ name: 'tasks' }"
				:data-column="column.id"
				item-key="id"
				class="min-h-[200px] p-2 rounded-b-lg bg-gray-50 dark:bg-gray-800"
				ghost-class="opacity-50"
				@move="onMove"
				@end="onEnd"
			>
				<template #item="{ element }">
					<div :id="element.id">
						<component :is="resolveCardComponent" :element="element" />
						<!-- @error="(err) => console.error('Card error:', err)" -->
					</div>
				</template>
			</VueDraggable>
		</div>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.board-col-header {
	@apply relative py-4 px-4 border-b border-border sticky top-0 z-10;
	background: rgba(255, 255, 255, 0.78);
	backdrop-filter: saturate(180%) blur(20px);
	-webkit-backdrop-filter: saturate(180%) blur(20px);
}
:is(.dark) .board-col-header {
	background: rgba(20, 20, 20, 0.78);
}
.board-col-accent {
	@apply w-1 h-5 rounded-full flex-shrink-0;
}
.board-col-title {
	@apply text-xs font-semibold uppercase tracking-wider text-foreground flex-1;
}
.board-col-count {
	@apply text-[10px] font-bold tabular-nums min-w-[20px] h-5 flex items-center justify-center rounded-full px-1.5;
}

.draggable-ghost {
	@apply opacity-50 border-2 border-dashed border-gray-400;
}
</style>
