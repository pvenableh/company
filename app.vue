<script setup>
import updateAvatarSource from '~~/composables/useAvatar';
import { Toaster } from 'vue-sonner';

const { user } = useEnhancedAuth();
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
		name: 'Scheduler',
		type: ['header', 'footer', 'drawer'],
		to: '/scheduler',
		icon: 'i-heroicons-calendar-date-range',
	},
	{
		name: 'Channels',
		type: ['header', 'footer', 'drawer'],
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
	<Toaster
		position="top-right"
		:toast-options="{
			classNames: {
				toast: 'group toast bg-background text-foreground border-border shadow-lg',
				title: 'text-foreground',
				description: 'text-muted-foreground',
				actionButton: 'bg-primary text-primary-foreground',
				cancelButton: 'bg-muted text-muted-foreground',
				closeButton: 'bg-background text-foreground border-border',
				success: 'border-green-500/50 bg-green-50 dark:bg-green-900/20',
				error: 'border-red-500/50 bg-red-50 dark:bg-red-900/20',
				warning: 'border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/20',
				info: 'border-blue-500/50 bg-blue-50 dark:bg-blue-900/20',
			},
		}"
		rich-colors
		close-button
	/>
</template>
<style></style>
