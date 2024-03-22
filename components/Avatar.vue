<script setup>
import { avatarSource } from '~~/composables/useAvatar';

const props = defineProps({
	user: {
		type: Object,
		default: null,
	},
	chip: {
		type: Boolean,
		default: false,
	},
	text: {
		type: String,
		default: '',
	},
	size: {
		type: String,
		default: 'sm',
	},
});

watch(avatarSource.value, (currentValue, oldValue) => {
	return currentValue;
});
</script>
<template>
	<UAvatar
		v-if="chip"
		chip-color="sky"
		:chip-text="text"
		chip-position="top-right"
		:size="size"
		:src="avatarSource"
		:alt="user?.first_name + ' ' + user?.last_name"
	/>
	<UAvatar v-else :size="size" :src="avatarSource" :alt="user?.first_name + ' ' + user?.last_name" />
</template>

<style></style>
