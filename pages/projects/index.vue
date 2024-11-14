<script setup>
// import draggable from '@/vuedraggable';

const { readItems } = useDirectusItems();
const { user } = useDirectusAuth();

definePageMeta({
	middleware: ['auth'],
});

const organizations = computed(() => {
	return user.value.organizations.map((org) => org.organizations_id.id);
});

const projects = await readItems('projects', {
	fields: ['*'],
	filter: {
		organization: {
			_in: organizations.value,
		},
		status: {
			_in: ['published', 'draft'],
		},
	},
});
</script>
<template>
	<div class="md:px-6 mx-auto flex items-start justify-center flex-col relative px-4 pt-20">
		<h1 class="page__title">Projects</h1>
		<div class="w-full flex flex-col lg:flex-row items-center lg:items-start justify-center z-10 page__inner"></div>
	</div>
</template>
<style scoped>
.projects {
	@media (min-width: theme('screens.md')) {
	}
}
</style>
