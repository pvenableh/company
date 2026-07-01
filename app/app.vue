<script setup>
import updateAvatarSource from '~/composables/useAvatar';
import { Toaster } from 'vue-sonner';
import 'vue-sonner/style.css';

const { user } = useDirectusAuth();
const runtimeConfig = useRuntimeConfig();

// Initialize universal theme system + layout mode
const { initTheme } = useTheme();
const { initLayoutMode } = useLayoutMode();
onMounted(() => {
	initTheme();
	initLayoutMode();
});

// Inline head script: apply theme BEFORE first paint to prevent flash of wrong theme.
// This runs synchronously before Vue hydrates, reading from localStorage.
useHead({
	script: [
		{
			innerHTML: `(function(){try{var t=localStorage.getItem('earnest-theme')||'glass';var s=localStorage.getItem('earnest-style')||'modern';document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-style',s);}catch(e){}})()`,
			tagPosition: 'head',
		},
	],
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

// Directional app-to-app page transitions: slide left/right based on each
// app's position in the rail sequence (see composable for the ordering).
const { transition: pageTransition } = useDirectionalPageTransition();
</script>
<template>
	<NuxtLayout>
		<NuxtPage :transition="pageTransition" />
	</NuxtLayout>
	<SupportReportModal v-if="user" />
	<CommandCenterDirectorOffice v-if="user" />
	<NuxtLoadingIndicator
		color="linear-gradient(to right, #000000 0%, hsl(191, 100%, 50%) 100%)"
	/>
	<Toaster
		position="bottom-center"
		:toast-options="{
			classNames: {
				toast: 'group toast glass-surface text-foreground shadow-xl rounded-2xl',
				title: 'text-foreground font-medium',
				description: 'text-muted-foreground text-sm',
				actionButton: 'bg-primary text-primary-foreground rounded-lg',
				cancelButton: 'bg-muted text-muted-foreground rounded-lg',
				closeButton: 'glass-surface text-foreground',
				success: '!border-success/40',
				error: '!border-destructive/40',
				warning: '!border-warning/40',
				info: '!border-blue-500/40',
			},
		}"
		rich-colors
		close-button
		:offset="'calc(env(safe-area-inset-bottom, 0px) + 24px)'"
		:mobile-offset="'calc(env(safe-area-inset-bottom, 0px) + 16px)'"
	/>
</template>
