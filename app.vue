<script setup>
import updateAvatarSource from '~~/composables/useAvatar';

const { user } = useDirectusAuth();
const runtimeConfig = useRuntimeConfig();

if (process.env.NODE_ENV === 'development') {
	console.log('Running in development mode');
	// Add any development-specific code here
} else {
	console.log('Not in development mode');
}

const avatar = computed(() => {
	if (user.value) {
		if (user.value.avatar) {
			return runtimeConfig.public.assetsUrl + user.value.avatar + '?key=medium';
		} else {
			return (
				'https://ui-avatars.com/api/?name=' +
				user.value?.first_name +
				' ' +
				user.value?.last_name +
				'&background=eeeeee&color=00bfff'
			);
		}
	}
});

updateAvatarSource(avatar.value);

const links = ref([
	{
		name: 'Dashboard',
		type: ['header', 'footer', 'toolbar', 'drawer'],
		to: '/',
		icon: 'i-heroicons-squares-2x2',
	},
	{
		name: 'Tickets',
		type: ['header', 'footer', 'toolbar', 'drawer'],
		to: '/tickets',
		icon: 'i-heroicons-queue-list',
	},
	{
		name: 'Projects',
		type: ['header', 'footer', 'toolbar', 'drawer'],
		to: '/projects',
		icon: 'i-heroicons-square-3-stack-3d',
	},
	{
		name: 'Channels',
		type: ['header', 'footer', 'drawer'],
		to: '/channels',
		icon: 'i-heroicons-square-3-stack-3d',
	},
	{
		name: 'Invoices',
		type: ['header', 'footer', 'drawer'],
		to: '/invoices',
		icon: 'i-heroicons-document-text',
	},
]);
</script>
<template>
	<NuxtLayout :links="links">
		<NuxtPage />
	</NuxtLayout>
	<NuxtLoadingIndicator
		color="repeating-linear-gradient(to right,#FF99DD
    0%,#94a3b8 100%)"
	/>
	<UNotifications />
</template>
<style></style>
