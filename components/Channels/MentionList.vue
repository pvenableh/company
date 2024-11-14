<script setup>
const props = defineProps({
	items: {
		type: Array,
		required: true,
	},
	command: {
		type: Function,
		required: true,
	},
});

const selectedIndex = ref(0);

watch(
	() => props.items,
	() => {
		selectedIndex.value = 0;
	},
);

const selectItem = (index) => {
	const item = props.items[index];
	if (item) {
		props.command({
			id: item.id,
			label: `${item.first_name} ${item.last_name}`,
		});
	}
};

const onKeyDown = ({ event }) => {
	if (event.key === 'ArrowUp') {
		selectedIndex.value = (selectedIndex.value + props.items.length - 1) % props.items.length;
		return true;
	}

	if (event.key === 'ArrowDown') {
		selectedIndex.value = (selectedIndex.value + 1) % props.items.length;
		return true;
	}

	if (event.key === 'Enter') {
		selectItem(selectedIndex.value);
		return true;
	}

	return false;
};

defineExpose({
	onKeyDown,
});
</script>

<template>
	<div class="mentions-list">
		<button
			v-for="(item, index) in items"
			:key="item.id"
			class="mention-item"
			:class="{ 'is-selected': index === selectedIndex }"
			@click="selectItem(index)"
		>
			<UAvatar
				:src="item.avatar ? `/assets/${item.avatar}` : undefined"
				:alt="`${item.first_name} ${item.last_name}`"
				size="xs"
				class="mr-2"
			/>
			<span class="text-sm">{{ item.first_name }} {{ item.last_name }}</span>
		</button>
	</div>
</template>

<style>
.mentions-list {
	@apply w-full min-w-[200px];
}

.mention-item {
	@apply w-full px-3 py-2 text-left flex items-center hover:bg-gray-100 dark:hover:bg-gray-700;
}

.mention-item.is-selected {
	@apply bg-gray-100 dark:bg-gray-700;
}

.dark .mention-item {
	@apply text-gray-200;
}

.dark .mention-item:hover,
.dark .mention-item.is-selected {
	@apply bg-gray-700;
}
</style>
