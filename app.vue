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

const { visibleLinks } = useNavPreferences();
</script>
<template>
	<NuxtLayout :links="visibleLinks">
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
