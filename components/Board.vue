<script setup>
import { VueDraggable } from 'vuedraggable';
const { updateItem, deleteItems } = useDirectusItems();

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
			await useDirectus(
				updateItem(props.collection, itemId, {
					status: toColumn,
					date_updated: new Date(),
				}),
			);
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
			<div class="rounded-t-lg p-3 font-medium" :class="`bg-${column.color}-100 dark:bg-${column.color}-900`">
				<div class="flex items-center justify-between">
					<h3 class="text-sm font-semibold">{{ column.name }}</h3>
					<UBadge :color="column.color" class="ml-2">
						{{ groupedItems[column.id].length }}
					</UBadge>
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
.draggable-ghost {
	@apply opacity-50 border-2 border-dashed border-gray-400;
}
</style>
