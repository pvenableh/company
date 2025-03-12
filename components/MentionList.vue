<template>
	<div
		v-if="props.items.length"
		class="bg-white dark:bg-gray-800 shadow rounded border dark:border-gray-700 overflow-hidden"
	>
		<div
			v-for="(item, index) in props.items"
			:key="item.id"
			:class="{ 'bg-gray-100 dark:bg-gray-700': index === selectedIndex }"
			@mousedown.prevent
			@mousemove="setSelectedIndex(index)"
			@click="selectItem(index)"
			class="p-2 flex items-center cursor-pointer"
		>
			<img
				v-if="item.avatar"
				:src="`${$config.public.directusUrl}/assets/${item.avatar}?key=small`"
				:alt="item.label"
				class="w-6 h-6 rounded-full mr-2 object-cover"
			/>
			<div v-else class="w-6 h-6 rounded-full mr-2 bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
				<span class="text-xs text-gray-600 dark:text-gray-300">{{ getInitials(item.label) }}</span>
			</div>
			<span class="text-sm">{{ item.label }}</span>
		</div>
	</div>
	<p v-else class="p-2 text-sm text-gray-500 dark:text-gray-400">No users found</p>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';

const props = defineProps({
	items: {
		type: Array,
		required: true,
	},
	command: {
		type: Function,
		required: true,
	},
	editor: {
		// Add editor as a prop
		type: Object,
		required: true,
	},
});
const selectedIndex = ref(0);
const $config = useRuntimeConfig();

const selectItem = (index) => {
	const item = props.items[index];
	if (item) {
		props.command({ id: item.id, label: item.label });
	}
};

const setSelectedIndex = (index) => {
	selectedIndex.value = index;
};

const onKeyDown = (props) => {
	if (props.event.key === 'ArrowUp') {
		upHandler();
		return true;
	}

	if (props.event.key === 'ArrowDown') {
		downHandler();
		return true;
	}

	if (props.event.key === 'Enter') {
		enterHandler();
		return true;
	}

	return false;
};

const upHandler = () => {
	selectedIndex.value = (selectedIndex.value + props.items.length - 1) % props.items.length;
};

const downHandler = () => {
	selectedIndex.value = (selectedIndex.value + 1) % props.items.length;
};

const enterHandler = () => {
	selectItem(selectedIndex.value);
};

const getInitials = (name) => {
	return name
		.split(' ')
		.map((part) => part.charAt(0).toUpperCase())
		.join('');
};

//Set focus to the editor when loaded
onMounted(() => {
	if (props.editor) {
		props.editor.commands.focus();
	}
});

defineExpose({
	onKeyDown,
});
</script>
