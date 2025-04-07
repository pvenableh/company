<script setup>
const { data: authData, status } = useAuth();
const user = computed(() => {
	return status.value === 'authenticated' ? authData?.value?.user ?? null : null;
});

definePageMeta({
	middleware: ['auth'],
});
</script>

<template>
	<div class="page__content">
		<h1 class="page__title">
			Projects
			<span class="block">Board</span>
		</h1>
		<div class="xl:flex xl:items-center xl:justify-center z-10 min-h-svh overflow-x-auto page__inner">
			<ProjectsBoard />
		</div>
		<!-- <div class="flex items-center justify-center z-10 min-h-svh overflow-x-auto page__inner">
			<h1 class="uppercase text-sm text-center">This page is under construction.</h1>
		</div> -->
	</div>
</template>
<style scoped>
.projects {
	@media (min-width: theme('screens.md')) {
	}
}
</style>
