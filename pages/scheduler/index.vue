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
	<div class="w-full relative">
		<h1 class="page__title">Scheduler</h1>
		<div class="xl:flex xl:items-center xl:justify-center z-10 overflow-x-auto page__inner">
			<CalendarView />
		</div>
	</div>
</template>
<style scoped>
.projects {
	@media (min-width: theme('screens.md')) {
	}
}
</style>
