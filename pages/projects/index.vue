<script setup>
const { user } = useDirectusAuth();

definePageMeta({
	middleware: ['auth'],
});
</script>

<template>
	<div class="w-full relative">
		<h1 class="page__title">
			Projects
			<span class="block">Board</span>
		</h1>
		<div class="xl:flex xl:items-center xl:justify-center z-10 overflow-x-auto page__inner">
			<ProjectsBoard />
		</div>
	</div>
</template>
<style scoped>
.projects {
	@media (min-width: theme('screens.md')) {
	}
}
</style>
