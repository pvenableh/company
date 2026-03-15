<script setup>
import updateAvatarSource from '~~/composables/useAvatar';
import { Toaster } from 'vue-sonner';
import 'vue-sonner/style.css';

const { user } = useDirectusAuth();
const runtimeConfig = useRuntimeConfig();

// Initialize universal theme system
const { initTheme } = useTheme();
onMounted(() => {
	initTheme();
});

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
		name: 'Command Center',
		type: ['header', 'footer', 'toolbar', 'drawer'],
		to: '/',
		icon: 'i-heroicons-sparkles',
	},
	{
		name: 'Statistics',
		type: ['footer', 'drawer'],
		to: '/dashboard',
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
	{
		name: 'Time Tracker',
		type: ['header', 'footer', 'drawer'],
		to: '/time-tracker',
		icon: 'i-heroicons-clock',
	},
	{
		name: 'Social',
		type: ['header', 'footer', 'drawer'],
		to: '/social/dashboard',
		icon: 'i-heroicons-share',
	},
	{
		name: 'Email',
		type: ['header', 'footer', 'drawer'],
		to: '/email',
		icon: 'i-heroicons-envelope',
	},
	{
		name: 'Financials',
		type: ['footer', 'toolbar', 'drawer'],
		to: '/financials',
		icon: 'i-heroicons-banknotes',
	},
	{
		name: 'Contacts',
		type: ['footer', 'drawer'],
		to: '/contacts',
		icon: 'i-heroicons-user-group',
	},
	{
		name: 'Clients',
		type: ['footer', 'drawer'],
		to: '/clients',
		icon: 'i-heroicons-building-office-2',
	},
	{
		name: 'Teams',
		type: ['header', 'footer', 'drawer'],
		to: '/organization/teams',
		icon: 'i-heroicons-user-group',
	},
	{
		name: 'Files',
		type: ['header', 'footer', 'drawer'],
		to: '/files',
		icon: 'i-heroicons-folder',
	},
]);
</script>
<template>
	<NuxtLayout :links="links">
		<NuxtPage />
	</NuxtLayout>
	<NuxtLoadingIndicator
		color="repeating-linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--muted-foreground)) 100%)"
	/>
	<Toaster
		position="top-center"
		:toast-options="{
			classNames: {
				toast: 'group toast bg-card text-foreground border-border/50 shadow-xl rounded-2xl backdrop-blur-xl',
				title: 'text-foreground font-medium',
				description: 'text-muted-foreground text-sm',
				actionButton: 'bg-primary text-primary-foreground rounded-lg',
				cancelButton: 'bg-muted text-muted-foreground rounded-lg',
				closeButton: 'bg-card text-foreground border-border',
				success: 'border-green-500/30',
				error: 'border-red-500/30',
				warning: 'border-yellow-500/30',
				info: 'border-blue-500/30',
			},
		}"
		rich-colors
		close-button
		:offset="'env(safe-area-inset-top, 8px)'"
	/>
</template>

<style>
/* iOS-style toast positioning */
.sonner-toaster {
	padding-top: env(safe-area-inset-top, 0px) !important;
}
</style>
