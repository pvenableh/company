<script setup lang="ts">
export interface DarkModeToggleProps {
	bg?: 'dark' | 'light';
}

withDefaults(defineProps<DarkModeToggleProps>(), {
	bg: 'light',
});

const colorMode = useColorMode();

const isDark = computed({
	get() {
		return colorMode.value === 'dark';
	},
	set() {
		colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark';
	},
});
</script>
<template>
	<ClientOnly>
		<UButton
			:icon="isDark ? 'i-heroicons-moon' : 'i-heroicons-sun'"
			variant="soft"
			color="neutral"
			aria-label="Theme"
			size="sm"
			:class="'scale-75 sm:scale-100' + (bg === 'dark' ? ' text-white' : '')"
			id="theme-toggle"
			@click="isDark = !isDark"
		/>
		<template #fallback>
			<div class="" />
		</template>
	</ClientOnly>
</template>
<style>
@reference "~/assets/css/tailwind.css";
#theme-toggle {
	@apply rounded-lg;
}
</style>
