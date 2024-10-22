<script setup>
const config = useRuntimeConfig();
const { user } = useDirectusAuth();

const props = defineProps({
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
	avatar: {
		type: String,
		default: null,
	},
});

watch(
	user,
	(newValue, oldValue) => {
		// console.log(oldValue);
		// console.log('User changed', newValue);
		if (props.avatar) {
			// console.log(props.avatar);
			avatarSource.value = `${config.public.assetsUrl}${props.avatar}?key=medium`;
		} else {
			if (newValue) {
				if (newValue.avatar) {
					avatarSource.value = `${config.public.assetsUrl}${newValue.avatar}?key=medium`;
				} else {
					// Using template literals for clarity and to handle possible undefined values gracefully
					avatarSource.value = `https://ui-avatars.com/api/?name=${encodeURIComponent(newValue.first_name + ' ' + newValue.last_name)}&background=eeeeee&color=00bfff`;
				}
			} else {
				avatarSource.value = 'https://ui-avatars.com/api/?name=Unknown%20User&background=eeeeee&color=00bfff';
			}
		}
	},
	{
		immediate: true, // This ensures the watcher runs immediately with the initial value
	},
);
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
