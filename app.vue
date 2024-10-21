<script setup>
import updateAvatarSource from '~~/composables/useAvatar';

const { user } = useDirectusAuth();
const runtimeConfig = useRuntimeConfig();

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
		name: 'Home',
		type: ['header', 'footer', 'toolbar', 'drawer'],
		to: '/',
		icon: 'i-heroicons-home-modern',
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
		type: ['header', 'footer', 'toolbar', 'drawer'],
		to: '/channels',
		icon: 'i-heroicons-square-3-stack-3d',
	},
	{
		name: 'Invoices',
		type: ['header', 'footer', 'toolbar', 'drawer'],
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
<style>
.page-content {
	transition: all 0.25s var(--curve);

	.nuxt-page {
		min-height: calc(90vh - 100px);
		z-index: 5;
		position: relative;
	}
}

.screen-enter-from {
	opacity: 0;
}

.screen-enter-active,
.screen-leave-active {
	transition: all 0.35s var(--curve);
}

.screen-enter,
.screen-leave-to {
	opacity: 0;
}
</style>
